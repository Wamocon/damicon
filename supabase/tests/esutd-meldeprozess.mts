// Meldeprozess fuer das Einheitssystem ЕСУТД (WMCNL-1447, Stufe 1), Datenbankseite (Migration
// 20261207080000): Pflichtangaben beim Erfassen, Aenderung und Beendigung, Fortschreibung von
// pfluecker.esutd, Zeilensicherheit je Rolle und die Sicht v_esutd_meldungen. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:esutd-db

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, mussScheitern } = t;

async function pfluecker(name: string, ausweis: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(`insert into public.pfluecker (name, ausweis) values ($1, $2) returning id;`, [name, ausweis]);
  return rows[0].id;
}
const esutdStatus = async (id: string) => (await db.query<{ esutd: string }>(`select esutd from public.pfluecker where id = $1;`, [id])).rows[0].esutd;

const p1 = await pfluecker("Test Erste", "AW-ESUTD-1");
const p2 = await pfluecker("Test Zweite", "AW-ESUTD-2");
const { rows: dok } = await db.query<{ id: string }>(`insert into public.dokumente (name, kategorie) values ('Meldebeleg', 'esutd_nachweis') returning id;`);
const beleg = dok[0].id;

// --- 1. Abschluss anlegen ----------------------------------------------------------------------------------------------
let v1 = "";
await als("betriebsleitung", async () => {
  const { rows } = await db.query<{ id: string }>(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'V-1', current_date - 10) returning id;`, [p1]);
  v1 = rows[0].id;
  check("betriebsleitung legt einen Abschluss an", rows.length === 1);
});
check("Fortschreibung: ein offener Abschluss macht pfluecker.esutd offen", (await esutdStatus(p1)) === "offen");

// --- 2. Erfassen ---------------------------------------------------------------------------------------------------------
await als("betriebsleitung", async () => {
  await mussScheitern("Erfassen ohne Meldedatum wird abgelehnt", `update public.esutd_vertraege set status = 'erfasst' where id = $1;`, [v1], "23514");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Ein Meldedatum in der Zukunft wird abgelehnt", `update public.esutd_vertraege set status = 'erfasst', erfasst_am = public.heute_almaty() + 2 where id = $1;`, [v1], "23514");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Eine leere Bestaetigung wird abgelehnt", `update public.esutd_vertraege set status = 'erfasst', erfasst_am = public.heute_almaty(), bestaetigung = '  ' where id = $1;`, [v1], "23514");
});
await als("betriebsleitung", async () => {
  const { rows } = await db.query<{ id: string }>(`update public.esutd_vertraege set status = 'erfasst', erfasst_am = public.heute_almaty(), bestaetigung = 'B-2026-77', beleg_dokument_id = $2 where id = $1 returning id;`, [v1, beleg]);
  check("Erfassen mit Datum, Bestaetigung und Beleg", rows.length === 1);
});
check("Fortschreibung: ist alles gemeldet, steht pfluecker.esutd auf erfasst", (await esutdStatus(p1)) === "erfasst");
await als("betriebsleitung", async () => {
  const { rows } = await db.query<{ erfasst_am: string | null; bestaetigung: string | null; beleg_dokument_id: string | null; status: string }>(
    `update public.esutd_vertraege set status = 'offen' where id = $1 returning erfasst_am, bestaetigung, beleg_dokument_id, status;`, [v1]);
  check("Wieder oeffnen leert Meldedatum, Bestaetigung und Beleg", rows[0].status === "offen" && rows[0].erfasst_am === null && rows[0].bestaetigung === null && rows[0].beleg_dokument_id === null, JSON.stringify(rows[0]));
});
check("Fortschreibung: wieder geoeffnet, wieder offen", (await esutdStatus(p1)) === "offen");
await als("betriebsleitung", async () => {
  await db.query(`update public.esutd_vertraege set status = 'erfasst', erfasst_am = public.heute_almaty() where id = $1;`, [v1]);
});

// --- 3. Aenderung und Beendigung -------------------------------------------------------------------------------------------
const ereignis = (art: string, beschreibung: string | null, datumTage = 3) =>
  db.query<{ id: string }>(`insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, $2, public.heute_almaty() + $3::int, $4) returning id;`, [v1, art, datumTage, beschreibung]);

await als("betriebsleitung", async () => {
  await mussScheitern("Eine Aenderung ohne Beschreibung wird abgelehnt", `insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am) values ($1, 'aenderung', current_date);`, [v1], "23514");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Eine Beschreibung unter drei Zeichen wird abgelehnt", `insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'aenderung', current_date, 'ab');`, [v1], "23514");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Eine unbekannte Art wird abgelehnt", `insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'kuendigung', current_date, 'abc');`, [v1], "23514");
});
let e1 = "";
await als("betriebsleitung", async () => {
  const { rows } = await ereignis("aenderung", "Lohn von 5.000 auf 5.500 Tenge je Tag");
  e1 = rows[0].id;
  check("Aenderung mit Beschreibung", rows.length === 1);
  const ende = await ereignis("beendigung", null, 20);
  check("Beendigung ohne Beschreibung ist zulaessig", ende.rows.length === 1);
});
check("Fortschreibung: ein offenes Ereignis macht pfluecker.esutd offen, auch bei erfasstem Abschluss", (await esutdStatus(p1)) === "offen");
await als("betriebsleitung", async () => {
  await mussScheitern("Ein Ereignis ohne Meldedatum erfassen wird abgelehnt", `update public.esutd_ereignisse set status = 'erfasst' where id = $1;`, [e1], "23514");
});
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`update public.esutd_ereignisse set status = 'erfasst', erfasst_am = public.heute_almaty(), bestaetigung = 'B-9' where id = $1 returning id;`, [e1]);
  check("Ereignis erfassen", rows.length === 1);
});
check("Fortschreibung: ein Ereignis ist noch offen, also bleibt es offen", (await esutdStatus(p1)) === "offen");
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`delete from public.esutd_ereignisse where vertrag_id = $1 and status = 'offen' returning id;`, [v1]);
  check("Ein offenes Ereignis laesst sich loeschen", rows.length === 1);
});
check("Fortschreibung: nach dem Loeschen steht pfluecker.esutd auf erfasst", (await esutdStatus(p1)) === "erfasst");
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`delete from public.esutd_ereignisse where id = $1 returning id;`, [e1]);
  check("Ein erfasstes Ereignis laesst sich nicht loeschen", rows.length === 0);
});
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`delete from public.esutd_vertraege where id = $1 returning id;`, [v1]);
  check("Ein erfasster Abschluss laesst sich nicht loeschen", rows.length === 0);
});

// Ein Mensch ohne Meldung bleibt, wie er ist
check("Fortschreibung: ohne Meldung aendert sich nichts", (await esutdStatus(p2)) === "offen");
await db.query(`update public.pfluecker set esutd = 'erfasst' where id = $1;`, [p2]);
await db.query(`insert into public.esutd_vertraege (pfluecker_id, vertrag_beginn_am) values ($1, current_date) returning id;`, [p2]);
check("Fortschreibung: ein neuer offener Abschluss setzt auf offen", (await esutdStatus(p2)) === "offen");
await als("admin", async () => {
  const { rows } = await db.query(`delete from public.esutd_vertraege where pfluecker_id = $1 and status = 'offen' returning id;`, [p2]);
  check("Ein offener Abschluss laesst sich loeschen", rows.length === 1);
});

// --- 4. Rechte --------------------------------------------------------------------------------------------------------------
for (const rolle of ["admin", "ceo", "betriebsleitung"]) {
  await als(rolle, async () => {
    const a = await db.query(`insert into public.esutd_vertraege (pfluecker_id, vertrag_beginn_am) values ($1, current_date) returning id;`, [p2]);
    check(`${rolle} legt einen Abschluss an`, a.rows.length === 1);
    const b = await db.query(`insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'aenderung', current_date, 'Neue Taetigkeit') returning id;`, [a.rows[0].id]);
    check(`${rolle} legt ein Ereignis an`, b.rows.length === 1);
    const c = await db.query(`update public.esutd_ereignisse set status = 'erfasst', erfasst_am = public.heute_almaty() where id = $1 returning id;`, [b.rows[0].id]);
    check(`${rolle} erfasst es`, c.rows.length === 1);
  });
}
for (const rolle of ["buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf keinen Abschluss anlegen`, `insert into public.esutd_vertraege (pfluecker_id, vertrag_beginn_am) values ($1, current_date);`, [p2], "42501");
  });
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf kein Ereignis anlegen`, `insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'aenderung', current_date, 'abc');`, [v1], "42501");
  });
}
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.esutd_ereignisse;`);
    check(`${rolle} liest die Ereignisse`, rows.length >= 1, `Zeilen: ${rows.length}`);
  });
}
for (const rolle of ["brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const a = await db.query(`select id from public.esutd_ereignisse;`);
    const b = await db.query(`select id from public.esutd_vertraege;`);
    const c = await db.query(`select id from public.v_esutd_meldungen;`);
    check(`${rolle} sieht keine Meldungen`, a.rows.length === 0 && b.rows.length === 0 && c.rows.length === 0, `${a.rows.length}/${b.rows.length}/${c.rows.length}`);
  });
}
await t.alsRolle("anon");
await mussScheitern("anon darf die Ereignisse nicht lesen", `select * from public.esutd_ereignisse;`, [], "42501");
await t.alsRolle("anon");
await mussScheitern("anon darf die Sicht nicht lesen", `select * from public.v_esutd_meldungen;`, [], "42501");

// --- 5. Sicht -----------------------------------------------------------------------------------------------------------------
{
  const q = await db.query<{ id: string }>(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'V-SICHT', '2026-10-12') returning id;`, [p2]);
  await db.query(`insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'beendigung', '2026-12-31', 'Saisonende');`, [q.rows[0].id]);
  await als("betriebsleitung", async () => {
    const { rows } = await db.query<{ quelle: string; art: string; status: string; meldefrist_am: string | null; pfluecker_name: string | null; pfluecker_ausweis: string | null; vertragsnummer: string | null }>(
      `select quelle, art, status, meldefrist_am::text, pfluecker_name, pfluecker_ausweis, vertragsnummer from public.v_esutd_meldungen where vertragsnummer = 'V-SICHT' order by art;`);
    const abschluss = rows.find((r) => r.art === "abschluss");
    const ende = rows.find((r) => r.art === "beendigung");
    check("Sicht: Abschluss und Beendigung stehen in einer Liste", rows.length === 2 && abschluss?.quelle === "vertrag" && ende?.quelle === "ereignis", JSON.stringify(rows));
    // 12.10.2026 ist ein Montag: fuenf Werktage danach ist der Montag, 19.10.2026.
    check("Sicht: die Meldefrist des offenen Abschlusses sind fuenf Werktage", abschluss?.meldefrist_am === "2026-10-19", String(abschluss?.meldefrist_am));
    check("Sicht: eine Beendigung hat keine Frist", ende?.meldefrist_am === null);
    check("Sicht: Name und Ausweis der Person stehen dabei", abschluss?.pfluecker_name === "Test Zweite" && abschluss?.pfluecker_ausweis === "AW-ESUTD-2");
  });
  await als("ceo", async () => {
    const { rows } = await db.query(`select id from public.v_esutd_meldungen where vertragsnummer = 'V-SICHT';`);
    check("Sicht: die Geschaeftsfuehrung sieht die Meldungen", rows.length === 2, `Zeilen: ${rows.length}`);
  });
  await db.query(`update public.esutd_vertraege set status = 'erfasst', erfasst_am = '2026-10-13' where id = $1;`, [q.rows[0].id]);
  await als("betriebsleitung", async () => {
    const { rows } = await db.query<{ meldefrist_am: string | null }>(`select meldefrist_am::text from public.v_esutd_meldungen where vertragsnummer = 'V-SICHT' and art = 'abschluss';`);
    check("Sicht: ein erfasster Abschluss hat keine Frist mehr", rows[0].meldefrist_am === null);
  });
}

// --- 6. Nachbesserungen (Prüfung PR #156, 15.10.2026) --------------------------------------------------------------------------------
{
  // esutd_status_abgleichen() war security definer ohne revoke und über /rpc für jede Rolle aufrufbar.
  await t.alsRolle("anon");
  await mussScheitern("Nachziehen: anon ruft esutd_status_abgleichen nicht auf", `select public.esutd_status_abgleichen($1);`, [p1], "42501");
  for (const rolle of ["admin", "betriebsleitung", "buchhaltung", "kunde"]) {
    await als(rolle, () => mussScheitern(`Nachziehen: ${rolle} ruft esutd_status_abgleichen nicht auf`, `select public.esutd_status_abgleichen($1);`, [p1], "42501"));
  }
  // Die Trigger arbeiten weiter (sie sind jetzt selbst definer): ein neuer offener Abschluss macht die Person wieder offen.
  const p3 = await pfluecker("Test Dritte", "AW-ESUTD-3");
  await als("betriebsleitung", async () => {
    await db.query(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'V-NZ', current_date) returning id;`, [p3]);
  });
  check("Nachziehen: die Trigger setzen pfluecker.esutd weiterhin fort", (await esutdStatus(p3)) === "offen");

  // Ein Vertrag mit erfassten Meldungen lässt sich nicht löschen (bis dahin löschte die Kaskade sie samt Bestätigung und Beleg).
  const { rows: vz } = await db.query<{ id: string }>(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'V-KASKADE', current_date - 20) returning id;`, [p3]);
  const vk = vz[0].id;
  await db.query(`insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung, status, erfasst_am, bestaetigung) values ($1, 'aenderung', current_date - 5, 'Neuer Lohn', 'erfasst', public.heute_almaty(), 'BEST-1');`, [vk]);
  await als("betriebsleitung", () => mussScheitern("Löschen: ein offener Vertrag mit erfasster Änderung bleibt (DA017), die Kaskade löscht sie nicht", `delete from public.esutd_vertraege where id = $1;`, [vk], "DA017"));
  const { rows: bleibt } = await db.query(`select id from public.esutd_ereignisse where vertrag_id = $1 and bestaetigung = 'BEST-1';`, [vk]);
  check("Löschen: die erfasste Änderung samt Bestätigung ist noch da", bleibt.length === 1);
  // Mit nur offenen Ereignissen geht es weiter wie bisher (Kaskade).
  const { rows: vo } = await db.query<{ id: string }>(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'V-OFFEN', current_date - 2) returning id;`, [p3]);
  await db.query(`insert into public.esutd_ereignisse (vertrag_id, art, ereignis_am, beschreibung) values ($1, 'aenderung', current_date, 'Noch offen');`, [vo[0].id]);
  await als("betriebsleitung", async () => {
    const { rows } = await db.query(`delete from public.esutd_vertraege where id = $1 returning id;`, [vo[0].id]);
    check("Löschen: ein offener Vertrag mit nur offenen Ereignissen lässt sich löschen", rows.length === 1);
  });
}

t.ende("Alle ЕСУТД-Datenbanktests gruen.");
