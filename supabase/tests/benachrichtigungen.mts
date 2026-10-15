// Benachrichtigungen der Glocke (WMCNL-2486, Migration 20261208150000): die Erzeugung aus dem Stand der Daten (Nachweise, ЭСФ, ЕСУТД, Block-Risiko), Empfänger,
// Idempotenz, Zeilensicherheit und Rechte, die Regeln der Anwendung und die Texte in vier Sprachen. PGlite, kein Docker.
//
// Aufruf: npm run test:benachrichtigungen

import { readFileSync } from "node:fs";
import { starte } from "./hilfen/pglite-rollen.mjs";
import {
  ANZEIGE_MAX,
  BENACHRICHTIGUNG_ARTEN,
  istBenachrichtigungArt,
  leseParameter,
  plakatZahl,
} from "@/lib/domain/benachrichtigungen";
import { modules } from "@/lib/modules";

const t = await starte();
const { db, check, als, mussScheitern } = t;

// --- 1. Regeln der Anwendung ------------------------------------------------------------------------------------------------------------
check("Arten: genau die fünf der Datenbank", BENACHRICHTIGUNG_ARTEN.length === 5 && istBenachrichtigungArt("esf_ueberfaellig") && !istBenachrichtigungArt("irgendwas") && !istBenachrichtigungArt(null));
check("Parameter: Name und ganze Zahl werden gelesen", JSON.stringify(leseParameter({ name: "  Zertifikat Bio  ", anzahl: 3 })) === JSON.stringify({ name: "Zertifikat Bio", anzahl: 3 }));
check("Parameter: Fremdes fällt weg (Text als Zahl, Bruch, negativ, Liste, null, zu groß)", JSON.stringify(leseParameter({ name: 5, anzahl: "3" })) === "{}" && JSON.stringify(leseParameter({ anzahl: 2.5 })) === "{}" && JSON.stringify(leseParameter({ anzahl: -1 })) === "{}" && JSON.stringify(leseParameter([1])) === "{}" && JSON.stringify(leseParameter(null)) === "{}" && JSON.stringify(leseParameter({ anzahl: 2_000_000 })) === "{}");
check("Parameter: ein langer Name wird gekürzt, ein leerer entfällt", (leseParameter({ name: "x".repeat(500) }).name ?? "").length === 120 && JSON.stringify(leseParameter({ name: "   " })) === "{}");
check("Glocke: bis 99 genau, darüber 99+", plakatZahl(0) === "0" && plakatZahl(7) === "7" && plakatZahl(99) === "99" && plakatZahl(100) === "99+" && plakatZahl(-4) === "0");
check("Anzeige: höchstens 50 Hinweise im Fenster", ANZEIGE_MAX === 50);
{
  const { rows } = await db.query<{ definition: string }>(`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid = 'public.benachrichtigungen'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%nachweis_abgelaufen%';`);
  check("Arten: dieselben fünf stehen im Check der Tabelle", rows.length === 1 && BENACHRICHTIGUNG_ARTEN.every((a) => rows[0].definition.includes(`'${a}'`)), JSON.stringify(rows));
}
{
  const fehlen = ["dokumente", "esf", "integrationen", "reihenbloecke"].filter((m) => !modules.some((x) => x.key === m));
  check("Module: die Ziele der Hinweise gibt es in der Anwendung", fehlen.length === 0, fehlen.join(","));
}

// --- 2. Erzeugung ---------------------------------------------------------------------------------------------------------------------------
const profil = async (rolle: string) => (await db.query<{ id: string }>(`select id from public.profiles where role = $1::public.app_role order by created_at limit 1;`, [rolle])).rows[0].id;
const leitung = await profil("betriebsleitung");
const admin = await profil("admin");
const buchhaltung = await profil("buchhaltung");
const ceo = await profil("ceo");
const profilIds: Record<string, string> = {};
for (const r of ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) profilIds[r] = await profil(r);

const erzeuge = async (): Promise<{ neu: number; stichtag: string }> => {
  await t.alsRolle("service_role");
  const { rows } = await db.query<{ r: { neu: number; stichtag: string } }>(`select public.benachrichtigungen_erzeugen() as r;`);
  await t.alsAdmin();
  return rows[0].r;
};
const anzahl = async (empfaenger: string, art?: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.benachrichtigungen where empfaenger_id = $1 ${art ? "and art = $2" : ""};`, art ? [empfaenger, art] : [empfaenger])).rows[0].n;

const dokument = async (name: string, gueltigBis: string, verantwortlich: string | null = null, ersetzt: string | null = null) =>
  (await db.query<{ id: string }>(
    `insert into public.dokumente (name, kategorie, gueltig_bis, verantwortlich_id, ersetzt_id) values ($1, 'zertifikat', public.heute_almaty() + $2::int, $3, $4) returning id;`,
    [name, Number(gueltigBis), verantwortlich, ersetzt],
  )).rows[0].id;

{
  const leer = await erzeuge();
  const vorhanden = (await db.query<{ n: number }>(`select count(*)::int as n from public.benachrichtigungen;`)).rows[0].n;
  check("Erzeugung: ohne auffälligen Stand keine oder nur schon vorhandene Hinweise", leer.neu === vorhanden);
}

// Nachweise
const mitVerantwortlichem = await dokument("N-Abgelaufen-Verantwortlich", "-5", leitung);
const ohneVerantwortlichen = await dokument("N-LaeuftAb-Ohne", "10");
const alt = await dokument("N-Alt-Ersetzt", "-30");
await dokument("N-Neu-Gueltig", "300", null, alt);
await dokument("N-Gueltig", "300");
const erstes = await erzeuge();
check("Erzeugung: Nachweise lösen Hinweise aus", erstes.neu > 0, JSON.stringify(erstes));
{
  const { rows } = await db.query<{ empfaenger_id: string; art: string }>(`select empfaenger_id, art from public.benachrichtigungen where schluessel = $1;`, [`nachweis:${mitVerantwortlichem}:abgelaufen`]);
  check("Nachweis mit Verantwortlichem: nur diese Person bekommt den Hinweis (abgelaufen)", rows.length === 1 && rows[0].empfaenger_id === leitung && rows[0].art === "nachweis_abgelaufen", JSON.stringify(rows));
}
{
  const { rows } = await db.query<{ empfaenger_id: string; art: string }>(`select empfaenger_id, art from public.benachrichtigungen where schluessel = $1;`, [`nachweis:${ohneVerantwortlichen}:laeuft_ab`]);
  const empf = rows.map((r) => r.empfaenger_id);
  check("Nachweis ohne Verantwortlichen: Administration und Betriebsleitung (läuft ab), die Geschäftsführung zieht mit", empf.includes(admin) && empf.includes(leitung) && empf.includes(ceo) && !empf.includes(buchhaltung) && rows.every((r) => r.art === "nachweis_laeuft_ab"), JSON.stringify(rows));
}
{
  const { rows } = await db.query(`select 1 from public.benachrichtigungen where schluessel like $1;`, [`nachweis:${alt}:%`]);
  check("Nachweis: eine ersetzte Version meldet sich nicht mehr", rows.length === 0);
}
{
  const { rows } = await db.query(`select 1 from public.benachrichtigungen where parameter ->> 'name' = 'N-Gueltig';`);
  check("Nachweis: ein gültiger meldet sich nicht", rows.length === 0);
}
{
  const zweites = await erzeuge();
  const ohneNeu = (await db.query<{ n: number }>(`select count(*)::int as n from public.benachrichtigungen;`)).rows[0].n;
  check("Erzeugung: ein zweiter Lauf legt nichts doppelt an (idempotent)", zweites.neu === 0 && ohneNeu > 0, JSON.stringify([zweites, ohneNeu]));
}
{
  // Der Zustand ändert sich: aus "läuft ab" wird "abgelaufen" und meldet sich erneut, einmal.
  await db.query(`update public.dokumente set gueltig_bis = public.heute_almaty() - 1 where id = $1;`, [ohneVerantwortlichen]);
  const lauf = await erzeuge();
  const { rows } = await db.query(`select 1 from public.benachrichtigungen where schluessel = $1;`, [`nachweis:${ohneVerantwortlichen}:abgelaufen`]);
  check("Nachweis: ein neuer Zustand meldet sich neu (abgelaufen nach läuft ab)", lauf.neu > 0 && rows.length >= 2, String(rows.length));
}
{
  // Der Verantwortliche ist gesperrt: der Hinweis geht an Administration und Betriebsleitung.
  await db.query(`update public.profiles set gesperrt_am = now(), gesperrt_grund = 'Test' where id = $1;`, [buchhaltung]);
  const d = await dokument("N-Gesperrter-Verantwortlicher", "-2", buchhaltung);
  await erzeuge();
  const { rows } = await db.query<{ empfaenger_id: string }>(`select empfaenger_id from public.benachrichtigungen where schluessel = $1;`, [`nachweis:${d}:abgelaufen`]);
  const empf = rows.map((r) => r.empfaenger_id);
  check("Gesperrte Konten bekommen nichts: der Hinweis geht an Administration und Betriebsleitung", !empf.includes(buchhaltung) && empf.includes(admin) && empf.includes(leitung), JSON.stringify(empf));
  await db.query(`update public.profiles set gesperrt_am = null, gesperrt_von = null, gesperrt_grund = null where id = $1;`, [buchhaltung]);
}

// ЭСФ über der Frist
{
  const { rows: l } = await db.query<{ id: string }>(`insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, 100) returning id;`, [t.kundeId]);
  await db.exec("alter table public.lieferungen disable trigger user;");
  await db.query(`update public.lieferungen set status = 'zugestellt'::public.lieferung_status, geliefert_am = now() - interval '20 days' where id = $1;`, [l[0].id]);
  await db.exec("alter table public.lieferungen enable trigger user;");
  const frist = Number((await db.query<{ f: string }>(`select public.einstellung_zahl('esf.frist_tage')::text as f;`)).rows[0].f);
  await erzeuge();
  const buch = await anzahl(buchhaltung, "esf_ueberfaellig");
  const adm = await anzahl(admin, "esf_ueberfaellig");
  const lei = await anzahl(leitung, "esf_ueberfaellig");
  check(`ЭСФ: eine 20 Tage alte Lieferung ohne Beleg ist über der Frist (${frist}), Buchhaltung und Administration bekommen einen Sammelhinweis`, frist < 20 && buch === 1 && adm === 1 && lei === 0, JSON.stringify([buch, adm, lei]));
  const { rows: p } = await db.query<{ parameter: { anzahl: number } }>(`select parameter from public.benachrichtigungen where empfaenger_id = $1 and art = 'esf_ueberfaellig';`, [buchhaltung]);
  check("ЭСФ: der Hinweis nennt die Zahl der Lieferungen", Number(p[0].parameter.anzahl) >= 1, JSON.stringify(p));
  await db.query(`update public.betriebs_einstellungen set wert = null where schluessel = 'esf.frist_tage';`);
  await db.query(`delete from public.benachrichtigungen where art = 'esf_ueberfaellig';`);
  await erzeuge();
  check("ЭСФ: ohne gesetzte Frist (null) gibt es keinen Hinweis", (await anzahl(buchhaltung, "esf_ueberfaellig")) === 0);
  await db.query(`update public.betriebs_einstellungen set wert = 15 where schluessel = 'esf.frist_tage';`);
}

// ЕСУТД über der Frist
{
  const { rows: pf } = await db.query<{ id: string }>(`select id from public.pfluecker limit 1;`);
  await db.query(`insert into public.esutd_vertraege (pfluecker_id, vertragsnummer, vertrag_beginn_am) values ($1, 'BN-1', public.heute_almaty() - 30);`, [pf[0].id]);
  await erzeuge();
  const empf = [leitung, buchhaltung, admin];
  const zahlen = await Promise.all(empf.map((e) => anzahl(e, "esutd_ueberfaellig")));
  check("ЕСУТД: ein offener Abschluss über der Frist meldet sich bei Betriebsleitung, Buchhaltung und Administration", zahlen.every((n) => n === 1), JSON.stringify(zahlen));
}

// Block-Risiko hoch
{
  const { rows: gruppen } = await db.query<{ id: string }>(`select id from public.reihengruppen limit 1;`);
  const { rows: b } = await db.query<{ id: string }>(`insert into public.reihenbloecke (reihengruppe_id, code, status) values ($1, 'BN-RISIKO-1', 'bepflanzt') returning id;`, [gruppen[0].id]);
  await db.query(`insert into public.pflueckaufgaben (code, reihenblock_id, status, faelligkeit) values ('PA-BN-1', $1, 'offen', now() - interval '72 hours');`, [b[0].id]);
  await db.query(`update public.risiko_parameter set wert = 30 where schluessel = 'schwelle_hoch';`);
  await db.query(`update public.risiko_parameter set wert = 10 where schluessel = 'schwelle_mittel';`);
  await erzeuge();
  const lei = await anzahl(leitung, "block_risiko_hoch");
  const buch = await anzahl(buchhaltung, "block_risiko_hoch");
  check("Block-Risiko: ein Block mit Stufe hoch meldet sich bei Betriebsleitung und Administration, nicht bei der Buchhaltung", lei === 1 && buch === 0 && (await anzahl(admin, "block_risiko_hoch")) === 1, JSON.stringify([lei, buch]));
  await db.query(`update public.risiko_parameter set wert = 50 where schluessel = 'schwelle_hoch';`);
  await db.query(`update public.risiko_parameter set wert = 25 where schluessel = 'schwelle_mittel';`);
}
check("Geschäftsführung: bekommt, was die Administration bekommt", (await anzahl(ceo, "esutd_ueberfaellig")) === 1 && (await anzahl(ceo, "block_risiko_hoch")) === 1);

// --- 3. Zeilensicherheit und Rechte ------------------------------------------------------------------------------------------------------
for (const rolle of ["admin", "betriebsleitung", "buchhaltung", "brigade", "picker", "erzeuger", "kunde"]) {
  await als(rolle, async () => {
    const meine = profilIds[rolle];
    const { rows } = await db.query<{ empfaenger_id: string }>(`select empfaenger_id from public.benachrichtigungen;`);
    check(`Lesen: ${rolle} sieht nur die eigenen Hinweise`, rows.every((r) => r.empfaenger_id === meine), `Zeilen: ${rows.length}`);
  });
}
await als("betriebsleitung", async () => {
  const eigene = await db.query<{ id: string }>(`select id from public.benachrichtigungen where gelesen_am is null limit 1;`);
  await db.query(`update public.benachrichtigungen set gelesen_am = now() where id = $1;`, [eigene.rows[0].id]);
  const { rows } = await db.query<{ gelesen_am: string | null }>(`select gelesen_am from public.benachrichtigungen where id = $1;`, [eigene.rows[0].id]);
  check("Markieren: die Betriebsleitung markiert den eigenen Hinweis als gelesen", rows[0].gelesen_am !== null);
});
await als("betriebsleitung", async () => {
  const { rows } = await db.query(`update public.benachrichtigungen set gelesen_am = now() where empfaenger_id = $1 returning id;`, [admin]);
  check("Markieren: fremde Hinweise lassen sich nicht markieren", rows.length === 0, `Zeilen: ${rows.length}`);
});
for (const [name, sql] of [
  ["Anlegen", `insert into public.benachrichtigungen (empfaenger_id, art, schluessel, modul) values ($1, 'esf_ueberfaellig', 'frei-erfunden', 'esf');`],
  ["Löschen", `delete from public.benachrichtigungen where empfaenger_id = $1;`],
  ["Ändern des Textes", `update public.benachrichtigungen set parameter = '{"anzahl": 99}'::jsonb where empfaenger_id = $1;`],
  ["Umhängen auf eine andere Person", `update public.benachrichtigungen set empfaenger_id = $2 where empfaenger_id = $1;`],
] as const) {
  await als("betriebsleitung", async () => {
    try {
      const r = await db.query(sql, name === "Umhängen auf eine andere Person" ? [leitung, admin] : [leitung]);
      check(`Rechte: ${name} ist für ein angemeldetes Konto nicht möglich`, name === "Löschen" ? false : r.rows.length === 0, "die Anweisung war erfolgreich");
    } catch (e) {
      check(`Rechte: ${name} ist für ein angemeldetes Konto nicht möglich`, (e as { code?: string }).code === "42501");
    }
  });
}
for (const rolle of ["admin", "ceo", "betriebsleitung"]) {
  await als(rolle, async () => {
    await mussScheitern(`Erzeugung: ${rolle} ruft die Funktion nicht auf (42501)`, `select public.benachrichtigungen_erzeugen();`, [], "42501");
  });
}
await t.alsRolle("anon");
await mussScheitern("Erzeugung: anon ruft die Funktion nicht auf (42501)", `select public.benachrichtigungen_erzeugen();`, [], "42501");
await t.alsRolle("anon");
await mussScheitern("Lesen: anon hat keinen Zugriff auf die Tabelle (42501)", `select * from public.benachrichtigungen;`, [], "42501");
await t.alsAdmin();

// --- 4. Aufräumen -------------------------------------------------------------------------------------------------------------------------
{
  await db.query(`insert into public.benachrichtigungen (empfaenger_id, art, schluessel, modul, erstellt_am, gelesen_am) values ($1, 'esf_ueberfaellig', 'alt-gelesen', 'esf', now() - interval '120 days', now() - interval '100 days'), ($1, 'esf_ueberfaellig', 'alt-ungelesen', 'esf', now() - interval '200 days', null), ($1, 'esf_ueberfaellig', 'jung-gelesen', 'esf', now() - interval '30 days', now() - interval '20 days'), ($1, 'esf_ueberfaellig', 'alt-aber-ungelesen-jung', 'esf', now() - interval '100 days', null);`, [leitung]);
  await erzeuge();
  const { rows } = await db.query<{ schluessel: string }>(`select schluessel from public.benachrichtigungen where schluessel in ('alt-gelesen', 'alt-ungelesen', 'jung-gelesen', 'alt-aber-ungelesen-jung') order by schluessel;`);
  check("Aufräumen: gelesen nach 90 Tagen weg, ungelesen nach 180, Jüngeres bleibt", rows.map((r) => r.schluessel).join() === "alt-aber-ungelesen-jung,jung-gelesen", rows.map((r) => r.schluessel).join());
}
await mussScheitern("Tabelle: ein Hinweis pro Person und Schlüssel (23505)", `insert into public.benachrichtigungen (empfaenger_id, art, schluessel, modul) values ($1, 'esf_ueberfaellig', 'jung-gelesen', 'esf');`, [leitung], "23505");
await mussScheitern("Tabelle: eine unbekannte Art wird abgelehnt (23514)", `insert into public.benachrichtigungen (empfaenger_id, art, schluessel, modul) values ($1, 'unbekannt', 'x-y-z', 'esf');`, [leitung], "23514");
await mussScheitern("Tabelle: ein Modulname mit Pfad wird abgelehnt (23514)", `insert into public.benachrichtigungen (empfaenger_id, art, schluessel, modul) values ($1, 'esf_ueberfaellig', 'x-y-q', '../etwas');`, [leitung], "23514");
// --- 5. Texte ---------------------------------------------------------------------------------------------------------------------------------
for (const l of ["de", "en", "ru", "kk"]) {
  const m = JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")).benachrichtigungen;
  const fehlt = [m?.titel, m?.leer, m?.leerHinweis, m?.schliessen, m?.alleGelesen, m?.ungelesenAnzahl, ...BENACHRICHTIGUNG_ARTEN.map((a) => m?.art?.[a])].filter((x) => typeof x !== "string" || x.length < 3);
  const platzhalter = BENACHRICHTIGUNG_ARTEN.every((a) => (a.startsWith("nachweis") ? /\{name\}/.test(m?.art?.[a] ?? "") : /\{anzahl\}/.test(m?.art?.[a] ?? "")));
  check(`Texte (${l}): alle Texte der Glocke vorhanden, die Platzhalter name und anzahl stehen`, fehlt.length === 0 && platzhalter, String(fehlt.length));
}

t.ende("Alle Tests der Benachrichtigungen gruen.");
