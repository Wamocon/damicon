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
{
  const { rows } = await schreibe(eigene, "Notiz von admin", "admin");
  check("admin darf schreiben", rows.length === 1);
}
// Entschieden am 15.10.2026: Die Buchhaltung liest (b2b_portal ist ihr in der Matrix nur "sehen"), sie schreibt nicht im Verlauf der Vorbestellungen.
await als("buchhaltung", async () => {
  await mussScheitern("Die Buchhaltung darf keine Nachricht schreiben", `insert into public.vorbestellung_nachrichten (vorbestellung_id, text) values ($1, 'Notiz');`, [eigene]);
});

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

// --- Anzeige im B2B-Portal (Pruefung PR #156, 15.10.2026) ----------------------------------------------------------------------------------
// Der Abschnitt zeigte hoechstens 30 Vorbestellungen ohne Hinweis; fuer aeltere fehlten Verlauf und Schreibformular. Die Reihenfolge stellt laufende
// vor gelieferte vor stornierte, die Liste nennt die Kuerzung.
{
  const { readFileSync } = await import("node:fs");
  const { sortiereFuerNachrichten, NACHRICHTEN_ANZEIGE_GRENZE } = await import("@/lib/domain/nachrichten");
  const v = (id: string, status: string, erstellt: string) => ({ id, status, erstelltAm: erstellt });
  const liste = [v("alt-offen", "angefragt", "2026-01-01"), v("storno", "storniert", "2026-10-10"), v("geliefert", "geliefert", "2026-10-09"), v("neu-offen", "bestaetigt", "2026-10-01"), v("mit-verlauf", "angefragt", "2026-02-01")];
  const nachrichten = { "mit-verlauf": [{ id: "n1", vorbestellungId: "mit-verlauf", autor: "A", rolle: "kunde", text: "x", erstelltAm: "2026-10-12T10:00:00Z" }] };
  const sortiert = sortiereFuerNachrichten(liste, nachrichten);
  check("Anzeige: laufende vor gelieferten vor stornierten, darin zuerst die mit dem juengsten Verlauf, dann die juengsten", sortiert.map((x) => x.id).join() === "mit-verlauf,neu-offen,alt-offen,geliefert,storno", sortiert.map((x) => x.id).join());
  check("Anzeige: hoechstens die Grenze, und die Grenze ist 30", NACHRICHTEN_ANZEIGE_GRENZE === 30 && sortiereFuerNachrichten(liste, nachrichten, 2).length === 2);
  const viele = Array.from({ length: 45 }, (_, i) => v(`v${i}`, i < 40 ? "angefragt" : "storniert", `2026-09-${String(10 + (i % 18)).padStart(2, "0")}`));
  check("Anzeige: bei 45 Vorbestellungen kommen 30 laufende, keine stornierte vor einer laufenden", sortiereFuerNachrichten(viele, {}).length === 30 && sortiereFuerNachrichten(viele, {}).every((x) => x.status === "angefragt"));
  const komponente = readFileSync("src/components/db/vorbestellung-nachrichten.tsx", "utf8");
  check("Anzeige: die Liste nennt die Kuerzung (gezeigt von gesamt)", komponente.includes('t("gekuerzt", { gezeigt: liste.length, gesamt: vorbestellungen.length })') && komponente.includes("liste.length < vorbestellungen.length"));
  const sprachen = ["de", "en", "kk", "ru"].map((l) => JSON.parse(readFileSync(`src/messages/${l}.json`, "utf8")).nachrichten.gekuerzt as string);
  check("Anzeige: der Hinweis steht in vier Sprachen, mit beiden Zahlen", sprachen.every((t) => typeof t === "string" && t.includes("{gezeigt}") && t.includes("{gesamt}")));
}

// --- 6. Anonymisieren (Datenschutz, 15.10.2026) --------------------------------------------------------------------------------------------------
// Nachrichten tragen Klarnamen und sind unveraenderlich. Fuer Datenschutzfaelle gibt es einen Weg: die Administration ersetzt Text und Namen und
// begruendet es. Der Verlauf (wer in welcher Rolle wann etwas schrieb) bleibt.
{
  const { rows: ziel } = await schreibe(eigene, "Bitte meine Telefonnummer 0700 123 loeschen", "kunde");
  const id = ziel[0].id;
  for (const rolle of ["kunde", "betriebsleitung", "buchhaltung", "brigade"]) {
    await als(rolle, async () => {
      await mussScheitern(`${rolle} darf eine Nachricht nicht anonymisieren`, `select public.vorbestellung_nachricht_anonymisieren($1, 'Datenschutz');`, [id], "42501");
    });
  }
  // mussScheitern() setzt die Rolle danach zurueck (alsAdmin): jede Pruefung bekommt deshalb ihren eigenen Rollenwechsel.
  await als("admin", () => mussScheitern("Ohne Grund wird nicht anonymisiert", `select public.vorbestellung_nachricht_anonymisieren($1, '  ');`, [id], "23514"));
  await als("admin", async () => {
    await db.query(`select public.vorbestellung_nachricht_anonymisieren($1, 'Antrag auf Loeschung nach Art. 17 vom 15.10.2026');`, [id]);
    const { rows } = await db.query<{ text: string; autor_name: string; autor_profil_id: string | null; autor_rolle: string; anonymisiert_am: string | null; anonymisiert_von: string | null; anonymisiert_grund: string | null }>(
      `select text, autor_name, autor_profil_id, autor_rolle::text, anonymisiert_am, anonymisiert_von, anonymisiert_grund from public.vorbestellung_nachrichten where id = $1;`,
      [id],
    );
    const z = rows[0];
    check("Anonymisiert: Text und Name sind entfernt, der Autor ist keiner Person mehr zugeordnet", z.text === "[entfernt]" && z.autor_name === "[entfernt]" && z.autor_profil_id === null, JSON.stringify(z));
    check("Anonymisiert: die Rolle bleibt, wer wann warum anonymisiert hat steht an der Zeile", z.autor_rolle === "kunde" && z.anonymisiert_am !== null && z.anonymisiert_von !== null && z.anonymisiert_grund?.startsWith("Antrag") === true, JSON.stringify(z));
  });
  await als("admin", () => mussScheitern("Eine anonymisierte Nachricht wird nicht noch einmal anonymisiert", `select public.vorbestellung_nachricht_anonymisieren($1, 'zweiter Versuch');`, [id], "DA018"));
  await als("admin", () => mussScheitern("Eine unbekannte Nachricht meldet einen Fehler", `select public.vorbestellung_nachricht_anonymisieren(gen_random_uuid(), 'Datenschutz');`, [], "DA018"));
  await mussScheitern("Auch nach der Anonymisierung lassen sich Nachrichten nicht frei aendern", `update public.vorbestellung_nachrichten set text = 'x' where id = $1;`, [id], "DA018");
  await mussScheitern("Nachrichten lassen sich weiterhin nicht loeschen (DA018)", `delete from public.vorbestellung_nachrichten where id = $1;`, [id], "DA018");
  // Die Markierung laesst sich von aussen nicht setzen: ohne die Funktion bleibt jede Aenderung verboten, auch fuer die Administration.
  await als("admin", () => mussScheitern("Ohne die Funktion bleibt auch fuer die Administration jede Aenderung verboten", `update public.vorbestellung_nachrichten set text = 'x' where id = (select id from public.vorbestellung_nachrichten where anonymisiert_am is null limit 1);`, []));
}

t.ende("Alle Nachrichten-Tests gruen.");
