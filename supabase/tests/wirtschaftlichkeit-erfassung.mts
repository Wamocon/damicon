// Wirtschaftlichkeit erfassen (WMCNL-2470), Datenbankseite (Migration 20261207090000): Startwerte der Annahmen,
// Constraints der Posten und Ist-Werte, Rechte je Rolle, unveraenderliche Staende, Sicht der vermarkteten Menge.
// PGlite, kein Docker noetig.
//
// Aufruf: npm run test:wirtschaftlichkeit-db

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, mussScheitern } = t;

// mussScheitern() setzt die Rolle danach zurueck: mehrere Pruefungen hintereinander im selben als()-Block liefen ab der zweiten
// als Superuser. Deshalb bekommt jede Pruefung ihren eigenen Rollenwechsel.
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

const posten = (art: string, kategorie: string, betrag: number) =>
  db.query<{ id: string }>(
    `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ($1, $2, 'Testposten', $3) returning id;`,
    [art, kategorie, betrag],
  );

// --- 1. Startwerte der Annahmen ---------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ n: number; zins: string; kurs: string; rub: string; stichtag: string; vollkosten: string; von: number; bis: number; herkunft: Record<string, string> }>(
    `select count(*)::int as n, max(kalkulationszins)::text as zins, max(kurs_eur_tenge)::text as kurs, max(kurs_rub_tenge)::text as rub,
            max(kurs_stichtag)::text as stichtag, max(vollkosten_vorher_tenge)::text as vollkosten,
            max(nutzenbeginn_wochen_von) as von, max(nutzenbeginn_wochen_bis) as bis, (array_agg(herkunft))[1] as herkunft
       from public.wirtschaftlichkeit_annahmen;`,
  );
  const r = rows[0];
  check("Annahmen: genau eine Zeile", r.n === 1);
  check("Annahmen: Startwerte sind die bisherigen Konstanten (Zins 12 Prozent, Kurse vom 23.09.2026, Vollkosten 1500, Nutzenbeginn 6 bis 8 Wochen)", Number(r.zins) === 0.12 && Number(r.kurs) === 513.46 && Number(r.rub) === 5.31 && r.stichtag === "2026-09-23" && Number(r.vollkosten) === 1500 && r.von === 6 && r.bis === 8, JSON.stringify(r));
  check("Annahmen: der Kurs ist belegt, Zins, Vollkosten und Menge sind geschaetzt", r.herkunft.kurs === "belegt" && r.herkunft.kalkulationszins === "geschaetzt" && r.herkunft.vollkosten === "geschaetzt" && r.herkunft.menge === "geschaetzt");
}
await mussScheitern("Annahmen: eine zweite Zeile gibt es nicht", `insert into public.wirtschaftlichkeit_annahmen (id, kalkulationszins, kurs_eur_tenge, kurs_rub_tenge, kurs_stichtag) values (2, 0.1, 500, 5, current_date);`, [], "23514");

// --- 2. Constraints der Annahmen -----------------------------------------------------------------------------------------
await mussScheitern("Annahmen: Zins hoechstens 100 Prozent", `update public.wirtschaftlichkeit_annahmen set kalkulationszins = 1.5;`, [], "23514");
await mussScheitern("Annahmen: Zins nicht negativ", `update public.wirtschaftlichkeit_annahmen set kalkulationszins = -0.1;`, [], "23514");
await mussScheitern("Annahmen: Kurs groesser als null", `update public.wirtschaftlichkeit_annahmen set kurs_eur_tenge = 0;`, [], "23514");
await mussScheitern("Annahmen: Nutzenbeginn von nicht nach bis", `update public.wirtschaftlichkeit_annahmen set nutzenbeginn_wochen_von = 9;`, [], "23514");
await mussScheitern("Annahmen: Menge groesser als null", `update public.wirtschaftlichkeit_annahmen set vermarktete_menge_kg = 0;`, [], "23514");

// --- 3. Constraints der Posten ----------------------------------------------------------------------------------------------
{
  const { rows } = await posten("investition", "Entwicklung", 154000);
  check("Posten: ein gueltiger Investitionsposten geht durch, Standard ist EUR und belegt", rows.length === 1);
  const { rows: s } = await db.query<{ waehrung: string; herkunft: string; datum: string }>(`select waehrung, herkunft, datum::text from public.wirtschaftlichkeit_posten where id = $1;`, [rows[0].id]);
  check("Posten: Waehrung EUR, Herkunft belegt, Datum gesetzt", s[0].waehrung === "EUR" && s[0].herkunft === "belegt" && !!s[0].datum);
}
await mussScheitern("Posten: Art nur investition, betrieb oder nutzen", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('sonst', 'x', 'y', 1);`, [], "23514");
await mussScheitern("Posten: Betrag nicht negativ", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('betrieb', 'Hosting', 'y', -1);`, [], "23514");
await mussScheitern("Posten: Waehrung nur EUR, KZT oder RUB", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag, waehrung) values ('betrieb', 'Hosting', 'y', 1, 'USD');`, [], "23514");
await mussScheitern("Posten: Herkunft nur belegt oder geschaetzt", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag, herkunft) values ('betrieb', 'Hosting', 'y', 1, 'vermutet');`, [], "23514");
await mussScheitern("Posten: Bezeichnung nicht leer", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('betrieb', 'Hosting', '  ', 1);`, [], "23514");
await mussScheitern("Posten: Bezeichnung hoechstens 120 Zeichen", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('betrieb', 'Hosting', repeat('x', 121), 1);`, [], "23514");
await mussScheitern("Posten: Nutzen kennt nur vier Kategorien", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('nutzen', 'Ideen', 'y', 1);`, [], "23514");
{
  for (const kategorie of ["schwund", "handarbeit", "audit", "sonstiges"]) {
    const { rows } = await posten("nutzen", kategorie, 1000);
    check(`Posten: Nutzen in der Kategorie ${kategorie} ist erlaubt`, rows.length === 1);
  }
}

// --- 4. Ist-Werte --------------------------------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ id: string }>(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values ('2026-11-01', 'schwund', 1200) returning id;`);
  check("Ist: ein Wert zum Monatsersten geht durch", rows.length === 1);
}
await mussScheitern("Ist: derselbe Monat, dieselbe Kategorie und dieselbe Waehrung noch einmal wird abgelehnt (23505)", `insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values ('2026-11-01', 'schwund', 5);`, [], "23505");
await mussScheitern("Ist: der Monat muss der Erste sein", `insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values ('2026-11-15', 'schwund', 1);`, [], "23514");
await mussScheitern("Ist: Kategorie wie beim Nutzen", `insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values ('2026-11-01', 'andere', 1);`, [], "23514");
await mussScheitern("Ist: Betrag nicht negativ", `insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values ('2026-11-01', 'schwund', -1);`, [], "23514");

// --- 5. Rechte -------------------------------------------------------------------------------------------------------------------
for (const [index, rolle] of ["admin", "buchhaltung"].entries()) {
  await als(rolle, async () => {
    const { rows } = await posten("betrieb", "Hosting", 25000);
    check(`${rolle}: darf einen Posten anlegen`, rows.length === 1);
    await db.query(`update public.wirtschaftlichkeit_posten set betrag = 26000 where id = $1;`, [rows[0].id]);
    const { rows: s } = await db.query<{ betrag: string }>(`select betrag::text from public.wirtschaftlichkeit_posten where id = $1;`, [rows[0].id]);
    check(`${rolle}: darf einen Posten aendern`, Number(s[0].betrag) === 26000);
    const { rows: weg } = await db.query(`delete from public.wirtschaftlichkeit_posten where id = $1 returning id;`, [rows[0].id]);
    check(`${rolle}: darf einen Posten entfernen`, weg.length === 1);
    // Ein Wert je Monat, Kategorie und Waehrung (Migration 20261208050000): jede Rolle nimmt einen eigenen Monat.
    const { rows: ist } = await db.query(`insert into public.wirtschaftlichkeit_ist (monat, kategorie, betrag) values (date '2026-12-01' + make_interval(months => $1::int), 'audit', 500) returning id;`, [index]);
    check(`${rolle}: darf einen Ist-Wert erfassen`, ist.length === 1);
    const { rows: a } = await db.query(`update public.wirtschaftlichkeit_annahmen set kalkulationszins = 0.11 returning id;`);
    check(`${rolle}: darf die Annahmen aendern`, a.length === 1);
  });
}
await als("ceo", async () => {
  // Der CEO ist in den Policies ueber admin eingeschlossen (has_role behandelt ceo wie admin).
  const { rows } = await posten("betrieb", "Lizenzen", 1000);
  check("ceo: darf schreiben (wie admin)", rows.length === 1);
});
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.wirtschaftlichkeit_posten;`);
    const { rows: a } = await db.query(`select id from public.wirtschaftlichkeit_annahmen;`);
    check(`${rolle}: darf lesen`, rows.length > 0 && a.length === 1);
  });
}
await als("betriebsleitung", async () => {
  await mussScheitern("betriebsleitung: darf nicht schreiben (nur sehen)", `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('betrieb', 'x', 'y', 1);`, []);
});
for (const rolle of ["brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.wirtschaftlichkeit_posten;`);
    const { rows: a } = await db.query(`select id from public.wirtschaftlichkeit_annahmen;`);
    const { rows: i } = await db.query(`select id from public.wirtschaftlichkeit_ist;`);
    const { rows: s } = await db.query(`select id from public.wirtschaftlichkeit_staende;`);
    check(`${rolle}: sieht nichts`, rows.length === 0 && a.length === 0 && i.length === 0 && s.length === 0);
    await mussScheitern(`${rolle}: darf keinen Posten schreiben`, `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag) values ('betrieb', 'x', 'y', 1);`, []);
  });
}

// --- 6. Staende sind unveraenderlich ------------------------------------------------------------------------------------------
let standId = "";
await als("buchhaltung", async () => {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.wirtschaftlichkeit_staende (bezeichnung, snapshot) values ('Stand Januar', '{"version":1}'::jsonb) returning id;`,
  );
  standId = rows[0].id;
  check("Stand: die Buchhaltung darf einen Stand festhalten", rows.length === 1);
});
for (const rolle of ["admin", "buchhaltung"]) {
  await alsScheitert(rolle, `Stand: ${rolle} darf ihn nicht aendern`, `update public.wirtschaftlichkeit_staende set bezeichnung = 'anders' where id = $1;`, [standId]);
  await alsScheitert(rolle, `Stand: ${rolle} darf ihn nicht loeschen`, `delete from public.wirtschaftlichkeit_staende where id = $1;`, [standId]);
}
// Auch ohne Rechte-Huerde (als Superuser) bleibt der Trigger.
await mussScheitern("Stand: auch der Superuser kann ihn nicht aendern (Trigger)", `update public.wirtschaftlichkeit_staende set bezeichnung = 'anders' where id = $1;`, [standId]);
await mussScheitern("Stand: auch der Superuser kann ihn nicht loeschen (Trigger)", `delete from public.wirtschaftlichkeit_staende where id = $1;`, [standId]);
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`select id from public.wirtschaftlichkeit_staende;`);
  check("Stand: die Betriebsleitung kann ihn lesen", rows.length === 1);
  await mussScheitern("Stand: die Betriebsleitung darf keinen festhalten", `insert into public.wirtschaftlichkeit_staende (bezeichnung, snapshot) values ('x', '{}'::jsonb);`, []);
});
await mussScheitern("Stand: Bezeichnung nicht leer", `insert into public.wirtschaftlichkeit_staende (bezeichnung, snapshot) values (' ', '{}'::jsonb);`, [], "23514");

// --- 7. Sicht der vermarkteten Menge ---------------------------------------------------------------------------------------------
{
  const { rows: leer } = await db.query<{ menge: string; belastbar: boolean; tage: number }>(`select menge_kg_12_monate::text as menge, belastbar, tage_abdeckung as tage from public.v_vermarktete_menge;`);
  check("Menge: ohne zugestellte Lieferung ist die Menge null und nicht belastbar", leer.length === 1 && Number(leer[0].menge) === 0 && leer[0].belastbar === false && leer[0].tage === 0, JSON.stringify(leer));

  async function zugestellt(menge: number, tageHer: number) {
    const { rows } = await db.query<{ id: string }>(`insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, $2) returning id;`, [t.kundeId, menge]);
    await db.exec("alter table public.lieferungen disable trigger user;");
    await db.query(`update public.lieferungen set status = 'zugestellt'::public.lieferung_status, geliefert_am = now() - ($2 || ' days')::interval where id = $1;`, [rows[0].id, String(tageHer)]);
    await db.exec("alter table public.lieferungen enable trigger user;");
  }
  await zugestellt(1000, 10);
  await zugestellt(500, 100);
  const { rows: saison } = await db.query<{ menge: string; belastbar: boolean; tage: number }>(`select menge_kg_12_monate::text as menge, belastbar, tage_abdeckung as tage from public.v_vermarktete_menge;`);
  check("Menge: eine Saison summiert, ist aber nicht belastbar", Number(saison[0].menge) === 1500 && saison[0].belastbar === false && saison[0].tage >= 99 && saison[0].tage <= 101, JSON.stringify(saison));

  await zugestellt(2000, 400);
  const { rows: jahr } = await db.query<{ menge: string; belastbar: boolean }>(`select menge_kg_12_monate::text as menge, belastbar from public.v_vermarktete_menge;`);
  check("Menge: mit einer Lieferung ueber ein Jahr zurueck ist sie belastbar, die alte Lieferung zaehlt nicht mit", Number(jahr[0].menge) === 1500 && jahr[0].belastbar === true, JSON.stringify(jahr));

  for (const rolle of ["admin", "buchhaltung", "betriebsleitung"]) {
    await als(rolle, async () => {
      const { rows } = await db.query<{ menge: string }>(`select menge_kg_12_monate::text as menge from public.v_vermarktete_menge;`);
      check(`Menge: ${rolle} sieht die Summe`, rows.length === 1 && Number(rows[0].menge) === 1500, JSON.stringify(rows));
    });
  }
  await als("kunde", async () => {
    const { rows } = await db.query<{ menge: string }>(`select menge_kg_12_monate::text as menge from public.v_vermarktete_menge;`);
    check("Menge: der Kunde sieht hoechstens seine eigenen Lieferungen, nie die Gesamtmenge", rows.length === 1 && Number(rows[0].menge) <= 1500);
  });
  await als("picker", async () => {
    const { rows } = await db.query<{ menge: string }>(`select menge_kg_12_monate::text as menge from public.v_vermarktete_menge;`);
    check("Menge: der Pflueck- und Sortierbetrieb sieht keine Lieferungen, also keine Menge", rows.length === 1 && Number(rows[0].menge) === 0, JSON.stringify(rows));
  });
}

// --- Schwund-Herleitung (Migration 20261208140000) ----------------------------------------------------------------------------------------------
{
  const { rows: bloecke } = await db.query<{ id: string }>(`select id from public.reihenbloecke limit 1;`);
  const block = bloecke[0].id;
  await db.query(`delete from public.chargen where code like 'SCHW-%';`);
  const leer = await db.query(`select * from public.schwund_herleitung();`);
  const vorher = (await db.query<{ n: number }>(`select count(*)::int as n from public.chargen where menge_kg + ausschuss_kg > 0 and ernte_datum <= public.heute_almaty() and ernte_datum > public.heute_almaty() - 365;`)).rows[0].n;
  check("Schwund-Herleitung: ohne passende Chargen gibt es keine Zeile", (vorher === 0) === (leer.rows.length === 0));
  // Zwei Chargen im Fenster (90 kg + 10 kg Ausschuss, 190 kg + 10 kg), eine zu alt (ausserhalb der 365 Tage), eine ohne Menge.
  await db.query(
    `insert into public.chargen (code, reihenblock_id, menge_kg, ausschuss_kg, ernte_datum) values
       ('SCHW-1', $1, 90, 10, public.heute_almaty() - 10),
       ('SCHW-2', $1, 190, 10, public.heute_almaty() - 20),
       ('SCHW-ALT', $1, 10, 90, public.heute_almaty() - 400),
       ('SCHW-LEER', $1, 0, 0, public.heute_almaty() - 5);`,
    [block],
  );
  const { rows } = await db.query<{ verlust_prozent: string; gesamt_kg: string; chargen: number }>(`select verlust_prozent::text, gesamt_kg::text, chargen from public.schwund_herleitung();`);
  const grundlage = (await db.query<{ ausschuss: string; gesamt: string; n: number }>(
    `select sum(ausschuss_kg)::text as ausschuss, sum(menge_kg + ausschuss_kg)::text as gesamt, count(*)::int as n from public.chargen where menge_kg + ausschuss_kg > 0 and ernte_datum <= public.heute_almaty() and ernte_datum > public.heute_almaty() - 365;`,
  )).rows[0];
  const soll = Math.round((10000 * Number(grundlage.ausschuss)) / Number(grundlage.gesamt)) / 100;
  check("Schwund-Herleitung: Quote und Menge der Chargen der letzten 365 Tage, ohne zu alte und leere", rows.length === 1 && Number(rows[0].verlust_prozent) === soll && Number(rows[0].gesamt_kg) === Number(grundlage.gesamt) && rows[0].chargen === grundlage.n, JSON.stringify([rows[0], grundlage, soll]));
  check("Schwund-Herleitung: die alte Charge (400 Tage) und die leere zaehlen nicht", rows[0].chargen === grundlage.n && Number(grundlage.gesamt) >= 300);
  for (const rolle of ["admin", "ceo", "buchhaltung"]) {
    await als(rolle, async () => {
      const r = await db.query(`select * from public.schwund_herleitung();`);
      check(`Schwund-Herleitung: ${rolle} bekommt die Betriebszahlen`, r.rows.length === 1);
    });
  }
  await t.alsRolle("anon");
  await mussScheitern("Schwund-Herleitung: anon ruft die Funktion nicht auf (42501)", `select * from public.schwund_herleitung();`, [], "42501");
  await t.alsAdmin();
  const { rows: baseline } = await db.query<{ baseline_wert: string | null }>(`select baseline_wert from public.kpi_baseline where key = 'verlustquote';`);
  check("Schwund-Herleitung: die Baseline nennt die Verlustquote als Prozentangabe (8,4 %)", baseline[0]?.baseline_wert === "8,4 %", JSON.stringify(baseline));
  await db.query(`delete from public.chargen where code like 'SCHW-%';`);
}

t.ende("Alle Datenbank-Tests der Wirtschaftlichkeit gruen.");
