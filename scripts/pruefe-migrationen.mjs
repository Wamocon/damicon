// Prueft Migrationsdateien, bevor sie auf eine gehostete Datenbank duerfen.
//
// Warum: `supabase db push` wendet nur Migrationen an, die NEUER sind als die letzte
// angewendete. Eine nachtraeglich eingefuegte aeltere Datei oder eine geaenderte, schon
// angewendete Datei wird stillschweigend nicht ausgefuehrt: lokal und in der CI (frische
// Datenbank) sieht alles gruen aus, die gehostete Datenbank weicht ab. Diese Pruefung faengt
// das in der Pull Request ab.
//
// Regeln:
//  1. Dateiname <14 Ziffern>_<name>.sql, Versionen eindeutig.
//  2. Neue Migrationen muessen NEUER sein als jede Migration auf dem Basis-Branch.
//  3. Bereits vorhandene Migrationen duerfen nicht geaendert, umbenannt oder geloescht werden.
//  4. Zerstoerende Anweisungen (DROP TABLE/COLUMN/SCHEMA, TRUNCATE, DELETE ohne WHERE) brauchen
//     in der Datei die ausdrueckliche Freigabe "-- migration:destruktiv-ok".
//
// Aufruf:  node scripts/pruefe-migrationen.mjs [--basis origin/main]

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const NAME = /^(\d{14})_[a-z0-9_]+\.sql$/;
const FREIGABE = "-- migration:destruktiv-ok";

/** Entfernt Kommentare und Zeichenketten, damit ein Wort in einem Kommentar keinen Fehlalarm ausloest. */
function ohneKommentare(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

export function zerstoerendeAnweisungen(sql) {
  const s = ohneKommentare(sql);
  const treffer = [];
  for (const m of s.matchAll(/\bdrop\s+(table|column|schema)\b/gi)) treffer.push(m[0].replace(/\s+/g, " ").toUpperCase());
  for (const m of s.matchAll(/\btruncate\b/gi)) treffer.push("TRUNCATE");
  for (const stmt of s.split(";")) {
    if (/\bdelete\s+from\b/i.test(stmt) && !/\bwhere\b/i.test(stmt)) treffer.push("DELETE ohne WHERE");
  }
  return treffer;
}

/**
 * @param {{ dateien: string[], inhalte: Record<string,string>, basis?: { dateien: string[], geaendert: string[] } }} eingabe
 *   basis.geaendert: Dateien, die es auf dem Basis-Branch gibt und die sich unterscheiden (geaendert, umbenannt, geloescht).
 * @returns {string[]} Fehlermeldungen (leer = in Ordnung)
 */
export function pruefe({ dateien, inhalte, basis }) {
  const fehler = [];
  const versionen = new Map();
  for (const d of dateien) {
    const m = NAME.exec(d);
    if (!m) {
      fehler.push(`${d}: Name muss <14 Ziffern>_<name in Kleinbuchstaben>.sql lauten`);
      continue;
    }
    if (versionen.has(m[1])) fehler.push(`${d}: Version ${m[1]} ist schon vergeben (${versionen.get(m[1])})`);
    versionen.set(m[1], d);
  }
  if (!basis) return fehler;

  const basisVersionen = basis.dateien.map((d) => NAME.exec(d)?.[1]).filter(Boolean);
  const neuesteBasis = basisVersionen.sort().at(-1) ?? "0";
  const neu = dateien.filter((d) => !basis.dateien.includes(d));
  for (const d of neu) {
    const v = NAME.exec(d)?.[1];
    if (v && v <= neuesteBasis) {
      fehler.push(`${d}: ist nicht neuer als die letzte Migration auf dem Basis-Branch (${neuesteBasis}); db push wuerde sie auf einer gehosteten Datenbank ueberspringen. Version erhoehen.`);
    }
    const z = zerstoerendeAnweisungen(inhalte[d] ?? "");
    if (z.length > 0 && !(inhalte[d] ?? "").includes(FREIGABE)) {
      fehler.push(`${d}: zerstoerende Anweisung (${[...new Set(z)].join(", ")}) ohne Freigabe. Bewusst gewollt? Dann die Zeile "${FREIGABE}" in die Datei schreiben.`);
    }
  }
  for (const d of basis.geaendert) {
    fehler.push(`${d}: bereits vorhandene Migration wurde geaendert, umbenannt oder geloescht. Eine schon angewendete Migration wird nicht erneut ausgefuehrt; Aenderungen gehoeren in eine neue Migration.`);
  }
  return fehler;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function main() {
  const i = process.argv.indexOf("--basis");
  const basisRef = i > 0 ? process.argv[i + 1] : null;
  const ordner = "supabase/migrations";
  const dateien = readdirSync(ordner).filter((f) => f.endsWith(".sql")).sort();
  const inhalte = Object.fromEntries(dateien.map((d) => [d, readFileSync(join(ordner, d), "utf8")]));
  let basis;
  if (basisRef) {
    const inBasis = git("ls-tree", "--name-only", basisRef, `${ordner}/`)
      .split("\n")
      .filter((p) => p.endsWith(".sql"))
      .map((p) => p.slice(ordner.length + 1));
    // Vergleich Basis gegen Arbeitsstand: M/D/R an Dateien, die es in der Basis gibt.
    const geaendert = git("diff", "--name-status", "--no-renames", basisRef, "--", ordner)
      .split("\n")
      .filter(Boolean)
      .map((z) => z.split("\t"))
      .filter(([status, pfad]) => (status === "M" || status === "D") && pfad.endsWith(".sql"))
      .map(([, pfad]) => pfad.slice(ordner.length + 1));
    basis = { dateien: inBasis, geaendert };
  }
  const fehler = pruefe({ dateien, inhalte, basis });
  if (fehler.length > 0) {
    console.error(`Migrationspruefung: ${fehler.length} Problem(e)`);
    for (const f of fehler) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`Migrationspruefung: ${dateien.length} Dateien in Ordnung${basisRef ? ` (gegen ${basisRef})` : ""}.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
