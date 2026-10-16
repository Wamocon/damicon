// Spielt die Testdaten-Migrationen (*_testdaten_*.sql) in den lokalen Supabase-Stack ein.
//
// Warum: Die Migrationen laufen beim Aufbau einer frischen Datenbank, bevor supabase/seed.sql die Stammdaten (Betrieb, Reihenblöcke,
// Sorten, Kunden) anlegt. Sie erkennen die leere Datenbank und ändern nichts. Nach `supabase db reset --local` und `npm run db:seed-auth`
// holt dieses Skript sie nach, in der Reihenfolge der Versionsnummern. Jede Migration ist idempotent: ein zweiter Lauf ändert nichts.
//
// Aufruf:  npm run db:testdaten-lokal
//
// Ziel ist ausschließlich der lokale Container (Standard supabase_db_damicon, überschreibbar mit SUPABASE_DB_CONTAINER). Gegen die
// Cloud-Datenbank läuft nichts: Dort kommen die Testdaten über die Migrations-Workflows (Preview beim Push, public nach dem Merge).
// Zurücknehmen: supabase/testdaten-entfernen.sql.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const CONTAINER = process.env.SUPABASE_DB_CONTAINER ?? "supabase_db_damicon";
const ORDNER = "supabase/migrations";

// Testdaten-Migration ist, was nach Namen passt UND die Kennung der Testdaten trägt (die ältere Bereinigung vom 20.09.2026 trägt sie nicht).
const KENNUNG = "7e57da7a-0000-4000-8000-";
const dateien = readdirSync(ORDNER)
  .filter((f) => /^\d{14}_testdaten_[a-z0-9_]+\.sql$/.test(f))
  .filter((f) => readFileSync(join(ORDNER, f), "utf8").includes(KENNUNG))
  .sort();

if (dateien.length === 0) {
  console.error(`Keine Testdaten-Migration in ${ORDNER} gefunden.`);
  process.exit(1);
}

for (const datei of dateien) {
  const sql = readFileSync(join(ORDNER, datei), "utf8");
  try {
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        CONTAINER,
        "psql",
        "-U",
        "postgres",
        "-v",
        "ON_ERROR_STOP=1",
        "-1",
        "-q",
      ],
      {
        input: sql,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    console.log(`ok       ${datei}`);
  } catch (fehler) {
    const meldung = String(fehler.stderr ?? fehler.message)
      .split("\n")
      .filter((z) => z.trim())[0];
    console.error(`FEHLER   ${datei}: ${meldung}`);
    process.exit(1);
  }
}
console.log(`\n${dateien.length} Testdaten-Migrationen eingespielt.`);
