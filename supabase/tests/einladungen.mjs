// =============================================================================
// Damicon - Pruefung der Kundeneinladungen (Anforderung E.20) gegen PGlite
// =============================================================================
// Fuehrt alle Migrationen samt 20261002000000_kundeneinladungen.sql gegen ein
// echtes Postgres (WASM) aus und prueft RLS, Constraints, das atomare Einloesen
// und die Kaskade. Aufbau uebernommen aus supabase/tests/pglite-fast.mjs.
//
// Ausfuehren:  npm run test:einladungen
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { wendeMigrationenAn, migrationenMeldung } from "./pglite-migrationen.mjs";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONEN_DIR = join(WURZEL, "supabase", "migrations");
const AUTH_STUB = join(WURZEL, "supabase", "fixtures", "auth-stub.sql");
const SEED = join(WURZEL, "supabase", "seed.sql");

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
// Wichtig: auch die JWT-Claims leeren, nicht nur die Postgres-Rolle. Bleibt
// request.jwt.claim.sub gesetzt, ist auth.uid() weiterhin der zuletzt
// simulierte Nutzer - die Schutztrigger auf profiles (trg_profil_rolle,
// trg_profil_b2b_kunde) greifen dann auch bei Vorgaengen, die als Superuser
// laufen sollen, und der Test scheitert an sich selbst statt am Code.
async function alsAdmin(db) {
  await db.exec("reset role;");
  await db.query("select set_config('request.jwt.claim.role', '', false);");
  await db.query("select set_config('request.jwt.claim.sub', '', false);");
}

async function mussScheitern(db, name, sql, params, erwarteterCode) {
  try {
    await db.query(sql, params);
    check(name, false, "die Anweisung war erfolgreich, erwartet war ein Fehler");
  } catch (e) {
    const code = e?.cause?.code ?? e?.code;
    const ok = erwarteterCode ? code === erwarteterCode : true;
    check(name, ok, `errcode: ${code ?? String(e).slice(0, 90)}`);
  } finally {
    await db.exec("reset role;");
  }
}

const digest = (s) => createHash("sha256").update(s, "utf8").digest("hex");

const db = new PGlite();
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);

// --- 0. Grundlage ------------------------------------------------------------
try {
  await db.exec(readFileSync(AUTH_STUB, "utf8"));
  const migrationsLage = await wendeMigrationenAn(db, MIGRATIONEN_DIR);
  check(migrationenMeldung(migrationsLage), true);
  await db.exec(readFileSync(SEED, "utf8"));
  check("Seed-Daten angewendet", true);
} catch (e) {
  check("Grundlage", false, String(e.message ?? e).slice(0, 300));
  process.exit(1);
}

// --- 1. Testprofile je Rolle -------------------------------------------------
const authIds = {};
{
  for (const [rolle, mail] of [
    ["admin", "qa-admin@damicon.demo"],
    ["betriebsleitung", "qa-leitung@damicon.demo"],
    ["buchhaltung", "qa-buch@damicon.demo"],
    ["brigade", "qa-brigade@damicon.demo"],
    ["kunde", "qa-kunde@damicon.demo"],
  ]) {
    const { rows } = await db.query(
      `insert into auth.users (email, raw_app_meta_data)
       values ($1, $2::jsonb) returning id;`,
      [mail, JSON.stringify({ role: rolle })],
    );
    authIds[rolle] = rows[0].id;
  }
  const { rows } = await db.query(
    `select role, count(*)::int as n from public.profiles
     where email like 'qa-%@damicon.demo' group by role;`,
  );
  check("Vorbereitung: fuenf Testprofile angelegt", rows.length === 5, `Rollen: ${rows.length}`);
}

// Ein B2B-Kunde aus dem Seed.
const { rows: kunden } = await db.query(`select id, name from public.b2b_kunden order by name limit 2;`);
const kundeId = kunden[0]?.id;
check("Vorbereitung: B2B-Kunde aus dem Seed gefunden", !!kundeId, kunden[0]?.name ?? "-");

// Dem kunde-Profil den B2B-Kunden zuordnen (wie seed-auth.mjs es tut).
await db.query(`update public.profiles set b2b_kunde_id = $1 where auth_user_id = $2;`, [
  kundeId,
  authIds.kunde,
]);

// =============================================================================
// 2. CONSTRAINTS
// =============================================================================
const gueltigBis = new Date(Date.now() + 14 * 86400_000).toISOString();

async function einfuegen(digestWert, extra = {}) {
  const felder = {
    code_digest: digestWert,
    b2b_kunde_id: kundeId,
    email: "einkauf@kunde.example",
    full_name: "Test Person",
    gueltig_bis: gueltigBis,
    ...extra,
  };
  const spalten = Object.keys(felder);
  const platz = spalten.map((_, i) => `$${i + 1}`);
  return db.query(
    `insert into public.kundeneinladungen (${spalten.join(", ")})
     values (${platz.join(", ")}) returning id, status;`,
    Object.values(felder),
  );
}

{
  await alsAdmin(db);
  const { rows } = await einfuegen(digest("PROBE-00001-00002-00003"));
  check("Constraint: gueltige Zeile wird angenommen", rows.length === 1, `status: ${rows[0]?.status}`);
}

await mussScheitern(
  db,
  "Constraint: code_digest mit 63 Zeichen wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
   values ($1, $2, 'a@b.de', 'X', $3);`,
  ["a".repeat(63), kundeId, gueltigBis],
  "23514",
);

await mussScheitern(
  db,
  "Constraint: code_digest mit Grossbuchstaben wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
   values ($1, $2, 'a@b.de', 'X', $3);`,
  [digest("X").toUpperCase(), kundeId, gueltigBis],
  "23514",
);

await mussScheitern(
  db,
  "Constraint: E-Mail mit Grossbuchstaben wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
   values ($1, $2, 'Gross@Kunde.de', 'X', $3);`,
  [digest("gross"), kundeId, gueltigBis],
  "23514",
);

await mussScheitern(
  db,
  "Constraint: E-Mail ohne @ wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
   values ($1, $2, 'keinemail', 'X', $3);`,
  [digest("keinemail"), kundeId, gueltigBis],
  "23514",
);

// Der Formconstraint ist ein Regex, kein LIKE: die LIKE-Fassung liess unter
// anderem Leerzeichen mitten in der Adresse, zwei Adressen in einem Feld und
// reine Platzhalterzeichen durch. Jeder dieser Faelle einzeln.
for (const [name, adresse] of [
  ["Leerzeichen mitten drin", "kunde@ex ample.com"],
  ["fuehrendes Leerzeichen im lokalen Teil", "kunde @example.com"],
  ["doppeltes @", "kunde@@example.com"],
  ["Zeilenumbruch, zwei Adressen in einem Feld", "a@b.cd\nx@y.zz"],
  ["Tabulatoren", "\t@\t.\t\t"],
]) {
  await mussScheitern(
    db,
    `Constraint: ${name} wird abgelehnt`,
    `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
     values ($1, $2, $3, 'X', $4);`,
    [digest(`form-${name}`), kundeId, adresse, gueltigBis],
    "23514",
  );
}

// Gegenprobe: gaengige gueltige Formen muss der Constraint durchlassen.
// Dazu "_@_.__": formal wohlgeformt (kein Leerraum, ein @, ein Punkt, zwei
// Zeichen danach) und deshalb angenommen. Ein Formconstraint kann nicht
// entscheiden, ob eine Adresse existiert - das entscheidet erst der Kunde,
// der die Einladung nicht einloest. Dieselbe Grenze zieht die Regel in
// src/lib/actions/einladungen.ts.
for (const [name, adresse] of [
  ["Pluszeichen", "kunde+damicon@example.com"],
  ["Subdomains", "einkauf@mail.corp.example.com"],
  ["lange TLD", "info@example.travelersinsurance"],
  ["Umlaut", "jörg@münchen.de"],
  ["Punkte im lokalen Teil", "a.b.c@d.ee"],
  ["formal wohlgeformt, aber erfunden", "_@_.__"],
]) {
  await alsAdmin(db);
  let ok = true;
  let detail = "";
  try {
    await db.query(
      `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
       values ($1, $2, $3, 'X', $4);`,
      [digest(`gut-${name}`), kundeId, adresse, gueltigBis],
    );
  } catch (e) {
    ok = false;
    detail = String(e?.cause?.code ?? e?.code ?? e).slice(0, 60);
  }
  check(`Constraint: ${name} wird angenommen`, ok, detail);
}

await mussScheitern(
  db,
  "Constraint: Status eingeloest ohne Zeitpunkt wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis, status)
   values ($1, $2, 'a@b.de', 'X', $3, 'eingeloest');`,
  [digest("ohnezeit"), kundeId, gueltigBis],
  "23514",
);

await mussScheitern(
  db,
  "Constraint: Status offen MIT Zeitpunkt wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis, eingeloest_am)
   values ($1, $2, 'a@b.de', 'X', $3, now());`,
  [digest("offenmitzeit"), kundeId, gueltigBis],
  "23514",
);

await mussScheitern(
  db,
  "Constraint: derselbe code_digest zweimal wird abgelehnt",
  `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
   values ($1, $2, 'a@b.de', 'X', $3);`,
  [digest("PROBE-00001-00002-00003"), kundeId, gueltigBis],
  "23505",
);

// Grenzfall: gueltig_bis in der Vergangenheit. Die Datenbank verbietet das
// NICHT - geprueft wird erst beim Einloesen. Bewusst dokumentiert.
{
  await alsAdmin(db);
  const { rows } = await einfuegen(digest("VERGANGEN"), {
    gueltig_bis: new Date(Date.now() - 86400_000).toISOString(),
  });
  check(
    "Grenzfall: Einladung mit Frist in der Vergangenheit ist einfuegbar (Absicht: Pruefung beim Einloesen)",
    rows.length === 1,
  );
}

// =============================================================================
// 3. RLS
// =============================================================================
{
  await alsRolle(db, "anon");
  const { rows } = await db.query(`select id from public.kundeneinladungen;`);
  check("RLS: anon sieht keine Einladung", rows.length === 0, `sichtbar: ${rows.length}`);
  await alsAdmin(db);
}

for (const rolle of ["kunde", "brigade", "buchhaltung"]) {
  await alsRolle(db, "authenticated", authIds[rolle]);
  const { rows } = await db.query(`select id from public.kundeneinladungen;`);
  check(`RLS: ${rolle} sieht keine Einladung`, rows.length === 0, `sichtbar: ${rows.length}`);
  await alsAdmin(db);
}

for (const rolle of ["admin", "betriebsleitung"]) {
  await alsRolle(db, "authenticated", authIds[rolle]);
  const { rows } = await db.query(`select id from public.kundeneinladungen;`);
  check(`RLS: ${rolle} sieht Einladungen`, rows.length > 0, `sichtbar: ${rows.length}`);
  await alsAdmin(db);
}

// Schreiben
{
  await alsRolle(db, "authenticated", authIds.betriebsleitung);
  const { rows } = await db.query(
    `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
     values ($1, $2, 'neu@kunde.example', 'Neu', $3) returning id;`,
    [digest("LEITUNG-INSERT"), kundeId, gueltigBis],
  );
  check("RLS: betriebsleitung darf ausstellen", rows.length === 1);
  await alsAdmin(db);
}

// Wichtig: mussScheitern() setzt die Rolle nur ZURUECK, es setzt sie nicht.
// Ein Aufruf ohne vorheriges alsRolle() laeuft als Superuser durch und die
// Pruefung waere ein falsches Negativ - deshalb hier ausgeschrieben.
{
  await alsRolle(db, "authenticated", authIds.kunde);
  let abgelehnt = false;
  let detail = "";
  try {
    await db.query(
      `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
       values ($1, $2, 'boese@kunde.example', 'Boese', $3);`,
      [digest("KUNDE-INSERT"), kundeId, gueltigBis],
    );
    detail = "die Anweisung war erfolgreich, erwartet war eine Abweisung";
  } catch (e) {
    const code = e?.cause?.code ?? e?.code;
    abgelehnt = code === "42501";
    detail = `errcode: ${code}`;
  }
  check("RLS: kunde darf keine Einladung ausstellen", abgelehnt, detail);
  await alsAdmin(db);
}

{
  await alsRolle(db, "authenticated", authIds.kunde);
  const res = await db.query(
    `update public.kundeneinladungen set status = 'zurueckgezogen' where status = 'offen';`,
  );
  check(
    "RLS: kunde kann keine Einladung aendern",
    res.affectedRows === 0,
    `geaenderte Zeilen: ${res.affectedRows}`,
  );
  await alsAdmin(db);
}

{
  await alsRolle(db, "authenticated", authIds.betriebsleitung);
  const res = await db.query(`delete from public.kundeneinladungen;`);
  check(
    "RLS: auch das Buero kann keine Einladung loeschen (keine DELETE-Policy)",
    res.affectedRows === 0,
    `geloeschte Zeilen: ${res.affectedRows}`,
  );
  await alsAdmin(db);
}

// =============================================================================
// 4. Das atomare Einloesen - der Kern des Zugangswegs
// =============================================================================
{
  await alsAdmin(db);
  const code = "AAAAA-BBBBB-CCCCC-DDDDD";
  await einfuegen(digest(code), { email: "einloese@kunde.example" });

  // Genau das UPDATE, das src/lib/actions/einladungen.ts absetzt.
  const einloesen = () =>
    db.query(
      `update public.kundeneinladungen
         set status = 'eingeloest', eingeloest_am = now()
       where code_digest = $1 and email = $2 and status = 'offen' and gueltig_bis > now()
       returning id, b2b_kunde_id, full_name;`,
      [digest(code), "einloese@kunde.example"],
    );

  const ersteRunde = await einloesen();
  check("Einloesen: erster Versuch trifft genau eine Zeile", ersteRunde.rows.length === 1);

  const zweiteRunde = await einloesen();
  check(
    "Einloesen: zweiter Versuch mit demselben Code trifft keine Zeile mehr",
    zweiteRunde.rows.length === 0,
    `getroffen: ${zweiteRunde.rows.length}`,
  );
}

{
  // Falsche E-Mail zum richtigen Code.
  await alsAdmin(db);
  const code = "EEEEE-FFFFF-GGGGG-HHHHH";
  await einfuegen(digest(code), { email: "richtig@kunde.example" });
  const res = await db.query(
    `update public.kundeneinladungen
       set status = 'eingeloest', eingeloest_am = now()
     where code_digest = $1 and email = $2 and status = 'offen' and gueltig_bis > now()
     returning id;`,
    [digest(code), "falsch@kunde.example"],
  );
  check("Einloesen: richtiger Code mit falscher Adresse trifft keine Zeile", res.rows.length === 0);
}

{
  // Abgelaufene Einladung.
  await alsAdmin(db);
  const code = "IIIII-JJJJJ-KKKKK-LLLLL";
  await einfuegen(digest(code), {
    email: "abgelaufen@kunde.example",
    gueltig_bis: new Date(Date.now() - 1000).toISOString(),
  });
  const res = await db.query(
    `update public.kundeneinladungen
       set status = 'eingeloest', eingeloest_am = now()
     where code_digest = $1 and email = $2 and status = 'offen' and gueltig_bis > now()
     returning id;`,
    [digest(code), "abgelaufen@kunde.example"],
  );
  check("Einloesen: abgelaufene Einladung trifft keine Zeile", res.rows.length === 0);
}

{
  // Zurueckgezogene Einladung.
  await alsAdmin(db);
  const code = "MMMMM-NNNNN-PPPPP-QQQQQ";
  const { rows: neu } = await einfuegen(digest(code), { email: "zurueck@kunde.example" });
  await db.query(`update public.kundeneinladungen set status = 'zurueckgezogen' where id = $1;`, [
    neu[0].id,
  ]);
  const res = await db.query(
    `update public.kundeneinladungen
       set status = 'eingeloest', eingeloest_am = now()
     where code_digest = $1 and email = $2 and status = 'offen' and gueltig_bis > now()
     returning id;`,
    [digest(code), "zurueck@kunde.example"],
  );
  check("Einloesen: zurueckgezogene Einladung trifft keine Zeile", res.rows.length === 0);
}

{
  // Kompensation: zurueck auf offen, wie die Aktion es im Fehlerfall tut.
  await alsAdmin(db);
  const code = "RRRRR-SSSSS-TTTTT-VVVVV";
  const { rows: neu } = await einfuegen(digest(code), { email: "kompens@kunde.example" });
  await db.query(
    `update public.kundeneinladungen set status = 'eingeloest', eingeloest_am = now() where id = $1;`,
    [neu[0].id],
  );
  let ok = true;
  let fehlertext = "";
  try {
    await db.query(
      `update public.kundeneinladungen set status = 'offen', eingeloest_am = null where id = $1;`,
      [neu[0].id],
    );
  } catch (e) {
    ok = false;
    fehlertext = String(e.message ?? e).slice(0, 120);
  }
  check("Kompensation: Zuruecksetzen auf offen verletzt keinen Constraint", ok, fehlertext);
}

// =============================================================================
// 5. Kaskade beim Loeschen eines B2B-Kunden
// =============================================================================
{
  await alsAdmin(db);
  const { rows: eigen } = await db.query(
    `insert into public.b2b_kunden (name) values ('QA Wegwerfkunde') returning id;`,
  );
  await db.query(
    `insert into public.kundeneinladungen (code_digest, b2b_kunde_id, email, full_name, gueltig_bis)
     values ($1, $2, 'weg@kunde.example', 'Weg', $3);`,
    [digest("KASKADE"), eigen[0].id, gueltigBis],
  );
  await db.query(`delete from public.b2b_kunden where id = $1;`, [eigen[0].id]);
  const { rows } = await db.query(
    `select id from public.kundeneinladungen where b2b_kunde_id = $1;`,
    [eigen[0].id],
  );
  check(
    "Kaskade: Loeschen eines B2B-Kunden entfernt seine Einladungen",
    rows.length === 0,
    `verbleibend: ${rows.length}`,
  );
}

// =============================================================================
// 6. Der Kern der Anforderung: ohne Zuordnung keine Kundendaten
// =============================================================================
{
  // Ein 'kunde'-Konto OHNE b2b_kunde_id darf nichts sehen.
  const { rows: ohne } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ('qa-ohnekunde@damicon.demo', '{"role":"kunde"}'::jsonb) returning id;`,
  );
  await db.query(`update public.profiles set role = 'kunde' where auth_user_id = $1;`, [ohne[0].id]);

  await alsRolle(db, "authenticated", ohne[0].id);
  const { rows: rek } = await db.query(`select id from public.reklamationen;`);
  const { rows: lief } = await db.query(`select id from public.lieferungen;`);
  const { rows: kont } = await db.query(`select id from public.kontingente;`);
  check(
    "E.20 Kern: kunde ohne b2b_kunde_id sieht keine Reklamationen",
    rek.length === 0,
    `sichtbar: ${rek.length}`,
  );
  check(
    "E.20 Kern: kunde ohne b2b_kunde_id sieht keine Lieferungen",
    lief.length === 0,
    `sichtbar: ${lief.length}`,
  );
  check(
    "E.20 Kern: kunde ohne b2b_kunde_id sieht keine Kontingente",
    kont.length === 0,
    `sichtbar: ${kont.length}`,
  );
  await alsAdmin(db);
}

{
  // Und er darf sich die Zuordnung nicht selbst geben (trg_profil_b2b_kunde).
  const { rows: ohne } = await db.query(
    `select auth_user_id from public.profiles where email = 'qa-ohnekunde@damicon.demo' limit 1;`,
  );
  await alsRolle(db, "authenticated", ohne[0].auth_user_id);
  let abgewehrt = false;
  let detail = "";
  try {
    const res = await db.query(
      `update public.profiles set b2b_kunde_id = $1 where auth_user_id = $2;`,
      [kundeId, ohne[0].auth_user_id],
    );
    abgewehrt = res.affectedRows === 0;
    detail = `geaenderte Zeilen: ${res.affectedRows}`;
  } catch (e) {
    abgewehrt = true;
    detail = `abgewiesen: ${(e?.cause?.code ?? e?.code) ?? String(e).slice(0, 60)}`;
  }
  check("E.20 Kern: kunde kann sich den B2B-Kunden nicht selbst zuordnen", abgewehrt, detail);
  await alsAdmin(db);
}

// =============================================================================
// 6b. public.einladung_abschliessen() - Verbrauchen und Zuordnen als EINE
//     Transaktion. Das ist der eigentliche Zugangsweg; alles davor in
//     src/lib/actions/einladungen.ts ist nur ein frueher Ausstieg.
// =============================================================================
async function neuesKonto(mail, rolle = "kunde") {
  await alsAdmin(db);
  const { rows } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ($1, $2::jsonb) returning id;`,
    [mail, JSON.stringify({ role: rolle })],
  );
  return rows[0].id;
}

{
  await alsAdmin(db);
  const code = "WWWWW-XXXXX-YYYYY-ZZZZZ";
  await einfuegen(digest(code), { email: "abschluss@kunde.example" });
  const authId = await neuesKonto("abschluss@kunde.example");

  const { rows } = await db.query(
    `select public.einladung_abschliessen($1, $2, $3) as id;`,
    [digest(code), "abschluss@kunde.example", authId],
  );
  check("Abschluss: gueltige Einladung liefert die Einladungs-ID", !!rows[0].id);

  const { rows: profil } = await db.query(
    `select role::text, b2b_kunde_id is not null as hat_kunde, full_name
       from public.profiles where auth_user_id = $1;`,
    [authId],
  );
  check(
    "Abschluss: Profil traegt Rolle kunde und den Kundenbezug",
    profil[0]?.role === "kunde" && profil[0]?.hat_kunde === true,
    JSON.stringify(profil[0]),
  );

  const { rows: einl } = await db.query(
    `select status::text, eingeloest_am is not null as hat_zeit,
            eingeloest_profil_id is not null as hat_profil
       from public.kundeneinladungen where code_digest = $1;`,
    [digest(code)],
  );
  check(
    "Abschluss: Einladung ist eingeloest, mit Zeitpunkt UND Profilbezug",
    einl[0]?.status === "eingeloest" && einl[0]?.hat_zeit && einl[0]?.hat_profil,
    JSON.stringify(einl[0]),
  );

  // Zweiter Aufruf: die Einladung ist verbraucht.
  const authId2 = await neuesKonto("abschluss2@kunde.example");
  const { rows: zweiter } = await db.query(
    `select public.einladung_abschliessen($1, $2, $3) as id;`,
    [digest(code), "abschluss@kunde.example", authId2],
  );
  check("Abschluss: zweiter Aufruf liefert null", zweiter[0].id === null);
}

{
  // Falsche Adresse zum richtigen Code.
  await alsAdmin(db);
  const code = "22222-33333-44444-55555";
  await einfuegen(digest(code), { email: "richtig2@kunde.example" });
  const authId = await neuesKonto("falsch2@kunde.example");
  const { rows } = await db.query(`select public.einladung_abschliessen($1, $2, $3) as id;`, [
    digest(code),
    "falsch2@kunde.example",
    authId,
  ]);
  check("Abschluss: falsche Adresse liefert null", rows[0].id === null);

  const { rows: einl } = await db.query(
    `select status::text from public.kundeneinladungen where code_digest = $1;`,
    [digest(code)],
  );
  check("Abschluss: die Einladung bleibt dabei offen", einl[0]?.status === "offen");
}

{
  // Der wichtigste Fall: kein Profil zum Konto. Die Funktion muss werfen UND
  // die bereits verbrauchte Einladung zurueckrollen - sonst bliebe eine
  // Einladung uebrig, die weder eingeloest noch zurueckziehbar ist.
  await alsAdmin(db);
  const code = "66666-77777-88888-99999";
  await einfuegen(digest(code), { email: "ohneprofil@kunde.example" });

  // Ein auth_user_id, zu dem es garantiert kein Profil gibt.
  const { rows: fremd } = await db.query(`select gen_random_uuid() as id;`);

  let geworfen = false;
  let code_ = "";
  try {
    await db.query(`select public.einladung_abschliessen($1, $2, $3);`, [
      digest(code),
      "ohneprofil@kunde.example",
      fremd[0].id,
    ]);
  } catch (e) {
    geworfen = true;
    code_ = e?.cause?.code ?? e?.code ?? "";
  }
  check("Abschluss: fehlendes Profil wirft DA010", geworfen && code_ === "DA010", `errcode: ${code_}`);

  const { rows: einl } = await db.query(
    `select status::text, eingeloest_am from public.kundeneinladungen where code_digest = $1;`,
    [digest(code)],
  );
  check(
    "Abschluss: nach dem Wurf ist die Einladung wieder offen (Transaktion zurueckgerollt)",
    einl[0]?.status === "offen" && einl[0]?.eingeloest_am === null,
    JSON.stringify(einl[0]),
  );
}

{
  // Die Funktion darf nur der service_role-Weg aufrufen. Ein angemeldeter
  // Nutzer koennte sonst ein beliebiges auth_user_id uebergeben und sich
  // damit eine fremde Einladung zuordnen.
  await alsRolle(db, "authenticated", authIds.kunde);
  let abgewiesen = false;
  let detail = "";
  try {
    await db.query(`select public.einladung_abschliessen($1, $2, $3);`, [
      digest("egal"),
      "egal@kunde.example",
      authIds.kunde,
    ]);
    detail = "der Aufruf war erlaubt";
  } catch (e) {
    const c = e?.cause?.code ?? e?.code;
    abgewiesen = c === "42501";
    detail = `errcode: ${c}`;
  }
  check("Abschluss: authenticated darf die Funktion nicht aufrufen", abgewiesen, detail);
  await alsAdmin(db);
}

// =============================================================================
// 6c. Unveraenderlichkeit und der verengte Statusuebergang
// =============================================================================
{
  await alsAdmin(db);
  const code = "AAAAA-22222-BBBBB-33333";
  const { rows: neu } = await einfuegen(digest(code), { email: "fest@kunde.example" });

  await alsRolle(db, "authenticated", authIds.betriebsleitung);

  // Zurueckziehen: erlaubt.
  const rueckzug = await db.query(
    `update public.kundeneinladungen set status = 'zurueckgezogen' where id = $1;`,
    [neu[0].id],
  );
  check("Uebergang: Buero darf eine offene Einladung zurueckziehen", rueckzug.affectedRows === 1);

  // Wieder scharf schalten: verboten (Policy verlangt status = 'offen' im USING).
  const wieder = await db.query(
    `update public.kundeneinladungen set status = 'offen' where id = $1;`,
    [neu[0].id],
  );
  check(
    "Uebergang: eine zurueckgezogene Einladung laesst sich nicht wieder oeffnen",
    wieder.affectedRows === 0,
    `geaenderte Zeilen: ${wieder.affectedRows}`,
  );
  await alsAdmin(db);
}

{
  // Umschreiben einer offenen Einladung: der Trigger muss es abweisen.
  await alsAdmin(db);
  const code = "CCCCC-44444-DDDDD-55555";
  const { rows: neu } = await einfuegen(digest(code), { email: "umschreib@kunde.example" });

  await alsRolle(db, "authenticated", authIds.betriebsleitung);
  let abgewiesen = false;
  let detail = "";
  try {
    await db.query(
      `update public.kundeneinladungen set email = 'fremd@kunde.example' where id = $1;`,
      [neu[0].id],
    );
    detail = "die Adresse liess sich aendern";
  } catch (e) {
    const c = e?.cause?.code ?? e?.code;
    abgewiesen = c === "42501";
    detail = `errcode: ${c}`;
  }
  check("Unveraenderlich: die Adresse einer Einladung laesst sich nicht umschreiben", abgewiesen, detail);
  await alsAdmin(db);
}

// =============================================================================
// 7. Regression: ein Kundenkonto erbt keine fremden Verknuepfungen
// =============================================================================
// handle_new_auth_user() (Migration 20260905120000) uebernimmt ein bereits
// vorhandenes Profil, wenn es dieselbe E-Mail traegt und noch kein Auth-Konto
// hat, statt ein neues anzulegen. Traegt dieses Profil eine Pflueckerzuordnung,
// erbt das frische Kundenkonto sie - und die Policies aus Migration
// 20260909010000 (lohn_abrechnungen_select_own, pfluecker_select_own) fragen
// ausschliesslich profiles.pfluecker_id ab, ohne die Rolle zu pruefen.
// Am 13.09.2026 gegen PGlite nachgestellt: sichtbar wurden eine fremde
// Lohnabrechnung und der Klarname des Pflueckers. einladungEinloesen() leert
// brigade_id und pfluecker_id deshalb ausdruecklich; dieser Test haelt das fest.
{
  await alsAdmin(db);
  const { rows: pf } = await db.query(
    `select p.id from public.pfluecker p
       join public.lohn_abrechnungen a on a.pfluecker_id = p.id limit 1;`,
  );
  const { rows: brig } = await db.query(`select id from public.brigaden limit 1;`);

  if (!pf[0]) {
    check("Regression: Testfall nicht aufbaubar (kein Pfluecker mit Abrechnung im Seed)", false);
  } else {
    await db.query(
      `insert into public.profiles (full_name, email, role, pfluecker_id, brigade_id)
       values ('QA Altprofil', 'qa-erbe@kunde.example', 'picker', $1, $2);`,
      [pf[0].id, brig[0]?.id ?? null],
    );
    const { rows: u } = await db.query(
      `insert into auth.users (email, raw_app_meta_data)
       values ('qa-erbe@kunde.example', '{"role":"kunde"}'::jsonb) returning id;`,
    );

    // Exakt das Profil-Update aus src/lib/actions/einladungen.ts.
    await db.query(
      `update public.profiles
          set role = 'kunde', b2b_kunde_id = $1, brigade_id = null, pfluecker_id = null,
              full_name = $2, email = $3
        where auth_user_id = $4;`,
      [kundeId, "QA Neuer Kunde", "qa-erbe@kunde.example", u[0].id],
    );

    await alsRolle(db, "authenticated", u[0].id);
    const { rows: lohn } = await db.query(`select id from public.lohn_abrechnungen;`);
    const { rows: pfl } = await db.query(`select id from public.pfluecker;`);
    const { rows: rek } = await db.query(`select id from public.reklamationen;`);
    await alsAdmin(db);

    check(
      "Regression E.20: Kundenkonto erbt keine Lohnabrechnungen eines Altprofils",
      lohn.length === 0,
      `sichtbar: ${lohn.length}`,
    );
    check(
      "Regression E.20: Kundenkonto erbt keinen Pflueckerstamm eines Altprofils",
      pfl.length === 0,
      `sichtbar: ${pfl.length}`,
    );
    check(
      "Gegenprobe: das Kundenkonto sieht trotzdem die eigenen Reklamationen",
      rek.length > 0,
      `sichtbar: ${rek.length}`,
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`${failures} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Pruefungen der Kundeneinladungen gruen.");
