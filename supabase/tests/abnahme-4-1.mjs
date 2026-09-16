// =============================================================================
// Damicon - Abnahmetest Anforderung 4.1 gegen PGlite
// =============================================================================
// Ausfuehren:  npm run test:abnahme-4-1
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung 4.1):
//   "Nach Abschluss lassen sich Erntemengen, Behandlungen, Kuehlmessungen und
//    Finanzbuchungen von keiner Rolle aendern oder loeschen; Korrekturen
//    entstehen als Gegenbuchung."
//
// Jede Pruefung traegt die Anforderungsnummer im Namen. Damit ist der
// Erfuellungsgrad ein Testlauf und keine Auslegungsfrage - genau das Problem,
// an dem sich die Statusfrage am 15.09.2026 aufgehalten hat: die
// Selbsteinstufung im Code (reifegrad "angebunden") sagte etwas anderes als
// das am Abnahmekriterium gemessene BRD.
//
// Zwei Pruefungen am Ende halten ausdruecklich fest, was NICHT erfuellt ist.
// Ohne sie liest sich ein gruener Lauf wie "4.1 vollstaendig".
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

async function alsRolle(db, rolle, authUserId = null) {
  await db.exec(`set role ${rolle};`);
  await db.query("select set_config('request.jwt.claim.role', $1, false);", [rolle]);
  await db.query("select set_config('request.jwt.claim.sub', $1, false);", [authUserId ?? ""]);
}

// Auch die JWT-Claims leeren, nicht nur die Postgres-Rolle: sonst bleibt
// auth.uid() gesetzt und die Schutztrigger greifen auch dort, wo der Test als
// Superuser arbeiten will.
async function alsAdmin(db) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

/**
 * Erwartet, dass die Anweisung nichts bewirkt. Die Rolle muss VORHER gesetzt
 * sein.
 *
 * "Laesst sich nicht aendern" hat in Postgres zwei Erscheinungsformen, und
 * beide erfuellen das Abnahmekriterium: entweder wirft ein Trigger, oder RLS
 * laesst die Zeile gar nicht erst in die Anweisung - dann laeuft kein Trigger
 * und es gibt keinen Fehler, sondern null betroffene Zeilen. Eine Pruefung,
 * die nur auf die Ausnahme schaut, meldet den zweiten Fall faelschlich als
 * Defekt. Die Meldung nennt, welcher der beiden Wege gegriffen hat.
 */
async function mussAbweisen(db, name, sql, params) {
  try {
    const res = await db.query(sql, params);
    const betroffen = res.affectedRows ?? 0;
    check(name, betroffen === 0, betroffen === 0 ? "durch RLS ohne Wirkung" : `${betroffen} Zeile(n) geaendert`);
  } catch (e) {
    check(name, true, `durch Trigger abgewiesen, errcode ${e?.cause?.code ?? e?.code ?? "?"}`);
  }
}

const db = new PGlite();
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);
console.log("Abnahmetest Anforderung 4.1 - Unveraenderliche Erntebuchungen\n");

try {
  await db.exec(readFileSync(join(WURZEL, "supabase/fixtures/auth-stub.sql"), "utf8"));
  for (const d of readdirSync(join(WURZEL, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(WURZEL, "supabase/migrations", d), "utf8"));
  }
  await db.exec(readFileSync(join(WURZEL, "supabase/seed.sql"), "utf8"));
  check("Grundlage: Migrationen und Seed angewendet", true);
} catch (e) {
  check("Grundlage", false, String(e.message ?? e).slice(0, 250));
  process.exit(1);
}

// Betriebsleitung und admin: die beiden hoechsten Anwendungsrollen. Wenn die
// nicht durchkommen, kommt keine angemeldete Rolle durch.
const { rows: u } = await db.query(
  `insert into auth.users (email, raw_app_meta_data)
   values ('abnahme-leitung@damicon.demo', '{"role":"betriebsleitung"}'::jsonb) returning id;`,
);
const leitung = u[0].id;
const { rows: a } = await db.query(
  `insert into auth.users (email, raw_app_meta_data)
   values ('abnahme-admin@damicon.demo', '{"role":"admin"}'::jsonb) returning id;`,
);
const admin = a[0].id;

await alsAdmin(db);
// Der Reihenblock darf nicht wartezeitgesperrt sein: pflueckaufgabe_sperre_pruefen()
// (Migration 20260905160000) laesst eine Aufgabe auf einem gesperrten Block
// gar nicht erst abschliessen.
const { rows: aufg } = await db.query(
  `select a.id
     from public.pflueckaufgaben a
     join public.reihenbloecke r on r.id = a.reihenblock_id
    where a.status <> 'abgeschlossen'
      and r.status <> 'wartezeitgesperrt'
    limit 1;`,
);
if (!aufg[0]) {
  check("Vorbereitung: Aufgabe auf einem freien Reihenblock gefunden", false, "keine im Seed");
  process.exit(1);
}
const { rows: pf } = await db.query(`select id from public.pfluecker limit 2;`);
const { rows: st } = await db.query(
  `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
   values ('ABN-4-1-001', 'abn-4-1-token', $1, $2, 5.50, now()) returning id;`,
  [aufg[0].id, pf[0].id],
);
const steige = st[0].id;
await db.query(`update public.pflueckaufgaben set status = 'abgeschlossen' where id = $1;`, [
  aufg[0].id,
]);
check("Vorbereitung: abgeschlossene Aufgabe mit Steige", true, "Steige ABN-4-1-001");

// --- Erntemengen an der Pflueckaufgabe (Migration 20260917000000) ----------
for (const [rolle, id] of [
  ["betriebsleitung", leitung],
  ["admin", admin],
]) {
  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Erntemenge: ${rolle} kann ist_menge_kg einer abgeschlossenen Aufgabe nicht aendern`,
    `update public.pflueckaufgaben set ist_menge_kg = 999 where id = $1;`,
    [aufg[0].id],
  );
  await alsAdmin(db);
}

// --- Steigen (Migration 20261003000000, diese Lieferung) -------------------
for (const [rolle, id] of [
  ["betriebsleitung", leitung],
  ["admin", admin],
]) {
  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Steige: ${rolle} kann das Gewicht nach Abschluss nicht aendern`,
    `update public.steigen set gewicht_kg = 99.9 where id = $1;`,
    [steige],
  );

  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Steige: ${rolle} kann die Pflueckerzuordnung nach Abschluss nicht aendern`,
    `update public.steigen set pfluecker_id = $2 where id = $1;`,
    [steige, pf[1]?.id ?? pf[0].id],
  );

  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Steige: ${rolle} kann die Steige nach Abschluss nicht loeschen`,
    `delete from public.steigen where id = $1;`,
    [steige],
  );
  await alsAdmin(db);
}

// --- Die drei Wege, auf denen Lohn entstehen oder wandern kann -------------
// Am 16.09.2026 im QA-Durchlauf gefunden und gegen PGlite nachgestellt. Alle
// drei umgingen die erste Fassung des Schutzes, ohne gewicht_kg einer
// bestehenden Steige anzufassen.
for (const [rolle, id] of [
  ["betriebsleitung", leitung],
  ["admin", admin],
]) {
  // 1. Neue Steige an eine fertige Aufgabe haengen: Lohn aus dem Nichts.
  //    Gemessen wurden 8 kg -> 508 kg an einer abgerechneten Aufgabe.
  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Steige: ${rolle} kann einer abgeschlossenen Aufgabe keine Steige hinzufuegen`,
    `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
     values ($2, $3, $1, $4, 500.00, now());`,
    [aufg[0].id, `ABN-4-1-NEU-${rolle}`, `abn-4-1-neu-${rolle}`, pf[0].id],
  );

  // 2. Scan-Zeitpunkt verschieben: dieselbe Leistung in zwei Perioden.
  //    lohn_periode_berechnen() waehlt ueber scan_zeitpunkt::date.
  await alsRolle(db, "authenticated", id);
  await mussAbweisen(
    db,
    `4.1 Steige: ${rolle} kann den Scan-Zeitpunkt nach Abschluss nicht verschieben`,
    `update public.steigen set scan_zeitpunkt = scan_zeitpunkt + interval '31 days' where id = $1;`,
    [steige],
  );
  await alsAdmin(db);
}

// 3. Eine Steige von einer OFFENEN auf die abgeschlossene Aufgabe umhaengen.
//    Die erste Fassung prueft mit coalesce nur die alte Aufgabe - die war
//    offen, also lief das UPDATE durch und die fertige Aufgabe wuchs.
{
  await alsAdmin(db);
  const { rows: offen2 } = await db.query(
    `select a.id from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.status <> 'abgeschlossen' and r.status <> 'wartezeitgesperrt' limit 1;`,
  );
  const { rows: wander } = await db.query(
    `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
     values ('ABN-4-1-WANDER', 'abn-4-1-wander', $1, $2, 33.00, now()) returning id;`,
    [offen2[0].id, pf[0].id],
  );
  await alsRolle(db, "authenticated", leitung);
  await mussAbweisen(
    db,
    "4.1 Steige: laesst sich nicht von einer offenen auf eine abgeschlossene Aufgabe umhaengen",
    `update public.steigen set pflueckaufgabe_id = $2 where id = $1;`,
    [wander[0].id, aufg[0].id],
  );
  await alsAdmin(db);
}

// 4. Negatives Gewicht senkt die Lohnsumme - dieselbe Wirkung wie 1, umgekehrt.
{
  await alsAdmin(db);
  const { rows: offen3 } = await db.query(
    `select a.id from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.status <> 'abgeschlossen' and r.status <> 'wartezeitgesperrt' limit 1;`,
  );
  let abgewiesen = false;
  let detail = "";
  try {
    await db.query(
      `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
       values ('ABN-4-1-NEG', 'abn-4-1-neg', $1, $2, -500.00, now());`,
      [offen3[0].id, pf[0].id],
    );
    detail = "negatives Gewicht wurde angenommen";
  } catch (e) {
    abgewiesen = true;
    detail = `errcode: ${e?.cause?.code ?? e?.code ?? "?"}`;
  }
  check("4.1 Steige: negatives Gewicht wird abgewiesen", abgewiesen, detail);
}

// Gegenprobe: vor dem Abschluss muss eine Korrektur moeglich bleiben, sonst
// waere die Regel im Alltag unbrauchbar.
{
  await alsAdmin(db);
  const { rows: offen } = await db.query(
    `select id from public.pflueckaufgaben where status <> 'abgeschlossen' limit 1;`,
  );
  const { rows: s2 } = await db.query(
    `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
     values ('ABN-4-1-002', 'abn-4-1-token-2', $1, $2, 4.00, now()) returning id;`,
    [offen[0].id, pf[0].id],
  );
  await alsRolle(db, "authenticated", leitung);
  const res = await db.query(`update public.steigen set gewicht_kg = 4.20 where id = $1;`, [
    s2[0].id,
  ]);
  await alsAdmin(db);
  check(
    "4.1 Gegenprobe: vor dem Abschluss bleibt die Steige korrigierbar",
    res.affectedRows === 1,
    `geaenderte Zeilen: ${res.affectedRows}`,
  );
}

// --- Behandlungen (Migrationen 20260917000000 / 20260917010000) ------------
{
  await alsAdmin(db);
  const { rows: b } = await db.query(`select id from public.pflanzenschutz_behandlungen limit 1;`);
  if (!b[0]) {
    check("4.1 Behandlung: Testfall aufbaubar", false, "keine Behandlung im Seed");
  } else {
    await alsRolle(db, "authenticated", leitung);
    await mussAbweisen(
      db,
      "4.1 Behandlung: behandelt_am laesst sich nicht rueckdatieren",
      `update public.pflanzenschutz_behandlungen
          set behandelt_am = behandelt_am - interval '30 days' where id = $1;`,
      [b[0].id],
    );
    await alsRolle(db, "authenticated", leitung);
    await mussAbweisen(
      db,
      "4.1 Behandlung: laesst sich nicht loeschen",
      `delete from public.pflanzenschutz_behandlungen where id = $1;`,
      [b[0].id],
    );
    await alsAdmin(db);
  }
}

// --- Kuehlmessungen (Migration 20260917000000) -----------------------------
{
  await alsAdmin(db);
  const { rows: k } = await db.query(`select id from public.kuehlketten_messungen limit 1;`);
  if (!k[0]) {
    check("4.1 Kuehlmessung: Testfall aufbaubar", false, "keine Messung im Seed");
  } else {
    await alsRolle(db, "authenticated", leitung);
    await mussAbweisen(
      db,
      "4.1 Kuehlmessung: Temperatur laesst sich nicht nachtraeglich aendern",
      `update public.kuehlketten_messungen set temperatur_c = 0.5 where id = $1;`,
      [k[0].id],
    );
    await alsAdmin(db);
  }
}

// --- Finanzbuchungen (seit dem initialen Schema) ---------------------------
{
  await alsAdmin(db);
  const { rows: f } = await db.query(`select id from public.finance_ledger_entries limit 1;`);
  if (!f[0]) {
    check("4.1 Finanzbuchung: Testfall aufbaubar", false, "keine Buchung im Seed");
  } else {
    await alsRolle(db, "authenticated", leitung);
    await mussAbweisen(
      db,
      "4.1 Finanzbuchung: laesst sich nicht aendern (append-only)",
      `update public.finance_ledger_entries set betrag_tenge = 1 where id = $1;`,
      [f[0].id],
    );
    await alsAdmin(db);
  }
}

// --- Was 4.1 NOCH NICHT erfuellt -------------------------------------------
// Diese beiden Pruefungen halten den Ist-Zustand fest. Sie sind gruen, weil
// sie den Zustand korrekt beschreiben - nicht, weil die Anforderung erfuellt
// waere. Schlaegt eine davon um, ist die Luecke geschlossen und der Text hier
// gehoert angepasst.
{
  await alsAdmin(db); // service_role-Weg: auth.uid() ist null
  const res = await db.query(`update public.steigen set gewicht_kg = 7.77 where id = $1;`, [steige]);
  check(
    "4.1 OFFEN: service_role kann weiterhin aendern",
    res.affectedRows === 1,
    "Seed, seed-auth und die Integrationstests brauchen diesen Weg - organisatorisch zu loesen, nicht per Trigger",
  );
}
{
  const { rows: sp } = await db.query(
    `select count(*)::int as n from information_schema.columns
      where table_schema = 'public' and table_name = 'steigen'
        and column_name in ('storniert_am', 'storniert_durch_steige_id');`,
  );
  check(
    "4.1 OFFEN: keine Gegenbuchung fuer Erntemengen",
    sp[0].n === 0,
    "nur finance_ledger_entries hat sie; was eine Gegensteige fachlich bedeutet, ist eine betriebliche Festlegung",
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Abnahmetest 4.1 gruen. Zwei Teile bleiben dokumentiert offen (siehe OFFEN-Zeilen).");
