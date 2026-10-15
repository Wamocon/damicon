// Abholrunden bei Nachbarbetrieben (WMCNL-1577), Datenbankseite (Migration 20261207100000): Ablauf geplant, unterwegs,
// abgeschlossen, Regeln der Stopps, Bewertung der 60-Minuten-Regel, Unveraenderlichkeit nach dem Abschluss und Rechte je Rolle.
// PGlite, kein Docker noetig.
//
// Aufruf: npm run test:abholrunden-db

import { starte } from "./hilfen/pglite-rollen.mjs";
import { bewerteAbholung } from "@/lib/domain/abholrunden";

const t = await starte();
const { db, check, als, mussScheitern } = t;

// mussScheitern() setzt die Rolle danach zurueck: mehrere Pruefungen hintereinander im selben als()-Block liefen ab der zweiten
// als Superuser. Deshalb bekommt jede Pruefung ihren eigenen Rollenwechsel.
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

const nachbar = async (name: string): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(`insert into public.nachbarbetriebe (name, ort) values ($1, 'Talgar') returning id;`, [name]);
  return rows[0].id;
};
const A = await nachbar("Nachbar A");
const B = await nachbar("Nachbar B");
const C = await nachbar("Nachbar C");
await nachbar("Nachbar ohne Stopp");

async function runde(rolle = "betriebsleitung", stopps: string[] = [A, B]): Promise<{ runde: string; stopps: string[] }> {
  return als(rolle, async () => {
    const { rows } = await db.query<{ id: string }>(`insert into public.abholrunden (datum, fahrzeug) values (current_date, 'Kuehlwagen 1') returning id;`);
    const ids: string[] = [];
    for (const [i, betrieb] of stopps.entries()) {
      const { rows: s } = await db.query<{ id: string }>(`insert into public.abholstopps (runde_id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg) values ($1, $2, $3, 100) returning id;`, [rows[0].id, betrieb, i]);
      ids.push(s[0].id);
    }
    return { runde: rows[0].id, stopps: ids };
  });
}
const status = (id: string) => db.query<{ status: string }>(`select status::text from public.abholrunden where id = $1;`, [id]).then((r) => r.rows[0]?.status);

// --- 1. Planen ---------------------------------------------------------------------------------------------------------------
const plan = await runde();
check("Planen: das Buero legt eine Runde mit zwei Stopps an, Status geplant", (await status(plan.runde)) === "geplant" && plan.stopps.length === 2);
await alsScheitert("betriebsleitung", "Planen: derselbe Nachbarbetrieb nicht zweimal in einer Runde", `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg) values ($1, $2, 50);`, [plan.runde, A], "23505");
await alsScheitert("betriebsleitung", "Planen: die erwartete Menge ist groesser als null", `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg) values ($1, $2, 0);`, [plan.runde, C], "23514");
await alsScheitert("betriebsleitung", "Planen: das Fahrzeug nicht leer", `insert into public.abholrunden (datum, fahrzeug) values (current_date, '  ');`, [], "23514");
await mussScheitern("Planen: ein Nachbarbetrieb mit Stopp laesst sich nicht loeschen", `delete from public.nachbarbetriebe where id = $1;`, [A], "23001");

// --- 2. Ablauf der Runde -------------------------------------------------------------------------------------------------------
await alsScheitert("brigade", "Ablauf: eine Abholung vor dem Start wird abgelehnt (DA016)", `update public.abholstopps set status = 'abgeholt', menge_ist_kg = 90 where id = $1;`, [plan.stopps[0]], "DA016");
await alsScheitert("brigade", "Ablauf: eine geplante Runde schliesst nicht direkt ab (DA015)", `update public.abholrunden set status = 'abgeschlossen' where id = $1;`, [plan.runde], "DA015");
{
  const leer = await runde("betriebsleitung", []);
  await alsScheitert("brigade", "Ablauf: eine Runde ohne Stopp kann nicht beginnen", `update public.abholrunden set status = 'unterwegs' where id = $1;`, [leer.runde], "23514");
}
await als("brigade", async () => {
  await db.query(`update public.abholrunden set status = 'unterwegs' where id = $1;`, [plan.runde]);
  const { rows } = await db.query<{ gestartet_am: string | null }>(`select gestartet_am from public.abholrunden where id = $1;`, [plan.runde]);
  check("Ablauf: die Brigade startet die Runde, der Server setzt die Startzeit", (await status(plan.runde)) === "unterwegs" && rows[0].gestartet_am !== null);
});
const andere = await runde();
await alsScheitert("brigade", "Ablauf: Datum und Fahrzeug einer laufenden Runde bleiben (DA015)", `update public.abholrunden set fahrzeug = 'anderes' where id = $1;`, [plan.runde], "DA015");
await alsScheitert("brigade", "Ablauf: abgeholt braucht die tatsaechliche Menge", `update public.abholstopps set status = 'abgeholt' where id = $1;`, [plan.stopps[0]], "23514");
await alsScheitert("brigade", "Ablauf: der Pflueckbeginn liegt vor der Abholung", `update public.abholstopps set status = 'abgeholt', menge_ist_kg = 90, pflueckbeginn = now() + interval '30 minutes' where id = $1;`, [plan.stopps[0]], "23514");
await alsScheitert("brigade", "Ablauf: ein Pflueckbeginn vor mehr als 24 Stunden ist kein plausibler Wert", `update public.abholstopps set status = 'abgeholt', menge_ist_kg = 90, pflueckbeginn = now() - interval '25 hours' where id = $1;`, [plan.stopps[0]], "23514");
await alsScheitert("brigade", "Ablauf: ein Stopp wechselt die Runde nicht", `update public.abholstopps set runde_id = $2 where id = $1;`, [plan.stopps[0], andere.runde], "23514");
await alsScheitert("admin", "Ablauf: laufende Runden nehmen keine neuen Stopps an (DA015)", `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg) values ($1, $2, 10);`, [plan.runde, C], "DA015");
await alsScheitert("brigade", "Ablauf: mit offenem Stopp schliesst die Runde nicht ab (DA016)", `update public.abholrunden set status = 'abgeschlossen' where id = $1;`, [plan.runde], "DA016");
await als("brigade", async () => {
  await db.query(`update public.abholstopps set status = 'abgeholt', menge_ist_kg = 92.5, pflueckbeginn = now() - interval '50 minutes' where id = $1;`, [plan.stopps[0]]);
  const { rows } = await db.query<{ abgeholt_am: string | null }>(`select abgeholt_am from public.abholstopps where id = $1;`, [plan.stopps[0]]);
  check("Ablauf: die Abholung traegt die Serverzeit, wenn keine Geraetezeit mitkommt", rows[0].abgeholt_am !== null && Math.abs(Date.now() - Date.parse(rows[0].abgeholt_am)) < 60_000);
  await db.query(`update public.abholstopps set status = 'entfallen', menge_ist_kg = 50, pflueckbeginn = now() where id = $1;`, [plan.stopps[1]]);
  const { rows: e } = await db.query<{ menge_ist_kg: string | null; pflueckbeginn: string | null; abgeholt_am: string | null }>(`select menge_ist_kg, pflueckbeginn, abgeholt_am from public.abholstopps where id = $1;`, [plan.stopps[1]]);
  check("Ablauf: ein entfallener Stopp traegt keine Menge und keinen Pflueckbeginn", e[0].menge_ist_kg === null && e[0].pflueckbeginn === null && e[0].abgeholt_am === null);
});
await alsScheitert("brigade", "Ablauf: ein erledigter Stopp aendert sich nicht mehr (DA015)", `update public.abholstopps set status = 'abgeholt', menge_ist_kg = 1 where id = $1;`, [plan.stopps[1]], "DA015");
await alsScheitert("brigade", "Ablauf: die Ankunft in der Zukunft wird abgelehnt (DA001)", `update public.abholrunden set status = 'abgeschlossen', ankunft_geraet_zeitpunkt = now() + interval '30 minutes' where id = $1;`, [plan.runde], "DA001");
await als("brigade", async () => {
  await db.query(`update public.abholrunden set status = 'abgeschlossen' where id = $1;`, [plan.runde]);
  const { rows: r } = await db.query<{ kuehlhaus_an: string | null }>(`select kuehlhaus_an from public.abholrunden where id = $1;`, [plan.runde]);
  check("Ablauf: die Ankunft im Kuehlhaus setzt der Server", (await status(plan.runde)) === "abgeschlossen" && r[0].kuehlhaus_an !== null);
  const { rows: v } = await db.query<{ stopp_id: string; minuten_bis_kuehlung: number | null; ergebnis: string | null }>(`select stopp_id, minuten_bis_kuehlung, ergebnis::text from public.v_abholstopps_kuehlkette where runde_id = $1;`, [plan.runde]);
  const abgeholt = v.find((z) => z.stopp_id === plan.stopps[0]);
  const entfallen = v.find((z) => z.stopp_id === plan.stopps[1]);
  check("Bewertung: 50 Minuten nach dem Pflueckbeginn ergeben eine Warnung", abgeholt?.minuten_bis_kuehlung !== null && abgeholt?.minuten_bis_kuehlung !== undefined && abgeholt.minuten_bis_kuehlung >= 50 && abgeholt.minuten_bis_kuehlung <= 51 && abgeholt.ergebnis === "warnung", JSON.stringify(abgeholt));
  check("Bewertung: ein entfallener Stopp wird nicht bewertet", entfallen?.ergebnis === null && entfallen?.minuten_bis_kuehlung === null);
});

// --- 3. Nach dem Abschluss ---------------------------------------------------------------------------------------------------
for (const rolle of ["admin", "betriebsleitung", "brigade"]) {
  await alsScheitert(rolle, `Abschluss: ${rolle} aendert die Runde nicht mehr (DA015)`, `update public.abholrunden set notiz = 'spaeter' where id = $1;`, [plan.runde], "DA015");
  await alsScheitert(rolle, `Abschluss: ${rolle} aendert keinen Stopp mehr (DA015)`, `update public.abholstopps set bemerkung = 'spaeter' where id = $1;`, [plan.stopps[0]], "DA015");
}
await alsScheitert("admin", "Abschluss: eine abgeschlossene Runde laesst sich nicht loeschen (DA015)", `delete from public.abholrunden where id = $1;`, [plan.runde], "DA015");
await alsScheitert("admin", "Abschluss: ein Stopp einer abgeschlossenen Runde laesst sich nicht loeschen (DA015)", `delete from public.abholstopps where id = $1;`, [plan.stopps[0]], "DA015");

// --- 4. Eine geplante Runde laesst sich verwerfen --------------------------------------------------------------------------------
{
  const weg = await runde();
  await als("betriebsleitung", async () => {
    const { rows } = await db.query(`delete from public.abholrunden where id = $1 returning id;`, [weg.runde]);
    const { rows: rest } = await db.query(`select id from public.abholstopps where runde_id = $1;`, [weg.runde]);
    check("Verwerfen: eine geplante Runde laesst sich loeschen, ihre Stopps gehen mit", rows.length === 1 && rest.length === 0);
  });
}

// --- 5. Grenzen der 60-Minuten-Regel: Sicht gegen Domain ------------------------------------------------------------------------
{
  const g = await runde("betriebsleitung", [A, B, C]);
  // Als Superuser an den Regeln vorbei auf genaue Zeitpunkte setzen: der Test misst die Formel, nicht den Ablauf.
  await db.exec("alter table public.abholrunden disable trigger user; alter table public.abholstopps disable trigger user;");
  await db.query(`update public.abholrunden set status = 'abgeschlossen', gestartet_am = '2026-10-14 08:00+00', kuehlhaus_an = '2026-10-14 10:00+00' where id = $1;`, [g.runde]);
  const faelle: { minuten: number | null; status: string }[] = [
    { minuten: 0, status: "abgeholt" },
    { minuten: 45, status: "abgeholt" },
    { minuten: 46, status: "abgeholt" },
    { minuten: 60, status: "abgeholt" },
  ];
  await db.query(`delete from public.abholstopps where id = $1;`, [g.stopps[2]]);
  // Mehrere Stopps je Runde brauchen verschiedene Nachbarbetriebe: dafuer frische anlegen.
  const ids: string[] = [g.stopps[0], g.stopps[1]];
  for (let i = 2; i < faelle.length; i++) {
    const { rows } = await db.query<{ id: string }>(`insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg) values ($1, $2, 10) returning id;`, [g.runde, await nachbar(`Grenze ${i}`)]);
    ids.push(rows[0].id);
  }
  for (const [i, f] of faelle.entries()) {
    await db.query(`update public.abholstopps set status = 'abgeholt', menge_ist_kg = 10, abgeholt_am = '2026-10-14 09:30+00', pflueckbeginn = '2026-10-14 10:00+00'::timestamptz - ($2 || ' minutes')::interval where id = $1;`, [ids[i], String(f.minuten)]);
  }
  const { rows } = await db.query<{ stopp_id: string; minuten_bis_kuehlung: number | null; ergebnis: string | null }>(`select stopp_id, minuten_bis_kuehlung, ergebnis::text from public.v_abholstopps_kuehlkette where runde_id = $1;`, [g.runde]);
  const nach = (id: string) => rows.find((r) => r.stopp_id === id);
  for (const [i, f] of faelle.entries()) {
    const soll = bewerteAbholung(f.minuten);
    check(`Bewertung: ${f.minuten} Minuten ergeben ${soll}, in der Datenbank wie in der Domain`, nach(ids[i])?.ergebnis === soll && nach(ids[i])?.minuten_bis_kuehlung === f.minuten, JSON.stringify(nach(ids[i])));
  }
  // 61 Minuten und ohne Angabe
  await db.query(`insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg, status, menge_ist_kg, abgeholt_am, pflueckbeginn) values ($1, $2, 10, 'abgeholt', 10, '2026-10-14 09:30+00', '2026-10-14 08:59+00');`, [g.runde, await nachbar("Grenze 61")]);
  const { rows: r61 } = await db.query<{ minuten_bis_kuehlung: number; ergebnis: string }>(`select minuten_bis_kuehlung, ergebnis::text from public.v_abholstopps_kuehlkette where runde_id = $1 and minuten_bis_kuehlung = 61;`, [g.runde]);
  check("Bewertung: 61 Minuten sind ein Verstoss", r61.length === 1 && r61[0].ergebnis === "verstoss" && bewerteAbholung(61) === "verstoss");
  const ohne = await nachbar("Ohne Pflueckbeginn");
  await db.query(`insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg, status, menge_ist_kg, abgeholt_am) values ($1, $2, 10, 'abgeholt', 10, '2026-10-14 09:30+00');`, [g.runde, ohne]);
  const { rows: ro } = await db.query<{ minuten_bis_kuehlung: number | null; ergebnis: string }>(`select minuten_bis_kuehlung, ergebnis::text from public.v_abholstopps_kuehlkette where runde_id = $1 and stopp_id in (select id from public.abholstopps where nachbarbetrieb_id = $2);`, [g.runde, ohne]);
  check("Bewertung: ohne bekannten Pflueckbeginn eine Warnung statt ok", ro.length === 1 && ro[0].minuten_bis_kuehlung === null && ro[0].ergebnis === "warnung" && bewerteAbholung(null) === "warnung");
  // Eine Runde, die noch laeuft, wird nicht bewertet.
  await db.query(`update public.abholrunden set status = 'unterwegs' where id = $1;`, [g.runde]);
  const { rows: lauf } = await db.query(`select 1 from public.v_abholstopps_kuehlkette where runde_id = $1 and ergebnis is not null;`, [g.runde]);
  check("Bewertung: eine laufende Runde wird noch nicht bewertet", lauf.length === 0);
  await db.exec("alter table public.abholrunden enable trigger user; alter table public.abholstopps enable trigger user;");
}

// --- 6. Rechte ----------------------------------------------------------------------------------------------------------------------
const offen = await runde("admin", [A]);
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.abholrunden where id = $1;`, [offen.runde]);
    check(`Rechte: ${rolle} liest die Runden`, rows.length === 1);
    const { rows: neu } = await db.query(`insert into public.abholrunden (datum) values (current_date + 1) returning id;`);
    check(`Rechte: ${rolle} plant eine Runde`, neu.length === 1);
  });
}
await als("brigade", async () => {
  const { rows } = await db.query(`select id from public.abholrunden where id = $1;`, [offen.runde]);
  check("Rechte: die Brigade liest die Runde", rows.length === 1);
  // Prüfung PR #156 (15.10.2026, P1): Die Tabelle nachbarbetriebe enthält identifikationsnummer (ИИН/БИН) und identitaets_digest. Die Brigade liest
  // sie nicht mehr, sondern nur die schmale Funktion mit den Betrieben ihrer Stopps.
  const { rows: tabelle } = await db.query(`select id from public.nachbarbetriebe;`);
  check("Rechte: die Brigade liest die Tabelle der Nachbarbetriebe nicht (keine Stammdaten wie ИИН/БИН)", tabelle.length === 0, `Zeilen: ${tabelle.length}`);
  const { rows: nb } = await db.query<Record<string, unknown>>(`select * from public.abholrunde_nachbarbetriebe() order by name;`);
  const namen = nb.map((n) => String(n.name));
  check("Rechte: die Brigade liest über die Funktion die Nachbarbetriebe, die in einem Stopp stehen, und keinen anderen", namen.includes("Nachbar A") && !namen.includes("Nachbar ohne Stopp"), namen.join(","));
  check("Rechte: die Funktion liefert nur Name, Ort, Anschrift, Kontakt und Koordinaten", Object.keys(nb[0] ?? {}).sort().join() === "adresse,breitengrad,id,kontakt,laengengrad,name,ort", Object.keys(nb[0] ?? {}).join());
});
await als("betriebsleitung", async () => {
  const { rows } = await db.query<{ name: string }>(`select name from public.abholrunde_nachbarbetriebe();`);
  check("Rechte: das Büro sieht über die Funktion alle Nachbarbetriebe, auch ohne Stopp", rows.some((r) => r.name === "Nachbar ohne Stopp") && rows.length >= 4, `Zeilen: ${rows.length}`);
});
for (const rolle of ["kunde", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select * from public.abholrunde_nachbarbetriebe();`);
    check(`Rechte: ${rolle} bekommt aus der Funktion der Nachbarbetriebe nichts`, rows.length === 0);
  });
}
await t.alsRolle("anon");
await mussScheitern("Rechte: anon darf die Funktion der Nachbarbetriebe nicht aufrufen", `select * from public.abholrunde_nachbarbetriebe();`, [], "42501");
await alsScheitert("brigade", "Rechte: die Brigade plant keine Runde", `insert into public.abholrunden (datum) values (current_date);`, []);
await alsScheitert("brigade", "Rechte: die Brigade legt keinen Stopp an", `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg) values ($1, $2, 5);`, [offen.runde, B]);
await als("brigade", async () => {
  const { rows: geloescht } = await db.query(`delete from public.abholrunden where id = $1 returning id;`, [offen.runde]);
  check("Rechte: die Brigade loescht keine Runde (die Zeile bleibt fuer das Loeschen unsichtbar)", geloescht.length === 0);
});
for (const rolle of ["kunde", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.abholrunden;`);
    const { rows: s } = await db.query(`select id from public.abholstopps;`);
    const { rows: v } = await db.query(`select stopp_id from public.v_abholstopps_kuehlkette;`);
    check(`Rechte: ${rolle} sieht keine Runde, keinen Stopp, keine Bewertung`, rows.length === 0 && s.length === 0 && v.length === 0);
  });
  await alsScheitert(rolle, `Rechte: ${rolle} plant keine Runde`, `insert into public.abholrunden (datum) values (current_date);`, []);
}

// --- 7. Stopp-Regeln (Prüfung PR #156, 15.10.2026) --------------------------------------------------------------------------------------
{
  const r = await runde("betriebsleitung", [A]);
  await alsScheitert("betriebsleitung", "Stopp: ein neuer Stopp beginnt geplant, nicht schon als abgeholt (an der Geräteprüfung vorbei)",
    `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg, status, abgeholt_am, pflueckbeginn) values ($1, $2, 10, 'abgeholt', now(), now() - interval '2 hours');`, [r.runde, B], "DA015");
  await alsScheitert("betriebsleitung", "Stopp: ein neuer Stopp trägt keine Abholmenge", `insert into public.abholstopps (runde_id, nachbarbetrieb_id, menge_geplant_kg, menge_ist_kg) values ($1, $2, 10, 5);`, [r.runde, B], "DA015");
  await als("betriebsleitung", async () => {
    await db.query(`update public.abholrunden set status = 'unterwegs', gestartet_am = now() where id = $1;`, [r.runde]);
  });
  await als("brigade", async () => {
    await db.query(`update public.abholstopps set status = 'abgeholt', menge_ist_kg = 90, pflueckbeginn = now() - interval '30 minutes' where id = $1;`, [r.stopps[0]]);
  });
  await alsScheitert("brigade", "Stopp: der Pflückbeginn eines abgeholten Stopps ändert sich nicht mehr (aus Verstoß würde ok)", `update public.abholstopps set pflueckbeginn = now() - interval '5 minutes' where id = $1;`, [r.stopps[0]], "DA015");
  await alsScheitert("brigade", "Stopp: die Abholzeit eines abgeholten Stopps ändert sich nicht mehr", `update public.abholstopps set abgeholt_am = now() - interval '3 hours' where id = $1;`, [r.stopps[0]], "DA015");
  await als("brigade", async () => {
    const { rows } = await db.query(`update public.abholstopps set menge_ist_kg = 95, bemerkung = 'Nachgewogen' where id = $1 returning id;`, [r.stopps[0]]);
    check("Stopp: Menge und Bemerkung bleiben bis zum Abschluss korrigierbar", rows.length === 1);
  });
}

t.ende("Alle Datenbank-Tests der Abholrunden gruen.");
