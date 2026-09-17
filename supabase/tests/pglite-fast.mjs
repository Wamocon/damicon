// =============================================================================
// Damicon - Schneller PGlite-Testlauf (Ergaenzung, kein Ersatz)
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
// Pflanzenschutzbehandlung, die Ablehnung eines vorzeitigen Statuswechsels und
// die Fortschreibung von Menge und Ausschuss in die Charge.
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

  // Compliance-Cockpit (WMCNL-1446): granulares Datenschutz-Schema statt
  // consent_records - auch unter PGlite nur fuer Buero-Rollen lesbar.
  const { rows: zwecke } = await db.query("select id from public.verarbeitungszwecke limit 5;");
  check(
    "Compliance-RLS: anon liest keine Verarbeitungszwecke",
    zwecke.length === 0,
    `sichtbare Zeilen: ${zwecke.length}`,
  );
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
     values ('it-leitung@damicon.demo', '{"role":"betriebsleitung"}'::jsonb)
     returning id;`,
  );
  const { rows: brigade } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-brigade@damicon.demo', '{"role":"brigade"}'::jsonb)
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

// --- 6. Oeffentliche Herkunftsauskunft (WMCNL-1456) -------------------------
// Schneller Vorab-Check der drei wichtigsten Eigenschaften; der massgebliche
// Nachweis, dass SECURITY DEFINER die "force row level security" aus
// 20260905160000_haerten.sql zuverlaessig umgeht, bleibt der echte
// db:test-Lauf (siehe Kommentar am Dateikopf).
{
  const { rows: charge } = await db.query(
    "select oeffentlicher_code from public.chargen where oeffentlicher_code is not null limit 1;",
  );
  const echterCode = charge[0]?.oeffentlicher_code;
  check(
    "Herkunft: eine Seed-Charge traegt einen gueltigen oeffentlichen Code",
    typeof echterCode === "string" && /^hk_[0-9a-f]{16}$/.test(echterCode),
    `code: ${echterCode}`,
  );

  await alsRolle(db, "anon");

  const { rows: treffer } = await db.query(
    "select * from public.herkunftsauskunft($1);",
    [echterCode],
  );
  check(
    "Herkunft: anon liest ueber den echten Code eine Zeile (SECURITY DEFINER umgeht RLS)",
    treffer.length === 1,
    `Zeilen: ${treffer.length}`,
  );

  const { rows: keinTreffer } = await db.query(
    "select * from public.herkunftsauskunft($1);",
    ["hk_0000000000000000"],
  );
  check(
    "Herkunft: anon liest ueber einen falschen Code keine Zeile",
    keinTreffer.length === 0,
    `Zeilen: ${keinTreffer.length}`,
  );

  const { rows: chargenDirekt } = await db.query("select id from public.chargen limit 5;");
  check(
    "Herkunft-Regression: anon liest chargen weiterhin nicht direkt",
    chargenDirekt.length === 0,
    `Zeilen: ${chargenDirekt.length}`,
  );

  await alsAdmin(db);
}

// --- 7. Ausschuss wandert in die Charge (Verlustquote) ----------------------
// Regression: 20260911000000_geraete_zeitstempel.sql hat aufgabe_fortschreiben()
// ohne die Ausschuss-Fortschreibung aus 20260905200000_kette_haerten.sql neu
// definiert - chargen.ausschuss_kg blieb 0, die Verlustquote (kpi_aktuell)
// rechnete fuer jede neu gemeldete Charge null Verlust. Geprueft wird ueber den
// echten App-Weg: die Brigade meldet per sync_menge_melden().
{
  await alsRolle(db, "authenticated", leitungAuthId);
  const { rows: freierBlock } = await db.query(
    `select id from public.reihenbloecke
      where status <> 'wartezeitgesperrt' and id <> $1
      limit 1;`,
    [blockId],
  );
  const { rows: aufgabe } = await db.query(
    `insert into public.pflueckaufgaben (code, reihenblock_id, zielmenge_kg)
     values ('PA-PGLITE-AUSSCHUSS', $1, 20)
     returning id;`,
    [freierBlock[0].id],
  );
  const aufgabeId = aufgabe[0].id;
  await db.query(
    "update public.pflueckaufgaben set status = 'in_arbeit' where id = $1;",
    [aufgabeId],
  );
  await alsAdmin(db);

  const chargeAusschuss = async () => {
    const { rows } = await db.query(
      "select menge_kg, ausschuss_kg from public.chargen where pflueckaufgabe_id = $1;",
      [aufgabeId],
    );
    return rows[0];
  };

  await alsRolle(db, "authenticated", brigadeAuthId);
  const { rows: meldung } = await db.query(
    "select * from public.sync_menge_melden($1, $2, $3, $4);",
    [crypto.randomUUID(), aufgabeId, 18.5, 1.5],
  );
  await alsAdmin(db);
  const nachMeldung = await chargeAusschuss();
  check(
    "Kette: gemeldeter Ausschuss landet in der Charge",
    meldung[0]?.ergebnis === "angewendet" &&
      Number(nachMeldung?.menge_kg) === 18.5 &&
      Number(nachMeldung?.ausschuss_kg) === 1.5,
    `ergebnis: ${meldung[0]?.ergebnis}, menge_kg: ${nachMeldung?.menge_kg}, ausschuss_kg: ${nachMeldung?.ausschuss_kg}`,
  );

  // Korrektur in der Belegpruefung: nur der Ausschuss aendert sich, die Menge
  // bleibt - auch das muss die Charge erreichen.
  await alsRolle(db, "authenticated", brigadeAuthId);
  await db.query("select * from public.sync_menge_melden($1, $2, $3, $4);", [
    crypto.randomUUID(),
    aufgabeId,
    18.5,
    2.25,
  ]);
  await alsAdmin(db);
  const nachKorrektur = await chargeAusschuss();
  check(
    "Kette: eine reine Ausschuss-Korrektur landet ebenfalls in der Charge",
    Number(nachKorrektur?.ausschuss_kg) === 2.25,
    `ausschuss_kg: ${nachKorrektur?.ausschuss_kg}`,
  );

  // alsAdmin() setzt nur die Rolle zurueck, nicht auth.uid() - ohne das
  // Leeren wuerde das Aufraeumen unten als Brigade laufen und an
  // block_erntebuchung_mutation() scheitern.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 8. Lesezugriff auf Betriebsdaten nach Rolle ----------------------------
// Regression: 20260905160000_haerten.sql hat die Betriebsdaten pauschal fuer
// jede angemeldete Rolle lesbar gemacht (using(true)). picker und kunde sahen
// damit ueber die REST-API Chargen, Aufgaben, Reihenbloecke und Brigaden,
// obwohl rbac.ts ihnen kein solches Modul zeigt. 20261015000000 verengt das.
{
  const anlegen = async (email, rolle) => {
    const { rows } = await db.query(
      `insert into auth.users (email, raw_app_meta_data)
       values ($1, jsonb_build_object('role', $2::text))
       returning id;`,
      [email, rolle],
    );
    return rows[0].id;
  };
  const pickerAuthId = await anlegen("it-picker@damicon.demo", "picker");
  const kundeAuthId = await anlegen("it-kunde@damicon.demo", "kunde");
  const erzeugerAuthId = await anlegen("it-erzeuger@damicon.demo", "erzeuger");

  // Der Kunde bekommt den B2B-Kunden der ersten Seed-Reklamation - nur ueber
  // diese Reklamation soll er spaeter genau eine Charge sehen.
  const { rows: rek } = await db.query(
    `select b2b_kunde_id, charge_id from public.reklamationen
      where charge_id is not null limit 1;`,
  );
  await db.query(
    "update public.profiles set b2b_kunde_id = $1 where auth_user_id = $2;",
    [rek[0].b2b_kunde_id, kundeAuthId],
  );

  const zaehle = async (tabelle) => {
    const { rows } = await db.query(`select count(*)::int as n from public.${tabelle};`);
    return rows[0].n;
  };

  await alsAdmin(db);
  const chargenGesamt = await zaehle("chargen");

  await alsRolle(db, "authenticated", pickerAuthId);
  const picker = {
    aufgaben: await zaehle("pflueckaufgaben"),
    chargen: await zaehle("chargen"),
    bloecke: await zaehle("reihenbloecke"),
    brigaden: await zaehle("brigaden"),
  };
  await alsAdmin(db);
  check(
    "RLS: picker liest keine Betriebsdaten mehr",
    picker.aufgaben === 0 && picker.chargen === 0 && picker.bloecke === 0 && picker.brigaden === 0,
    `Aufgaben ${picker.aufgaben}, Chargen ${picker.chargen}, Bloecke ${picker.bloecke}, Brigaden ${picker.brigaden}`,
  );

  await alsRolle(db, "authenticated", kundeAuthId);
  const kunde = {
    aufgaben: await zaehle("pflueckaufgaben"),
    bloecke: await zaehle("reihenbloecke"),
    chargen: await zaehle("chargen"),
  };
  await alsAdmin(db);
  check(
    "RLS: kunde liest keine Aufgaben und Reihenbloecke",
    kunde.aufgaben === 0 && kunde.bloecke === 0,
    `Aufgaben ${kunde.aufgaben}, Bloecke ${kunde.bloecke}`,
  );
  check(
    "RLS: kunde liest genau die Charge hinter der eigenen Reklamation",
    kunde.chargen > 0 && kunde.chargen < chargenGesamt,
    `sichtbar ${kunde.chargen} von ${chargenGesamt}`,
  );

  await alsRolle(db, "authenticated", erzeugerAuthId);
  const erzeuger = {
    bloecke: await zaehle("reihenbloecke"),
    aufgaben: await zaehle("pflueckaufgaben"),
  };
  await alsAdmin(db);
  check(
    "RLS: erzeuger behaelt die Produktionssicht (rbac: view reihenbloecke/pflueckaufgaben)",
    erzeuger.bloecke > 0 && erzeuger.aufgaben > 0,
    `Bloecke ${erzeuger.bloecke}, Aufgaben ${erzeuger.aufgaben}`,
  );

  await alsRolle(db, "authenticated", brigadeAuthId);
  const brigadeAufgaben = await zaehle("pflueckaufgaben");
  const brigadeChargen = await zaehle("chargen");
  await alsAdmin(db);
  check(
    "RLS: Brigade liest Aufgaben und Chargen weiterhin",
    brigadeAufgaben > 0 && brigadeChargen > 0,
    `Aufgaben ${brigadeAufgaben}, Chargen ${brigadeChargen}`,
  );

  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- Aufraeumen ---------------------------------------------------------------
await db.query("delete from public.pflanzenschutz_behandlungen where id = $1;", [behandlungId]);
await db.query("update public.reihenbloecke set status = 'ruhend' where id = $1;", [blockId]);

console.log("");
if (failures > 0) {
  console.error(`${failures} Test(s) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle PGlite-Schnelltests gruen.");
