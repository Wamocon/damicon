// Rechte und Schutz (Migration 20261208020000, Entscheidungen vom 15.10.2026), Datenbankseite: Preislisten nach Kundengruppe, Schreibrechte der
// Preislisten, Pflanzenschutz mit der Sperrsicht, Konto loeschen trotz unveraenderlicher Zeilen. Die Regeln fuer Abholrunden, Nachrichten,
// Messprotokoll und ЕСУТД-Verlauf stehen in den Tests ihrer Bereiche. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:rechte-schutz

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, alsAdmin, mussScheitern } = t;

const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

// --- 1. Preislisten lesen -------------------------------------------------------------------------------------------------------------
const { rows: sorten } = await db.query<{ id: string }>(`select id from public.sorten order by name limit 1;`);
const liste = async (name: string, gruppe: string | null): Promise<string> => {
  const { rows } = await db.query<{ id: string }>(`insert into public.preislisten (name, kundengruppe) values ($1, $2::public.kundengruppe) returning id;`, [name, gruppe]);
  await db.query(`insert into public.preislisten_positionen (preisliste_id, sorte_id, preis_tenge_kg) values ($1, $2, 1000);`, [rows[0].id, sorten[0].id]);
  return rows[0].id;
};
const handel = await liste("RS Handel", "handel");
const gastro = await liste("RS Gastronomie", "gastronomie");
const standard = await liste("RS Standard", null);
const eigene = [handel, gastro, standard];
const gesehen = async (rolle: string): Promise<string[]> =>
  als(rolle, async () => {
    const { rows } = await db.query<{ id: string }>(`select id from public.preislisten where id = any($1::uuid[]) order by name;`, [eigene]);
    return rows.map((r) => r.id);
  });

await db.query(`update public.b2b_kunden set kundengruppe = 'handel' where id = $1;`, [t.kundeId]);
{
  const ids = await gesehen("kunde");
  check("Preislisten: ein Kunde der Gruppe Handel liest die Liste seiner Gruppe und die Standardliste", ids.length === 2 && ids.includes(handel) && ids.includes(standard), `${ids.length}`);
  check("Preislisten: ... und nicht die Liste einer anderen Kundengruppe", !ids.includes(gastro));
  const pos = await als("kunde", async () => (await db.query<{ preisliste_id: string }>(`select preisliste_id from public.preislisten_positionen where preisliste_id = any($1::uuid[]);`, [eigene])).rows.map((r) => r.preisliste_id));
  check("Preislisten: die Positionen folgen der Liste (nur Handel und Standard)", pos.length === 2 && !pos.includes(gastro));
}
await db.query(`update public.b2b_kunden set kundengruppe = null where id = $1;`, [t.kundeId]);
{
  const ids = await gesehen("kunde");
  check("Preislisten: ein Kunde ohne zugeordnete Gruppe liest nur die gruppenlose Standardliste", ids.length === 1 && ids[0] === standard, `${ids.length}`);
}
await db.query(`update public.b2b_kunden set kundengruppe = 'handel' where id = $1;`, [t.kundeId]);
for (const rolle of ["brigade", "picker", "erzeuger"]) {
  check(`Preislisten: ${rolle} liest keine Preisliste`, (await gesehen(rolle)).length === 0);
}
for (const rolle of ["admin", "ceo", "betriebsleitung", "buchhaltung"]) {
  check(`Preislisten: ${rolle} liest alle Listen`, (await gesehen(rolle)).length === 3);
}

// --- 2. Preislisten schreiben ------------------------------------------------------------------------------------------------------------
for (const rolle of ["admin", "ceo", "betriebsleitung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query<{ id: string }>(`insert into public.preislisten (name, kundengruppe) values ($1, null) returning id;`, [`RS von ${rolle}`]);
    await db.query(`insert into public.preislisten_positionen (preisliste_id, sorte_id, preis_tenge_kg) values ($1, $2, 900);`, [rows[0].id, sorten[0].id]);
    const { rows: neu } = await db.query(`update public.preislisten set aktiv = false where id = $1 returning id;`, [rows[0].id]);
    check(`Preislisten: ${rolle} legt eine Liste mit Position an und deaktiviert sie`, neu.length === 1);
  });
}
for (const rolle of ["buchhaltung", "kunde", "brigade", "picker", "erzeuger"]) {
  await alsScheitert(rolle, `Preislisten: ${rolle} legt keine Liste an`, `insert into public.preislisten (name) values ('RS verboten');`, [], "42501");
  await als(rolle, async () => {
    const { rows } = await db.query(`update public.preislisten set aktiv = false where id = $1 returning id;`, [standard]);
    check(`Preislisten: ${rolle} aendert keine Liste (Zeile bleibt unsichtbar oder gesperrt)`, rows.length === 0);
  });
}
await alsScheitert("buchhaltung", "Preislisten: die Buchhaltung legt keine Position an", `insert into public.preislisten_positionen (preisliste_id, sorte_id, preis_tenge_kg) values ($1, $2, 1);`, [standard, sorten[0].id], "42501");
await als("buchhaltung", async () => {
  const { rows } = await db.query(`delete from public.preislisten_positionen where preisliste_id = $1 returning id;`, [standard]);
  check("Preislisten: die Buchhaltung loescht keine Position", rows.length === 0);
});
// Eine Preisliste selbst bleibt: sie ist Grundlage bereits berechneter Betraege. Nur ihre Positionen lassen sich entfernen.
for (const rolle of ["admin", "ceo", "betriebsleitung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`delete from public.preislisten where id = $1 returning id;`, [standard]);
    check(`Preislisten: auch ${rolle} loescht die Liste selbst nicht`, rows.length === 0);
  });
}
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`delete from public.preislisten_positionen where preisliste_id = $1 returning id;`, [standard]);
  check("Preislisten: die Betriebsleitung entfernt die Position einer Liste", rows.length === 1);
});

// --- 3. Pflanzenschutz ----------------------------------------------------------------------------------------------------------------------
await als("admin", async () => {
  const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from public.v_block_sperre;`);
  check("Vorbereitung: der Seed enthaelt offene Sperren", rows[0].n > 0, `Zeilen: ${rows[0].n}`);
});
for (const rolle of ["admin", "ceo", "betriebsleitung", "brigade"]) {
  await als(rolle, async () => {
    const { rows: b } = await db.query(`select id from public.pflanzenschutz_behandlungen limit 1;`);
    const { rows: m } = await db.query(`select id from public.psm_mittel limit 1;`);
    const { rows: s } = await db.query<{ mittel_name: string | null; mittel_wirkstoff: string | null }>(`select mittel_name, mittel_wirkstoff from public.v_block_sperre limit 1;`);
    check(`Pflanzenschutz: ${rolle} liest Behandlungen, Mittel und die Sperre mit dem Mittel`, b.length === 1 && m.length === 1 && s.length === 1 && s[0].mittel_name !== null);
  });
}
for (const rolle of ["buchhaltung", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows: b } = await db.query(`select id from public.pflanzenschutz_behandlungen;`);
    const { rows: m } = await db.query(`select id from public.psm_mittel;`);
    const { rows: s } = await db.query<{ mittel_name: string | null; mittel_wirkstoff: string | null; freigabe_am: string | null }>(`select mittel_name, mittel_wirkstoff, freigabe_am from public.v_block_sperre;`);
    check(`Pflanzenschutz: ${rolle} liest weder Behandlungen noch Mittel`, b.length === 0 && m.length === 0);
    check(`Pflanzenschutz: ${rolle} sieht die Sperre (bis wann), aber kein Mittel und keinen Wirkstoff`, s.length > 0 && s.every((z) => z.freigabe_am !== null && z.mittel_name === null && z.mittel_wirkstoff === null), `Zeilen: ${s.length}`);
  });
}
for (const rolle of ["picker", "kunde"]) {
  await als(rolle, async () => {
    const { rows: b } = await db.query(`select id from public.pflanzenschutz_behandlungen;`);
    const { rows: s } = await db.query(`select * from public.v_block_sperre;`);
    check(`Pflanzenschutz: ${rolle} sieht weder Behandlungen noch Sperren`, b.length === 0 && s.length === 0);
  });
}
await t.alsRolle("anon");
await mussScheitern("Pflanzenschutz: anon liest die Sperrsicht nicht", `select * from public.v_block_sperre;`, [], "42501");
await alsAdmin();

// --- 4. Konto loeschen --------------------------------------------------------------------------------------------------------------------
// Vorher scheiterte das Loeschen eines Kontos, das einen bestaetigten ЭСФ-Beleg, einen Stand der Wirtschaftlichkeit oder eine abgeschlossene Runde
// angelegt hatte: "on delete set null" ist eine Aenderung, und die Zeilen sind unveraenderlich.
{
  const { rows: u } = await db.query<{ id: string }>(`insert into auth.users (email, raw_app_meta_data) values ('qa-ehemalig@damicon.demo', '{"role":"betriebsleitung"}'::jsonb) returning id;`);
  const { rows: p } = await db.query<{ id: string }>(`select id from public.profiles where auth_user_id = $1;`, [u[0].id]);
  const profil = p[0].id;
  check("Konto: das Profil des Testkontos besteht", !!profil);

  const { rows: lf } = await db.query<{ id: string }>(`insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, 10) returning id;`, [t.kundeId]);
  await db.exec("alter table public.lieferungen disable trigger user; alter table public.esf_belege disable trigger user; alter table public.abholrunden disable trigger user;");
  await db.query(`update public.lieferungen set status = 'zugestellt' where id = $1;`, [lf[0].id]);
  await db.query(`insert into public.esf_belege (lieferung_id, entwurf, status, esf_nummer, ausgestellt_am, bestaetigt_am, erstellt_von_profil_id) values ($1, '{}'::jsonb, 'bestaetigt', 'E-1', current_date, current_date, $2);`, [lf[0].id, profil]);
  const { rows: r } = await db.query<{ id: string }>(`insert into public.abholrunden (datum, status, erstellt_von_profil_id) values (current_date, 'abgeschlossen', $1) returning id;`, [profil]);
  await db.exec("alter table public.lieferungen enable trigger user; alter table public.esf_belege enable trigger user; alter table public.abholrunden enable trigger user;");
  const { rows: s } = await db.query<{ id: string }>(`insert into public.wirtschaftlichkeit_staende (bezeichnung, snapshot, erstellt_von_profil_id) values ('RS Stand', '{}'::jsonb, $1) returning id;`, [profil]);

  await db.query(`delete from auth.users where id = $1;`, [u[0].id]);
  const { rows: weg } = await db.query(`select 1 from public.profiles where id = $1;`, [profil]);
  check("Konto: das Konto laesst sich loeschen, das Profil geht mit", weg.length === 0);
  const { rows: beleg } = await db.query<{ erstellt_von_profil_id: string | null }>(`select erstellt_von_profil_id from public.esf_belege where lieferung_id = $1;`, [lf[0].id]);
  const { rows: runde } = await db.query<{ erstellt_von_profil_id: string | null }>(`select erstellt_von_profil_id from public.abholrunden where id = $1;`, [r[0].id]);
  const { rows: stand } = await db.query<{ erstellt_von_profil_id: string | null }>(`select erstellt_von_profil_id from public.wirtschaftlichkeit_staende where id = $1;`, [s[0].id]);
  check("Konto: der bestaetigte Beleg, die abgeschlossene Runde und der Stand bleiben bestehen", beleg.length === 1 && runde.length === 1 && stand.length === 1);
  check("Konto: die Urheberkennung bleibt als Zahl ohne Namen stehen (keine Zeile aendert sich)", beleg[0].erstellt_von_profil_id === profil && runde[0].erstellt_von_profil_id === profil && stand[0].erstellt_von_profil_id === profil);
}

t.ende("Alle Tests zu Rechten und Schutz gruen.");
