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
import { loescheHochgeladenesDokument } from "@/lib/wissen/loeschen";
import {
  erlaubteRollen,
  pruefeUploadUmgebung,
  inhaltsHash,
  MAX_CHUNKS,
  normalisiereUrl,
  UploadFehler,
  verarbeiteUpload,
  ZEITBUDGET_MS,
  type ChunkZeile,
  type FreigabeInfo,
  type UploadEingabe,
  type WissenSpeicher,
} from "@/lib/wissen/hochladen";
import { BEREICH_WERT, bereichSchluessel, MAX_DATEI_BYTES, UPLOAD_BEREICHE, UPLOAD_ROLLEN } from "@/lib/wissen/upload-konstanten";
import { alsSparsevec, idf, sparseDokument, sparseIndex, sparsevecIndizes, tokens, wortgewichte } from "@/lib/wissen/sparse";
import { istUploadZeile, uploadQuelleId } from "@/lib/wissen/upload-quelle";
import type { RpcKlient } from "@/lib/wissen/supabase-suche";
import { sucheWissen } from "@/lib/wissen/suche";
import { entscheideUeberUpload } from "@/lib/wissen/freigabe";
import { belegLage, CLUSTER, CLUSTER_INFO, clusterPasst, einordnung, istCluster, nutzungFuer, pruefenBis, QUELLENART_INFO, QUELLENARTEN, standardStufe, STUFEN_NAMEN, TEXTGRUNDLAGEN, typischerClusterVon } from "@/lib/wissen/quellenart";
import { hinweisFuerLage } from "@/lib/ai/wissen-werkzeug";
import { belegeAusErgebnis } from "@/lib/wissen/belege";
import { quellenAnweisung } from "@/lib/domain/antwort-anweisungen";

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
  vorgabe: { zeilen?: ChunkZeile[]; begriffe?: Array<[number, number] | [number, number, number]> } = {},
  fehlschlag: { chunksBeiBatch?: number; begriffe?: boolean; loeschen?: boolean; entscheiden?: boolean } = {},
): WissenSpeicher & Speicherstand {
  const zeilen = new Map<string, ChunkZeile>((vorgabe.zeilen ?? []).map((z) => [z.id, z]));
  const begriffe = new Map<number, { df: number; idf: number }>((vorgabe.begriffe ?? []).map(([h, df, w]) => [h, { df, idf: w ?? 0 }]));
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
    async ladeQuellenInfo(quelleId) {
      ereignisse.push("ladeQuellenInfo");
      const z = [...zeilen.values()].filter((r) => r.quelle_id === quelleId);
      const fremd = z.filter((r) => !istUploadZeile({ quelle_id: r.quelle_id, upload_quelle: typeof r.extra.quelle === "string" ? r.extra.quelle : null })).length;
      return { anzahl: z.length, fremd, titel: z[0]?.titel ?? null, bereich: z[0]?.bereich ?? null };
    },
    async loescheUpload(quelleId) {
      ereignisse.push("loescheUpload");
      if (fehlschlag.loeschen) throw new Error("Loeschen fehlgeschlagen");
      // wie die echte Anweisung: nur Zeilen mit BEIDEN Merkmalen, und nur diese werden zurueckgegeben
      const weg = [...zeilen.values()].filter((r) => r.quelle_id === quelleId && r.extra.quelle === "upload" && (r.quelle_id ?? "").startsWith("upload:"));
      for (const r of weg) zeilen.delete(r.id);
      return weg.map((r) => r.sparse);
    },
    async loescheBegriffe(indizes) {
      ereignisse.push("loescheBegriffe");
      for (const i of indizes) begriffe.delete(i);
    },
    async ladeFreigabeInfo(quelleId) {
      ereignisse.push("ladeFreigabeInfo");
      const z = [...zeilen.values()].filter((r) => r.quelle_id === quelleId);
      const stati = new Set(z.map((r) => r.pruefstatus));
      const von = z.map((r) => r.extra.hochgeladen_von).find((v): v is string => typeof v === "string");
      return {
        anzahl: z.length,
        fremd: z.filter((r) => !istUploadZeile({ quelle_id: r.quelle_id, upload_quelle: typeof r.extra.quelle === "string" ? r.extra.quelle : null })).length,
        titel: z[0]?.titel ?? null,
        bereich: z[0]?.bereich ?? null,
        quellenart: z[0]?.quellenart ?? null,
        pruefstatus: z.length === 0 ? null : stati.size === 1 ? (z[0]!.pruefstatus as FreigabeInfo["pruefstatus"]) : "gemischt",
        hochgeladenVon: von ?? null,
        pruefenBis: z[0]?.pruefen_bis ?? null,
      };
    },
    async entscheide(quelleId, a) {
      ereignisse.push("entscheide");
      if (fehlschlag.entscheiden) throw new Error("Entscheidung fehlgeschlagen");
      const z = [...zeilen.values()].filter((r) => r.quelle_id === quelleId && r.extra.quelle === "upload" && (r.quelle_id ?? "").startsWith("upload:") && r.pruefstatus === "ungeprueft");
      // wie der Waechter in der Datenbank: die hochladende Person gibt nie frei
      if (a.status === "freigegeben" && z.some((r) => r.extra.hochgeladen_von === a.pruefer)) throw new Error("Vier-Augen-Prinzip (Waechter der Datenbank)");
      for (const r of z) {
        r.pruefstatus = a.status;
        r.geprueft_von = a.pruefer;
        r.geprueft_am = a.zeitpunkt;
        r.pruefen_bis = a.pruefenBis;
      }
      return z.length;
    },
    async verlaengere(quelleId, a) {
      ereignisse.push("verlaengere");
      const z = [...zeilen.values()].filter((r) => r.quelle_id === quelleId && r.extra.quelle === "upload" && r.pruefstatus === "freigegeben" && r.pruefen_bis !== null);
      if (z.some((r) => r.extra.hochgeladen_von === a.pruefer)) throw new Error("Vier-Augen-Prinzip (Waechter der Datenbank)");
      for (const r of z) {
        r.geprueft_von = a.pruefer;
        r.geprueft_am = a.zeitpunkt;
        r.pruefen_bis = a.pruefenBis;
      }
      return z.length;
    },
    async ladeVorschau(quelleId, max) {
      ereignisse.push("ladeVorschau");
      const text = [...zeilen.values()].filter((r) => r.quelle_id === quelleId).sort((a, b) => a.teil - b.teil).map((r) => r.text).join("\n\n");
      return text.slice(0, max);
    },
  };
}

/** Nachbau von wissen_suche() samt RLS: sichtbar ist, wer mit seiner ECHTEN Rolle in `rollen` steht. */
function falscheSuche(speicher: Speicherstand, sitzungsRolle: Role, heute = "2026-10-06"): RpcKlient {
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
          .filter((z) => z.pruefstatus === "freigegeben" && z.rollen.includes(sitzungsRolle)) // RLS (Migration 20261124000000)
          .filter((z) => !z.pruefen_bis || z.pruefen_bis >= heute) // Wiedervorlage
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
/** Die zweite Person des Vier-Augen-Prinzips: eine andere profiles.id als die der hochladenden. */
const ZWEITE_PERSON = "00000000-0000-0000-0000-000000000002";

function eingabe(teil: Partial<UploadEingabe> = {}): UploadEingabe {
  return { titel: "Testkodex Zypresse", bereich: "recht", rollen: ["buchhaltung"], dateiname: "kodex.md", bytes: bytes(MD), hochgeladenVon: ADMIN, quellenart: "fachliteratur", ...teil };
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
  // Seit dem Schema-Schalter (SUPABASE_DB_SCHEMA) bestimmt das Schema, wohin die App schreibt. Gesperrt ist nur noch
  // eine Vorschau, die auf public (Produktion) schreiben wuerde.
  {
    const wirft = (env: Record<string, string | undefined>, schema = "public") => { try { pruefeUploadUmgebung(env, schema); return false; } catch (e) { return e instanceof UploadFehler && e.code === "vorschau"; } };
    pruefe("Vorschau-Schutz: VERCEL_ENV=preview mit Schema public wird abgelehnt", wirft({ VERCEL_ENV: "preview" }));
    pruefe("Vorschau-Schutz: eine Vorschau mit eigenem Schema public_preview ist frei (sie schreibt in die Kopie)", !wirft({ VERCEL_ENV: "preview" }, "public_preview"));
    pruefe("Vorschau-Schutz: WISSEN_UPLOAD_PREVIEW_OK=true hebt die Sperre auf (auch bei Schema public, eigene Datenbank)", !wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" }));
    pruefe("Vorschau-Schutz: nur der Wert true gilt (1, yes, TRUE, leer nicht)", ["1", "yes", "TRUE", "", "false"].every((v) => wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: v })));
    pruefe("Vorschau-Schutz: Produktion, Development und lokal (ohne VERCEL_ENV) sind frei", !wirft({ VERCEL_ENV: "production" }) && !wirft({ VERCEL_ENV: "development" }) && !wirft({}));
    pruefe("Vorschau-Schutz: das Flag allein erlaubt nichts anderes (preview mit public bleibt zu ohne Flag)", wirft({ VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: undefined }));
    const s = falscherSpeicher();
    const e = falscheEinbettung();
    const code = await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: e, jetzt: JETZT, umgebung: { VERCEL_ENV: "preview" }, schema: "public" }));
    pruefe("Vorschau-Schutz: verarbeiteUpload in der Vorschau mit Schema public -> vorschau, nichts gelesen, eingebettet oder geschrieben", code === "vorschau" && e.aufrufe === 0 && s.ereignisse.length === 0 && s.zeilen.size === 0);
    const frei = await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: s, einbettung: e, jetzt: JETZT, umgebung: { VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" }, schema: "public" }));
    pruefe("Vorschau-Schutz: mit Freigabe laeuft der Upload", frei === "kein-fehler" && s.zeilen.size > 0);
    const s2 = falscherSpeicher();
    const frei2 = await fehlerCode(() => verarbeiteUpload(eingabe({ titel: "Zweites Dokument", bytes: bytes("Anderer Inhalt Nachtigall Tintenfass.") }), { speicher: s2, einbettung: falscheEinbettung(), jetzt: JETZT, umgebung: { VERCEL_ENV: "preview" }, schema: "public_preview" }));
    pruefe("Vorschau-Schutz: Vorschau mit Schema public_preview darf hochladen, ohne Flag", frei2 === "kein-fehler" && s2.zeilen.size > 0);
    pruefe("Vorschau-Schutz: die Action meldet den Fall mit eigener Meldung", /vorschau: "fehler\.wissenVorschau"/.test(aktion) && aktion.indexOf("pruefeUploadUmgebung();") < aktion.indexOf("arrayBuffer()"));
    const hochladenOhneKommentare = lies("src/lib/wissen/hochladen.ts").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    pruefe("Vorschau-Schutz: das Schema kommt aus der App (DATENBANK_SCHEMA), nicht aus einer zweiten Regel", /DATENBANK_SCHEMA/.test(hochladenOhneKommentare) && !/NEXT_PUBLIC_DB_SCHEMA|SUPABASE_DB_SCHEMA/.test(hochladenOhneKommentare));
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
    const ergFront = await verarbeiteUpload(eingabe({ dateiname: "front.md", bytes: bytes("---\ntitel: Fremder Titel\nquelle_id: fremd\nchunk_id: fremd\nautoritaetsstufe: 2\n---\n\nInhalt Frontmatter Eisvogel.\n") }), { speicher: sm, einbettung: falscheEinbettung(), jetzt: JETZT });
    const z = [...sm.zeilen.values()][0]!;
    pruefe("Upload (.md mit Frontmatter): Titel, Quelle und Kennung setzt der Upload, eine Stufe im Frontmatter (hier 2) wird verworfen: die Stufe kommt aus der Quellenart (Fachliteratur = 4)", z.titel === "Testkodex Zypresse" && z.quelle_id?.startsWith("upload:") === true && z.chunk_id === z.quelle_id && z.autoritaetsstufe === 4);
    pruefe("Upload (.md mit Frontmatter): die vergebene Stufe steht im Ergebnis, damit die Action sie protokolliert", ergFront.autoritaetsstufe === 4 && /autoritaetsstufe: ergebnis\.autoritaetsstufe/.test(aktion));
    const ohneFront = await verarbeiteUpload(eingabe({ dateiname: "ohne.txt", bytes: bytes("Ohne Frontmatter Silberdistel.") }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT });
    pruefe("Upload (.txt): auch ohne Frontmatter bekommt der Upload die Stufe seiner Quellenart (4), nie null", ohneFront.autoritaetsstufe === 4 && ohneFront.quellenart === "fachliteratur");
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

    // Vor der Freigabe findet niemand etwas, auch der Admin nicht (Vier-Augen-Prinzip).
    const vorFreigabe = await suche("admin", "Geheimkodex Rotfuchs Sondervollmacht Zinnoberrot");
    const vorFreigabeB = await suche("buchhaltung", "Umsatzsteuer-Voranmeldung Himmelblau Silberreiher");
    pruefe("Vier-Augen: ein ungeprueftes Dokument findet niemand, auch der Admin nicht", vorFreigabe.belege.length === 0 && vorFreigabeB.belege.length === 0);
    for (const q of [...s.zeilen.values()].map((z) => z.quelle_id!).filter((v, i, a) => a.indexOf(v) === i)) {
      await entscheideUeberUpload("freigeben", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT });
    }

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

  // ---- 10b. Loeschen hochgeladener Dokumente ------------------------------------------------------
  {
    const aktionQ = lies("src/lib/actions/wissen.ts");
    const von = aktionQ.indexOf("export async function wissenDokumentLoeschen");
    const rumpf = aktionQ.slice(von);
    const gate = rumpf.indexOf('requirePermission("ki_assistent", "manage")');
    const erster = Math.min(...["formData.get(", "text(formData", "loescheHochgeladenesDokument(", "createServiceRoleClient()"].map((x) => { const i = rumpf.indexOf(x); return i < 0 ? Infinity : i; }));
    pruefe("Loeschen/Rechte: requirePermission(ki_assistent, manage) steht vor Formular, Dienst-Client und Loeschen", gate > 0 && gate < erster);
    pruefe("Loeschen/Rechte: bei fehlendem Recht wird zugriffsFehler zurueckgegeben, es geht nicht weiter", /catch \(error\) \{\s*return zugriffsFehler\(error\);/.test(rumpf));
    pruefe("Loeschen/Rechte: nur admin darf (rbac), CEO und alle anderen nicht", roles.filter((r) => hasPermission(r, "ki_assistent", "manage")).join() === "admin");
    pruefe("Loeschen/Server: Titel und Bereich fuer Meldung und Protokoll kommen vom Server, nicht aus dem Formular", !/text\(formData, "titel"\)/.test(rumpf) && /ergebnis\.titel/.test(rumpf));
    pruefe("Loeschen/Protokoll: das vorhandene Muster protokolliere() schreibt wissen.geloescht (wer, was, wann ueber audit_events)", /protokolliere\(profil, "wissen\.geloescht"/.test(rumpf));
    const loe = lies("src/lib/wissen/loeschen.ts");
    pruefe("Loeschen: der Vorschau-Schutz steht als erstes in der Loeschfunktion", loe.indexOf("pruefeUploadUmgebung(") > 0 && loe.indexOf("pruefeUploadUmgebung(") < loe.indexOf("istUploadQuelleId(quelleId)"));
    const adapter = lies("src/lib/wissen/speicher-supabase.ts");
    pruefe("Loeschen/Adapter: die DELETE-Anweisung filtert selbst auf quelle_id, 'upload:%' und extra->>quelle = upload", /\.delete\(\)[\s\S]{0,200}\.like\("quelle_id", UPLOAD_QUELLE_MUSTER\)[\s\S]{0,80}\.eq\("extra->>quelle", UPLOAD_QUELLE\)/.test(adapter));
    const ui = lies("src/components/db/wissen-verwaltung.tsx");
    pruefe("Loeschen/UI: der Knopf erscheint nur bei loeschbar, mit Bestaetigungsfenster", /dokument\.loeschbar \?/.test(ui) && /showModal\(\)/.test(ui));

    // Vorbestand wie nach dem ETL: 10 Skript-Textstellen, Wortgewichte konsistent (idf = idf(N, df)).
    const texte = Array.from({ length: 10 }, (_, i) => `Skriptdokument ${i} Beleg Archiv Frist Walnuss ${i % 3 === 0 ? "Meldefrist Schneeeule" : "Quarkspeise"} Artikel ${i}`);
    const skript = texte.map((t, i) => ({ ...zeilen[0]!, id: `skript-${i}`, quelle_id: `recht/dok${i}.md`, titel: `Skript ${i}`, bereich: "legal", extra: {}, sparse: alsSparsevec(sparseDokument(t)) }) as ChunkZeile);
    const gew = wortgewichte(skript.map((z) => sparsevecIndizes(z.sparse)));
    const vorgabeBegriffe = gew.map((g) => [g.hash, g.df, g.idf] as [number, number, number]);
    const vorbestand = () => falscherSpeicher({ zeilen: skript, begriffe: vorgabeBegriffe });
    const abbild = (sp: Speicherstand) => JSON.stringify({ z: [...sp.zeilen.keys()].sort(), b: [...sp.begriffe].sort((a, b) => a[0] - b[0]) });
    const hochladeText = "Neues Dokument Beleg Archiv Frist\n\nZypressenkodex Regenwurm Silberreiher Meldefrist Schneeeule\n\nFrist Walnuss Himmelblau";

    // a) Hochladen, Loeschen, Zustand wie vorher
    const sp = vorbestand();
    const vorher = abbild(sp);
    const up = await verarbeiteUpload(eingabe({ dateiname: "d.txt", titel: "Zu loeschen", bytes: bytes(hochladeText) }), { speicher: sp, einbettung: falscheEinbettung(), jetzt: JETZT });
    pruefe("Loeschen/Round-Trip: nach dem Upload hat sich der Zustand geaendert (Zeilen und Begriffe)", abbild(sp) !== vorher && sp.zeilen.size === 10 + up.chunks);
    const neueWoerter = [...sp.begriffe.keys()].filter((h) => !gew.some((g) => g.hash === h)).length;
    pruefe("Loeschen/Round-Trip: der Upload hat neue Woerter angelegt", neueWoerter > 0, `${neueWoerter} neue Woerter`);
    const erg = await loescheHochgeladenesDokument(up.quelleId, { speicher: sp, umgebung: {} });
    pruefe("Loeschen: Upload, dann Loeschen laesst keine Zeilen des Dokuments zurueck", [...sp.zeilen.values()].every((z) => z.quelle_id !== up.quelleId) && sp.zeilen.size === 10 && erg.geloescht === up.chunks && !erg.schonWeg, `${erg.geloescht} Zeilen`);
    pruefe("Loeschen/Round-Trip: wissen_begriffe (df, idf, Woerter) ist nach Upload + Loeschen gleich dem Zustand VOR dem Upload", abbild(sp) === vorher);
    pruefe("Loeschen/Round-Trip: Woerter, die nur das Dokument hatte, sind aus wissen_begriffe wieder entfernt", [...sp.begriffe.keys()].every((h) => gew.some((g) => g.hash === h)) && sp.ereignisse.includes("loescheBegriffe"));
    pruefe("Loeschen: Titel und Bereich kommen vom Server in das Ergebnis", erg.titel === "Zu loeschen" && erg.bereich === "legal");

    // b) Idempotenz: zweites Loeschen, Doppelklick (zwei gleichzeitige Aufrufe)
    const zweites = await loescheHochgeladenesDokument(up.quelleId, { speicher: sp, umgebung: {} });
    pruefe("Loeschen/Idempotent: zweites Loeschen -> schon geloescht, kein Fehler, nichts veraendert", zweites.schonWeg && zweites.geloescht === 0 && abbild(sp) === vorher);
    const sp2 = vorbestand();
    const up2 = await verarbeiteUpload(eingabe({ dateiname: "d.txt", bytes: bytes(hochladeText) }), { speicher: sp2, einbettung: falscheEinbettung(), jetzt: JETZT });
    const [r1, r2] = await Promise.all([loescheHochgeladenesDokument(up2.quelleId, { speicher: sp2, umgebung: {} }), loescheHochgeladenesDokument(up2.quelleId, { speicher: sp2, umgebung: {} })]);
    pruefe("Loeschen/Idempotent: Doppelklick (zwei gleichzeitige Aufrufe) loescht einmal, die Gewichte werden nur einmal verringert", [r1, r2].filter((r) => r.schonWeg).length === 1 && abbild(sp2) === vorher);

    // c) Skript-Zeilen und alles, was kein reiner Upload ist, sind nie loeschbar
    const sp3 = vorbestand();
    const vor3 = abbild(sp3);
    const code = async (q: string, s = sp3) => fehlerCode(() => loescheHochgeladenesDokument(q, { speicher: s, umgebung: {} }));
    pruefe("Loeschen/Skript: eine Skript-quelle (Pfad) wird abgelehnt, ohne die Datenbank zu fragen", (await code("recht/dok0.md")) === "nichtLoeschbar" && sp3.ereignisse.length === 0 && abbild(sp3) === vor3);
    pruefe("Loeschen/Skript: auch ein erfundener Vorsatz upload: ohne 32 Hexzeichen wird abgelehnt", (await code("upload:abc")) === "nichtLoeschbar" && (await code("upload:../recht")) === "nichtLoeschbar" && (await code("")) === "nichtLoeschbar");
    const gefaelscht = { ...skript[0]!, id: "x1", quelle_id: `upload:${"a".repeat(32)}`, extra: {} } as ChunkZeile; // richtige Form, aber nicht vom Upload (kein extra.quelle)
    const sp4 = falscherSpeicher({ zeilen: [...skript, gefaelscht] });
    pruefe("Loeschen/Skript: gueltige upload:-Form, aber ohne extra.quelle = upload -> abgelehnt, nichts geloescht", (await code(`upload:${"a".repeat(32)}`, sp4)) === "nichtLoeschbar" && sp4.zeilen.has("x1") && !sp4.ereignisse.includes("loescheUpload"));
    const markiert = { ...skript[1]!, id: "x2", quelle_id: `upload:${"b".repeat(32)}`, extra: { quelle: "upload" } } as ChunkZeile;
    const gemischt = { ...skript[2]!, id: "x3", quelle_id: `upload:${"b".repeat(32)}`, extra: {} } as ChunkZeile;
    const sp5 = falscherSpeicher({ zeilen: [...skript, markiert, gemischt] });
    pruefe("Loeschen/Skript: gemischte Quelle (eine Zeile vom Upload, eine nicht) -> ganz abgelehnt, auch die Upload-Zeile bleibt", (await code(`upload:${"b".repeat(32)}`, sp5)) === "nichtLoeschbar" && sp5.zeilen.has("x2") && sp5.zeilen.has("x3"));
    const nurMarker = { ...skript[3]!, id: "x4", quelle_id: "recht/fremd.md", extra: { quelle: "upload" } } as ChunkZeile; // Marker ohne Vorsatz
    const sp6 = falscherSpeicher({ zeilen: [...skript, nurMarker] });
    pruefe("Loeschen/Skript: Marker upload ohne Vorsatz upload: in der quelle_id -> nicht loeschbar", (await code("recht/fremd.md", sp6)) === "nichtLoeschbar" && sp6.zeilen.has("x4"));
    const sp7 = falscherSpeicher({ zeilen: [markiert, gemischt] });
    const roh = await sp7.loescheUpload(`upload:${"b".repeat(32)}`);
    pruefe("Loeschen/Server: selbst direkt am Speicher loescht die Anweisung nur Zeilen mit beiden Merkmalen", roh.length === 1 && sp7.zeilen.has("x3") && !sp7.zeilen.has("x2"));
    pruefe("Loeschen/Liste: loeschbar nur, wenn ALLE Zeilen des Dokuments Upload-Zeilen sind", (() => {
      const r = (id: string, q: string | null, u: string | null): WissenListeZeile => ({ id, quelle_id: q, pfad: null, titel: "t", bereich: "legal", rollen: ["admin"], eingelesen_am: null, upload_quelle: u, hochgeladen_von: null });
      const l = gruppiereWissenDokumente([r("1", `upload:${"c".repeat(32)}`, "upload"), r("2", `upload:${"c".repeat(32)}`, "upload"), r("3", "recht/a.md", null), r("4", `upload:${"d".repeat(32)}`, "upload"), r("5", `upload:${"d".repeat(32)}`, null), r("6", "recht/b.md", "upload")]);
      const f = (k: string) => l.find((x) => x.schluessel === k)!.loeschbar;
      return f(`upload:${"c".repeat(32)}`) === true && f("recht/a.md") === false && f(`upload:${"d".repeat(32)}`) === false && f("recht/b.md") === false;
    })());

    // d) Vorschau-Schutz beim Loeschen
    const sp8 = vorbestand();
    const up8 = await verarbeiteUpload(eingabe({ dateiname: "d.txt", bytes: bytes(hochladeText) }), { speicher: sp8, einbettung: falscheEinbettung(), jetzt: JETZT });
    const vor8 = abbild(sp8);
    sp8.ereignisse.length = 0;
    pruefe("Loeschen/Vorschau: VERCEL_ENV=preview verweigert das Loeschen, nichts wird gelesen oder geloescht", (await fehlerCode(() => loescheHochgeladenesDokument(up8.quelleId, { speicher: sp8, umgebung: { VERCEL_ENV: "preview" } }))) === "vorschau" && sp8.ereignisse.length === 0 && abbild(sp8) === vor8);
    pruefe("Loeschen/Vorschau: mit WISSEN_UPLOAD_PREVIEW_OK=true ist es erlaubt", (await loescheHochgeladenesDokument(up8.quelleId, { speicher: sp8, umgebung: { VERCEL_ENV: "preview", WISSEN_UPLOAD_PREVIEW_OK: "true" } })).geloescht === up8.chunks);

    // e) Ausfaelle
    const flag = { loeschen: false, begriffe: false };
    const sp9 = falscherSpeicher({ zeilen: skript, begriffe: vorgabeBegriffe }, flag);
    const up9 = await verarbeiteUpload(eingabe({ dateiname: "d.txt", bytes: bytes(hochladeText) }), { speicher: sp9, einbettung: falscheEinbettung(), jetzt: JETZT });
    const vor9 = abbild(sp9);
    flag.loeschen = true;
    pruefe("Loeschen/Ausfall: schlaegt die Loeschanweisung fehl -> loeschen, alles bleibt wie vorher (Zeilen und Gewichte)", (await code(up9.quelleId, sp9)) === "loeschen" && abbild(sp9) === vor9);
    flag.loeschen = false;
    flag.begriffe = true;
    const c9 = await code(up9.quelleId, sp9);
    pruefe("Loeschen/Ausfall: schlagen nur die Gewichte fehl -> gewichte; das Dokument ist weg (kein halbes Dokument), die Gewichte bleiben zu hoch", c9 === "gewichte" && [...sp9.zeilen.values()].every((z) => z.quelle_id !== up9.quelleId) && sp9.zeilen.size === 10);
    flag.begriffe = false;
    const nochmal = await loescheHochgeladenesDokument(up9.quelleId, { speicher: sp9, umgebung: {} });
    pruefe("Loeschen/Ausfall: ein erneutes Loeschen danach meldet 'schon geloescht' und crasht nicht", nochmal.schonWeg);
    const ausfall: WissenSpeicher = { ...falscherSpeicher(), ladeQuellenInfo: async () => { throw new Error("DB weg"); } };
    pruefe("Loeschen/Ausfall: Datenbank beim Lesen nicht erreichbar -> loeschen", (await fehlerCode(() => loescheHochgeladenesDokument(`upload:${"e".repeat(32)}`, { speicher: ausfall, umgebung: {} }))) === "loeschen");

    // f) Gestapelt: df ist immer exakt zurueck; idf der beruehrten Woerter passt zum aktuellen N
    const sp10 = vorbestand();
    const a = await verarbeiteUpload(eingabe({ dateiname: "a.txt", titel: "A", bytes: bytes("Dokument A Beleg Walnuss Archiv Zeppelin") }), { speicher: sp10, einbettung: falscheEinbettung(), jetzt: JETZT });
    const dfVorB = JSON.stringify([...sp10.begriffe].map(([h, v]) => [h, v.df]).sort());
    const b = await verarbeiteUpload(eingabe({ dateiname: "b.txt", titel: "B", bytes: bytes("Dokument B Frist Quarkspeise Kaktus") }), { speicher: sp10, einbettung: falscheEinbettung(), jetzt: JETZT });
    await loescheHochgeladenesDokument(b.quelleId, { speicher: sp10, umgebung: {} });
    const dfNachB = JSON.stringify([...sp10.begriffe].map(([h, v]) => [h, v.df]).sort());
    pruefe("Loeschen/gestapelt: nach Upload A, Upload B, Loeschen B ist df jedes Wortes exakt wie vor B", dfVorB === dfNachB);
    const n10 = sp10.zeilen.size;
    pruefe("Loeschen/gestapelt: Gewichte sind gueltig (0 < df <= N); die beruehrten Woerter passen zum aktuellen N", [...sp10.begriffe.values()].every((v) => v.df > 0 && v.df <= n10) && [...sp10.begriffe.values()].some((v) => v.idf === idf(n10, v.df)));
    await loescheHochgeladenesDokument(a.quelleId, { speicher: sp10, umgebung: {} });
    const dfAlle = (x: Speicherstand) => JSON.stringify({ z: [...x.zeilen.keys()].sort(), b: [...x.begriffe].map(([h, v]) => [h, v.df]).sort() });
    pruefe("Loeschen/gestapelt: nach dem Loeschen beider Dokumente sind Zeilen, Woerter und df des Vorbestands exakt wieder da (idf der nur von B beruehrten Woerter spiegelt dabei das N zwischen A und B, bis der naechste ETL-Lauf alle angleicht)", dfAlle(sp10) === dfAlle(vorbestand()));
  }

  // ---- 11. ETL laesst Uploads stehen ---------------------------------------------------------------
  {
    const etl = lies("scripts/wissen-nach-supabase.ts");
    pruefe("ETL: der Marker kommt aus upload-quelle.ts (keine eigene Kopie)", /import \{ UPLOAD_QUELLE \} from "\.\.\/src\/lib\/wissen\/upload-quelle"/.test(etl) && !/const UPLOAD_QUELLE\s*=/.test(etl));
    pruefe("ETL: --bereinigen liest extra->>quelle und schliesst Uploads vom Loeschen aus", /extra->>quelle/.test(etl) && /!== UPLOAD_QUELLE/.test(etl));
    pruefe("ETL: Uploads zaehlen in die Dokumenthaeufigkeit (N und df) mit", /listen\.push\(sparsevecIndizes\(/.test(etl) && /wortgewichte\(listen\)/.test(etl));
    pruefe("Upload und ETL benutzen denselben Marker", /from "@\/lib\/wissen\/upload-quelle"/.test(lies("src/lib/wissen/hochladen.ts")) && lies("src/lib/wissen/upload-quelle.ts").includes('UPLOAD_QUELLE = "upload"'));
  }

  // ---- 11b. Zeitbudget: vor dem ersten Schreiben aufhoeren ------------------------------------------
  {
    const lang = eingabe({ dateiname: "lang.txt", bytes: bytes(Array.from({ length: 60 }, (_, i) => `Absatz ${i}: ${"Wort".repeat(300)} nummer${i}`).join("\n\n")) });
    const sA = falscherSpeicher();
    const eA = falscheEinbettung();
    let tA = 0;
    let fA: unknown = null;
    try { await verarbeiteUpload(lang, { speicher: sA, einbettung: eA, jetzt: JETZT, jetztMs: () => (tA += 20_000) }); } catch (e) { fA = e; }
    pruefe("Zeitbudget: ist es aufgebraucht, kommt der Fehler zeit (mit der Sekundenzahl) statt eines Abbruchs durch die Plattform", fA instanceof UploadFehler && fA.code === "zeit" && fA.wert === String(ZEITBUDGET_MS / 1000), fA instanceof UploadFehler ? `code=${fA.code} wert=${fA.wert}` : String(fA));
    pruefe("Zeitbudget: es wird vor jedem Einbettungsaufruf geprueft, nach zwei Aufrufen (40 s von 45 s) ist Schluss", eA.aufrufe === 2, `aufrufe=${eA.aufrufe}`);
    pruefe("Zeitbudget: bis dahin wurde NICHTS geschrieben (nur die Dublettenpruefung lief)", sA.zeilen.size === 0 && sA.begriffe.size === 0 && sA.ereignisse.every((x) => x === "findeQuelle"));
    const sB = falscherSpeicher();
    const eB = falscheEinbettung();
    let tB = 0;
    const codeB = await fehlerCode(() => verarbeiteUpload(lang, { speicher: sB, einbettung: eB, jetzt: JETZT, jetztMs: () => (tB += 1), zeitbudgetMs: 0 }));
    pruefe("Zeitbudget: bei Budget 0 bricht der Upload ab, bevor der Dienst ein einziges Mal gefragt wird", codeB === "zeit" && eB.aufrufe === 0 && sB.zeilen.size === 0);
    const sC = falscherSpeicher();
    const codeC = await fehlerCode(() => verarbeiteUpload(eingabe(), { speicher: sC, einbettung: falscheEinbettung(), jetzt: JETZT }));
    pruefe("Zeitbudget: ein normales Dokument ist davon nicht betroffen", codeC === "kein-fehler" && sC.zeilen.size > 0);
    pruefe("Zeitbudget: ZEITBUDGET_MS bleibt unter dem maxDuration des Dashboards (60 s)", ZEITBUDGET_MS < 60_000 && /maxDuration = 60/.test(lies("src/app/[locale]/dashboard/layout.tsx")));
    pruefe("Zeitbudget: die Action kennt den Fehlercode", /zeit: "fehler\.wissenZeit"/.test(aktion));
  }

  // ---- 11c. Gemeinsame Rechenwege (keine zweite Kopie) -------------------------------------------------
  {
    const ohneKommentare = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const rechnung = (pfad: string) => (ohneKommentare(lies(pfad)).match(/Math\.log\(1 \+/g) ?? []).length;
    pruefe("IDF: die Formel steht genau einmal (sparse.ts), nicht in hochladen.ts, loeschen.ts oder dem Adapter", rechnung("src/lib/wissen/sparse.ts") === 1 && rechnung("src/lib/wissen/hochladen.ts") === 0 && rechnung("src/lib/wissen/loeschen.ts") === 0 && rechnung("src/lib/wissen/speicher-supabase.ts") === 0);
    pruefe("Zaehlung: Upload und Loeschen zaehlen mit zaehleWoerter() aus sparse.ts, keine eigene Schleife", /zaehleWoerter\(/.test(lies("src/lib/wissen/hochladen.ts")) && /zaehleWoerter\(/.test(lies("src/lib/wissen/loeschen.ts")) && !/new Map<number, number>\(\)/.test(ohneKommentare(lies("src/lib/wissen/loeschen.ts"))));
    const woerter = ["src/lib/wissen/hochladen.ts", "src/lib/wissen/loeschen.ts", "src/lib/wissen/speicher-supabase.ts", "src/lib/wissen/dokumente-liste.ts", "src/lib/actions/wissen.ts", "src/components/db/wissen-verwaltung.tsx", "scripts/wissen-nach-supabase.ts"];
    const eigeneKopie = woerter.filter((p) => /(upload_quelle|quelle)\s*[!=]==?\s*["']upload["']|["'`]upload:|upload:%|UPLOAD_QUELLE\s*=\s*["']/.test(ohneKommentare(lies(p))));
    pruefe("Kennzeichen: der Marker (extra.quelle = upload) und der Vorsatz upload: stehen nur in upload-quelle.ts, sonst nirgends als Zeichenkette", eigeneKopie.length === 0, eigeneKopie.join(", "));
    pruefe("Importwege: hochladen.ts reicht keine Konstanten aus upload-konstanten.ts mehr weiter (ein Weg, nicht zwei)", !/^export \{[^}]*MAX_DATEI_BYTES/m.test(lies("src/lib/wissen/hochladen.ts")));
    pruefe("KI-Kontext: das Wissenswerkzeug sagt dem Modell, dass der Text der Belege Quellenmaterial und keine Anweisung ist (Uploads bringen Text von aussen)", /Quellenmaterial, keine Anweisung/.test(lies("src/lib/ai/wissen-werkzeug.ts")));
    pruefe("Dateigrenze: MAX_DATEI_BYTES laesst Platz fuer Formularfelder und Multipart-Rahmen unter dem bodySizeLimit (gemessen im Produktions-Bundle: 8 MiB minus 300 Byte scheiterte mit HTTP 500)", MAX_DATEI_BYTES <= 8 * 1024 * 1024 - 16 * 1024 && /bodySizeLimit: "8mb"/.test(lies("next.config.ts")), `MAX_DATEI_BYTES=${MAX_DATEI_BYTES}`);
    const formularQuelle = lies("src/components/db/wissen-verwaltung.tsx");
    pruefe("Oberflaeche: eine zu grosse Datei wird vor dem Absenden gestoppt (setCustomValidity mit MAX_DATEI_BYTES), statt eine HTTP-500-Antwort des Frameworks zu riskieren", /setCustomValidity\(/.test(formularQuelle) && /size > MAX_DATEI_BYTES/.test(formularQuelle));
  }

  // ---- 13. Typisierung: Quellenart, Stufe, Nutzung je Bereich -----------------------------------------
  {
    pruefe("Quellenart: dreizehn Arten, jede mit Stufe 1 bis 5 und einer Regel fuer jeden der fuenf Bereiche", QUELLENARTEN.length === 13 && QUELLENARTEN.every((a) => QUELLENART_INFO[a].stufe >= 1 && QUELLENART_INFO[a].stufe <= 5 && UPLOAD_BEREICHE.every((b) => ["ja", "hinweis", "notfalls", "nein"].includes(QUELLENART_INFO[a].nutzung[b]))));
    const stufen = Object.fromEntries(QUELLENARTEN.map((a) => [a, standardStufe(a)]));
    pruefe("Stufe aus der Quellenart: Rechtsnorm 1, Rechtsprechung und Verwaltungsanweisung 2, Behoerdeninfo und Standard 3, Fachliteratur, Praxisbeitrag, intern 4, alles aus dem Netz und KI 5",
      stufen.rechtsnorm === 1 && stufen.rechtsprechung === 2 && stufen.verwaltungsanweisung === 2 && stufen.behoerdeninfo === 3 && stufen.standard === 3 && stufen.fachliteratur === 4 && stufen.praxisbeitrag === 4 && stufen.intern === 4 &&
        ["nachschlagewerk", "internetquelle", "forum", "internetrecherche", "ki_zusammenfassung"].every((a) => stufen[a] === 5), JSON.stringify(stufen));
    pruefe("Entscheidung Nikos (09.10.2026): Internetquelle, Forum, Internetrecherche und KI-Zusammenfassung sind in JEDEM Bereich nur notfalls nutzbar (kein Verbot mehr, aber nur wenn es nichts Tragendes gibt)",
      (["internetquelle", "forum", "internetrecherche", "ki_zusammenfassung"] as const).every((a) => UPLOAD_BEREICHE.every((b) => nutzungFuer(b, a) === "notfalls")));
    pruefe("Gesetz, Urteil, Verwaltungsanweisung, Behoerdeninfo und Fachliteratur gelten in jedem Bereich uneingeschraenkt", (["rechtsnorm", "rechtsprechung", "verwaltungsanweisung", "behoerdeninfo", "fachliteratur"] as const).every((a) => UPLOAD_BEREICHE.every((b) => nutzungFuer(b, a) === "ja")));
    pruefe("Praxisbeitrag ist in Recht, Steuern und Compliance nur ein Hinweis, in Audit und Risiko uneingeschraenkt", nutzungFuer("recht", "praxisbeitrag") === "hinweis" && nutzungFuer("compliance", "praxisbeitrag") === "hinweis" && nutzungFuer("audit", "praxisbeitrag") === "ja" && nutzungFuer("risiko", "praxisbeitrag") === "ja");
    pruefe("Norm oder Standard (ISO, COSO) traegt in Compliance, Audit und Risiko, ist in Recht und Steuern nur ein Hinweis", nutzungFuer("risiko", "standard") === "ja" && nutzungFuer("audit", "standard") === "ja" && nutzungFuer("recht", "standard") === "hinweis");
    pruefe("Invariante: Keine Quelle der Stufe 5 gilt in Recht, Steuern oder Compliance uneingeschraenkt (ja)", QUELLENARTEN.filter((a) => standardStufe(a) === 5).every((a) => ["recht", "steuer", "compliance"].every((b) => nutzungFuer(b, a) !== "ja")));
    pruefe("Bestand ohne Typisierung (Quellenart leer) gilt wie bisher (ja); ein Korpus-Bereich ohne eigene Regel (amtlich, fachquellen, kernwissen) nimmt die STRENGSTE Regel der Art: Internetquelle bleibt dort Notbehelf, Gesetz ja, Standard Hinweis",
      nutzungFuer("legal", null) === "ja" && nutzungFuer("kernwissen", undefined) === "ja" && nutzungFuer("amtlich", "forum") === "notfalls" && nutzungFuer("fachquellen", "internetquelle") === "notfalls" && nutzungFuer("amtlich", "rechtsnorm") === "ja" && nutzungFuer("fachquellen", "standard") === "hinweis");
    pruefe("Der gespeicherte Bereich legal wird wie recht behandelt", nutzungFuer("legal", "forum") === "notfalls" && nutzungFuer("legal", "praxisbeitrag") === "hinweis");
    pruefe("Wiedervorlage: Internetquelle, Forum, Internetrecherche, KI und Nachschlagewerk nach 12 Monaten, Praxisbeitrag und intern nach 24, Gesetz und Fachliteratur nie",
      pruefenBis("forum", new Date("2026-10-07T10:00:00Z")) === "2027-10-07" && pruefenBis("internetquelle", new Date("2026-10-07T10:00:00Z")) === "2027-10-07" && pruefenBis("praxisbeitrag", new Date("2026-10-07T10:00:00Z")) === "2028-10-07" &&
        pruefenBis("rechtsnorm", new Date("2026-10-07T10:00:00Z")) === null && pruefenBis("fachliteratur", new Date("2026-10-07T10:00:00Z")) === null);
    pruefe("Link Pflicht: Internetquelle und Forum (Herkunftsnachweis), sonst freiwillig", QUELLENARTEN.filter((a) => QUELLENART_INFO[a].urlPflicht).join() === "internetquelle,forum");
    pruefe("Cluster: genau drei (Buecher, Publikationen, Internet-Quelle), jeder mit Beschriftung und Beispielen", CLUSTER.join() === "buecher,publikationen,internet" && CLUSTER.every((c) => !!CLUSTER_INFO[c].label && !!CLUSTER_INFO[c].beispiele));
    pruefe("Cluster: jede Art hat einen typischen Cluster (Vorbelegung), und er ist einer der drei", QUELLENARTEN.every((a) => istCluster(QUELLENART_INFO[a].typischerCluster) && typischerClusterVon(a) === QUELLENART_INFO[a].typischerCluster));
    pruefe("Cluster: typische Zuordnung wie vereinbart (Buecher: Fachliteratur, Nachschlagewerk; Internet: Internetquelle, Forum, Recherche, KI; Rest Publikationen)",
      QUELLENARTEN.filter((a) => typischerClusterVon(a) === "buecher").join() === "fachliteratur,nachschlagewerk" && QUELLENARTEN.filter((a) => typischerClusterVon(a) === "internet").join() === "internetquelle,forum,internetrecherche,ki_zusammenfassung" &&
        QUELLENARTEN.filter((a) => typischerClusterVon(a) === "publikationen").join() === "rechtsnorm,rechtsprechung,verwaltungsanweisung,behoerdeninfo,standard,praxisbeitrag,intern");
    pruefe("Cluster: Art und Cluster sind zwei Achsen: eine Rechtsnorm darf aus dem Internet kommen, aus einem Buch und aus einer Publikation", CLUSTER.every((c) => clusterPasst("rechtsnorm", c)) && CLUSTER.every((c) => clusterPasst("fachliteratur", c)));
    pruefe("Cluster: nur eine Art, die zwingend aus dem Netz stammt (Internetquelle, Forum, Internetrecherche), schliesst Buecher und Publikationen aus",
      QUELLENARTEN.filter((a) => QUELLENART_INFO[a].clusterZwang !== null).join() === "internetquelle,forum,internetrecherche" && ["internetquelle", "forum", "internetrecherche"].every((a) => clusterPasst(a as never, "internet") && !clusterPasst(a as never, "buecher") && !clusterPasst(a as never, "publikationen")));
    pruefe("Cluster: typischerClusterVon kennt nur Arten, Bestand ohne Typisierung hat keinen", typischerClusterVon("forum") === "internet" && typischerClusterVon(null) === null && typischerClusterVon(undefined) === null && typischerClusterVon("unbekannt") === null);
    pruefe("Cluster: istCluster erkennt nur die drei Werte", CLUSTER.every((c) => istCluster(c)) && !istCluster("web") && !istCluster(null) && !istCluster(""));
    pruefe("Cluster: die Spalte kommt mit der Migration 20261125000000, ohne CHECK (wie quellenart)", /add column if not exists cluster text/i.test(lies("supabase/migrations/20261125000000_wissen_cluster_pgvector.sql")) && !/check\s*\(/i.test(lies("supabase/migrations/20261125000000_wissen_cluster_pgvector.sql")));
    // Die Tabelle in der Doku darf der Matrix im Code nicht davonlaufen
    {
      const doku = lies("docs/wissensbasis-supabase.md");
      const zeilenDoku = doku.split(/\r?\n/).filter((l) => /^\| `[a-z_]+` \|/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())).filter((c) => c.length === 10);
      const wort: Record<string, string> = { ja: "ja", Hinweis: "hinweis", Notbehelf: "notfalls", gesperrt: "nein" };
      const abweichend = QUELLENARTEN.filter((a) => {
        const r = zeilenDoku.find((c) => c[0] === `\`${a}\``);
        if (!r) return true;
        const info = QUELLENART_INFO[a];
        const monate = r[8] === "nie" ? null : Number.parseInt(r[8]!, 10);
        return Number(r[2]) !== info.stufe || !UPLOAD_BEREICHE.every((b, i) => wort[r[3 + i]!] === info.nutzung[b]) || monate !== info.pruefMonate || r[9] !== CLUSTER_INFO[info.typischerCluster].label;
      });
      pruefe("Doku: die Tabelle der Quellenarten (Stufe, Nutzung je Bereich, Wiedervorlage, typischer Cluster) stimmt mit quellenart.ts ueberein", abweichend.length === 0 && zeilenDoku.length === QUELLENARTEN.length, abweichend.join(", "));
    }

    const ein = einordnung({ quellenart: "fachliteratur", stufe: 4, nutzung: "ja", textgrundlage: "original", stand: "2026-03-01" });
    pruefe("Einordnung: Art, Stufe mit Name und Stand, ohne Zusatz bei Originaltext und tragender Quelle", ein === "Fachliteratur, Stufe 4 (Fachquelle), Stand 2026-03-01", ein);
    const einH = einordnung({ quellenart: "forum", stufe: 5, nutzung: "hinweis", textgrundlage: "maschinell_uebersetzt", stand: null });
    pruefe("Einordnung: Hinweis und maschinelle Uebersetzung stehen ausdruecklich dabei", /Forum oder Frage-Antwort-Portal/.test(einH) && /nur als Hinweis, nicht geprüft/.test(einH) && /maschinelle Übersetzung/.test(einH), einH);
    pruefe("Einordnung: Bestand ohne Typisierung nennt das ehrlich und behaelt die Stufe", einordnung({ quellenart: null, stufe: 1, nutzung: "ja", textgrundlage: null, stand: null }) === "Quelle ohne Typisierung, Stufe 1 (Primärrecht)");
    pruefe("Stufennamen: wie die bestehende Skala der Suche (1 Primaerrecht ... 5 Presse)", STUFEN_NAMEN[1] === "Primärrecht" && STUFEN_NAMEN[4] === "Fachquelle" && /Presse/.test(STUFEN_NAMEN[5]!));
    pruefe("Beleglage: keine, nur Hinweise, belastbar (Fachquelle), massgeblich (Stufe 1 bis 3, uneingeschraenkt)",
      belegLage([]) === "keine" && belegLage([{ stufe: 5, nutzung: "hinweis" }]) === "nur_hinweise" && belegLage([{ stufe: 4, nutzung: "ja" }, { stufe: 5, nutzung: "hinweis" }]) === "belastbar" &&
        belegLage([{ stufe: 1, nutzung: "ja" }]) === "massgeblich" && belegLage([{ stufe: 3, nutzung: "hinweis" }]) === "nur_hinweise");
    pruefe("normalisiereUrl: leer ist null, https und http gehen, ftp, javascript und Text nicht", normalisiereUrl("") === null && normalisiereUrl("  ") === null && normalisiereUrl("https://beispiel.de/a?b=1") === "https://beispiel.de/a?b=1" &&
      ["ftp://x.de", "javascript:alert(1)", "kein link", "https://" + "a".repeat(500)].every((u) => { try { normalisiereUrl(u); return false; } catch (e) { return e instanceof UploadFehler && e.code === "urlUngueltig"; } }));
  }

  // ---- 14. Upload mit Quellenart und Vier-Augen-Pruefung --------------------------------------------
  {
    const s = falscherSpeicher();
    const e = falscheEinbettung();
    const d = { speicher: s, einbettung: e, jetzt: JETZT };
    const erg = await verarbeiteUpload(eingabe({ quellenart: "fachliteratur", titel: "Fachbuch Eiche", bytes: bytes("Das Fachbuch Eiche erklaert die Rueckstellung Nilpferd im Jahresabschluss."), dateiname: "eiche.txt" }), d);
    const z0 = [...s.zeilen.values()][0]!;
    pruefe("Upload: Quellenart, Textgrundlage original und Stufe 4 stehen in der Zeile, der Status ist UNGEPRUEFT ohne Wiedervorlage", z0.quellenart === "fachliteratur" && z0.textgrundlage === "original" && z0.autoritaetsstufe === 4 && z0.pruefstatus === "ungeprueft" && z0.pruefen_bis === null && z0.geprueft_von === null && erg.autoritaetsstufe === 4);
    pruefe("Upload: Pflichtfeld Quellenart fehlt oder ist unbekannt -> eingabe, nichts gelesen oder geschrieben", (await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }))) === "eingabe" && (await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "blog" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }))) === "eingabe");
    pruefe("Upload: unbekannte Textgrundlage -> eingabe", (await fehlerCode(() => verarbeiteUpload(eingabe({ textgrundlage: "geraten" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }))) === "eingabe");

    // Cluster beim Upload: der Weg, unabhaengig von der Art
    {
      const sc = falscherSpeicher();
      const ec = falscheEinbettung();
      const dc = { speicher: sc, einbettung: ec, jetzt: JETZT };
      const ergC = await verarbeiteUpload(eingabe({ quellenart: "rechtsnorm", cluster: "internet", titel: "Gesetz von der Regierungsseite", url: "https://adilet.zan.kz/x", bytes: bytes("Das Gesetz von der Regierungsseite regelt die Rueckstellung Walross im Jahresabschluss."), dateiname: "gesetz.txt" }), dc);
      const zc = [...sc.zeilen.values()][0]!;
      pruefe("Cluster: eine Rechtsnorm von einer Regierungsseite hat Quellenart rechtsnorm, Cluster internet und Stufe 1 (zwei Achsen)", zc.quellenart === "rechtsnorm" && zc.cluster === "internet" && zc.autoritaetsstufe === 1 && ergC.cluster === "internet");
      const sd = falscherSpeicher();
      await verarbeiteUpload(eingabe({ quellenart: "fachliteratur", titel: "Fachbuch Linde", bytes: bytes("Das Fachbuch Linde erklaert die Rueckstellung Seeadler im Jahresabschluss."), dateiname: "linde.txt" }), { speicher: sd, einbettung: falscheEinbettung(), jetzt: JETZT });
      pruefe("Cluster: ohne Angabe gilt der typische Cluster der Art (Fachliteratur: Buecher)", [...sd.zeilen.values()][0]!.cluster === "buecher");
      const codeF = await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "forum", cluster: "buecher", bereich: "risiko", url: "https://forum.beispiel.de/t/1" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }));
      pruefe("Cluster: ein Forum in Buecher passt nicht -> clusterPasstNicht, nichts gelesen oder geschrieben", codeF === "clusterPasstNicht");
      const codeU = await fehlerCode(() => verarbeiteUpload(eingabe({ cluster: "web" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }));
      pruefe("Cluster: ein unbekannter Cluster -> eingabe", codeU === "eingabe");
    }

    // Entscheidung Nikos (09.10.2026): ungesicherte Internetquellen sind auch fuer Recht, Steuern und Compliance erlaubt, aber nur als Notbehelf
    for (const art of ["internetquelle", "forum", "internetrecherche", "ki_zusammenfassung"]) {
      for (const bereich of ["recht", "steuer", "compliance"]) {
        const sg = falscherSpeicher();
        const ergI = await verarbeiteUpload(eingabe({ quellenart: art, bereich, url: "https://beispiel.de/x", titel: `Internet ${art} ${bereich}`, bytes: bytes(`Der Beitrag ${art} ${bereich} erklaert die Rueckstellung Kormoran im Jahresabschluss.`), dateiname: `i-${art}-${bereich}.txt` }), { speicher: sg, einbettung: falscheEinbettung(), jetzt: JETZT });
        pruefe(`Quellenart ${art} im Bereich ${bereich} ist erlaubt (nur Notbehelf), beginnt ungeprueft und hat Stufe 5`, ergI.quellenart === art && [...sg.zeilen.values()].every((z) => z.quellenart === art && z.autoritaetsstufe === 5 && z.pruefstatus === "ungeprueft") && nutzungFuer(bereich, art) === "notfalls");
      }
    }
    pruefe("Quellenart Internetquelle im Bereich Recht ohne Link -> urlFehlt (der Herkunftsnachweis bleibt Pflicht)", (await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "internetquelle", bereich: "recht" }), { speicher: falscherSpeicher(), einbettung: falscheEinbettung(), jetzt: JETZT }))) === "urlFehlt");
    {
      // Der Sperrmechanismus (Nutzung nein) bleibt fuer kuenftige Regeln bestehen: hier mit einer voruebergehend verschaerften Regel geprueft.
      const alt = QUELLENART_INFO.forum.nutzung.recht;
      QUELLENART_INFO.forum.nutzung.recht = "nein";
      try {
        const sg = falscherSpeicher();
        const eg = falscheEinbettung();
        const code = await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "recht", url: "https://beispiel.de/x" }), { speicher: sg, einbettung: eg, jetzt: JETZT }));
        pruefe("Sperrmechanismus: eine Art mit Nutzung nein im Bereich -> quellenartGesperrt, nichts gelesen, eingebettet oder geschrieben", code === "quellenartGesperrt" && eg.aufrufe === 0 && sg.zeilen.size === 0 && sg.ereignisse.length === 0);
      } finally {
        QUELLENART_INFO.forum.nutzung.recht = alt;
      }
    }
    // Fuer Risiko: erlaubt, aber nur mit Link, nur als Hinweis
    const fr = falscherSpeicher();
    const dr = { speicher: fr, einbettung: falscheEinbettung(), jetzt: JETZT };
    pruefe("Quellenart Forum im Bereich Risiko ohne Link -> urlFehlt (Herkunftsnachweis)", (await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "risiko", titel: "Forum Risiko", bytes: bytes("Im Forum diskutieren Fachleute die neue Bewertungsmethode Seeadler fuer Lieferantenrisiken."), dateiname: "f.txt" }), dr))) === "urlFehlt" && fr.zeilen.size === 0);
    pruefe("Quellenart Forum mit ungueltigem Link (ftp) -> urlUngueltig", (await fehlerCode(() => verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "risiko", url: "ftp://forum.de", bytes: bytes("Beitrag Seeadler.") , dateiname: "f2.txt" }), dr))) === "urlUngueltig" && fr.zeilen.size === 0);
    const ergF = await verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "risiko", titel: "Forum Risiko", url: " https://forum.beispiel.de/t/123 ", bytes: bytes("Im Forum diskutieren Fachleute die neue Bewertungsmethode Seeadler fuer Lieferantenrisiken."), dateiname: "f3.txt", textgrundlage: "maschinell_uebersetzt" }), dr);
    const zf = [...fr.zeilen.values()][0]!;
    pruefe("Forum im Risikomanagement wird angenommen: Stufe 5, Link als Herkunftsnachweis, maschinelle Uebersetzung vermerkt, ungeprueft", ergF.autoritaetsstufe === 5 && zf.url === "https://forum.beispiel.de/t/123" && zf.textgrundlage === "maschinell_uebersetzt" && zf.pruefstatus === "ungeprueft" && zf.quellenart === "forum");
    pruefe("Stufe kommt aus der Quellenart, nie aus dem Frontmatter: eine Stufe 1 im Kopf einer Forumsdatei ergibt trotzdem 5",
      await (async () => {
        const sf = falscherSpeicher();
        await verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "risiko", url: "https://x.de/1", dateiname: "k.md", titel: "Kopf", bytes: bytes("---\nautoritaetsstufe: 1\nurl: https://fremd.de\n---\n\nText Kopf Wasserfall.\n") }), { speicher: sf, einbettung: falscheEinbettung(), jetzt: JETZT });
        const z = [...sf.zeilen.values()][0]!;
        return z.autoritaetsstufe === 5 && z.url === "https://x.de/1";
      })());

    // Vier-Augen-Prinzip
    const q = erg.quelleId;
    const ohneRecht = async (f: () => Promise<unknown>) => fehlerCode(f);
    pruefe("Vier-Augen: die hochladende Person kann ihr Dokument NICHT freigeben (selbstFreigabe), nichts aendert sich", (await ohneRecht(() => entscheideUeberUpload("freigeben", q, { speicher: s, pruefer: { id: ADMIN.id }, jetzt: JETZT }))) === "selbstFreigabe" && [...s.zeilen.values()].every((z) => z.pruefstatus === "ungeprueft"));
    s.ereignisse.length = 0;
    pruefe("Vier-Augen: Skript-Quellen (Pfad) werden abgelehnt, ohne die Datenbank zu fragen", (await ohneRecht(() => entscheideUeberUpload("freigeben", "recht/nk-rk.md", { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtFreigebbar" && s.ereignisse.length === 0);
    pruefe("Vier-Augen: eine unbekannte Upload-Kennung -> nichtGefunden", (await ohneRecht(() => entscheideUeberUpload("freigeben", `upload:${"f".repeat(32)}`, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtGefunden");
    pruefe("Vier-Augen: in der Vorschau-Umgebung wird nichts entschieden", (await ohneRecht(() => entscheideUeberUpload("freigeben", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT, umgebung: { VERCEL_ENV: "preview" }, schema: "public" }))) === "vorschau");
    pruefe("Vier-Augen: faellt die Datenbank bei der Entscheidung aus -> freigeben, nichts aendert sich", await (async () => {
      const sx = falscherSpeicher({}, { entscheiden: true });
      const r = await verarbeiteUpload(eingabe({ titel: "Ausfall", bytes: bytes("Ausfall Test Buchsbaum."), dateiname: "a.txt" }), { speicher: sx, einbettung: falscheEinbettung(), jetzt: JETZT });
      return (await ohneRecht(() => entscheideUeberUpload("freigeben", r.quelleId, { speicher: sx, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "freigeben" && [...sx.zeilen.values()].every((z) => z.pruefstatus === "ungeprueft");
    })());
    pruefe("Waechter der Datenbank (Nachbau): selbst wenn die Anwendung die Pruefung vergaesse, lehnt der Speicher die Freigabe durch die hochladende Person ab", await (async () => {
      try { await s.entscheide(q, { status: "freigegeben", pruefer: ADMIN.id, zeitpunkt: JETZT().toISOString(), pruefenBis: null }); return false; } catch { return [...s.zeilen.values()].every((z) => z.pruefstatus === "ungeprueft"); }
    })());

    const frei = await entscheideUeberUpload("freigeben", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT });
    const nachFreigabe = [...s.zeilen.values()].filter((z) => z.quelle_id === q);
    pruefe("Freigabe durch eine zweite Person: alle Abschnitte freigegeben, geprueft_von und geprueft_am gesetzt, Fachliteratur ohne Wiedervorlage", nachFreigabe.length === frei.abschnitte && nachFreigabe.every((z) => z.pruefstatus === "freigegeben" && z.geprueft_von === ZWEITE_PERSON && z.geprueft_am === JETZT().toISOString() && z.pruefen_bis === null) && frei.pruefenBis === null && frei.titel === "Fachbuch Eiche");
    pruefe("Entschieden ist entschieden: eine zweite Freigabe oder eine Ablehnung danach -> nichtPruefbar", (await ohneRecht(() => entscheideUeberUpload("freigeben", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtPruefbar" && (await ohneRecht(() => entscheideUeberUpload("ablehnen", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtPruefbar");

    // Ablehnen
    const sa = falscherSpeicher();
    const ra = await verarbeiteUpload(eingabe({ titel: "Abgelehnt", bytes: bytes("Ablehnung Test Kastanie."), dateiname: "ab.txt" }), { speicher: sa, einbettung: falscheEinbettung(), jetzt: JETZT });
    const abg = await entscheideUeberUpload("ablehnen", ra.quelleId, { speicher: sa, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT });
    pruefe("Ablehnen: Status abgelehnt, nicht durchsuchbar, eine spaetere Freigabe ist ausgeschlossen", abg.abschnitte > 0 && [...sa.zeilen.values()].every((z) => z.pruefstatus === "abgelehnt") && (await ohneRecht(() => entscheideUeberUpload("freigeben", ra.quelleId, { speicher: sa, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtPruefbar");
    const sb = falscherSpeicher();
    const rb = await verarbeiteUpload(eingabe({ titel: "Zurueckgezogen", bytes: bytes("Zurueckziehen Test Mispel."), dateiname: "zu.txt" }), { speicher: sb, einbettung: falscheEinbettung(), jetzt: JETZT });
    await entscheideUeberUpload("ablehnen", rb.quelleId, { speicher: sb, pruefer: { id: ADMIN.id }, jetzt: JETZT });
    pruefe("Die hochladende Person darf ihr eigenes Dokument zurueckziehen (ablehnen), das ist keine Freigabe", [...sb.zeilen.values()].every((z) => z.pruefstatus === "abgelehnt"));

    // Wiedervorlage fuer Internet und Forum
    const sw = falscherSpeicher();
    const rw = await verarbeiteUpload(eingabe({ quellenart: "forum", bereich: "risiko", url: "https://forum.beispiel.de/t/9", titel: "Forum Wiedervorlage", bytes: bytes("Forum Wiedervorlage Methode Pelikan fuer Risikobewertung."), dateiname: "w.txt" }), { speicher: sw, einbettung: falscheEinbettung(), jetzt: JETZT });
    const fw = await entscheideUeberUpload("freigeben", rw.quelleId, { speicher: sw, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT });
    pruefe("Freigabe eines Forumsbeitrags setzt die Wiedervorlage auf zwoelf Monate", fw.pruefenBis === "2027-10-05" && [...sw.zeilen.values()].every((z) => z.pruefen_bis === "2027-10-05"));
    const spaeter = () => new Date("2027-10-06T08:00:00Z");
    pruefe("Verlaengern vor Ablauf der Wiedervorlage -> nichtPruefbar", (await ohneRecht(() => entscheideUeberUpload("verlaengern", rw.quelleId, { speicher: sw, pruefer: { id: ZWEITE_PERSON }, jetzt: JETZT }))) === "nichtPruefbar");
    pruefe("Verlaengern nach Ablauf durch die hochladende Person -> selbstFreigabe", (await ohneRecht(() => entscheideUeberUpload("verlaengern", rw.quelleId, { speicher: sw, pruefer: { id: ADMIN.id }, jetzt: spaeter }))) === "selbstFreigabe");
    const verl = await entscheideUeberUpload("verlaengern", rw.quelleId, { speicher: sw, pruefer: { id: ZWEITE_PERSON }, jetzt: spaeter });
    pruefe("Verlaengern nach Ablauf durch eine zweite Person: neue Wiedervorlage in zwoelf Monaten", verl.pruefenBis === "2028-10-06" && [...sw.zeilen.values()].every((z) => z.pruefen_bis === "2028-10-06"));
    pruefe("Eine Quelle ohne Ablauf (Fachliteratur) laesst sich nicht verlaengern -> nichtPruefbar", (await ohneRecht(() => entscheideUeberUpload("verlaengern", q, { speicher: s, pruefer: { id: ZWEITE_PERSON }, jetzt: spaeter }))) === "nichtPruefbar");

    // Suche: ungeprueft und abgelaufen findet niemand
    const sucheNach = async (sp: Speicherstand, rolle: Role, frage: string, heute: string) => sucheWissen({ frage }, rolle, { einbettung: falscheEinbettung(), supabase: falscheSuche(sp, rolle, heute) });
    const ungeprueft = falscherSpeicher();
    await verarbeiteUpload(eingabe({ rollen: ["buchhaltung"], titel: "Wartet", bytes: bytes("Dokument Wartet Schneeglockchen Rueckstellung."), dateiname: "wa.txt" }), { speicher: ungeprueft, einbettung: falscheEinbettung(), jetzt: JETZT });
    pruefe("Suche: ungepruefte Dokumente findet niemand (Admin, Buchhaltung)", (await sucheNach(ungeprueft, "admin", "Schneeglockchen Rueckstellung", "2026-10-06")).belege.length === 0 && (await sucheNach(ungeprueft, "buchhaltung", "Schneeglockchen Rueckstellung", "2026-10-06")).belege.length === 0);
    const mitAblauf = falscherSpeicher({ zeilen: [...sw.zeilen.values()].map((z) => ({ ...z, pruefen_bis: "2027-10-05" })) });
    const vor = await sucheNach(mitAblauf, "admin", "Wiedervorlage Methode Pelikan Risikobewertung", "2027-10-05");
    const nach = await sucheNach(mitAblauf, "admin", "Wiedervorlage Methode Pelikan Risikobewertung", "2027-10-06");
    pruefe("Suche: bis zum Tag der Wiedervorlage wird die Quelle gefunden, am Tag danach nicht mehr", vor.belege.length > 0 && nach.belege.length === 0);
    pruefe("Der Aktionspfad: wissenDokumentPruefen prueft die Berechtigung zuerst und gibt bei fehlendem Recht zugriffsFehler zurueck", await (async () => {
      const quelle = readFileSync("src/lib/actions/wissen.ts", "utf8");
      const rumpf = quelle.slice(quelle.indexOf("export async function wissenDokumentPruefen"));
      const gate = rumpf.indexOf('requirePermission("ki_assistent", "manage")');
      const erster = Math.min(...["formData.get(", "text(formData", "entscheideUeberUpload(", "createServiceRoleClient()"].map((x) => { const i = rumpf.indexOf(x); return i < 0 ? Infinity : i; }));
      return gate > 0 && gate < erster && /catch \(error\) \{\s*return zugriffsFehler\(error\);/.test(rumpf);
    })());
    pruefe("Der Aktionspfad: Vorschau und Liste pruefen ebenfalls zuerst das Recht, die Vorschau nur fuer Upload-Kennungen", await (async () => {
      const quelle = readFileSync("src/lib/actions/wissen.ts", "utf8");
      const vorschau = quelle.slice(quelle.indexOf("export async function wissenDokumentVorschau"), quelle.indexOf("const PRUEF_PROTOKOLL"));
      return vorschau.indexOf("requirePermission") > 0 && vorschau.indexOf("requirePermission") < vorschau.indexOf("createServiceRoleClient") && /istUploadQuelleId\(quelleId\)/.test(vorschau);
    })());
    pruefe("Der Aktionspfad: Freigabe, Ablehnung und Verlaengerung stehen im Protokoll (wer, was, wann)", /wissen\.freigegeben/.test(readFileSync("src/lib/actions/wissen.ts", "utf8")) && /wissen\.abgelehnt/.test(readFileSync("src/lib/actions/wissen.ts", "utf8")) && /wissen\.verlaengert/.test(readFileSync("src/lib/actions/wissen.ts", "utf8")));

    // Liste
    const liste = gruppiereWissenDokumente([
      { id: "1", quelle_id: "upload:" + "a".repeat(32), pfad: null, titel: "Wartend", bereich: "legal", rollen: ["admin"], eingelesen_am: "2026-10-01", upload_quelle: "upload", hochgeladen_von: "A", hochgeladen_von_id: ADMIN.id, quellenart: "fachliteratur", pruefstatus: "ungeprueft", pruefen_bis: null, autoritaetsstufe: 4, url: null },
      { id: "2", quelle_id: "upload:" + "b".repeat(32), pfad: null, titel: "Abgelaufen", bereich: "risiko", rollen: ["admin"], eingelesen_am: "2026-09-01", upload_quelle: "upload", hochgeladen_von: "A", hochgeladen_von_id: ADMIN.id, quellenart: "forum", pruefstatus: "freigegeben", pruefen_bis: "2026-09-30", autoritaetsstufe: 5, url: "https://f.de" },
      { id: "3", quelle_id: "upload:" + "c".repeat(32), pfad: null, titel: "Aktuell", bereich: "risiko", rollen: ["admin"], eingelesen_am: "2026-10-05", upload_quelle: "upload", hochgeladen_von: "A", hochgeladen_von_id: ADMIN.id, quellenart: "praxisbeitrag", pruefstatus: "freigegeben", pruefen_bis: "2028-10-05", autoritaetsstufe: 4, url: null },
      { id: "4", quelle_id: "recht/nk.md", pfad: "recht/nk.md", titel: "Gesetz", bereich: "legal", rollen: ["admin"], eingelesen_am: "2026-09-19", upload_quelle: null, hochgeladen_von: null },
    ], "2026-10-07");
    const lw = liste.find((x) => x.titel === "Wartend")!;
    const la = liste.find((x) => x.titel === "Abgelaufen")!;
    pruefe("Liste: ungeprueft und abgelaufen stehen oben (sie warten auf eine Entscheidung), das Skript-Dokument ohne Typisierung ist freigegeben", liste.slice(0, 2).map((x) => x.titel).sort().join() === "Abgelaufen,Wartend" && liste.find((x) => x.titel === "Gesetz")!.pruefstatus === "freigegeben");
    pruefe("Liste: Status, Abgelaufen-Kennzeichen, Nutzung (Forum im Risiko = notfalls) und Hochladende (profiles.id) sind je Dokument berechnet", lw.pruefstatus === "ungeprueft" && !lw.abgelaufen && la.abgelaufen && la.nutzung === "notfalls" && la.hochgeladenVonId === ADMIN.id && liste.find((x) => x.titel === "Aktuell")!.abgelaufen === false);
  }

  // ---- 15. Der Assistent haelt die Typisierung ein ---------------------------------------------------
  {
    const zeile = (id: string, titel: string, text: string, bereich: string, quellenart: string | null, stufe: number | null, extra: Partial<ChunkZeile> = {}): ChunkZeile => ({
      id, chunk_id: id, quelle_id: `recht/${id}.md`, norm_id: null, sprache: "de", autoritaetsstufe: stufe, rechtsstelle: null, titel, gueltig_ab: null, gueltig_bis: null, ist_ueberholt: false, ersetzt_durch: null,
      abgerufen_am: "2026-09-01", url: null, konfidenz: null, pfad: `recht/${id}.md`, bereich, teil: 1, teile: 1, kontext: titel, text, rollen: ["admin", "buchhaltung"], eingelesen_am: "2026-09-01", embed_modell: "synthetisch-bge-m3",
      extra: {}, quellenart: quellenart as string, cluster: "internet", textgrundlage: "original", pruefstatus: "freigegeben", pruefen_bis: null, geprueft_von: null, geprueft_am: null,
      dense: `[${vektorVon(text).join(",")}]`, sparse: alsSparsevec(sparseDokument(text)), ...extra,
    });
    const frage = "Verjaehrungsfrist Pfirsichkernen Pelikan";
    const mitDokumenten = (zeilen: ChunkZeile[]) => falscherSpeicher({ zeilen });
    const suche = (sp: Speicherstand, rolle: Role = "admin") => sucheWissen({ frage }, rolle, { einbettung: falscheEinbettung(), supabase: falscheSuche(sp, rolle) });

    // Recht: ein Gesetz und ein Forumsbeitrag; das Forum darf in Recht nicht einmal entstehen, wird hier aber direkt in den Bestand gelegt
    const sg = mitDokumenten([
      zeile("gesetz", "Gesetz Pfirsich", "Die Verjaehrungsfrist fuer Pfirsichkernen Pelikan betraegt drei Jahre.", "legal", "rechtsnorm", 1),
      zeile("lexikon", "Lexikon Pfirsich", "Verjaehrungsfrist Pfirsichkernen Pelikan im Lexikon erklaert.", "legal", "nachschlagewerk", 5),
      zeile("forum", "Forum Pfirsich", "Verjaehrungsfrist Pfirsichkernen Pelikan laut Forum zwei Jahre.", "legal", "forum", 5),
    ]);
    const r1 = await suche(sg);
    pruefe("Assistent/Recht: ein Forumsbeitrag (Notbehelf) kommt nicht, solange es einen tragenden Beleg gibt (hier das Gesetz)", !r1.belege.some((b) => b.titel === "Forum Pfirsich"));
    pruefe("Assistent/Recht: das Gesetz steht vor dem Nachschlagewerk, dieses ist ein Hinweis (nutzung hinweis), die Lage ist massgeblich", r1.belege[0]?.titel === "Gesetz Pfirsich" && r1.belege.find((b) => b.titel === "Lexikon Pfirsich")?.nutzung === "hinweis" && r1.lage === "massgeblich");
    const gesetzBeleg = r1.belege[0]!;
    pruefe("Assistent: jeder Beleg traegt die Einordnung im Klartext (Art, Stufe mit Name, Stand), vom Code berechnet", gesetzBeleg.quellenart === "rechtsnorm" && gesetzBeleg.einordnung === "Rechtsnorm, Stufe 1 (Primärrecht), Stand 2026-09-01", gesetzBeleg.einordnung);
    pruefe("Assistent: der Hinweisbeleg sagt es ausdruecklich (nur als Hinweis, nicht geprueft)", /nur als Hinweis, nicht geprüft/.test(r1.belege.find((b) => b.titel === "Lexikon Pfirsich")!.einordnung));

    // Nur Hinweise
    const sh = mitDokumenten([zeile("lex", "Nur Lexikon", "Verjaehrungsfrist Pfirsichkernen Pelikan im Lexikon.", "legal", "nachschlagewerk", 5)]);
    const r2 = await suche(sh);
    pruefe("Assistent: gibt es nur Hinweise, meldet die Suche die Lage nur_hinweise und das Werkzeug verlangt die ehrliche Aussage 'keine belastbare Quelle'", r2.lage === "nur_hinweise" && /nur_hinweise/.test(hinweisFuerLage(r2.lage, true)) && /keine belastbare Quelle/.test(hinweisFuerLage(r2.lage, true)));

    // Reservierte Plaetze: ein Hinweis der Stufe 3 (Norm in einer Rechtsfrage) belegt keinen
    const sr = mitDokumenten([
      zeile("iso", "ISO Pfirsich", "Verjaehrungsfrist Pfirsichkernen Pelikan nach ISO Standard.", "legal", "standard", 3),
      zeile("buch", "Fachbuch Pfirsich", "Verjaehrungsfrist Pfirsichkernen Pelikan im Fachbuch.", "legal", "fachliteratur", 4),
    ]);
    const r3 = await suche(sr);
    pruefe("Assistent: ein Hinweis der Stufe 3 belegt keinen der reservierten Plaetze und steht hinter den tragenden Belegen", r3.belege[0]?.titel === "Fachbuch Pfirsich" && r3.belege.at(-1)?.titel === "ISO Pfirsich" && r3.lage === "belastbar");

    // Risiko: Forum als Hinweis erlaubt, hoechstens zwei Hinweise
    const srisiko = mitDokumenten([
      zeile("iso31000", "ISO 31000", "Verjaehrungsfrist Pfirsichkernen Pelikan Risikobewertung nach ISO 31000.", "risiko", "standard", 3),
      ...[1, 2, 3].map((i) => zeile(`forum${i}`, `Forum Risiko ${i}`, `Verjaehrungsfrist Pfirsichkernen Pelikan Methode ${i} im Forum.`, "risiko", "forum", 5)),
    ]);
    const r4 = await suche(srisiko);
    pruefe("Assistent/Risiko: der Standard traegt, Forumsbeitraege (Notbehelf) kommen NICHT dazu, solange es einen tragenden Beleg gibt", r4.belege[0]?.titel === "ISO 31000" && r4.belege.every((b) => b.nutzung !== "notfalls") && r4.lage === "massgeblich");

    // Nur ungesicherte Internetquellen: erst dann kommen sie, hoechstens drei, und die Lage sagt es
    const snur = mitDokumenten([
      ...[1, 2, 3, 4].map((i) => zeile(`netz${i}`, `Erfahrungsbericht ${i}`, `Verjaehrungsfrist Pfirsichkernen Pelikan Erfahrung ${i} im Netz.`, "legal", "internetquelle", 5)),
    ]);
    const r6 = await suche(snur);
    pruefe("Assistent/Notbehelf: gibt es NUR ungesicherte Internetquellen, kommen sie (hoechstens drei) mit Nutzung notfalls und der Lage nur_unsichere", r6.belege.length === 3 && r6.belege.every((b) => b.nutzung === "notfalls") && r6.lage === "nur_unsichere");
    pruefe("Assistent/Notbehelf: die Einordnung nennt es im Klartext (ungesicherte Internetquelle, keine amtliche Quelle, nur als Notbehelf)", /Internetquelle, Stufe 5 \(Presse und ungesicherte Quellen\)/.test(r6.belege[0]!.einordnung) && /ungesicherte Internetquelle, keine amtliche Quelle, nur als Notbehelf/.test(r6.belege[0]!.einordnung), r6.belege[0]!.einordnung);
    pruefe("Assistent/Notbehelf: das Werkzeug verlangt den Hinweis gleich zu Beginn der Antwort (keine offizielle staatliche Quelle, nur Internetquellen, nie als Tatsache)", /nur_unsichere/.test(hinweisFuerLage(r6.lage, false, true)) && /keine offizielle staatliche Quelle/.test(hinweisFuerLage(r6.lage, false, true)) && /Beginne die Antwort/.test(hinweisFuerLage(r6.lage, false, true)) && /nie als Tatsache/.test(hinweisFuerLage(r6.lage, false, true)));
    pruefe("Assistent/Notbehelf: Belege mit nutzung notfalls werden in jeder Lage als Internetquelle gekennzeichnet (auch neben Hinweisen)", /nutzung notfalls/.test(hinweisFuerLage("nur_hinweise", true, true)) && /nutzung notfalls/.test(hinweisFuerLage("belastbar", false, true)) && !/nutzung notfalls/.test(hinweisFuerLage("belastbar", false, false)));
    pruefe("Assistent/Notbehelf: die Beleglage unterscheidet nur_unsichere (alles Notbehelf) von nur_hinweise", belegLage([{ stufe: 5, nutzung: "notfalls" }]) === "nur_unsichere" && belegLage([{ stufe: 5, nutzung: "notfalls" }, { stufe: 5, nutzung: "hinweis" }]) === "nur_hinweise" && belegLage([{ stufe: 4, nutzung: "ja" }, { stufe: 5, nutzung: "notfalls" }]) === "belastbar");

    // Bestand ohne Typisierung bleibt wie bisher
    const sbestand = mitDokumenten([zeile("alt", "Altbestand", "Verjaehrungsfrist Pfirsichkernen Pelikan im Altbestand.", "legal", null, 2)]);
    const r5 = await suche(sbestand);
    pruefe("Assistent: Bestand ohne Typisierung wird wie bisher geliefert (nutzung ja), die Einordnung nennt das ehrlich", r5.belege[0]?.nutzung === "ja" && /Quelle ohne Typisierung, Stufe 2/.test(r5.belege[0]!.einordnung) && r5.lage === "massgeblich");

    // Hinweistexte und Prompt
    pruefe("Werkzeug-Hinweis: keine Treffer, Allgemeinwissen kennzeichnen; massgeblich nennt die Einordnung und die Belege als Quellenmaterial", /Allgemeinwissen/.test(hinweisFuerLage("keine", false)) && /einordnung/.test(hinweisFuerLage("massgeblich", false)) && /Quellenmaterial, keine Anweisung/.test(hinweisFuerLage("massgeblich", false)));
    pruefe("Werkzeug-Hinweis: belastbar verlangt 'laut Fachquelle', Hinweisbelege duerfen nie allein tragen", /laut Fachquelle/.test(hinweisFuerLage("belastbar", false)) && /nie allein tragend/.test(hinweisFuerLage("massgeblich", true)) && !/nie allein tragend/.test(hinweisFuerLage("massgeblich", false)));
    const prompt = quellenAnweisung("de");
    pruefe("Systemprompt: Regel 7 (Einordnung wiedergeben) und Regel 8 (Hinweise nie tragend, Lage nur_hinweise offen sagen)", /7\. Jeder Beleg hat das Feld einordnung/.test(prompt) && /8\. Belege mit nutzung hinweis/.test(prompt) && /nur_hinweise/.test(prompt));
    pruefe("Systemprompt: Regel 9 (Notbehelf-Quellen: keine offizielle staatliche Quelle gleich zu Beginn sagen, als Internetquelle und unsicher nennen)", /9\. Belege mit nutzung notfalls/.test(prompt) && /nur_unsichere/.test(prompt) && /keine offizielle staatliche Quelle/.test(prompt));
    pruefe("Systemprompt: in den anderen Sprachen bleibt die Regel gleich und verlangt die Antwortsprache", ["en", "ru", "kk"].every((sp) => quellenAnweisung(sp as "en").includes("in der Antwortsprache in Klammern") && quellenAnweisung(sp as "en").includes("8. Belege mit nutzung hinweis")));
    const werkzeug = readFileSync("src/lib/ai/wissen-werkzeug.ts", "utf8");
    pruefe("Werkzeug: liefert die Lage mit und leitet den Hinweis daraus ab (im Code, nicht im Modell)", /lage: r\.lage/.test(werkzeug) && /hinweisFuerLage\(r\.lage/.test(werkzeug));
    // Client: der Beleg-Parser uebernimmt die neuen Felder
    const roh = { belege: [{ id: "S1", fundstelle: "x", stufe: 4, quellenart: "forum", textgrundlage: "maschinell_uebersetzt", nutzung: "hinweis", einordnung: "Forum ...", text: "t", bereich: "risiko" }, { id: "S2", fundstelle: "y", stufe: 1, nutzung: "ja" }] };
    const geparst = belegeAusErgebnis(roh);
    pruefe("Chat: der Beleg-Parser liest Quellenart, Textgrundlage, Nutzung und Einordnung; ohne Angabe gilt nutzung ja", geparst[0]?.quellenart === "forum" && geparst[0]?.nutzung === "hinweis" && geparst[0]?.einordnung === "Forum ..." && geparst[1]?.nutzung === "ja" && geparst[1]?.quellenart === null);
    const karte = readFileSync("src/components/ki/ki-quellen.tsx", "utf8");
    pruefe("Chat: die Quellenkarte zeigt die Quellenart, warnt bei nutzung hinweis und zaehlt Hinweise nicht als Stuetze", /beleg\.quellenart/.test(karte) && /nurHinweis/.test(karte) && /b\.nutzung !== "hinweis"/.test(karte) && /quellen\.nurHinweise/.test(karte));
  }

  // ---- 16. Texte der Typisierung in allen Sprachen --------------------------------------------------
  for (const loc of ["de", "en", "ru", "kk"]) {
    const m = JSON.parse(lies(`src/messages/${loc}.json`)) as {
      aktionen: { ok: Record<string, string>; fehler: Record<string, string> };
      kiAssistentAnsicht: { wissensVerwaltung: Record<string, Record<string, string>>; quellen: Record<string, Record<string, string> | string> };
    };
    const w = m.kiAssistentAnsicht.wissensVerwaltung;
    const q = m.kiAssistentAnsicht.quellen;
    pruefe(`Typtexte ${loc}: drei Cluster mit Beschriftung und Beispielen, Formular- und Listenfelder fuer Cluster, Einordnung und Fehlerdetail`, CLUSTER.every((c) => !!w.cluster?.[c] && !!w.clusterBeispiel?.[c]) &&
      ["cluster", "clusterHinweis", "clusterZwang"].every((k) => !!w.formular?.[k]) && ["cluster", "einordnung", "ohneEinordnung", "ohneEinordnungHinweis", "filter", "filterAlle", "keineTreffer", "fehlerDetail"].every((k) => !!w.liste?.[k]));
    pruefe(`Typtexte ${loc}: alle dreizehn Quellenarten mit Beschriftung und Beispiel (Verwaltung), Beschriftung (Quellenkarte)`, QUELLENARTEN.every((a) => !!w.quellenart?.[a] && !!w.beispiel?.[a] && !!(q.art as Record<string, string>)?.[a]));
    pruefe(`Typtexte ${loc}: Einordnen-Bereich (Titel, Vorschlaege, Spalten, Schaltflaechen, Fenster) und die Meldungen dazu vorhanden`, (() => {
      const e = (w as unknown as { einordnen?: Record<string, Record<string, string> | string> }).einordnen ?? {};
      const g = (k: string) => (e[k] ?? {}) as Record<string, string>;
      const d = g("dialog");
      return ["titel", "lead", "zaehler", "alleErledigt", "seite", "gewaehlt", "unvollstaendig", "bitteWaehlen", "waehlen"].every((k) => typeof e[k] === "string" && !!e[k]) &&
        ["hoch", "mittel", "niedrig"].every((k) => !!g("sicherheit")[k]) && ["rechtsstelle", "amtlicheSeite", "standardGremium", "wikipedia", "forum", "blog", "stufe", "keinLink", "mehrereQuellen"].every((k) => !!g("grund")[k]) &&
        ["dokument", "stufe", "bereich", "art", "cluster", "vorschlag"].every((k) => !!g("spalte")[k]) && ["sichere", "seite", "aufheben", "pruefen", "zurueck", "weiter"].every((k) => !!g("schaltflaeche")[k]) &&
        ["titel", "lead", "dokumente", "gesperrt", "gesperrtKurz", "nurHinweis", "stufe", "verlassenPrimaer", "kommenInPrimaer", "nichtsBesonderes", "liste", "stufeVonNach", "weitere", "hinweisStufe", "hinweisProtokoll", "abbrechen", "speichern"].every((k) => !!d[k]) &&
        !!m.aktionen.ok.wissenEingeordnet && ["wissenEinordnenLeer", "wissenEinordnen", "wissenClusterPasstNicht"].every((k) => !!m.aktionen.fehler[k]);
    })());
    pruefe(`Typtexte ${loc}: Textgrundlagen, Status, Hinweis, Pruefdialog, Formularfelder und Listenfelder vorhanden`, TEXTGRUNDLAGEN.every((g) => !!w.textgrundlage?.[g]) && ["ungeprueft", "freigegeben", "abgelehnt", "abgelaufen"].every((k) => !!w.status?.[k]) && !!w.nutzung?.hinweis &&
      ["knopf", "knopfErneut", "titel", "titelErneut", "vorschau", "vorschauLaedt", "vorschauFehler", "hinweis", "hinweisErneut", "freigeben", "ablehnen", "verlaengern", "abbrechen"].every((k) => !!w.pruefung?.[k]) &&
      ["quellenart", "quellenartHinweis", "nichtZulaessig", "nutzungHinweis", "stufeInfo", "textgrundlage", "url", "urlHinweis", "freigabeHinweis"].every((k) => !!w.formular?.[k]) && ["quellenart", "stufe", "link", "pruefenBis", "wartet"].every((k) => !!w.liste?.[k]));
    pruefe(`Typtexte ${loc}: Meldungen der Freigabe und der neuen Fehler vorhanden, Quellenkarte kennt Hinweis und Uebersetzung`, ["wissenFreigegeben", "wissenAbgelehnt", "wissenVerlaengert"].every((k) => !!m.aktionen.ok[k]) &&
      ["wissenQuellenartGesperrt", "wissenUrlFehlt", "wissenUrlUngueltig", "wissenNichtGefunden", "wissenNichtFreigebbar", "wissenNichtPruefbar", "wissenSelbstFreigabe", "wissenFreigeben"].every((k) => !!m.aktionen.fehler[k]) &&
      !!q.nurHinweis && !!q.nurHinweise && ["amtlich_uebersetzt", "fachlich_uebersetzt", "maschinell_uebersetzt"].every((g) => !!(q.textgrundlage as Record<string, string>)?.[g]));
    // Jeder Schluessel, den die Action nennt, gibt es in der Sprachdatei
    const aktionQuelle = lies("src/lib/actions/wissen.ts");
    const fehlerSchluessel = [...aktionQuelle.matchAll(/"fehler\.([A-Za-z]+)"/g)].map((x) => x[1]!);
    const okSchluessel = [...aktionQuelle.matchAll(/"ok\.([A-Za-z]+)"/g)].map((x) => x[1]!);
    const fehlen = [...fehlerSchluessel.filter((k) => !m.aktionen.fehler[k]).map((k) => `fehler.${k}`), ...okSchluessel.filter((k) => !m.aktionen.ok[k]).map((k) => `ok.${k}`)];
    pruefe(`Typtexte ${loc}: jeder Meldungsschluessel der Server Actions steht in der Sprachdatei`, fehlen.length === 0, fehlen.join(", "));
    pruefe(`Typtexte ${loc}: die Texte tragen die Platzhalter {wert} und {stufe} dort, wo der Code sie fuellt`, /\{wert\}/.test(m.aktionen.ok.wissenFreigegeben!) && /\{wert\}/.test(m.aktionen.ok.wissenVerlaengert!) && /\{stufe\}/.test(w.formular!.stufeInfo!));
  }

  // ---- 17. Oberflaeche: gesteuertes Formular, Pruefdialog ---------------------------------------------
  {
    const ui = lies("src/components/db/wissen-verwaltung.tsx");
    pruefe("Oberflaeche: alle Eingaben (ausser der Datei) liegen im Zustand und bleiben nach einem Fehler stehen, nach einem Erfolg wird geleert", /useState<Eingaben>\(LEERE_EINGABEN\)/.test(ui) && /value=\{werte\.titel\}/.test(ui) && /value=\{werte\.bereich\}/.test(ui) && /value=\{werte\.quellenart\}/.test(ui) && /checked=\{werte\.rollen\.includes\(rolle\)\}/.test(ui) && /startTransition\(\(\) => setWerte\(LEERE_EINGABEN\)\)/.test(ui));
    pruefe("Oberflaeche: Cluster und Quellenart sind zwei Auswahlen; die Art bekommt den typischen Cluster vorgeschlagen, nur eine Netz-Art sperrt die anderen Cluster, ein Clusterwechsel verwirft eine nicht passende Art", /name="cluster"/.test(ui) && /typischerClusterVon\(neu\)/.test(ui) && /clusterPasst\(a, cluster\)/.test(ui) && /!clusterPasst\(art, neu\)/.test(ui) && /QUELLENARTEN\.map/.test(ui) && !/artenImCluster/.test(ui));
    pruefe("Oberflaeche: jede Karte zeigt die Einordnung (Art, Cluster, Stufe), auch der Bestand (als nicht eingeordnet), und die Liste laesst sich nach Cluster filtern mit Zaehlern", /liste\.einordnung/.test(ui) && /liste\.ohneEinordnung/.test(ui) && /function ClusterFilter/.test(ui) && /passtZumFilter/.test(ui) && /aria-pressed/.test(ui) && /dokument\.cluster === filter/.test(ui));
    pruefe("Oberflaeche: Bestand einordnen ist eingebunden und erscheint nur, wenn es Dokumente ohne Einordnung gibt", /WissenBestandEinordnen/.test(ui) && /dokumente\.some\(ohneEinordnung\)/.test(ui));
    {
      const eo = lies("src/components/db/wissen-einordnen.tsx");
      pruefe("Einordnen: nichts wird von allein gespeichert; erst das Bestaetigungsfenster mit der Wirkung auf die Suche loest die Action aus", /wirkungVon\(offen, zuordnungen\)/.test(eo) && /showModal\(\)/.test(eo) && /name="zuordnungen"/.test(eo) && /useActionState\(async[\s\S]*?wissenBestandEinordnen\(vorher, formData\)/.test(eo) && !/useEffect\([^)]*wissenBestandEinordnen/.test(eo));
      pruefe("Einordnen: nur Dokumente ohne Quellenart, und nur mit vollstaendiger Wahl (Art und passender Cluster) lassen sich auswaehlen", /filter\(\(d\) => !d\.quellenart\)/.test(eo) && /disabled=\{!ok\}/.test(eo) && /clusterPasst\(w\.art, w\.cluster\)/.test(eo));
      pruefe("Einordnen: Vorschlag mit Sicherheit und Begruendung je Dokument, \"sichere Vorschlaege\" waehlt nur aus (kein Speichern)", /schlageVor\(/.test(eo) && /sicherheit === "hoch"/.test(eo) && /einordnen\.grund\./.test(eo));
    }
    pruefe("Action: bei einem Ladefehler nennt die Antwort Schema und Datenbankmeldung (fehlerDetail), damit die Ursache ohne Server-Log sichtbar ist", (() => { const a = lies("src/lib/actions/wissen.ts"); const l = a.slice(a.indexOf("export async function wissenDokumenteLaden"), a.indexOf("const VORSCHAU_ZEICHEN")); return /fehlerDetail/.test(l) && /DATENBANK_SCHEMA/.test(l) && /error\.code/.test(l); })());
    pruefe("Oberflaeche: nicht zulaessige Quellenarten sind im Bereich gesperrt (disabled), der Link ist bei Internetquelle und Forum Pflicht", /disabled: gesperrt/.test(ui) && /urlPflicht/.test(ui) && /nutzungFuer\(werte\.bereich, a\) === "nein"/.test(ui));
    pruefe("Oberflaeche: Pruefen erscheint nur fuer die ANDERE Person (nicht fuer die hochladende), die hochladende sieht den Wartehinweis", /!eigener && \(dokument\.pruefstatus === "ungeprueft" \|\| dokument\.abgelaufen\)/.test(ui) && /liste\.wartet/.test(ui));
    pruefe("Oberflaeche: der Pruefdialog zeigt Titel, Bereich, Quellenart, Link, Rollen und den Anfang des Textes und bietet Freigeben, Ablehnen, Verlaengern", /wissenDokumentVorschau\(dokument\.schluessel\)/.test(ui) && /value="freigeben"/.test(ui) && /value="ablehnen"/.test(ui) && /value="verlaengern"/.test(ui));
    pruefe("Oberflaeche und Action: die Liste laeuft ueber den Dienst-Client (ungepruefte Zeilen sieht die Zeilensicherheit niemandem), nachdem das Recht geprueft ist", (() => { const a = lies("src/lib/actions/wissen.ts"); const l = a.slice(a.indexOf("export async function wissenDokumenteLaden"), a.indexOf("const VORSCHAU_ZEICHEN")); return l.indexOf("requirePermission") > 0 && l.indexOf("requirePermission") < l.indexOf("createServiceRoleClient") && !/createClient\(\)/.test(l); })());
  }


  // ---- 12. Texte in allen Sprachen -------------------------------------------------------------------
  for (const loc of ["de", "en", "ru", "kk"]) {
    const m = JSON.parse(lies(`src/messages/${loc}.json`)) as { aktionen: { ok: Record<string, string>; fehler: Record<string, string> }; kiAssistentAnsicht: { wissensVerwaltung: Record<string, unknown> } };
    const w = m.kiAssistentAnsicht.wissensVerwaltung as { titel?: string; bereich?: Record<string, string>; formular?: Record<string, string> };
    const schluessel = ["wissenNichtLoeschbar", "wissenLoeschen", "wissenGewichte", "wissenVorschau", "wissenDateityp", "wissenLesen", "wissenLeer", "wissenZuLang", "wissenDoppelt", "wissenEinbettung", "wissenZeit", "wissenSpeichern"];
    pruefe(`Texte ${loc}: alle Fehler- und Erfolgsmeldungen vorhanden`, schluessel.every((k) => m.aktionen.fehler[k]) && !!m.aktionen.ok.wissenHochgeladen && !!m.aktionen.ok.wissenGeloescht && !!m.aktionen.ok.wissenSchonGeloescht);
    pruefe(`Texte ${loc}: Titel, fuenf Bereiche und Formularfelder vorhanden`, !!w.titel && UPLOAD_BEREICHE.every((b) => w.bereich?.[b]) && ["titel", "datei", "titelFeld", "bereich", "rollen", "knopf", "adminImmer"].every((k) => w.formular?.[k]) && ["knopf", "titel", "dokument", "bereich", "abschnitte", "warnung", "abbrechen", "bestaetigen"].every((k) => (w as { loeschen?: Record<string, string> }).loeschen?.[k]));
  }

  console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
  if (fehler > 0) process.exit(1);
  console.log("Alle Pruefungen bestanden.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
