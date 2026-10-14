// Nachrichten je Vorbestellung (WMCNL-1472): Autor aus der Anmeldung, Sichtbarkeit nach der
// Vorbestellung, Unveraenderlichkeit, Storno. PGlite, kein Docker noetig.
//
// Aufruf: npm run test:vorbestellung-nachrichten

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, alsAdmin, mussScheitern } = t;

// Zwei Kunden mit je einer Vorbestellung; "kunde" gehoert zum ersten.
const { rows: kunden } = await db.query<{ id: string }>(`select id from public.b2b_kunden order by name limit 2;`);
const eigenerKunde = t.kundeId;
const fremderKunde = kunden.find((k) => k.id !== eigenerKunde)?.id;
check("Vorbereitung: ein fremder B2B-Kunde ist vorhanden", !!fremderKunde);
const { rows: sorten } = await db.query<{ id: string }>(`select id from public.sorten limit 1;`);

async function vorbestellung(kunde: string, status = "angefragt"): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into public.vorbestellungen (b2b_kunde_id, sorte_id, menge_kg, liefertermin, status)
     values ($1, $2, 100, public.heute_almaty() + 3, $3::public.vorbestellung_status) returning id;`,
    [kunde, sorten[0].id, status],
  );
  return rows[0].id;
}
const eigene = await vorbestellung(eigenerKunde);
const fremde = await vorbestellung(fremderKunde!);
const storniert = await vorbestellung(eigenerKunde, "storniert");

const schreibe = (vb: string, text: string, rolle: string) =>
  als(rolle, () =>
    db.query<{ id: string; autor_name: string; autor_rolle: string; text: string }>(
      `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, $2) returning id, autor_name, autor_rolle, text;`,
      [vb, text],
    ),
  );

// --- 1. Schreiben: Autor kommt aus der Anmeldung ------------------------------------------------------
{
  const { rows } = await schreibe(eigene, "  Koennt ihr einen Tag frueher liefern?  ", "kunde");
  check("Der Kunde schreibt zu seiner eigenen Vorbestellung", rows.length === 1);
  check("Autor und Rolle setzt die Datenbank aus der Anmeldung", rows[0].autor_rolle === "kunde" && rows[0].autor_name.length > 0, `${rows[0].autor_name} / ${rows[0].autor_rolle}`);
  check("Der Text wird von Leerraum an den Enden befreit", rows[0].text === "Koennt ihr einen Tag frueher liefern?", rows[0].text);
}
{
  const { rows } = await schreibe(eigene, "Ja, Donnerstag passt.", "betriebsleitung");
  check("Die Betriebsleitung antwortet", rows.length === 1 && rows[0].autor_rolle === "betriebsleitung");
}
for (const rolle of ["admin", "buchhaltung"]) {
  const { rows } = await schreibe(eigene, `Notiz von ${rolle}`, rolle);
  check(`${rolle} darf schreiben`, rows.length === 1);
}

// Ein mitgeschickter Autor wird ueberschrieben: niemand schreibt im Namen eines anderen.
await als("kunde", async () => {
  const { rows } = await db.query<{ autor_name: string; autor_rolle: string }>(
    `insert into public.vorbestellung_nachrichten (vorbestellung_id, text, autor_name, autor_rolle, autor_profil_id)
     values ($1, 'Fremder Absender?', 'Geschaeftsfuehrung', 'admin', (select id from public.profiles where role = 'admin' limit 1))
     returning autor_name, autor_rolle;`,
    [eigene],
  ).catch((e: { code?: string }) => ({ rows: [] as { autor_name: string; autor_rolle: string }[], fehler: e.code }));
  // Entweder wird der Autor ueberschrieben (Zeile mit Kunde als Autor) oder die Policy lehnt ab. Beides schuetzt.
  const ueberschrieben = rows.length === 1 && rows[0].autor_rolle === "kunde" && rows[0].autor_name !== "Geschaeftsfuehrung";
  check("Ein vorgegebener fremder Autor wird ueberschrieben oder abgelehnt", ueberschrieben || rows.length === 0);
});

// --- 2. Schreiben: Grenzen ----------------------------------------------------------------------------------------
await als("kunde", async () => {
  await mussScheitern("Der Kunde schreibt nicht zu einer fremden Vorbestellung", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, 'Hallo');`, [fremde]);
});
for (const rolle of ["brigade", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    await mussScheitern(`${rolle} darf nicht schreiben`, `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, 'Hallo');`, [eigene]);
  });
}
await als("kunde", async () => {
  await mussScheitern("Leerer Text wird abgelehnt", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, '   ');`, [eigene], "23514");
});
await als("kunde", async () => {
  await mussScheitern("Mehr als 2000 Zeichen werden abgelehnt", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, repeat('x', 2001));`, [eigene], "23514");
});
await als("kunde", async () => {
  const { rows } = await db.query(`insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, repeat('x', 2000)) returning id;`, [eigene]);
  check("Genau 2000 Zeichen sind erlaubt", rows.length === 1);
});
await als("kunde", async () => {
  await mussScheitern("Zu einer stornierten Vorbestellung gibt es keine neuen Nachrichten (DA012)", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, 'Doch noch eine Frage');`, [storniert], "DA012");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Auch das Buero schreibt nicht zu einer stornierten Vorbestellung", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, 'Rueckfrage');`, [storniert], "DA012");
});
await als("betriebsleitung", async () => {
  await mussScheitern("Eine unbekannte Vorbestellung wird abgelehnt", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ('00000000-0000-4000-8000-000000000000', 'x');`, [], "23503");
});

// --- 3. Lesen ------------------------------------------------------------------------------------------------------------------
await schreibe(fremde, "Nachricht im Verlauf des anderen Kunden", "betriebsleitung");
await als("kunde", async () => {
  const { rows } = await db.query<{ vorbestellung_id: string }>(`select vorbestellung_id from public.vorbestellung_nachrichten;`);
  check("Der Kunde sieht nur den Verlauf seiner eigenen Vorbestellungen", rows.length > 0 && rows.every((r) => r.vorbestellung_id === eigene), `Zeilen: ${rows.length}`);
});
for (const rolle of ["admin", "betriebsleitung", "buchhaltung"]) {
  await als(rolle, async () => {
    const { rows } = await db.query<{ vorbestellung_id: string }>(`select distinct vorbestellung_id from public.vorbestellung_nachrichten;`);
    check(`${rolle} sieht die Verlaeufe aller Vorbestellungen`, rows.length >= 2, `Vorbestellungen: ${rows.length}`);
  });
}
for (const rolle of ["brigade", "picker", "erzeuger"]) {
  await als(rolle, async () => {
    const { rows } = await db.query(`select id from public.vorbestellung_nachrichten;`);
    check(`${rolle} sieht keine Nachrichten`, rows.length === 0, `Zeilen: ${rows.length}`);
  });
}
await t.alsRolle("anon");
await mussScheitern("anon darf nichts lesen", `select * from public.vorbestellung_nachrichten;`, [], "42501");

// --- 4. Unveraenderlich --------------------------------------------------------------------------------------------------------------
await als("kunde", async () => {
  await mussScheitern("Der Absender kann seine Nachricht nicht aendern", `update public.vorbestellung_nachrichten set text = 'anders' where vorbestellung_id = $1;`, [eigene]);
});
await als("admin", async () => {
  await mussScheitern("Auch die Administration kann keine Nachricht aendern", `update public.vorbestellung_nachrichten set text = 'anders' where vorbestellung_id = $1;`, [eigene]);
});
await alsAdmin();
await mussScheitern("Auch ohne Rollenbeschraenkung ist die Tabelle unveraenderlich (Update)", `update public.vorbestellung_nachrichten set text = 'anders';`, []);
await mussScheitern("... und Nachrichten lassen sich nicht loeschen", `delete from public.vorbestellung_nachrichten;`, []);
await mussScheitern("Eine Vorbestellung mit Verlauf laesst sich nicht loeschen", `delete from public.vorbestellungen where id = $1;`, [eigene]);

// --- 5. Reihenfolge ------------------------------------------------------------------------------------------------------------------------
await als("betriebsleitung", async () => {
  const { rows } = await db.query<{ text: string }>(`select text from public.vorbestellung_nachrichten where vorbestellung_id = $1 order by created_at, id limit 2;`, [eigene]);
  check("Der Verlauf beginnt mit der ersten Nachricht", rows.length === 2 && rows[0].text.startsWith("Koennt ihr"), rows.map((r) => r.text.slice(0, 20)).join(" | "));
});

t.ende("Alle Nachrichten-Tests gruen.");
