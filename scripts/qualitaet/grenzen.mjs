// Prüft, dass keine neue Abfrage ohne Zeilengrenze dazukommt (WMCNL-2491, Audit "Abfragen ohne Zeilenbegrenzung").
//
// PostgREST liefert höchstens 1000 Zeilen und schneidet danach still ab. Eine Liste, die in der Saison über diese Grenze wächst, zeigt dann einen falschen
// Stand, ohne Fehler. Jede Abfrage über mehrere Zeilen braucht deshalb eine Grenze (.limit, .range, leseAlleZeilen) oder ist von Natur aus auf eine Zeile
// beschränkt (.single, .maybeSingle, head: true mit count).
//
// Das Skript ist eine Sperre gegen Verschlechterung, kein Beweis: Es zählt je Datei die Abfragen auf Tabellen und Sichten (.from("...")), deren Anweisung keine
// Grenze trägt, und vergleicht mit der Basis in scripts/qualitaet/grenzen-basis.json. Mehr als in der Basis: Fehler. Weniger: Hinweis, die Basis zu senken
// (npm run qualitaet:grenzen -- --basis-schreiben schreibt sie neu, wenn alle Befunde bewusst so stehen bleiben).
//
// Grenzen der Heuristik: Die Anweisung endet am ersten Semikolon außerhalb von Klammern. Ketten, die über mehrere Anweisungen laufen (eine Variable, die später
// begrenzt wird), zählen als unbegrenzt; sie gehören in einen Kommentar "grenze: ..." in derselben Anweisung, der als Begründung gilt.
//
// Aufruf: node scripts/qualitaet/grenzen.mjs   (Teil von npm test über test:grenzen)
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const R = process.cwd().split("\\").join("/") + "/";
const BASIS_DATEI = "scripts/qualitaet/grenzen-basis.json";
const dateien = execSync("git ls-files src/lib src/app src/components", { cwd: R, encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(ts|tsx)$/.test(f));

const BEGRENZT = /\.limit\(|\.range\(|\.single\(|\.maybeSingle\(|head:\s*true|leseAlleZeilen|grenze:/;

/** Die Anweisung ab Position `start` bis zum ersten Semikolon außerhalb von Klammern (höchstens 4000 Zeichen). */
function anweisung(text, start) {
  let tiefe = 0;
  for (let i = start; i < Math.min(text.length, start + 4000); i++) {
    const c = text[i];
    if (c === "(" || c === "[" || c === "{") tiefe++;
    else if (c === ")" || c === "]" || c === "}") tiefe--;
    else if (c === ";" && tiefe <= 0) return text.slice(start, i);
  }
  return text.slice(start, start + 4000);
}

const befunde = {};
for (const f of dateien) {
  const text = readFileSync(R + f, "utf8");
  for (const m of text.matchAll(/\.from\("([a-z_0-9]+)"\)\s*\.select\(/g)) {
    const a = anweisung(text, m.index);
    // Die Begruendung "grenze: ..." darf in der Anweisung, in der Zeile davor (bis zur vorigen Anweisung) oder hinter dem Semikolon derselben Zeile stehen.
    const davor = text.slice(Math.max(0, m.index - 200), m.index).split(/[;{}]\s*\n/).pop() ?? "";
    const ende = m.index + a.length;
    const zeilenende = text.indexOf("\n", ende);
    const rest = text.slice(ende, zeilenende < 0 ? text.length : zeilenende);
    if (BEGRENZT.test(a) || /grenze:/.test(davor) || /grenze:/.test(rest)) continue;
    // Schreibende Ketten (insert/update/delete/upsert vor select) enden auf eine Zeile oder sind durch die Policy begrenzt: nur reine Lesezugriffe zählen.
    (befunde[f] ??= []).push(m[1]);
  }
}

const zaehle = Object.fromEntries(Object.entries(befunde).map(([f, tabellen]) => [f, tabellen.length]));
if (process.argv.includes("--basis-schreiben")) {
  writeFileSync(R + BASIS_DATEI, JSON.stringify(zaehle, Object.keys(zaehle).sort(), 2) + "\n");
  console.log(`Basis geschrieben: ${Object.values(zaehle).reduce((a, b) => a + b, 0)} Abfragen in ${Object.keys(zaehle).length} Dateien.`);
  process.exit(0);
}

const basis = existsSync(R + BASIS_DATEI) ? JSON.parse(readFileSync(R + BASIS_DATEI, "utf8")) : {};
const mehr = [];
const weniger = [];
for (const f of new Set([...Object.keys(zaehle), ...Object.keys(basis)])) {
  const jetzt = zaehle[f] ?? 0;
  const vorher = basis[f] ?? 0;
  if (jetzt > vorher) mehr.push(`${f}: ${jetzt} statt ${vorher} (${(befunde[f] ?? []).join(", ")})`);
  else if (jetzt < vorher) weniger.push(`${f}: ${jetzt} statt ${vorher}`);
}
const summe = Object.values(zaehle).reduce((a, b) => a + b, 0);
console.log(`Abfragen ohne erkennbare Zeilengrenze: ${summe} in ${Object.keys(zaehle).length} Dateien (Basis: ${Object.values(basis).reduce((a, b) => a + b, 0)}).`);
if (weniger.length > 0) console.log(`Hinweis: weniger als in der Basis, bitte die Basis senken (node scripts/qualitaet/grenzen.mjs --basis-schreiben):\n  ${weniger.join("\n  ")}`);
if (mehr.length > 0) {
  console.log(`\nNeue Abfragen ohne Zeilengrenze:\n  ${mehr.join("\n  ")}`);
  console.log('\nPostgREST schneidet bei 1000 Zeilen still ab. Eine Grenze setzen (.limit, .range, leseAlleZeilen), die Abfrage auf eine Zeile beschränken (.single, head: true) oder die Begrenzung begründen: ein Kommentar "grenze: ..." in derselben Anweisung.');
  process.exit(1);
}
