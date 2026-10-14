// Temperaturlogger (WMCNL-1517, Stufe 1), Datenbankseite: Herkunft der Messwerte (Migration
// 20261207050000) und das Zusammenspiel mit transport_kuehlkette_bewerten(): Zeitfenster,
// Bewertung, Sperre nach Zustellung und Storno, Rechte. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:logger-import-db

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, mussScheitern } = t;

async function lieferung(status: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, 100) returning id;`,
    [t.kundeId],
  );
  if (status !== "geplant") {
    await db.exec("alter table public.lieferungen disable trigger user;");
    await db.query(`update public.lieferungen set status = $2::public.lieferung_status where id = $1;`, [rows[0].id, status]);
    await db.exec("alter table public.lieferungen enable trigger user;");
  }
  return rows[0].id;
}
const geplant = await lieferung("geplant");
const stand = (stunden: number) => new Date(Date.now() - stunden * 3_600_000).toISOString();

const einfuegen = (lieferungId: string, geraet: string, temperatur: number, quelle = "logger", kennung: string | null = "TL-4711") =>
  db.query<{ id: string; gemessen_am: string; ergebnis: string; quelle: string }>(
    `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle, logger_kennung)
     values ($1, $2, $3, $4, $5) returning id, gemessen_am, ergebnis, quelle;`,
    [lieferungId, temperatur, geraet, quelle, kennung],
  );

// --- 1. Herkunft ----------------------------------------------------------------------------------------
{
  await als("brigade", async () => {
    await db.query(`insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c) values ($1, 3.0);`, [geplant]);
  });
  const { rows } = await db.query<{ quelle: string; logger_kennung: string | null }>(
    `select quelle, logger_kennung from public.transport_temperatur_messungen where lieferung_id = $1;`,
    [geplant],
  );
  check("Eine Handmessung ohne Angabe hat die Herkunft manuell", rows.length === 1 && rows[0].quelle === "manuell" && rows[0].logger_kennung === null, JSON.stringify(rows));
}
await mussScheitern("Herkunft: nur manuell oder logger", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, quelle) values ($1, 3, 'sensor');`, [geplant], "23514");
await mussScheitern("Kennung: hoechstens 60 Zeichen", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, quelle, logger_kennung) values ($1, 3, 'logger', repeat('x', 61));`, [geplant], "23514");
await mussScheitern("Kennung: nicht leer", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, quelle, logger_kennung) values ($1, 3, 'logger', '');`, [geplant], "23514");

// --- 2. Logger-Werte im Zeitfenster -------------------------------------------------------------------------
for (const rolle of ["brigade", "betriebsleitung", "admin"]) {
  await als(rolle, async () => {
    const zeit = stand(2);
    const { rows } = await einfuegen(geplant, zeit, 3.5);
    check(`${rolle}: Logger-Wert 2 Stunden alt wird uebernommen, Messzeit = Geraetezeit`, rows.length === 1 && rows[0].quelle === "logger" && Math.abs(Date.parse(rows[0].gemessen_am) - Date.parse(zeit)) < 1000, JSON.stringify(rows[0]));
  });
}
await als("admin", async () => {
  const bewertung = [[3.5, "ok"], [4.0, "ok"], [4.1, "warnung"], [8.0, "warnung"], [8.1, "verstoss"]] as const;
  for (const [temperatur, erwartet] of bewertung) {
    const { rows } = await einfuegen(geplant, stand(1), temperatur);
    check(`Bewertung ${temperatur} Grad ist ${erwartet}`, rows[0].ergebnis === erwartet, rows[0].ergebnis);
  }
});
await als("admin", async () => {
  await mussScheitern("Zeitfenster: ein Wert aelter als 24 Stunden wird abgelehnt (DA001)", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle) values ($1, 3, $2, 'logger');`, [geplant, stand(25)], "DA001");
});
await als("admin", async () => {
  await mussScheitern("Zeitfenster: ein Wert in der Zukunft wird abgelehnt (DA001)", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle) values ($1, 3, $2, 'logger');`, [geplant, new Date(Date.now() + 30 * 60_000).toISOString()], "DA001");
});
await als("admin", async () => {
  await mussScheitern("Der Server setzt den Messzeitpunkt: ein mitgeschickter gemessen_am wird abgelehnt", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, gemessen_am, quelle) values ($1, 3, $2, 'logger');`, [geplant, stand(1)]);
});

// --- 3. Viele Werte auf einmal ---------------------------------------------------------------------------------
await als("admin", async () => {
  const { rows } = await db.query<{ n: number }>(
    `with eingefuegt as (
       insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle, logger_kennung)
       select $1, 3 + (n % 10) / 10.0, now() - (n || ' minutes')::interval, 'logger', 'TL-Masse' from generate_series(1, 500) n
       returning 1)
     select count(*)::int as n from eingefuegt;`,
    [geplant],
  );
  check("Ein Paket von 500 Werten geht in einem Insert durch", rows[0].n === 500, `Zeilen: ${rows[0].n}`);
});

// --- 4. Sperren ------------------------------------------------------------------------------------------------------
{
  const zugestellt = await lieferung("zugestellt");
  await als("admin", async () => {
    await mussScheitern("Eine zugestellte Lieferung nimmt keine Logger-Werte mehr an (DA004)", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle) values ($1, 3, $2, 'logger');`, [zugestellt, stand(1)], "DA004");
  });
  const storniert = await lieferung("storniert");
  await als("admin", async () => {
    await mussScheitern("Eine stornierte Lieferung nimmt keine Logger-Werte an (DA002)", `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle) values ($1, 3, $2, 'logger');`, [storniert, stand(1)], "DA002");
  });
}

// --- 5. Rechte -----------------------------------------------------------------------------------------------------------
for (const rolle of ["kunde", "buchhaltung", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf keine Logger-Werte schreiben`, `insert into public.transport_temperatur_messungen (lieferung_id, temperatur_c, geraet_zeitpunkt, quelle) values ($1, 3, $2, 'logger');`, [geplant, stand(1)]);
  });
}
await als("kunde", async () => {
  const { rows } = await db.query<{ quelle: string }>(`select distinct quelle from public.transport_temperatur_messungen where lieferung_id = $1;`, [geplant]);
  check("Der Kunde sieht die Messwerte seiner Lieferung samt Herkunft", rows.length === 2, rows.map((r) => r.quelle).join(","));
});

t.ende("Alle Logger-Datenbank-Tests gruen.");
