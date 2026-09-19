import { createHash } from "node:crypto";

// Zerlegt ein Wissensdokument (Markdown mit Frontmatter, wie es der Steuer- und
// Auditkorpus liefert) in Chunks fuer die Vektorsuche. Reine Funktionen, ohne
// Netz und Dateizugriff, damit sie testbar bleiben.
//
// Grundsaetze:
// - Die Einheit ist die Struktur des Textes (Absaetze, bei Gesetzen der Artikel),
//   keine feste Zeichenzahl. Ein Chunk zerschneidet keinen Absatz mitten im Satz,
//   solange der Absatz nicht selbst zu lang ist.
// - Jeder Chunk traegt ALLES mit, was fuer einen Beleg noetig ist (Fundstelle,
//   Quelle, Link, Stand, Autoritaetsstufe, Ueberholt-Markierung). Die Antwort
//   kann damit auf den Artikel und das Abrufdatum zeigen, nicht nur auf "ein
//   Dokument".
// - Die Einbettung bekommt die Fundstelle vorangestellt ("НК РК ст. 3: Titel"),
//   damit ein Absatz ohne eigenen Kontext ("1) organisation ...") auffindbar bleibt.

export interface WissensMeta {
  chunk_id: string | null;
  quelle_id: string | null;
  norm_id: string | null;
  sprache: string | null;
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
}

export interface WissensDokument {
  /** Pfad relativ zur Korpuswurzel, mit / getrennt. */
  pfad: string;
  /** Oberster Ordner (amtlich, fachquellen, recht, ...) - Grundlage fuer Rollen und Filter. */
  bereich: string;
  meta: WissensMeta;
  text: string;
}

export interface WissensChunk {
  /** Stabile UUID aus chunk_id + Teilnummer: erneutes Einlesen ueberschreibt, statt zu verdoppeln. */
  id: string;
  pfad: string;
  bereich: string;
  meta: WissensMeta;
  teil: number;
  teile: number;
  /** Fundstelle und Titel, wird der Einbettung vorangestellt und beim Beleg angezeigt. */
  kontext: string;
  /** Der Text des Chunks, unveraendert (wird dem Modell als Beleg gegeben). */
  text: string;
}

export const ZIEL_ZEICHEN = 1400;
export const MAX_ZEICHEN = 2000;
const UEBERLAPP_MAX = 300;

// ---------------------------------------------------------------- Frontmatter

function wert(roh: string): string | number | boolean | null | string[] {
  const s = roh.trim();
  if (s === "" || s === "null" || s === "~") return null;
  if (s === "true") return true;
  if (s === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith("[") && s.endsWith("]")) {
    return s
      .slice(1, -1)
      .split(",")
      .map((t) => t.trim().replace(/^"|"$/g, ""))
      .filter(Boolean);
  }
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  return s;
}

/** Liest den Frontmatter-Block (--- ... ---) am Anfang einer Datei. Der Korpus
 *  nutzt nur einfache "schluessel: wert"-Zeilen, dafuer genuegt dieser Leser. */
export function trenneFrontmatter(roh: string): { felder: Record<string, unknown>; text: string } {
  const text = roh.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { felder: {}, text };
  const felder: Record<string, unknown> = {};
  for (const zeile of m[1]!.split("\n")) {
    const kv = zeile.match(/^([a-z_]+):\s*(.*)$/);
    if (kv) felder[kv[1]!] = wert(kv[2]!);
  }
  return { felder, text: text.slice(m[0].length) };
}

const alsText = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export function parseDokument(pfad: string, roh: string): WissensDokument {
  const { felder, text } = trenneFrontmatter(roh);
  const norm = pfad.replace(/\\/g, "/");
  const stufe = felder.autoritaetsstufe;
  return {
    pfad: norm,
    bereich: norm.split("/")[0] ?? "",
    text: text.trim(),
    meta: {
      chunk_id: alsText(felder.chunk_id),
      quelle_id: alsText(felder.quelle_id),
      norm_id: alsText(felder.norm_id),
      sprache: alsText(felder.sprache),
      autoritaetsstufe: typeof stufe === "number" ? stufe : null,
      rechtsstelle: alsText(felder.rechtsstelle),
      titel: alsText(felder.titel),
      gueltig_ab: alsText(felder.gueltig_ab),
      gueltig_bis: alsText(felder.gueltig_bis),
      ist_ueberholt: felder.ist_ueberholt === true,
      ersetzt_durch: alsText(felder.ersetzt_durch),
      abgerufen_am: alsText(felder.abgerufen_am),
      url: alsText(felder.url),
      konfidenz: alsText(felder.konfidenz),
    },
  };
}

// ------------------------------------------------------------------- Chunking

/** Zerlegt einen zu langen Absatz an Satzenden, zur Not hart nach MAX_ZEICHEN. */
function zerschneide(absatz: string): string[] {
  if (absatz.length <= MAX_ZEICHEN) return [absatz];
  const saetze = absatz.split(/(?<=[.;:!?])\s+/);
  const teile: string[] = [];
  let aktuell = "";
  for (const satz of saetze) {
    if (satz.length > MAX_ZEICHEN) {
      if (aktuell) {
        teile.push(aktuell);
        aktuell = "";
      }
      for (let i = 0; i < satz.length; i += MAX_ZEICHEN) teile.push(satz.slice(i, i + MAX_ZEICHEN));
      continue;
    }
    if (aktuell && aktuell.length + satz.length + 1 > ZIEL_ZEICHEN) {
      teile.push(aktuell);
      aktuell = "";
    }
    aktuell = aktuell ? `${aktuell} ${satz}` : satz;
  }
  if (aktuell) teile.push(aktuell);
  return teile;
}

/** Stabile UUID (Form 8-4-4-4-12) aus einem Text: Qdrant verlangt Zahl oder UUID als Punkt-ID. */
export function stabileId(quelle: string): string {
  const h = createHash("sha1").update(quelle).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function kontextVon(meta: WissensMeta): string {
  const stelle = meta.rechtsstelle;
  const titel = meta.titel;
  if (stelle && titel) return `${stelle}: ${titel}`;
  return stelle ?? titel ?? "";
}

export function chunkiere(dok: WissensDokument): WissensChunk[] {
  const absaetze = dok.text
    .split(/\n{2,}/)
    .map((a) => a.replace(/[ \t]+\n/g, "\n").trim())
    .filter((a) => a.length > 2)
    .flatMap(zerschneide);
  if (absaetze.length === 0) return [];

  const gruppen: string[] = [];
  let aktuell: string[] = [];
  let laenge = 0;
  // Absaetze seit dem letzten Abschluss (ohne den uebernommenen Ueberlapp): nur wenn es
  // welche gibt, ist noch ein Chunk offen.
  let neu = 0;
  const abschliessen = () => {
    if (aktuell.length === 0) return;
    gruppen.push(aktuell.join("\n\n"));
    // Der letzte Absatz wird (wenn kurz) zum Anfang des naechsten Chunks: Punkte wie
    // "2) ..." verlieren so nicht ihren Vorlauf.
    const letzter = aktuell[aktuell.length - 1]!;
    aktuell = letzter.length <= UEBERLAPP_MAX && aktuell.length > 1 ? [letzter] : [];
    laenge = aktuell.reduce((s, a) => s + a.length, 0);
    neu = 0;
  };
  for (const absatz of absaetze) {
    if (laenge > 0 && laenge + absatz.length + 2 > ZIEL_ZEICHEN) abschliessen();
    aktuell.push(absatz);
    neu += 1;
    laenge += absatz.length + 2;
  }
  if (neu > 0) gruppen.push(aktuell.join("\n\n"));

  const kontext = kontextVon(dok.meta);
  const basis = dok.meta.chunk_id ?? dok.pfad;
  return gruppen.map((text, i) => ({
    id: stabileId(`${basis}#${i}`),
    pfad: dok.pfad,
    bereich: dok.bereich,
    meta: dok.meta,
    teil: i,
    teile: gruppen.length,
    kontext,
    text,
  }));
}

/** Text, der eingebettet wird: Fundstelle plus Inhalt. */
export function einbettungsText(chunk: Pick<WissensChunk, "kontext" | "text">): string {
  return chunk.kontext ? `${chunk.kontext}\n\n${chunk.text}` : chunk.text;
}

/** Grobe Spracherkennung fuer Dokumente ohne Frontmatter (Audit-Recherche, Notizen):
 *  kyrillisch oder lateinisch, bei Kyrillisch Kasachisch an den Sonderbuchstaben. */
export function erkenneSprache(text: string): "ru" | "kk" | "de" | "en" | null {
  const probe = text.slice(0, 4000);
  const kyrillisch = (probe.match(/[Ѐ-ӿ]/g) ?? []).length;
  const lateinisch = (probe.match(/[A-Za-zÀ-ÿ]/g) ?? []).length;
  if (kyrillisch + lateinisch < 40) return null;
  if (kyrillisch > lateinisch) {
    const kasachisch = (probe.match(/[әіңғүұқөһӘІҢҒҮҰҚӨҺ]/g) ?? []).length;
    return kasachisch / kyrillisch > 0.01 ? "kk" : "ru";
  }
  return /[äöüßÄÖÜ]|\b(und|der|die|das|nicht|ist|ein|eine|für|mit)\b/i.test(probe) ? "de" : "en";
}
