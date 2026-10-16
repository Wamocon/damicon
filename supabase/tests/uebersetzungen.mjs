// Übersetzungen der Testdaten (supabase/uebersetzungen/testdaten.json): vollständig, ohne Zahlendreher, in der richtigen Schrift, und die Migration ist daraus erzeugt.
//
// Aufruf: npm run test:uebersetzungen
// Gegen die lokale Datenbank (jede Zeile der Testdaten hat ihre Übersetzungen): npm run db:uebersetzungen-pruefen

import { readFileSync } from "node:fs";
import { erzeuge } from "../../scripts/uebersetzungen-erzeugen.mjs";

let bestanden = 0;
let fehlgeschlagen = 0;
function pruefe(name, ok, detail = "") {
  if (ok) bestanden++;
  else fehlgeschlagen++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const quelle = JSON.parse(readFileSync("supabase/uebersetzungen/testdaten.json", "utf8"));
const eintraege = quelle.eintraege;

// Diese Spalten sind übersetzbar (Migration 20261211010000); jede andere hat in der Datei nichts zu suchen.
const UEBERSETZBAR = {
  abholrunden: ["fahrzeug", "notiz"],
  abholstopps: ["bemerkung"],
  dokumente: ["name", "bezug", "rechtsgrundlage"],
  esutd_ereignisse: ["beschreibung", "bestaetigung"],
  esutd_vertraege: ["bestaetigung"],
  finance_ledger_entries: ["kategorie", "beschreibung"],
  preislisten: ["name"],
  reklamation_ereignisse: ["text"],
  reklamationen: ["betreff", "beschreibung", "loesung"],
  vorbestellung_nachrichten: ["text"],
  wirtschaftlichkeit_ist: ["notiz"],
  wirtschaftlichkeit_posten: ["kategorie", "bezeichnung", "notiz"],
  wirtschaftlichkeit_staende: ["bezeichnung"],
};
const KYRILLISCH = /[\u0400-\u04FF]/;
// Die Zahlen eines Textes ohne Schreibweise: Tausender- und Dezimalzeichen fallen weg (1.500, 1,500 und 1 500 sind gleich), ein Datum z\u00E4hlt mit Tag und
// Jahr (der Monat steht in manchen Sprachen als Wort).
const zahlen = (text) =>
  (
    text
      .replace(/(\d{1,2})\.(\d{2})\.(\d{4})/g, "$1|$3")
      .replace(/(\d)[.,](?=\d)/g, "$1")
      .replace(/(\d)[\s\u00A0](?=\d{3}(?!\d))/g, "$1")
      .match(/\d+/g) ?? []
  )
    .sort()
    .join(",");

pruefe("Datei: Einträge vorhanden", Array.isArray(eintraege) && eintraege.length > 100, `${eintraege.length} Einträge`);

{
  const schluessel = eintraege.map((e) => `${e.tabelle}.${e.feld}\u0000${e.original}`);
  pruefe("Datei: jeder Originaltext je Spalte steht nur einmal", new Set(schluessel).size === schluessel.length);
  const sortiert = [...eintraege].sort((a, b) => `${a.tabelle}.${a.feld}`.localeCompare(`${b.tabelle}.${b.feld}`) || a.original.localeCompare(b.original));
  pruefe("Datei: nach Tabelle, Spalte und Originaltext sortiert (kleine Diffs)", JSON.stringify(sortiert.map((e) => e.original)) === JSON.stringify(eintraege.map((e) => e.original)));
  const unbekannt = eintraege.filter((e) => !UEBERSETZBAR[e.tabelle]?.includes(e.feld)).map((e) => `${e.tabelle}.${e.feld}`);
  pruefe("Datei: nur übersetzbare Spalten", unbekannt.length === 0, [...new Set(unbekannt)].join(", "));
}

{
  const fehlerhaft = [];
  for (const e of eintraege) {
    const soll = e.originalSprache === "ru" ? ["de", "en", "kk"] : ["en", "ru", "kk"];
    const ist = Object.keys(e.uebersetzungen).sort();
    if (JSON.stringify(ist) !== JSON.stringify([...soll].sort())) fehlerhaft.push(`${e.tabelle}.${e.feld}: Sprachen ${ist.join("/")} statt ${soll.join("/")}: ${e.original.slice(0, 40)}`);
    for (const s of soll) if (typeof e.uebersetzungen[s] !== "string" || e.uebersetzungen[s].trim() === "") fehlerhaft.push(`${e.tabelle}.${e.feld}.${s} leer: ${e.original.slice(0, 40)}`);
  }
  pruefe("Sprachen: jeder Eintrag hat genau die Sprachen, die dem Original fehlen, und keine ist leer", fehlerhaft.length === 0, fehlerhaft.slice(0, 3).join(" | "));
}

{
  const falsch = [];
  for (const e of eintraege) {
    for (const [s, text] of Object.entries(e.uebersetzungen)) {
      if ((s === "ru" || s === "kk") && !KYRILLISCH.test(text)) falsch.push(`${s} ohne kyrillische Schrift: ${text.slice(0, 40)}`);
      if ((s === "en" || s === "de") && KYRILLISCH.test(text.replace(/[ЭСФЕУТД]{3,}/g, ""))) falsch.push(`${s} mit kyrillischer Schrift: ${text.slice(0, 40)}`);
    }
  }
  pruefe("Schrift: Russisch und Kasachisch kyrillisch, Englisch und Deutsch lateinisch (ЭСФ und ЕСУТД ausgenommen)", falsch.length === 0, falsch.slice(0, 3).join(" | "));
}

{
  const abweichend = [];
  for (const e of eintraege) {
    for (const [s, text] of Object.entries(e.uebersetzungen)) {
      if (zahlen(text) !== zahlen(e.original)) abweichend.push(`${e.tabelle}.${e.feld}.${s}: ${zahlen(e.original)} gegen ${zahlen(text)}`);
    }
  }
  pruefe("Zahlen: jede Übersetzung trägt dieselben Zahlen wie das Original (Datum, Menge, Preis, Nummer)", abweichend.length === 0, abweichend.slice(0, 3).join(" | "));
}

{
  const strich = [];
  for (const e of eintraege) {
    for (const [s, text] of Object.entries(e.uebersetzungen)) {
      if (/[\u2013\u2014]| - /.test(text)) strich.push(`${s}: ${text.slice(0, 50)}`);
      if (s === "de" && /\b(ae|oe|ue)[a-z]/i.test(text) && /(Gruen|Aender|Loesch|Pruef|Uebe|Koenn|Moegl|fuer\b)/.test(text)) strich.push(`de mit Ersatzschreibweise: ${text.slice(0, 50)}`);
    }
  }
  pruefe("Stil: kein Gedankenstrich und keine Ersatzschreibweise der Umlaute in den Übersetzungen", strich.length === 0, strich.slice(0, 3).join(" | "));
}

{
  const ruOriginale = eintraege.filter((e) => e.originalSprache === "ru");
  pruefe("Original: ein russischer Originaltext ist kyrillisch, ein deutscher nicht", ruOriginale.every((e) => KYRILLISCH.test(e.original)) && eintraege.filter((e) => e.originalSprache !== "ru").every((e) => !KYRILLISCH.test(e.original.replace(/[ЭСФЕУТД]{3,}/g, ""))));
}

{
  const migration = readFileSync("supabase/migrations/20261211020000_testdaten_uebersetzungen.sql", "utf8").replace(/\r\n/g, "\n");
  pruefe("Migration: aus der Datei erzeugt (node scripts/uebersetzungen-erzeugen.mjs, wenn nicht)", migration === erzeuge(quelle));
  const tabellen = new Set(eintraege.map((e) => e.tabelle));
  const aus = [...tabellen].every((t) => migration.includes(`alter table public.${t} disable trigger user;`) && migration.includes(`alter table public.${t} enable trigger user;`));
  pruefe("Migration: die Trigger jeder Tabelle sind aus- und wieder eingeschaltet", aus);
  const spalten = new Set(eintraege.map((e) => `${e.tabelle}.${e.feld}`)).size;
  pruefe(
    "Migration: nur über den Originaltext, nur wo noch keine Übersetzung steht, nichts wird gelöscht",
    (migration.match(/ where t\.\w+ = v\.original\n/g) ?? []).length === spalten &&
      (migration.match(/ and not \(t\.i18n \? '\w+'\);/g) ?? []).length === spalten &&
      !/\b(delete|truncate|drop)\b/i.test(migration.replace(/^--.*$/gm, "")),
  );
}

console.log(`\n${"-".repeat(58)}\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
