// Auslieferung der Integrations-Warteschlange (WMCNL-1627, WMCNL-2290), Datenbankseite (Migration 20261207110000): Konfiguration der Registry
// (Standard aus, Vollstaendigkeit, nur https), Einreihen mit Idempotenz, der Trigger des ЭСФ-Belegs und die Rechte je Rolle.
// PGlite, kein Docker noetig.
//
// Aufruf: npm run test:integration-auslieferung-db

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, mussScheitern } = t;

// mussScheitern() setzt die Rolle danach zurueck: jede Pruefung bekommt ihren eigenen Rollenwechsel.
const alsScheitert = (rolle: string, name: string, sql: string, params: unknown[], code?: string) => als(rolle, () => mussScheitern(name, sql, params, code));

const integration = async (key: string) => (await db.query<{ id: string }>(`select id from public.integrationen where key = $1;`, [key])).rows[0].id;
const esf = await integration("esf");

// --- 1. Standard ----------------------------------------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ n: number; aktiv: number; webhook: number }>(`select count(*)::int as n, count(*) filter (where aktiv)::int as aktiv, count(*) filter (where adapter <> 'manuell')::int as webhook from public.integrationen;`);
  check("Standard: jede Integration ist manuell und aus, es verlaesst nichts das System", rows[0].n >= 5 && rows[0].aktiv === 0 && rows[0].webhook === 0, JSON.stringify(rows[0]));
}

// --- 2. Konfiguration -----------------------------------------------------------------------------------------------------------------------
await mussScheitern("Konfiguration: aktiv ohne Webhook wird abgelehnt", `update public.integrationen set aktiv = true where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: aktiv ohne Adresse wird abgelehnt", `update public.integrationen set adapter = 'webhook', geheimnis_name = 'DAMICON_HOOK_ESF', aktiv = true where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: aktiv ohne Geheimnisnamen wird abgelehnt", `update public.integrationen set adapter = 'webhook', ziel_url = 'https://hooks.example.kz/x', aktiv = true where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: nur https", `update public.integrationen set adapter = 'webhook', ziel_url = 'http://hooks.example.kz/x' where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: keine Zugangsdaten in der Adresse", `update public.integrationen set ziel_url = 'https://user:pw@hooks.example.kz/x' where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: das Geheimnis steht als Name da, nicht als Wert", `update public.integrationen set geheimnis_name = 'ein geheimer wert 123' where id = $1;`, [esf], "23514");
await mussScheitern("Konfiguration: nur ein bekannter Adapter", `update public.integrationen set adapter = 'ftp' where id = $1;`, [esf], "23514");

// --- 3. Einreihen -----------------------------------------------------------------------------------------------------------------------------
{
  const einreihen = (ereignis: string, idempotenz: string) => db.query<{ id: string | null }>(`select public.integration_einreihen('esf', $1, '{"a":1}'::jsonb, $2) as id;`, [ereignis, idempotenz]);
  check("Einreihen: eine inaktive Integration nimmt nichts an", (await einreihen("test", "k1")).rows[0].id === null);
  await als("admin", async () => {
    await db.query(`update public.integrationen set adapter = 'webhook', ziel_url = 'https://hooks.example.kz/damicon', geheimnis_name = 'DAMICON_HOOK_ESF', aktiv = true where id = $1;`, [esf]);
  });
  const erste = (await einreihen("test", "k1")).rows[0].id;
  check("Einreihen: eine aktive Integration nimmt das Ereignis an", erste !== null);
  check("Einreihen: derselbe Schluessel reiht nicht noch einmal ein", (await einreihen("test", "k1")).rows[0].id === null && (await einreihen("test", "k2")).rows[0].id !== null);
  const { rows } = await db.query<{ ziel_system: string; payload: { a: number }; status: string; versuche: number; faellig: boolean }>(`select ziel_system, payload, status::text, versuche, naechster_versuch_am <= now() as faellig from public.integration_outbox where id = $1;`, [erste]);
  check("Einreihen: Ziel aus der Registry, Nutzdaten, wartet und ist sofort faellig", rows[0].ziel_system === "ISESF" && rows[0].payload.a === 1 && rows[0].status === "pending" && rows[0].versuche === 0 && rows[0].faellig);
  await mussScheitern("Einreihen: derselbe Schluessel einer Integration auch nicht per direktem Insert (eindeutig)", `insert into public.integration_outbox (integration_id, ziel_system, ereignis, idempotenz_schluessel) values ($1, 'ISESF', 'test', 'k1');`, [esf], "23505");
  await als("admin", async () => {
    await db.query(`update public.integrationen set aktiv = false where id = $1;`, [esf]);
  });
  check("Einreihen: wieder aus, wieder nichts", (await einreihen("test", "k3")).rows[0].id === null);
}

// --- 4. Trigger des ЭСФ-Belegs ------------------------------------------------------------------------------------------------------------------
{
  const zugestellt = async (): Promise<string> => {
    const { rows } = await db.query<{ id: string }>(`insert into public.lieferungen (b2b_kunde_id, menge_kg) values ($1, 100) returning id;`, [t.kundeId]);
    await db.exec("alter table public.lieferungen disable trigger user;");
    await db.query(`update public.lieferungen set status = 'zugestellt'::public.lieferung_status, geliefert_am = now() - interval '2 days' where id = $1;`, [rows[0].id]);
    await db.exec("alter table public.lieferungen enable trigger user;");
    return rows[0].id;
  };
  const beleg = async (): Promise<string> => (await db.query<{ id: string }>(`insert into public.esf_belege (lieferung_id, entwurf) values ($1, '{"version":1}'::jsonb) returning id;`, [await zugestellt()])).rows[0].id;
  const anzahl = async (belegId: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.integration_outbox where idempotenz_schluessel like $1;`, [`esf:${belegId}:%`])).rows[0].n;

  const ohne = await beleg();
  await als("buchhaltung", async () => {
    await db.query(`update public.esf_belege set status = 'ausgestellt', esf_nummer = 'ЭСФ-1', ausgestellt_am = current_date where id = $1;`, [ohne]);
  });
  check("Trigger: ohne aktive Integration entsteht kein Eintrag", (await anzahl(ohne)) === 0);

  await als("admin", async () => {
    await db.query(`update public.integrationen set aktiv = true where id = $1;`, [esf]);
  });
  const mit = await beleg();
  await als("buchhaltung", async () => {
    await db.query(`update public.esf_belege set status = 'ausgestellt', esf_nummer = 'ЭСФ-2', ausgestellt_am = current_date where id = $1;`, [mit]);
  });
  const { rows } = await db.query<{ ereignis: string; idempotenz_schluessel: string; payload: { belegId: string; esfNummer: string; status: string; entwurf: { version: number } }; integration_id: string }>(
    `select ereignis, idempotenz_schluessel, payload, integration_id from public.integration_outbox where idempotenz_schluessel = $1;`, [`esf:${mit}:ausgestellt`]);
  check("Trigger: das Ausstellen reiht ein, mit Ereignis, Schluessel und den Angaben des Belegs", rows.length === 1 && rows[0].ereignis === "esf.beleg_ausgestellt" && rows[0].payload.belegId === mit && rows[0].payload.esfNummer === "ЭСФ-2" && rows[0].payload.status === "ausgestellt" && rows[0].payload.entwurf.version === 1 && rows[0].integration_id === esf, JSON.stringify(rows[0]));
  await als("buchhaltung", async () => {
    await db.query(`update public.esf_belege set bemerkung = 'Anmerkung dazu' where id = $1;`, [mit]);
  });
  check("Trigger: eine Aenderung ohne Statuswechsel reiht nichts ein", (await anzahl(mit)) === 1);
  await als("buchhaltung", async () => {
    await db.query(`update public.esf_belege set status = 'bestaetigt', bestaetigt_am = current_date where id = $1;`, [mit]);
  });
  const { rows: zwei } = await db.query<{ ereignis: string }>(`select ereignis from public.integration_outbox where idempotenz_schluessel like $1 order by ereignis;`, [`esf:${mit}:%`]);
  check("Trigger: das Bestaetigen reiht ein zweites Ereignis ein", zwei.map((z) => z.ereignis).join(",") === "esf.beleg_ausgestellt,esf.beleg_bestaetigt");
  await als("admin", async () => {
    await db.query(`update public.integrationen set aktiv = false where id = $1;`, [esf]);
  });
}

// --- 5. Rechte ---------------------------------------------------------------------------------------------------------------------------------------
for (const rolle of ["admin", "ceo"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`update public.integrationen set adapter = 'webhook', ziel_url = 'https://hooks.example.kz/x', geheimnis_name = 'DAMICON_HOOK_ESF' where key = 'virt_lager' returning id;`);
    check(`Rechte: ${rolle} konfiguriert eine Integration`, rows.length === 1);
  });
}
for (const rolle of ["betriebsleitung", "buchhaltung", "brigade"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`update public.integrationen set ziel_url = 'https://boese.example.com/x' where key = 'gosagro' returning id;`);
    check(`Rechte: ${rolle} konfiguriert nichts (die Zeile bleibt fuer die Aenderung unsichtbar)`, rows.length === 0);
  });
}
{
  const { rows } = await db.query<{ ziel_url: string | null }>(`select ziel_url from public.integrationen where key = 'gosagro';`);
  check("Rechte: die Registry blieb dabei unveraendert", rows[0].ziel_url === null);
}
for (const rolle of ["betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.integrationen;`);
    const { rows: o } = await db.query(`select id from public.integration_outbox;`);
    check(`Rechte: ${rolle} liest Registry und Warteschlange`, rows.length >= 5 && o.length >= 1);
  });
}
for (const rolle of ["kunde", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.integrationen;`);
    const { rows: o } = await db.query(`select id from public.integration_outbox;`);
    check(`Rechte: ${rolle} sieht weder Registry noch Warteschlange`, rows.length === 0 && o.length === 0);
  });
}
// Wiederholen: nur die Administration, und nur Status, Versuche und Fehler, nie die Nutzdaten.
{
  const { rows } = await db.query<{ id: string }>(`insert into public.integration_outbox (integration_id, ziel_system, ereignis, idempotenz_schluessel, status, versuche, letzter_fehler) values ($1, 'ISESF', 'test', 'gescheitert-1', 'failed', 6, 'HTTP 422') returning id;`, [esf]);
  const id = rows[0].id;
  await als("betriebsleitung", async () => {
    const { rows: r } = await db.query(`update public.integration_outbox set status = 'pending', versuche = 0 where id = $1 returning id;`, [id]);
    check("Rechte: die Betriebsleitung wiederholt nichts", r.length === 0);
  });
  await alsScheitert("admin", "Rechte: auch die Administration aendert die Nutzdaten eines Eintrags nicht", `update public.integration_outbox set payload = '{"x":1}'::jsonb where id = $1;`, [id], "42501");
  await alsScheitert("admin", "Rechte: und legt keine Eintraege von Hand an", `insert into public.integration_outbox (integration_id, ziel_system, ereignis, idempotenz_schluessel) values ($1, 'ISESF', 'test', 'von-hand');`, [esf], "42501");
  await als("admin", async () => {
    const { rows: r } = await db.query(`update public.integration_outbox set status = 'pending', versuche = 0, letzter_fehler = null, naechster_versuch_am = now() where id = $1 returning id;`, [id]);
    check("Rechte: die Administration setzt einen gescheiterten Eintrag zurueck", r.length === 1);
  });
}
// Loeschen einer Integration laesst die Eintraege stehen.
{
  const { rows } = await db.query<{ id: string }>(`insert into public.integrationen (key, name, system) values ('wegwerf', 'Wegwerf', 'Test') returning id;`);
  await db.query(`select public.integration_einreihen('wegwerf', 'x', '{}'::jsonb, 'w1');`);
  await db.query(`update public.integrationen set adapter = 'webhook', ziel_url = 'https://hooks.example.kz/w', geheimnis_name = 'DAMICON_HOOK_W', aktiv = true where id = $1;`, [rows[0].id]);
  const { rows: e } = await db.query<{ id: string | null }>(`select public.integration_einreihen('wegwerf', 'x', '{}'::jsonb, 'w1') as id;`);
  await db.query(`delete from public.integrationen where id = $1;`, [rows[0].id]);
  const { rows: rest } = await db.query<{ integration_id: string | null }>(`select integration_id from public.integration_outbox where idempotenz_schluessel = 'w1';`);
  check("Loeschen: der Eintrag bleibt, ohne Integration, und wird dann nicht mehr ausgeliefert", e[0].id !== null && rest.length === 1 && rest[0].integration_id === null);
}

t.ende("Alle Datenbank-Tests der Auslieferung gruen.");
