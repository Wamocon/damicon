// Ruft die Supabase-CLI genau so auf, wie es in den Workflows stand ("supabase db push --linked"), und wiederholt den Aufruf, wenn die Anmeldung an der
// Datenbank abgelehnt wird. Aufruf: node scripts/supabase-wiederholen.mjs <Argumente der CLI>
//
// Warum: Die CLI legt für jeden Aufruf die Anmelderolle cli_login_postgres mit neuem Kennwort an. Starten zwei Workflows zugleich (der Push auf main startet
// "Datenbank-Migration" und "Datenbank-Migration Preview" im selben Augenblick), setzt der eine das Kennwort des anderen zurück und dieser scheitert mit
// "password authentication failed for user cli_login_postgres". Am 16.10.2026 traf das zuerst die Preview-Läufe nach #156 und danach die Nachprüfung der
// Production-Migration nach #157 (die Migrationen waren da schon angewendet, der Lauf stand trotzdem rot und das Neuladen des Schemas wurde übersprungen).
//
// Wiederholt wird nur dieser Fehler (ANMELDUNG_ABGELEHNT, wie in preview-cli.mjs): er tritt auf, bevor die CLI eine Anweisung ausführt, ein zweiter Versuch kann
// also nichts doppelt anwenden. Jeder andere Fehler gilt sofort, mit dem Exitcode der CLI. Versuche und Pause stellen SUPABASE_CLI_VERSUCHE (Standard 4) und
// SUPABASE_CLI_PAUSE (Sekunden, Standard 20, wächst je Versuch) um. Standard- und Fehlerausgabe der CLI bleiben getrennt, der Aufruf kann also wie
// bisher in "| tee datei.txt" und "grep" münden.

import { spawnSync } from "node:child_process";
import { ANMELDUNG_ABGELEHNT, cliProgramm, warte } from "./preview-cli.mjs";

const parameter = process.argv.slice(2);
if (parameter.length === 0) {
  console.error("Aufruf: node scripts/supabase-wiederholen.mjs <Argumente der Supabase-CLI>");
  process.exit(2);
}

const versuche = Number(process.env.SUPABASE_CLI_VERSUCHE ?? 4);
const pause = Number(process.env.SUPABASE_CLI_PAUSE ?? 20);
const [programm, vorne] = cliProgramm();

for (let versuch = 1; ; versuch++) {
  const r = spawnSync(programm, [...vorne, ...parameter], { encoding: "utf8", stdio: ["inherit", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024 });
  const aus = r.stdout ?? "";
  const fehler = r.stderr ?? "";
  const abgelehnt = r.status !== 0 && ANMELDUNG_ABGELEHNT.test(`${aus}${fehler}`);
  if (abgelehnt && versuch < versuche) {
    process.stderr.write(fehler);
    console.error(`Anmeldung an der Datenbank abgelehnt (Versuch ${versuch} von ${versuche}), vermutlich ein gleichzeitiger Lauf. Neuer Versuch in ${pause * versuch} Sekunden.`);
    warte(pause * versuch);
    continue;
  }
  process.stdout.write(aus);
  process.stderr.write(fehler);
  if (r.error) console.error(`Die Supabase-CLI konnte nicht gestartet werden: ${r.error.message}`);
  process.exitCode = r.status ?? 1;
  break;
}
