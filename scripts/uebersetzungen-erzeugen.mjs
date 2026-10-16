// Erzeugt die Migration mit den Übersetzungen der Testdaten und der Beispieldaten aus supabase/uebersetzungen/testdaten.json.
//
// Die JSON-Datei ist die Quelle: Sie hält je Tabelle, Spalte und Originaltext die Übersetzungen (en, ru, kk; bei russischem Original de, en, kk) und lässt sich
// von Muttersprachlerinnen und Muttersprachlern prüfen. Die Migration ist daraus abgeleitet und wird nicht von Hand geändert.
//
// Aufruf:
//   node scripts/uebersetzungen-erzeugen.mjs            schreibt supabase/migrations/20261211020000_testdaten_uebersetzungen.sql
//   node scripts/uebersetzungen-erzeugen.mjs --pruefen  prüft, dass die Datei dem Stand der JSON-Quelle entspricht (Exitcode 1 sonst)
//
// Die Migration trägt die Übersetzungen über den Originaltext ein: in jede Zeile, deren Spalte genau diesen Text hat und noch keine Übersetzung. Ein von Hand
// geänderter Text bleibt unberührt. Sie ändert nie ein Original und lässt sich beliebig oft ausführen.

import { readFileSync, writeFileSync } from "node:fs";

const QUELLE = "supabase/uebersetzungen/testdaten.json";
const ZIEL = "supabase/migrations/20261211020000_testdaten_uebersetzungen.sql";
const SPRACHEN = ["de", "en", "ru", "kk"];

/** Ein Text als SQL-Literal: Hochkomma verdoppeln. */
const sql = (text) => `'${text.replaceAll("'", "''")}'`;

export function erzeuge(quelle) {
  const eintraege = quelle.eintraege;
  const tabellen = [...new Set(eintraege.map((e) => e.tabelle))].sort();
  const gruppen = new Map();
  for (const e of eintraege) {
    const schluessel = `${e.tabelle}.${e.feld}`;
    if (!gruppen.has(schluessel)) gruppen.set(schluessel, []);
    gruppen.get(schluessel).push(e);
  }

  const kopf = `-- Übersetzungen der Freitexte der Test- und Beispieldaten in alle Sprachen (Datenänderung, idempotent).
--
-- DIESE DATEI IST ERZEUGT aus supabase/uebersetzungen/testdaten.json (node scripts/uebersetzungen-erzeugen.mjs). Änderungen gehören in die JSON-Datei.
--
-- Die Testdaten (Kennung 7e57da7a-0000-4000-8000-...) und die Beispieldaten (seed.sql) standen bisher nur auf Deutsch (eine Nachricht auf Russisch). Diese Migration
-- trägt ihre Übersetzungen ins Englische, Russische und Kasachische in die Spalte i18n ein (Migration 20261211010000). ${eintraege.length} Texte in ${gruppen.size} Spalten von ${tabellen.length} Tabellen.
-- Die Oberfläche zeigt je nach Sprache die Übersetzung und fällt auf das Original zurück, wo keine steht.
--
-- Was sie ändert: nur die Spalte i18n, nur in Zeilen, deren Text genau dem Original in der Liste entspricht, und nur wo die Spalte noch keine Übersetzung hat.
-- Dieselbe Zeile mit demselben Text bekommt dieselbe Übersetzung, ob Testdaten, Beispieldaten oder von Hand erfasst. Ein von Hand geänderter Text bekommt keine.
-- Originale, Beträge, Zeitpunkte und alle anderen Spalten bleiben unberührt. Ein zweiter Lauf ändert nichts.
--
-- Die Trigger der Tabellen sind für die Dauer dieser Migration abgeschaltet (Buchungen, Verlauf, Nachrichten und Stände sind unveränderlich, andere Trigger würden
-- Zeitstempel setzen oder Verlaufseinträge schreiben). Es ändert sich nur i18n.
--
-- Die kasachischen Texte sind noch nicht von einer Muttersprachlerin oder einem Muttersprachler geprüft.
`;

  const aus = [];
  aus.push(...tabellen.map((t) => `alter table public.${t} disable trigger user;`));
  aus.push("");

  for (const [schluessel, liste] of [...gruppen.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const [tabelle, feld] = schluessel.split(".");
    const werte = liste
      .map((e) => {
        const geordnet = Object.fromEntries(SPRACHEN.filter((s) => e.uebersetzungen[s] !== undefined).map((s) => [s, e.uebersetzungen[s]]));
        return `    (${sql(e.original)}, ${sql(JSON.stringify(geordnet))})`;
      })
      .join(",\n");
    aus.push(`-- ${schluessel} (${liste.length} ${liste.length === 1 ? "Text" : "Texte"})`);
    aus.push(`update public.${tabelle} t`);
    aus.push(`   set i18n = t.i18n || jsonb_build_object('${feld}', v.uebers::jsonb)`);
    aus.push(`  from (values`);
    aus.push(werte);
    aus.push(`  ) as v(original, uebers)`);
    aus.push(` where t.${feld} = v.original`);
    aus.push(`   and not (t.i18n ? '${feld}');`);
    aus.push("");
  }

  aus.push(...tabellen.map((t) => `alter table public.${t} enable trigger user;`));
  return `${kopf}\n${aus.join("\n")}\n`;
}

if (process.argv[1]?.endsWith("uebersetzungen-erzeugen.mjs")) {
  const quelle = JSON.parse(readFileSync(QUELLE, "utf8"));
  const soll = erzeuge(quelle);
  if (process.argv.includes("--pruefen")) {
    let ist = "";
    try {
      ist = readFileSync(ZIEL, "utf8").replace(/\r\n/g, "\n");
    } catch {
      /* fehlt */
    }
    if (ist !== soll) {
      console.error(`${ZIEL} entspricht nicht ${QUELLE}. Neu erzeugen: node scripts/uebersetzungen-erzeugen.mjs`);
      process.exit(1);
    }
    console.log(`${ZIEL} entspricht ${QUELLE} (${quelle.eintraege.length} Texte).`);
  } else {
    writeFileSync(ZIEL, soll);
    console.log(`${ZIEL} geschrieben (${quelle.eintraege.length} Texte).`);
  }
}
