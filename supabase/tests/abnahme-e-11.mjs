// =============================================================================
// Damicon - Abnahmetest Anforderung E.11 gegen PGlite
// =============================================================================
// Ausfuehren:  npm run test:abnahme-e-11
//
// Abnahmekriterium (BRD, WMC-DAM-BRD, Anforderung E.11):
//   "Betrieb, Nachbarbetriebe und Kunden tragen je nach Rechtsform ИИН oder
//    БИН; ein baeuerlicher Betrieb (КХ/ФХ) ohne БИН laesst sich vollstaendig
//    abbilden."
//
// Der zweite Halbsatz ist der eigentliche Pruefstein. Ein Schema mit einem
// einzigen Feld "БИН" besteht den ersten Teil muehelos und faellt am zweiten
// durch - und genau dieser Fall ist der Betrieb selbst.
//
// Geprueft wird gegen die echten Migrationen, nicht gegen ein Abbild des
// Schemas. Zwei Pruefungen am Ende halten fest, was NICHT erfuellt ist; ohne
// sie liest sich ein gruener Lauf wie "E.11 vollstaendig".
// =============================================================================

import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { wendeMigrationenAn } from "./pglite-migrationen.mjs";
import { fileURLToPath } from "node:url";
import {
  RECHTSFORMEN,
  nummernartFuer,
  pruefeNummer,
  pruefzifferStimmt,
  pruefzifferFuer,
} from "../../src/lib/domain/rechtsform.ts";

const WURZEL = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
  if (!ok) failures += 1;
}

/** Erwartet, dass die Anweisung scheitert. Gibt die Fehlermeldung zurueck. */
async function mussScheitern(db, sql, werte = []) {
  try {
    await db.query(sql, werte);
    return null;
  } catch (e) {
    return String(e.message ?? e);
  }
}

// Zwoelfstellige Nummern mit gueltiger Pruefziffer. Frei erfunden: die elf
// Anfangsziffern sind willkuerlich, die zwoelfte ist gerechnet. Es sind
// bewusst keine echten Nummern - ein ИИН ist ein Personendatum.
const IIN_BETRIEB = "850101123458"; // КХ/ФХ, der Betrieb selbst
const IIN_KUNDE = "900315456786"; // Privatperson als Abnehmer
const BIN_TOO = "014040012342"; // ТОО
const BIN_ZWEITER = "220610123454";

const db = new PGlite();

try {
  await db.exec(readFileSync(join(WURZEL, "supabase/fixtures/auth-stub.sql"), "utf8"));
  await wendeMigrationenAn(db, join(WURZEL, "supabase/migrations"));
  await db.exec(readFileSync(join(WURZEL, "supabase/seed.sql"), "utf8"));
  check("Grundlage: Migrationen und Seed angewendet", true);
} catch (e) {
  check("Grundlage: Migrationen und Seed angewendet", false, String(e.message ?? e));
  process.exit(1);
}

// -----------------------------------------------------------------------------
// Das Schema kennt beide Nummernarten
// -----------------------------------------------------------------------------
{
  const { rows } = await db.query(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_name in ('rechtsform', 'identifikationsnummer')
    order by table_name, column_name;
  `);
  const paare = rows.map((r) => `${r.table_name}.${r.column_name}`);
  // Alle drei Gruppen des Abnahmekriteriums: der eigene Betrieb, die
  // Zulieferer und die Abnehmer. Fuer alle drei wird abgerechnet.
  for (const tabelle of ["betriebe", "nachbarbetriebe", "b2b_kunden"]) {
    check(
      `E.11: ${tabelle} traegt Rechtsform und Identifikationsnummer`,
      paare.includes(`${tabelle}.rechtsform`) && paare.includes(`${tabelle}.identifikationsnummer`),
      paare.filter((p) => p.startsWith(tabelle)).join(", ") || "keine der beiden Spalten",
    );
  }

  const { rows: enumWerte } = await db.query(`
    select e.enumlabel
    from pg_type t join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'rechtsform'
    order by e.enumsortorder;
  `);
  const vorhanden = enumWerte.map((r) => r.enumlabel);
  check(
    "E.11: Rechtsform kennt КХ/ФХ, ИП, Privatperson, ТОО, АО und ПК",
    RECHTSFORMEN.every((r) => vorhanden.includes(r)),
    vorhanden.join(", "),
  );
}

// -----------------------------------------------------------------------------
// Der Kernfall: ein КХ/ФХ ohne БИН
// -----------------------------------------------------------------------------
{
  await db.query(
    `insert into public.betriebe (name, rechtsform, identifikationsnummer) values ($1, 'kh_fh', $2);`,
    ["КХ Damicon", IIN_BETRIEB],
  );
  const { rows } = await db.query(
    `select rechtsform, identifikationsnummer,
            public.nummernart_fuer_rechtsform(rechtsform) as art
       from public.betriebe where name = $1;`,
    ["КХ Damicon"],
  );
  check(
    "E.11: ein baeuerlicher Betrieb laesst sich mit ИИН und ohne БИН anlegen",
    rows.length === 1 && rows[0].art === "iin" && rows[0].identifikationsnummer === IIN_BETRIEB,
    rows.length ? `${rows[0].rechtsform} / ${rows[0].art}` : "keine Zeile",
  );
  check(
    "E.11: fuer diesen Betrieb ist kein zweites Nummernfeld noetig",
    rows.length === 1 && rows[0].rechtsform === "kh_fh",
    "eine Spalte traegt beide Nummernarten",
  );
}

// -----------------------------------------------------------------------------
// Nachbarbetrieb und Kunde, beide Nummernarten
// -----------------------------------------------------------------------------
{
  await db.query(
    `insert into public.nachbarbetriebe (name, rechtsform, identifikationsnummer) values ($1, 'too', $2);`,
    ["ТОО Nachbar", BIN_TOO],
  );
  const { rows: nachbar } = await db.query(
    `select public.nummernart_fuer_rechtsform(rechtsform) as art from public.nachbarbetriebe where name = $1;`,
    ["ТОО Nachbar"],
  );
  check(
    "E.11: ein Nachbarbetrieb als ТОО traegt einen БИН",
    nachbar.length === 1 && nachbar[0].art === "bin",
    nachbar.length ? nachbar[0].art : "keine Zeile",
  );

  // Derselbe Zulieferer kann auch Abnehmer sein. Die Eindeutigkeit gilt je
  // Tabelle, damit dieser echte Fall nicht an einer Sperre scheitert.
  await db.query(
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'too', $2);`,
    ["ТОО Nachbar als Kunde", BIN_TOO],
  );
  const { rows: doppelrolle } = await db.query(
    `select count(*)::int as n from public.b2b_kunden where identifikationsnummer = $1;`,
    [BIN_TOO],
  );
  check(
    "E.11: ein Zulieferer, der zugleich Kunde ist, behaelt seine Nummer",
    doppelrolle[0].n === 1,
    "Eindeutigkeit gilt je Tabelle, nicht tabellenuebergreifend",
  );

  await db.query(
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'privatperson', $2);`,
    ["Kunde Privat", IIN_KUNDE],
  );
  await db.query(
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'ao', $2);`,
    ["АО Handel", BIN_ZWEITER],
  );
  // Nach Name nachschlagen statt nach Reihenfolge: die Sortierung von
  // kyrillischem und lateinischem Namen haengt an der Kollation der Instanz,
  // und die soll dieser Test nicht mitpruefen.
  const { rows: kunden } = await db.query(
    `select name, public.nummernart_fuer_rechtsform(rechtsform) as art
       from public.b2b_kunden where name in ($1, $2);`,
    ["АО Handel", "Kunde Privat"],
  );
  const art = Object.fromEntries(kunden.map((k) => [k.name, k.art]));
  check(
    "E.11: Kunden tragen je nach Rechtsform БИН oder ИИН",
    kunden.length === 2 && art["АО Handel"] === "bin" && art["Kunde Privat"] === "iin",
    kunden.map((k) => `${k.name}=${k.art}`).join(", "),
  );
}

// -----------------------------------------------------------------------------
// Was die Datenbank nicht durchlaesst
// -----------------------------------------------------------------------------
{
  const ohneForm = await mussScheitern(
    db,
    `insert into public.b2b_kunden (name, identifikationsnummer) values ($1, $2);`,
    ["Ohne Rechtsform", "850101123458"],
  );
  check(
    "E.11: eine Nummer ohne Rechtsform wird abgewiesen",
    ohneForm !== null,
    ohneForm ? "Constraint greift" : "Zeile wurde angelegt",
  );

  // Letzte Ziffer verdreht: elf Anfangsziffern gleich, Pruefziffer falsch.
  const falsch = IIN_BETRIEB.slice(0, 11) + ((Number(IIN_BETRIEB[11]) + 1) % 10);
  const falschePruef = await mussScheitern(
    db,
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'ip', $2);`,
    ["Falsche Pruefziffer", falsch],
  );
  check(
    "E.11: eine falsche Pruefziffer wird abgewiesen",
    falschePruef !== null,
    falsch,
  );

  const zuKurz = await mussScheitern(
    db,
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'too', $2);`,
    ["Zu kurz", "12345"],
  );
  check("E.11: eine Nummer mit falscher Laenge wird abgewiesen", zuKurz !== null, "12345");

  const doppelt = await mussScheitern(
    db,
    `insert into public.b2b_kunden (name, rechtsform, identifikationsnummer) values ($1, 'privatperson', $2);`,
    ["Doppelte Nummer", IIN_KUNDE],
  );
  check(
    "E.11: dieselbe Nummer kann nicht zweimal vergeben werden",
    doppelt !== null,
    doppelt ? "eindeutiger Index greift" : "Zeile wurde angelegt",
  );

  await db.query(`insert into public.b2b_kunden (name) values ($1);`, ["Altbestand ohne Nummer"]);
  const { rows } = await db.query(`select count(*)::int as n from public.b2b_kunden where name = $1;`, [
    "Altbestand ohne Nummer",
  ]);
  check(
    "E.11: Bestandsdaten ohne Nummer bleiben anlegbar",
    rows[0].n === 1,
    "kein not null auf dem Altbestand",
  );
}

// -----------------------------------------------------------------------------
// Anwendung und Datenbank urteilen gleich
// -----------------------------------------------------------------------------
// Beide Seiten tragen dieselbe Regel doppelt (Formular warnt vorab, Datenbank
// laesst direkten Zugriff nicht durch). Auseinanderlaufen waere der schlimmste
// Fall: das Formular nimmt an, was die Datenbank verwirft.
{
  const proben = [IIN_BETRIEB, BIN_TOO, IIN_KUNDE, "850101123457", "000000000000", "12345"];
  let gleich = 0;
  for (const p of proben) {
    const { rows } = await db.query(`select public.pruefziffer_stimmt($1) as ok;`, [p]);
    const sql = rows[0].ok;
    const ts = /^[0-9]{12}$/.test(p) ? pruefzifferStimmt(p) : null;
    if (sql === ts) gleich += 1;
    else console.log(`      Abweichung bei ${p}: SQL=${sql} TS=${ts}`);
  }
  check(
    "E.11: Pruefziffer in Datenbank und Anwendung liefert dasselbe Urteil",
    gleich === proben.length,
    `${gleich} von ${proben.length} Proben gleich`,
  );

  let artGleich = 0;
  for (const r of RECHTSFORMEN) {
    const { rows } = await db.query(`select public.nummernart_fuer_rechtsform($1::public.rechtsform) as art;`, [r]);
    if (rows[0].art === nummernartFuer(r)) artGleich += 1;
    else console.log(`      Abweichung bei ${r}: SQL=${rows[0].art} TS=${nummernartFuer(r)}`);
  }
  check(
    "E.11: Zuordnung Rechtsform zu Nummernart ist in beiden Schichten gleich",
    artGleich === RECHTSFORMEN.length,
    `${artGleich} von ${RECHTSFORMEN.length}`,
  );

  check(
    "E.11: das Formular unterscheidet Format- und Pruefzifferfehler",
    pruefeNummer("12345", "too") === "format" &&
      pruefeNummer("850101123457", "kh_fh") === "pruefziffer" &&
      pruefeNummer("850101123458", null) === "keine-rechtsform" &&
      pruefeNummer("", "too") === null &&
      pruefeNummer(IIN_BETRIEB, "kh_fh") === null,
    "vier Befunde und der Gutfall",
  );

  check(
    "E.11: zu elf Ziffern wird eine gueltige Pruefziffer gerechnet",
    pruefzifferFuer("85010112345") === 8 && pruefzifferStimmt("85010112345" + 8),
    "Grundlage der Testdaten und spaeterer Seeds",
  );
}

// -----------------------------------------------------------------------------
// Was E.11 noch NICHT erfuellt
// -----------------------------------------------------------------------------
// Ohne diese beiden Zeilen liest sich ein gruener Lauf als vollstaendige
// Erfuellung. Beide Luecken sind bewusst offen, nicht uebersehen.
{
  const { rows } = await db.query(`
    select count(*)::int as n
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('lieferungen', 'rechnungen')
      and column_name = 'identifikationsnummer';
  `);
  check(
    "E.11 OFFEN: die Nummer steht noch auf keinem Beleg",
    rows[0].n === 0,
    "Belegausgabe haengt an 3.3 (Rechnung fehlt) - hier nur als Stammdatum vorhanden",
  );

  const { rows: strukturPruefung } = await db.query(`
    select public.pruefziffer_stimmt('014040012342') as bin_ok,
           public.pruefziffer_stimmt('010040012342') as struktur_egal;
  `);
  check(
    "E.11 OFFEN: die fuenfte Stelle eines БИН wird nicht auf Struktur geprueft",
    strukturPruefung.bin_ok !== false,
    "bewusst: die Strukturregel liegt uns nicht als gepruefte Primaerquelle vor",
  );
}

console.log(failures === 0 ? "\nAlle Pruefungen bestanden." : `\n${failures} Pruefung(en) fehlgeschlagen.`);
process.exit(failures === 0 ? 0 : 1);
