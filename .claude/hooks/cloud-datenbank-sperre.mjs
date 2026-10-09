// PreToolUse-Hook fuer Claude Code: sperrt Schreibzugriffe auf die gehostete Supabase-Datenbank.
//
// Regel (siehe CLAUDE.md, Abschnitt "Datenbankmigrationen"): Jede Aenderung an der Datenbank steht als
// Datei unter supabase/migrations/ und geht per Pull Request durch die Migrations-Workflows. Ein direkter
// Zugriff auf die Cloud-Datenbank laeuft an diesen Workflows vorbei und hinterlaesst Drift.
//
// Gesperrt:
//   Bash: supabase db push, supabase migration up/repair/squash/down gegen die Cloud,
//         supabase db reset --linked, supabase db query gegen die Cloud mit schreibendem SQL,
//         psql gegen supabase.co / supabase.com
//   MCP : Supabase "apply_migration" immer, "execute_sql" mit schreibendem SQL
// Erlaubt: lokaler Stack (--local, supabase start, db reset ohne --linked), lesende Abfragen (select, show,
//          explain), supabase db dump/lint/diff, alle Befehle der CI.
//
// Das ist eine Leitplanke gegen Versehen, kein Sicherheitsrand: wer sie umgehen will, kann es. Der
// Drift-Check (datenbank-drift.yml) meldet, was trotzdem durchrutscht. Ausnahme fuer Notfaelle setzt
// nur ein Mensch vor dem Start von Claude: DAMICON_CLOUD_DB_FREIGABE=1 (aus der Umgebung des Hooks,
// nicht aus dem Befehl; ein Praefix im Befehl wirkt nicht).
//
// Protokoll: JSON auf stdin ({ tool_name, tool_input }); Exitcode 2 mit Text auf stderr sperrt den Aufruf.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SCHREIBEND =
  /\b(insert|update|delete|alter|create|drop|truncate|grant|revoke|merge|copy|call|do|vacuum|reindex|cluster|notify|listen|set|reset|comment|refresh|lock|security|import|discard)\b/i;

/** Entfernt Kommentare und Zeichenketten, damit ein Wort darin nicht als Anweisung zaehlt. */
function ohneTextteile(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\$([A-Za-z_]*)\$[\s\S]*?\$\1\$/g, "''")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

/** true, wenn das SQL nur liest. Im Zweifel (Funktionsaufrufe mit Nebenwirkung) nicht erkennbar: best effort. */
export function nurLesend(sql) {
  const s = ohneTextteile(sql).trim();
  if (!s) return false;
  return !SCHREIBEND.test(s);
}

/** Entfernt Zeichenketten und Heredoc-Texte, damit ein Befehlsname in einer Commit-Meldung nicht sperrt. */
function ohneZeichenketten(befehl) {
  return befehl
    .replace(/<<-?\s*(['"]?)(\w+)\1[\s\S]*?\n\s*\2\b/g, " ")
    .replace(/'[^']*'/g, "''")
    .replace(/"(?:[^"\\]|\\.)*"/g, '""');
}

const meldung = (was) =>
  `Gesperrt: ${was}. Datenbankaenderungen gehen nur als Datei unter supabase/migrations/ per Pull Request durch die ` +
  `Migrations-Workflows (CLAUDE.md, Abschnitt "Datenbankmigrationen"). Lokal testen: npm run db:test:fast oder der lokale ` +
  `Supabase-Stack. Eine Migration ohne Datei bekommen die Workflows nicht mit.`;

/** SQL einer "supabase db query"-Zeile: Text in Anfuehrungszeichen oder Datei hinter -f / --file. */
function sqlAusDbQuery(befehl) {
  const datei = /(?:\s-f|\s--file)(?:\s+|=)(\S+)/.exec(befehl)?.[1]?.replace(/^['"]|['"]$/g, "");
  if (datei) {
    try {
      return readFileSync(datei, "utf8");
    } catch {
      return null;
    }
  }
  const text = /db\s+query\b([\s\S]*)$/.exec(befehl)?.[1] ?? "";
  const quoted = [...text.matchAll(/'([^']*)'|"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1] ?? m[2]);
  return quoted.length ? quoted.join("\n") : null;
}

/** @returns {string | null} Sperrgrund oder null, wenn der Aufruf erlaubt ist */
export function pruefeBash(befehl) {
  const roh = String(befehl ?? "");
  const b = ohneZeichenketten(roh);
  const cloud = /--linked\b|--db-url\b/.test(roh);
  const lokal = /--local\b/.test(roh) && !cloud;

  if (/\bsupabase\s+db\s+push\b/.test(b) && !lokal) return meldung("supabase db push wendet Migrationen an der Workflow-Pruefung vorbei an");
  if (/\bsupabase\s+migration\s+repair\b/.test(b) && !lokal) return meldung("supabase migration repair veraendert den Migrationsverlauf der Cloud");
  if (/\bsupabase\s+migration\s+(up|down|squash)\b/.test(b) && cloud) return meldung("supabase migration gegen die Cloud");
  if (/\bsupabase\s+db\s+reset\b/.test(b) && cloud) return meldung("supabase db reset gegen die Cloud wuerde Daten loeschen");
  if (/\bsupabase\s+db\s+query\b/.test(b) && cloud) {
    const sql = sqlAusDbQuery(roh);
    if (sql === null) return meldung("supabase db query gegen die Cloud: das SQL ist nicht erkennbar (Datei fehlt oder keine Anweisung im Befehl)");
    if (!nurLesend(sql)) return meldung("supabase db query gegen die Cloud mit schreibendem SQL");
  }
  if (/\bpsql\b/.test(b) && /supabase\.(co|com)\b/.test(roh)) return meldung("psql gegen die gehostete Supabase-Datenbank");
  return null;
}

/** @returns {string | null} */
export function pruefeMcp(werkzeug, eingabe) {
  if (!/supabase/i.test(werkzeug)) return null;
  if (/apply_migration$/i.test(werkzeug)) return meldung("MCP apply_migration legt eine Migration ohne Datei im Repository an");
  if (/execute_sql$/i.test(werkzeug)) {
    const sql = eingabe?.query ?? eingabe?.sql ?? "";
    if (!nurLesend(String(sql))) return meldung("MCP execute_sql mit schreibendem SQL");
  }
  return null;
}

export function pruefe(werkzeug, eingabe) {
  if (werkzeug === "Bash" || werkzeug === "PowerShell") return pruefeBash(eingabe?.command);
  if (werkzeug.startsWith("mcp__")) return pruefeMcp(werkzeug, eingabe);
  return null;
}

function main() {
  if (process.env.DAMICON_CLOUD_DB_FREIGABE === "1") return;
  let daten;
  try {
    daten = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    return; // kein lesbarer Aufruf: nicht sperren
  }
  const grund = pruefe(String(daten.tool_name ?? ""), daten.tool_input);
  if (grund) {
    process.stderr.write(`${grund}\n`);
    process.exit(2);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
