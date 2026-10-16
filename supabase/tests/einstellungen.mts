// Fachliche Einstellungen (Migration 20261208030000, Entscheidung vom 15.10.2026): die Liste im Code (src/lib/einstellungen.ts) gegen die
// Startwerte der Datenbank, das Aendern nur ueber die Funktion mit Rolle, Typ und Grenzen, der unveraenderliche Verlauf, die Eingabepruefung.
// PGlite, kein Docker noetig.
//
// Aufruf: npm run test:einstellungen

import { starte } from "./hilfen/pglite-rollen.mjs";
import { bereiche, darfEinstellungAendern, einstellungDef, einstellungen, einstellungTextSchluessel, pruefeEinstellungEingabe } from "@/lib/einstellungen";
import { readFileSync } from "node:fs";
import {
  darfRisikoParameterAendern,
  RISIKO_GRENZEN,
  RISIKO_PARAMETER,
  RISIKO_PARAMETER_GRUPPEN,
  pruefeRisikoEingabe,
  type RisikoParameterSchluessel,
} from "@/lib/domain/block-risiko";

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

// --- 5. Risiko-Gewichte pflegen (Migration 20261208100000) -------------------------------------------------------------------------------
{
  const setzen = (schluessel: string, wert: number | null, grund: string | null = null) =>
    db.query(`select public.risiko_parameter_setzen($1, $2, $3);`, [schluessel, wert, grund]);
  const wertVon = async (schluessel: string) => Number((await db.query<{ w: string }>(`select wert::text as w from public.risiko_parameter where schluessel = $1;`, [schluessel])).rows[0].w);
  const verlauf = async (schluessel: string) =>
    (await db.query<{ alt: string | null; neu: string | null; grund: string | null; von: string | null }>(
      `select alt_wert::text as alt, neu_wert::text as neu, grund, geaendert_von::text as von from public.betriebs_einstellungen_verlauf where schluessel = $1 order by geaendert_am, id;`,
      ['risiko.' + schluessel],
    )).rows;

  // Liste im Code gegen die Datenbank
  const { rows: param } = await db.query<{ schluessel: string; wert: string; standard_wert: string | null }>(`select schluessel, wert::text, standard_wert::text from public.risiko_parameter;`);
  check("Risiko: jeder Parameter der Datenbank steht im Code und umgekehrt", param.length === RISIKO_PARAMETER.length && RISIKO_PARAMETER.every((s) => param.some((p) => p.schluessel === s)));
  check("Risiko: jeder Parameter hat einen Standardwert, und er ist der Startwert", param.every((p) => p.standard_wert !== null && Number(p.standard_wert) === Number(p.wert)), JSON.stringify(param.filter((p) => p.standard_wert === null)));
  const gruppiert = RISIKO_PARAMETER_GRUPPEN.flatMap((g) => [...g.schluessel]);
  check("Risiko: die Gruppen der Oberfläche decken jeden Parameter genau einmal ab", gruppiert.length === RISIKO_PARAMETER.length && new Set(gruppiert).size === RISIKO_PARAMETER.length && RISIKO_PARAMETER.every((s) => gruppiert.includes(s)));
  for (const s of RISIKO_PARAMETER) {
    const { rows: g } = await db.query<{ min_wert: string; max_wert: string; ganzzahl: boolean }>(`select min_wert::text, max_wert::text, ganzzahl from public.risiko_parameter_grenzen($1);`, [s]);
    const c = RISIKO_GRENZEN[s];
    check(`Risiko: ${s} hat in Code und Datenbank dieselben Grenzen`, g.length === 1 && Number(g[0].min_wert) === c.min && Number(g[0].max_wert) === c.max && g[0].ganzzahl === c.ganzzahl, JSON.stringify(g));
  }
  {
    const sprachen = ["de", "en", "ru", "kk"].map((l) => ({ l, m: JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")) }));
    for (const { l, m } of sprachen) {
      const r = m.einstellungen?.risiko;
      const fehlt = RISIKO_PARAMETER.filter((s) => !r?.eintrag?.[s]?.label || !r?.eintrag?.[s]?.beschreibung || !r?.eintrag?.[s]?.einheit);
      const gruppen = RISIKO_PARAMETER_GRUPPEN.filter((g) => !r?.gruppe?.[g.name]);
      const fehler = ["risikoSchwellen", "risikoAusschuss", "risikoGewichte"].filter((k) => !m.aktionen?.fehler?.[k]);
      check(`Risiko-Texte (${l}): Titel, Gruppen, Fehler und jeder Parameter mit Beschriftung, Beschreibung und Einheit`, !!r?.titel && !!r?.lead && !!r?.nurLesen && !!r?.bereich && fehlt.length === 0 && gruppen.length === 0 && fehler.length === 0, [...fehlt, ...fehler].join(","));
    }
  }

  // Rolle
  for (const rolle of ["admin", "ceo"]) {
    await als(rolle, async () => {
      await setzen("gewicht_ausschuss", 25, `Abstimmung mit dem Betreiber (${rolle})`);
      check(`Risiko: ${rolle} ändert ein Gewicht`, (await wertVon("gewicht_ausschuss")) === 25);
    });
    const v = await verlauf("gewicht_ausschuss");
    const letzter = v[v.length - 1];
    check(`Risiko: der Verlauf hält alt, neu, Grund und Person fest (${rolle})`, letzter.alt === "20" && letzter.neu === "25" && letzter.grund === `Abstimmung mit dem Betreiber (${rolle})` && letzter.von !== null, JSON.stringify(letzter));
    await als(rolle, async () => {
      await setzen("gewicht_ausschuss", 20, null);
    });
  }
  for (const rolle of ["betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) {
    await alsScheitert(rolle, `Risiko: ${rolle} darf kein Gewicht ändern (42501)`, `select public.risiko_parameter_setzen('gewicht_ausschuss', 25, null);`, [], "42501");
  }
  check("Risiko: nach den Versuchen steht das Gewicht auf dem Startwert", (await wertVon("gewicht_ausschuss")) === 20);

  await als("admin", async () => {
    const vorher = (await verlauf("gewicht_sperre")).length;
    await setzen("gewicht_sperre", 30, null);
    check("Risiko: derselbe Wert erzeugt keinen Verlaufseintrag", (await verlauf("gewicht_sperre")).length === vorher);
    await db.query(`update public.risiko_parameter set wert = 31 where schluessel = 'gewicht_sperre';`);
    const v = await verlauf("gewicht_sperre");
    check("Risiko: auch ein direkter Update schreibt den Verlauf (ohne Grund)", v.length === vorher + 1 && v[v.length - 1].neu === "31" && v[v.length - 1].grund === null, JSON.stringify(v));
    await setzen("gewicht_sperre", 30, "Zurück auf den Startwert");
    const nach = await verlauf("gewicht_sperre");
    check("Risiko: der Grund eines früheren Aufrufs hängt nicht an späteren Änderungen", nach[nach.length - 1].grund === "Zurück auf den Startwert" && nach[nach.length - 2].grund === null);
  });
  await alsScheitert("admin", "Risiko: ein Grund unter drei Zeichen wird abgelehnt (23514)", `select public.risiko_parameter_setzen('gewicht_ausschuss', 21, 'ab');`, [], "23514");
  await alsScheitert("admin", "Risiko: ein leerer Wert wird abgelehnt (23514)", `select public.risiko_parameter_setzen('gewicht_ausschuss', null, null);`, [], "23514");
  await alsScheitert("admin", "Risiko: ein unbekannter Parameter wird abgelehnt (23503)", `select public.risiko_parameter_setzen('gibt_es_nicht', 1, null);`, [], "23503");

  // Grenzen je Parameter, in der Datenbank wie im Code
  const { rows: stand } = await db.query<{ schluessel: string; wert: string }>(`select schluessel, wert::text from public.risiko_parameter;`);
  const aktuell = stand.map((p) => ({ schluessel: p.schluessel, wert: Number(p.wert) }));
  for (const s of RISIKO_PARAMETER) {
    const g = RISIKO_GRENZEN[s as RisikoParameterSchluessel];
    await alsScheitert("admin", `Risiko: ${s} über dem Höchstwert (${g.max}) wird abgelehnt`, `select public.risiko_parameter_setzen($1, $2, null);`, [s, g.max + 1], "23514");
    await alsScheitert("admin", `Risiko: ${s} unter dem Mindestwert (${g.min}) wird abgelehnt`, `select public.risiko_parameter_setzen($1, $2, null);`, [s, g.min - 1], "23514");
    if (g.ganzzahl) await alsScheitert("admin", `Risiko: ${s} muss ganzzahlig sein`, `select public.risiko_parameter_setzen($1, $2, null);`, [s, g.min + 0.5], "23514");
    const hoch = pruefeRisikoEingabe(s as RisikoParameterSchluessel, String(g.max + 1), aktuell);
    const tief = pruefeRisikoEingabe(s as RisikoParameterSchluessel, String(g.min - 1), aktuell);
    check(`Risiko: ${s}: dieselben Grenzen in der Eingabeprüfung der Anwendung`, "fehler" in hoch && "fehler" in tief, JSON.stringify([hoch, tief]));
  }
  // Reihenfolge der Schwellen, Gewichte nicht alle null
  await alsScheitert("admin", "Risiko: die Schwelle hoch unter mittel wird abgelehnt (23514)", `select public.risiko_parameter_setzen('schwelle_hoch', 20, null);`, [], "23514");
  await alsScheitert("admin", "Risiko: der kritische Ausschuss auf dem Zielwert wird abgelehnt (23514)", `select public.risiko_parameter_setzen('ausschuss_kritisch_prozent', 6, null);`, [], "23514");
  await als("admin", async () => {
    for (const s of ["gewicht_ueberfaellig", "gewicht_sperre", "gewicht_ausschuss", "gewicht_kuehlkette"]) await setzen(s, 0, null);
    check("Risiko: vier Gewichte auf null sind in Ordnung, solange eines über null bleibt", (await wertVon("gewicht_erfassung")) === 5);
  });
  await alsScheitert("admin", "Risiko: alle Gewichte auf null werden abgelehnt (23514, die Sicht teilt durch die Summe)", `select public.risiko_parameter_setzen('gewicht_erfassung', 0, null);`, [], "23514");
  await als("admin", async () => {
    for (const [s, w] of [["gewicht_ueberfaellig", 35], ["gewicht_sperre", 30], ["gewicht_ausschuss", 20], ["gewicht_kuehlkette", 10]] as const) await setzen(s, w, "Zurück auf die Startwerte");
    const { rows: summe } = await db.query<{ s: string }>(`select sum(wert)::text as s from public.risiko_parameter where schluessel like 'gewicht\_%';`);
    check("Risiko: die Startwerte sind wiederhergestellt (Summe 100)", Number(summe[0].s) === 100, summe[0].s);
  });

  // Eingabeprüfung der Anwendung
  const ist = RISIKO_PARAMETER.map((s) => ({ schluessel: s as string, wert: Number(stand.find((p) => p.schluessel === s)?.wert ?? 0) }));
  const eingabe = (s: RisikoParameterSchluessel, roh: string) => JSON.stringify(pruefeRisikoEingabe(s, roh, ist));
  check("Risiko-Eingabe: Komma wird verziehen, ein Wert im Bereich angenommen", eingabe("gewicht_ausschuss", "22,5") === JSON.stringify({ wert: 22.5 }));
  check("Risiko-Eingabe: leer, Text, negativ und Exponent werden abgelehnt", ["", " ", "abc", "-1", "1e3"].every((r) => eingabe("gewicht_ausschuss", r) === JSON.stringify({ fehler: "eingabe" })));
  check("Risiko-Eingabe: eine Dezimalzahl bei einem Tageswert gibt \"ganzzahl\"", eingabe("betrachtung_tage", "7,5") === JSON.stringify({ fehler: "einstellungGanzzahl" }));
  check("Risiko-Eingabe: außerhalb des Bereichs gibt \"grenzen\"", eingabe("betrachtung_tage", "91") === JSON.stringify({ fehler: "einstellungGrenzen" }) && eingabe("betrachtung_tage", "0") === JSON.stringify({ fehler: "einstellungGrenzen" }));
  check("Risiko-Eingabe: Schwellen und Ausschuss in falscher Reihenfolge", eingabe("schwelle_hoch", "25") === JSON.stringify({ fehler: "risikoSchwellen" }) && eingabe("schwelle_mittel", "50") === JSON.stringify({ fehler: "risikoSchwellen" }) && eingabe("ausschuss_kritisch_prozent", "6") === JSON.stringify({ fehler: "risikoAusschuss" }) && eingabe("ausschuss_ziel_prozent", "12") === JSON.stringify({ fehler: "risikoAusschuss" }));
  {
    const nurEins = ist.map((p) => (p.schluessel === "gewicht_erfassung" ? p : p.schluessel.startsWith("gewicht_") ? { ...p, wert: 0 } : p));
    check("Risiko-Eingabe: das letzte Gewicht über null lässt sich nicht auf null setzen", JSON.stringify(pruefeRisikoEingabe("gewicht_erfassung", "0", nurEins)) === JSON.stringify({ fehler: "risikoGewichte" }));
  }
  check("Risiko-Eingabe: nur Administration und Geschäftsführung dürfen ändern", ["admin", "ceo"].every((r) => darfRisikoParameterAendern(r)) && ["betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde", null, undefined, ""].every((r) => !darfRisikoParameterAendern(r)));
}

t.ende("Alle Tests der Einstellungen gruen.");
