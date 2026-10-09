// Tests fuer .claude/hooks/cloud-datenbank-sperre.mjs (reine Logik) und fuer das Hook-Protokoll (Exitcode).
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nurLesend, pruefe } from "../../.claude/hooks/cloud-datenbank-sperre.mjs";

let fehlgeschlagen = 0;
let gesamt = 0;
function check(name, bedingung, detail = "") {
  gesamt++;
  if (bedingung) console.log(`PASS  ${name}`);
  else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

const bash = (befehl) => pruefe("Bash", { command: befehl });
const gesperrt = (name, befehl) => check(`gesperrt: ${name}`, bash(befehl) !== null, befehl);
const erlaubt = (name, befehl) => check(`erlaubt: ${name}`, bash(befehl) === null, `${befehl} -> ${bash(befehl)}`);

// --- Bash: gesperrt ---------------------------------------------------------
gesperrt("db push", "supabase db push");
gesperrt("db push --linked", "supabase db push --linked");
gesperrt("db push mit --db-url", "supabase db push --db-url postgresql://x");
gesperrt("db push, auch mit npx davor", "npx supabase db push --linked --dry-run");
gesperrt("migration repair", "supabase migration repair --status applied 20261001000000");
gesperrt("migration up gegen die Cloud", "supabase migration up --linked");
gesperrt("db reset gegen die Cloud", "supabase db reset --linked");
gesperrt("db query mit INSERT", `supabase db query --linked "insert into public.x values (1)"`);
gesperrt("db query mit ALTER", `supabase db query --linked 'alter table public.x add column a int'`);
gesperrt("db query mit NOTIFY", `supabase db query --linked "notify pgrst, 'reload schema'"`);
gesperrt("db query ohne erkennbares SQL", "supabase db query --linked");
gesperrt("db query mit Datei, die es nicht gibt", "supabase db query --linked -f /gibt/es/nicht.sql");
gesperrt("psql gegen supabase.co", "psql postgresql://postgres:pw@db.abcdef.supabase.co:5432/postgres -c 'select 1'");

// --- Bash: erlaubt ----------------------------------------------------------
erlaubt("db push gegen den lokalen Stack", "supabase db push --local");
erlaubt("db reset lokal", "supabase db reset");
erlaubt("migration up lokal", "supabase migration up");
erlaubt("migration new", "supabase migration new mein_name");
erlaubt("supabase start", "supabase start");
erlaubt("db dump gegen die Cloud (liest nur)", "supabase db dump --linked -s public -f out.sql");
erlaubt("db query gegen die Cloud mit SELECT", `supabase db query --linked "select version from supabase_migrations.schema_migrations"`);
erlaubt("db query mit Kommentar und SELECT", `supabase db query --linked "-- Verlauf lesen\nselect 1"`);
erlaubt("db query lokal mit INSERT", `supabase db query --local "insert into public.x values (1)"`);
erlaubt("migration list", "supabase migration list --linked");
erlaubt("npm test", "npm run db:test:fast");
erlaubt("Commit-Meldung nennt den Befehl nur", `git commit -m "docs: supabase db push ist gesperrt"`);
erlaubt("Heredoc-Text nennt den Befehl nur", "git commit -m \"$(cat <<'EOF'\nsupabase db push --linked ist gesperrt\nEOF\n)\"");
erlaubt("echo mit dem Befehl in Anfuehrungszeichen", `echo 'supabase db push'`);
erlaubt("psql lokal", "psql postgresql://postgres:postgres@127.0.0.1:54322/postgres -c 'select 1'");
erlaubt("gewoehnliche Befehle", "git status && ls supabase/migrations");

// --- db query mit Datei ------------------------------------------------------
const ordner = mkdtempSync(join(tmpdir(), "sperre-"));
try {
  const lesen = join(ordner, "lesen.sql");
  const schreiben = join(ordner, "schreiben.sql");
  writeFileSync(lesen, "select count(*) from public.profiles;");
  writeFileSync(schreiben, "delete from public.profiles;");
  erlaubt("db query -f mit lesender Datei", `supabase db query --linked -f ${lesen}`);
  gesperrt("db query -f mit schreibender Datei", `supabase db query --linked -f ${schreiben}`);

  // --- Hook-Protokoll: Exitcode und Meldung ------------------------------------
  const hook = join(".claude", "hooks", "cloud-datenbank-sperre.mjs");
  const lauf = (eingabe, env = {}) =>
    spawnSync(process.execPath, [hook], { input: JSON.stringify(eingabe), encoding: "utf8", env: { ...process.env, DAMICON_CLOUD_DB_FREIGABE: "", ...env } });
  const sperre = lauf({ tool_name: "Bash", tool_input: { command: "supabase db push --linked" } });
  check("Hook beendet gesperrte Aufrufe mit Exitcode 2", sperre.status === 2, `Status ${sperre.status}`);
  check("Hook nennt die Regel auf stderr", /supabase\/migrations/.test(sperre.stderr) && /CLAUDE\.md/.test(sperre.stderr));
  const frei = lauf({ tool_name: "Bash", tool_input: { command: "git status" } });
  check("Hook laesst harmlose Aufrufe mit Exitcode 0 durch", frei.status === 0 && frei.stderr === "", `Status ${frei.status}`);
  const notfall = lauf({ tool_name: "Bash", tool_input: { command: "supabase db push --linked" } }, { DAMICON_CLOUD_DB_FREIGABE: "1" });
  check("Freigabe aus der Umgebung hebt die Sperre auf", notfall.status === 0, `Status ${notfall.status}`);
  const praefix = lauf({ tool_name: "Bash", tool_input: { command: "DAMICON_CLOUD_DB_FREIGABE=1 supabase db push --linked" } });
  check("Freigabe als Praefix im Befehl wirkt nicht", praefix.status === 2, `Status ${praefix.status}`);
  const kaputt = spawnSync(process.execPath, [hook], { input: "kein json", encoding: "utf8" });
  check("unlesbare Eingabe sperrt nicht", kaputt.status === 0, `Status ${kaputt.status}`);
} finally {
  rmSync(ordner, { recursive: true, force: true });
}

// --- MCP ---------------------------------------------------------------------
const mcp = (werkzeug, eingabe) => pruefe(werkzeug, eingabe);
check("gesperrt: MCP apply_migration", mcp("mcp__supabase__apply_migration", { name: "x", query: "select 1" }) !== null);
check("gesperrt: MCP apply_migration (Plugin-Name)", mcp("mcp__plugin_supabase_supabase__apply_migration", { name: "x", query: "create table t()" }) !== null);
check("gesperrt: MCP execute_sql mit DROP", mcp("mcp__supabase__execute_sql", { query: "drop table public.x" }) !== null);
check("erlaubt: MCP execute_sql mit SELECT", mcp("mcp__supabase__execute_sql", { query: "select 1" }) === null);
check("erlaubt: MCP list_tables", mcp("mcp__supabase__list_tables", {}) === null);
check("erlaubt: fremdes MCP-Werkzeug", mcp("mcp__playwright__browser_click", { query: "drop table" }) === null);
check("erlaubt: Read", pruefe("Read", { file_path: "x" }) === null);

// --- nurLesend ---------------------------------------------------------------
check("nurLesend: select", nurLesend("select * from public.profiles where role = 'admin'"));
check("nurLesend: with ... select", nurLesend("with a as (select 1) select * from a"));
check("nurLesend: Spaltenname created_at ist kein CREATE", nurLesend("select created_at, updated_at from public.x"));
check("nurLesend: Wort in Zeichenkette zaehlt nicht", nurLesend("select 'drop table x'"));
check("nurLesend: Wort im Kommentar zaehlt nicht", nurLesend("-- delete from x\nselect 1"));
check("nurLesend: WITH ... DELETE ist schreibend", !nurLesend("with d as (delete from t returning *) select * from d"));
check("nurLesend: leeres SQL gilt nicht als lesend", !nurLesend("   "));
check("nurLesend: DO-Block ist schreibend", !nurLesend("do $$ begin perform 1; end $$"));

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
