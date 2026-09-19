// Abdeckungs- und Rollentest fuer den KI-Agenten. Kein Datenbankzugriff - er
// prueft, dass sich der Agent an Aenderungen der Anwendung ANPASST, statt still
// zu veralten:
//   * jedes Modul aus modules.ts ist fuer den Agenten beschrieben (Titel +
//     Kurzbeschreibung in allen Sprachen) - ein neues Modul ohne Text faellt hier auf
//   * jedes Werkzeug, das IRGENDEINE Rolle bekommen kann, hat Beschriftungen in
//     allen fuenf Sprachen (sonst zeigt der Chat einen Platzhalter)
//   * die Rollenzuschnitte stimmen: ein Kunde bekommt keine Lohn- oder
//     Steuerwerkzeuge, ein Admin bekommt alles
//   * alle Sprachdateien haben denselben Schluesselsatz
// Aufruf: npm run test:agent (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { AKTIONS_NAMEN } from "@/lib/ai/aktionen-meta";
import { CLIENT_WERKZEUG_NAMEN } from "@/lib/ai/client-werkzeuge-meta";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { modules } from "@/lib/modules";
import { roles } from "@/lib/rbac";

const sprachen = ["de", "en", "ru", "kk", "tr"] as const;
type Baum = { [k: string]: string | Baum };
const texte = Object.fromEntries(
  sprachen.map((s) => [s, JSON.parse(readFileSync(`src/messages/${s}.json`, "utf8")) as Baum]),
) as Record<(typeof sprachen)[number], Baum>;

function holen(baum: Baum, pfad: string): unknown {
  return pfad.split(".").reduce<unknown>((b, k) => (b && typeof b === "object" ? (b as Baum)[k] : undefined), baum);
}
function schluessel(o: Baum, pre = ""): string[] {
  return Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? schluessel(v, `${pre}${k}.`) : [`${pre}${k}`]));
}

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt += 1;
  if (!ok) fehler += 1;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- 1. Module: fuer den Agenten beschrieben --------------------------------
const ohneTitel: string[] = [];
const ohneKurz: string[] = [];
for (const m of modules) {
  for (const s of sprachen) {
    if (typeof holen(texte[s], `modules.${m.key}.title`) !== "string") ohneTitel.push(`${s}:${m.key}`);
  }
  if (typeof holen(texte.de, `modules.${m.key}.summary`) !== "string") ohneKurz.push(m.key);
}
pruefe("Jedes Modul hat in allen Sprachen einen Titel", ohneTitel.length === 0, ohneTitel.join(", ") || `${modules.length} Module`);
pruefe("Jedes Modul hat eine Kurzbeschreibung fuer den Agenten (de)", ohneKurz.length === 0, ohneKurz.join(", "));

// --- 2. Werkzeuge: Beschriftungen fuer alle Rollen --------------------------
const alleNamen = new Set<string>();
for (const rolle of roles) Object.keys(baueWerkzeuge(rolle)).forEach((n) => alleNamen.add(n));
const fehlend: string[] = [];
for (const name of alleNamen) {
  const istAktion = (AKTIONS_NAMEN as string[]).includes(name);
  const benoetigt = istAktion
    ? [`kiAssistentAnsicht.aktion.titel.${name}`, `kiAssistentAnsicht.ziel.${name}`]
    : [`kiAssistentAnsicht.werkzeug.${name}`, `kiAssistentAnsicht.laeuft.${name}`, `kiAssistentAnsicht.ziel.${name}`];
  for (const s of sprachen) {
    for (const pfad of benoetigt) if (typeof holen(texte[s], pfad) !== "string") fehlend.push(`${s}:${pfad}`);
  }
}
pruefe("Jedes Werkzeug (aller Rollen) ist in allen Sprachen beschriftet", fehlend.length === 0, fehlend.slice(0, 4).join(", ") || `${alleNamen.size} Werkzeuge`);

const feldNamen = ["reihenblockCode", "zielmengeKg", "pflueckerAnzahl", "faelligkeit", "aufgabeCode", "neuerStatus", "temperaturC", "grund", "betreff", "beschreibung", "betroffeneMengeKg", "chargeCode", "kundenName", "periodeStart", "periodeEnde"];
const feldFehlt = sprachen.flatMap((s) => feldNamen.filter((f) => typeof holen(texte[s], `kiAssistentAnsicht.aktion.felder.${f}`) !== "string").map((f) => `${s}:${f}`));
pruefe("Alle Aktionsfelder haben Beschriftungen", feldFehlt.length === 0, feldFehlt.slice(0, 4).join(", "));

// --- 2b. Client-Werkzeuge (Seite lesen und bedienen) --------------------------
const uiFehlt = sprachen.flatMap((s) =>
  CLIENT_WERKZEUG_NAMEN.flatMap((n) =>
    [`kiAssistentAnsicht.laeuft.${n}`, `kiAssistentAnsicht.werkzeug.${n}`]
      .filter((pfad) => typeof holen(texte[s], pfad) !== "string")
      .map((pfad) => `${s}:${pfad}`),
  ),
);
pruefe("Jedes Client-Werkzeug ist in allen Sprachen beschriftet", uiFehlt.length === 0, uiFehlt.slice(0, 4).join(", ") || `${CLIENT_WERKZEUG_NAMEN.length} Werkzeuge`);
const lesen = Object.keys(baueWerkzeuge("betriebsleitung", { oberflaeche: "lesen" })).filter((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n));
const steuern = Object.keys(baueWerkzeuge("betriebsleitung", { oberflaeche: "steuern" })).filter((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n));
pruefe("Assistent-Modus bekommt nur seiteLesen", lesen.length === 1 && lesen[0] === "seiteLesen", lesen.join(", "));
pruefe("Agent-Modus bekommt alle Client-Werkzeuge", CLIENT_WERKZEUG_NAMEN.every((n) => steuern.includes(n)), steuern.join(", "));
pruefe("Die nicht-streamende Anfrage (nurLesen) bekommt keine Client-Werkzeuge", !Object.keys(baueWerkzeuge("admin", { nurLesen: true })).some((n) => (CLIENT_WERKZEUG_NAMEN as readonly string[]).includes(n) || (AKTIONS_NAMEN as string[]).includes(n)));

// --- 3. Rollenzuschnitt -----------------------------------------------------
const namen = (rolle: (typeof roles)[number]) => Object.keys(baueWerkzeuge(rolle));
const admin = namen("admin");
pruefe("Admin bekommt alle Aktionen", (AKTIONS_NAMEN as string[]).every((a) => admin.includes(a)), `${admin.length} Werkzeuge`);
const kunde = namen("kunde");
pruefe("Kunde bekommt keine Steuer-/Lohn-/Compliance-Werkzeuge", !["mwstStatusAbrufen", "esutdOffeneFristenAbrufen", "complianceUebersichtAbrufen", "risikoRadarAbrufen", "lohnPeriodeBerechnen", "mwstSchwellePruefen"].some((n) => kunde.includes(n)), kunde.join(", "));
pruefe("Kunde darf reklamieren und hat Navigation + Datenabfrage", ["reklamationAnlegen", "oeffneBereich", "datenLesen"].every((n) => kunde.includes(n)));
const picker = namen("picker");
pruefe("Pfluecker bekommt keine Lohnberechnung und keine Reklamation", !picker.includes("lohnPeriodeBerechnen") && !picker.includes("reklamationAnlegen"), picker.join(", "));
const buchhaltung = namen("buchhaltung");
pruefe("Buchhaltung bekommt Lohnberechnung, aber kein ESUTD-Werkzeug", buchhaltung.includes("lohnPeriodeBerechnen") && !buchhaltung.includes("esutdOffeneFristenAbrufen"), buchhaltung.join(", "));

// --- 4. Navigation folgt dem Modulregister ----------------------------------
const navigation = baueWerkzeuge("admin").oeffneBereich as unknown as { description?: string } | undefined;
const nichtErreichbar = modules.filter((m) => !navigation?.description?.includes(`${m.key}:`)).map((m) => m.key);
pruefe("Der Agent kann JEDES Modul oeffnen (Admin)", nichtErreichbar.length === 0, nichtErreichbar.join(", ") || `${modules.length} Module`);
const kundeNav = (baueWerkzeuge("kunde").oeffneBereich as unknown as { description?: string } | undefined)?.description ?? "";
pruefe("Kunde kann Lohn NICHT oeffnen", !kundeNav.includes("lohn:"));

// --- 5. Sprachdateien: gleicher Schluesselsatz ------------------------------
const basis = new Set(schluessel(texte.de));
for (const s of sprachen.filter((x) => x !== "de")) {
  const menge = new Set(schluessel(texte[s]));
  const fehlt = [...basis].filter((k) => !menge.has(k));
  const zuviel = [...menge].filter((k) => !basis.has(k));
  pruefe(`Sprachdatei ${s} hat denselben Schluesselsatz wie de`, fehlt.length === 0 && zuviel.length === 0, `fehlt ${fehlt.length}, zuviel ${zuviel.length}`);
}

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
