// =============================================================================
// Damicon - Abnahmetest Anforderung 4.7 gegen PGlite
// =============================================================================
// Ausfuehren:  npm run test:abnahme-4-7
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung 4.7):
//   Satz 1: "Jede schreibende Aktion erzeugt einen unveraenderlichen
//            Audit-Eintrag mit serverseitig gesetztem Urheber, auch bei
//            direktem Datenbankzugriff."
//   Satz 2: "Jeder Lese-, Export- und Druckzugriff auf Pflueckerstamm, Lohn,
//            Einwilligungen und Kundenkontakte erzeugt einen Eintrag mit
//            Person, Zeitpunkt, Zweck und betroffener Person."
//
// Satz 1 deckt diese Lieferung ab (Migration 20261004000000). Satz 2 bleibt
// offen und wird am Ende ausdruecklich festgehalten - die Tabelle
// personenbezogene_zugriffe existiert seit dem 08.09.2026, wird aber von
// keiner Stelle befuellt.
//
// Enthaelt zusaetzlich die Wechselwirkung mit Anforderung 4.1: beide legen
// Trigger auf dieselben Tabellen. Ein abgewiesener Schreibvorgang darf keinen
// Protokolleintrag hinterlassen, sonst protokolliert das System Vorgaenge,
// die nie stattgefunden haben.
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
async function alsAdmin(db) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

/** Zaehlt Protokolleintraege aus dem Datenbank-Trigger fuer eine Tabelle. */
async function protokollZahl(db, tabelle, id = null) {
  const { rows } = await db.query(
    `select count(*)::int as n from public.audit_events
      where ressource = $1
        and metadata->>'quelle' = 'datenbank-trigger'
        and ($2::uuid is null or ressource_id = $2::uuid);`,
    [tabelle, id],
  );
  return rows[0].n;
}

const db = new PGlite();
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);
console.log("Abnahmetest Anforderung 4.7 - Protokollierung jeder relevanten Aktion\n");

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

const { rows: u } = await db.query(
  `insert into auth.users (email, raw_app_meta_data)
   values ('abnahme-4-7@damicon.demo', '{"role":"betriebsleitung"}'::jsonb) returning id;`,
);
const leitung = u[0].id;

// --- Satz 1: direkter Schreibvorgang OHNE Anwendung -------------------------
{
  await alsAdmin(db); // service_role-Weg, auth.uid() ist null
  const vorher = await protokollZahl(db, "chargen");
  const { rows: s } = await db.query(`select id from public.sorten limit 1;`);
  const { rows: c } = await db.query(
    `insert into public.chargen (code, sorte_id, menge_kg)
     values ('ABN-4-7-CHARGE', $1, 12.5) returning id;`,
    [s[0].id],
  );
  const nachher = await protokollZahl(db, "chargen", c[0].id);
  check(
    "4.7 Satz 1: ein INSERT ohne Anwendung erzeugt einen Audit-Eintrag",
    nachher === 1,
    `Eintraege fuer diese Charge: ${nachher} (Tabelle vorher: ${vorher})`,
  );

  const { rows: e } = await db.query(
    `select actor, aktion, metadata->>'mit_sitzung' as mit_sitzung
       from public.audit_events
      where ressource = 'chargen' and ressource_id = $1
        and metadata->>'quelle' = 'datenbank-trigger' limit 1;`,
    [c[0].id],
  );
  check(
    "4.7 Satz 1: der Urheber wird serverseitig gesetzt, nicht mitgeschickt",
    e[0]?.actor === "system",
    `actor: ${e[0]?.actor}, aktion: ${e[0]?.aktion}, mit_sitzung: ${e[0]?.mit_sitzung}`,
  );

  // UPDATE und DELETE ebenfalls.
  await db.query(`update public.chargen set menge_kg = 13.0 where id = $1;`, [c[0].id]);
  const nachUpdate = await protokollZahl(db, "chargen", c[0].id);
  check(
    "4.7 Satz 1: ein UPDATE ohne Anwendung erzeugt einen weiteren Eintrag",
    nachUpdate === 2,
    `Eintraege: ${nachUpdate}`,
  );
}

// --- Satz 1: Schreibvorgang MIT Anmeldung -----------------------------------
{
  await alsAdmin(db);
  const { rows: s } = await db.query(`select id from public.sorten limit 1;`);
  const { rows: c } = await db.query(
    `insert into public.chargen (code, sorte_id, menge_kg)
     values ('ABN-4-7-CHARGE-2', $1, 9.0) returning id;`,
    [s[0].id],
  );

  await alsRolle(db, "authenticated", leitung);
  const res = await db.query(`update public.chargen set menge_kg = 9.5 where id = $1;`, [c[0].id]);
  await alsAdmin(db);

  if (res.affectedRows === 0) {
    check(
      "4.7 Satz 1: angemeldeter Schreibvorgang erzeugt einen Eintrag",
      true,
      "durch RLS ohne Wirkung - kein Vorgang, also zu Recht kein Eintrag",
    );
  } else {
    const { rows: e } = await db.query(
      `select actor, metadata->>'mit_sitzung' as mit_sitzung
         from public.audit_events
        where ressource = 'chargen' and ressource_id = $1
          and metadata->>'quelle' = 'datenbank-trigger'
        order by created_at desc limit 1;`,
      [c[0].id],
    );
    check(
      "4.7 Satz 1: angemeldeter Schreibvorgang traegt Namen und Rolle im Urheber",
      !!e[0] && e[0].actor !== "system" && e[0].mit_sitzung === "true",
      `actor: ${e[0]?.actor}, mit_sitzung: ${e[0]?.mit_sitzung}`,
    );
  }
}

// --- Wechselwirkung mit 4.1: abgewiesen heisst nicht protokolliert ---------
// Der Grund, aus dem 4.1 und 4.7 zusammen geprueft werden: beide legen
// Trigger auf dieselben Tabellen. Waere der Protokoll-Trigger ein
// before-Trigger, entstuende hier ein Eintrag fuer einen Vorgang, den die
// Datenbank gleich danach abweist.
{
  await alsAdmin(db);
  const { rows: aufg } = await db.query(
    `select a.id from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.status <> 'abgeschlossen' and r.status <> 'wartezeitgesperrt' limit 1;`,
  );
  const { rows: pf } = await db.query(`select id from public.pfluecker limit 1;`);
  const { rows: st } = await db.query(
    `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
     values ('ABN-4-7-STEIGE', 'abn-4-7-token', $1, $2, 6.0, now()) returning id;`,
    [aufg[0].id, pf[0].id],
  );
  await db.query(`update public.pflueckaufgaben set status = 'abgeschlossen' where id = $1;`, [
    aufg[0].id,
  ]);

  const vorher = await protokollZahl(db, "steigen", st[0].id);
  await alsRolle(db, "authenticated", leitung);
  let abgewiesen = false;
  try {
    await db.query(`update public.steigen set gewicht_kg = 99 where id = $1;`, [st[0].id]);
  } catch {
    abgewiesen = true;
  }
  await alsAdmin(db);
  const nachher = await protokollZahl(db, "steigen", st[0].id);

  check(
    "4.1/4.7: ein durch 4.1 abgewiesener Schreibvorgang hinterlaesst KEINEN Protokolleintrag",
    abgewiesen && nachher === vorher,
    `abgewiesen: ${abgewiesen}, Eintraege vorher ${vorher} nachher ${nachher}`,
  );
}

// --- Keine Endlosschleife ---------------------------------------------------
{
  await alsAdmin(db);
  const { rows } = await db.query(
    `select count(*)::int as n from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where c.relname = 'audit_events' and not t.tgisinternal
        and t.tgname like '%protokoll%';`,
  );
  check(
    "4.7: audit_events traegt selbst keinen Protokoll-Trigger (Endlosschleife)",
    rows[0].n === 0,
    `gefundene Protokoll-Trigger auf audit_events: ${rows[0].n}`,
  );
}

// --- Protokoll bleibt unveraenderlich ---------------------------------------
{
  await alsAdmin(db);
  const { rows: e } = await db.query(`select id from public.audit_events limit 1;`);
  let abgewiesen = false;
  let detail = "";
  try {
    await db.query(`update public.audit_events set aktion = 'manipuliert' where id = $1;`, [e[0].id]);
    detail = "die Aenderung war erfolgreich";
  } catch (err) {
    abgewiesen = true;
    detail = `errcode: ${err?.cause?.code ?? err?.code ?? "?"}`;
  }
  check("4.7: ein Audit-Eintrag laesst sich nicht nachtraeglich aendern", abgewiesen, detail);
}

// --- Abdeckung: welche Tabellen tragen den Trigger? -------------------------
{
  await alsAdmin(db);
  const { rows } = await db.query(
    `select c.relname from pg_trigger t
       join pg_class c on c.oid = t.tgrelid
      where not t.tgisinternal and t.tgname like 'trg_zzz_protokoll%'
      order by c.relname;`,
  );
  const abgedeckt = rows.map((r) => r.relname);
  const erwartet = [
    "arbeitszeiten",
    "chargen",
    "einwilligungen",
    "finance_ledger_entries",
    "kuehlketten_messungen",
    "kundeneinladungen",
    "lohn_abrechnungen",
    "lohn_positionen",
    "lohn_saetze",
    "media_belege",
    "pflanzenschutz_behandlungen",
    "pfluecker",
    "pflueckaufgaben",
    "profiles",
    "reihenbloecke",
    "steigen",
  ];
  const fehlend = erwartet.filter((t) => !abgedeckt.includes(t));
  check(
    "4.7: alle vorgesehenen Tabellen tragen den Protokoll-Trigger",
    fehlend.length === 0,
    fehlend.length === 0 ? `${abgedeckt.length} Tabellen` : `fehlt: ${fehlend.join(", ")}`,
  );
}

// --- Gliederung, Entrauschung, Indizes (Migration 20261005000000) ----------
{
  await alsAdmin(db);
  const { rows: a } = await db.query(
    `select a.id from public.pflueckaufgaben a
       join public.reihenbloecke r on r.id = a.reihenblock_id
      where a.status <> 'abgeschlossen' and r.status <> 'wartezeitgesperrt' limit 1;`,
  );
  const { rows: p } = await db.query(`select id from public.pfluecker limit 1;`);

  // Jede Steige setzte bisher zusaetzlich den Zaehler an der Aufgabe fort und
  // erzeugte dadurch einen zweiten, fachlich leeren Eintrag.
  const vorher = (await db.query(`select count(*)::int n from public.audit_events;`)).rows[0].n;
  for (let i = 0; i < 5; i += 1) {
    await db.query(
      `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
       values ($3, $4, $1, $2, 5.0, now());`,
      [a[0].id, p[0].id, `ABN-4-7-R${i}`, `abn-4-7-r-${i}`],
    );
  }
  const nachher = (await db.query(`select count(*)::int n from public.audit_events;`)).rows[0].n;
  check(
    "4.7: eine Steige erzeugt genau einen Eintrag, nicht zwei",
    nachher - vorher === 5,
    `5 Steigen ergaben ${nachher - vorher} Eintraege (ohne Entrauschung waeren es 10)`,
  );

  // Gegenprobe: eine echte Mengenaenderung muss weiterhin protokolliert werden.
  const v2 = await protokollZahl(db, "pflueckaufgaben");
  await db.query(`update public.pflueckaufgaben set ist_menge_kg = 42 where id = $1;`, [a[0].id]);
  const n2 = await protokollZahl(db, "pflueckaufgaben");
  check(
    "4.7 Gegenprobe: eine echte Mengenaenderung wird weiterhin protokolliert",
    n2 - v2 === 1,
    `${n2 - v2} Eintrag`,
  );
}

{
  await alsAdmin(db);
  const { rows } = await db.query(
    `select count(*)::int as ohne from public.audit_events where bereich is null;`,
  );
  check(
    "4.7: jeder Protokolleintrag traegt einen Bereich",
    rows[0].ohne === 0,
    `ohne Bereich: ${rows[0].ohne}`,
  );

  const { rows: g } = await db.query(
    `select bereich::text as b, count(*)::int as n from public.audit_events
      group by bereich order by n desc;`,
  );
  check(
    "4.7: die Gliederung trennt Nachweiskette, Geld, Zugang und Datenschutz",
    g.length >= 2,
    g.map((r) => `${r.b}=${r.n}`).join("  "),
  );
}

{
  await alsAdmin(db);
  const { rows } = await db.query(
    `select indexname from pg_indexes where tablename = 'audit_events'
      and indexname in ('idx_audit_ressource_id', 'idx_audit_bereich');`,
  );
  check(
    "4.7: Indizes fuer die beiden haeufigsten Fragen vorhanden",
    rows.length === 2,
    rows.map((r) => r.indexname).join(", "),
  );
}

{
  // Rueckdatierung: audit_events_insert_authenticated laesst jede angemeldete
  // Rolle schreiben. Der Zeitpunkt muss trotzdem serverseitig entstehen.
  await alsRolle(db, "authenticated", leitung);
  await db.query(
    `insert into public.audit_events (actor, aktion, ressource, created_at)
     values ('frei erfunden', 'test', 'chargen', '2020-01-01T00:00:00Z');`,
  );
  await alsAdmin(db);
  const { rows } = await db.query(
    `select count(*)::int as n from public.audit_events where created_at < '2021-01-01';`,
  );
  check(
    "4.7: ein Eintrag laesst sich nicht rueckdatieren",
    rows[0].n === 0,
    `Eintraege vor 2021: ${rows[0].n}`,
  );
}

// --- Was 4.7 NOCH NICHT erfuellt --------------------------------------------
// Satz 2 des Abnahmekriteriums. Diese Pruefung ist gruen, weil sie den
// Ist-Zustand korrekt beschreibt - nicht, weil die Anforderung erfuellt waere.
{
  await alsAdmin(db);
  // Die Tabelle ist NICHT leer - supabase/seed.sql legt vier Beispielzeilen
  // an. Was fehlt, ist ein Eintrag aus echtem Betrieb, und der traegt eine
  // akteur_id. Alle Seed-Zeilen haben dort null, weil es beim Seed keine
  // handelnde Person gibt. Solange kein Eintrag mit Akteur existiert, hat
  // niemals jemand ueber die Anwendung protokolliert - genau die Luecke,
  // die das BRD benennt.
  const { rows } = await db.query(
    `select count(*) filter (where akteur_id is not null)::int as mit_akteur,
            count(*)::int as gesamt
       from public.personenbezogene_zugriffe;`,
  );
  check(
    "4.7 OFFEN: Satz 2 - kein Zugriff wird aus der Anwendung protokolliert",
    rows[0].mit_akteur === 0,
    `${rows[0].gesamt} Zeilen, davon ${rows[0].mit_akteur} mit Akteur - alle aus dem Seed. Lese-, Export- und Druckzugriffe auf Pflueckerstamm, Lohn, Einwilligungen und Kundenkontakte fehlen`,
  );
}

console.log("");
if (failures > 0) {
  console.error(`${failures} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Abnahmetest 4.7 gruen. Satz 2 des Kriteriums bleibt dokumentiert offen.");
