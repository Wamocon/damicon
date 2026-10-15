// Block-Risiko-Bewertung (WMCNL-1470): public.v_block_risiko und public.risiko_parameter.
// Jeder Faktor bekommt einen Block mit genau diesem Mangel, damit der erwartete Punktwert
// von Hand nachzurechnen ist: Punktwert = 100 * Summe(Gewicht * Anteil) / Summe(Gewichte),
// die Gewichte sind 35, 30, 20, 10 und 5 (Summe 100).
//
// Aufruf: npm run test:blockrisiko (PGlite, kein Docker noetig).

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, alsRolle, mussScheitern } = t;

const { rows: gruppen } = await db.query<{ id: string }>(`select id from public.reihengruppen order by name limit 1;`);
const { rows: mittel } = await db.query<{ id: string }>(`select id from public.psm_mittel order by name limit 1;`);
let zaehler = 0;

/** Legt einen Reihenblock an und liefert seine Id. */
async function neuerBlock(status = "erntereif"): Promise<string> {
  zaehler += 1;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.reihenbloecke (reihengruppe_id, code, status) values ($1, $2, $3::public.reihenblock_status) returning id;`,
    [gruppen[0].id, `RK-RISIKO-${zaehler}`, status],
  );
  return rows[0].id;
}

async function aufgabe(block: string, faelligkeitSql: string, status = "offen") {
  zaehler += 1;
  await db.query(
    `insert into public.pflueckaufgaben (code, reihenblock_id, status, faelligkeit)
     values ($1, $2, $3::public.pflueckaufgabe_status, ${faelligkeitSql});`,
    [`PA-RISIKO-${zaehler}`, block, status],
  );
}

interface Risiko {
  risiko_score: number;
  risiko_stufe: string;
  hauptgrund: string | null;
  sperre_konflikt: boolean;
  beitrag_ueberfaellig: string;
  beitrag_sperre: string;
  beitrag_ausschuss: string;
  beitrag_kuehlkette: string;
  beitrag_erfassung: string;
}
// Seit dem 15.10.2026 liefert die Sicht nur den Rollen etwas, die alle Eingaben sehen (Administration, Betriebsleitung, Brigade): die Abfrage laeuft als Betriebsleitung.
async function risiko(block: string): Promise<Risiko> {
  return als("betriebsleitung", async () => {
    const { rows } = await db.query<Risiko>(`select * from public.v_block_risiko where reihenblock_id = $1;`, [block]);
    return rows[0];
  });
}
const beitrag = (r: Risiko, faktor: keyof Risiko) => Number(r[faktor]);

// --- 1. Kein Mangel ---------------------------------------------------------------------------
{
  const r = await risiko(await neuerBlock());
  check("Ohne Mangel: Punktwert 0, niedrig, kein Hauptgrund", r.risiko_score === 0 && r.risiko_stufe === "niedrig" && r.hauptgrund === null, JSON.stringify(r));
}

// --- 2. Verzug -----------------------------------------------------------------------------------
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '72 hours'");
  const r = await risiko(b);
  check("Verzug: 72 Stunden (ein ganzes Intervall) ist der volle Faktor, 35 Punkte, mittel", r.risiko_score === 35 && r.risiko_stufe === "mittel" && r.hauptgrund === "ueberfaellig", JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '36 hours'");
  const r = await risiko(b);
  check("Verzug: 36 Stunden ist der halbe Faktor (17,5 Punkte, gerundet 18), niedrig", r.risiko_score === 18 && r.risiko_stufe === "niedrig" && beitrag(r, "beitrag_ueberfaellig") === 17.5, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '10 days'");
  const r = await risiko(b);
  check("Verzug: laenger als ein Intervall zaehlt nicht mehr als voll (35)", r.risiko_score === 35, `Punkte: ${r.risiko_score}`);
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() + interval '1 day'");
  const r = await risiko(b);
  check("Verzug: eine noch nicht faellige Aufgabe ist kein Mangel", r.risiko_score === 0, `Punkte: ${r.risiko_score}`);
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '5 days'", "abgeschlossen");
  const r = await risiko(b);
  check("Verzug: eine abgeschlossene Aufgabe zaehlt nicht", r.beitrag_ueberfaellig === "0.0" || beitrag(r, "beitrag_ueberfaellig") === 0, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await db.query(`insert into public.rotationsplan_eintraege (reihenblock_id, geplant_fuer, status) values ($1, public.heute_almaty() - 3, 'geplant');`, [b]);
  const r = await risiko(b);
  check("Verzug: ein seit 3 Tagen offener Rotationstermin ist ebenfalls der volle Faktor", beitrag(r, "beitrag_ueberfaellig") === 35, JSON.stringify(r));
}

// --- 3. Sperre -------------------------------------------------------------------------------------------
async function behandlung(block: string, wartezeit: number) {
  await db.query(
    `insert into public.pflanzenschutz_behandlungen (reihenblock_id, psm_mittel_id, behandelt_am, wartezeit_tage)
     values ($1, $2, public.heute_almaty(), $3);`,
    [block, mittel[0].id, wartezeit],
  );
}
{
  // Auf einem gesperrten Block laesst sich keine Aufgabe mehr anlegen (DA005): der Konflikt
  // entsteht, wenn die Behandlung NACH der Planung erfasst wird.
  const b = await neuerBlock();
  await aufgabe(b, "now() + interval '1 day'");
  await behandlung(b, 5);
  const r = await risiko(b);
  check("Sperre: offene Aufgabe vor dem Ende der Sperre ist ein Konflikt, immer hoch", r.sperre_konflikt && r.risiko_stufe === "hoch" && r.hauptgrund === "sperre_konflikt" && beitrag(r, "beitrag_sperre") === 30, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await behandlung(b, 5);
  const r = await risiko(b);
  // Rest 5 Tage, Intervall 3: zwei entfallende Durchgaenge, von drei der volle Faktor: 2/3 * 30 = 20.
  check("Sperre ohne Konflikt: zwei entfallende Durchgaenge sind zwei Drittel (20 Punkte), niedrig", !r.sperre_konflikt && r.risiko_score === 20 && r.risiko_stufe === "niedrig" && r.hauptgrund === "sperre", JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await behandlung(b, 1);
  const r = await risiko(b);
  check("Sperre ohne Konflikt: ein entfallender Durchgang ist ein Drittel (10 Punkte)", r.risiko_score === 10, `Punkte: ${r.risiko_score}`);
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() + interval '9 days'");
  await behandlung(b, 5);
  const r = await risiko(b);
  check("Sperre: eine Aufgabe erst NACH dem Ende der Sperre ist kein Konflikt", !r.sperre_konflikt, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await behandlung(b, 5);
  await db.query(`insert into public.rotationsplan_eintraege (reihenblock_id, geplant_fuer, status) values ($1, public.heute_almaty() - 3, 'geplant');`, [b]);
  const r = await risiko(b);
  check("Sperre: ein Rotationstermin waehrend der Sperre gilt nicht als versaeumt (WMCNL-2300)", beitrag(r, "beitrag_ueberfaellig") === 0, JSON.stringify(r));
}

// --- 4. Ausschuss ------------------------------------------------------------------------------------------
async function charge(block: string, menge: number, ausschuss: number) {
  zaehler += 1;
  await db.query(
    `insert into public.chargen (code, reihenblock_id, menge_kg, ausschuss_kg) values ($1, $2, $3, $4);`,
    [`CH-RISIKO-${zaehler}`, block, menge, ausschuss],
  );
}
{
  const b = await neuerBlock();
  await charge(b, 88, 12);
  const r = await risiko(b);
  check("Ausschuss: 12 Prozent (doppeltes Ziel) ist der volle Faktor, 20 Punkte", beitrag(r, "beitrag_ausschuss") === 20 && r.hauptgrund === "ausschuss", JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await charge(b, 91, 9);
  const r = await risiko(b);
  check("Ausschuss: 9 Prozent liegt in der Mitte zwischen 6 und 12, 10 Punkte", beitrag(r, "beitrag_ausschuss") === 10, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await charge(b, 95, 5);
  const r = await risiko(b);
  check("Ausschuss: unter dem Ziel von 6 Prozent ist kein Mangel", beitrag(r, "beitrag_ausschuss") === 0, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await db.query(`insert into public.chargen (code, reihenblock_id, menge_kg, ausschuss_kg, ernte_datum) values ('CH-ALT-1', $1, 50, 50, public.heute_almaty() - 20);`, [b]);
  const r = await risiko(b);
  check("Ausschuss: eine Charge ausserhalb der Betrachtungswoche zaehlt nicht", beitrag(r, "beitrag_ausschuss") === 0, JSON.stringify(r));
}

// --- 5. Kuehlkette --------------------------------------------------------------------------------------------------
{
  const b = await neuerBlock();
  zaehler += 1;
  const { rows } = await db.query<{ id: string }>(
    `insert into public.chargen (code, reihenblock_id, pflueck_zeitpunkt) values ($1, $2, now() - interval '3 hours') returning id;`,
    [`CH-KUEHL-${zaehler}`, b],
  );
  for (let i = 0; i < 3; i++) {
    // Ueber 8 Grad ist immer ein Verstoss (kuehlkette_bewerten), unabhaengig von der Zeit.
    await db.query(`insert into public.kuehlketten_messungen (charge_id, temperatur_c) values ($1, 11.0);`, [rows[0].id]);
  }
  const r = await risiko(b);
  check("Kuehlkette: drei Verstoesse in der Woche sind der volle Faktor, 10 Punkte", beitrag(r, "beitrag_kuehlkette") === 10 && r.hauptgrund === "kuehlkette", JSON.stringify(r));
}

// --- 6. Erfassungsluecke -------------------------------------------------------------------------------------------------
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '10 days'", "abgeschlossen");
  const r = await risiko(b);
  check("Erfassung: in Arbeit, aber seit 10 Tagen nichts und nichts offen, 5 Punkte", beitrag(r, "beitrag_erfassung") === 5 && r.hauptgrund === "erfassung", JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '1 day'", "abgeschlossen");
  const r = await risiko(b);
  check("Erfassung: gestern gearbeitet ist keine Luecke", beitrag(r, "beitrag_erfassung") === 0, JSON.stringify(r));
}
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '90 days'", "abgeschlossen");
  const r = await risiko(b);
  check("Erfassung: ein seit Monaten ruhender Block ist keine Luecke (Pause, nicht Mangel)", beitrag(r, "beitrag_erfassung") === 0, JSON.stringify(r));
}

// --- 7. Zusammenspiel -------------------------------------------------------------------------------------------------------------
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '72 hours'");
  await charge(b, 88, 12);
  const r = await risiko(b);
  check("Zusammenspiel: Verzug und Ausschuss voll ergeben 55 Punkte und damit hoch", r.risiko_score === 55 && r.risiko_stufe === "hoch" && r.hauptgrund === "ueberfaellig" && !r.sperre_konflikt, JSON.stringify(r));
}
{
  await als("betriebsleitung", async () => {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.v_block_risiko;`);
    const { rows: bloecke } = await db.query<{ n: number }>(`select count(*)::int as n from public.reihenbloecke;`);
    check("Die Sicht liefert genau eine Zeile je Reihenblock", rows[0].n === bloecke[0].n, `${rows[0].n} von ${bloecke[0].n}`);
    const { rows: bereich } = await db.query<{ n: number }>(`select count(*)::int as n from public.v_block_risiko where risiko_score not between 0 and 100;`);
    check("Der Punktwert liegt immer zwischen 0 und 100", bereich[0].n === 0);
  });
}

// --- 8. Parameter ----------------------------------------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ schluessel: string }>(`select schluessel from public.risiko_parameter;`);
  check("Parameter: alle 14 Schluessel sind angelegt und haben eine Begruendung", rows.length === 14, `Zeilen: ${rows.length}`);
  const { rows: ohne } = await db.query<{ n: number }>(`select count(*)::int as n from public.risiko_parameter where length(btrim(begruendung)) < 20;`);
  check("Parameter: jede Begruendung ist mehr als ein Stichwort", ohne[0].n === 0);
  const { rows: summe } = await db.query<{ s: string }>(`select sum(wert)::text as s from public.risiko_parameter where schluessel like 'gewicht_%';`);
  check("Parameter: die Gewichte ergeben 100", Number(summe[0].s) === 100, summe[0].s);
}
await mussScheitern("Parameter: negative Werte werden abgelehnt", `update public.risiko_parameter set wert = -1 where schluessel = 'schwelle_hoch';`, [], "23514");
for (const rolle of ["betriebsleitung", "buchhaltung", "brigade", "kunde"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`update public.risiko_parameter set wert = 1 where schluessel = 'gewicht_ausschuss' returning schluessel;`);
    check(`Parameter: ${rolle} kann ein Gewicht nicht aendern`, rows.length === 0, `Zeilen: ${rows.length}`);
  });
}
await als("admin", async () => {
  const { rows } = await db.query(`update public.risiko_parameter set wert = 70 where schluessel = 'gewicht_ueberfaellig' returning schluessel;`);
  check("Parameter: admin kann ein Gewicht aendern", rows.length === 1);
});
{
  // Verzug voll mit Gewicht 70 statt 35: 100 * 70 / (70+30+20+10+5) = 51,85.
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '72 hours'");
  const r = await risiko(b);
  check("Parameter: ein hoeheres Gewicht verschiebt den Punktwert und die Stufe (52, hoch)", r.risiko_score === 52 && r.risiko_stufe === "hoch", JSON.stringify(r));
}
await als("ceo", async () => {
  const { rows } = await db.query(`update public.risiko_parameter set wert = 35 where schluessel = 'gewicht_ueberfaellig' returning schluessel;`);
  check("Parameter: ceo darf zuruecksetzen", rows.length === 1);
});
{
  const b = await neuerBlock();
  await aufgabe(b, "now() - interval '72 hours'");
  const r = await risiko(b);
  check("Parameter: nach dem Zuruecksetzen gilt wieder der Ausgangswert (35)", r.risiko_score === 35, `Punkte: ${r.risiko_score}`);
}
await alsRolle("anon");
await mussScheitern("Rechte: anon darf die Sicht nicht lesen", `select * from public.v_block_risiko;`, [], "42501");
await alsRolle("anon"); // mussScheitern setzt die Rolle danach zurueck
await mussScheitern("Rechte: anon darf die Parameter nicht lesen", `select * from public.risiko_parameter;`, [], "42501");

t.ende("Alle Block-Risiko-Tests gruen.");
