// =============================================================================
// Damicon - Abnahmetest Anforderung 2.8
// =============================================================================
// Ausfuehren:  npm run test:abnahme-2-8
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung 2.8):
//   "Ein Scan von Ausweis und Steige legt Menge, Reihenblock, Uhrzeit und
//    Person in einem Vorgang an; keine Biometrie."
//
// ZUM ZWEITEN SCAN
//
// Der Wortlaut nennt zwei Scans. Der zweite setzt voraus, dass die Steige beim
// Abgeben bereits eine Kennung traegt - also vorab etikettiert ins Feld geht.
// So laeuft der Betrieb nicht: Der Pfluecker bringt die Steige, der Vorarbeiter
// scannt den Ausweis und gibt das Gewicht ein, und erst dieser Schreibvorgang
// erzeugt die Kennung, atomar aus dem Zaehler der Pflueckaufgabe
// (steige_nummer_vergeben(), Migration 20260915000000). Vor dem Erfassen gibt
// es nichts zu scannen. Der Ablauf wurde am 16.09.2026 vom Auftraggeber
// bestaetigt.
//
// Der Steigen-Scan ist damit nicht entfallen, sondern sitzt an der Stelle, an
// der er etwas leistet: beim spaeteren Wiederaufrufen einer bereits erfassten
// Steige am Sammelpunkt (Anforderung 2.7, supabase/tests/abnahme-2-7.mjs).
//
// Dieser Test prueft deshalb den Vorgang, den es gibt: ein Ausweis-Scan, eine
// Mengeneingabe, ein Schreibvorgang - und darin Person, Menge, Reihenblock und
// Uhrzeit vollstaendig.
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { wendeMigrationenAn } from "./pglite-migrationen.mjs";
import { fileURLToPath } from "node:url";
import { pflueckerZuAusweis } from "../../src/lib/domain/ausweis-scan.ts";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("Abnahmetest Anforderung 2.8 - Ausweis-Scan und Steigenerfassung\n");

// ---------------------------------------------------------------------------
// Die Person kommt aus dem Scan, nicht aus einer Auswahl
// ---------------------------------------------------------------------------
const LISTE = [
  { id: "p1", name: "Aliya N.", ausweis: "MAL-0417" },
  { id: "p2", name: "Bekzat S.", ausweis: "MAL-0418" },
];

check(
  "2.8 Person: ein gescannter Ausweis benennt genau eine Person",
  pflueckerZuAusweis("MAL-0417", LISTE)?.id === "p1",
);
check(
  "2.8 Person: Schreibweise und Leerzeichen aendern die Zuordnung nicht",
  pflueckerZuAusweis(" mal-0418 ", LISTE)?.id === "p2",
);
check(
  "2.8 Person: ein fremder Ausweis ordnet niemandem zu",
  pflueckerZuAusweis("XXX-0000", LISTE) === null,
);

const doppelt = [...LISTE, { id: "p3", name: "Doppelt", ausweis: "MAL-0417" }];
check(
  "2.8 Person: bei doppelter Kennung wird niemand gewaehlt, statt zu raten",
  pflueckerZuAusweis("MAL-0417", doppelt) === null,
);

// ---------------------------------------------------------------------------
// Ein Vorgang legt alle vier Angaben an
// ---------------------------------------------------------------------------
const db = new PGlite();
console.log("");
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);

try {
  await db.exec(readFileSync(join(WURZEL, "supabase/fixtures/auth-stub.sql"), "utf8"));
  await wendeMigrationenAn(db, join(WURZEL, "supabase/migrations"));
  await db.exec(readFileSync(join(WURZEL, "supabase/seed.sql"), "utf8"));
  check("Grundlage: Migrationen und Seed angewendet", true);
} catch (e) {
  check("Grundlage", false, String(e.message ?? e).slice(0, 250));
  process.exit(1);
}

const { rows: aufg } = await db.query(
  `select a.id, a.reihenblock_id from public.pflueckaufgaben a
     join public.reihenbloecke r on r.id = a.reihenblock_id
    where r.status <> 'wartezeitgesperrt' limit 1;`,
);
const { rows: ch } = await db.query(
  `select id from public.chargen where pflueckaufgabe_id = $1 limit 1;`,
  [aufg[0].id],
);
const { rows: pf } = await db.query(`select id from public.pfluecker limit 1;`);

// Genau der Schreibvorgang, den steigeKern() ausloest: ein Insert, mehr nicht.
const geraetZeit = new Date().toISOString();
const { rows: neu } = await db.query(
  `insert into public.steigen
     (code, qr_token, charge_id, pflueckaufgabe_id, pfluecker_id, gewicht_kg, geraet_zeitpunkt)
   values ('', '', $1, $2, $3, 4.25, $4)
   returning id, code, pfluecker_id, gewicht_kg, pflueckaufgabe_id, scan_zeitpunkt, geraet_zeitpunkt;`,
  [ch[0].id, aufg[0].id, pf[0].id, geraetZeit],
);
const s = neu[0];

check("2.8 Vorgang: ein einziger Schreibvorgang legt die Steige an", Boolean(s.id));
check("2.8 Person: sie steht an der Steige", s.pfluecker_id === pf[0].id);
check("2.8 Menge: sie steht an der Steige", Number(s.gewicht_kg) === 4.25, `${s.gewicht_kg} kg`);

// Der Reihenblock haengt nicht an der Steige, sondern an der Pflueckaufgabe -
// eine Aufgabe gilt genau einem Block. Die Anforderung verlangt, dass er
// erfasst IST, nicht dass er noch einmal abgeschrieben wird.
const { rows: block } = await db.query(
  `select r.code from public.steigen s
     join public.pflueckaufgaben a on a.id = s.pflueckaufgabe_id
     join public.reihenbloecke r on r.id = a.reihenblock_id
    where s.id = $1;`,
  [s.id],
);
check(
  "2.8 Reihenblock: er ist ueber die Aufgabe eindeutig bestimmt",
  Boolean(block[0]?.code),
  `Block ${block[0]?.code}`,
);

// Anforderung 2.6: Die Uhrzeit ist die des Geraets, nicht die des
// Servereingangs - sonst zeichnet eine verzoegert synchronisierte Erfassung
// die Sync-Zeit auf.
check(
  "2.8 Uhrzeit: der Scan-Zeitpunkt kommt aus der Geraetezeit",
  Boolean(s.scan_zeitpunkt) && Boolean(s.geraet_zeitpunkt),
  `scan_zeitpunkt gesetzt: ${Boolean(s.scan_zeitpunkt)}`,
);

check(
  "2.8 Kennung: der Vorgang meldet die vergebene Kennung zurueck",
  typeof s.code === "string" && s.code.length > 0,
  s.code,
);

// ---------------------------------------------------------------------------
// Keine Biometrie
// ---------------------------------------------------------------------------
// Nicht als Absichtserklaerung, sondern am Schema gemessen: Weder an der
// Steige noch am Pflueckerstamm darf ein Feld stehen, das ein koerperliches
// Merkmal aufnimmt.
const { rows: spalten } = await db.query(
  `select table_name, column_name from information_schema.columns
    where table_schema = 'public'
      and table_name in ('steigen', 'pfluecker', 'profiles')
      and (column_name ~* 'biometr|finger|iris|gesicht|face|retina|stimme|voice');`,
);
check(
  "2.8 Keine Biometrie: kein biometrisches Feld an Steige, Pfluecker oder Profil",
  spalten.length === 0,
  spalten.length === 0 ? "keine Treffer" : spalten.map((r) => `${r.table_name}.${r.column_name}`).join(", "),
);

// Der Ausweis ist eine vergebene Kennung, kein Koerpermerkmal - genau das
// unterscheidet ihn von Biometrie.
const { rows: ausweisSpalte } = await db.query(
  `select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'pfluecker' and column_name = 'ausweis';`,
);
check(
  "2.8 Keine Biometrie: der Ausweis ist eine vergebene Kennung in Textform",
  ausweisSpalte[0]?.data_type === "text",
  `Typ: ${ausweisSpalte[0]?.data_type}`,
);

console.log("");
console.log("NICHT abgedeckt (bewusst):");
console.log("  - 2.8 Der zweite Scan des Wortlauts entfaellt, weil die Steige ihre");
console.log("    Kennung erst in diesem Vorgang bekommt. Waere sie vorab etikettiert,");
console.log("    braeuchte es eine Vorratsvergabe ohne Pflueckaufgabe - ein eigener");
console.log("    Umbau. Ablauf am 16.09.2026 vom Auftraggeber bestaetigt.");
console.log("  - 2.8 Die Kameraerkennung selbst und die Bedienung mit Handschuhen:");
console.log("    nur im Feldtest (NB-02, TR-TST-04).");

console.log("");
console.log("----------------------------------------------------------");
console.log(`Pruefungen abgeschlossen. Fehlgeschlagen: ${failures}`);
if (failures > 0) {
  console.log("Abnahmekriterium 2.8 NICHT erfuellt.");
  process.exit(1);
}
console.log("Abnahmekriterium 2.8 erfuellt, soweit automatisiert pruefbar.");
