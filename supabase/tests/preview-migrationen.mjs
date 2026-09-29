// Tests fuer scripts/preview-umschreiben.mjs, den Objektvergleich aus scripts/preview-abgleich.mjs,
// die Planung aus scripts/preview-migrationen.mjs und das Lesen der CLI-Antwort (scripts/preview-cli.mjs).
// Fast alles ist reine Logik ohne Datenbank; nur der Neuaufbau von public_preview laeuft gegen PGlite,
// weil dort SQL ausgefuehrt wird, das Production-Objekte nicht anfassen darf.
import { readdirSync, readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { abschnitte, anweisungen, bucketsAus, neueMigrationPruefen, schemaUmbenennen, triggerFunktionenAus, umschreiben } from "../../scripts/preview-umschreiben.mjs";
import * as abgleich from "../../scripts/preview-abgleich.mjs";
import * as previewCli from "../../scripts/preview-cli.mjs";
import * as previewMigrationen from "../../scripts/preview-migrationen.mjs";

const { objekte, unterschiede, verlaufsUnterschied } = abgleich;
const { planen, pruefsumme } = previewMigrationen;

let fehlgeschlagen = 0;
let gesamt = 0;
function check(name, bedingung, detail = "") {
  gesamt++;
  if (bedingung) console.log(`PASS  ${name}`);
  else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${detail ? ` - ${detail}` : ""}`);
  }
}
const gleichJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const B = { buckets: ["belege", "dokumente", "ki-sprachausgabe"] };
const um = (sql) => umschreiben(sql, B);

// Zerlegen
check("Semikolon im $-Rumpf trennt nicht", anweisungen("create function f() returns int as $$ select 1; select 2; $$ language sql; select 3;").length === 2);
check("Semikolon in Zeichenkette und Kommentar trennt nicht", anweisungen("select 'a;b'; -- x; y\nselect \"c;d\";").length === 2);
check("verschachtelte $-Marken", anweisungen("do $$ begin perform x($c$ a; $c$); end $$; select 1;").length === 2);

// Schema public
check("public.tabelle wird umbenannt", schemaUmbenennen("select * from public.chargen") === "select * from public_preview.chargen");
check("format('public.%I') wird umbenannt", schemaUmbenennen("execute format('alter table public.%I enable row level security', t)").includes("public_preview.%I"));
check("'public.' || name wird umbenannt", schemaUmbenennen("execute 'select * from public.' || t") === "execute 'select * from public_preview.' || t");
check("\"public\".tabelle wird umbenannt", schemaUmbenennen('select * from "public"."x"') === 'select * from "public_preview"."x"');
check("Rolle PUBLIC bleibt", schemaUmbenennen("revoke all on function public.f() from public, anon;") === "revoke all on function public_preview.f() from public, anon;");
check("graphql_public bleibt", schemaUmbenennen("select graphql_public.x()") === "select graphql_public.x()");
check("search_path = public", schemaUmbenennen("set search_path = public") === "set search_path = public_preview");
check("search_path mit extensions", schemaUmbenennen("set search_path = public, extensions") === "set search_path = public_preview, extensions");
check("search_path TO 'public'", schemaUmbenennen("SET search_path TO 'public'") === "SET search_path TO 'public_preview'");
check("search_path, dahinter AS in derselben Zeile", schemaUmbenennen("set search_path = public as $$") === "set search_path = public_preview as $$");
check("set_config search_path", schemaUmbenennen("select set_config('search_path', 'public, extensions', true)") === "select set_config('search_path', 'public_preview, extensions', true)");
check("grant usage on schema public", schemaUmbenennen("grant usage on schema public to anon") === "grant usage on schema public_preview to anon");
check("table_schema = 'public'", schemaUmbenennen("where table_schema = 'public'") === "where table_schema = 'public_preview'");
check("schema_name in ('public')", schemaUmbenennen("cmd.schema_name in ('public', 'x')") === "cmd.schema_name in ('public_preview', 'x')");
check("Existenzpruefung ueber typname bekommt das Preview-Schema",
  schemaUmbenennen("if not exists (select 1 from pg_type where typname = 'audit_bereich') then") ===
    "if not exists (select 1 from pg_type where typname = 'audit_bereich' and typnamespace = 'public_preview'::regnamespace) then");
check("Existenzpruefung mit Alias", schemaUmbenennen("where c.conname = 'x'") === "where c.conname = 'x' and c.connamespace = 'public_preview'::regnamespace");
check("vorhandene Schemabedingung wird nicht verdoppelt", schemaUmbenennen("where relname = 'x' and relnamespace = 1").split("namespace").length === 2);
check("Datenwert 'public' bleibt beim Umbenennen", schemaUmbenennen("insert into t (sichtbarkeit) values ('public')") === "insert into t (sichtbarkeit) values ('public')");
check("Spalte public in storage.buckets bleibt", schemaUmbenennen("insert into storage.buckets (id, public) values ('a', false)").includes("(id, public)"));

// Erweiterungen bleiben unberuehrt
check("create extension ... with schema public bleibt", um("create extension if not exists x with schema public;").sql === "create extension if not exists x with schema public;");

// Auth-Trigger
const trig = um("drop trigger if exists on_auth_user_created on auth.users;\ncreate trigger on_auth_user_created\n  after insert on auth.users\n  for each row execute function public.handle_new_auth_user();");
check("Auth-Trigger bekommt _preview", trig.sql.includes("create trigger on_auth_user_created_preview") && trig.sql.includes("drop trigger if exists on_auth_user_created_preview on auth.users"));
check("Auth-Trigger ruft die Preview-Funktion", trig.sql.includes("public_preview.handle_new_auth_user()"));
check("Auth-Trigger zaehlt als gemeinsames Objekt", trig.gemeinsam.length === 2 && trig.fehler.length === 0);
check("Trigger auf public-Tabelle bleibt beim Namen", um("create trigger t_upd before update on public.x for each row execute function public.f();").sql.includes("create trigger t_upd before"));
check("alle Trigger einer auth-Tabelle abschalten wird abgelehnt", um("alter table auth.users disable trigger all;").fehler.length === 1);

// Storage
const pol = um("create policy belege_insert_feld on storage.objects for insert to authenticated with check (bucket_id = 'belege' and public.has_role('admin'));");
check("Storage-Policy bekommt _preview", pol.sql.includes("create policy belege_insert_feld_preview on storage.objects"));
check("Storage-Policy nutzt den Preview-Bucket", pol.sql.includes("bucket_id = 'belege-preview'") && pol.sql.includes("public_preview.has_role"));
check("Bucket wird als Preview-Bucket angelegt", um("insert into storage.buckets (id, name, public) values ('dokumente', 'dokumente', false) on conflict (id) do nothing;").sql.includes("('dokumente-preview', 'dokumente-preview', false)"));
const geteilt = um("insert into storage.buckets (id, name, public) values ('ki-sprachausgabe', 'ki-sprachausgabe', false);");
check("gemeinsamer Bucket wird fuer Preview nicht angelegt", !geteilt.sql.includes("ki-sprachausgabe") && geteilt.fehler.length === 0);
check("Storage-Policy ohne Bucket-Bezug wird abgelehnt", um("create policy alle on storage.objects for select using (public.has_role('admin'));").fehler.length === 1);
check("Bucket-Name ausserhalb von storage bleibt (Tabelle dokumente)", um("grant select on public.dokumente to authenticated; select 'dokumente';").sql.includes("select 'dokumente'"));
check("Bucket im Funktionsrumpf mit storage-Bezug wird umbenannt",
  um("create function public.f() returns void language sql as $$ delete from storage.objects where bucket_id = 'belege' $$;").sql.includes("'belege-preview'"));

// Cron
const cron = um("do $$ begin perform cron.unschedule('kpi-taeglich') where exists (select 1 from cron.job where jobname = 'kpi-taeglich'); perform cron.schedule('kpi-taeglich', '10 3 * * *', $c$select public.f();$c$); end $$;");
check("Cron-Job bekommt -preview", (cron.sql.match(/'kpi-taeglich-preview'/g) ?? []).length === 3);
check("Cron-Befehl ruft Preview-Funktion", cron.sql.includes("select public_preview.f();"));
check("Zeitplan bleibt", cron.sql.includes("'10 3 * * *'"));
check("Cron zaehlt als gemeinsames Objekt", cron.gemeinsam.length === 1);

// Abgelehnt
check("Tabelle im Schema auth wird abgelehnt", um("create table auth.x (id int);").fehler.length === 1);
check("Update auf auth.users wird abgelehnt", um("update auth.users set raw_app_meta_data = '{}';").fehler.length === 1);
check("Event-Trigger wird abgelehnt", um("create event trigger e on ddl_command_end execute function public.f();").fehler.length === 1);
check("Rechte auf storage.objects werden abgelehnt", um("grant select on storage.objects to anon;").fehler.length === 1);
check("auth.uid() in einer Policy ist erlaubt", um("create policy p on public.x using (auth.uid() = owner);").fehler.length === 0);
check("Fremdschluessel auf auth.users ist erlaubt", um("create table public.x (u uuid references auth.users(id));").fehler.length === 0);
check("auth.users im Funktionsrumpf ist erlaubt", um("create function public.f() returns void language sql as $$ update auth.users set email = email $$;").fehler.length === 0);

// Quotierte Schemanamen (Stil von supabase db diff)
const qTrig = um('drop trigger if exists on_auth_user_created on "auth"."users";\ncreate trigger on_auth_user_created after insert on "auth"."users" for each row execute function "public"."handle_new_auth_user"();');
check("quotierter Auth-Trigger bekommt _preview", qTrig.sql.includes("create trigger on_auth_user_created_preview") && qTrig.sql.includes("drop trigger if exists on_auth_user_created_preview") && qTrig.gemeinsam.length === 2);
const qPol = um(`create policy "Belege lesen" on "storage"."objects" for select using (bucket_id = 'belege' and public.has_role('admin'));`);
check("quotierte Storage-Policy bekommt _preview und Preview-Bucket", qPol.sql.includes('"Belege lesen_preview"') && qPol.sql.includes("'belege-preview'"));
check("Update auf \"auth\".\"users\" wird abgelehnt", um('update "auth"."users" set email = email;').fehler.length === 1);
check("alter table \"storage\".\"objects\" wird abgelehnt", um('alter table "storage"."objects" add column x int;').fehler.length === 1);

// Cron-Varianten
const cronUml = um("do $$ begin perform cron.unschedule('KPI täglich') where exists (select 1 from cron.job where jobname = 'KPI täglich'); perform cron.schedule('KPI täglich', '10 3 * * *', $c$select public.f();$c$); end $$;");
check("Cron-Name mit Leerzeichen und Umlaut bekommt -preview", (cronUml.sql.match(/'KPI täglich-preview'/g) ?? []).length === 3 && !/'KPI täglich'/.test(cronUml.sql));
const cronBenannt = um("select cron.schedule(job_name => 'kpi', schedule => '10 3 * * *', command => $c$select public.f();$c$);");
check("Cron mit benannten Argumenten", cronBenannt.sql.includes("job_name => 'kpi-preview'") && cronBenannt.fehler.length === 0);
check("Cron-Befehl laeuft mit search_path public_preview", cronBenannt.sql.includes("$c$set search_path = public_preview, extensions; select public_preview.f();$c$"));
check("Cron-Befehl als Zeichenkette bekommt den search_path", um("select cron.schedule('j', '0 3 * * *', 'delete from audit_events where false');").sql.includes("'set search_path = public_preview, extensions; delete from audit_events where false'"));
check("Cron ohne Namen (zwei Argumente) bekommt den search_path", um("select cron.schedule('0 3 * * *', $$select 1$$);").sql.includes("$$set search_path = public_preview, extensions; select 1$$"));
check("cron.unschedule ueber ID wird abgelehnt", um("select cron.unschedule(42);").fehler.length === 1);
check("cron.alter_job wird abgelehnt", um("select cron.alter_job(42, schedule => '0 4 * * *');").fehler.length === 1);
check("Cron-Befehl mit Aenderung in auth wird abgelehnt", um("select cron.schedule('j', '0 3 * * *', $$delete from auth.users where false$$);").fehler.length === 1);
check("Cron in einem Funktionsrumpf wird umbenannt",
  um("create function public.plane() returns void language sql as $$ select cron.schedule('j', '0 3 * * *', 'select 1') $$;").sql.includes("'j-preview'"));

// Fehlerhuelle fuer Trigger auf auth.users
const tf = triggerFunktionenAus(["create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_auth_user();"]);
check("Triggerfunktionen auf auth werden gefunden", tf.join() === "handle_new_auth_user");
const huelle = umschreiben("create or replace function public.handle_new_auth_user() returns trigger language plpgsql security definer set search_path = public as $$\nbegin\n  insert into public.profiles (id) values (new.id);\n  return new;\nend;\n$$;", { triggerFunktionen: tf });
check("Triggerfunktion bekommt in Preview eine Fehlerhuelle", huelle.sql.includes("begin -- preview:huelle") && huelle.sql.includes("exception when others then -- preview:huelle") && huelle.sql.includes("insert into public_preview.profiles"));
check("Fehlerhuelle laesst bei DELETE den alten Datensatz durch", huelle.sql.includes("when tg_op = 'DELETE' then old else new"));
check("andere Funktionen bleiben ohne Huelle", !umschreiben("create function public.f() returns trigger language plpgsql as $$ begin return new; end $$;", { triggerFunktionen: tf }).sql.includes("preview:huelle"));
check("Triggerfunktion in SQL statt plpgsql wird abgelehnt",
  umschreiben("create or replace function public.handle_new_auth_user() returns trigger language sql as $$ select 1 $$;", { triggerFunktionen: tf }).fehler.length === 1);

// Datenbankweite Einstellungen und search_path
check("alter database ... set search_path wird abgelehnt", um('alter database postgres set search_path to "$user", public, extensions;').fehler.length === 1);
check("alter role ... set search_path wird abgelehnt", um("alter role authenticated set search_path = public, extensions;").fehler.length === 1);
check("reset search_path wird abgelehnt", um("reset search_path; create table notizen (id int);").fehler.length === 1);
check("set search_path to default wird abgelehnt", um("set search_path to default;").fehler.length === 1);
check("update ... set role = ... bleibt erlaubt", um("update public.profiles set role = 'admin' where false;").fehler.length === 0);
check("drop extension wird abgelehnt", um("drop extension if exists vector cascade;").fehler.length === 1);

// 'public' als Wert
check("format() mit 'public' als Schema wird abgelehnt", um("do $$ begin execute format('alter table %I.%I add column y int', 'public', 'x'); end $$;").fehler.length === 1);
check("quote_ident('public') wird abgelehnt", um("do $$ begin execute 'delete from ' || quote_ident('public') || '.lieferungen where false'; end $$;").fehler.length === 1);
check("Datenwert 'public' wird abgelehnt (nicht sicher umschreibbar)", um("insert into public.t (sichtbarkeit) values ('public');").fehler.length === 1);

// Regeln nur fuer neue Migrationen (Preview laeuft vor public)
check("Existenzpruefung ohne Schema in neuer Migration wird abgelehnt",
  neueMigrationPruefen("do $$ begin if not exists (select 1 from pg_constraint where conname = 'x') then alter table public.t add constraint x check (true); end if; end $$;").length === 1);
check("Existenzpruefung mit Schema ist erlaubt",
  neueMigrationPruefen("do $$ begin if not exists (select 1 from pg_constraint where conname = 'x' and connamespace = 'public'::regnamespace) then null; end if; end $$;").length === 0);
check("to_regclass ohne Schema wird abgelehnt", neueMigrationPruefen("select to_regclass('lieferungen');").length === 1);
check("create extension ohne Schema wird abgelehnt", neueMigrationPruefen("create extension if not exists pg_trgm;").length === 1);
check("create extension ohne if not exists wird abgelehnt", neueMigrationPruefen("create extension pg_trgm with schema extensions;").length === 1);
check("create extension mit Schema ist erlaubt", neueMigrationPruefen("create extension if not exists pg_trgm with schema extensions;").length === 0);
check("pg_cron ohne Schema ist erlaubt (legt sein Schema selbst fest)", neueMigrationPruefen("do $$ begin execute 'create extension if not exists pg_cron'; end $$;").length === 0);

// Auslassen
const aus = um("select 1;\n-- preview:auslassen\ncreate table auth.x (id int);\n-- preview:ende\nselect public.f();");
check("markierter Abschnitt wird ausgelassen", aus.fehler.length === 0 && !aus.sql.includes("auth.x") && aus.sql.includes("public_preview.f()"));
check("offene Markierung wird abgelehnt", um("-- preview:auslassen\nselect 1;").fehler.length === 1);

// Alle vorhandenen Migrationen
const ordner = "supabase/migrations";
const dateien = readdirSync(ordner).filter((f) => f.endsWith(".sql")).sort();
const inhalte = dateien.map((d) => readFileSync(`${ordner}/${d}`, "utf8"));
const buckets = bucketsAus(inhalte);
check("Buckets aus den Migrationen", ["belege", "dokumente", "ki-sprachausgabe"].every((b) => buckets.includes(b)), buckets.join(","));
const kaputt = dateien.filter((d, i) => umschreiben(inhalte[i], { buckets }).fehler.length > 0);
check("alle Migrationen lassen sich umschreiben", kaputt.length === 0, kaputt.join(", "));
// Kommentartexte (comment on ... is '...') sind Daten und behalten ihr public. (Fund 71, 28.09.2026)
const ohneKommentartexte = (sql) => {
  let imText = false; // nach "is": diese Zeichenkette und ihre Fortsetzungen 'a'\n'b'
  return abschnitte(sql).map((t) => {
    if (t.typ === "kommentar") return " ";
    if (t.typ === "code") {
      if (/\bis\s*$/i.test(t.text)) imText = true;
      else if (t.text.trim()) imText = false;
      return t.text;
    }
    return t.typ === "zeichenkette" && imText ? "''" : t.text;
  }).join("");
};
const rest = dateien.filter((d, i) => {
  const code = ohneKommentartexte(umschreiben(inhalte[i], { buckets }).sql);
  return /(?<![\w$"])public\.(?=["A-Za-z_%'])|"public"\./.test(code);
});
check("kein Verweis auf public. bleibt uebrig", rest.length === 0, rest.join(", "));

// Objektvergleich
const dumpA = `-- Name: t; Type: TABLE; Schema: public; Owner: postgres\nCREATE TABLE "public"."t" ("a" int);\n-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: x\nCOMMENT ON SCHEMA "public" IS 'x';\n-- Name: f(); Type: FUNCTION; Schema: public; Owner: postgres\nselect 'belege';`;
const dumpB = `-- Name: t; Type: TABLE; Schema: public_preview; Owner: postgres\nCREATE TABLE "public_preview"."t" ("a" int);\n-- Name: SCHEMA "public_preview"; Type: COMMENT; Schema: -; Owner: x\nCOMMENT ON SCHEMA "public_preview" IS 'anders';\n-- Name: f(); Type: FUNCTION; Schema: public_preview; Owner: postgres\nselect 'belege-preview';`;
check("gleiche Struktur ergibt keinen Unterschied", unterschiede(objekte(dumpA), objekte(dumpB)).length === 0);
check("abweichende Spalte wird gemeldet", unterschiede(objekte(dumpA), objekte(dumpB.replace('("a" int)', '("a" text)'))).length === 1);
check("Fehlerhuelle zaehlt im Strukturvergleich nicht",
  unterschiede(objekte("-- Name: f(); Type: FUNCTION; Schema: public; Owner: p\nbegin\n  return new;\nend;"),
    objekte("-- Name: f(); Type: FUNCTION; Schema: public_preview; Owner: p\nbegin -- preview:huelle\nbegin\n  return new;\nend;\nexception when others then -- preview:huelle\nend; -- preview:huelle")).length === 0);
check("fehlendes Objekt wird gemeldet", unterschiede(objekte(dumpA), objekte(dumpB.split("\n").slice(0, 2).join("\n")))[0]?.art === "fehlt in public_preview");

// Planung im geteilten public_preview
const datei = (version, summe = `s${version}`) => ({ version, datei: `${version}_x.sql`, pruefsumme: summe });
const p1 = planen([datei("1"), datei("2"), datei("3")], [{ version: "1", pruefsumme: "s1" }]);
check("offene Migrationen in Reihenfolge", p1.offen.map((m) => m.version).join() === "2,3" && p1.geaendert.length === 0 && p1.fremd.length === 0);
check("geaenderte Datei nach dem Anwenden wird erkannt", planen([datei("1", "neu")], [{ version: "1", pruefsumme: "alt" }]).geaendert.length === 1);
check("Verlauf ohne Pruefsumme gilt nicht als geaendert", (() => {
  const p = planen([datei("1")], [{ version: "1", pruefsumme: null }]);
  return p.geaendert.length === 0 && p.ohneSumme.length === 1;
})());
check("Migration aus einem anderen Pull Request wird als fremd gemeldet", planen([datei("1")], [{ version: "1", pruefsumme: "s1" }, { version: "9", pruefsumme: "x" }]).fremd.join() === "9");
check("aeltere offene Migration laeuft ausser der Reihe", planen([datei("2"), datei("5")], [{ version: "5", pruefsumme: "s5" }]).ausserReihe.map((m) => m.version).join() === "2");
check("gleiche Migration unter neuer Version gilt als umbenannt, nicht als offen", (() => {
  const p = planen([datei("7", "gleich")], [{ version: "5", pruefsumme: "gleich" }]);
  return p.offen.length === 0 && p.umbenannt.length === 1 && p.umbenannt[0].alteVersion === "5" && p.fremd.length === 0;
})());
check("Pruefsumme ist unabhaengig von CRLF", pruefsumme("select 1;\r\nselect 2;\r\n") === pruefsumme("select 1;\nselect 2;\n"));
check("Verlaufsunterschied", (() => {
  const d = verlaufsUnterschied(["1", "2"], ["1", "3"]);
  return d.nurPreview.join() === "3" && d.nurPublic.join() === "2";
})());

// ---- Cleanup 28.09.2026 (Funde 67 bis 75) -----------------------------------------------------

// Fund 70: Bucket- und Cron-Namen nur dort umbenennen, wo sie Bucket bzw. Job meinen. 'dokumente' ist
// zugleich Modulschluessel und Tabellenname, ein Cron-Name kann als Datenwert im Befehl stehen.
const dokPolicy = um("create policy dokumente_delete_recht on storage.objects for delete to authenticated using (bucket_id = 'dokumente' and public.has_permission('dokumente', 'delete'));");
check("Fund 70: bucket_id bekommt den Preview-Bucket", dokPolicy.sql.includes("bucket_id = 'dokumente-preview'"), dokPolicy.sql);
check("Fund 70: Modulschluessel 'dokumente' in has_permission bleibt", dokPolicy.sql.includes("has_permission('dokumente', 'delete')"), dokPolicy.sql);
check("Fund 70: Storage-Policy, die den Bucketnamen nur als Modulschluessel nennt, gilt als ohne Bucket-Bezug",
  um("create policy dok_lesen on storage.objects for select using (public.has_permission('dokumente', 'read'));").fehler.length === 1);
const bucketListe = um("create policy b on storage.objects for select using (bucket_id in ('belege', 'dokumente') and public.has_permission('belege', 'read'));");
check("Fund 70: bucket_id in (...) bekommt Preview-Buckets, has_permission nicht",
  bucketListe.sql.includes("bucket_id in ('belege-preview', 'dokumente-preview')") && bucketListe.sql.includes("has_permission('belege', 'read')"), bucketListe.sql);
const bucketUpdate = um("update storage.buckets set file_size_limit = 1 where id = 'belege';");
check("Fund 70: update storage.buckets ... where id = 'x' trifft den Preview-Bucket", bucketUpdate.sql.includes("where id = 'belege-preview'") && bucketUpdate.fehler.length === 0, bucketUpdate.sql);
const cronDaten = um("select cron.schedule('aufraeumen', '0 3 * * *', $c$ insert into public.log (art) values ('aufraeumen') $c$);");
check("Fund 70: Cron-Name im Aufruf bekommt -preview", cronDaten.sql.includes("cron.schedule('aufraeumen-preview'"), cronDaten.sql);
check("Fund 70: gleicher Text als Datenwert im Cron-Befehl bleibt", cronDaten.sql.includes("values ('aufraeumen')"), cronDaten.sql);

// Fund 71: Kommentartexte sind Daten und behalten ihr public.; jede andere Zeichenkette kann
// ausgefuehrter Code sein und wird weiter umbenannt (sicherere Richtung, 29.09.2026).
check("Fund 71: Kommentartext bleibt unveraendert",
  um("comment on table public.t is 'Erzeugt durch public.f()';").sql === "comment on table public_preview.t is 'Erzeugt durch public.f()';");
check("Fund 71: fortgesetzter Kommentartext 'a'\\n'b' bleibt unveraendert",
  um("comment on column public.t.x is\n  'Siehe public.a '\n  'und public.b';").sql === "comment on column public_preview.t.x is\n  'Siehe public.a '\n  'und public.b';");
check("Fund 71: nach einem Kommentar wird die naechste Anweisung wieder umbenannt",
  schemaUmbenennen("comment on table public.t is 'public.x'; select 'public.y'::regclass;") === "comment on table public_preview.t is 'public.x'; select 'public_preview.y'::regclass;");
for (const [name, sql, erwartet] of [
  ["Funktionsrumpf in einfachen Anfuehrungszeichen", "create function public.anzahl() returns bigint language sql as 'select count(*) from public.lieferungen';", "from public_preview.lieferungen'"],
  ["plpgsql-Rumpf in einfachen Anfuehrungszeichen", "create function public.f() returns void language plpgsql as 'begin delete from public.log; end';", "delete from public_preview.log;"],
  ["DO-Block in einfachen Anfuehrungszeichen", "do 'begin delete from public.log; end';", "delete from public_preview.log;"],
  ["Triggerargument (Tabellenname fuer dynamisches SQL)", "create trigger t after insert on public.a for each row execute function public.protokoll('public.lieferungen');", "protokoll('public_preview.lieferungen')"],
  ["gespeichertes SQL als Wert", "insert into public.abfragen (sql) values ('select * from public.lieferungen');", "values ('select * from public_preview.lieferungen')"],
]) check(`Fund 71: ${name} zeigt in Preview nicht auf public`, um(sql).sql.includes(erwartet), um(sql).sql);
check("Fund 71: search_path-Liste endet vor 'as', der Rumpf bleibt",
  schemaUmbenennen("set search_path = public as $$ select 'public' $$") === "set search_path = public_preview as $$ select 'public' $$");
check("Fund 71: 'public' als Wert im Rumpf wird auch mit search_path in derselben Zeile abgelehnt",
  um("create function public.f() returns text language sql set search_path = public as $$ select 'public' $$;").fehler.length === 1);
check("Fund 71: to_regclass('public.x') wird weiter umbenannt", schemaUmbenennen("select to_regclass('public.lieferungen');") === "select to_regclass('public_preview.lieferungen');");
check("Fund 71: 'public.x'::regclass wird weiter umbenannt", schemaUmbenennen("select 'public.lieferungen'::regclass;") === "select 'public_preview.lieferungen'::regclass;");
check("Fund 71: Cron-Befehl als Zeichenkette wird weiter umbenannt",
  um("select cron.schedule('j', '0 3 * * *', 'delete from public.x where false');").sql.includes("delete from public_preview.x where false"));

// Fund 72: clusterweite Objekte gibt es nur einmal; Preview laeuft vor public und wuerde sie vorzeitig anlegen.
for (const [name, sql] of [
  ["create role", "create role berichte_leser nologin;"],
  ["drop role", "drop role if exists berichte_leser;"],
  ["create user", "create user tester;"],
  ["Rollenmitgliedschaft (grant rolle to)", "grant authenticated to anon;"],
  ["Rollenmitgliedschaft (revoke rolle from)", "revoke authenticated from anon;"],
  ["create publication", "create publication p for all tables;"],
  ["alter publication", "alter publication supabase_realtime add table public.lieferungen;"],
  ["alter default privileges ohne in schema", "alter default privileges for role postgres grant all on tables to anon;"],
  ["alter default privileges in einem gemeinsamen Schema", "alter default privileges in schema storage grant select on tables to anon;"],
  ["create cast", "create cast (text as int) with inout;"],
  ["create language", "create language plperl;"],
  ["create tablespace", "create tablespace t location '/tmp';"],
]) check(`Fund 72: ${name} wird abgelehnt`, um(sql).fehler.length === 1, JSON.stringify(um(sql)));
check("Fund 72: alter default privileges in schema public bleibt erlaubt und wird umbenannt",
  um("alter default privileges in schema public grant select on tables to anon;").sql === "alter default privileges in schema public_preview grant select on tables to anon;");
check("Fund 72: grant ... on ... to bleibt erlaubt", um("grant select on public.t to anon;").fehler.length === 0);

// Fund 75: fehlt JSON in der CLI-Antwort, ist das ein Fehler und kein leeres Ergebnis.
const { antwortLesen } = previewCli;
const wirft = (f) => { try { f(); return false; } catch { return true; } };
check("Fund 75: antwortLesen gibt es", typeof antwortLesen === "function");
if (typeof antwortLesen === "function") {
  check("Fund 75: JSON-Array wird gelesen", gleichJson(antwortLesen('Connecting...\n[{"version":"1"}]\n'), [{ version: "1" }]));
  check("Fund 75: Objekt mit rows wird gelesen", gleichJson(antwortLesen('{"rows":[{"a":1}]}'), [{ a: 1 }]));
  check("Fund 75: leeres Array bleibt leer", gleichJson(antwortLesen("[]"), []));
  check("Fund 75: Antwort ohne JSON ist ein Fehler", wirft(() => antwortLesen("Error: unknown flag --agent")));
  check("Fund 75: Objekt ohne rows ist ein Fehler", wirft(() => antwortLesen('{"message":"neu"}')));
  check("Fund 75: fuer Anweisungen ohne Ergebnis (DO-Block) darf die Antwort leer sein", gleichJson(antwortLesen("", { leerErlaubt: true }), []));
}

// Fund 67: uebersprungener Strukturabgleich ist in der CI als Warnung sichtbar.
const { abgleichEntscheiden } = abgleich;
check("Fund 67: abgleichEntscheiden gibt es", typeof abgleichEntscheiden === "function");
if (typeof abgleichEntscheiden === "function") {
  const gleich = abgleichEntscheiden(["1", "2"], ["1", "2"], { imCi: true });
  check("Fund 67: gleicher Stand wird verglichen, ohne Warnung", gleich.vergleichen === true && gleich.zeilen.length === 0);
  const voraus = abgleichEntscheiden(["1", "2"], ["1", "2", "9"], { imCi: true });
  check("Fund 67: anderer Stand wird uebersprungen und als ::warning:: gemeldet",
    voraus.vergleichen === false && voraus.zeilen[0]?.startsWith("::warning::") && voraus.zeilen.join("\n").includes("9"), JSON.stringify(voraus));
  check("Fund 67: ausserhalb der CI steht WARNUNG davor", abgleichEntscheiden(["1"], [], { imCi: false }).zeilen[0]?.startsWith("WARNUNG:"));
}

// Fund 68: Neuaufbau von public_preview nach geschlossenen Pull Requests.
const { neuAufbauPlan, abbauSql, datenKopierenSql } = previewMigrationen;
check("Fund 68: neuAufbauPlan, abbauSql und datenKopierenSql gibt es",
  [neuAufbauPlan, abbauSql, datenKopierenSql].every((f) => typeof f === "function"));
if ([neuAufbauPlan, abbauSql, datenKopierenSql].every((f) => typeof f === "function")) {
  const plan = neuAufbauPlan([datei("1"), datei("2"), datei("3")], ["1", "2"], ["1", "2", "3", "8"]);
  check("Fund 68: nur Migrationen, die in public angewendet sind, werden neu aufgebaut", plan.migrationen.map((m) => m.version).join() === "1,2");
  check("Fund 68: Versionen offener oder geschlossener Pull Requests werden als verworfen gemeldet", plan.verworfen.join() === "3,8");
  check("Fund 68: in public angewendet, aber ohne Datei, ist ein Fehler", wirft(() => neuAufbauPlan([datei("1")], ["1", "2"], [])));

  // Abbau gegen PGlite: nur die Preview-Zwillinge verschwinden, Production-Objekte bleiben.
  const db = new PGlite();
  await db.exec(`
    create schema auth; create table auth.users (id int);
    create schema storage; create table storage.objects (bucket_id text); alter table storage.objects enable row level security;
    create schema cron; create table cron.job (jobname text);
    create function cron.unschedule(p text) returns boolean language sql as $$ delete from cron.job where jobname = p returning true $$;
    create schema supabase_migrations; create table supabase_migrations.preview_schema_migrations (version text);
    create schema public_preview;
    create table public_preview.eltern (id serial primary key);
    create table public_preview.kind (eltern_id int references public_preview.eltern (id));
    create view public_preview.sicht as select * from public_preview.eltern;
    create function public.f() returns trigger language plpgsql as $$ begin return new; end $$;
    create function public_preview.f() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger on_auth_user_created after insert on auth.users for each row execute function public.f();
    create trigger on_auth_user_created_preview after insert on auth.users for each row execute function public_preview.f();
    create policy belege_lesen on storage.objects for select using (bucket_id = 'belege');
    create policy belege_lesen_preview on storage.objects for select using (bucket_id = 'belege-preview');
    insert into cron.job values ('kpi-verlauf-taeglich'), ('kpi-verlauf-taeglich-preview');
    create table public.t (id int); insert into public.t values (1);
  `);
  await db.exec(abbauSql());
  const zeilen = async (sql) => (await db.query(sql)).rows;
  check("Fund 68: Abbau entfernt den Auth-Trigger-Zwilling, der Production-Trigger bleibt",
    gleichJson((await zeilen("select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by 1")).map((z) => z.tgname), ["on_auth_user_created"]));
  check("Fund 68: Abbau entfernt die Storage-Policy-Zwillinge, die Production-Policy bleibt",
    gleichJson((await zeilen("select policyname from pg_policies where schemaname = 'storage' order by 1")).map((z) => z.policyname), ["belege_lesen"]));
  check("Fund 68: Abbau entfernt den Cron-Job-Zwilling, der Production-Job bleibt",
    gleichJson((await zeilen("select jobname from cron.job order by 1")).map((z) => z.jobname), ["kpi-verlauf-taeglich"]));
  check("Fund 68: Abbau entfernt public_preview und den Preview-Verlauf",
    (await zeilen("select to_regnamespace('public_preview') is null as weg, to_regclass('supabase_migrations.preview_schema_migrations') is null as verlauf_weg"))[0]?.weg === true);
  check("Fund 68: public bleibt unberuehrt", (await zeilen("select count(*)::int as n from public.t"))[0]?.n === 1 && (await zeilen("select to_regproc('public.f') is not null as da"))[0]?.da === true);
  await db.close();

  // Haengt ein Production-Objekt an public_preview, loescht cascade es nicht still mit: Abbruch, nichts geaendert.
  const haengt = new PGlite();
  await haengt.exec(`
    create schema auth; create table auth.users (id int);
    create schema storage; create table storage.objects (bucket_id text);
    create schema public_preview; create table public_preview.t (id int);
    create function public_preview.f() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger on_auth_user_created_preview after insert on auth.users for each row execute function public_preview.f();
    create view public.sicht as select * from public_preview.t;
  `);
  let meldung = "";
  try { await haengt.exec(abbauSql()); } catch (e) { meldung = e.message; }
  check("Fund 68: Abbau bricht ab, wenn ein Objekt ausserhalb an public_preview haengt", meldung.includes("public.sicht"), meldung);
  check("Fund 68: nach dem Abbruch ist nichts geloescht",
    (await haengt.query("select to_regclass('public.sicht') is not null as sicht, (select count(*)::int from pg_trigger where tgname = 'on_auth_user_created_preview') as n")).rows[0]?.n === 1);
  await haengt.close();

  // Datenkopie gegen PGlite: 1:1 aus public, ohne Trigger und Fremdschluesselpruefung, Sequenzen mitgezogen.
  const kopie = new PGlite();
  const tabellen = (s) => `
    create table ${s}.kind (id serial primary key, eltern_id bigint, menge int, doppelt int generated always as (menge * 2) stored);
    create table ${s}.eltern (id bigint generated always as identity primary key, name text);
    alter table ${s}.kind add foreign key (eltern_id) references ${s}.eltern (id);`;
  await kopie.exec(`
    create schema public_preview;
    ${tabellen("public")}
    ${tabellen("public_preview")}
    insert into public.eltern (name) values ('a'), ('b');
    insert into public.kind (eltern_id, menge) values (2, 5);
    insert into public_preview.eltern (name) values ('aus der Migration');
    create function public.sperre() returns trigger language plpgsql as $$ begin raise exception 'unveraenderlich'; end $$;
    create trigger sperre before insert or delete on public_preview.kind for each row execute function public.sperre();
  `);
  await kopie.exec(datenKopierenSql());
  const k = async (sql) => (await kopie.query(sql)).rows;
  check("Fund 68: Datenkopie uebernimmt die Zeilen aus public, die Daten der Migration sind weg",
    gleichJson(await k("select id::int, name from public_preview.eltern order by id"), [{ id: 1, name: "a" }, { id: 2, name: "b" }]));
  check("Fund 68: Datenkopie laeuft an Triggern vorbei und rechnet generierte Spalten neu",
    gleichJson(await k("select id, eltern_id::int, menge, doppelt from public_preview.kind"), [{ id: 1, eltern_id: 2, menge: 5, doppelt: 10 }]));
  check("Fund 68: Sequenzen stehen danach wie in public",
    (await k("insert into public_preview.eltern (name) values ('neu') returning id::int"))[0]?.id === 3 &&
      (await k("select nextval(pg_get_serial_sequence('public_preview.kind', 'id'))::int as n"))[0]?.n === 2);
  check("Fund 68: Trigger laufen nach der Kopie wieder", (await k("show session_replication_role"))[0]?.session_replication_role === "origin");
  await kopie.close();
}

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
