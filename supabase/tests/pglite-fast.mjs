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
    .filter((f) => f.endsWith(".sql") && !f.endsWith("_pgvector.sql"))
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
// obwohl rbac.ts ihnen kein solches Modul zeigt. 20261023000000 verengt das.
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

// --- 9. Kuehlkette: Messzeitpunkt kommt vom Server --------------------------
// Regression: kuehlkette_bewerten() uebernahm einen mitgegebenen gemessen_am
// unveraendert. Die Rolle brigade hat eine INSERT-Policy auf
// kuehlketten_messungen - ein direkter REST-Aufruf konnte damit aus einem
// 75-Minuten-Verstoss ein "ok" machen. 20261016000000 setzt den Zeitpunkt
// serverseitig und lehnt einen mitgegebenen Wert ab.
{
  // Charge mit Pflueckzeitpunkt vor 75 Minuten - jede ehrliche Messung von
  // jetzt ist damit ein Verstoss.
  const { rows: charge } = await db.query(
    `select id from public.chargen where pflueckaufgabe_id is not null limit 1;`,
  );
  const chargeId = charge[0].id;
  await db.query(
    `update public.chargen set pflueck_zeitpunkt = now() - interval '75 minutes' where id = $1;`,
    [chargeId],
  );
  await db.query("delete from public.kuehlketten_messungen where charge_id = $1;", [chargeId]);

  await alsRolle(db, "authenticated", brigadeAuthId);
  let gefaelschtFehler = null;
  try {
    await db.query(
      `insert into public.kuehlketten_messungen (charge_id, temperatur_c, gemessen_am)
       values ($1, 3, now() - interval '70 minutes');`,
      [chargeId],
    );
  } catch (e) {
    gefaelschtFehler = e?.cause?.code ?? e?.code;
  }
  check(
    "Kuehlkette: Brigade kann den Messzeitpunkt nicht selbst setzen",
    gefaelschtFehler === "23514",
    gefaelschtFehler ? `errcode: ${gefaelschtFehler}` : "der Insert war erfolgreich",
  );

  // Der ehrliche Weg der Anwendung: nur geraet_zeitpunkt, alles andere rechnet
  // der Server - und der Verstoss bleibt ein Verstoss.
  const { rows: ehrlich } = await db.query(
    `insert into public.kuehlketten_messungen (charge_id, temperatur_c, geraet_zeitpunkt)
     values ($1, 3, now())
     returning ergebnis, minuten_seit_pfluecken, server_eingang_zeitpunkt is not null as eingang;`,
    [chargeId],
  );
  await alsAdmin(db);
  check(
    "Kuehlkette: der Server rechnet 75 Minuten und bleibt beim Verstoss",
    ehrlich[0].ergebnis === "verstoss" &&
      ehrlich[0].minuten_seit_pfluecken >= 74 &&
      ehrlich[0].eingang === true,
    `ergebnis: ${ehrlich[0].ergebnis}, Minuten: ${ehrlich[0].minuten_seit_pfluecken}`,
  );

  // Serverseitig (auth.uid() null, wie Seed und Fixtures) bleibt das
  // Zurueckdatieren moeglich - sonst liesse sich kein Testbestand aufbauen.
  // alsAdmin() setzt nur die Rolle zurueck, nicht auth.uid() - erst das
  // Leeren der Claim macht daraus wirklich einen serverseitigen Aufruf.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  const { rows: serverseitig } = await db.query(
    `insert into public.kuehlketten_messungen (charge_id, temperatur_c, gemessen_am)
     values ($1, 3, now() - interval '70 minutes')
     returning minuten_seit_pfluecken;`,
    [chargeId],
  );
  check(
    "Kuehlkette: service_role darf weiterhin zurueckdatieren (Seed/Fixtures)",
    serverseitig[0].minuten_seit_pfluecken <= 10,
    `Minuten: ${serverseitig[0].minuten_seit_pfluecken}`,
  );

  await db.query("delete from public.kuehlketten_messungen where charge_id = $1;", [chargeId]);
  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 10. Lohn: Ruecknahme einer Freigabe braucht eine zweite Person ----------
// Regression: lohn_abrechnung_freigabe_pruefen() sperrte nur den Weg aus
// 'ausgezahlt'. Dieselbe Person konnte freigeben, zurueckziehen und die
// Periode neu rechnen lassen - Freigabe und Korrektur in einer Hand.
{
  const buchhaltungA = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-buchhaltung-a@damicon.demo', '{"role":"buchhaltung"}'::jsonb) returning id;`,
  );
  const buchhaltungB = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-buchhaltung-b@damicon.demo', '{"role":"buchhaltung"}'::jsonb) returning id;`,
  );
  const aAuthId = buchhaltungA.rows[0].id;
  const bAuthId = buchhaltungB.rows[0].id;

  const { rows: abrechnung } = await db.query(
    `select id from public.lohn_abrechnungen where status = 'entwurf' limit 1;`,
  );
  const abrechnungId = abrechnung[0].id;

  // Die Freigabe-Spalten ueber to_jsonb lesen, nicht direkt: ohne die
  // Migration gaebe es sie nicht, und der Testlauf wuerde mit
  // "column does not exist" abbrechen statt die Pruefung rot zu melden.
  const status = async () => {
    const { rows } = await db.query(
      `select status,
              to_jsonb(l) ->> 'freigegeben_von_profil_id' as freigegeben_von_profil_id,
              to_jsonb(l) ->> 'freigegeben_am'            as freigegeben_am
         from public.lohn_abrechnungen l where id = $1;`,
      [abrechnungId],
    );
    return rows[0];
  };

  // A gibt frei - der Server schreibt mit, wer das war.
  await alsRolle(db, "authenticated", aAuthId);
  await db.query(
    "update public.lohn_abrechnungen set status = 'freigegeben' where id = $1;",
    [abrechnungId],
  );
  const nachFreigabe = await status();
  const { rows: profilA } = await db.query(
    "select id from public.profiles where auth_user_id = $1;",
    [aAuthId],
  );
  await alsAdmin(db);
  check(
    "Lohn: die Freigabe haelt fest, wer sie erteilt hat",
    nachFreigabe.status === "freigegeben" &&
      nachFreigabe.freigegeben_von_profil_id === profilA[0].id &&
      nachFreigabe.freigegeben_am !== null,
    `Status ${nachFreigabe.status}, Profil ${nachFreigabe.freigegeben_von_profil_id === profilA[0].id}`,
  );

  // A nimmt die eigene Freigabe zurueck - abgelehnt.
  await alsRolle(db, "authenticated", aAuthId);
  let selbstFehler = null;
  try {
    await db.query(
      "update public.lohn_abrechnungen set status = 'entwurf' where id = $1;",
      [abrechnungId],
    );
  } catch (e) {
    selbstFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check(
    "Lohn: wer freigegeben hat, nimmt nicht selbst zurueck",
    selbstFehler === "42501" && (await status()).status === "freigegeben",
    selbstFehler ? `errcode: ${selbstFehler}` : "die Ruecknahme war erfolgreich",
  );

  // B - eine zweite Person - darf zurueckziehen.
  await alsRolle(db, "authenticated", bAuthId);
  await db.query(
    "update public.lohn_abrechnungen set status = 'entwurf' where id = $1;",
    [abrechnungId],
  );
  await alsAdmin(db);
  const nachRuecknahme = await status();
  check(
    "Lohn: eine zweite Person nimmt die Freigabe zurueck",
    nachRuecknahme.status === "entwurf" &&
      nachRuecknahme.freigegeben_von_profil_id === null &&
      nachRuecknahme.freigegeben_am === null,
    `Status ${nachRuecknahme.status}, Freigeber zurueckgesetzt: ${nachRuecknahme.freigegeben_von_profil_id === null}`,
  );

  // Auszahlen ohne Freigabe - abgelehnt.
  await alsRolle(db, "authenticated", aAuthId);
  let sprungFehler = null;
  try {
    await db.query(
      "update public.lohn_abrechnungen set status = 'ausgezahlt' where id = $1;",
      [abrechnungId],
    );
  } catch (e) {
    sprungFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check(
    "Lohn: keine Auszahlung ohne vorherige Freigabe",
    sprungFehler === "23514",
    sprungFehler ? `errcode: ${sprungFehler}` : "der Sprung war erfolgreich",
  );

  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 11. Schreibumfang der Brigade: eigene Aufgaben, Feldfelder --------------
// Regression: pflueckaufgaben_update_feld und steigen_update_feld fragten nur
// nach der Rolle. Jede Brigade-Anmeldung konnte jede Aufgabe und jede Steige
// im Betrieb aendern - auch die einer fremden Brigade, und auch
// Planungsfelder wie zielmenge_kg oder die Brigadenzuteilung selbst.
// 20261018000000 grenzt beides ein.
{
  const { rows: brigaden } = await db.query(
    "select id, name from public.brigaden order by name;",
  );
  // Nicht auf einem wartezeitgesperrten Reihenblock: dort greift zuerst
  // pflueckaufgabe_sperre_pruefen() (Abschnitt 4 sperrt einen Block), und der
  // Test wuerde die falsche Regel messen.
  const { rows: eigene } = await db.query(
    `select a.id, a.status, a.brigade_id
       from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.brigade_id is not null
        and a.status <> 'abgeschlossen'
        and r.status <> 'wartezeitgesperrt'
      limit 1;`,
  );
  const eigeneAufgabe = eigene[0];
  const { rows: fremde } = await db.query(
    `select a.id from public.pflueckaufgaben a
      where a.brigade_id is not null
        and a.brigade_id <> $1
        and a.status <> 'abgeschlossen'
      limit 1;`,
    [eigeneAufgabe.brigade_id],
  );
  const fremdeAufgabeId = fremde[0].id;

  // Die Testbrigade bekommt die Brigade der eigenen Aufgabe.
  await db.query("update public.profiles set brigade_id = $1 where auth_user_id = $2;", [
    eigeneAufgabe.brigade_id,
    brigadeAuthId,
  ]);

  await alsRolle(db, "authenticated", brigadeAuthId);

  const fremdUpdate = await db.query(
    "update public.pflueckaufgaben set pfluecker_anzahl = pfluecker_anzahl + 1 where id = $1;",
    [fremdeAufgabeId],
  );
  check(
    "Brigade: fremde Pflueckaufgabe bleibt unberuehrt",
    fremdUpdate.affectedRows === 0,
    `geaenderte Zeilen: ${fremdUpdate.affectedRows}`,
  );

  const eigenUpdate = await db.query(
    "update public.pflueckaufgaben set ist_menge_kg = ist_menge_kg + 1 where id = $1;",
    [eigeneAufgabe.id],
  );
  check(
    "Brigade: die eigene Aufgabe bleibt bearbeitbar (gemeldete Menge)",
    eigenUpdate.affectedRows === 1,
    `geaenderte Zeilen: ${eigenUpdate.affectedRows}`,
  );

  const planungsFehler = async (sql, params = [eigeneAufgabe.id]) => {
    try {
      await db.query(sql, params);
      return null;
    } catch (e) {
      return e?.cause?.code ?? e?.code;
    }
  };

  const zielFehler = await planungsFehler(
    "update public.pflueckaufgaben set zielmenge_kg = zielmenge_kg + 10 where id = $1;",
  );
  check(
    "Brigade: Zielmenge bleibt Planung der Betriebsleitung",
    zielFehler === "42501",
    zielFehler ? `errcode: ${zielFehler}` : "die Aenderung war erfolgreich",
  );

  const andereBrigade = brigaden.find((b) => b.id !== eigeneAufgabe.brigade_id);
  const zuteilungFehler = await planungsFehler(
    "update public.pflueckaufgaben set brigade_id = $2 where id = $1;",
    [eigeneAufgabe.id, andereBrigade.id],
  );
  check(
    "Brigade: die eigene Zuteilung laesst sich nicht umhaengen",
    zuteilungFehler === "42501",
    zuteilungFehler ? `errcode: ${zuteilungFehler}` : "die Aenderung war erfolgreich",
  );

  // Definierter Ausgangspunkt: die Aufgabe steht auf 'in_arbeit', der Versuch
  // geht zurueck auf 'offen'. Ohne diesen Schritt haette die Aufgabe je nach
  // Seed schon 'offen' stehen koennen - dann waere der Test gruen, ohne die
  // Regel je beruehrt zu haben.
  await alsAdmin(db);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  await db.query(
    "update public.pflueckaufgaben set status = 'in_arbeit' where id = $1;",
    [eigeneAufgabe.id],
  );
  await alsRolle(db, "authenticated", brigadeAuthId);

  const rueckFehler = await planungsFehler(
    "update public.pflueckaufgaben set status = 'offen' where id = $1;",
  );
  check(
    "Brigade: kein Ruecksprung in einen frueheren Status",
    rueckFehler === "23514",
    rueckFehler ? `errcode: ${rueckFehler}` : "der Ruecksprung war erfolgreich",
  );

  // Steigen: nur die an der eigenen Aufgabe.
  // Die fremde Aufgabe darf nicht abgeschlossen sein: sonst greift zuerst
  // steige_nach_abschluss_fest() (20261003000000), und der Test wuerde die
  // fremde Regel messen statt der Brigadengrenze.
  const { rows: fremdeSteige } = await db.query(
    `select s.id from public.steigen s
       join public.pflueckaufgaben a on a.id = s.pflueckaufgabe_id
      where a.brigade_id is not null
        and a.brigade_id <> $1
        and a.status <> 'abgeschlossen'
      limit 1;`,
    [eigeneAufgabe.brigade_id],
  );
  if (fremdeSteige.length) {
    let fremdSteigeZeilen = null;
    try {
      fremdSteigeZeilen = (
        await db.query("update public.steigen set gewicht_kg = gewicht_kg + 1 where id = $1;", [
          fremdeSteige[0].id,
        ])
      ).affectedRows;
    } catch (e) {
      fremdSteigeZeilen = `Fehler ${e?.cause?.code ?? e?.code}`;
    }
    check(
      "Brigade: Steige einer fremden Aufgabe bleibt unberuehrt",
      fremdSteigeZeilen === 0,
      `geaenderte Zeilen: ${fremdSteigeZeilen}`,
    );
  } else {
    check("Brigade: Steige einer fremden Aufgabe bleibt unberuehrt", false, "keine Testdaten gefunden");
  }

  await alsAdmin(db);

  // Gegenprobe: die Betriebsleitung plant weiterhin ohne Einschraenkung.
  await alsRolle(db, "authenticated", leitungAuthId);
  const leitungPlanung = await db.query(
    "update public.pflueckaufgaben set zielmenge_kg = zielmenge_kg + 5 where id = $1;",
    [fremdeAufgabeId],
  );
  await alsAdmin(db);
  check(
    "Brigade-Regression: die Betriebsleitung plant weiterhin jede Aufgabe",
    leitungPlanung.affectedRows === 1,
    `geaenderte Zeilen: ${leitungPlanung.affectedRows}`,
  );

  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 12. Sync-Replay meldet das urspruengliche Ergebnis ----------------------
// Regression: sync_aufgabe_status_setzen()/sync_menge_melden() fragten beim
// Replay nur, OB die aktion_id im Protokoll steht, nicht WIE sie ausging. Ein
// Konflikt, dessen Antwort auf dem Rueckweg verloren ging, kam beim naechsten
// Versuch als "angewendet" zurueck - der Eintrag verschwand aus der
// Warteschlange, ohne dass je etwas geschrieben wurde.
{
  // Definierter Ausgangspunkt: eine Aufgabe auf einem nicht gesperrten Block
  // steht auf 'angenommen'. Serverseitig gesetzt (auth.uid() null), damit
  // weder Rollen- noch Statusregeln den Aufbau stoeren.
  const { rows: aufgabe } = await db.query(
    `select a.id
       from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.status <> 'abgeschlossen'
        and r.status <> 'wartezeitgesperrt'
      limit 1;`,
  );
  const aufgabeId = aufgabe[0].id;
  await db.query(
    "update public.pflueckaufgaben set status = 'angenommen' where id = $1;",
    [aufgabeId],
  );

  await alsRolle(db, "authenticated", brigadeAuthId);

  // Konflikt: die Aufgabe steht auf 'angenommen', der Auftrag erwartet 'offen'.
  const konfliktAktion = crypto.randomUUID();
  const { rows: ersterVersuch } = await db.query(
    "select * from public.sync_aufgabe_status_setzen($1, $2, 'angenommen', 'offen');",
    [konfliktAktion, aufgabeId],
  );
  const { rows: zweiterVersuch } = await db.query(
    "select * from public.sync_aufgabe_status_setzen($1, $2, 'angenommen', 'offen');",
    [konfliktAktion, aufgabeId],
  );
  check(
    "Sync: ein wiederholter Konflikt bleibt ein Konflikt",
    ersterVersuch[0].ergebnis === "konflikt" && zweiterVersuch[0].ergebnis === "konflikt",
    `erster: ${ersterVersuch[0].ergebnis}, zweiter: ${zweiterVersuch[0].ergebnis}`,
  );

  // Der Replay darf auch nichts geschrieben haben.
  const { rows: unveraendert } = await db.query(
    "select status from public.pflueckaufgaben where id = $1;",
    [aufgabeId],
  );
  check(
    "Sync: der wiederholte Konflikt schreibt nichts",
    unveraendert[0].status === "angenommen",
    `Status: ${unveraendert[0].status}`,
  );

  // Gegenprobe: eine angewendete Aktion bleibt beim Replay angewendet
  // (Idempotenz, unveraendert).
  const erfolgAktion = crypto.randomUUID();
  const { rows: erfolg } = await db.query(
    "select * from public.sync_aufgabe_status_setzen($1, $2, 'in_arbeit', 'angenommen');",
    [erfolgAktion, aufgabeId],
  );
  const { rows: erfolgReplay } = await db.query(
    "select * from public.sync_aufgabe_status_setzen($1, $2, 'in_arbeit', 'angenommen');",
    [erfolgAktion, aufgabeId],
  );
  check(
    "Sync: eine angewendete Aktion bleibt beim Replay angewendet",
    erfolg[0].ergebnis === "angewendet" &&
      erfolgReplay[0].ergebnis === "angewendet" &&
      erfolgReplay[0].code === erfolg[0].code,
    `erster: ${erfolg[0].ergebnis}, Replay: ${erfolgReplay[0].ergebnis}`,
  );

  // Dieselbe Regel fuer die Mengenmeldung: die Aufgabe steht jetzt auf
  // 'in_arbeit', ein Konflikt entsteht ueber eine unbekannte Aufgabe.
  const mengenKonflikt = crypto.randomUUID();
  const fremdeAufgabeId = "00000000-0000-0000-0000-000000000000";
  const { rows: mengeErst } = await db.query(
    "select * from public.sync_menge_melden($1, $2, 12.5, 1.0);",
    [mengenKonflikt, fremdeAufgabeId],
  );
  const { rows: mengeReplay } = await db.query(
    "select * from public.sync_menge_melden($1, $2, 12.5, 1.0);",
    [mengenKonflikt, fremdeAufgabeId],
  );
  check(
    "Sync: auch die Mengenmeldung meldet den Konflikt erneut",
    mengeErst[0].ergebnis === "konflikt" && mengeReplay[0].ergebnis === "konflikt",
    `erster: ${mengeErst[0].ergebnis}, zweiter: ${mengeReplay[0].ergebnis}`,
  );

  // WMCNL-2452: eine Rolle ohne Leserecht auf pflueckaufgaben und ohne
  // Schreibrecht auf sync_protokoll (picker) bekam fuer beide Funktionen einen
  // rohen 42501 statt der sauberen Antwort 'berechtigung'.
  await alsAdmin(db);
  const { rows: picker } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-picker@damicon.demo', '{"role":"picker"}'::jsonb)
     returning id;`,
  );
  await alsRolle(db, "authenticated", picker[0].id);
  const pickerAktion = crypto.randomUUID();
  let pickerMenge = null;
  let pickerStatus = null;
  let pickerFehler = "";
  try {
    pickerMenge = (
      await db.query("select * from public.sync_menge_melden($1, $2, 12.5, 1.0);", [
        pickerAktion,
        aufgabeId,
      ])
    ).rows[0];
    pickerStatus = (
      await db.query(
        "select * from public.sync_aufgabe_status_setzen($1, $2, 'angenommen', 'offen');",
        [crypto.randomUUID(), aufgabeId],
      )
    ).rows[0];
  } catch (e) {
    pickerFehler = e?.cause?.code ?? e?.code ?? String(e).slice(0, 80);
  }
  check(
    "Sync: eine Rolle ohne Protokollrecht bekommt 'berechtigung' statt eines RLS-Fehlers",
    pickerMenge?.ergebnis === "berechtigung" && pickerStatus?.ergebnis === "berechtigung",
    pickerFehler
      ? `Fehler ${pickerFehler}`
      : `Menge: ${pickerMenge?.ergebnis}, Status: ${pickerStatus?.ergebnis}`,
  );

  await alsAdmin(db);
  const { rows: pickerProtokoll } = await db.query(
    "select 1 from public.sync_protokoll where aktion_id = $1;",
    [pickerAktion],
  );
  const { rows: pickerAufgabe } = await db.query(
    "select status from public.pflueckaufgaben where id = $1;",
    [aufgabeId],
  );
  check(
    "Sync: die abgewiesene Aktion der Rolle ohne Protokollrecht schreibt weder Protokoll noch Aufgabe",
    pickerProtokoll.length === 0 && pickerAufgabe[0].status === "in_arbeit",
    `Protokollzeilen: ${pickerProtokoll.length}, Status: ${pickerAufgabe[0].status}`,
  );
  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 13. Gesetzliche Lohnabzuege Kasachstan (ОПВ/ВОСМС/ИПН, Arbeitgeberlast) --
// Migration 20261024000000. Reihenfolge: erst die reine Rechenfunktion isoliert
// pruefen (kein Datenbestand noetig, siehe deren Kommentar), dann die RPC
// end-to-end gegen echte Seed-Abrechnungen - beides einzeln, damit ein
// Fehlschlag erkennen laesst, ob die Formel oder die Aggregation die Ursache
// ist.
{
  const { rows: satzRows } = await db.query(
    `select * from public.lohn_steuersaetze_kz order by gueltig_ab desc limit 1;`,
  );
  const satz = satzRows[0];
  // Der aktuelle Satz als Subquery statt als JS-Parameter: der PGlite-Treiber
  // (wie node-postgres) kann ein zusammengesetztes Zeilen-Objekt nicht selbst
  // in ein Composite-Type-Literal serialisieren - die Datenbank liest die
  // Zeile deshalb selbst.
  const satzSubquery = `(select lst from public.lohn_steuersaetze_kz lst order by gueltig_ab desc limit 1)`;

  // 13a. Normalfall, von Hand nachgerechnet: Brutto 300 000 Tenge liegt unter
  // beiden Bemessungsgrenzen.
  const { rows: normalRows } = await db.query(
    `select * from public.lohn_kz_abzuege_berechnen(300000, ${satzSubquery});`,
  );
  const normal = normalRows[0];
  check(
    "Lohn-KZ: Normalfall trifft die von Hand gerechneten Betraege",
    Number(normal.opv_tenge) === 30000 &&
      Number(normal.vosms_tenge) === 6000 &&
      Number(normal.ipn_bemessungsgrundlage_tenge) === 134250 &&
      Number(normal.ipn_tenge) === 13425 &&
      Number(normal.netto_tenge) === 250575 &&
      Number(normal.arbeitgeberkosten_gesamt_tenge) === 352500,
    `ОПВ ${normal.opv_tenge}, ИПН ${normal.ipn_tenge}, netto ${normal.netto_tenge}`,
  );

  // 13b. Bemessungsgrenzen: Brutto 5 000 000 liegt ueber beiden Grenzen -
  // ОПВ/ВОСМС duerfen NICHT proportional weiter mitwachsen.
  const { rows: grenzeRows } = await db.query(
    `select * from public.lohn_kz_abzuege_berechnen(5000000, ${satzSubquery});`,
  );
  const grenze = grenzeRows[0];
  check(
    "Lohn-KZ: ОПВ/ВОСМС kappen an der Bemessungsgrenze",
    Number(grenze.opv_tenge) === Number(satz.opv_bemessungsgrenze_tenge) * (satz.opv_prozent / 100) &&
      Number(grenze.vosms_tenge) === Number(satz.vosms_bemessungsgrenze_tenge) * (satz.vosms_prozent / 100),
    `ОПВ ${grenze.opv_tenge} (erwartet ${Number(satz.opv_bemessungsgrenze_tenge) * (satz.opv_prozent / 100)})`,
  );

  // 13c. Bemessungsgrundlage darf nicht negativ werden: ein sehr niedriger
  // Bruttolohn (unter dem Freibetrag) ergibt ИПН = 0, nicht einen negativen
  // Betrag.
  const { rows: niedrigRows } = await db.query(
    `select * from public.lohn_kz_abzuege_berechnen(50000, ${satzSubquery});`,
  );
  check(
    "Lohn-KZ: ИПН wird bei niedrigem Bruttolohn nie negativ",
    Number(niedrigRows[0].ipn_bemessungsgrundlage_tenge) === 0 && Number(niedrigRows[0].ipn_tenge) === 0,
    `Grundlage ${niedrigRows[0].ipn_bemessungsgrundlage_tenge}, ИПН ${niedrigRows[0].ipn_tenge}`,
  );

  // 13d. Zugriffsschutz: eine Betriebsleitung darf lohn_monat_abzuege_
  // berechnen() nicht aufrufen - rbac.ts/RPC-Check erlauben nur admin/
  // buchhaltung, dieselbe Grenze wie lohn_periode_berechnen().
  const leitung = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-leitung-lohn-kz@damicon.demo', '{"role":"betriebsleitung"}'::jsonb) returning id;`,
  );
  await alsRolle(db, "authenticated", leitung.rows[0].id);
  let zugriffsFehler = null;
  try {
    await db.query("select * from public.lohn_monat_abzuege_berechnen(2026, 8);");
  } catch (e) {
    zugriffsFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check(
    "Lohn-KZ: Betriebsleitung darf Monatsabzuege nicht berechnen",
    zugriffsFehler === "42501",
    zugriffsFehler ? `errcode: ${zugriffsFehler}` : "der Aufruf war erfolgreich",
  );

  // 13e. Ende-zu-Ende gegen echte Seed-Abrechnungen: zwei Pfluecker mit
  // August-2026-Abrechnungen (siehe Abschnitt 10 oben, gleicher Seed-Bestand).
  // Erwartungswert von Hand nachgerechnet fuer den ersten: Brutto 60 420 liegt
  // unter dem Freibetrag von 129 750 - ИПН muss 0 sein, ein guter Beleg dafuer,
  // dass die Kappung auf 0 (13c) auch im Aggregat wirkt, nicht nur isoliert.
  const buchhaltung = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-buchhaltung-lohn-kz@damicon.demo', '{"role":"buchhaltung"}'::jsonb) returning id;`,
  );
  await alsRolle(db, "authenticated", buchhaltung.rows[0].id);
  const { rows: lauf1 } = await db.query(
    "select * from public.lohn_monat_abzuege_berechnen(2026, 8);",
  );
  const { rows: monatsabzuege } = await db.query(
    `select pfluecker_id, brutto_gesamt_tenge, ipn_tenge, netto_tenge, arbeitgeberkosten_gesamt_tenge
       from public.lohn_monatsabzuege where jahr = 2026 and monat = 8
      order by brutto_gesamt_tenge;`,
  );
  const niedrigsterFall = monatsabzuege[0];
  check(
    "Lohn-KZ: Monatsaggregat uebernimmt die 0-ИПН-Kappung aus der reinen Funktion",
    monatsabzuege.length === 2 &&
      Number(niedrigsterFall.ipn_tenge) === 0 &&
      // netto = brutto - ОПВ(10%) - ВОСМС(2%) - ИПН(0) = brutto * 0.88
      Number(niedrigsterFall.netto_tenge) === Math.round(Number(niedrigsterFall.brutto_gesamt_tenge) * 0.88 * 100) / 100,
    `Zeilen ${monatsabzuege.length}, ИПН ${niedrigsterFall?.ipn_tenge}, netto ${niedrigsterFall?.netto_tenge}`,
  );

  // 13f. Deterministisch wiederholbar: ein zweiter Lauf fuer denselben Monat
  // ersetzt die Zeilen (Delete+Insert), legt keine Duplikate an - siehe
  // Funktionskommentar "immer sicher erneut ausfuehrbar".
  const { rows: lauf2 } = await db.query(
    "select * from public.lohn_monat_abzuege_berechnen(2026, 8);",
  );
  const { rows: nachZweitemLauf } = await db.query(
    `select count(*)::int as anzahl from public.lohn_monatsabzuege where jahr = 2026 and monat = 8;`,
  );
  await alsAdmin(db);
  check(
    "Lohn-KZ: ein zweiter Rechenlauf fuer denselben Monat legt keine Duplikate an",
    lauf1[0].verarbeitet === lauf2[0].verarbeitet && nachZweitemLauf[0].anzahl === 2,
    `verarbeitet ${lauf1[0].verarbeitet}/${lauf2[0].verarbeitet}, Zeilen danach ${nachZweitemLauf[0].anzahl}`,
  );

  // 13g. WMCNL-2304: ein frei gewaehltes Brutto vorrechnen. 300 000 Tenge sind
  // der von Hand nachgerechnete Normalfall aus 13a, 150 000 laufen durch den
  // Zweig mit positivem ИПН (der in den Seed-Daten nie vorkommt: alle
  // Monatsbruttos liegen unter dem Freibetrag von 129 750).
  await alsRolle(db, "authenticated", buchhaltung.rows[0].id);
  const { rows: vorschau300 } = await db.query("select * from public.lohn_kz_abzuege_vorschau(300000);");
  check(
    "Lohn-KZ: die Vorschau fuer 300 000 Tenge trifft die von Hand gerechneten Betraege",
    vorschau300.length === 1 &&
      Number(vorschau300[0].opv_tenge) === 30000 &&
      Number(vorschau300[0].ipn_tenge) === 13425 &&
      Number(vorschau300[0].netto_tenge) === 250575,
    `ОПВ ${vorschau300[0]?.opv_tenge}, ИПН ${vorschau300[0]?.ipn_tenge}, netto ${vorschau300[0]?.netto_tenge}`,
  );
  const { rows: vorschau150 } = await db.query("select * from public.lohn_kz_abzuege_vorschau(150000);");
  // 150 000 - 15 000 (ОПВ) - 3 000 (ВОСМС) - 129 750 (Freibetrag) = 2 250 -> ИПН 225
  check(
    "Lohn-KZ: ueber dem Freibetrag fuehrt die Vorschau in den Zweig mit positivem ИПН",
    Number(vorschau150[0].ipn_bemessungsgrundlage_tenge) === 2250 && Number(vorschau150[0].ipn_tenge) === 225,
    `Grundlage ${vorschau150[0]?.ipn_bemessungsgrundlage_tenge}, ИПН ${vorschau150[0]?.ipn_tenge}`,
  );
  let negativFehler = null;
  try {
    await db.query("select * from public.lohn_kz_abzuege_vorschau(-1);");
  } catch (e) {
    negativFehler = e?.cause?.code ?? e?.code;
  }
  check("Lohn-KZ: ein negatives Brutto wird abgewiesen", negativFehler === "22023", `errcode: ${negativFehler}`);
  await alsAdmin(db);

  // Ohne Leserecht auf die Saetze gibt die Vorschau keine Zeile zurueck.
  const kundeVorschau = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-kunde-lohn-kz@damicon.demo', '{"role":"kunde"}'::jsonb) returning id;`,
  );
  await alsRolle(db, "authenticated", kundeVorschau.rows[0].id);
  const { rows: ohneRecht } = await db.query("select * from public.lohn_kz_abzuege_vorschau(300000);");
  await alsAdmin(db);
  check("Lohn-KZ: wer die Saetze nicht lesen darf, bekommt keine Vorschau", ohneRecht.length === 0, `Zeilen: ${ohneRecht.length}`);

  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 14. Risiko-/Steueroekosystem: Werktage, ESUTD-Frist, MwSt-Schwelle -----
// Migration 20261025000000.
{
  // 14a. Werktage: Freitag + 5 Werktage landet auf dem naechsten Freitag
  // (zwei Wochenenden dazwischen), Montag + 5 auf dem naechsten Montag.
  const { rows: werktage } = await db.query(
    `select public.werktage_addieren('2026-09-18', 5) as freitag_plus5,
            public.werktage_addieren('2026-09-14', 5) as montag_plus5,
            public.werktage_addieren('2026-09-19', 1) as samstag_plus1;`,
  );
  const w = werktage[0];
  check(
    "Risiko: werktage_addieren ueberspringt Wochenenden korrekt",
    w.freitag_plus5.toISOString().slice(0, 10) === "2026-09-25" &&
      w.montag_plus5.toISOString().slice(0, 10) === "2026-09-21" &&
      w.samstag_plus1.toISOString().slice(0, 10) === "2026-09-21",
    `Fr+5 ${w.freitag_plus5.toISOString().slice(0, 10)}, Mo+5 ${w.montag_plus5.toISOString().slice(0, 10)}, Sa+1 ${w.samstag_plus1.toISOString().slice(0, 10)}`,
  );

  // 14b. MwSt-Schwelle: Zugriffsschutz - Betriebsleitung darf nicht pruefen,
  // nur admin/buchhaltung (rbac.ts hat "stammdaten" fuer beide, aber diese
  // RPC ist bewusst enger als crud("stammdaten") - MwSt-Registrierung ist
  // buchhalterisch zu verantworten).
  const leitungMwst = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-leitung-mwst@damicon.demo', '{"role":"betriebsleitung"}'::jsonb) returning id;`,
  );
  await alsRolle(db, "authenticated", leitungMwst.rows[0].id);
  let mwstZugriffsFehler = null;
  try {
    await db.query("select * from public.mwst_schwelle_pruefen();");
  } catch (e) {
    mwstZugriffsFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check(
    "Risiko: Betriebsleitung darf die MwSt-Schwelle nicht pruefen",
    mwstZugriffsFehler === "42501",
    mwstZugriffsFehler ? `errcode: ${mwstZugriffsFehler}` : "der Aufruf war erfolgreich",
  );

  // 14c. MwSt-Schwelle: Ueberschreiten erkennen, Frist berechnen, Vorgang
  // bleibt einseitig (ein zweiter Aufruf aendert das einmal gesetzte Datum
  // nicht mehr).
  const buchhaltungMwst = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-buchhaltung-mwst@damicon.demo', '{"role":"buchhaltung"}'::jsonb) returning id;`,
  );
  await db.query(
    `insert into public.finance_ledger_entries (typ, kategorie, betrag_tenge, buchungsdatum, beschreibung)
     values ('erloes', 'test_schwellenpruefung', 50000000, current_date, 'Testzeile Schwellenpruefung');`,
  );
  await alsRolle(db, "authenticated", buchhaltungMwst.rows[0].id);
  const { rows: schwelleLauf1 } = await db.query("select * from public.mwst_schwelle_pruefen();");
  const { rows: schwelleLauf2 } = await db.query("select * from public.mwst_schwelle_pruefen();");
  await alsAdmin(db);
  const e1 = schwelleLauf1[0];
  const e2 = schwelleLauf2[0];
  check(
    "Risiko: MwSt-Schwellenueberschreitung wird erkannt und die Frist stimmt",
    e1.schwelle_ueberschritten === true &&
      Number(e1.umsatz_12_monate_tenge) > Number(e1.schwelle_tenge) &&
      e1.meldefrist_am !== null,
    `Umsatz ${e1.umsatz_12_monate_tenge}, Schwelle ${e1.schwelle_tenge}, Frist ${e1.meldefrist_am}`,
  );
  check(
    "Risiko: das Ueberschreitungsdatum bleibt bei einem zweiten Lauf unveraendert",
    e1.schwelle_ueberschritten_am?.toISOString?.() === e2.schwelle_ueberschritten_am?.toISOString?.(),
    `erster Lauf ${e1.schwelle_ueberschritten_am}, zweiter Lauf ${e2.schwelle_ueberschritten_am}`,
  );

  // 14d. Sicherheitsfund waehrend des Baus: mwst_umsatz_12_monate() darf NICHT
  // direkt per RPC aufrufbar sein - sonst koennte jede angemeldete Rolle
  // (auch picker/kunde) die Umsatzkennzahl abfragen, ohne die has_role()-
  // Pruefung von mwst_schwelle_pruefen() zu durchlaufen.
  await alsRolle(db, "authenticated", buchhaltungMwst.rows[0].id);
  let direkterZugriffFehler = null;
  try {
    await db.query("select public.mwst_umsatz_12_monate();");
  } catch (e) {
    direkterZugriffFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check(
    "Risiko: mwst_umsatz_12_monate ist nicht direkt per RPC aufrufbar",
    direkterZugriffFehler === "42501",
    direkterZugriffFehler ? `errcode: ${direkterZugriffFehler}` : "der Direktaufruf war erfolgreich",
  );

  // siehe Abschnitt 6: alsAdmin() setzt auth.uid() nicht zurueck.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 15. Pflanzenschutz-Protokoll: Behandlungen bleiben nachweisbar --------
// Die neue Protokollansicht (data/pflanzenschutz.ts) liest die Behandlungen
// selbst statt der Reihenbloecke. Entscheidend fuer den Nachweis: eine
// freigegebene Behandlung verschwindet nicht. In der Blocksicht ist sie
// unsichtbar, weil dort nur die juengste OFFENE Sperre haengt.
{
  const { rows: block } = await db.query(
    "select id, status from public.reihenbloecke where status <> 'wartezeitgesperrt' and id <> $1 limit 1;",
    [blockId],
  );
  const { rows: mittel } = await db.query("select id from public.psm_mittel limit 1;");

  // Eine laengst abgelaufene, freigegebene Behandlung. Der Sperr-Trigger setzt
  // den Block dabei auf 'wartezeitgesperrt', unten wird er wieder zurueckgesetzt.
  const { rows: neu } = await db.query(
    `insert into public.pflanzenschutz_behandlungen
       (reihenblock_id, psm_mittel_id, behandelt_am, wartezeit_tage, freigegeben)
     values ($1, $2, current_date - 60, 7, true)
     returning id;`,
    [block[0].id, mittel[0].id],
  );

  const { rows: protokoll } = await db.query(
    `select b.id, b.freigegeben, b.freigabe_am, r.code
       from public.pflanzenschutz_behandlungen b
       join public.reihenbloecke r on r.id = b.reihenblock_id
      where b.reihenblock_id = $1
      order by b.behandelt_am desc;`,
    [block[0].id],
  );
  check(
    "Pflanzenschutz: die freigegebene Behandlung bleibt im Protokoll lesbar",
    protokoll.length >= 1 && protokoll.some((b) => b.freigegeben === true && !!b.freigabe_am),
    `Behandlungen am Block: ${protokoll.length}`,
  );

  // Gegenprobe zur Blocksicht: die zaehlt nur offene Sperren, hier also keine.
  const { rows: offeneSperren } = await db.query(
    `select count(*)::int as n
       from public.pflanzenschutz_behandlungen
      where reihenblock_id = $1 and freigegeben = false;`,
    [block[0].id],
  );
  check(
    "Pflanzenschutz: dieselbe Behandlung taucht in der Blocksicht nicht mehr auf",
    offeneSperren[0].n === 0,
    `offene Sperren: ${offeneSperren[0].n}`,
  );

  // Aufraeumen: Behandlung loeschen, Block auf seinen Ausgangsstatus zurueck.
  await db.query("delete from public.pflanzenschutz_behandlungen where id = $1;", [neu[0].id]);
  await db.query("update public.reihenbloecke set status = $2 where id = $1;", [
    block[0].id,
    block[0].status,
  ]);
}

// --- Kennzahlen-Verlauf und Trend ---------------------------------------------
// Der Trendpfeil kam bis zu dieser Aenderung aus einer Textkonstante in
// src/lib/domain/kpis.ts. Jetzt haengt er an public.kpi_verlauf. Die Zusage,
// die hier abgesichert wird: ein EINZELNER Messpunkt ergibt keine Richtung.
// Sonst zeigt die Kachel wieder einen Pfeil, der nichts verglichen hat - genau
// der Zustand, den diese Aenderung beseitigen sollte.
{
  await db.exec("reset role;");

  // Der Seed legt fuer die Vorfuehrung bereits zwei Messpunkte je Kennzahl an
  // (Abschnitt "Kennzahlen-Verlauf (Demo)"). Diese Pruefung baut den Verlauf
  // selbst auf und raeumt ihn deshalb zuerst weg - sonst pruefte sie die
  // Demo-Daten statt die Mechanik dahinter.
  await db.query("delete from public.kpi_verlauf;");

  const { rows: lauf } = await db.query(
    "select public.kpi_verlauf_schreiben('2026-09-20'::date) as n;",
  );
  check(
    "Verlauf: der Schreiblauf legt Messpunkte aus kpi_aktuell() an",
    lauf[0].n > 0,
    `Messpunkte: ${lauf[0].n}`,
  );

  const { rows: ohneVergleich } = await db.query(
    "select count(*)::int as n from public.kpi_trend;",
  );
  check(
    "Verlauf: ein einzelner Messpunkt ergibt keine Richtung",
    ohneVergleich[0].n === 0,
    `Zeilen in kpi_trend: ${ohneVergleich[0].n}`,
  );

  // Zweiter Tag, jeder Wert um 1 hoeher.
  await db.exec(`
    insert into public.kpi_verlauf (schluessel, gemessen_am, wert, einheit, basis, datensaetze)
    select schluessel, date '2026-09-21', wert + 1, einheit, basis, datensaetze
      from public.kpi_verlauf
     where gemessen_am = date '2026-09-20';`);

  const { rows: hoch } = await db.query("select schluessel, trend from public.kpi_trend;");
  check(
    "Verlauf: zwei Messpunkte ergeben eine Richtung",
    hoch.length > 0 && hoch.every((z) => z.trend === "up"),
    `${hoch.length} Kennzahlen, davon up: ${hoch.filter((z) => z.trend === "up").length}`,
  );

  // Gegenprobe nach unten: derselbe Aufbau, nur faellt der Wert.
  await db.exec(`
    update public.kpi_verlauf z
       set wert = v.wert - 1
      from public.kpi_verlauf v
     where v.schluessel = z.schluessel
       and v.gemessen_am = date '2026-09-20'
       and z.gemessen_am = date '2026-09-21';`);

  const { rows: runter } = await db.query("select trend from public.kpi_trend;");
  check(
    "Verlauf: ein fallender Wert wird als fallend gemeldet",
    runter.length > 0 && runter.every((z) => z.trend === "down"),
    `down: ${runter.filter((z) => z.trend === "down").length} von ${runter.length}`,
  );

  // Und die dritte Moeglichkeit: unveraendert ist weder up noch down.
  await db.exec(`
    update public.kpi_verlauf z
       set wert = v.wert
      from public.kpi_verlauf v
     where v.schluessel = z.schluessel
       and v.gemessen_am = date '2026-09-20'
       and z.gemessen_am = date '2026-09-21';`);

  const { rows: gleich } = await db.query("select trend from public.kpi_trend;");
  check(
    "Verlauf: ein unveraenderter Wert meldet keine Bewegung",
    gleich.length > 0 && gleich.every((z) => z.trend === "flat"),
    `flat: ${gleich.filter((z) => z.trend === "flat").length} von ${gleich.length}`,
  );

  // Ein zweiter Schreiblauf am selben Tag korrigiert den Punkt, statt einen
  // zweiten danebenzustellen - sonst hinge die Richtung davon ab, wie oft der
  // Zeitplan gelaufen ist.
  const vorher = await db.query(
    "select count(*)::int as n from public.kpi_verlauf where gemessen_am = date '2026-09-20';",
  );
  await db.query("select public.kpi_verlauf_schreiben('2026-09-20'::date);");
  const nachher = await db.query(
    "select count(*)::int as n from public.kpi_verlauf where gemessen_am = date '2026-09-20';",
  );
  check(
    "Verlauf: ein zweiter Lauf am selben Tag legt keinen zweiten Punkt an",
    vorher.rows[0].n === nachher.rows[0].n,
    `vorher ${vorher.rows[0].n}, nachher ${nachher.rows[0].n}`,
  );

  await db.query("delete from public.kpi_verlauf where gemessen_am in (date '2026-09-20', date '2026-09-21');");
}

// --- Kennzahlen-Verlauf nur fuer die Rollen der Kennzahl (28.09.2026) ------------
// 20261112000000_kpi_verlauf_nach_rolle.sql: vorher las jedes Konto jede Zeile, und
// ueber Himbis datenLesen haette ein Kunde den Verlauf des Deckungsbeitrags lesen
// koennen. Erwartet wird je Rolle genau das, was die Anwendung ihr zeigt
// (sichtbarFuer in src/lib/domain/kpis.ts, ceo wie admin) - geladen aus derselben
// Datei, damit der Test nicht eine eigene Kopie der Liste pflegt.
{
  await alsAdmin(db);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  const { kpis } = await import("../../src/lib/domain/kpis.ts");
  const schluessel = [...kpis.map((k) => k.key), "unbekannteKennzahl"];
  for (const tag of ["2026-09-22", "2026-09-23"]) {
    await db.query(
      `insert into public.kpi_verlauf (schluessel, gemessen_am, wert, datensaetze)
       select s, $2::date, 1, 1 from unnest($1::text[]) s
       on conflict (schluessel, gemessen_am) do nothing;`,
      [schluessel, tag],
    );
  }
  const erwartet = (rolle) =>
    [
      ...kpis.filter((k) => k.sichtbarFuer.includes(rolle) || (rolle === "ceo" && k.sichtbarFuer.includes("admin"))).map((k) => k.key),
      ...(rolle === "admin" || rolle === "ceo" ? ["unbekannteKennzahl"] : []),
    ].sort();
  const tage = "gemessen_am in (date '2026-09-22', date '2026-09-23')";
  for (const rolle of ["kunde", "picker", "erzeuger", "brigade", "buchhaltung", "betriebsleitung", "admin", "ceo"]) {
    const { rows: konto } = await db.query(
      `insert into auth.users (email, raw_app_meta_data) values ($1, jsonb_build_object('role', $2::text)) returning id;`,
      [`kv-${rolle}@damicon.demo`, rolle],
    );
    await alsRolle(db, "authenticated", konto[0].id);
    const { rows: verlauf } = await db.query(`select distinct schluessel from public.kpi_verlauf where ${tage};`);
    const { rows: trend } = await db.query("select schluessel from public.kpi_trend where stand = date '2026-09-23';");
    await alsAdmin(db);
    const soll = erwartet(rolle);
    const ist = verlauf.map((z) => z.schluessel).sort();
    check(
      `Kennzahlen-Verlauf: ${rolle} liest genau die Kennzahlen, die die Anwendung zeigt`,
      JSON.stringify(ist) === JSON.stringify(soll),
      `sieht ${ist.length}, erwartet ${soll.length}${ist.length !== soll.length ? `: ${ist.join(",")}` : ""}`,
    );
    check(
      `Kennzahlen-Verlauf: ${rolle} bekommt auch in kpi_trend nur diese`,
      JSON.stringify(trend.map((z) => z.schluessel).sort()) === JSON.stringify(soll),
      `Trend-Zeilen: ${trend.length}`,
    );
  }
  check("Kennzahlen-Verlauf: Kunde und Pfluecker sehen keinen einzigen Verlauf", erwartet("kunde").length === 0 && erwartet("picker").length === 0);
  await db.exec("set role anon;");
  const { rows: anon } = await db.query(`select count(*)::int as n from public.kpi_verlauf where ${tage};`);
  await alsAdmin(db);
  check("Kennzahlen-Verlauf: ohne Anmeldung nichts", anon[0].n === 0, `Zeilen: ${anon[0].n}`);

  await db.query(`delete from public.kpi_verlauf where ${tage};`);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
}

// --- CEO-Berichte: ceo und admin schreiben, sonst niemand --------------------
// Seit 20261110000000_ceo_bericht_admin.sql darf auch admin einen Bericht
// ausloesen (Auftrag vom 23.09.2026, Tages-Uebersicht fuer ceo UND admin).
// Geprueft wird die Policy selbst, nicht der Rollenhelfer in der Anwendung -
// die beiden koennen auseinanderlaufen, und nur diese Seite haelt wirklich.
{
  const berichtJson = JSON.stringify({ id: "t", befunde: [] });
  const einfuegen = `insert into public.compliance_ceo_berichte (quelle, bereiche, bericht)
     values ('manuell', array['audit']::text[], $1::jsonb) returning id;`;

  const { rows: ceo } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-ceo@damicon.demo', '{"role":"ceo"}'::jsonb) returning id;`,
  );
  const { rows: adm } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-admin@damicon.demo', '{"role":"admin"}'::jsonb) returning id;`,
  );
  const { rows: buch } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-buchhaltung@damicon.demo', '{"role":"buchhaltung"}'::jsonb) returning id;`,
  );

  await alsRolle(db, "authenticated", ceo[0].id);
  const ceoSchreibt = await db.query(einfuegen, [berichtJson]);
  await alsAdmin(db);
  check("CEO-Bericht: ceo darf schreiben", ceoSchreibt.rows.length === 1);

  await alsRolle(db, "authenticated", adm[0].id);
  const adminSchreibt = await db.query(einfuegen, [berichtJson]);
  await alsAdmin(db);
  check("CEO-Bericht: admin darf jetzt auch schreiben", adminSchreibt.rows.length === 1);

  await alsRolle(db, "authenticated", buch[0].id);
  await mussScheitern(db, "CEO-Bericht: Buchhaltung darf nicht schreiben", einfuegen, [berichtJson], "42501");

  await alsRolle(db, "authenticated", adm[0].id);
  const { rows: adminLiest } = await db.query("select id from public.compliance_ceo_berichte;");
  await alsAdmin(db);
  check("CEO-Bericht: admin liest beide Zeilen", adminLiest.length === 2, `Zeilen: ${adminLiest.length}`);

  await alsRolle(db, "authenticated", buch[0].id);
  const { rows: buchLiest } = await db.query("select id from public.compliance_ceo_berichte;");
  await alsAdmin(db);
  check("CEO-Bericht: Buchhaltung sieht nichts", buchLiest.length === 0, `Zeilen: ${buchLiest.length}`);

  // Der Ausloeser wird serverseitig aus der Sitzung gesetzt, nicht aus der Eingabe
  // uebernommen (Trigger ceo_bericht_ausloeser_setzen). Bei einem Admin-Lauf muss
  // deshalb sein Profil dranstehen, nicht das des CEO.
  const { rows: ausloeser } = await db.query(
    `select p.role from public.compliance_ceo_berichte b
       join public.profiles p on p.id = b.ausgeloest_von
      where b.id = $1;`,
    [adminSchreibt.rows[0].id],
  );
  check("CEO-Bericht: der Ausloeser wird gesetzt, nicht behauptet", ausloeser[0]?.role === "admin", `Rolle: ${ausloeser[0]?.role}`);

  // alsAdmin() setzt nur die Postgres-Rolle zurueck, nicht die JWT-Claims - auth.uid() bliebe
  // sonst auf dem zuletzt simulierten Konto stehen, und nachfolgende Bloecke liefen unbemerkt
  // als diese Person weiter. Hier faellt das auf, weil der Aufraeumschritt am Dateiende dann
  // am Unveraenderlichkeits-Trigger scheitert.
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
}

// --- 16. Fotobelege: nur an eigene oder freie Aufgaben (WMCNL-2488) -----------
// Regression: media_belege_insert_feld und belege_insert_feld auf
// storage.objects fragten nur nach der Rolle. Eine Brigade konnte Fotos an
// Aufgaben fremder Brigaden haengen. 20261110050000 grenzt beides ein, wie
// 20261109040000 die Steigen. Nur nicht abgeschlossene Aufgaben: sonst koennte
// eine Abschlussregel greifen, und der Test maesse die falsche Schranke.
{
  await alsAdmin(db);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  const offen = "a.status <> 'abgeschlossen'";
  const { rows: zugeteilt } = await db.query(
    `select a.id, a.brigade_id from public.pflueckaufgaben a
      where a.brigade_id is not null and ${offen}
      order by a.id limit 1;`,
  );
  const eigene = zugeteilt[0];
  const { rows: fremd } = await db.query(
    `select a.id from public.pflueckaufgaben a
      where a.brigade_id is not null and a.brigade_id <> $1 and ${offen}
      order by a.id limit 1;`,
    [eigene.brigade_id],
  );
  const { rows: frei } = await db.query(
    `select a.id from public.pflueckaufgaben a
      where a.brigade_id is null and ${offen}
      order by a.id limit 1;`,
  );
  await db.query("update public.profiles set brigade_id = $1 where auth_user_id = $2;", [
    eigene.brigade_id,
    brigadeAuthId,
  ]);

  const fehlerCode = async (sql, params) => {
    try {
      await db.query(sql, params);
      return null;
    } catch (e) {
      return e?.cause?.code ?? e?.code;
    }
  };
  const beleg = (aufgabeId) =>
    fehlerCode(
      `insert into public.media_belege (pflueckaufgabe_id, art, storage_path)
       values ($1, 'schale', $2);`,
      [aufgabeId, `${aufgabeId}/pglite-test.jpg`],
    );
  const datei = (pfad) =>
    fehlerCode("insert into storage.objects (bucket_id, name) values ('belege', $1);", [pfad]);

  await alsRolle(db, "authenticated", brigadeAuthId);

  const fremdBeleg = await beleg(fremd[0].id);
  check(
    "Brigade: kein Fotobeleg an einer fremden Aufgabe",
    fremdBeleg === "42501",
    fremdBeleg ? `errcode: ${fremdBeleg}` : "der Beleg wurde angelegt",
  );
  const eigenerBeleg = await beleg(eigene.id);
  check("Brigade: Fotobeleg an der eigenen Aufgabe", eigenerBeleg === null, `errcode: ${eigenerBeleg}`);
  if (frei.length > 0) {
    const freierBeleg = await beleg(frei[0].id);
    check("Brigade: Fotobeleg an einer freien Aufgabe", freierBeleg === null, `errcode: ${freierBeleg}`);
  }

  const fremdeDatei = await datei(`${fremd[0].id}/pglite-test.jpg`);
  check(
    "Brigade: keine Datei im Ordner einer fremden Aufgabe",
    fremdeDatei === "42501",
    fremdeDatei ? `errcode: ${fremdeDatei}` : "die Datei wurde angelegt",
  );
  const eigeneDatei = await datei(`${eigene.id}/pglite-test.jpg`);
  check("Brigade: Datei im Ordner der eigenen Aufgabe", eigeneDatei === null, `errcode: ${eigeneDatei}`);
  const quittung = await datei("lieferungen/pglite-test.jpg");
  check("Brigade: Uebergabequittung unter lieferungen/ bleibt moeglich", quittung === null, `errcode: ${quittung}`);

  await alsAdmin(db);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 17. KI-Chat: Nutzer schreiben nur ihre eigene Frage (Cleanup-Fund 77) ------
// Regression: ki_chat_nachrichten_insert_own (20260930000000) pruefte nur die
// profil_id. Ein Konto mit Chat-Recht (auch kunde) legte damit per API eine
// eigene Zeile mit rolle 'assistent' und freiem Text an und liess sie ueber
// api/ki-sprachausgabe vorlesen, ein offener Vorlesegenerator. Dazu liessen
// sich anbieter_name und werkzeugaufrufe im Protokoll faelschen. Seit
// 20261113000000 schreibt authenticated nur noch rolle 'nutzer' ohne
// Antwortfelder, Assistenten- und Systemzeilen schreibt der Server mit
// service_role (api/ki-assistent/route.ts, actions/ki-assistent.ts).
{
  await alsAdmin(db);
  const { rows: konto } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-kichat-kunde@damicon.demo', '{"role":"kunde"}'::jsonb) returning id;`,
  );
  const kundeAuthId = konto[0].id;
  const { rows: profil } = await db.query("select id from public.profiles where auth_user_id = $1;", [kundeAuthId]);
  const profilId = profil[0].id;

  const fehlerCode = async (sql, params) => {
    try {
      await db.query(sql, params);
      return null;
    } catch (e) {
      return e?.cause?.code ?? e?.code;
    }
  };
  const eigeneZeilen = async () =>
    (await db.query("select rolle from public.ki_chat_nachrichten where profil_id = $1 order by erstellt_am;", [profilId])).rows;

  await alsRolle(db, "authenticated", kundeAuthId);
  // Einwilligungs-Check (route.ts, kiNachrichtSenden): vor der ersten Frage ist der eigene Verlauf leer.
  const vorher = await eigeneZeilen();
  check("KI-Chat: der eigene Verlauf ist vor der ersten Frage leer (Einwilligungs-Check)", vorher.length === 0, `Zeilen: ${vorher.length}`);

  const frage = await fehlerCode(
    "insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt) values ($1, 'nutzer', 'Welche Sorten gibt es?');",
    [profilId],
  );
  check("KI-Chat: authenticated legt die eigene Frage an (rolle nutzer)", frage === null, `errcode: ${frage}`);

  const assistent = await fehlerCode(
    `insert into public.ki_chat_nachrichten (id, profil_id, rolle, inhalt, anbieter_name)
     values ('11111111-2222-4333-8444-555555555555', $1, 'assistent', 'Beliebiger Werbetext zum Vorlesen', 'Claude (gefaelscht)');`,
    [profilId],
  );
  check(
    "KI-Chat: authenticated darf keine Assistenten-Zeile anlegen (kein offener Vorlesegenerator)",
    assistent === "42501",
    assistent ? `errcode: ${assistent}` : "die Assistenten-Zeile wurde angelegt",
  );
  // Genau der Angriff aus Fund 77: nur Rolle und Text, sonst nichts. Die Zeile oben scheitert auch an
  // anbieter_name; ohne diese Pruefung blieb eine Policy ohne "rolle = 'nutzer'" gruen (Mutation M10
  // der Gegenpruefung vom 29.09.2026).
  const nackt = await fehlerCode("insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt) values ($1, 'assistent', 'Beliebiger Text zum Vorlesen');", [profilId]);
  check("KI-Chat: auch eine nackte Assistenten-Zeile (nur Rolle und Text) wird abgelehnt", nackt === "42501", nackt ? `errcode: ${nackt}` : "die Assistenten-Zeile wurde angelegt");
  const system = await fehlerCode(
    "insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, eskaliert) values ($1, 'system', 'Eskalation', true);",
    [profilId],
  );
  const systemNackt = await fehlerCode("insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt) values ($1, 'system', 'Hinweis');", [profilId]);
  check("KI-Chat: auch eine nackte System-Zeile wird abgelehnt", systemNackt === "42501", systemNackt ? `errcode: ${systemNackt}` : "die System-Zeile wurde angelegt");
  check("KI-Chat: authenticated darf keine System-Zeile anlegen", system === "42501", system ? `errcode: ${system}` : "die System-Zeile wurde angelegt");
  const gefaelscht = await fehlerCode(
    `insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, anbieter_name, werkzeugaufrufe)
     values ($1, 'nutzer', 'Frage', 'Claude (gefaelscht)', '["datenLesen"]'::jsonb);`,
    [profilId],
  );
  check(
    "KI-Chat: eine Nutzerzeile traegt keine Antwortfelder (anbieter_name, werkzeugaufrufe)",
    gefaelscht === "42501",
    gefaelscht ? `errcode: ${gefaelscht}` : "die Zeile mit Antwortfeldern wurde angelegt",
  );
  // Den Zeitpunkt setzt die Datenbank: zurueckdatiert faelschte eine Frage das
  // Protokoll, vordatiert stuende sie fuer immer am Ende des geladenen Verlaufs
  // (ladeKiChatVerlauf sortiert nach erstellt_am).
  for (const [art, ausdruck] of [["zurueckdatiert", "now() - interval '1 day'"], ["vordatiert", "now() + interval '1 year'"]]) {
    const code = await fehlerCode(
      `insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, erstellt_am) values ($1, 'nutzer', 'Frage', ${ausdruck});`,
      [profilId],
    );
    check(
      `KI-Chat: authenticated setzt erstellt_am nicht selbst (${art})`,
      code === "42501",
      code ? `errcode: ${code}` : `die ${art}e Zeile wurde angelegt`,
    );
  }
  // Gegenpruefung vom 29.09.2026 (20261114000000): hoechstens 2000 Zeichen, und die ID setzt die
  // Datenbank (eine vorab belegte Antwort-ID liess das Speichern der Antwort scheitern).
  const zuLang = await fehlerCode("insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt) values ($1, 'nutzer', repeat('x', 2001));", [profilId]);
  check("KI-Chat: eine Frage ueber 2000 Zeichen wird abgelehnt", zuLang === "42501", zuLang ? `errcode: ${zuLang}` : "die lange Zeile wurde angelegt");
  const genau = await fehlerCode("insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt) values ($1, 'nutzer', repeat('x', 2000));", [profilId]);
  check("KI-Chat: eine Frage mit genau 2000 Zeichen geht durch", genau === null, `errcode: ${genau}`);
  const eigeneId = await fehlerCode(
    "insert into public.ki_chat_nachrichten (id, profil_id, rolle, inhalt) values ('33333333-4444-4555-8666-777777777777', $1, 'nutzer', 'Frage');",
    [profilId],
  );
  check("KI-Chat: authenticated waehlt die ID nicht selbst (keine vorab belegte Antwort-ID)", eigeneId === "42501", eigeneId ? `errcode: ${eigeneId}` : "die Zeile mit eigener ID wurde angelegt");
  await alsAdmin(db);

  // Der Server schreibt die Antwort mit service_role, so wie onFinish es tut (feste ID vorab).
  await alsRolle(db, "service_role");
  const antwort = await fehlerCode(
    `insert into public.ki_chat_nachrichten (id, profil_id, rolle, inhalt, anbieter_name, fallback, werkzeugaufrufe)
     values ('22222222-3333-4444-8555-666666666666', $1, 'assistent', 'Polka und Tulameen.', 'Claude', false, '["datenLesen"]'::jsonb);`,
    [profilId],
  );
  check("KI-Chat: service_role schreibt die Assistenten-Zeile", antwort === null, `errcode: ${antwort}`);
  const eskalation = await fehlerCode(
    "insert into public.ki_chat_nachrichten (profil_id, rolle, inhalt, eskaliert) values ($1, 'system', 'Eskalation angefordert', true);",
    [profilId],
  );
  check("KI-Chat: service_role schreibt die Eskalations-Zeile", eskalation === null, `errcode: ${eskalation}`);
  await alsAdmin(db);

  // Verlauf laden (ladeKiChatVerlauf): die Person sieht Frage, Antwort und Eskalation.
  await alsRolle(db, "authenticated", kundeAuthId);
  const nachher = (await eigeneZeilen()).map((z) => z.rolle);
  check(
    "KI-Chat: der eigene Verlauf laedt Frage, Antwort und Eskalation",
    nachher.length === 4 && nachher.includes("nutzer") && nachher.includes("assistent") && nachher.includes("system"),
    `Rollen: ${nachher.join(",")}`,
  );
  await alsAdmin(db);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
}

// --- 18. Wettermessungen: Loeschrecht und ein Tag, eine Zeile (WMCNL-2389) ------
// Die Aktualisierung loescht den Bestand und schreibt ihn neu. Ohne DELETE-Policy
// loescht RLS keine Zeile, ohne Fehler zu melden - die Saison verdoppelte sich
// bei jedem Klick.
{
  const tag = "2026-01-05";
  const ohneDublette = async (name, sql, params = []) => {
    try {
      await db.query(sql, params);
      return null;
    } catch (e) {
      return e?.cause?.code ?? e?.code ?? name;
    }
  };

  await alsRolle(db, "authenticated", leitungAuthId);
  const erste = await ohneDublette("erste", "insert into public.wetter_messungen (gemessen_am, temp_min_c, temp_max_c) values ($1, 1, 5);", [tag]);
  const zweite = await ohneDublette("zweite", "insert into public.wetter_messungen (gemessen_am, temp_min_c, temp_max_c) values ($1, 2, 6);", [tag]);
  check("Wetter: ein Tag ist nur einmal in der betriebsweiten Reihe moeglich", erste === null && zweite === "23505", `erste: ${erste}, zweite: ${zweite}`);

  const geloescht = await db.query("delete from public.wetter_messungen where gemessen_am = $1 and feldparzelle_id is null;", [tag]);
  check("Wetter: die Betriebsleitung darf Wettermessungen loeschen (Aktualisierung ersetzt den Bestand)", geloescht.affectedRows === 1, `geloeschte Zeilen: ${geloescht.affectedRows}`);

  await alsRolle(db, "authenticated", brigadeAuthId);
  await alsAdmin(db);
  await db.query("insert into public.wetter_messungen (gemessen_am, temp_min_c, temp_max_c) values ($1, 1, 5);", [tag]);
  await alsRolle(db, "authenticated", brigadeAuthId);
  const brigadeLoescht = await db.query("delete from public.wetter_messungen where gemessen_am = $1 and feldparzelle_id is null;", [tag]);
  check("Wetter: die Brigade darf keine Wettermessung loeschen", brigadeLoescht.affectedRows === 0, `geloeschte Zeilen: ${brigadeLoescht.affectedRows}`);

  await alsAdmin(db);
  await db.query("delete from public.wetter_messungen where gemessen_am = $1 and feldparzelle_id is null;", [tag]);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 19. Abschluss ohne Fotobeleg hat einen eigenen Fehlercode (WMCNL-2492) ----
// Die Oberflaeche meldete "Die Wartezeit ist noch nicht abgelaufen", weil der
// Abschluss ohne Beleg mit 23514 abgelehnt wurde und dbFehler() 23514 auf die
// Wartezeit-Meldung abbildet. DA006 trennt die beiden Faelle.
{
  // Ein Block ohne Sperre: blockId ist an dieser Stelle durch die Abschnitte
  // davor wartezeitgesperrt.
  const { rows: freierBlock } = await db.query(
    "select id from public.reihenbloecke where status <> 'wartezeitgesperrt' limit 1;",
  );
  const { rows: neueAufgabe } = await db.query(
    `insert into public.pflueckaufgaben (code, reihenblock_id, zielmenge_kg, status, ist_menge_kg, qualitaetsfaktor)
     values ('PA-IT-BELEG-1', $1, 5, 'beleg_pruefung', 5, 1.00) returning id;`,
    [freierBlock[0].id],
  );
  await alsRolle(db, "authenticated", leitungAuthId);
  const ohneBeleg = await (async () => {
    try {
      await db.query("update public.pflueckaufgaben set status = 'abgeschlossen' where id = $1;", [neueAufgabe[0].id]);
      return null;
    } catch (e) {
      return e?.cause?.code ?? e?.code ?? String(e).slice(0, 80);
    }
  })();
  check("Pflueckaufgabe: Abschluss ohne Fotobeleg meldet DA006 statt 23514", ohneBeleg === "DA006", `errcode: ${ohneBeleg}`);
  await alsAdmin(db);
  await db.query("delete from public.pflueckaufgaben where id = $1;", [neueAufgabe[0].id]);
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

// --- 20. MFA-Status aller Konten fuer die Administration (WMCNL-2479) -------------
{
  const { rows: admins } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('it-admin-mfa@damicon.demo', '{"role":"admin"}'::jsonb) returning id;`,
  );
  // Die Konten aus den Abschnitten davor: ein bestaetigter Faktor fuer die
  // Brigade, ein unbestaetigter fuer die Leitung (zaehlt nicht).
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'verified');", [brigadeAuthId]);
  await db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified');", [leitungAuthId]);

  await alsRolle(db, "authenticated", admins[0].id);
  const { rows: uebersicht } = await db.query("select * from public.mfa_status_je_konto();");
  const jeEmail = Object.fromEntries(uebersicht.map((z) => [z.email, z.faktoren]));
  check(
    "MFA-Uebersicht: ein bestaetigter Faktor zaehlt, ein unbestaetigter nicht",
    jeEmail["it-brigade@damicon.demo"] === 1 && jeEmail["it-leitung@damicon.demo"] === 0,
    `Brigade: ${jeEmail["it-brigade@damicon.demo"]}, Leitung: ${jeEmail["it-leitung@damicon.demo"]}`,
  );
  check(
    "MFA-Uebersicht: Konten ohne Schutz stehen zuerst",
    uebersicht.length > 1 && uebersicht[0].faktoren === 0 && uebersicht[uebersicht.length - 1].faktoren >= 1,
    `erste Zeile: ${uebersicht[0]?.faktoren}, letzte: ${uebersicht[uebersicht.length - 1]?.faktoren}`,
  );
  await alsAdmin(db);

  // Ohne die Rolle admin gibt es 42501, keine leere Liste.
  await alsRolle(db, "authenticated", leitungAuthId);
  let leitungFehler = null;
  try {
    await db.query("select * from public.mfa_status_je_konto();");
  } catch (e) {
    leitungFehler = e?.cause?.code ?? e?.code;
  }
  await alsAdmin(db);
  check("MFA-Uebersicht: die Betriebsleitung bekommt 42501", leitungFehler === "42501", `errcode: ${leitungFehler}`);

  await db.query("delete from auth.mfa_factors where user_id in ($1, $2);", [brigadeAuthId, leitungAuthId]);
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
