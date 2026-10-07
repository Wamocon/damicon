import { createHash } from "node:crypto";
import type { Role } from "@/lib/rbac";
import {
  chunkiere,
  einbettungsText,
  erkenneSprache,
  kontextVon,
  parseDokument,
  type WissensChunk,
  type WissensDokument,
} from "@/lib/wissen/chunker";
import type { Einbettung } from "@/lib/wissen/embed";
import {
  BEREICH_WERT,
  MAX_DATEI_BYTES,
  MAX_TITEL,
  UPLOAD_BEREICHE,
  UPLOAD_ENDUNGEN,
  UPLOAD_ROLLEN,
  type UploadBereich,
  type UploadDateityp,
} from "@/lib/wissen/upload-konstanten";
import { alsSparsevec, idf, sparseDokument, sparseIndex, zaehleWoerter } from "@/lib/wissen/sparse";
import { DATENBANK_SCHEMA } from "@/lib/supabase/schema";
import { UPLOAD_QUELLE, uploadQuelleId } from "@/lib/wissen/upload-quelle";

// Admin-Upload in die BESTEHENDE Wissensbasis (public.wissen_chunks). Kein zweiter
// Index, keine zweite Suche, keine zweite Einbettung: Zerlegen (chunkiere), Einbetten
// (wissenEinbettung), sparser Vektor (sparseDokument) und Zeilenform sind dieselben wie
// beim Skript scripts/wissen-ingest.ts + scripts/wissen-nach-supabase.ts.
//
// Dieses Modul ist unabhaengig von Next.js und Netz testbar: Speicher und Einbettung
// kommen von aussen herein (actions/wissen.ts setzt den service_role-Client ein).
//
// Zustand: Es gibt keine Statusspalte. Ein Upload ist deshalb alles oder nichts - schlaegt
// ein Schritt nach dem Schreiben fehl, werden die schon geschriebenen Zeilen des Dokuments
// wieder entfernt. Es bleibt nie ein halbes Dokument zurueck.

export const MAX_CHUNKS = 400; // Obergrenze je Dokument: die Einbettung laeuft synchron in der Server Action
export const EINBETTUNG_BATCH = 8; // wie --batch im Einlese-Skript
export const SCHREIB_BATCH = 100; // wie im ETL
/** Zeitbudget fuer Lesen und Einbetten in Millisekunden. dashboard/layout.tsx erlaubt 60 Sekunden (maxDuration);
 *  die restlichen 15 Sekunden gehoeren dem Schreiben und der Antwort. Ist das Budget aufgebraucht, bricht der Upload
 *  VOR dem ersten Schreiben ab: dann bleibt garantiert nichts zurueck, auch wenn die Plattform sonst hart beendet. */
export const ZEITBUDGET_MS = 45_000;

export type UploadFehlerCode =
  | "eingabe"
  | "vorschau"
  | "dateityp"
  | "zuGross"
  | "lesen"
  | "pdfDienst"
  | "leer"
  | "zuLang"
  | "doppelt"
  | "einbettung"
  | "zeit"
  | "speichern"
  | "nichtLoeschbar"
  | "loeschen"
  | "gewichte";

export class UploadFehler extends Error {
  constructor(
    readonly code: UploadFehlerCode,
    /** Zusatzangabe fuer die Meldung (zum Beispiel der Titel des schon vorhandenen Dokuments). */
    readonly wert?: string,
    ursache?: unknown,
  ) {
    super(`Wissens-Upload: ${code}${ursache instanceof Error ? ` (${ursache.message})` : ""}`);
    this.name = "UploadFehler";
  }
}

// --------------------------------------------------------------------- Eingaben

export function dateityp(dateiname: string): UploadDateityp | null {
  const endung = dateiname.split(".").pop()?.toLowerCase() ?? "";
  return (UPLOAD_ENDUNGEN as readonly string[]).includes(endung) ? (endung as UploadDateityp) : null;
}

export function istBereich(wert: string): wert is UploadBereich {
  return (UPLOAD_BEREICHE as readonly string[]).includes(wert);
}

/** Erlaubte Rollen aus dem Formular: nur Bueroeinheiten, ohne Doppelte, und der Admin ist IMMER dabei
 *  (sonst saehe er das Dokument weder in der Liste noch in der Suche - die RLS filtert nach `rollen`). */
export function erlaubteRollen(angekreuzt: readonly string[]): Role[] {
  const gewaehlt = new Set<Role>(["admin"]);
  for (const r of angekreuzt) {
    if ((UPLOAD_ROLLEN as readonly string[]).includes(r)) gewaehlt.add(r as Role);
  }
  // Reihenfolge der Bueroeinheit, nicht der Formularreihenfolge: stabil und gut lesbar.
  return UPLOAD_ROLLEN.filter((r) => gewaehlt.has(r));
}

// ----------------------------------------------------------- Text aus der Datei

/** Laedt pdf-parse so, dass es auch in einer Vercel-Funktion (nur die von der Ablaufverfolgung gefundenen Dateien) laeuft.
 *
 *  Zwei Dinge sind dort anders als lokal, wo alles aus node_modules da ist:
 *  1. PDF.js laedt seinen Worker mit `import(this.workerSrc)` ("./pdf.worker.mjs") und das native @napi-rs/canvas mit
 *     `createRequire(...)`. Beides sind berechnete Pfade, die die Ablaufverfolgung (nft) nicht findet: Die Dateien fehlen
 *     in der Funktion. Ohne canvas gibt es kein DOMMatrix, und pdf.mjs bricht schon beim Import ab ("DOMMatrix is not
 *     defined"); ohne Worker-Datei scheitert das Parsen ("Setting up fake worker failed").
 *  2. `pdf-parse/worker` liefert den Worker als data:-URL (`getData()`, keine Datei noetig) und importiert @napi-rs/canvas
 *     und pdf.worker.mjs mit festen Namen, die nft verfolgt. Deshalb: ZUERST `pdf-parse/worker` laden (stellt canvas bereit,
 *     bevor pdf.mjs DOMMatrix braucht), dann pdf-parse, dann den Worker setzen. Die Reihenfolge ist Absicht.
 *  Schlaegt schon das Laden fehl, liegt es am Server und nicht an der Datei: eigener Fehler "pdfDienst", nicht "lesen". */
async function ladePdfParse() {
  try {
    const worker = await import("pdf-parse/worker");
    const { PDFParse } = await import("pdf-parse");
    PDFParse.setWorker(worker.getData());
    return PDFParse;
  } catch (ursache) {
    // Die echte Ursache ins Serverprotokoll (die Meldung an die Person nennt sie bewusst nicht).
    console.error("[damicon] PDF-Leser konnte nicht geladen werden:", ursache);
    throw new UploadFehler("pdfDienst", undefined, ursache);
  }
}

/** PDF ueber pdf-parse (v2: Klasse PDFParse). Wirft bei kaputten oder verschluesselten Dateien. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  // Import erst hier: pdf-parse zieht PDF.js mit, das ein .txt-Upload nicht braucht.
  const PDFParse = await ladePdfParse();
  const parser = new PDFParse({ data: bytes });
  try {
    const ergebnis = await parser.getText();
    // Seitentexte selbst verbinden: ergebnis.text enthaelt Seitenmarken ("-- 1 of 3 --"), und ein Scan ohne Textebene
    // bestuende sonst nur aus diesen Marken und gaelte als Dokument.
    return ergebnis.pages.map((seite) => seite.text).join("\n\n");
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

export async function extrahiereText(bytes: Uint8Array, typ: UploadDateityp): Promise<string> {
  try {
    if (typ === "pdf") return await pdfText(bytes);
    if (bytes.includes(0)) throw new Error("Binaerdatei: enthaelt Nullbytes");
    return new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "");
  } catch (ursache) {
    if (ursache instanceof UploadFehler) throw ursache; // z. B. "pdfDienst": nicht der Datei anlasten
    throw new UploadFehler("lesen", undefined, ursache);
  }
}

/** Fuer den Vergleich: Zeilenenden und Leerraum vereinheitlicht, damit dieselbe Datei mit anderem
 *  Zeilenende (Windows/Unix) nicht als neues Dokument zaehlt. */
function normalisiere(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

export function inhaltsHash(text: string): string {
  return createHash("sha256").update(normalisiere(text)).digest("hex");
}

// ---------------------------------------------------------------- Zeilen bauen

export interface UploadMetadaten {
  titel: string;
  bereich: UploadBereich;
  dateiname: string;
  typ: UploadDateityp;
  hash: string;
  rollen: Role[];
  hochgeladenVon: { id: string; name: string | null };
  /** ISO-Zeitpunkt; ein Parameter, damit Tests ohne Uhr auskommen. */
  zeitpunkt: string;
}

/** Ein Dokument im Sinne des Chunkers. Markdown darf sein Frontmatter mitbringen (wie im Korpus),
 *  .txt und PDF haben keines. Titel, Bereich, Quelle und Kennung setzt IMMER der Upload. */
export function baueDokument(text: string, m: UploadMetadaten): WissensDokument {
  const bereich = BEREICH_WERT[m.bereich]; // gespeicherter Wert, siehe upload-konstanten.ts
  const pfad = `upload/${bereich}/${m.dateiname}`;
  const dok: WissensDokument =
    m.typ === "md"
      ? parseDokument(pfad, text)
      : {
          pfad,
          bereich,
          text: text.trim(),
          meta: {
            chunk_id: null,
            quelle_id: null,
            norm_id: null,
            sprache: null,
            autoritaetsstufe: null,
            rechtsstelle: null,
            titel: null,
            gueltig_ab: null,
            gueltig_bis: null,
            ist_ueberholt: false,
            ersetzt_durch: null,
            abgerufen_am: null,
            url: null,
            konfidenz: null,
          },
        };
  const quelleId = uploadQuelleId(m.hash);
  dok.pfad = pfad;
  dok.bereich = bereich; // parseDokument leitet den Bereich sonst aus dem Pfad ab
  dok.meta.titel = m.titel;
  dok.meta.quelle_id = quelleId;
  dok.meta.chunk_id = quelleId; // daraus entstehen die stabilen Chunk-IDs: gleicher Inhalt = gleiche IDs
  dok.meta.sprache ??= erkenneSprache(dok.text) ?? "de";
  dok.meta.abgerufen_am ??= m.zeitpunkt.slice(0, 10);
  return dok;
}

/** Zeile der Tabelle wissen_chunks, Spalte fuer Spalte in der Form des ETL (scripts/wissen-nach-supabase.ts, zeile()). */
export interface ChunkZeile {
  id: string;
  chunk_id: string | null;
  quelle_id: string | null;
  norm_id: string | null;
  sprache: string;
  autoritaetsstufe: number | null;
  rechtsstelle: string | null;
  titel: string | null;
  gueltig_ab: string | null;
  gueltig_bis: string | null;
  ist_ueberholt: boolean;
  ersetzt_durch: string | null;
  abgerufen_am: string | null;
  url: string | null;
  konfidenz: string | null;
  pfad: string;
  bereich: string;
  teil: number;
  teile: number;
  kontext: string | null;
  text: string;
  rollen: string[];
  eingelesen_am: string;
  embed_modell: string;
  extra: Record<string, unknown>;
  dense: string;
  sparse: string;
}

export function baueZeile(
  chunk: WissensChunk,
  dense: number[],
  m: UploadMetadaten,
  modell: string,
): { zeile: ChunkZeile; sparseIndizes: number[] } {
  const sparse = sparseDokument(einbettungsText(chunk));
  return {
    sparseIndizes: [...new Set(sparse.indices.map(sparseIndex))],
    zeile: {
      id: chunk.id,
      chunk_id: chunk.meta.chunk_id,
      quelle_id: chunk.meta.quelle_id,
      norm_id: chunk.meta.norm_id,
      sprache: chunk.meta.sprache ?? "de",
      autoritaetsstufe: chunk.meta.autoritaetsstufe,
      rechtsstelle: chunk.meta.rechtsstelle,
      titel: chunk.meta.titel,
      gueltig_ab: chunk.meta.gueltig_ab,
      gueltig_bis: chunk.meta.gueltig_bis,
      ist_ueberholt: chunk.meta.ist_ueberholt,
      ersetzt_durch: chunk.meta.ersetzt_durch,
      abgerufen_am: chunk.meta.abgerufen_am,
      url: chunk.meta.url,
      konfidenz: chunk.meta.konfidenz,
      pfad: chunk.pfad,
      bereich: chunk.bereich,
      teil: chunk.teil,
      teile: chunk.teile,
      kontext: chunk.kontext || kontextVon(chunk.meta) || null,
      text: chunk.text,
      rollen: m.rollen,
      eingelesen_am: m.zeitpunkt,
      embed_modell: modell,
      extra: {
        quelle: UPLOAD_QUELLE,
        inhalts_hash: m.hash,
        dateiname: m.dateiname,
        dateityp: m.typ,
        hochgeladen_von: m.hochgeladenVon.id,
        hochgeladen_von_name: m.hochgeladenVon.name,
      },
      dense: `[${dense.join(",")}]`,
      sparse: alsSparsevec(sparse),
    },
  };
}

// ------------------------------------------------------------ Speicher (Port)

export interface WissenSpeicher {
  /** Gibt es schon Zeilen mit dieser quelle_id? Dann den Titel des vorhandenen Dokuments. */
  findeQuelle(quelleId: string): Promise<{ titel: string | null } | null>;
  schreibeChunks(zeilen: ChunkZeile[]): Promise<void>;
  loescheQuelle(quelleId: string): Promise<void>;
  /** Dokumenthaeufigkeit (df) der angegebenen Woerter (Schluessel: sparseIndex). Unbekannte fehlen. */
  leseDokumenthaeufigkeit(indizes: number[]): Promise<Map<number, number>>;
  schreibeBegriffe(zeilen: { hash: number; df: number; idf: number }[]): Promise<void>;
  zaehleChunks(): Promise<number>;

  // ---- fuer das Loeschen (src/lib/wissen/loeschen.ts) ----
  /** Was liegt unter dieser quelle_id? `anzahl` = alle Zeilen, `fremd` = davon Zeilen, die NICHT zugleich
   *  extra.quelle = "upload" UND eine quelle_id mit Vorsatz "upload:" haben (also nie loeschbar sind). */
  ladeQuellenInfo(quelleId: string): Promise<{ anzahl: number; fremd: number; titel: string | null; bereich: string | null }>;
  /** Loescht die Zeilen dieser quelle_id, aber NUR solche mit extra.quelle = "upload" und quelle_id "upload:%"
   *  (in derselben Anweisung, auch wenn der Aufrufer es vorher geprueft hat). Liefert die sparsevec-Texte der
   *  tatsaechlich geloeschten Zeilen: wer zweimal loescht, bekommt beim zweiten Mal eine leere Liste. */
  loescheUpload(quelleId: string): Promise<string[]>;
  /** Entfernt Woerter aus wissen_begriffe (df auf 0 gefallen). */
  loescheBegriffe(indizes: number[]): Promise<void>;
}

export interface UploadErgebnis {
  chunks: number;
  quelleId: string;
  hash: string;
  /** Stufe, die ein Markdown-Frontmatter mitbrachte (sonst null). Stufe 1 bis 3 belegt die bevorzugten Plaetze fuer
   *  Recht und amtliche Texte; die Action schreibt sie deshalb ins Protokoll. */
  autoritaetsstufe: number | null;
}

export interface UploadEingabe {
  titel: string;
  bereich: string;
  /** Rohwerte der angekreuzten Rollen; erlaubteRollen() filtert und ergaenzt den Admin. */
  rollen: readonly string[];
  dateiname: string;
  bytes: Uint8Array;
  hochgeladenVon: { id: string; name: string | null };
}

export interface UploadAbhaengigkeiten {
  speicher: WissenSpeicher;
  einbettung: Einbettung;
  jetzt?: () => Date;
  /** Umgebungsvariablen; nur fuer Tests, sonst process.env. */
  umgebung?: Record<string, string | undefined>;
  /** Datenbankschema; nur fuer Tests, sonst das der App (DATENBANK_SCHEMA). */
  schema?: string;
  /** Zeitbudget in Millisekunden und Uhr (Millisekunden); nur fuer Tests. */
  zeitbudgetMs?: number;
  jetztMs?: () => number;
}

/** Vorschau-Schutz: Eine Vercel-Vorschau darf nicht in die Produktions-Wissensbasis schreiben. Wohin die App schreibt,
 *  bestimmt das Datenbankschema (SUPABASE_DB_SCHEMA, src/lib/supabase/schema.ts): Eine Vorschau mit `public_preview`
 *  arbeitet in der Kopie und ist frei. Gesperrt ist nur der Rest, naemlich VERCEL_ENV=preview mit Schema `public`.
 *  WISSEN_UPLOAD_PREVIEW_OK=true hebt die Sperre auf (nur setzen, wenn die Vorschau eine eigene Datenbank hat). */
export function pruefeUploadUmgebung(env: Record<string, string | undefined> = process.env, schema: string = DATENBANK_SCHEMA): void {
  if (env.VERCEL_ENV !== "preview" || env.WISSEN_UPLOAD_PREVIEW_OK === "true") return;
  if (schema !== "public") return;
  throw new UploadFehler("vorschau");
}

/** Der ganze Weg: pruefen, Text lesen, Dublette erkennen, zerlegen, einbetten, schreiben, Wortgewichte nachfuehren.
 *  Wirft ausschliesslich UploadFehler. Die Rolle der hochladenden Person prueft der Aufrufer (Server Action). */
export async function verarbeiteUpload(e: UploadEingabe, d: UploadAbhaengigkeiten): Promise<UploadErgebnis> {
  // 0. Umgebung: nie aus einer Vorschau in die gemeinsame Datenbank schreiben.
  pruefeUploadUmgebung(d.umgebung ?? process.env, d.schema);
  const uhr = d.jetztMs ?? Date.now;
  const beginn = uhr();
  const budget = d.zeitbudgetMs ?? ZEITBUDGET_MS;

  // 1. Eingabe - vor jedem Parsen, die Dateigroesse zuerst (ein PDF-Parser soll nie eine Riesendatei sehen).
  const titel = e.titel.trim();
  if (!titel || titel.length > MAX_TITEL || !istBereich(e.bereich)) throw new UploadFehler("eingabe");
  const typ = dateityp(e.dateiname);
  if (!typ) throw new UploadFehler("dateityp");
  if (e.bytes.length === 0) throw new UploadFehler("eingabe");
  if (e.bytes.length > MAX_DATEI_BYTES) throw new UploadFehler("zuGross");

  // 2. Text
  const text = await extrahiereText(e.bytes, typ);
  if (normalisiere(text).length === 0) throw new UploadFehler("leer");

  // 3. Dublette: derselbe Inhalt wird nicht noch einmal angelegt.
  const hash = inhaltsHash(text);
  const quelleId = uploadQuelleId(hash);
  const vorhanden = await d.speicher.findeQuelle(quelleId).catch((u) => {
    throw new UploadFehler("speichern", undefined, u);
  });
  if (vorhanden) throw new UploadFehler("doppelt", vorhanden.titel ?? titel);

  // 4. Zerlegen mit denselben Funktionen wie das Einlese-Skript
  const zeitpunkt = (d.jetzt?.() ?? new Date()).toISOString();
  const meta: UploadMetadaten = {
    titel,
    bereich: e.bereich,
    dateiname: e.dateiname,
    typ,
    hash,
    rollen: erlaubteRollen(e.rollen),
    hochgeladenVon: e.hochgeladenVon,
    zeitpunkt,
  };
  const chunks = chunkiere(baueDokument(text, meta));
  if (chunks.length === 0) throw new UploadFehler("leer");
  if (chunks.length > MAX_CHUNKS) throw new UploadFehler("zuLang", String(MAX_CHUNKS));

  // 5. Einbetten (noch nichts geschrieben: ein Fehler hier hinterlaesst nichts). Der Index ist 1024-dimensional.
  if (d.einbettung.dimension !== 1024) throw new UploadFehler("einbettung", undefined, new Error("Index erwartet 1024 Dimensionen"));
  const vektoren: number[][] = [];
  try {
    for (let i = 0; i < chunks.length; i += EINBETTUNG_BATCH) {
      // Vor jedem Aufruf: Reicht die Zeit nicht, hoert der Upload hier auf, solange noch nichts geschrieben ist.
      if (uhr() - beginn > budget) throw new UploadFehler("zeit", String(Math.round(budget / 1000)));
      const teil = chunks.slice(i, i + EINBETTUNG_BATCH);
      const dicht = await d.einbettung.einbetten(teil.map(einbettungsText));
      if (dicht.length !== teil.length || dicht.some((v) => v.length !== d.einbettung.dimension)) {
        throw new Error(`Einbettung lieferte nicht ${teil.length} Vektoren mit ${d.einbettung.dimension} Dimensionen`);
      }
      vektoren.push(...dicht);
    }
  } catch (ursache) {
    if (ursache instanceof UploadFehler) throw ursache;
    throw new UploadFehler("einbettung", undefined, ursache);
  }

  const gebaut = chunks.map((c, i) => baueZeile(c, vektoren[i]!, meta, d.einbettung.modell));

  // 6. Schreiben + Wortgewichte; bei jedem Fehler das Dokument wieder entfernen.
  try {
    await d.speicher.schreibeChunks(gebaut.map((g) => g.zeile));

    const zaehler = zaehleWoerter(gebaut.map((g) => g.sparseIndizes));
    const bisher = await d.speicher.leseDokumenthaeufigkeit([...zaehler.keys()]);
    const n = await d.speicher.zaehleChunks();
    await d.speicher.schreibeBegriffe(
      [...zaehler].map(([hashIdx, neu]) => {
        const df = Math.min((bisher.get(hashIdx) ?? 0) + neu, n);
        return { hash: hashIdx, df, idf: idf(n, df) };
      }),
    );
  } catch (ursache) {
    await d.speicher.loescheQuelle(quelleId).catch((u) => console.error("[damicon] Wissens-Upload: Aufraeumen fehlgeschlagen:", u));
    throw new UploadFehler("speichern", undefined, ursache);
  }

  return { chunks: chunks.length, quelleId, hash, autoritaetsstufe: chunks[0]?.meta.autoritaetsstufe ?? null };
}
