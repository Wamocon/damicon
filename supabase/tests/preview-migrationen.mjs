// Tests fuer scripts/preview-umschreiben.mjs und den Objektvergleich aus scripts/preview-abgleich.mjs
// (reine Logik, ohne Datenbank).
import { readdirSync, readFileSync } from "node:fs";
import { anweisungen, bucketsAus, neueMigrationPruefen, schemaUmbenennen, triggerFunktionenAus, umschreiben } from "../../scripts/preview-umschreiben.mjs";
import { objekte, unterschiede, verlaufsUnterschied } from "../../scripts/preview-abgleich.mjs";
import { planen, pruefsumme } from "../../scripts/preview-migrationen.mjs";

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
const rest = dateien.filter((d, i) => {
  const code = umschreiben(inhalte[i], { buckets }).sql.split("\n").filter((z) => !/^\s*--/.test(z)).join("\n");
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

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehlgeschlagen}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
