// Übersetzungen der Freitextspalten (Migration 20261211010000), Datenbankseite: die Spalte i18n an 13 Tabellen, ihre Form und Größe, der Trigger, der veraltete
// Übersetzungen entfernt, die Sichten, die sie durchreichen, und die Rechte (wer die Zeile liest, liest ihre Übersetzung). PGlite, kein Docker noetig.
//
// Aufruf: npm run test:i18n-db

import { starte } from "./hilfen/pglite-rollen.mjs";

const t = await starte();
const { db, check, als, mussScheitern } = t;

const TABELLEN = [
  "wirtschaftlichkeit_posten",
  "wirtschaftlichkeit_ist",
  "wirtschaftlichkeit_staende",
  "finance_ledger_entries",
  "reklamationen",
  "reklamation_ereignisse",
  "vorbestellung_nachrichten",
  "preislisten",
  "dokumente",
  "abholrunden",
  "abholstopps",
  "esutd_ereignisse",
  "esutd_vertraege",
];
/** Tabellen, deren Zeilen sich nicht mehr ändern lassen: dort gibt es kein Original, das sich ändern könnte, und keinen Trigger. */
const UNVERAENDERLICH = ["wirtschaftlichkeit_staende", "finance_ledger_entries", "reklamation_ereignisse", "vorbestellung_nachrichten"];

// --- 1. Die Spalte ----------------------------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ table_name: string; data_type: string; is_nullable: string; column_default: string }>(
    `select table_name, data_type, is_nullable, column_default from information_schema.columns where table_schema = 'public' and column_name = 'i18n' and table_name = any($1) order by table_name;`,
    [TABELLEN],
  );
  check(`Spalte: i18n gibt es an allen ${TABELLEN.length} Tabellen`, rows.length === TABELLEN.length, rows.map((r) => r.table_name).join(", "));
  check("Spalte: jsonb, nicht null, Standard ein leeres Objekt", rows.every((r) => r.data_type === "jsonb" && r.is_nullable === "NO" && r.column_default?.startsWith("'{}'")), JSON.stringify(rows[0]));
}

// --- 2. Form und Größe ------------------------------------------------------------------------------------------------------
const posten = (bezeichnung = "Hosting", notiz: string | null = null) =>
  db.query<{ id: string }>(
    `insert into public.wirtschaftlichkeit_posten (art, kategorie, bezeichnung, betrag, notiz) values ('betrieb', 'Hosting', $1, 1000, $2) returning id;`,
    [bezeichnung, notiz],
  );
const lies = async (id: string) => (await db.query<{ i18n: Record<string, Record<string, string>>; bezeichnung: string; notiz: string | null }>(`select i18n, bezeichnung, notiz from public.wirtschaftlichkeit_posten where id = $1;`, [id])).rows[0];

const { rows: erster } = await posten("Hosting und Datenbank", "Notiz");
const id = erster[0].id;
check("Form: eine neue Zeile hat leere Übersetzungen", JSON.stringify((await lies(id)).i18n) === "{}");
await mussScheitern("Form: ein Array ist keine Übersetzung", `update public.wirtschaftlichkeit_posten set i18n = '["x"]'::jsonb where id = $1;`, [id], "23514");
await mussScheitern("Form: ein Text ist keine Übersetzung", `update public.wirtschaftlichkeit_posten set i18n = '"x"'::jsonb where id = $1;`, [id], "23514");
await mussScheitern("Form: null ist keine Übersetzung (nicht null)", `update public.wirtschaftlichkeit_posten set i18n = null where id = $1;`, [id], "23502");
await mussScheitern(
  "Größe: höchstens 20000 Zeichen",
  `update public.wirtschaftlichkeit_posten set i18n = jsonb_build_object('notiz', jsonb_build_object('en', repeat('x', 20001))) where id = $1;`,
  [id],
  "23514",
);
{
  await db.query(`update public.wirtschaftlichkeit_posten set i18n = jsonb_build_object('notiz', jsonb_build_object('en', repeat('x', 19000))) where id = $1;`, [id]);
  check("Größe: 19000 Zeichen gehen durch", ((await lies(id)).i18n.notiz?.en ?? "").length === 19000);
  await db.query(`update public.wirtschaftlichkeit_posten set i18n = '{}'::jsonb where id = $1;`, [id]);
}

// --- 3. Der Trigger nimmt veraltete Übersetzungen zurück ----------------------------------------------------------------------
{
  const setze = (json: string) => db.query(`update public.wirtschaftlichkeit_posten set i18n = $2::jsonb where id = $1;`, [id, json]);
  const beide = `{"bezeichnung": {"en": "Hosting and database"}, "notiz": {"en": "Note"}}`;

  await setze(beide);
  await db.query(`update public.wirtschaftlichkeit_posten set betrag = 2000 where id = $1;`, [id]);
  check("Trigger: eine andere Spalte zu ändern lässt die Übersetzungen stehen", Object.keys((await lies(id)).i18n).sort().join() === "bezeichnung,notiz");

  await db.query(`update public.wirtschaftlichkeit_posten set bezeichnung = bezeichnung where id = $1;`, [id]);
  check("Trigger: derselbe Text lässt die Übersetzungen stehen", Object.keys((await lies(id)).i18n).sort().join() === "bezeichnung,notiz");

  await db.query(`update public.wirtschaftlichkeit_posten set bezeichnung = 'Hosting neu' where id = $1;`, [id]);
  const nach = await lies(id);
  check("Trigger: ein geänderter Text nimmt nur seine eigene Übersetzung zurück", Object.keys(nach.i18n).join() === "notiz" && nach.bezeichnung === "Hosting neu", JSON.stringify(nach));

  await setze(beide);
  await db.query(`update public.wirtschaftlichkeit_posten set notiz = null where id = $1;`, [id]);
  check("Trigger: auch das Leeren eines Textes nimmt die Übersetzung zurück", Object.keys((await lies(id)).i18n).join() === "bezeichnung");

  await setze(beide);
  await db.query(`update public.wirtschaftlichkeit_posten set bezeichnung = 'Anders', i18n = '{"bezeichnung": {"en": "Different"}}'::jsonb where id = $1;`, [id]);
  check("Trigger: wer Text und Übersetzungen zusammen setzt, verantwortet sie selbst", (await lies(id)).i18n.bezeichnung?.en === "Different");

  const { rows: wirkung } = await db.query<{ tabelle: string; args: string }>(
    `select c.relname as tabelle, encode(t.tgargs, 'escape') as args
       from pg_trigger t join pg_class c on c.oid = t.tgrelid
      where t.tgname = 'trg_i18n_veraltet' and not t.tgisinternal order by 1;`,
  );
  const mitTrigger = wirkung.map((w) => w.tabelle).sort();
  const soll = TABELLEN.filter((x) => !UNVERAENDERLICH.includes(x)).sort();
  check("Trigger: an jeder Tabelle mit änderbaren Zeilen, an keiner mit unveränderlichen", JSON.stringify(mitTrigger) === JSON.stringify(soll), mitTrigger.join(", "));
  check(
    "Trigger: die Argumente nennen genau die übersetzbaren Spalten",
    wirkung.find((w) => w.tabelle === "wirtschaftlichkeit_posten")?.args.split("\\000").filter(Boolean).join(",") === "kategorie,bezeichnung,notiz" &&
      wirkung.find((w) => w.tabelle === "dokumente")?.args.split("\\000").filter(Boolean).join(",") === "name,bezug,rechtsgrundlage",
    JSON.stringify(wirkung.slice(0, 2)),
  );
}

// --- 4. Jede übersetzbare Spalte gibt es -----------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ tabelle: string; args: string }>(
    `select c.relname as tabelle, encode(t.tgargs, 'escape') as args from pg_trigger t join pg_class c on c.oid = t.tgrelid where t.tgname = 'trg_i18n_veraltet' and not t.tgisinternal;`,
  );
  let fehlt = "";
  for (const r of rows) {
    for (const spalte of r.args.split("\\000").filter(Boolean)) {
      const { rows: da } = await db.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = $2;`, [r.tabelle, spalte]);
      if (da.length === 0) fehlt += `${r.tabelle}.${spalte} `;
    }
  }
  check("Trigger: jede genannte Spalte gibt es (ein Tippfehler im Argument bliebe sonst still wirkungslos)", fehlt === "", fehlt);
}

// --- 5. Die Sichten reichen die Spalte durch --------------------------------------------------------------------------------------
{
  const { rows } = await db.query<{ view: string }>(
    `select table_name as view from information_schema.columns where table_schema = 'public' and column_name = 'i18n' and table_name in ('v_dokumente', 'v_esutd_meldungen') order by 1;`,
  );
  check("Sichten: v_dokumente und v_esutd_meldungen tragen i18n", rows.map((r) => r.view).join() === "v_dokumente,v_esutd_meldungen", JSON.stringify(rows));
  const { rows: optionen } = await db.query<{ relname: string; reloptions: string[] }>(`select relname, reloptions from pg_class where relname in ('v_dokumente', 'v_esutd_meldungen') order by 1;`);
  check("Sichten: security_invoker gilt weiter (die Zeilensicherheit der Tabellen)", optionen.every((o) => (o.reloptions ?? []).includes("security_invoker=true")), JSON.stringify(optionen));
}

// --- 6. Rechte: wer die Zeile liest, liest ihre Übersetzung --------------------------------------------------------------------------
{
  await db.query(`update public.wirtschaftlichkeit_posten set i18n = '{"bezeichnung": {"en": "Hosting"}}'::jsonb where id = $1;`, [id]);
  for (const rolle of ["admin", "buchhaltung", "betriebsleitung"]) {
    await als(rolle, async () => {
      const { rows } = await db.query<{ i18n: unknown }>(`select i18n from public.wirtschaftlichkeit_posten where id = $1;`, [id]);
      check(`Rechte: ${rolle} liest die Übersetzung mit der Zeile`, rows.length === 1 && JSON.stringify(rows[0].i18n).includes("Hosting"));
    });
  }
  for (const rolle of ["brigade", "kunde", "picker"]) {
    await als(rolle, async () => {
      const { rows } = await db.query(`select i18n from public.wirtschaftlichkeit_posten where id = $1;`, [id]);
      check(`Rechte: ${rolle} sieht weder die Zeile noch ihre Übersetzung`, rows.length === 0);
    });
  }
  await als("betriebsleitung", async () => {
    const { rows } = await db.query(`update public.wirtschaftlichkeit_posten set i18n = '{}'::jsonb where id = $1 returning id;`, [id]);
    check("Rechte: wer die Zeile nicht ändern darf, ändert auch ihre Übersetzung nicht", rows.length === 0);
  });
  await als("buchhaltung", async () => {
    await db.query(`update public.wirtschaftlichkeit_posten set i18n = '{}'::jsonb where id = $1;`, [id]);
    check("Rechte: wer die Zeile ändern darf, ändert auch ihre Übersetzung", Object.keys((await lies(id)).i18n).length === 0);
  });
}

t.ende("Alle Datenbank-Tests der Übersetzungsspalten gruen.");
