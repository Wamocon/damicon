// Wendet die Migrationen auf das Schema public_preview an (umgeschrieben mit
// scripts/preview-umschreiben.mjs). Laeuft im Workflow "Datenbank-Migration Preview" bei jedem
// Push in einen Pull Request, und in der PR-Pipeline gegen die lokale Datenbank.
//
// Preview laeuft public voraus: public wird erst nach dem Merge migriert (datenbank-migration.yml).
// Weil sich alle offenen Pull Requests ein public_preview teilen, gilt:
//   - Verlauf mit Pruefsumme in supabase_migrations.preview_schema_migrations
//   - wird eine schon angewendete Migrationsdatei spaeter geaendert, bricht der Lauf ab
//     (public_preview enthaelt sonst unbemerkt den alten Stand)
//   - Migrationen, die nur ein anderer Pull Request mitgebracht hat, werden gemeldet
//
// Aufruf (Ziel: --linked | --local | --db-url <url>):
//   node scripts/preview-migrationen.mjs pruefen
//       alle Migrationen umschreiben, ohne Datenbank; Fehler, wenn eine sich nicht umschreiben laesst
//   node scripts/preview-migrationen.mjs einrichten --local
//       leere Datenbank: Schema public_preview mit Rechten wie public und leerem Verlauf anlegen
//   node scripts/preview-migrationen.mjs einrichten --linked --klon [--probelauf]
//       public_preview wurde aus public kopiert: Verlauf mit dem Stand von public fuellen und die
//       gemeinsamen Objekte (Auth-Trigger, Buckets, Storage-Policies, Cron) einmalig anlegen
//   node scripts/preview-migrationen.mjs anwenden --linked [--nur-anzeigen]
//       offene Migrationen der Reihe nach anwenden, jede in einer eigenen Transaktion
//   node scripts/preview-migrationen.mjs neu-aufbauen --linked [--ausfuehren]
//       public_preview verwerfen und aus public neu aufbauen, etwa nach geschlossenen Pull Requests
//       (deren Migrationen und Zwillinge sonst dauerhaft bleiben) oder nach einer geaenderten, schon
//       angewendeten Migration. Ohne --ausfuehren nur der Plan. Loescht alle Preview-Daten.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { abfrage, zielAus } from "./preview-cli.mjs";
import { bucketsAus, PREVIEW_ENDUNG, PREVIEW_SCHEMA, triggerFunktionenAus, umschreiben } from "./preview-umschreiben.mjs";

const ORDNER = "supabase/migrations";
const VERLAUF = "supabase_migrations.preview_schema_migrations";
const NAME = /^(\d{14})_([a-z0-9_]+)\.sql$/;
const PROBELAUF_MARKE = "preview-probelauf-ok";
const NEU_AUFBAUEN = "node scripts/preview-migrationen.mjs neu-aufbauen --linked (HOWTO.md, Abschnitt Preview-Schema)";

const q = (wert) => `'${String(wert).replace(/'/g, "''")}'`;
const imCi = Boolean(process.env.GITHUB_ACTIONS);
const warnung = (text) => console.log(imCi ? `::warning::${text}` : `WARNUNG: ${text}`);

/** Pruefsumme der Migrationsdatei, unabhaengig von CRLF/LF. */
export function pruefsumme(inhalt) {
  return createHash("sha256").update(inhalt.replace(/\r\n/g, "\n")).digest("hex");
}

/**
 * @param {{ version: string, datei: string, pruefsumme: string }[]} dateien Migrationen im Branch
 * @param {{ version: string, pruefsumme: string | null }[]} angewendet Verlauf von public_preview
 */
export function planen(dateien, angewendet) {
  const bekannt = new Map(angewendet.map((a) => [a.version, a.pruefsumme]));
  const imBranch = new Set(dateien.map((d) => d.version));
  const neuesteAngewendet = angewendet.map((a) => a.version).sort().at(-1) ?? "0";
  const nichtAngewendet = dateien.filter((d) => !bekannt.has(d.version)).sort((a, b) => a.version.localeCompare(b.version));
  // Eine fremde Zeile mit gleicher Pruefsumme ist dieselbe Migration unter neuer Versionsnummer
  // (z. B. nach "Version erhoehen" wegen eines anderen Merges): nur den Verlauf umschreiben.
  const fremdeZeilen = angewendet.filter((a) => !imBranch.has(a.version));
  const umbenannt = [];
  const vergeben = new Set();
  for (const d of nichtAngewendet) {
    const alt = fremdeZeilen.find((f) => f.pruefsumme && f.pruefsumme === d.pruefsumme && !vergeben.has(f.version));
    if (alt) {
      umbenannt.push({ ...d, alteVersion: alt.version });
      vergeben.add(alt.version);
    }
  }
  const offen = nichtAngewendet.filter((d) => !umbenannt.some((u) => u.version === d.version));
  return {
    offen,
    umbenannt,
    geaendert: dateien.filter((d) => bekannt.has(d.version) && bekannt.get(d.version) && bekannt.get(d.version) !== d.pruefsumme),
    ohneSumme: dateien.filter((d) => bekannt.has(d.version) && !bekannt.get(d.version)),
    fremd: fremdeZeilen.map((a) => a.version).filter((v) => !vergeben.has(v)).sort(),
    ausserReihe: offen.filter((d) => d.version < neuesteAngewendet),
  };
}

function migrationen() {
  const dateien = readdirSync(ORDNER).filter((f) => NAME.test(f)).sort();
  const inhalte = Object.fromEntries(dateien.map((d) => [d, readFileSync(join(ORDNER, d), "utf8")]));
  const buckets = bucketsAus(Object.values(inhalte));
  const triggerFunktionen = triggerFunktionenAus(Object.values(inhalte));
  return dateien.map((d) => {
    const [, version, name] = NAME.exec(d);
    return { datei: d, version, name, pruefsumme: pruefsumme(inhalte[d]), ...umschreiben(inhalte[d], { buckets, triggerFunktionen }) };
  });
}

function pruefen(liste) {
  const kaputt = liste.filter((m) => m.fehler.length > 0);
  for (const m of kaputt) {
    console.error(`${m.datei}: laesst sich nicht fuer ${PREVIEW_SCHEMA} umschreiben`);
    for (const f of m.fehler) console.error(`  - ${f}`);
  }
  if (kaputt.length > 0) {
    throw new Error(
      "Entweder die Anweisung so schreiben, dass sie nur public betrifft, oder den Abschnitt fuer Preview " +
        "bewusst auslassen:\n  -- preview:auslassen\n  ...\n  -- preview:ende",
    );
  }
}

/**
 * Fuehrt mehrere Anweisungen als eine Transaktion aus. "supabase db query --local" nimmt nur eine
 * Anweisung an, deshalb laeuft das Skript per EXECUTE in einem DO-Block; ein Fehler rollt alles zurueck.
 */
function skript(ziel, text, { probelauf = false, nurWennOffen = null } = {}) {
  if (/\$pv_(?:aussen|skript)\$/.test(text)) throw new Error("Migration enthaelt die reservierte Marke $pv_aussen$ oder $pv_skript$.");
  const ende = probelauf ? `raise exception '${PROBELAUF_MARKE}';` : "";
  // Sperre gegen parallele Laeufe (mehrere Pull Requests teilen public_preview); wer wartet,
  // ueberspringt danach eine Migration, die der andere Lauf inzwischen angewendet hat.
  const pruefung = nurWennOffen
    ? `if to_regclass('${VERLAUF}') is not null and exists (select 1 from ${VERLAUF} where version = ${q(nurWennOffen)}) then return; end if;`
    : "";
  try {
    abfrage(ziel, `do $pv_aussen$ begin perform pg_advisory_xact_lock(hashtext('public_preview_migrationen')); ${pruefung} execute $pv_skript$\n${text}\n$pv_skript$; ${ende} end $pv_aussen$;`, { leerErlaubt: true });
  } catch (e) {
    if (probelauf && e.message.includes(PROBELAUF_MARKE)) return;
    throw e;
  }
}

const VERLAUF_TABELLE = `create table ${VERLAUF} (
  version text primary key,
  name text not null,
  pruefsumme text,
  angewendet_am timestamptz not null default now()
);`;

const EINRICHTEN_LEER = `
create schema ${PREVIEW_SCHEMA};
comment on schema ${PREVIEW_SCHEMA} is 'Kopie von public für Preview-Umgebungen';
grant usage on schema ${PREVIEW_SCHEMA} to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema ${PREVIEW_SCHEMA} grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema ${PREVIEW_SCHEMA} grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema ${PREVIEW_SCHEMA} grant all on functions to postgres, anon, authenticated, service_role;
create schema if not exists supabase_migrations;
${VERLAUF_TABELLE}`;

function stand(ziel) {
  const [z] = abfrage(ziel, `select to_regnamespace('${PREVIEW_SCHEMA}') is not null as schema_da,
    to_regclass('${VERLAUF}') is not null as verlauf_da,
    to_regclass('supabase_migrations.schema_migrations') is not null as production_da`);
  if (!z) throw new Error("Keine Antwort von der Datenbank auf die Standabfrage.");
  return z;
}

function einrichten(ziel, liste, { klon, probelauf }) {
  const s = stand(ziel);
  if (s.schema_da && s.verlauf_da) {
    console.log(`${PREVIEW_SCHEMA} ist bereits eingerichtet.`);
    return;
  }
  if (!s.schema_da) {
    if (klon) throw new Error(`--klon, aber ${PREVIEW_SCHEMA} existiert nicht.`);
    skript(ziel, EINRICHTEN_LEER);
    console.log(`${PREVIEW_SCHEMA} mit leerem Verlauf angelegt. Weiter mit: anwenden`);
    return;
  }
  if (!klon) {
    throw new Error(
      `${PREVIEW_SCHEMA} existiert ohne Verlauf. Wurde es aus public kopiert, mit --klon einrichten: ` +
        "dann gilt jede in public angewendete Migration auch in Preview als angewendet.",
    );
  }
  if (!s.production_da) throw new Error("supabase_migrations.schema_migrations fehlt, der Stand von public ist unbekannt.");
  const production = abfrage(ziel, "select version from supabase_migrations.schema_migrations order by version");
  const lokal = new Map(liste.map((m) => [m.version, m]));
  const fehlend = production.filter((p) => !lokal.has(p.version));
  if (fehlend.length > 0) {
    throw new Error(`In public angewendet, aber hier ohne Datei: ${fehlend.map((p) => p.version).join(", ")}. Erst den Branch aktualisieren.`);
  }
  const uebernommen = production.map((p) => lokal.get(p.version));
  const gemeinsam = uebernommen.flatMap((m) => m.gemeinsam.map((a) => `-- ${m.datei}\n${a.trim()}`));
  console.log(`Verlauf: ${uebernommen.length} Migrationen gelten als angewendet (Stand von public).`);
  console.log(`Gemeinsame Objekte fuer Preview (${gemeinsam.length} Anweisungen):`);
  for (const a of gemeinsam) console.log(`  ${a.replace(/--[^\n]*\n/g, "").replace(/\s+/g, " ").slice(0, 110)}`);

  const text = [
    "create schema if not exists supabase_migrations;",
    VERLAUF_TABELLE,
    `insert into ${VERLAUF} (version, name, pruefsumme) values ${uebernommen.map((m) => `(${q(m.version)}, ${q(m.name)}, ${q(m.pruefsumme)})`).join(", ")};`,
    `set local search_path = ${PREVIEW_SCHEMA}, extensions;`,
    ...gemeinsam.map((a) => (a.endsWith(";") ? a : `${a};`)),
  ].join("\n");
  skript(ziel, text, { probelauf });
  console.log(probelauf ? "PROBELAUF: alles zurueckgerollt." : `${PREVIEW_SCHEMA} eingerichtet.`);
}

function anwenden(ziel, liste, { nurAnzeigen }) {
  const s = stand(ziel);
  if (!s.schema_da || !s.verlauf_da) throw new Error(`${PREVIEW_SCHEMA} ist nicht eingerichtet (Befehl: einrichten).`);
  // to_jsonb: liest die Pruefsumme auch aus einem Verlauf, der die Spalte noch nicht hat
  const angewendet = abfrage(ziel, `select version, to_jsonb(v) ->> 'pruefsumme' as pruefsumme from ${VERLAUF} v`);
  const plan = planen(liste, angewendet);

  if (plan.geaendert.length > 0) {
    throw new Error(
      `Diese Migrationen wurden geaendert, nachdem sie schon in ${PREVIEW_SCHEMA} angewendet waren:\n` +
        plan.geaendert.map((m) => `  - ${m.datei}`).join("\n") +
        `\n${PREVIEW_SCHEMA} enthaelt den alten Stand. Die Aenderung als neue Migration schreiben ` +
        `(neue Versionsnummer) oder ${PREVIEW_SCHEMA} neu aus public aufbauen: ${NEU_AUFBAUEN}`,
    );
  }
  if (plan.fremd.length > 0) {
    warnung(
      `${PREVIEW_SCHEMA} enthaelt Migrationen, die in diesem Stand fehlen (andere Pull Requests oder geloeschte Dateien): ${plan.fremd.join(", ")}. ` +
        `Stammen sie aus geschlossenen Pull Requests, bleiben sie samt Zwillingen, bis jemand ${PREVIEW_SCHEMA} neu aufbaut: ${NEU_AUFBAUEN}`,
    );
  }
  for (const m of plan.ausserReihe) {
    warnung(`${m.datei} ist aelter als die neueste Migration in ${PREVIEW_SCHEMA} und laeuft dort ausser der Reihe.`);
  }
  if (plan.offen.length === 0) {
    console.log(`${PREVIEW_SCHEMA}: nichts offen (${angewendet.length} angewendet).`);
  } else {
    console.log(`${PREVIEW_SCHEMA}: ${plan.offen.length} offene Migration(en) ${nurAnzeigen ? "wuerden angewendet" : "werden angewendet"}.`);
  }
  for (const m of plan.umbenannt) console.log(`  umbenannt: ${m.alteVersion} -> ${m.datei} (gleicher Inhalt, wird nicht erneut ausgefuehrt)`);
  if (nurAnzeigen) {
    for (const m of plan.offen) console.log(`  ${m.datei}`);
    return;
  }
  if (plan.umbenannt.length > 0) {
    skript(ziel, plan.umbenannt
      .map((m) => `update ${VERLAUF} set version = ${q(m.version)}, name = ${q(m.name)} where version = ${q(m.alteVersion)};`)
      .join("\n"));
  }

  if (plan.ohneSumme.length > 0) {
    skript(ziel, [
      `alter table ${VERLAUF} add column if not exists pruefsumme text;`,
      ...plan.ohneSumme.map((m) => `update ${VERLAUF} set pruefsumme = ${q(m.pruefsumme)} where version = ${q(m.version)} and pruefsumme is null;`),
    ].join("\n"));
    console.log(`Pruefsumme fuer ${plan.ohneSumme.length} bereits angewendete Migrationen nachgetragen.`);
  }
  for (const m of plan.offen) {
    const text = [
      `set local search_path = ${PREVIEW_SCHEMA}, extensions;`,
      // laedt pgvector, damit Funktionen "set hnsw.* = ..." setzen duerfen
      "do $pv$ begin if to_regtype('extensions.vector') is not null then perform '[1]'::extensions.vector; end if; end $pv$;",
      m.sql,
      ";",
      `insert into ${VERLAUF} (version, name, pruefsumme) values (${q(m.version)}, ${q(m.name)}, ${q(m.pruefsumme)});`,
    ].join("\n");
    try {
      skript(ziel, text, { nurWennOffen: m.version });
    } catch (e) {
      throw new Error(`${m.datei} scheiterte in ${PREVIEW_SCHEMA} (zurueckgerollt):\n${e.message}`);
    }
    console.log(`  angewendet: ${m.datei}`);
  }
}

// ---- Neuaufbau (Fund 68, 28.09.2026) ----------------------------------------------------------
// Ein geschlossener Pull Request hinterliess seine Migrationen in public_preview und seine Zwillinge
// auf auth, storage und pg_cron, dauerhaft; die Fehlermeldung empfahl "neu aus public aufbauen", ohne
// dass es dafuer ein Werkzeug gab. Der Neuaufbau nutzt dieselben Bausteine wie die PR-Pipeline
// (leeres Schema, alle in public angewendeten Migrationen umgeschrieben) und kopiert danach die Daten.

/**
 * @param {{ version: string }[]} liste Migrationen im Branch
 * @param {string[]} productionVersionen Verlauf von public
 * @param {string[]} previewVersionen Verlauf von public_preview (leer, wenn es keinen gibt)
 * @returns {{ migrationen: object[], verworfen: string[] }} migrationen: in public angewendet, in
 *   Reihenfolge; verworfen: nur in public_preview (offene oder geschlossene Pull Requests)
 */
export function neuAufbauPlan(liste, productionVersionen, previewVersionen) {
  const lokal = new Map(liste.map((m) => [m.version, m]));
  const fehlend = productionVersionen.filter((v) => !lokal.has(v));
  if (fehlend.length > 0) {
    throw new Error(`In public angewendet, aber hier ohne Datei: ${fehlend.join(", ")}. Erst den Branch aktualisieren.`);
  }
  const production = new Set(productionVersionen);
  return {
    migrationen: [...production].sort().map((v) => lokal.get(v)),
    verworfen: previewVersionen.filter((v) => !production.has(v)).sort(),
  };
}

/**
 * Entfernt public_preview, seinen Verlauf und die Preview-Zwillinge auf gemeinsamen Objekten
 * (Trigger und Policies mit Endung _preview auf auth und storage, Cron-Jobs mit Endung -preview).
 * Haengt danach noch ein Objekt ausserhalb von public_preview an public_preview, bricht alles ab,
 * statt es per cascade still mitzuloeschen. Buckets mit Endung -preview bleiben samt Dateien stehen.
 */
export function abbauSql() {
  const s = PREVIEW_SCHEMA;
  return `do $pv_abbau$
declare
  z record;
  fremd text;
begin
  for z in
    select t.tgname, t.tgrelid::regclass::text as tabelle
    from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('auth', 'storage') and not t.tgisinternal and t.tgname like '%\\_preview'
  loop
    execute format('drop trigger %I on %s', z.tgname, z.tabelle);
  end loop;
  for z in
    select policyname, schemaname, tablename from pg_policies
    where schemaname in ('auth', 'storage') and policyname like '%\\_preview'
  loop
    execute format('drop policy %I on %I.%I', z.policyname, z.schemaname, z.tablename);
  end loop;
  if to_regclass('cron.job') is not null then
    perform cron.unschedule(jobname) from cron.job where jobname like ${q(`%${PREVIEW_ENDUNG}`)};
  end if;
  if to_regnamespace(${q(s)}) is not null then
    select string_agg(distinct o.type || ' ' || o.identity, ', ') into fremd
    from pg_depend d
    cross join lateral pg_identify_object(d.classid, d.objid, d.objsubid) o
    cross join lateral pg_identify_object(d.refclassid, d.refobjid, 0) r
    where d.deptype = 'n' and r.schema = ${q(s)}
      and coalesce(o.schema, substring(o.identity from '(?:^| )(?:on|for) "?([^".]+)')) is distinct from ${q(s)};
    if fremd is not null then
      raise exception 'Neuaufbau abgebrochen: diese Objekte ausserhalb von ${s} haengen daran: %', fremd;
    end if;
    execute 'drop schema ${s} cascade';
  end if;
  execute 'drop table if exists ${VERLAUF}';
end $pv_abbau$;`;
}

/**
 * Kopiert alle Tabellen von `von` nach `nach` (gleiche Struktur vorausgesetzt): erst alle leeren, dann
 * fuellen, ohne Trigger (Unveraenderlichkeit, Protokoll, Fremdschluessel) und mit row_security off,
 * das bei einer Rolle ohne RLS-Ausnahme abbricht, statt still weniger Zeilen zu kopieren. Danach
 * Sequenzen wie in `von` und materialisierte Sichten neu berechnen.
 */
export function datenKopierenSql(von = "public", nach = PREVIEW_SCHEMA) {
  return `do $pv_kopie$
declare
  z record;
  spalten text;
begin
  perform set_config('session_replication_role', 'replica', true);
  perform set_config('row_security', 'off', true);
  for z in
    select c.relname from pg_class c
    where c.relnamespace = ${q(nach)}::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
      and to_regclass(format('%I.%I', ${q(von)}, c.relname)) is not null
  loop
    execute format('truncate table %I.%I cascade', ${q(nach)}, z.relname);
  end loop;
  for z in
    select c.relname from pg_class c
    where c.relnamespace = ${q(nach)}::regnamespace and c.relkind in ('r', 'p') and not c.relispartition
      and to_regclass(format('%I.%I', ${q(von)}, c.relname)) is not null
  loop
    select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into spalten
    from pg_attribute a
    where a.attrelid = format('%I.%I', ${q(nach)}, z.relname)::regclass
      and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
      and exists (
        select 1 from pg_attribute b
        where b.attrelid = format('%I.%I', ${q(von)}, z.relname)::regclass
          and b.attname = a.attname and not b.attisdropped and b.attgenerated = ''
      );
    if spalten is not null then
      execute format('insert into %I.%I (%s) overriding system value select %s from %I.%I',
        ${q(nach)}, z.relname, spalten, spalten, ${q(von)}, z.relname);
    end if;
  end loop;
  for z in
    select q.sequencename, q.last_value, q.start_value from pg_sequences q
    where q.schemaname = ${q(von)} and to_regclass(format('%I.%I', ${q(nach)}, q.sequencename)) is not null
  loop
    perform setval(format('%I.%I', ${q(nach)}, z.sequencename)::regclass, coalesce(z.last_value, z.start_value), z.last_value is not null);
  end loop;
  for z in select c.relname from pg_class c where c.relnamespace = ${q(nach)}::regnamespace and c.relkind = 'm' loop
    execute format('refresh materialized view %I.%I', ${q(nach)}, z.relname);
  end loop;
end $pv_kopie$;`;
}

function neuAufbauen(ziel, liste, { ausfuehren }) {
  const s = stand(ziel);
  if (!s.production_da) throw new Error("supabase_migrations.schema_migrations fehlt, der Stand von public ist unbekannt.");
  const production = abfrage(ziel, "select version from supabase_migrations.schema_migrations order by version").map((z) => z.version);
  const preview = s.verlauf_da ? abfrage(ziel, `select version from ${VERLAUF} order by version`).map((z) => z.version) : [];
  const plan = neuAufbauPlan(liste, production, preview);
  console.log(`Neuaufbau ${PREVIEW_SCHEMA}: ${plan.migrationen.length} Migrationen (Stand von public), danach alle Daten aus public.`);
  if (plan.verworfen.length > 0) {
    console.log(`  verworfen (nur in ${PREVIEW_SCHEMA}): ${plan.verworfen.join(", ")}`);
    console.log("  Offene Pull Requests bringen ihre Migrationen beim naechsten Push wieder mit.");
  }
  console.log("  entfernt werden: Schema, Verlauf, Trigger und Policies mit Endung _preview auf auth/storage, Cron-Jobs mit Endung -preview");
  console.log("  bleiben: public, alle Production-Objekte, die Buckets mit Endung -preview samt Dateien");
  if (!ausfuehren) {
    console.log(`Nur angezeigt. Ausfuehren mit --ausfuehren; das loescht alle Daten in ${PREVIEW_SCHEMA}.`);
    return;
  }
  skript(ziel, `${abbauSql()}\n${EINRICHTEN_LEER}`);
  console.log(`${PREVIEW_SCHEMA} verworfen und leer angelegt.`);
  anwenden(ziel, plan.migrationen, { nurAnzeigen: false });
  skript(ziel, `${datenKopierenSql()}\nnotify pgrst, 'reload schema';`);
  console.log(`${PREVIEW_SCHEMA} neu aufgebaut. Pruefen: node scripts/preview-abgleich.mjs ${ziel.join(" ")}`);
}

function main() {
  const args = process.argv.slice(2);
  const befehl = args[0];
  if (!["pruefen", "einrichten", "anwenden", "neu-aufbauen"].includes(befehl)) {
    console.error("Aufruf: node scripts/preview-migrationen.mjs pruefen|einrichten|anwenden|neu-aufbauen [--linked|--local|--db-url <url>]");
    process.exit(2);
  }
  try {
    const liste = migrationen();
    pruefen(liste);
    if (befehl === "pruefen") {
      console.log(`Preview-Umschreibung: ${liste.length} Migrationen in Ordnung.`);
      return;
    }
    const ziel = zielAus(args);
    if (!ziel) throw new Error("Ziel fehlt: --linked, --local oder --db-url <url>");
    if (befehl === "einrichten") einrichten(ziel, liste, { klon: args.includes("--klon"), probelauf: args.includes("--probelauf") });
    else if (befehl === "neu-aufbauen") neuAufbauen(ziel, liste, { ausfuehren: args.includes("--ausfuehren") });
    else anwenden(ziel, liste, { nurAnzeigen: args.includes("--nur-anzeigen") });
  } catch (e) {
    console.error(imCi ? `::error::${e.message.split("\n")[0]}\n${e.message}` : `FEHLER: ${e.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
