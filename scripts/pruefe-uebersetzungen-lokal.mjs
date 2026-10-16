// Prüft in der LOKALEN Datenbank, dass jede Zeile der übersetzbaren Tabellen für jede Textspalte ihre Übersetzungen hat (Testdaten und Beispieldaten). Ausgenommen sind
// Codes (Blockcodes, Nummern in Großbuchstaben), die in keiner Sprache anders lauten.
// Ein russischer Originaltext braucht de, en und kk, jeder andere en, ru und kk.
//
// Aufruf: npm run db:uebersetzungen-pruefen   (Voraussetzung: lokaler Supabase-Stack mit eingespielten Testdaten, npm run db:testdaten-lokal)
//
// Ziel ist ausschließlich der lokale Container (Standard supabase_db_damicon, überschreibbar mit SUPABASE_DB_CONTAINER). Es wird nur gelesen.

import { execFileSync } from "node:child_process";

const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_damicon";

// Übersetzbare Spalten je Tabelle (Migration 20261211010000). Die Kategorie eines Nutzens ist ein Schlüssel und hat feste Texte in der Oberfläche.
const SPALTEN = [
  ["abholrunden", "fahrzeug"],
  ["abholrunden", "notiz"],
  ["abholstopps", "bemerkung"],
  ["dokumente", "name"],
  ["dokumente", "bezug"],
  ["dokumente", "rechtsgrundlage"],
  ["esutd_ereignisse", "beschreibung"],
  ["esutd_ereignisse", "bestaetigung"],
  ["esutd_vertraege", "bestaetigung"],
  ["finance_ledger_entries", "kategorie"],
  ["finance_ledger_entries", "beschreibung"],
  ["preislisten", "name"],
  ["reklamation_ereignisse", "text"],
  ["reklamationen", "betreff"],
  ["reklamationen", "beschreibung"],
  ["reklamationen", "loesung"],
  ["vorbestellung_nachrichten", "text"],
  ["wirtschaftlichkeit_ist", "notiz"],
  ["wirtschaftlichkeit_posten", "kategorie", "art <> 'nutzen'"],
  ["wirtschaftlichkeit_posten", "bezeichnung"],
  ["wirtschaftlichkeit_posten", "notiz"],
  ["wirtschaftlichkeit_staende", "bezeichnung"],
];

const abfragen = SPALTEN.map(([tabelle, feld, zusatz]) => {
  const istRussisch = `(length(regexp_replace(${feld}, '[^А-Яа-яЁё]', '', 'g')) > length(regexp_replace(${feld}, '[^A-Za-zÄÖÜäöüß]', '', 'g')))`;
  return `select '${tabelle}.${feld}' as spalte, left(${feld}, 50) as text from public.${tabelle}
   where ${feld} is not null and ${feld} !~ '^[A-Z0-9][A-Z0-9, /-]*$' ${zusatz ? `and ${zusatz}` : ""}
     and not (coalesce(i18n -> '${feld}', '{}'::jsonb) ?& (case when ${istRussisch} then array['de','en','kk'] else array['en','ru','kk'] end))`;
});

const sql = `${abfragen.join("\nunion all\n")}\norder by 1, 2;`;
let ausgabe;
try {
  ausgabe = execFileSync("docker", ["exec", "-i", CONTAINER, "psql", "-U", "postgres", "-At", "-F", " | ", "-v", "ON_ERROR_STOP=1"], { input: sql, encoding: "utf8" });
} catch (e) {
  console.error(`Abfrage gegen den lokalen Container ${CONTAINER} fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
  process.exit(2);
}
const fehlend = ausgabe.split("\n").filter(Boolean);
if (fehlend.length > 0) {
  console.error(`Zeilen ohne vollständige Übersetzung (${fehlend.length}):`);
  for (const z of fehlend.slice(0, 40)) console.error(`  ${z}`);
  process.exit(1);
}
console.log(`Alle Zeilen haben ihre Übersetzungen (${SPALTEN.length} Spalten geprüft).`);
