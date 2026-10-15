// Fachliche Einstellungen (Migration 20261208030000, Entscheidung vom 15.10.2026): die Liste im Code (src/lib/einstellungen.ts) gegen die
// Startwerte der Datenbank, das Aendern nur ueber die Funktion mit Rolle, Typ und Grenzen, der unveraenderliche Verlauf, die Eingabepruefung.
// PGlite, kein Docker noetig.
//
// Aufruf: npm run test:einstellungen

import { starte } from "./hilfen/pglite-rollen.mjs";
import { bereiche, darfEinstellungAendern, einstellungDef, einstellungen, einstellungTextSchluessel, pruefeEinstellungEingabe } from "@/lib/einstellungen";
import { readFileSync } from "node:fs";

const t = await starte();
const { db, check, als, mussScheitern } = t;
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

interface Zeile {
  schluessel: string;
  bereich: string;
  typ: string;
  wert: string | null;
  standard_wert: string | null;
  min_wert: string | null;
  max_wert: string | null;
  bearbeiter: string[];
  quelle: string;
}
const { rows } = await db.query<Zeile>(`select schluessel, bereich, typ, wert::text, standard_wert::text, min_wert::text, max_wert::text, bearbeiter::text[] as bearbeiter, quelle from public.betriebs_einstellungen order by schluessel;`);
const num = (s: string | null) => (s === null ? null : Number(s));

// --- 1. Liste im Code gegen die Datenbank -------------------------------------------------------------------------------------------------
check("Liste: jede Einstellung im Code steht in der Datenbank", einstellungen.every((e) => rows.some((r) => r.schluessel === e.schluessel)));
check("Liste: jede Einstellung der Datenbank steht im Code", rows.every((r) => einstellungDef(r.schluessel) !== undefined), rows.map((r) => r.schluessel).filter((s) => !einstellungDef(s)).join(","));
for (const e of einstellungen) {
  const r = rows.find((z) => z.schluessel === e.schluessel);
  if (!r) continue;
  const gleich =
    r.bereich === e.bereich && r.typ === e.typ && num(r.standard_wert) === e.standard && num(r.wert) === e.standard && num(r.min_wert) === e.min && num(r.max_wert) === e.max;
  check(`Liste: ${e.schluessel} hat in Code und Datenbank denselben Bereich, Typ, Standard und dieselben Grenzen`, gleich, JSON.stringify(r));
  const soll = [...new Set(["admin", "ceo", ...e.bearbeiter])].sort().join();
  check(`Liste: ${e.schluessel} hat dieselben Bearbeiter in Code und Datenbank`, [...r.bearbeiter].sort().join() === soll, `${[...r.bearbeiter].sort().join()} gegen ${soll}`);
  check(`Liste: ${e.schluessel} hat eine Quelle`, r.quelle.length > 20);
}
{
  const de = JSON.parse(readFileSync("src/messages/de.json", "utf8")).einstellungen;
  const sprachen = ["de", "en", "ru", "kk"].map((l) => ({ l, m: JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")).einstellungen }));
  for (const { l, m } of sprachen) {
    const fehlt = einstellungen.filter((e) => !m?.eintrag?.[einstellungTextSchluessel(e.schluessel)]?.label || !m?.eintrag?.[einstellungTextSchluessel(e.schluessel)]?.beschreibung || !m?.einheit?.[e.einheit] || !m?.bereich?.[e.bereich]?.titel);
    check(`Texte (${l}): jede Einstellung hat Beschriftung, Beschreibung, Einheit und Bereich`, fehlt.length === 0, fehlt.map((e) => e.schluessel).join(","));
  }
  check("Texte: alle Bereiche der Liste haben einen Titel", bereiche.every((b) => !!de.bereich[b]?.titel));
}

// --- 2. Eingabepruefung -----------------------------------------------------------------------------------------------------------------
{
  const frist = einstellungDef("esf.frist_tage")!;
  const kap = einstellungDef("abholung.fahrzeug_kapazitaet_kg")!;
  check("Eingabe: eine ganze Zahl im Bereich wird angenommen", JSON.stringify(pruefeEinstellungEingabe(frist, "20")) === JSON.stringify({ wert: 20 }));
  check("Eingabe: leer heisst nicht gesetzt", JSON.stringify(pruefeEinstellungEingabe(frist, "  ")) === JSON.stringify({ wert: null }));
  check("Eingabe: eine Dezimalzahl bei einer Ganzzahl wird abgelehnt", JSON.stringify(pruefeEinstellungEingabe(frist, "7,5")) === JSON.stringify({ fehler: "einstellungGanzzahl" }));
  check("Eingabe: unter dem Minimum und ueber dem Maximum werden abgelehnt", JSON.stringify(pruefeEinstellungEingabe(frist, "0")) === JSON.stringify({ fehler: "einstellungGrenzen" }) && JSON.stringify(pruefeEinstellungEingabe(frist, "61")) === JSON.stringify({ fehler: "einstellungGrenzen" }));
  check("Eingabe: Buchstaben werden abgelehnt", JSON.stringify(pruefeEinstellungEingabe(frist, "abc")) === JSON.stringify({ fehler: "eingabe" }) && JSON.stringify(pruefeEinstellungEingabe(frist, "1e3")) === JSON.stringify({ fehler: "eingabe" }));
  check("Eingabe: das Dezimalkomma gilt bei einer Dezimalzahl", JSON.stringify(pruefeEinstellungEingabe(kap, "1250,5")) === JSON.stringify({ wert: 1250.5 }));
  check("Rechte im Code: admin und ceo immer, die Fachrolle nur bei ihren Einstellungen", darfEinstellungAendern("admin", frist) && darfEinstellungAendern("ceo", frist) && darfEinstellungAendern("buchhaltung", frist) && !darfEinstellungAendern("betriebsleitung", frist) && !darfEinstellungAendern("kunde", frist) && !darfEinstellungAendern(null, frist));
  check("Rechte im Code: die Betriebsleitung aendert die Fahrzeugkapazitaet, die Buchhaltung nicht", darfEinstellungAendern("betriebsleitung", kap) && !darfEinstellungAendern("buchhaltung", kap));
}

// --- 3. Aendern ueber die Funktion -------------------------------------------------------------------------------------------------------
const setze = (rolle: string, schluessel: string, wert: number | null, grund: string | null = null) =>
  als(rolle, () => db.query(`select public.einstellung_setzen($1, $2::numeric, null, $3);`, [schluessel, wert, grund]));
const wertVon = async (schluessel: string) => num((await db.query<{ w: string | null }>(`select wert::text as w from public.betriebs_einstellungen where schluessel = $1;`, [schluessel])).rows[0].w);
const verlaufVon = async (schluessel: string) => (await db.query<{ alt_wert: string | null; neu_wert: string | null; grund: string | null; geaendert_von: string | null }>(`select alt_wert::text, neu_wert::text, grund, geaendert_von from public.betriebs_einstellungen_verlauf where schluessel = $1 order by geaendert_am, id;`, [schluessel])).rows;

await setze("admin", "esf.frist_tage", 20, "Rueckfrage der Steuerberatung");
check("Aendern: die Administration setzt die ЭСФ-Frist", (await wertVon("esf.frist_tage")) === 20);
{
  const v = await verlaufVon("esf.frist_tage");
  check("Verlauf: alter und neuer Wert, Grund und die handelnde Person stehen im Verlauf", v.length === 1 && num(v[0].alt_wert) === 15 && num(v[0].neu_wert) === 20 && v[0].grund === "Rueckfrage der Steuerberatung" && v[0].geaendert_von !== null, JSON.stringify(v));
}
await setze("admin", "esf.frist_tage", 20);
check("Verlauf: derselbe Wert noch einmal erzeugt keinen Eintrag", (await verlaufVon("esf.frist_tage")).length === 1);
await setze("buchhaltung", "esf.frist_tage", 15);
check("Aendern: die Buchhaltung setzt die ЭСФ-Frist (ihr Fachgebiet)", (await wertVon("esf.frist_tage")) === 15);
await setze("ceo", "wirtschaftlichkeit.kalkulationszins_richtwert", 18.5);
check("Aendern: die Geschaeftsfuehrung setzt den Richtwert fuer den Kalkulationszins", (await wertVon("wirtschaftlichkeit.kalkulationszins_richtwert")) === 18.5);
await setze("betriebsleitung", "abholung.fahrzeug_kapazitaet_kg", 1200.5);
check("Aendern: die Betriebsleitung setzt die Fahrzeugkapazitaet", (await wertVon("abholung.fahrzeug_kapazitaet_kg")) === 1200.5);
await setze("betriebsleitung", "abholung.fahrzeug_kapazitaet_kg", null);
check("Aendern: leer heisst nicht gesetzt (null), keine Pruefung", (await wertVon("abholung.fahrzeug_kapazitaet_kg")) === null);
await setze("betriebsleitung", "esutd.frist_beendigung_tage", 4);
check("Aendern: die Betriebsleitung setzt eine ЕСУТД-Frist", (await wertVon("esutd.frist_beendigung_tage")) === 4);

for (const [rolle, schluessel] of [
  ["betriebsleitung", "esf.frist_tage"],
  ["buchhaltung", "abholung.fahrzeug_kapazitaet_kg"],
  ["buchhaltung", "wirtschaftlichkeit.kalkulationszins_richtwert"],
  ["betriebsleitung", "auslieferung.zeitbudget_sekunden"],
  ["brigade", "esf.frist_tage"],
  ["picker", "esf.frist_tage"],
  ["erzeuger", "esf.frist_tage"],
  ["kunde", "esf.frist_tage"],
] as const) {
  await alsScheitert(rolle, `Rechte: ${rolle} darf ${schluessel} nicht aendern`, `select public.einstellung_setzen($1, 5, null, null);`, [schluessel], "42501");
}
await alsScheitert("admin", "Grenzen: ein Wert ueber dem Maximum wird abgelehnt", `select public.einstellung_setzen('esf.frist_tage', 61, null, null);`, [], "23514");
await alsScheitert("admin", "Grenzen: ein Wert unter dem Minimum wird abgelehnt", `select public.einstellung_setzen('esf.frist_tage', 0, null, null);`, [], "23514");
await alsScheitert("admin", "Typ: eine Dezimalzahl bei einer Ganzzahl wird abgelehnt", `select public.einstellung_setzen('esf.frist_tage', 7.5, null, null);`, [], "23514");
await alsScheitert("admin", "Typ: ein Text bei einer Zahl wird abgelehnt", `select public.einstellung_setzen('esf.frist_tage', null, 'viel', null);`, [], "23514");
await alsScheitert("admin", "Unbekannt: eine Einstellung, die es nicht gibt, wird abgelehnt", `select public.einstellung_setzen('gibt.es_nicht', 1, null, null);`, [], "23503");
await alsScheitert("admin", "Grund: ein zu kurzer Grund wird abgelehnt", `select public.einstellung_setzen('esf.frist_tage', 21, null, 'x');`, [], "23514");
check("Grenzen: nach den Ablehnungen hat sich nichts geaendert", (await wertVon("esf.frist_tage")) === 15);

// Direkt in die Tabelle schreiben geht fuer niemanden, auch nicht fuer die Administration: nur die Funktion setzt Werte.
for (const rolle of ["admin", "ceo", "buchhaltung"]) {
  await alsScheitert(rolle, `Direkt: ${rolle} schreibt nicht direkt in die Tabelle`, `update public.betriebs_einstellungen set wert = 1 where schluessel = 'esf.frist_tage';`, [], "42501");
}
await alsScheitert("admin", "Direkt: auch Anlegen und Loeschen gehen nicht", `delete from public.betriebs_einstellungen where schluessel = 'esf.frist_tage';`, [], "42501");

// --- 4. Verlauf unveraenderlich, Lesen ---------------------------------------------------------------------------------------------------
await mussScheitern("Verlauf: ein Eintrag laesst sich nicht aendern (DA018)", `update public.betriebs_einstellungen_verlauf set grund = 'x';`, [], "DA018");
await mussScheitern("Verlauf: ein Eintrag laesst sich nicht loeschen (DA018)", `delete from public.betriebs_einstellungen_verlauf;`, [], "DA018");
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows: v } = await db.query(`select id from public.betriebs_einstellungen_verlauf;`);
    check(`Lesen: ${rolle} liest den Verlauf`, v.length > 0);
  });
}
for (const rolle of ["brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const { rows: v } = await db.query(`select id from public.betriebs_einstellungen_verlauf;`);
    check(`Lesen: ${rolle} liest den Verlauf nicht`, v.length === 0);
  });
}
for (const rolle of ["admin", "brigade", "picker", "erzeuger", "kunde", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows: w } = await db.query<{ z: string | null }>(`select public.einstellung_zahl('esf.frist_tage')::text as z;`);
    const { rows: s } = await db.query(`select schluessel from public.betriebs_einstellungen;`);
    check(`Lesen: ${rolle} liest die Werte der Einstellungen (keine Geheimnisse)`, w[0].z === "15" && s.length === einstellungen.length);
  });
}
await t.alsRolle("anon");
await mussScheitern("Lesen: anon liest keine Einstellung", `select * from public.betriebs_einstellungen;`, [], "42501");
await t.alsRolle("anon");
await mussScheitern("Lesen: anon ruft die Funktion nicht auf", `select public.einstellung_zahl('esf.frist_tage');`, [], "42501");
await t.alsAdmin();

t.ende("Alle Tests der Einstellungen gruen.");
