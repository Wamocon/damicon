// =============================================================================
// Damicon - Abnahmetest Anforderung 2.10 gegen PGlite
// =============================================================================
// Ausfuehren:  npm run test:abnahme-2-10
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung 2.10):
//   "Der Vorarbeiter markiert mit einem Klick eine Steige als kontrolliert;
//    Zeitpunkt, Person und Befund werden gespeichert, eine Abweichung verlangt
//    eine Begruendung (Anforderungsliste Q-02). Niemand kontrolliert eine
//    Steige, die er selbst erfasst hat."
//
// Der Satz enthaelt vier pruefbare Zusagen, und jede hat hier ihren eigenen
// Test: wer kontrollieren darf, dass ein Befund entsteht, dass eine Abweichung
// begruendet wird, und die Vier-Augen-Regel. Die Pruefungen tragen die
// Anforderungsnummer im Namen, damit der Erfuellungsgrad ein Testlauf bleibt
// und keine Auslegungsfrage.
//
// Am Ende steht ausdruecklich, was dieser Test NICHT abdeckt. Ohne diese
// Zeilen liest sich ein gruener Lauf wie "2.10 vollstaendig".
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { wendeMigrationenAn } from "./pglite-migrationen.mjs";
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

/** Erwartet, dass die Anweisung nichts bewirkt - durch Trigger oder durch RLS. */
async function mussAbweisen(db, name, sql, params) {
  try {
    const res = await db.query(sql, params);
    const betroffen = res.affectedRows ?? 0;
    check(name, betroffen === 0, betroffen === 0 ? "durch RLS ohne Wirkung" : `${betroffen} Zeile(n) geaendert`);
  } catch (e) {
    check(name, true, `abgewiesen: ${String(e.message ?? e).split("\n")[0].slice(0, 90)}`);
  }
}

/**
 * Erwartet, dass die Anweisung aus einem BESTIMMTEN Grund scheitert.
 *
 * Ohne diese Variante liest sich jede Ablehnung als Erfolg, auch die falsche:
 * Im ersten Lauf meldete die Vier-Augen-Pruefung PASS, obwohl in Wahrheit die
 * fehlende Berechtigung gegriffen hatte - die Regel selbst war nie erreicht.
 * Ein Test, der nur "abgewiesen" prueft, haette den Mangel durchgelassen.
 */
async function mussAbweisenMit(db, name, sql, params, erwartet) {
  try {
    const res = await db.query(sql, params);
    const betroffen = res.affectedRows ?? 0;
    check(name, false, betroffen === 0 ? "nicht abgewiesen, nur durch RLS ohne Wirkung" : `${betroffen} Zeile(n) geaendert`);
  } catch (e) {
    const text = String(e.message ?? e);
    check(name, text.includes(erwartet), text.includes(erwartet)
      ? `richtiger Grund: ${erwartet}`
      : `falscher Grund: ${text.split("\n")[0].slice(0, 90)}`);
  }
}

/** Erwartet, dass die Anweisung genau eine Zeile aendert. */
async function mussGelingen(db, name, sql, params) {
  try {
    const res = await db.query(sql, params);
    const betroffen = res.affectedRows ?? 0;
    check(name, betroffen === 1, `${betroffen} Zeile(n) geaendert`);
  } catch (e) {
    check(name, false, String(e.message ?? e).split("\n")[0].slice(0, 120));
  }
}

const db = new PGlite();
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);
console.log("Abnahmetest Anforderung 2.10 - Stichprobenkontrolle je Steige\n");

try {
  await db.exec(readFileSync(join(WURZEL, "supabase/fixtures/auth-stub.sql"), "utf8"));
  await wendeMigrationenAn(db, join(WURZEL, "supabase/migrations"));
  await db.exec(readFileSync(join(WURZEL, "supabase/seed.sql"), "utf8"));
  check("Grundlage: Migrationen und Seed angewendet", true);
} catch (e) {
  check("Grundlage", false, String(e.message ?? e).slice(0, 250));
  process.exit(1);
}

// Vier Nutzer, weil die Anforderung vier Blickwinkel hat: die Betriebsleitung
// (darf immer), zwei Personen der Brigade (eine benannt, eine nicht) und den
// Erfasser, an dem sich die Vier-Augen-Regel zeigt.
async function nutzer(email, rolle) {
  const { rows } = await db.query(
    `insert into auth.users (email, raw_app_meta_data)
     values ($1, jsonb_build_object('role', $2::text)) returning id;`,
    [email, rolle],
  );
  return rows[0].id;
}

const leitung = await nutzer("abnahme-2-10-leitung@damicon.demo", "betriebsleitung");
const vorarbeiter = await nutzer("abnahme-2-10-vorarbeiter@damicon.demo", "brigade");
const feldkraft = await nutzer("abnahme-2-10-feldkraft@damicon.demo", "brigade");

await alsAdmin(db);
const profilVon = async (authId) =>
  (await db.query(`select id from public.profiles where auth_user_id = $1;`, [authId])).rows[0]?.id;

const profilVorarbeiter = await profilVon(vorarbeiter);
const profilFeldkraft = await profilVon(feldkraft);
check(
  "Vorbereitung: Profile fuer Vorarbeiter und Feldkraft angelegt",
  Boolean(profilVorarbeiter && profilFeldkraft),
);

// --- Das Kennzeichen vergibt nur die Betriebsleitung -----------------------
await alsRolle(db, "authenticated", feldkraft);
await mussAbweisen(
  db,
  "2.10 Kennzeichen: eine Feldkraft setzt sich das Kontrollrecht nicht selbst",
  `update public.profiles set darf_kontrollieren = true where id = $1;`,
  [profilFeldkraft],
);

await alsRolle(db, "authenticated", leitung);
await mussGelingen(
  db,
  "2.10 Kennzeichen: die Betriebsleitung benennt einen Vorarbeiter",
  `update public.profiles set darf_kontrollieren = true where id = $1;`,
  [profilVorarbeiter],
);

// --- Erfasser wird gesetzt, nicht vom Client bestimmt ----------------------
await alsAdmin(db);
const { rows: aufg } = await db.query(
  `select a.id, a.brigade_id
     from public.pflueckaufgaben a
     join public.reihenbloecke r on r.id = a.reihenblock_id
    where a.status <> 'abgeschlossen'
      and r.status <> 'wartezeitgesperrt'
    limit 1;`,
);
if (!aufg[0]) {
  check("Vorbereitung: offene Aufgabe auf freiem Reihenblock gefunden", false, "keine im Seed");
  process.exit(1);
}
const { rows: pf } = await db.query(`select id from public.pfluecker limit 1;`);

// Die Feldkraft gehoert derselben Brigade an wie die Aufgabe - genau wie eine
// echte Feldkraft im Betrieb einer Brigade zugeordnet ist. Ohne diese Zuordnung
// (brigade_id bliebe null) blockt bereits steigen_update_feld (20261018000000)
// jeden Kontrollversuch per RLS, bevor der hier eigentlich geprüfte Trigger
// (Kennzeichenpflicht) ueberhaupt greifen kann - das Recht bliebe ungetestet.
if (aufg[0].brigade_id) {
  await db.query(`update public.profiles set brigade_id = $1 where id = $2;`, [
    aufg[0].brigade_id,
    profilFeldkraft,
  ]);
}

// Die Feldkraft legt die Steige an und schickt dabei absichtlich ein fremdes
// Profil mit. Der Trigger muss es ueberschreiben, sonst liesse sich die
// Vier-Augen-Regel durch eine falsche Angabe aushebeln.
await alsRolle(db, "authenticated", feldkraft);
const { rows: st } = await db.query(
  `insert into public.steigen
     (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt, erfasst_von_profil_id)
   values ('ABN-2-10-001', 'abn-2-10-token-1', $1, $2, 4.20, now(), $3)
   returning id, erfasst_von_profil_id;`,
  [aufg[0].id, pf[0].id, profilVorarbeiter],
);
const steige = st[0].id;
check(
  "2.10 Erfasser: wird auf den Anlegenden gesetzt, ein mitgesendetes Profil wird verworfen",
  st[0].erfasst_von_profil_id === profilFeldkraft,
  `gespeichert: ${st[0].erfasst_von_profil_id === profilFeldkraft ? "Feldkraft (richtig)" : "fremdes Profil"}`,
);

// --- Wer darf kontrollieren ------------------------------------------------
// Die Feldkraft hat kein Kennzeichen - und ist hier zugleich die Erfasserin.
// Der Test steht trotzdem eigenstaendig: er zeigt die fehlende Berechtigung,
// die Vier-Augen-Regel kommt weiter unten an einer fremden Steige.
await mussAbweisenMit(
  db,
  "2.10 Recht: eine Feldkraft ohne Kennzeichen kontrolliert nicht",
  `update public.steigen set kontrolliert_am = now(), kontroll_befund = 'in_ordnung' where id = $1;`,
  [steige],
  "benannter Vorarbeiter",
);

// --- Vier Augen ------------------------------------------------------------
// Der benannte Vorarbeiter legt eine eigene Steige an und versucht, sie selbst
// zu kontrollieren. Das Recht hat er, die Steige ist aber seine eigene.
await alsRolle(db, "authenticated", vorarbeiter);
const { rows: st2 } = await db.query(
  `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
   values ('ABN-2-10-002', 'abn-2-10-token-2', $1, $2, 3.80, now()) returning id;`,
  [aufg[0].id, pf[0].id],
);
await mussAbweisenMit(
  db,
  "2.10 Vier Augen: wer die Steige erfasst hat, kontrolliert sie nicht selbst",
  `update public.steigen set kontrolliert_am = now(), kontroll_befund = 'in_ordnung' where id = $1;`,
  [st2[0].id],
  "kontrolliert sie nicht selbst",
);

// --- Befund- und Begruendungspflicht ---------------------------------------
// Ab hier arbeitet der Vorarbeiter an der Steige der Feldkraft: Recht vorhanden,
// Vier-Augen-Regel erfuellt.
await mussAbweisenMit(
  db,
  "2.10 Befund: eine Kontrolle ohne Befund wird abgewiesen",
  `update public.steigen set kontrolliert_am = now() where id = $1;`,
  [steige],
  "gehoert ein Befund",
);

await mussAbweisenMit(
  db,
  "2.10 Begruendung: eine Abweichung ohne Begruendung wird abgewiesen",
  `update public.steigen set kontrolliert_am = now(), kontroll_befund = 'abweichung' where id = $1;`,
  [steige],
  "verlangt eine Begruendung",
);

await mussAbweisenMit(
  db,
  "2.10 Begruendung: Leerzeichen genuegen als Begruendung nicht",
  `update public.steigen
      set kontrolliert_am = now(), kontroll_befund = 'abweichung', kontroll_begruendung = '   '
    where id = $1;`,
  [steige],
  "verlangt eine Begruendung",
);

await mussAbweisenMit(
  db,
  "2.10 Nachweis: ein Befund ohne Kontrollzeitpunkt wird abgewiesen",
  `update public.steigen set kontroll_befund = 'in_ordnung' where id = $1;`,
  [steige],
  "ohne Kontrollzeitpunkt",
);

// --- Der gelingende Fall ---------------------------------------------------
await mussGelingen(
  db,
  "2.10 Kontrolle: der benannte Vorarbeiter kontrolliert eine fremde Steige mit Befund",
  `update public.steigen
      set kontrolliert_am = now(), kontroll_befund = 'in_ordnung'
    where id = $1;`,
  [steige],
);

await alsAdmin(db);
const { rows: gespeichert } = await db.query(
  `select kontrolliert_am, kontrolliert_von_profil_id, kontroll_befund from public.steigen where id = $1;`,
  [steige],
);
check(
  "2.10 Person: der Kontrollzeitpunkt traegt die kontrollierende Person",
  gespeichert[0].kontrolliert_von_profil_id === profilVorarbeiter,
  gespeichert[0].kontrolliert_von_profil_id === profilVorarbeiter ? "Vorarbeiter" : "falsches Profil",
);
check(
  "2.10 Nachweis: Zeitpunkt und Befund sind gespeichert",
  Boolean(gespeichert[0].kontrolliert_am) && gespeichert[0].kontroll_befund === "in_ordnung",
  `Befund: ${gespeichert[0].kontroll_befund}`,
);

// --- Abweichung mit Begruendung gelingt ------------------------------------
await alsRolle(db, "authenticated", leitung);
const { rows: st3 } = await db.query(
  `select id from public.steigen where code = 'ABN-2-10-002';`,
);
await mussGelingen(
  db,
  "2.10 Abweichung: mit Begruendung wird sie angenommen",
  `update public.steigen
      set kontrolliert_am = now(), kontroll_befund = 'abweichung',
          kontroll_begruendung = 'Zwei Schalen mit Druckstellen in der oberen Lage.'
    where id = $1;`,
  [st3[0].id],
);

// --- Was dieser Test nicht abdeckt -----------------------------------------
// --- Sicherheits-Review 17.09.2026: zwei per Direktzugriff gefundene und in
// PGlite bestaetigte Umgehungen der Vier-Augen-Regel, jetzt als Regression -----
// Vorher liess sich das Kontrollergebnis nachtraeglich ueberschreiben (siehe
// zweiter Fall unten) und erfasst_von_profil_id im Nachhinein loeschen, um die
// Vier-Augen-Regel damit fuer den eigentlichen Erfasser auszuhebeln (erster
// Fall). Beide Pfade gehen direkt per UPDATE, unter Umgehung der Server
// Action - genau der Weg, den ein eigenes, gueltiges Session-JWT eroeffnet.

await alsRolle(db, "authenticated", vorarbeiter);
const { rows: st4 } = await db.query(
  `insert into public.steigen (code, qr_token, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
   values ('ABN-2-10-003', 'abn-2-10-token-3', $1, $2, 3.10, now()) returning id;`,
  [aufg[0].id, pf[0].id],
);
// Der Vorarbeiter erfasst diese Steige selbst - die Vier-Augen-Regel muesste
// eine eigene Kontrolle verhindern.
await mussAbweisenMit(
  db,
  "2.10 Sicherheit: erfasst_von_profil_id laesst sich nicht nachtraeglich loeschen, um die Vier-Augen-Regel zu umgehen",
  `update public.steigen set erfasst_von_profil_id = null where id = $1;`,
  [st4[0].id],
  "laesst sich nachtraeglich nicht mehr aendern",
);

await alsRolle(db, "authenticated", leitung);
await mussAbweisenMit(
  db,
  "2.10 Sicherheit: eine bereits durchgefuehrte Kontrolle laesst sich nicht per Direkt-UPDATE ueberschreiben",
  `update public.steigen
      set kontroll_befund = 'abweichung', kontroll_begruendung = 'nachtraeglich veraendert'
    where id = $1;`,
  [steige],
  "laesst sich nicht mehr aendern",
);

console.log("");
console.log("NICHT abgedeckt (bewusst, kein automatisierter Nachweis moeglich):");
console.log("  - 2.10 Bedienung mit Handschuhen und im Sonnenlicht: nur im Feldtest");
console.log("    pruefbar (NB-02, TR-TST-04).");
console.log("  - 2.10 Ein Klick je Steige: die Oberflaeche zaehlt kein Test, sie wird");
console.log("    im Oberflaechentest gemessen (TR-TST-02).");

console.log("");
console.log("----------------------------------------------------------");
console.log(`Pruefungen abgeschlossen. Fehlgeschlagen: ${failures}`);
if (failures > 0) {
  console.log("Abnahmekriterium 2.10 NICHT erfuellt.");
  process.exit(1);
}
console.log("Abnahmekriterium 2.10 erfuellt, soweit automatisiert pruefbar.");
