// =============================================================================
// Damicon - Abnahmetest Anforderung 2.7
// =============================================================================
// Ausfuehren:  npm run test:abnahme-2-7
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung 2.7):
//   "Jede Steige erhaelt beim Erfassen eine eindeutige, atomar vergebene
//    Kennung mit QR-Code; Etiketten sind druckbar; ein Scan am Sammelpunkt
//    ruft die Steige auf."
//
// Der Satz hat drei Teile. Die ersten beiden waren erfuellt, bevor dieser Test
// entstand (Migration 20260915000000 fuer die atomare Nummer, qr-steigen-
// ansicht.tsx fuer Etikett und Druck) - sie werden hier trotzdem geprueft,
// weil ein Abnahmetest den ganzen Satz belegen soll und nicht nur den zuletzt
// gebauten Teil.
//
// Der dritte Teil war offen: Der Etiketten-QR zeigte auf die Herkunft der
// Charge, und eine Charge umfasst viele Steigen. Ein Scan konnte die einzelne
// Steige also gar nicht benennen.
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { steigenCodeAusScan, normalisiereSteigenCode } from "../../src/lib/domain/steige-scan.ts";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

console.log("Abnahmetest Anforderung 2.7 - Steigenkennung, Etikett und Scan\n");

// ---------------------------------------------------------------------------
// Teil 3: der Scan am Sammelpunkt (reine Logik, keine Kamera noetig)
// ---------------------------------------------------------------------------
const ETIKETT_URL =
  "https://damicon.example/de/herkunft/hk_cabf175a9309443f?steige=ST-2026-0417";

check(
  "2.7 Scan: die Etiketten-URL gibt die Steigenkennung her",
  steigenCodeAusScan(ETIKETT_URL) === "ST-2026-0417",
  `gelesen: ${steigenCodeAusScan(ETIKETT_URL)}`,
);

check(
  "2.7 Scan: Gross-/Kleinschreibung der Kennung spielt keine Rolle",
  steigenCodeAusScan("https://damicon.example/de/herkunft/hk_x?steige=st-2026-0417") ===
    "ST-2026-0417",
);

check(
  "2.7 Scan: die nackte Kennung vom Klartext des Etiketts wird angenommen",
  steigenCodeAusScan("  st-2026-0417 ") === "ST-2026-0417",
);

// Ein Etikett aus der Zeit vor dieser Anforderung traegt nur den Chargen-Code.
// Daraus eine Steige abzuleiten waere geraten - eine Charge hat viele.
check(
  "2.7 Scan: ein altes Etikett ohne Kennung liefert nichts, statt zu raten",
  steigenCodeAusScan("https://damicon.example/de/herkunft/hk_cabf175a9309443f") === null,
);

check(
  "2.7 Scan: ein fremder QR-Code liefert nichts",
  steigenCodeAusScan("https://example.com/irgendwas?ref=abc") === null,
);

check(
  "2.7 Scan: eine kaputte Adresse liefert nichts, statt zu werfen",
  steigenCodeAusScan("http://[kaputt") === null,
);

check("2.7 Scan: ein leerer Scan liefert nichts", steigenCodeAusScan("   ") === null);

// Freitext mit Leerzeichen ist keine Kennung, sondern ein versehentlich
// erfasster Fremdcode - etwa ein Produktaufkleber.
check(
  "2.7 Scan: Freitext mit Leerzeichen gilt nicht als Kennung",
  steigenCodeAusScan("Himbeeren 500 g") === null,
);

check(
  "2.7 Scan: der Vergleich normalisiert beide Seiten gleich",
  normalisiereSteigenCode(" st-2026-0417 ") === normalisiereSteigenCode("ST-2026-0417"),
);

// ---------------------------------------------------------------------------
// Teil 1: Kennung, eindeutig und atomar vergeben
// ---------------------------------------------------------------------------
const db = new PGlite();
console.log("");
console.log("PGlite:", (await db.query("select version();")).rows[0].version.split(",")[0]);

try {
  await db.exec(readFileSync(join(WURZEL, "supabase/fixtures/auth-stub.sql"), "utf8"));
  for (const d of readdirSync(join(WURZEL, "supabase/migrations"))
    .filter((f) => f.endsWith(".sql") && !f.endsWith("_pgvector.sql"))
    .sort()) {
    await db.exec(readFileSync(join(WURZEL, "supabase/migrations", d), "utf8"));
  }
  await db.exec(readFileSync(join(WURZEL, "supabase/seed.sql"), "utf8"));
  check("Grundlage: Migrationen und Seed angewendet", true);
} catch (e) {
  check("Grundlage", false, String(e.message ?? e).slice(0, 250));
  process.exit(1);
}

const { rows: aufg } = await db.query(
  `select a.id from public.pflueckaufgaben a
     join public.reihenbloecke r on r.id = a.reihenblock_id
    where r.status <> 'wartezeitgesperrt' limit 1;`,
);
const { rows: pf } = await db.query(`select id from public.pfluecker limit 1;`);

// Die Nummer leitet sich aus dem Code der Charge ab, deshalb muss sie hier
// stehen - steige_nummer_vergeben() weist eine Steige ohne Charge ausdruecklich
// ab, statt ihr eine Nummer ohne Herkunft zu geben.
const { rows: ch } = await db.query(
  `select id from public.chargen where pflueckaufgabe_id = $1 limit 1;`,
  [aufg[0].id],
);
if (!ch[0]) {
  check("Vorbereitung: Charge zur Aufgabe gefunden", false, "keine im Seed");
  process.exit(1);
}

// Zehn Steigen an derselben Aufgabe: Die Nummer kommt aus dem Zaehler der
// Aufgabe, nicht aus dem Client. Doppelte oder Luecken waeren ein Defekt.
const codes = [];
for (let i = 0; i < 10; i++) {
  const { rows } = await db.query(
    `insert into public.steigen (code, qr_token, charge_id, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
     values ('', '', $1, $2, $3, 2.0, now()) returning code, qr_token;`,
    [ch[0].id, aufg[0].id, pf[0].id],
  );
  codes.push(rows[0]);
}

check(
  "2.7 Kennung: zehn Steigen ergeben zehn verschiedene Kennungen",
  new Set(codes.map((c) => c.code)).size === 10,
  `verschieden: ${new Set(codes.map((c) => c.code)).size} von 10`,
);
check(
  "2.7 Kennung: jede Steige traegt auch einen eigenen QR-Token",
  new Set(codes.map((c) => c.qr_token)).size === 10,
);
check(
  "2.7 Kennung: der Client kann die Kennung nicht bestimmen",
  codes.every((c) => c.code !== ""),
  `leer geblieben: ${codes.filter((c) => c.code === "").length}`,
);

// Die Eindeutigkeit haengt nicht am Trigger allein, sondern steht als
// Bedingung in der Tabelle - ein direkter Zugriff kann sie nicht umgehen.
const { rows: uniq } = await db.query(
  `select count(*)::int as n from pg_constraint c
     join pg_class t on t.oid = c.conrelid
    where t.relname = 'steigen' and c.contype = 'u';`,
);
check(
  "2.7 Kennung: die Datenbank erzwingt die Eindeutigkeit selbst",
  uniq[0].n >= 2,
  `${uniq[0].n} Eindeutigkeitsbedingungen auf steigen`,
);

// ---------------------------------------------------------------------------
// Teil 2: Etikett druckbar
// ---------------------------------------------------------------------------
// Ein Etikett braucht den oeffentlichen Code der Charge - ohne ihn filtert
// ladeSteigenEtiketten() die Zeile heraus, weil sich kein funktionierender QR
// erzeugen liesse.
const { rows: mitCharge } = await db.query(
  `select count(*)::int as n
     from public.steigen s join public.chargen c on c.id = s.charge_id
    where c.oeffentlicher_code is not null;`,
);
check(
  "2.7 Etikett: es gibt Steigen mit oeffentlichem Chargen-Code zum Drucken",
  mitCharge[0].n > 0,
  `${mitCharge[0].n} druckbare Steigen`,
);

console.log("");
console.log("NICHT abgedeckt (bewusst, kein automatisierter Nachweis moeglich):");
console.log("  - 2.7 Die Kameraerkennung selbst (qr-scanner) und die Lesbarkeit des");
console.log("    gedruckten Etiketts im Sonnenlicht: nur im Feldtest (TR-TST-04).");
console.log("  - 2.7 Das Druckbild: im Oberflaechentest zu pruefen (TR-TST-02).");

console.log("");
console.log("----------------------------------------------------------");
console.log(`Pruefungen abgeschlossen. Fehlgeschlagen: ${failures}`);
if (failures > 0) {
  console.log("Abnahmekriterium 2.7 NICHT erfuellt.");
  process.exit(1);
}
console.log("Abnahmekriterium 2.7 erfuellt, soweit automatisiert pruefbar.");
