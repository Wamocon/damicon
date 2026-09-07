// =============================================================================
// Malina - Schneller PGlite-Testlauf (Ergaenzung, kein Ersatz)
// =============================================================================
// Ausfuehren:  npm run db:test:fast   (kein Docker, kein `supabase start` noetig)
//
// PGlite ist ein WASM-Build von Postgres, der im Prozess laeuft. Dieser Test
// prueft dieselbe Art von Fachregeln wie supabase/tests/integration.mjs, aber
// ohne PostgREST/GoTrue dazwischen - Rollen und "eingeloggter Nutzer" werden
// direkt per SQL simuliert (SET ROLE + set_config fuer auth.uid()).
//
// Zweck: ein sehr viel schnellerer Vorab-Check waehrend der Entwicklung.
// npm run db:test bleibt die massgebliche Pruefung gegen echtes Postgres -
// PGlite weicht in Detailverhalten (Erweiterungen, Storage-API) vom
// Supabase-Produktivsystem ab. Uebernommen als Idee aus dem Schwesterprojekt
// "Digitalisierung-Himbeerenbetrieb" (dortiges scripts/test-migrations.mjs).
//
// Deckt ab: Migrationen + Seed wenden fehlerfrei an, RLS fuer anon, rollen-
// abhaengige Schreibrechte auf Reihenbloecke, der Sperr-Trigger nach einer
// Pflanzenschutzbehandlung und die Ablehnung eines vorzeitigen Statuswechsels.
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONEN_DIR = join(WURZEL, "supabase", "migrations");
const AUTH_STUB = join(WURZEL, "supabase", "fixtures", "auth-stub.sql");
const SEED = join(WURZEL, "supabase", "seed.sql");

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Simuliert "eingeloggt als" ohne PostgREST: Postgres-Rolle + auth.uid(). */
async function alsRolle(db, rolle, authUserId = null) {
  await db.exec(`set role ${rolle};`);
  await db.query("select set_config('request.jwt.claim.role', $1, false);", [rolle]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false);", [authUserId ?? ""]);
}
async function alsAdmin(db) {
  await db.exec("reset role;");
}

/** Erwartet, dass die Anweisung mit diesem errcode scheitert. */
async function mussScheitern(db, name, sql, params, erwarteterCode) {
  try {
    await db.query(sql, params);
    check(name, false, "die Anweisung war erfolgreich, erwartet war ein Fehler");
  } catch (e) {
    const code = e?.cause?.code ?? e?.code;
    check(name, code === erwarteterCode, `errcode: ${code ?? String(e).slice(0, 80)}`);
  } finally {
    await db.exec("reset role;");
  }
}

const db = new PGlite();

console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);

// --- 0. Grundlagen, Migrationen, Seed ---------------------------------------
try {
  await db.exec(readFileSync(AUTH_STUB, "utf8"));
  check("Grundlagen: auth-/storage-Stub angelegt", true);

  const dateien = readdirSync(MIGRATIONEN_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const datei of dateien) {
    await db.exec(readFileSync(join(MIGRATIONEN_DIR, datei), "utf8"));
  }
  check(`Migrationen angewendet (${dateien.length} Dateien)`, true);

  await db.exec(readFileSync(SEED, "utf8"));
  check("Seed-Daten angewendet", true);
} catch (e) {
  check("Migrationen/Seed gegen PGlite anwendbar", false, String(e.message ?? e).slice(0, 200));
  console.log("");
  console.error("Abbruch: ohne Grundlage sind weitere Pruefungen sinnlos.");
  process.exit(1);
}

// --- 1. RLS: anon ------------------------------------------------------------
{
  await alsRolle(db, "anon");
  const { rows: sorten } = await db.query("select id from public.sorten limit 5;");
  check("RLS: anon liest Katalog (sorten)", sorten.length > 0, `Zeilen: ${sorten.length}`);

  const { rows: ledger } = await db.query("select id from public.finance_ledger_entries limit 5;");
  check("RLS: anon sieht keine Finanzdaten", ledger.length === 0, `sichtbare Zeilen: ${ledger.length}`);
  await alsAdmin(db);
}

// --- 2. Zwei Testprofile fuer rollenabhaengige Checks -----------------------
// Die Rolle kommt bewusst aus raw_app_meta_data (nicht raw_user_meta_data) -
// so wie es die Haertungsmigration verlangt (service_role-Weg, nicht
// selbst waehlbar). Der on_auth_user_created-Trigger legt das Profil an.
let leitungAuthId, brigadeAuthId, blockId;
{
  const { rows: leitung } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-leitung@malina.demo', '{"role":"betriebsleitung"}'::jsonb)
     returning id;`,
  );
  const { rows: brigade } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-brigade@malina.demo', '{"role":"brigade"}'::jsonb)
     returning id;`,
  );
  leitungAuthId = leitung[0].id;
  brigadeAuthId = brigade[0].id;

  const { rows: rollen } = await db.query(
    `select auth_user_id, role from public.profiles where auth_user_id in ($1, $2);`,
    [leitungAuthId, brigadeAuthId],
  );
  check(
    "Vorbereitung: Testprofile Betriebsleitung/Brigade per Trigger angelegt",
    rollen.length === 2,
    `angelegte Profile: ${rollen.length}`,
  );

  const { rows: block } = await db.query(
    `select id from public.reihenbloecke where status <> 'wartezeitgesperrt' limit 1;`,
  );
  blockId = block[0]?.id;
  check("Vorbereitung: ein nicht gesperrter Reihenblock gefunden", !!blockId);
}

// --- 3. Rollenabhaengige Schreibrechte auf Reihenbloecke --------------------
{
  await alsRolle(db, "authenticated", brigadeAuthId);
  const brigadeUpdate = await db.query(
    `update public.reihenbloecke set status = 'erntereif' where id = $1;`,
    [blockId],
  );
  check(
    "RLS: Brigade darf den Reihenblockstatus nicht aendern",
    brigadeUpdate.affectedRows === 0,
    `geaenderte Zeilen: ${brigadeUpdate.affectedRows}`,
  );
  await alsAdmin(db);

  await alsRolle(db, "authenticated", leitungAuthId);
  const leitungUpdate = await db.query(
    `update public.reihenbloecke set status = 'erntereif' where id = $1;`,
    [blockId],
  );
  check(
    "RLS: Betriebsleitung darf den Reihenblockstatus aendern",
    leitungUpdate.affectedRows === 1,
    `geaenderte Zeilen: ${leitungUpdate.affectedRows}`,
  );
  await alsAdmin(db);
}

// --- 4. Trigger: Behandlung sperrt den Reihenblock --------------------------
let behandlungId;
{
  const { rows: mittel } = await db.query("select id from public.psm_mittel limit 1;");
  const { rows: behandlung } = await db.query(
    `insert into public.pflanzenschutz_behandlungen
       (reihenblock_id, psm_mittel_id, behandelt_am, wartezeit_tage)
     values ($1, $2, current_date, 3)
     returning id;`,
    [blockId, mittel[0].id],
  );
  behandlungId = behandlung[0].id;

  const { rows: block } = await db.query(
    "select status from public.reihenbloecke where id = $1;",
    [blockId],
  );
  check(
    "Trigger: Behandlung sperrt den Reihenblock (wartezeitgesperrt)",
    block[0].status === "wartezeitgesperrt",
    `Status: ${block[0].status}`,
  );
}

// --- 5. Sperre: vorzeitiger Statuswechsel wird abgelehnt --------------------
await mussScheitern(
  db,
  "Sperre: vorzeitiger Statuswechsel wird abgelehnt",
  "update public.reihenbloecke set status = 'erntereif' where id = $1;",
  [blockId],
  "23514",
);

// --- Aufraeumen ---------------------------------------------------------------
await db.query("delete from public.pflanzenschutz_behandlungen where id = $1;", [behandlungId]);
await db.query("update public.reihenbloecke set status = 'ruhend' where id = $1;", [blockId]);

console.log("");
if (failures > 0) {
  console.error(`${failures} Test(s) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle PGlite-Schnelltests gruen.");
