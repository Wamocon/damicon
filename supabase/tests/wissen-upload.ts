// Tests fuer den Admin-Upload in die Wissensbasis (ohne Datenbank, ohne Netz, nur synthetische Dateien):
//   * Rechte: nur admin darf hochladen; die Server Action prueft das vor allem anderen
//   * Eingabe: Dateityp, Groesse (vor dem Parsen), Titel, Bereich, Rollen (Admin immer dabei, nur Bueroeinheit)
//   * Text: .txt, .md und ein echtes (selbst gebautes) PDF; kaputtes PDF und Binaerdatei haengen nichts auf
//   * Der Upload erzeugt Textstellen in der Form des ETL, mit Bereich, Rollen, Quelle und Beleg
//   * Dublette: dieselbe Datei (auch mit anderen Zeilenenden) legt nichts doppelt an
//   * Wortgewichte (wissen_begriffe): df und IDF je Wort, N aus der Gesamtzahl
//   * Alles oder nichts: Fehler beim Einbetten oder Schreiben hinterlassen kein halbes Dokument
//   * Suche findet das Dokument mit Beleg; ein auf eine Rolle beschraenktes Dokument sieht eine andere Rolle nicht
//   * Liste: hochgeladene und per Skript eingelesene Dokumente erscheinen gemeinsam, gruppiert nach quelle_id
//   * ETL-Spiegelmodus laesst hochgeladene Zeilen stehen
// Die SQL-Funktion wissen_suche und die RLS selbst prueft test:wissen-db (echtes Postgres); hier bildet ein Nachbau
// ihre Regeln nach (Rolle in rollen, nicht ueberholt, Stufe), damit sucheWissen() Ende zu Ende laeuft.
// Aufruf: npm run test:wissen-upload (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { hasPermission, roles, type Role } from "@/lib/rbac";
import { einbettungsText } from "@/lib/wissen/chunker";
import type { Einbettung } from "@/lib/wissen/embed";
import { gruppiereWissenDokumente, type WissenListeZeile } from "@/lib/wissen/dokumente-liste";
import {
  BEREICH_WERT,
  erlaubteRollen,
  pruefeUploadUmgebung,
  idf,
  inhaltsHash,
  MAX_CHUNKS,
  MAX_DATEI_BYTES,
  UploadFehler,
  UPLOAD_BEREICHE,
  UPLOAD_ROLLEN,
  uploadQuelleId,
  verarbeiteUpload,
  type ChunkZeile,
  type UploadEingabe,
  type WissenSpeicher,
} from "@/lib/wissen/hochladen";
import { bereichSchluessel } from "@/lib/wissen/upload-konstanten";
import { alsSparsevec, sparseDokument, sparseIndex, sparsevecIndizes, tokens } from "@/lib/wissen/sparse";
import type { RpcKlient } from "@/lib/wissen/supabase-suche";
import { sucheWissen } from "@/lib/wissen/suche";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const lies = (pfad: string) => readFileSync(pfad, "utf8");
const bytes = (s: string) => new TextEncoder().encode(s);

// ---- Nachbauten --------------------------------------------------------------------------------

function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministische "Einbettung": Woerter fallen in 1024 Faecher, danach normiert. Gleiche Woerter = aehnliche Vektoren. */
function vektorVon(text: string): number[] {
  const v = new Array<number>(1024).fill(0);
  for (const t of tokens(text)) v[hash32(t) % 1024]! += 1;
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

function falscheEinbettung(optionen: { dimension?: number; werfe?: boolean } = {}): Einbettung & { aufrufe: number } {
  const e = {
    modell: "synthetisch-bge-m3",
    dimension: optionen.dimension ?? 1024,
    aufrufe: 0,
    async einbetten(texte: string[]) {
      e.aufrufe += 1;
      if (optionen.werfe) throw new Error("Dienst nicht erreichbar");
      return texte.map(vektorVon);
    },
  };
  return e;
}

interface Speicherstand {
  zeilen: Map<string, ChunkZeile>;
  begriffe: Map<number, { df: number; idf: number }>;
  ereignisse: string[];
}

function falscherSpeicher(
  vorgabe: { zeilen?: ChunkZeile[]; begriffe?: Array<[number, number]> } = {},
  fehlschlag: { chunksBeiBatch?: number; begriffe?: boolean } = {},
): WissenSpeicher & Speicherstand {
  const zeilen = new Map<string, ChunkZeile>((vorgabe.zeilen ?? []).map((z) => [z.id, z]));
  const begriffe = new Map<number, { df: number; idf: number }>((vorgabe.begriffe ?? []).map(([h, df]) => [h, { df, idf: 0 }]));
  const ereignisse: string[] = [];
  return {
    zeilen,
    begriffe,
    ereignisse,
    async findeQuelle(quelleId) {
      ereignisse.push("findeQuelle");
      const z = [...zeilen.values()].find((r) => r.quelle_id === quelleId);
      return z ? { titel: z.titel } : null;
    },
    async schreibeChunks(neu) {
      ereignisse.push("schreibeChunks");
      let batch = 0;
      for (let i = 0; i < neu.length; i += 2) {
        batch += 1;
        if (fehlschlag.chunksBeiBatch === batch) throw new Error("Schreibfehler im Batch");
        for (const z of neu.slice(i, i + 2)) zeilen.set(z.id, z);
      }
    },
    async loescheQuelle(quelleId) {
      ereignisse.push("loescheQuelle");
      for (const [id, z] of zeilen) if (z.quelle_id === quelleId) zeilen.delete(id);
    },
    async leseDokumenthaeufigkeit(indizes) {
      ereignisse.push("leseDokumenthaeufigkeit");
      return new Map(indizes.filter((i) => begriffe.has(i)).map((i) => [i, begriffe.get(i)!.df]));
    },
    async schreibeBegriffe(neu) {
      ereignisse.push("schreibeBegriffe");
      if (fehlschlag.begriffe) throw new Error("Begriffe nicht schreibbar");
      for (const b of neu) begriffe.set(b.hash, { df: b.df, idf: b.idf });
    },
    async zaehleChunks() {
      return zeilen.size;
    },
  };
}

/** Nachbau von wissen_suche() samt RLS: sichtbar ist, wer mit seiner ECHTEN Rolle in `rollen` steht. */
function falscheSuche(speicher: Speicherstand, sitzungsRolle: Role): RpcKlient {
  return {
    async rpc(fn, args) {
      if (fn !== "wissen_suche") return { data: null, error: { message: `unbekannte Funktion ${fn}` } };
      const fragen = args.p_fragen as Array<{ dense: number[] }>;
      const pRolle = args.p_rolle as string | null;
      const maxStufe = args.p_max_stufe as number | null;
      const nurAktuell = args.p_nur_aktuell as boolean;
      const punkte = new Map<string, number>();
      for (const f of fragen) {
        const sichtbar = [...speicher.zeilen.values()]
          .filter((z) => z.rollen.includes(sitzungsRolle)) // RLS
          .filter((z) => pRolle === null || z.rollen.includes(pRolle))
          .filter((z) => !nurAktuell || !z.ist_ueberholt)
          .filter((z) => maxStufe === null || (z.autoritaetsstufe !== null && z.autoritaetsstufe <= maxStufe));
        const bewertet = sichtbar
          .map((z) => ({ z, s: (JSON.parse(z.dense) as number[]).reduce((sum, x, i) => sum + x * (f.dense[i] ?? 0), 0) }))
          .filter((x) => x.s > 0)
          .sort((a, b) => b.s - a.s);
        bewertet.forEach((x, rang) => punkte.set(x.z.id, (punkte.get(x.z.id) ?? 0) + 1 / (2 + rang + 1)));
      }
      const daten = [...punkte]
        .sort((a, b) => b[1] - a[1])
        .slice(0, (args.p_limit as number) ?? 8)
        .map(([id, punktzahl]) => {
          const z = speicher.zeilen.get(id)!;
          return { id, punktzahl, payload: { ...z, rollen: z.rollen, dense: undefined, sparse: undefined, extra: undefined } };
        });
      return { data: daten, error: null };
    },
  };
}

/** Ein echtes, gueltiges einseitiges PDF mit Text (ASCII), selbst gebaut: keine Datei im Repo, kein Firmendokument. */
function minimalesPdf(zeilen: string[]): Uint8Array {
  const esc = (s: string) => s.replace(/[\\()]/g, "\\$&");
  const strom = `BT /F1 12 Tf 72 720 Td 16 TL ${zeilen.map((z) => `(${esc(z)}) Tj T*`).join(" ")} ET`;
  const objekte = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${strom.length} >>\nstream\n${strom}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let aus = "%PDF-1.4\n";
  const versatz: number[] = [];
  objekte.forEach((o, i) => {
    versatz.push(aus.length);
    aus += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = aus.length;
  aus += `xref\n0 ${objekte.length + 1}\n0000000000 65535 f \n${versatz.map((v) => `${String(v).padStart(10, "0")} 00000 n \n`).join("")}`;
  aus += `trailer\n<< /Size ${objekte.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytes(aus);
}

// ---- Synthetische Texte (frei erfunden, kein echtes Dokument) -----------------------------------

const ABSAETZE = [
  "Der Testkodex Zypresse regelt die Aufbewahrung der Belege im Betrieb Sonnenhof.",
  "Artikel 1. Jeder Beleg wird sieben Jahre lang im Archiv Blauwal aufbewahrt und darf nicht vernichtet werden.",
  "Artikel 2. Die Frist fuer die Quarkspeise-Meldung betraegt vierzehn Tage nach dem Stichtag.",
  "Artikel 3. Verstoesse gegen die Aufbewahrung werden mit einer Verwarnung durch die Pelikan-Stelle geahndet.",
];
const MD = `${ABSAETZE.join("\n\n")}\n`;
const TXT = `Notiz Sonnenhof\n\n${ABSAETZE.slice(0, 2).join("\n\n")}\n`;
const JETZT = () => new Date("2026-10-05T10:00:00.000Z");
const ADMIN = { id: "00000000-0000-0000-0000-000000000001", name: "Test Admin" };

function eingabe(teil: Partial<UploadEingabe> = {}): UploadEingabe {
  return { titel: "Testkodex Zypresse", bereich: "recht", rollen: ["buchhaltung"], dateiname: "kodex.md", bytes: bytes(MD), hochgeladenVon: ADMIN, ...teil };
}

async function fehlerCode(f: () => Promise<unknown>): Promise<string> {
  try {
    await f();
    return "kein-fehler";
  } catch (e) {
    return e instanceof UploadFehler ? e.code : `andere-ausnahme:${e instanceof Error ? e.message : String(e)}`;
  }
}

async function main() {
  // Die Suche laeuft in diesem Test ueber Supabase (der Nachbau von wissen_suche), nie ueber Qdrant.
  process.env.WISSEN_BACKEND = "supabase";

  // ---- 1. Rechte ------------------------------------------------------------------------------
  const darf = roles.filter((r) => hasPermission(r, "ki_assistent", "manage"));
  pruefe("Recht: nur admin hat ki_assistent:manage", darf.length === 1 && darf[0] === "admin", `Rollen mit Recht: ${darf.join(", ")}`);
  pruefe("Recht: auch ceo darf nicht hochladen", !hasPermission("ceo", "ki_assistent", "manage"));
  for (const r of roles.filter((x) => x !== "admin")) {
    if (hasPermission(r, "ki_assistent", "manage")) pruefe(`Recht: ${r} darf nicht hochladen`, false);
  }
  const aktion = lies("src/lib/actions/wissen.ts");
  const gate = aktion.indexOf('requirePermission("ki_assistent", "manage")');
  const ersterZugriff = Math.min(...["formData.get(", "verarbeiteUpload(", "createServiceRoleClient()"].map((s) => { const i = aktion.indexOf(s, aktion.indexOf("export async function wissenDokumentHochladen")); return i < 0 ? Infinity : i; }));
  pruefe("Action: Rechtepruefung steht vor Formular, Dienst-Client und Verarbeitung", gate > 0 && gate < ersterZugriff);
  pruefe("Action: Pruefung wird bei Fehler zurueckgegeben (zugriffsFehler), nicht weitergemacht", /catch \(error\) \{\s*return zugriffsFehler\(error\);/.test(aktion));
  pruefe("Action: auch das Laden der Liste prueft das Recht", /wissenDokumenteLaden\(\)[\s\S]{0,200}requirePermission\("ki_assistent", "manage"\)/.test(aktion));
  pruefe("Action: schreibt ausdruecklich nach Supabase (service_role), ohne wissenBackend()", aktion.includes("createServiceRoleClient()") && !/import[^;]*wissen\/suche"/.test(aktion) && !/wissenBackend\(\)\s*[=!(]/.test(aktion.replace(/\/\/.*$/gm, "")));
  const hochladenQuelle = lies("src/lib/wissen/hochladen.ts");
  pruefe("Upload-Modul haengt weder von der Suche noch von wissenBackend ab", !/wissen\/suche"/.test(hochladenQuelle) && !hochladenQuelle.includes("wissenBackend"));
  const oberflaeche = lies("src/components/db/wissen-verwaltung.tsx");
  pruefe("Oberflaeche: kein Serverschluessel, kein Upload-Modul im Client", !/process\.env|wissen\/hochladen"|node:crypto/.test(oberflaeche));
  pruefe("Oberflaeche und Action: Rollenliste kommt aus der Bueroeinheit, darfWissenNutzen bleibt unveraendert", UPLOAD_ROLLEN.join() === "admin,ceo,betriebsleitung,buchhaltung" && /BUERO_ROLLEN\.includes|\(BUERO_ROLLEN as string\[\]\)\.includes\(rolle\)/.test(lies("src/lib/wissen/suche.ts")));

  // ---- 2. Rollen und Bereiche ------------------------------------------------------------------
  pruefe("Rollen: Admin ist automatisch dabei", erlaubteRollen(["buchhaltung"]).join() === "admin,buchhaltung", erlaubteRollen(["buchhaltung"]).join());
  pruefe("Rollen: ohne Auswahl bleibt nur der Admin", erlaubteRollen([]).join() === "admin");
  pruefe("Rollen: Nicht-Bueroeinheiten und Unsinn werden verworfen", erlaubteRollen(["kunde", "pfluecker", "brigade", "erzeuger", "root", ""]).join() === "admin");
  pruefe("Rollen: Doppelte zaehlen einmal, feste Reihenfolge", erlaubteRollen(["buchhaltung", "ceo", "buchhaltung"]).join() === "admin,ceo,buchhaltung");
  pruefe("Bereiche: Recht, Steuer, Compliance, Audit, Risiko, klein geschrieben", UPLOAD_BEREICHE.join() === "recht,steuer,compliance,audit,risiko");
  pruefe("Bereiche: recht -> legal, die vier anderen bleiben unveraendert", BEREICH_WERT.recht === "legal" && (["steuer", "compliance", "audit", "risiko"] as const).every((b) => BEREICH_WERT[b] === b));
  pruefe("Bereiche: Anzeige kehrt legal wieder zu recht um, Korpuswerte bleiben", bereichSchluessel("legal") === "recht" && bereichSchluessel("steuer") === "steuer" && bereichSchluessel("amtlich") === "amtlich" && bereichSchluessel("nk-214-viii") === "nk-214-viii");

  // ---- 2b. Vorschau-Schutz -----------------------------------------------------------------------
  {
    const wirft = (env: Record<string, string | undefined>) => { try { pruefeUploadUmgebung(env); return false; } catch (e) { return e instanceof UploadFehler && e.code === "vorschau"; } };
    pruefe("Vorschau-Schutz: VERCEL_ENV=preview wird abgelehnt", wirft({ VERCEL_ENV: "preview" }));
    pruefe("Vorschau-Schutz: WISSEN_UPLOAD_PREVIEW_OK=true hebt die Sperre auf", !wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" }));
    pruefe("Vorschau-Schutz: nur der Wert true gilt (1, yes, TRUE, leer nicht)", ["1", "yes", "TRUE", "", "false"].every((v) => wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: v })));
    pruefe("Vorschau-Schutz: Produktion, Development und lokal (ohne VERCEL_ENV) sind frei", !wirft({ VERCEL_ENV: "production" }) && !wirft({ VERCEL_ENV: "development" }) && !wirft({}));
    pruefe("Vorschau-Schutz: das Flag allein erlaubt nichts anderes (preview bleibt zu ohne Flag)", wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: undefined }));
    const s = falscherSpeicher();
    const e = falscheEinbettung();
    const code = await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: e, jetzt: JETZT, umgebung: { VERCEL_ENV: "preview" } }));
    pruefe("Vorschau-Schutz: verarbeiteUpload in der Vorschau -> vorschau, nichts gelesen, eingebettet oder geschrieben", code === "vorschau" && e.aufrufe === 0 && s.ereignisse.length === 0 && s.zeilen.size === 0);
    const frei = await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: e, jetzt: JETZT, umgebung: { VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" } }));
    pruefe("Vorschau-Schutz: mit Freigabe laeuft der Upload", frei === "kein-fehler" && s.zeilen.size > 0);
    pruefe("Vorschau-Schutz: die Action meldet den Fall mit eigener Meldung", /vorschau: "fehler\.wissenVorschau"/.test(aktion) && aktion.indexOf("pruefeUploadUmgebung();") < aktion.indexOf("arrayBuffer()"));
  }

  // ---- 3. Eingabepruefung -----------------------------------------------------------------------
  {
    const s = falscherSpeicher();
    const e = falscheEinbettung();
    const d = { speicher: s, einbettung: e, jetzt: JETZT };
    pruefe("Eingabe: .docx wird abgelehnt (dateityp)", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "a.docx" }), d))) === "dateityp");
    pruefe("Eingabe: Datei ohne Endung wird abgelehnt", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "kodex" }), d))) === "dateityp");
    pruefe("Eingabe: leere Datei wird abgelehnt", (await fehlerCode(() => verarbeiteUpload(eingabe({ bytes: new Uint8Array(0) }), d))) === "eingabe");
    pruefe("Eingabe: zu grosse Datei wird abgelehnt, bevor sie gelesen wird", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "gross.pdf", bytes: new Uint8Array(MAX_DATEI_BYTES + 1) }), d))) === "zuGross");
    pruefe("Eingabe: leerer Titel", (await fehlerCode(() => verarbeiteUpload(eingabe({ titel: "   " }), d))) === "eingabe");
    pruefe("Eingabe: zu langer Titel", (await fehlerCode(() => verarbeiteUpload(eingabe({ titel: "x".repeat(201) }), d))) === "eingabe");
    pruefe("Eingabe: unbekannter Bereich (kein Auffangwert)", (await fehlerCode(() => verarbeiteUpload(eingabe({ bereich: "sonstiges" }), d))) === "eingabe");
    pruefe("Eingabe: Bereich muss klein geschrieben sein", (await fehlerCode(() => verarbeiteUpload(eingabe({ bereich: "Recht" }), d))) === "eingabe");
    pruefe("Eingabe: nach abgelehnter Eingabe wurde weder eingebettet noch geschrieben", e.aufrufe === 0 && s.zeilen.size === 0 && s.ereignisse.length === 0);
  }

  // ---- 4. Textgewinnung -------------------------------------------------------------------------
  {
    const s = falscherSpeicher();
    const d = { speicher: s, einbettung: falscheEinbettung(), jetzt: JETZT };
    pruefe("Text: Binaerdatei als .txt (Nullbytes) -> lesen, nichts gespeichert", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "b.txt", bytes: new Uint8Array([0x41, 0, 0x42, 0xff]) }), d))) === "lesen" && s.zeilen.size === 0);
    pruefe("Text: kaputtes PDF -> lesen, kein Absturz, nichts gespeichert", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "k.pdf", bytes: bytes("das ist kein pdf, nur Text ohne Struktur") }), d))) === "lesen" && s.zeilen.size === 0);
    pruefe("Text: abgeschnittenes PDF -> lesen oder leer, nie eine ungefangene Ausnahme", ["lesen", "leer"].includes(await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "k2.pdf", bytes: minimalesPdf(["Hallo Welt"]).slice(0, 80) }), d))));
    pruefe("Text: nur Leerraum -> leer", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "l.txt", bytes: bytes("  \n\n \t ") }), d))) === "leer");
    pruefe("Text: PDF ohne Text (Scan-Fall) -> leer", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "s.pdf", bytes: minimalesPdf([]) }), d))) === "leer");
    pruefe("Text: zu langes Dokument -> zuLang, nichts gespeichert", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "lang.txt", bytes: bytes(Array.from({ length: MAX_CHUNKS * 3 }, (_, i) => `Absatz ${i}: ${"Wort".repeat(300)} nummer${i}`).join("\n\n")) }), d))) === "zuLang" && s.zeilen.size === 0);
  }

  // ---- 5. Upload erzeugt Textstellen -------------------------------------------------------------
  const s1 = falscherSpeicher();
  const e1 = falscheEinbettung();
  const d1 = { speicher: s1, einbettung: e1, jetzt: JETZT };
  const erg = await verarbeiteUpload(eingabe({ rollen: ["buchhaltung", "kunde"] }), d1);
  const zeilen = [...s1.zeilen.values()];
  pruefe("Upload (.md): Ergebnis nennt die Zahl der Abschnitte, Zeilen liegen im Speicher", erg.chunks > 0 && zeilen.length === erg.chunks, `${erg.chunks} Abschnitte`);
  pruefe("Upload: Formularwert recht wird als bereich \"legal\" gespeichert, Pfad unter upload/legal/", zeilen.every((z) => z.bereich === "legal" && z.pfad === "upload/legal/kodex.md"), `${zeilen[0]?.bereich} ${zeilen[0]?.pfad}`);
  pruefe("Upload: Rollen = Admin + Buchhaltung (Kunde verworfen)", zeilen.every((z) => z.rollen.join() === "admin,buchhaltung"), zeilen[0]?.rollen.join());
  pruefe("Upload: Markierung extra.quelle = upload, Hash, Dateiname und Hochladende stehen in extra", zeilen.every((z) => z.extra.quelle === "upload" && z.extra.inhalts_hash === erg.hash && z.extra.dateiname === "kodex.md" && z.extra.hochgeladen_von === ADMIN.id && z.extra.hochgeladen_von_name === ADMIN.name));
  pruefe("Upload: quelle_id = upload:<hash>, Titel und Beleg-Kontext = Titel", zeilen.every((z) => z.quelle_id === uploadQuelleId(erg.hash) && z.titel === "Testkodex Zypresse" && z.kontext === "Testkodex Zypresse"));
  pruefe("Upload: Einbettung mit dem Modell der Konfiguration, 1024 Zahlen im pgvector-Text", zeilen.every((z) => z.embed_modell === "synthetisch-bge-m3" && JSON.parse(z.dense).length === 1024 && z.dense.startsWith("[")));
  pruefe("Upload: sparser Vektor ist dieselbe Funktion wie im ETL (sparseDokument + alsSparsevec auf Kontext + Text)", zeilen.every((z) => z.sparse === alsSparsevec(sparseDokument(einbettungsText({ kontext: z.kontext ?? "", text: z.text })))));
  pruefe("Upload: Sprache erkannt, Datum gesetzt, Zeitpunkt der Einlesung", zeilen.every((z) => z.sprache === "de" && z.abgerufen_am === "2026-10-05" && z.eingelesen_am === "2026-10-05T10:00:00.000Z"));
  pruefe("Upload: Text der Absaetze ist vollstaendig enthalten", ABSAETZE.every((a) => zeilen.some((z) => z.text.includes(a.slice(0, 40)))));
  {
    const t = falscherSpeicher();
    await verarbeiteUpload(eingabe({ rollen: ["buchhaltung", "kunde"] }), { speicher: t, einbettung: falscheEinbettung(), jetzt: JETZT });
    pruefe("Upload: IDs sind stabil (zweimal gebaut = gleiche IDs)", [...t.zeilen.keys()].sort().join() === [...s1.zeilen.keys()].sort().join());
  }

  // .txt und PDF
  {
    const s = falscherSpeicher();
    const d = { speicher: s, einbettung: falscheEinbettung(), jetzt: JETZT };
    const r = await verarbeiteUpload(eingabe({ dateiname: "notiz.txt", bytes: bytes(TXT), titel: "Notiz Sonnenhof", bereich: "audit" }), d);
    pruefe("Upload (.txt): wird angenommen, Bereich audit", r.chunks > 0 && [...s.zeilen.values()].every((z) => z.bereich === "audit" && z.pfad === "upload/audit/notiz.txt"));
    const pdf = minimalesPdf(["Synthetisches PDF Steuerkodex Birke", "Paragraph 7: Die Meldefrist Schneeeule betraegt dreissig Tage."]);
    const sp = falscherSpeicher();
    const rp = await verarbeiteUpload(eingabe({ dateiname: "steuer.pdf", bytes: pdf, titel: "Steuerkodex Birke", bereich: "steuer" }), { speicher: sp, einbettung: falscheEinbettung(), jetzt: JETZT });
    const alle = [...sp.zeilen.values()].map((z) => z.text).join(" ");
    pruefe("Upload (.pdf): Text wird aus dem PDF gelesen und gespeichert", rp.chunks > 0 && /Schneeeule/.test(alle) && /dreissig Tage/.test(alle), alle.slice(0, 80));
    const sm = falscherSpeicher();
    await verarbeiteUpload(eingabe({ dateiname: "front.md", bytes: bytes("---\ntitel: Fremder Titel\nquelle_id: fremd\nchunk_id: fremd\nautoritaetsstufe: 2\n---\n\nInhalt Frontmatter Eisvogel.\n") }), { speicher: sm, einbettung: falscheEinbettung(), jetzt: JETZT });
    const z = [...sm.zeilen.values()][0]!;
    pruefe("Upload (.md mit Frontmatter): Titel, Quelle und Kennung setzt der Upload, die Stufe bleibt erhalten", z.titel === "Testkodex Zypresse" && z.quelle_id?.startsWith("upload:") === true && z.chunk_id === z.quelle_id && z.autoritaetsstufe === 2);
  }

  // ---- 6. Dublette -------------------------------------------------------------------------------
  {
    const vorher = s1.zeilen.size;
    pruefe("Dublette: dieselbe Datei erneut -> doppelt (mit Titel des vorhandenen)", (await fehlerCode(() => verarbeiteUpload(eingabe({ rollen: ["ceo"] }), d1))) === "doppelt");
    pruefe("Dublette: es entstehen keine neuen Zeilen", s1.zeilen.size === vorher);
    pruefe("Dublette: auch mit anderem Titel, Bereich und anderen Zeilenenden (CRLF)", (await fehlerCode(() => verarbeiteUpload(eingabe({ titel: "Anderer Titel", bereich: "audit", dateiname: "kopie.md", bytes: bytes(MD.replace(/\n/g, "\r\n")) }), d1))) === "doppelt" && s1.zeilen.size === vorher);
    let titel = "";
    try { await verarbeiteUpload(eingabe(), d1); } catch (e) { titel = e instanceof UploadFehler ? (e.wert ?? "") : ""; }
    pruefe("Dublette: die Meldung nennt den Titel des vorhandenen Dokuments", titel === "Testkodex Zypresse", titel);
    pruefe("Dublette: Hash ist gleich bei gleichem Inhalt, verschieden bei anderem", inhaltsHash(MD) === inhaltsHash(MD.replace(/\n/g, "\r\n")) && inhaltsHash(MD) !== inhaltsHash(`${MD}\nNeu.`));
    const s = s1;
    const r2 = await verarbeiteUpload(eingabe({ dateiname: "zwei.md", titel: "Zweites Dokument", bytes: bytes(`Ein ganz anderer Inhalt ueber Walnussernte und Zypressen.\n\n${ABSAETZE[0]}`) }), { speicher: s, einbettung: falscheEinbettung(), jetzt: JETZT });
    pruefe("Dublette: anderer Inhalt wird normal angenommen", r2.chunks > 0 && s.zeilen.size > vorher);
  }

  // ---- 7. Wortgewichte ---------------------------------------------------------------------------
  {
    // Vorbestand wie nach dem ETL: 10 Textstellen, das Wort "beleg" kommt in 3 vor.
    const belegIdx = sparseIndex(sparseDokument("beleg").indices[0]!);
    const vorbestand = Array.from({ length: 10 }, (_, i) => ({ ...zeilen[0]!, id: `alt-${i}`, quelle_id: `skript/${i}`, extra: {} }) as ChunkZeile);
    const s = falscherSpeicher({ zeilen: vorbestand, begriffe: [[belegIdx, 3]] });
    const r = await verarbeiteUpload(eingabe({ dateiname: "w.txt", bytes: bytes("Beleg Archiv\n\nBeleg Frist\n\nAnderes Thema Walnuss") }), { speicher: s, einbettung: falscheEinbettung(), jetzt: JETZT });
    const n = s.zeilen.size;
    const neu = [...s.zeilen.values()].filter((z) => z.extra.quelle === "upload");
    const enthalten = neu.filter((z) => sparsevecIndizes(z.sparse).includes(belegIdx)).length;
    const b = s.begriffe.get(belegIdx)!;
    pruefe("Begriffe: N = alle Textstellen nach dem Einfuegen (Vorbestand + Upload)", n === 10 + r.chunks, `N=${n}`);
    pruefe("Begriffe: df des Wortes = alter Wert + Textstellen des Uploads, die es enthalten", b.df === 3 + enthalten && enthalten > 0, `df=${b.df}, neu=${enthalten}`);
    pruefe("Begriffe: IDF folgt der Formel des ETL", b.idf === idf(n, b.df), `idf=${b.idf}`);
    const walnuss = sparseIndex(sparseDokument("walnuss").indices[0]!);
    pruefe("Begriffe: neue Woerter bekommen df = Anzahl der Textstellen mit dem Wort", s.begriffe.get(walnuss)?.df === neu.filter((z) => sparsevecIndizes(z.sparse).includes(walnuss)).length);
    pruefe("Begriffe: df ueberschreitet nie N", [...s.begriffe.values()].every((x) => x.df <= n));
    pruefe("Begriffe: Parser der sparsevec-Textform ist das Gegenstueck zu alsSparsevec", sparsevecIndizes(alsSparsevec({ indices: [5, 9, 1_000_000_020], values: [1, 2, 3] })).join() === [6, 10, 21].join() && sparsevecIndizes("{}/1000000000").length === 0);
  }

  // ---- 8. Alles oder nichts ----------------------------------------------------------------------
  {
    const s = falscherSpeicher();
    pruefe("Atomar: Einbettung faellt aus -> einbettung, nichts geschrieben, keine Begriffe", (await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: falscheEinbettung({ werfe: true }), jetzt: JETZT }))) === "einbettung" && s.zeilen.size === 0 && s.begriffe.size === 0 && !s.ereignisse.includes("schreibeChunks"));
    pruefe("Atomar: falsche Vektorgroesse -> einbettung", (await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: falscheEinbettung({ dimension: 768 }), jetzt: JETZT }))) === "einbettung" && s.zeilen.size === 0);
    const s2 = falscherSpeicher({}, { chunksBeiBatch: 2 });
    pruefe("Atomar: Schreibfehler mitten im Dokument -> speichern, schon geschriebene Zeilen werden entfernt", (await fehlerCode(() => verarbeiteUpload(eingabe({ dateiname: "viel.txt", bytes: bytes(Array.from({ length: 12 }, (_, i) => `Absatz ${i} ${"Zeichen ".repeat(150)}`).join("\n\n")) }), { speicher: s2, einbettung: falscheEinbettung(), jetzt: JETZT }))) === "speichern" && s2.zeilen.size === 0 && s2.ereignisse.includes("loescheQuelle"));
    const s3 = falscherSpeicher({}, { begriffe: true });
    pruefe("Atomar: Begriffe nicht schreibbar -> speichern, Zeilen wieder entfernt, nie ein Dokument ohne Gewichte", (await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s3, einbettung: falscheEinbettung(), jetzt: JETZT }))) === "speichern" && s3.zeilen.size === 0);
    const ausfall: WissenSpeicher = { ...falscherSpeicher(), findeQuelle: async () => { throw new Error("DB weg"); } };
    pruefe("Atomar: Datenbank bei der Dublettenpruefung nicht erreichbar -> speichern", (await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: ausfall, einbettung: falscheEinbettung(), jetzt: JETZT }))) === "speichern");
  }

  // ---- 9. Suche findet das Dokument mit Beleg; Rollen -----------------------------------------------
  {
    const s = falscherSpeicher();
    const e = falscheEinbettung();
    const d = { speicher: s, einbettung: e, jetzt: JETZT };
    // A: nur Admin (keine Rolle angekreuzt). B: Admin + Buchhaltung.
    await verarbeiteUpload(eingabe({ rollen: [], titel: "Nur Admin Kodex", dateiname: "a.md", bytes: bytes("Der Geheimkodex Rotfuchs regelt die Sondervollmacht der Geschaeftsfuehrung Zinnoberrot.") }), d);
    await verarbeiteUpload(eingabe({ rollen: ["buchhaltung"], titel: "Buchhaltung Kodex", bereich: "steuer", dateiname: "b.md", bytes: bytes("Der Rechenkodex Silberreiher regelt die Umsatzsteuer-Voranmeldung Himmelblau im Quartal.") }), d);
    const suche = (rolle: Role, frage: string) => sucheWissen({ frage }, rolle, { einbettung: e, supabase: falscheSuche(s, rolle) });

    const bAlsBuch = await suche("buchhaltung", "Umsatzsteuer-Voranmeldung Himmelblau Silberreiher");
    const beleg = bAlsBuch.belege[0];
    pruefe("Suche: Buchhaltung findet das fuer sie freigegebene Dokument an erster Stelle", beleg?.titel === "Buchhaltung Kodex", beleg?.titel ?? "kein Treffer");
    pruefe("Suche: der Beleg nennt Kennung S1, Fundstelle = Titel, Bereich und den Text der Stelle", beleg?.id === "S1" && beleg.fundstelle === "Buchhaltung Kodex" && beleg.bereich === "steuer" && /Silberreiher/.test(beleg.text), JSON.stringify({ id: beleg?.id, f: beleg?.fundstelle, b: beleg?.bereich }));
    pruefe("Suche: Beleg traegt Abrufdatum und Sprache des Uploads", beleg?.abgerufenAm === "2026-10-05" && beleg.sprache === "de");

    const aAlsBuch = await suche("buchhaltung", "Geheimkodex Rotfuchs Sondervollmacht Zinnoberrot");
    pruefe("Rollen: ein nur fuer Admin freigegebenes Dokument sieht die Buchhaltung NICHT", !aAlsBuch.belege.some((b) => /Rotfuchs/.test(b.text) || b.titel === "Nur Admin Kodex"), aAlsBuch.belege.map((b) => b.titel).join("|"));
    const aAlsAdmin = await suche("admin", "Geheimkodex Rotfuchs Sondervollmacht Zinnoberrot");
    pruefe("Rollen: der Admin sieht es", aAlsAdmin.belege[0]?.titel === "Nur Admin Kodex");
    const bAlsCeo = await suche("ceo", "Umsatzsteuer-Voranmeldung Himmelblau Silberreiher");
    pruefe("Rollen: ein nur fuer Admin und Buchhaltung freigegebenes Dokument sieht der CEO nicht", !bAlsCeo.belege.some((b) => b.titel === "Buchhaltung Kodex"));
    const bAlsKunde = await suche("kunde", "Umsatzsteuer-Voranmeldung Himmelblau Silberreiher");
    pruefe("Rollen: ein Kunde bekommt nichts, auch wenn die Frage passt (RLS)", bAlsKunde.belege.length === 0);
    // Auch ein manipuliertes p_rolle erweitert nichts: die Sitzungsrolle (RLS) bleibt massgeblich.
    const manipuliert = await sucheWissen({ frage: "Geheimkodex Rotfuchs Sondervollmacht" }, "admin", { einbettung: e, supabase: falscheSuche(s, "buchhaltung") });
    pruefe("Rollen: p_rolle=admin mit Buchhaltungs-Sitzung liefert das Admin-Dokument nicht (RLS gewinnt)", !manipuliert.belege.some((b) => b.titel === "Nur Admin Kodex"));
  }

  // ---- 10. Liste -----------------------------------------------------------------------------------
  {
    const roh: WissenListeZeile[] = [
      { id: "1", quelle_id: "recht/nk-rk.md", pfad: "recht/nk-rk.md", titel: "НК РК", bereich: "recht", rollen: ["admin", "ceo"], eingelesen_am: "2026-09-19", upload_quelle: null, hochgeladen_von: null },
      { id: "2", quelle_id: "recht/nk-rk.md", pfad: "recht/nk-rk.md", titel: "НК РК", bereich: "recht", rollen: ["admin", "ceo"], eingelesen_am: "2026-09-20", upload_quelle: null, hochgeladen_von: null },
      { id: "3", quelle_id: null, pfad: "audit/leitfaden.md", titel: null, bereich: "audit", rollen: ["admin"], eingelesen_am: null, upload_quelle: null, hochgeladen_von: null },
      { id: "4", quelle_id: "upload:abc", pfad: "upload/steuer/x.md", titel: "Hochgeladen", bereich: "steuer", rollen: ["admin", "buchhaltung"], eingelesen_am: "2026-10-05T10:00:00.000Z", upload_quelle: "upload", hochgeladen_von: "Test Admin" },
      { id: "5", quelle_id: "upload:abc", pfad: "upload/steuer/x.md", titel: "Hochgeladen", bereich: "steuer", rollen: ["admin", "buchhaltung"], eingelesen_am: "2026-10-05T10:00:00.000Z", upload_quelle: "upload", hochgeladen_von: "Test Admin" },
      { id: "6", quelle_id: "upload:abc", pfad: "upload/steuer/x.md", titel: "Hochgeladen", bereich: "steuer", rollen: ["admin", "buchhaltung"], eingelesen_am: "2026-10-05T10:00:00.000Z", upload_quelle: "upload", hochgeladen_von: "Test Admin" },
    ];
    const l = gruppiereWissenDokumente(roh);
    pruefe("Liste: Zeilen werden nach quelle_id zu Dokumenten, notfalls nach Pfad", l.length === 3, `${l.length} Dokumente`);
    const up = l.find((x) => x.herkunft === "upload")!;
    pruefe("Liste: hochgeladenes Dokument mit Titel, Bereich, Rollen, Datum, Hochladendem und Abschnitten", up.titel === "Hochgeladen" && up.bereich === "steuer" && up.rollen.join() === "admin,buchhaltung" && up.datum === "2026-10-05T10:00:00.000Z" && up.hochgeladenVon === "Test Admin" && up.chunks === 3);
    const sk = l.find((x) => x.schluessel === "recht/nk-rk.md")!;
    pruefe("Liste: Skript-Dokument gruppiert, zaehlt Abschnitte, nimmt das juengste eingelesen_am", sk.herkunft === "skript" && sk.chunks === 2 && sk.datum === "2026-09-20" && sk.hochgeladenVon === null);
    pruefe("Liste: Dokument ohne Titel und Datum wird trotzdem gezeigt (Pfad als Titel), steht am Ende", l[l.length - 1]!.titel === "audit/leitfaden.md" && l[l.length - 1]!.datum === null);
    pruefe("Liste: neueste zuerst", l[0]!.herkunft === "upload");
    pruefe("Liste: leere Eingabe ergibt leere Liste", gruppiereWissenDokumente([]).length === 0);
  }

  // ---- 11. ETL laesst Uploads stehen ---------------------------------------------------------------
  {
    const etl = lies("scripts/wissen-nach-supabase.ts");
    pruefe("ETL: Marker upload ist definiert", /const UPLOAD_QUELLE = "upload"/.test(etl));
    pruefe("ETL: --bereinigen liest extra->>quelle und schliesst Uploads vom Loeschen aus", /extra->>quelle/.test(etl) && /!== UPLOAD_QUELLE/.test(etl));
    pruefe("ETL: Uploads zaehlen in die Dokumenthaeufigkeit (N und df) mit", /listen\.push\(sparsevecIndizes\(/.test(etl) && /wortgewichte\(listen\)/.test(etl));
    pruefe("Upload und ETL benutzen denselben Marker", lies("src/lib/wissen/hochladen.ts").includes('UPLOAD_QUELLE = "upload"'));
  }

  // ---- 12. Texte in allen Sprachen -------------------------------------------------------------------
  for (const loc of ["de", "en", "ru", "kk"]) {
    const m = JSON.parse(lies(`src/messages/${loc}.json`)) as { aktionen: { ok: Record<string, string>; fehler: Record<string, string> }; kiAssistentAnsicht: { wissensVerwaltung: Record<string, unknown> } };
    const w = m.kiAssistentAnsicht.wissensVerwaltung as { titel?: string; bereich?: Record<string, string>; formular?: Record<string, string> };
    const schluessel = ["wissenVorschau", "wissenDateityp", "wissenLesen", "wissenLeer", "wissenZuLang", "wissenDoppelt", "wissenEinbettung", "wissenSpeichern"];
    pruefe(`Texte ${loc}: alle Fehler- und Erfolgsmeldungen vorhanden`, schluessel.every((k) => m.aktionen.fehler[k]) && !!m.aktionen.ok.wissenHochgeladen);
    pruefe(`Texte ${loc}: Titel, fuenf Bereiche und Formularfelder vorhanden`, !!w.titel && UPLOAD_BEREICHE.every((b) => w.bereich?.[b]) && ["titel", "datei", "titelFeld", "bereich", "rollen", "knopf", "adminImmer"].every((k) => w.formular?.[k]));
  }

  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
  if (fehler > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
