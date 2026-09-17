#!/usr/bin/env node
// =============================================================================
// Damicon - Test des Zukauf-Import-Parsers (WMCNL-1453)
// =============================================================================
// Ausfuehren:  node supabase/tests/zukauf-parser.mjs
//
// Der Parser ist eine reine Funktion ohne Datenbank- oder Serverzugriff (siehe
// src/lib/import/zukauf-parser.ts) - dieser Test braucht deshalb weder eine
// laufende Supabase-Instanz noch Umgebungsvariablen, anders als
// supabase/tests/integration.mjs. Getestet wird nicht nur der Normalfall,
// sondern was ein Buero tatsaechlich einfuegt: Semikolon statt Komma,
// Dezimalkomma, ein Byte Order Mark, mehrsprachige Kopfzeilen, unbekannte
// Sorten/Nachbarbetriebe, Duplikate, Grenzwerte - Muster uebernommen aus dem
// Schwesterprojekt Digitalisierung-Himbeerenbetrieb
// (scripts/test-import-parser.mjs), auf Damicons eigenen Parser zugeschnitten.
// =============================================================================

import { parseZukauf } from "../../src/lib/import/zukauf-parser.ts";

const HEUTE = "2026-09-07";

const REFERENZEN = {
  sorten: [
    { id: "s-polka", name: "Polka" },
    { id: "s-polana", name: "Polana" },
    { id: "s-tulameen", name: "Tulameen" },
  ],
  nachbarbetriebe: [
    { id: "n-kaskelen", name: "Nachbarbetrieb Kaskelen" },
    { id: "n-uzynagash", name: "Nachbarbetrieb Uzynagash" },
  ],
};

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name, bedingung, info = "") {
  if (bedingung) {
    bestanden++;
    console.log(`  OK   ${name}${info ? "  " + info : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`  FEHL ${name}  ${info}`);
  }
}

const codes = (r, stufe) => r.befunde.filter((b) => b.stufe === stufe).map((b) => b.code);
const parse = (text) => parseZukauf(text, REFERENZEN, HEUTE);

console.log("== Normalfall, deutsches Excel mit Semikolon ==");
{
  const csv = [
    "Menge;Sorte;Datum;Nachbarbetrieb",
    "210;Polka;2026-09-01;Nachbarbetrieb Kaskelen",
    "150,5;Polana;01.09.2026;Nachbarbetrieb Uzynagash",
  ].join("\n");
  const r = parse(csv);
  pruefe("Zwei Zeilen gelesen", r.zeilen.length === 2, `${r.zeilen.length}`);
  pruefe("Trennzeichen erkannt", r.trennzeichen === ";", r.trennzeichen);
  pruefe("Dezimalkomma verstanden", r.zeilen[1].mengeKg === 150.5, String(r.zeilen[1]?.mengeKg));
  pruefe("TT.MM.JJJJ verstanden", r.zeilen[1].datumIso === "2026-09-01", r.zeilen[1]?.datumIso);
  pruefe("Sorte aufgeloest", r.zeilen[0].sorteId === "s-polka", r.zeilen[0]?.sorteId);
  pruefe("Nachbarbetrieb aufgeloest", r.zeilen[0].nachbarbetriebId === "n-kaskelen");
  pruefe("Keine Fehlerbefunde", codes(r, "fehler").length === 0, codes(r, "fehler").join(","));
  pruefe("Zusammenfassung als Hinweis", codes(r, "hinweis").includes("summary"));
}

console.log("\n== Komma-Trennung, Byte Order Mark, englische Ueberschriften ==");
{
  // String.fromCharCode statt eines eingebetteten Byte-Order-Mark-Zeichens im
  // Quelltext: unsichtbar im Editor und im Diff, dieselbe Falle wie im
  // Vorbild (siehe Kommentar an ohneBom() im Parser selbst).
  const csv = String.fromCharCode(0xfeff) + [
    "quantity,variety,date,supplier",
    "300,Tulameen,2026-08-20,Nachbarbetrieb Kaskelen",
  ].join("\n");
  const r = parse(csv);
  pruefe(
    "BOM entfernt und Spalten erkannt",
    r.zeilen.length === 1 && r.zeilen[0].mengeKg === 300,
    JSON.stringify(r.zeilen[0] ?? {}),
  );
  pruefe("Trennzeichen Komma", r.trennzeichen === ",", r.trennzeichen);
}

console.log("\n== Mehrsprachige Kopfzeilen (ru/kk/tr) ==");
{
  const ru = [
    "Количество;Сорт;Дата;Поставщик",
    "180;Polka;2026-08-15;Nachbarbetrieb Kaskelen",
  ].join("\n");
  pruefe("Russische Ueberschriften erkannt", parse(ru).zeilen.length === 1);

  const kk = [
    "Салмағы;Сұрып;Күні;Жеткізуші",
    "180;Polka;2026-08-15;Nachbarbetrieb Kaskelen",
  ].join("\n");
  pruefe("Kasachische Ueberschriften erkannt", parse(kk).zeilen.length === 1);

  const tr = [
    "Miktar;Çeşit;Tarih;Tedarikçi",
    "180;Polka;2026-08-15;Nachbarbetrieb Kaskelen",
  ].join("\n");
  pruefe("Tuerkische Ueberschriften erkannt", parse(tr).zeilen.length === 1);
}

console.log("\n== Fehlende Pflichtspalten ==");
{
  const ohneNachbarbetrieb = "Menge;Sorte;Datum\n100;Polka;2026-09-01";
  const r = parse(ohneNachbarbetrieb);
  pruefe("Fehlende Pflichtspalte wird gemeldet", codes(r, "fehler").includes("column_missing"));
  pruefe("Bei fehlender Pflichtspalte keine Zeilen", r.zeilen.length === 0);

  const leer = parse("");
  pruefe("Leere Eingabe wird gemeldet", codes(leer, "fehler").includes("empty"));

  const nurKopf = parse("Menge;Sorte;Datum;Nachbarbetrieb");
  pruefe("Datei ohne Datenzeile wird gemeldet", codes(nurKopf, "fehler").includes("no_rows"));
}

console.log("\n== Fehlerfaelle je Zeile ==");
{
  const leereZelle = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  const r1 = parse(leereZelle);
  pruefe("Leere Pflichtzelle wird gemeldet", codes(r1, "fehler").includes("required_missing"));
  pruefe("Zeile mit leerer Pflichtzelle wird nicht uebernommen", r1.zeilen.length === 0);

  const mengeText = ["Menge;Sorte;Datum;Nachbarbetrieb", "abc;Polka;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  pruefe("Nicht-numerische Menge wird gemeldet", codes(parse(mengeText), "fehler").includes("value_format"));

  const mengeNull = ["Menge;Sorte;Datum;Nachbarbetrieb", "0;Polka;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  pruefe("Menge null wird gemeldet", codes(parse(mengeNull), "fehler").includes("value_range"));

  const mengeNegativ = ["Menge;Sorte;Datum;Nachbarbetrieb", "-5;Polka;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  pruefe("Negative Menge wird gemeldet", codes(parse(mengeNegativ), "fehler").includes("value_range"));

  const datumUngueltig = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;Polka;31.02.2026;Nachbarbetrieb Kaskelen"].join("\n");
  pruefe("Ungueltiges Kalenderdatum wird gemeldet", codes(parse(datumUngueltig), "fehler").includes("value_format"));

  const datumZukunft = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;Polka;2026-12-31;Nachbarbetrieb Kaskelen"].join("\n");
  pruefe("Datum in der Zukunft wird gemeldet", codes(parse(datumZukunft), "fehler").includes("value_range"));

  const unbekannteSorte = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;Erdbeere;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  const rSorte = parse(unbekannteSorte);
  pruefe("Unbekannte Sorte wird gemeldet, nicht automatisch angelegt", codes(rSorte, "fehler").includes("unknown_reference"));
  pruefe("Zeile mit unbekannter Sorte wird nicht uebernommen", rSorte.zeilen.length === 0);

  const unbekannterBetrieb = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;Polka;2026-09-01;Nachbarbetrieb Mars"].join("\n");
  const rBetrieb = parse(unbekannterBetrieb);
  pruefe("Unbekannter Nachbarbetrieb wird gemeldet, nicht automatisch angelegt", codes(rBetrieb, "fehler").includes("unknown_reference"));
  pruefe("Zeile mit unbekanntem Nachbarbetrieb wird nicht uebernommen", rBetrieb.zeilen.length === 0);

  // Aufnahme des Betriebs loest genau diese Ablehnung auf: derselbe CSV-Inhalt,
  // nur die Referenzliste kennt den Betrieb jetzt - das ist der Zweck des neuen
  // Formulars (nachbarbetriebAnlegen, actions/zukauf.ts). Vorher gab es im
  // Bestand keinen Weg, einen Nachbarbetrieb ueber die Anwendung anzulegen.
  const nachAufnahme = parseZukauf(
    unbekannterBetrieb,
    {
      sorten: REFERENZEN.sorten,
      nachbarbetriebe: [...REFERENZEN.nachbarbetriebe, { id: "n-mars", name: "Nachbarbetrieb Mars" }],
    },
    HEUTE,
  );
  pruefe(
    "Nach Aufnahme des Betriebs wird dieselbe Zeile uebernommen",
    nachAufnahme.zeilen.length === 1 && codes(nachAufnahme, "fehler").length === 0,
    `Zeilen: ${nachAufnahme.zeilen.length}`,
  );
  pruefe(
    "Die uebernommene Zeile traegt die id des neu aufgenommenen Betriebs",
    nachAufnahme.zeilen[0]?.nachbarbetriebId === "n-mars",
    `id: ${nachAufnahme.zeilen[0]?.nachbarbetriebId}`,
  );
}

console.log("\n== Auffaellige, aber zulaessige Werte (Warnung statt Ablehnung) ==");
{
  const grosseMenge = ["Menge;Sorte;Datum;Nachbarbetrieb", "5000;Polka;2026-09-01;Nachbarbetrieb Kaskelen"].join("\n");
  const r1 = parse(grosseMenge);
  pruefe("Sehr grosse Menge nur als Warnung", codes(r1, "warnung").includes("value_suspicious"));
  pruefe("Warnung verhindert die Zeile nicht", r1.zeilen.length === 1);

  const altesDatum = ["Menge;Sorte;Datum;Nachbarbetrieb", "100;Polka;2020-01-01;Nachbarbetrieb Kaskelen"].join("\n");
  const r2 = parse(altesDatum);
  pruefe("Sehr altes Datum nur als Warnung", codes(r2, "warnung").includes("value_suspicious"));
  pruefe("Warnung verhindert die Zeile nicht", r2.zeilen.length === 1);

  const duplikat = [
    "Menge;Sorte;Datum;Nachbarbetrieb",
    "100;Polka;2026-09-01;Nachbarbetrieb Kaskelen",
    "100;Polka;2026-09-01;Nachbarbetrieb Kaskelen",
  ].join("\n");
  const r3 = parse(duplikat);
  pruefe("Moegliches Duplikat wird als Warnung gemeldet", codes(r3, "warnung").includes("duplicate_verdacht"));
  pruefe("Beide Duplikat-Zeilen werden uebernommen, keine Ablehnung", r3.zeilen.length === 2);
}

console.log("\n== Anfuehrungszeichen, Leerzeilen, Spaltenreihenfolge ==");
{
  const mitKomma = [
    "Nachbarbetrieb,Menge,Sorte,Datum",
    '"Nachbarbetrieb Kaskelen",100,"Polka",2026-09-01',
  ].join("\n");
  const r1 = parse(mitKomma);
  pruefe(
    "Beliebige Spaltenreihenfolge wird erkannt",
    r1.zeilen.length === 1 && r1.zeilen[0].nachbarbetriebId === "n-kaskelen",
  );

  const leerzeilen = [
    "Menge;Sorte;Datum;Nachbarbetrieb",
    "",
    "100;Polka;2026-09-01;Nachbarbetrieb Kaskelen",
    "   ",
    "120;Polana;2026-09-02;Nachbarbetrieb Uzynagash",
  ].join("\n");
  const r2 = parse(leerzeilen);
  pruefe("Leerzeilen werden uebergangen", r2.zeilen.length === 2, `${r2.zeilen.length}`);

  // Groß-/Kleinschreibung und umgebende Leerzeichen duerfen beim Aufloesen
  // gegen die Referenzliste keine Rolle spielen - ein Buero tippt Namen nicht
  // immer exakt wie im Stammdatensatz ab.
  const abweichendeSchreibung = [
    "Menge;Sorte;Datum;Nachbarbetrieb",
    "100; polka ;2026-09-01; NACHBARBETRIEB KASKELEN ",
  ].join("\n");
  const r3 = parse(abweichendeSchreibung);
  pruefe(
    "Gross-/Kleinschreibung und Leerzeichen spielen beim Aufloesen keine Rolle",
    r3.zeilen.length === 1 && r3.zeilen[0].sorteId === "s-polka" && r3.zeilen[0].nachbarbetriebId === "n-kaskelen",
    JSON.stringify(r3.zeilen[0] ?? {}),
  );
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
