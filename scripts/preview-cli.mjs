// Gemeinsame Helfer fuer preview-migrationen.mjs und preview-abgleich.mjs: Ziel aus den Argumenten
// lesen und die Supabase-CLI aufrufen. CLI: SUPABASE_CLI (Pfad zu supabase oder zu dist/supabase.js),
// sonst "supabase" aus dem PATH.

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** --linked | --local | --db-url <url> als Argumente fuer die CLI, sonst null. */
export function zielAus(args) {
  if (args.includes("--db-url")) return ["--db-url", args[args.indexOf("--db-url") + 1]];
  if (args.includes("--local")) return ["--local"];
  if (args.includes("--linked")) return ["--linked"];
  return null;
}

export function cli(parameter) {
  const pfad = process.env.SUPABASE_CLI || "supabase";
  const [prog, vorne] = pfad.endsWith(".js") ? [process.execPath, [pfad]] : [pfad, []];
  try {
    return execFileSync(prog, [...vorne, ...parameter], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 256 * 1024 * 1024,
    });
  } catch (e) {
    const meldung = `${e.stdout ?? ""}${e.stderr ?? ""}`.replace(/(Initialising login role|Connecting to [a-z ]+database)\.\.\.\s*/g, "").trim();
    throw new Error(meldung || e.message);
  }
}

/** Fuehrt eine einzelne SQL-Anweisung aus und liefert ihre Zeilen. */
export function abfrage(ziel, sql) {
  const ordner = mkdtempSync(join(tmpdir(), "preview-sql-"));
  try {
    const datei = join(ordner, "abfrage.sql");
    writeFileSync(datei, sql);
    // --agent no: sonst verpackt die CLI das Ergebnis anders, sobald sie einen KI-Agenten erkennt
    const aus = cli(["db", "query", ...ziel, "-f", datei, "--output-format", "json", "--agent", "no"]);
    const start = aus.search(/[[{]/);
    if (start < 0) return [];
    const ende = Math.max(aus.lastIndexOf("]"), aus.lastIndexOf("}"));
    let daten;
    try {
      daten = JSON.parse(aus.slice(start, ende + 1));
    } catch {
      throw new Error(`Antwort der Supabase-CLI nicht lesbar: ${aus.slice(0, 300)}`);
    }
    return Array.isArray(daten) ? daten : (daten.rows ?? []);
  } finally {
    rmSync(ordner, { recursive: true, force: true });
  }
}
