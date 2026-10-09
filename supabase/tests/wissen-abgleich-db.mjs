// =============================================================================
// Damicon - Wissensbasis-Abgleich (public_preview nach public) gegen ECHTES Postgres
// =============================================================================
// Ausfuehren:  npm run test:wissen-abgleich-db
// Voraussetzung: laufende LOKALE Supabase-Instanz mit allen Migrationen UND dem Schema public_preview
//   (node scripts/preview-migrationen.mjs einrichten --local && node scripts/preview-migrationen.mjs anwenden --local).
//   Die CLI wird ueber SUPABASE_CLI (Pfad) oder "supabase" im PATH gefunden.
//
// Prueft scripts/wissen-abgleich.mjs mit einem Szenario aus Testzeilen (Kennungen mit festem Praefix, am Ende entfernt):
//   * freigegebener Upload (2 Pakete) kommt nach public, mit Freigabe durch die zweite Person (Waechter der Datenbank)
//   * ungepruefter und abgelehnter Upload bleiben in der Vorschau
//   * Einordnung wird nur ergaenzt, nie ueberschrieben
//   * quelle_id schon in public (angefangenes Buch) und unbekannte pruefende Person werden uebersprungen und gemeldet
//   * Wortgewichte: df addiert, IDF mit der neuen Zahl der Textstellen
//   * zweiter Lauf aendert nichts; die Vorschau bleibt unveraendert
// Sicherheitsnetz: nur lokale Datenbank (--local), nur Zeilen mit dem Test-Praefix.
// =============================================================================

import { execFileSync } from "node:child_process";
import { abfrage } from "../../scripts/preview-cli.mjs";

const ZIEL = ["--local"];
let gesamt = 0;
let fehler = 0;
function pruefe(name, ok, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const P = "ab000000"; // Praefix aller Test-IDs
const id = (n) => `${P}-0000-0000-0000-${String(n).padStart(12, "0")}`;
const A = "ab000000-0000-0000-0000-0000000000a1";
const B = "ab000000-0000-0000-0000-0000000000b2";
const C = "ab000000-0000-0000-0000-0000000000c3";
const TEST_HASHES = [880001, 880002, 880003, 880004, 880005, 880006];

const q = (sql) => abfrage(ZIEL, sql, { leerErlaubt: true });

function aufraeumen() {
  for (const s of ["public", "public_preview"]) {
    q(`delete from ${s}.wissen_chunks where id::text like '${P}-%'`);
    q(`delete from ${s}.profiles where id::text like '${P}-%'`);
  }
  q(`delete from public.wissen_begriffe where hash in (${TEST_HASHES.join(",")})`);
}

function szenarioAufbauen() {
  // Eine Anweisung (die CLI nimmt je Aufruf nur eine): ein DO-Block mit allen Zeilen.
  q(`
do $t$
declare
  s text;
  z record;
  eff text;
begin
  foreach s in array array['public', 'public_preview'] loop
    execute format('insert into %I.profiles (id, full_name, role) values (%L, %L, ''admin''), (%L, %L, ''admin'') on conflict (id) do nothing', s, '${A}', 'Test A', '${B}', 'Test B');
  end loop;
  insert into public_preview.profiles (id, full_name, role) values ('${C}', 'Test C nur Vorschau', 'admin') on conflict (id) do nothing;

  for z in
    select * from (values
      ('public',         '${id(1)}', 'abtest/bestand-a.md',  'Bestand A',          '{}',                 'freigegeben', null,            null,      4, null, '{880001:1.5,880002:1}/1000000000'),
      ('public_preview', '${id(1)}', 'abtest/bestand-a.md',  'Bestand A',          '{}',                 'freigegeben', 'rechtsnorm',    'internet', 1, null, '{880001:1.5,880002:1}/1000000000'),
      ('public',         '${id(2)}', 'abtest/bestand-b.md',  'Bestand B',          '{}',                 'freigegeben', null,            null,      4, null, '{880002:1}/1000000000'),
      ('public_preview', '${id(2)}', 'abtest/bestand-b.md',  'Bestand B',          '{}',                 'freigegeben', null,            null,      4, null, '{880002:1}/1000000000'),
      ('public_preview', '${id(3)}', 'upload:abtest-eins',   'Buch Eins',          '{"quelle":"upload","hochgeladen_von":"${A}","paket":1,"pakete_gesamt":2}', 'freigegeben', 'fachliteratur', 'buecher', 4, '${B}', '{880001:1,880003:1}/1000000000'),
      ('public_preview', '${id(4)}', 'upload:abtest-eins',   'Buch Eins',          '{"quelle":"upload","hochgeladen_von":"${A}","paket":2,"pakete_gesamt":2}', 'freigegeben', 'fachliteratur', 'buecher', 4, '${B}', '{880003:1,880004:1}/1000000000'),
      ('public_preview', '${id(5)}', 'upload:abtest-zwei',   'Buch Zwei',          '{"quelle":"upload","hochgeladen_von":"${A}"}', 'ungeprueft',  'fachliteratur', 'buecher', 4, null, '{880005:1}/1000000000'),
      ('public_preview', '${id(6)}', 'upload:abtest-drei',   'Buch Drei',          '{"quelle":"upload","hochgeladen_von":"${A}"}', 'abgelehnt',   'fachliteratur', 'buecher', 4, null, '{880005:1}/1000000000'),
      ('public',         '${id(7)}', 'upload:abtest-vier',   'Buch Vier alt',      '{"quelle":"upload","hochgeladen_von":"${A}"}', 'ungeprueft',  'fachliteratur', 'buecher', 4, null, '{880006:1}/1000000000'),
      ('public_preview', '${id(8)}', 'upload:abtest-vier',   'Buch Vier neu',      '{"quelle":"upload","hochgeladen_von":"${A}"}', 'freigegeben', 'fachliteratur', 'buecher', 4, '${B}', '{880006:1,880005:1}/1000000000'),
      ('public_preview', '${id(9)}', 'upload:abtest-fuenf',  'Buch Fuenf',         '{"quelle":"upload","hochgeladen_von":"${A}"}', 'freigegeben', 'fachliteratur', 'buecher', 4, '${C}', '{880005:1}/1000000000')
    ) as v(schema_name, zid, quelle, titel, extra, status, art, clus, stufe, geprueft, sparse_text)
  loop
    eff := case when z.extra::jsonb ->> 'quelle' = 'upload' then 'ungeprueft' else z.status end;
    execute format($f$
      insert into %I.wissen_chunks (id, chunk_id, quelle_id, titel, bereich, teil, teile, text, rollen, extra, dense, sparse, pruefstatus, quellenart, cluster, autoritaetsstufe, geprueft_von, geprueft_am)
      values (%L, %L, %L, %L, 'legal', 1, 1, %L, array['admin'], %L::jsonb,
              (select array_agg(0.001 * (g %% 7))::real[] from generate_series(1,1024) g)::extensions.vector,
              %L::extensions.sparsevec, %L, %L, %L, %L, %L, case when %L is null then null else now() end)
    $f$, z.schema_name, z.zid, 'c-' || z.zid, z.quelle, z.titel, 'Text ' || z.titel, z.extra, z.sparse_text, eff, z.art, z.clus, z.stufe, z.geprueft, z.geprueft);
    if eff <> z.status then
      execute format('update %I.wissen_chunks set pruefstatus = %L where id = %L', z.schema_name, z.status, z.zid);
    end if;
  end loop;
end
$t$`);
  q(`insert into public.wissen_begriffe (hash, df, idf) values (880001, 1, 0.5), (880002, 2, 0.4) on conflict (hash) do update set df = excluded.df, idf = excluded.idf`);
}

function abgleich(...args) {
  const cli = process.env.SUPABASE_CLI;
  return execFileSync(process.execPath, ["scripts/wissen-abgleich.mjs", "--local", ...args], { encoding: "utf8", env: { ...process.env, ...(cli ? { SUPABASE_CLI: cli } : {}) } });
}

function zeilen(schema) {
  return q(`select id::text, quelle_id, titel, pruefstatus, quellenart, cluster, autoritaetsstufe, geprueft_von is not null as mit_pruefer from ${schema}.wissen_chunks where id::text like '${P}-%' order by id`);
}

try {
  aufraeumen();
  szenarioAufbauen();
  const vorschauVorher = JSON.stringify(zeilen("public_preview"));

  const trocken = abgleich();
  pruefe("Trockenlauf: nennt das neue Buch", trocken.includes("Buch Eins"));
  pruefe("Trockenlauf: nennt uebersprungene Dokumente (angefangenes Buch, unbekannte pruefende Person)", trocken.includes("Buch Vier neu") && trocken.includes("Buch Fuenf"));
  pruefe("Trockenlauf: nennt weder ungepruefte noch abgelehnte Dokumente", !trocken.includes("Buch Zwei") && !trocken.includes("Buch Drei"));
  pruefe("Trockenlauf: schreibt nichts", zeilen("public").length === 3);

  const lauf = abgleich("--anwenden");
  pruefe("Anwenden: meldet den Abschluss", lauf.includes("Abgleich abgeschlossen"));

  const pub = zeilen("public");
  const byId = new Map(pub.map((z) => [z.id, z]));
  pruefe("Buch Eins: beide Pakete in public, freigegeben, mit pruefender Person", [3, 4].every((n) => byId.get(id(n))?.pruefstatus === "freigegeben" && byId.get(id(n))?.mit_pruefer === true));
  pruefe("Buch Eins: Einordnung mitgekommen", byId.get(id(3))?.quellenart === "fachliteratur" && byId.get(id(3))?.cluster === "buecher");
  pruefe("Ungeprueftes und abgelehntes Buch bleiben in der Vorschau", !byId.has(id(5)) && !byId.has(id(6)));
  pruefe("Angefangenes Buch (quelle_id schon in public) und unbekannte pruefende Person werden nicht uebernommen", !byId.has(id(8)) && !byId.has(id(9)));
  pruefe("Angefangenes Buch in public bleibt unveraendert", byId.get(id(7))?.pruefstatus === "ungeprueft");
  pruefe("Einordnung nachgezogen (Bestand A)", byId.get(id(1))?.quellenart === "rechtsnorm" && byId.get(id(1))?.cluster === "internet" && Number(byId.get(id(1))?.autoritaetsstufe) === 1);
  pruefe("Bestand B ohne Einordnung bleibt, wie er ist", byId.get(id(2))?.quellenart === null && byId.get(id(2))?.cluster === null);
  pruefe("Vorschau bleibt unveraendert", JSON.stringify(zeilen("public_preview")) === vorschauVorher);

  const gewichte = new Map(q(`select hash, df, idf from public.wissen_begriffe where hash in (${TEST_HASHES.join(",")})`).map((r) => [Number(r.hash), r]));
  pruefe("Wortgewichte: df der neuen Woerter addiert", Number(gewichte.get(880001)?.df) === 2 && Number(gewichte.get(880003)?.df) === 2 && Number(gewichte.get(880004)?.df) === 1, JSON.stringify([...gewichte.values()]));
  const n = Number(q(`select count(*)::int as n from public.wissen_chunks`)[0].n);
  const erwartet = Math.log(1 + (n - 2 + 0.5) / (2 + 0.5));
  pruefe("Wortgewichte: IDF mit der neuen Zahl der Textstellen", Math.abs(Number(gewichte.get(880003)?.idf) - erwartet) < 1e-4, `${gewichte.get(880003)?.idf} / ${erwartet.toFixed(5)}`);

  const zweiter = abgleich("--anwenden");
  pruefe("Zweiter Lauf: nichts mehr zu tun", zweiter.includes("Neue Dokumente (freigegeben in public_preview, in public nicht vorhanden): 0") && JSON.stringify(zeilen("public")) === JSON.stringify(pub));
} finally {
  aufraeumen();
}

console.log(`\n${gesamt - fehler}/${gesamt} bestanden`);
if (fehler > 0) process.exit(1);
