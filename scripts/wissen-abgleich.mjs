// Gleicht die WISSENSBASIS aus dem Schema public_preview nach public ab, und nur sie: wissen_chunks und wissen_begriffe.
// Keine Nutzer, keine Rollen, keine Betriebsdaten, nichts anderes. Beide Schemas liegen in derselben Datenbank, der Abgleich ist
// reines SQL ohne Datentransport ueber das Netz.
//
// Warum: Die Vorschau (Vercel Preview) arbeitet auf public_preview. Wer dort Buecher hochlaedt und von einer zweiten Person freigeben
// laesst, hat sie in der Vorschau, aber noch nicht in der Produktion. Dieser Abgleich bringt das FREIGEGEBENE nach public.
//
// Regeln (additiv, nie zerstoerend):
//   1. NEU: Zeilen, die in public_preview freigegeben sind und in public weder mit der id noch mit der quelle_id vorkommen, werden
//      kopiert (alle gemeinsamen Spalten, auch die Vektoren). Ungepruefte und abgelehnte Zeilen bleiben, wo sie sind.
//      Hochgeladene Zeilen kommen erst ungeprueft an und werden danach freigegeben (UPDATE): So greift der Waechter der Datenbank
//      (wissen_pruefung_wache) auch hier, und die Pruefenden (geprueft_von) bleiben erhalten. Kein session_replication_role.
//   2. EINORDNUNG: Hat public eine Zeile ohne Quellenart oder Cluster und public_preview hat sie, wird sie uebernommen (quellenart,
//      cluster, autoritaetsstufe). Eine vorhandene Einordnung in public wird nie ueberschrieben.
//   3. WORTGEWICHTE: Die Dokumenthaeufigkeit der neuen Zeilen wird zu wissen_begriffe addiert, danach wird die IDF fuer alle Woerter
//      mit der neuen Zahl der Textstellen neu gerechnet (Formel wie in sparse.ts).
//   4. NICHTS wird geloescht oder geaendert, ausser der Einordnung nach Regel 2. Wurde ein Dokument in public_preview geaendert oder
//      geloescht, bleibt public, wie es ist.
//   5. Eine quelle_id, die in public schon vorkommt (zum Beispiel ein angefangenes Buch), und eine Freigabe durch eine Person, die in
//      public.profiles nicht vorkommt (Fremdschluessel geprueft_von), werden nicht uebernommen, sondern gemeldet.
//
// Aufruf:  node scripts/wissen-abgleich.mjs --linked|--local|--db-url <url> [--anwenden] [--max <Dokumente je Schritt, 5>]
// Ohne --anwenden wird nur gezeigt, was geschehen WUERDE (Trockenlauf). Lesender Zugriff genuegt dafuer.

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { abfrage, zielAus } from "./preview-cli.mjs";

const QUELLE = "public_preview.wissen_chunks";
const ZIEL = "public.wissen_chunks";

/** Prueft, dass beide Schemas die Tabellen haben. */
export const SQL_VORAUSSETZUNG = `
select to_regclass('${QUELLE}') is not null as quelle, to_regclass('${ZIEL}') is not null as ziel,
       to_regclass('public_preview.wissen_begriffe') is not null as quelle_b, to_regclass('public.wissen_begriffe') is not null as ziel_b`;

/** Was geschaehe: je Dokument (quelle_id) Titel, Zahl der Zeilen und ob es ein Upload ist; dazu die Zeilen, die uebersprungen werden. */
export const SQL_PLAN = `
with kandidaten as (
  select p.id, p.quelle_id, p.titel, p.extra, p.geprueft_von
  from ${QUELLE} p
  where p.pruefstatus = 'freigegeben'
    and not exists (select 1 from ${ZIEL} c where c.id = p.id)
), neu as (
  select k.* from kandidaten k
  where (k.quelle_id is null or not exists (select 1 from ${ZIEL} c where c.quelle_id = k.quelle_id))
    and (k.geprueft_von is null or exists (select 1 from public.profiles pr where pr.id = k.geprueft_von))
), uebersprungen as (
  select k.* from kandidaten k
  where (k.quelle_id is not null and exists (select 1 from ${ZIEL} c where c.quelle_id = k.quelle_id))
     or (k.geprueft_von is not null and not exists (select 1 from public.profiles pr where pr.id = k.geprueft_von))
)
select 'neu' as art, coalesce(quelle_id, '(ohne quelle_id)') as quelle_id, max(titel) as titel, count(*)::int as zeilen,
       bool_or(extra ->> 'quelle' = 'upload') as upload
  from neu group by quelle_id
union all
select 'uebersprungen', coalesce(quelle_id, '(ohne quelle_id)'), max(titel), count(*)::int, bool_or(extra ->> 'quelle' = 'upload')
  from uebersprungen group by quelle_id
union all
select 'einordnung', 'quellenart', null, count(*)::int, false
  from ${ZIEL} c join ${QUELLE} p on p.id = c.id
 where c.quellenart is null and p.quellenart is not null and coalesce(c.extra ->> 'quelle', '') <> 'upload'
union all
select 'einordnung', 'cluster', null, count(*)::int, false
  from ${ZIEL} c join ${QUELLE} p on p.id = c.id
 where c.cluster is null and p.cluster is not null and coalesce(c.extra ->> 'quelle', '') <> 'upload'
order by 1, 2`;

/** Die Einordnung (Regel 2): zwei einzelne Anweisungen, denn die CLI nimmt je Aufruf nur eine. Beide sind wiederholbar. */
export const SQL_EINORDNUNG = [
  `update ${ZIEL} c
   set quellenart = p.quellenart, cluster = coalesce(c.cluster, p.cluster), autoritaetsstufe = p.autoritaetsstufe
  from ${QUELLE} p
 where p.id = c.id and c.quellenart is null and p.quellenart is not null and coalesce(c.extra ->> 'quelle', '') <> 'upload'`,
  `update ${ZIEL} c
   set cluster = p.cluster
  from ${QUELLE} p
 where p.id = c.id and c.cluster is null and p.cluster is not null and coalesce(c.extra ->> 'quelle', '') <> 'upload'`,
];

/** Ein Schritt: hoechstens `max` neue Dokumente kopieren, freigeben, Wortgewichte nachfuehren. Alles oder nichts. */
export function sqlSchritt(max) {
  if (!Number.isInteger(max) || max < 1 || max > 100) throw new Error("--max muss eine ganze Zahl von 1 bis 100 sein");
  return `
do $abgleich$
declare
  spalten text;
  auswahl text;
  zeilen_neu int;
  n_gesamt bigint;
begin
  -- Ein Schritt kann viele Vektoren in den HNSW-Index schreiben: kein Zeitlimit fuer diese Transaktion.
  perform set_config('statement_timeout', '0', true);

  -- Gemeinsame, nicht erzeugte Spalten beider Tabellen. Bei Upload-Zeilen wird der Pruefstatus zunaechst 'ungeprueft' gesetzt.
  select string_agg(format('%I', a.attname), ', ' order by a.attnum),
         string_agg(case a.attname
                      when 'pruefstatus' then 'case when p.extra ->> ''quelle'' = ''upload'' then ''ungeprueft'' else p.pruefstatus end'
                      else format('p.%I', a.attname)
                    end, ', ' order by a.attnum)
    into spalten, auswahl
    from pg_attribute a
    join pg_attribute b on b.attname = a.attname and b.attrelid = 'public.wissen_chunks'::regclass and not b.attisdropped and b.attgenerated = ''
   where a.attrelid = 'public_preview.wissen_chunks'::regclass and a.attnum > 0 and not a.attisdropped and a.attgenerated = '';
  if spalten is null or spalten not like '%quelle_id%' or spalten not like '%dense%' then
    raise exception 'Abgleich abgebrochen: gemeinsame Spalten nicht ermittelbar (%)', spalten;
  end if;

  create temp table _wissen_neu on commit drop as
    select p.id
      from ${QUELLE} p
     where p.pruefstatus = 'freigegeben'
       and not exists (select 1 from ${ZIEL} c where c.id = p.id)
       and (p.quelle_id is null or not exists (select 1 from ${ZIEL} c where c.quelle_id = p.quelle_id))
       and (p.geprueft_von is null or exists (select 1 from public.profiles pr where pr.id = p.geprueft_von))
       and (p.quelle_id is null or p.quelle_id in (
             select q.quelle_id from (
               select distinct p2.quelle_id from ${QUELLE} p2
                where p2.pruefstatus = 'freigegeben' and p2.quelle_id is not null
                  and not exists (select 1 from ${ZIEL} c2 where c2.quelle_id = p2.quelle_id)
                  and (p2.geprueft_von is null or exists (select 1 from public.profiles pr2 where pr2.id = p2.geprueft_von))
                order by p2.quelle_id limit ${max}) q));
  select count(*) into zeilen_neu from _wissen_neu;
  if zeilen_neu = 0 then
    return;
  end if;

  execute format('insert into ${ZIEL} (%s) select %s from ${QUELLE} p where p.id in (select id from _wissen_neu)', spalten, auswahl);

  -- Hochgeladene Zeilen: jetzt freigeben, mit dem Waechter der Datenbank (zweite Person, geprueft_von/geprueft_am gesetzt).
  update ${ZIEL} c set pruefstatus = 'freigegeben'
    from ${QUELLE} p
   where p.id = c.id and c.id in (select id from _wissen_neu) and c.pruefstatus = 'ungeprueft' and p.extra ->> 'quelle' = 'upload';

  -- Wortgewichte: df der neuen Zeilen addieren, danach die IDF aller Woerter mit der neuen Zahl der Textstellen rechnen.
  insert into public.wissen_begriffe (hash, df, idf)
  select t.h, count(*)::int, 0
    from (
      select distinct c.id, split_part(kv, ':', 1)::int as h
        from ${ZIEL} c
        cross join lateral regexp_split_to_table(coalesce(substring(c.sparse::text from '^\\{(.*)\\}/'), ''), ',') as kv
       where c.id in (select id from _wissen_neu) and kv <> ''
    ) t
   group by t.h
  on conflict (hash) do update set df = public.wissen_begriffe.df + excluded.df;
  select count(*) into n_gesamt from ${ZIEL};
  update public.wissen_begriffe set idf = ln(1 + (n_gesamt - df + 0.5) / (df + 0.5))::real;

  -- Gegenprobe: alles Kopierte ist da, und jede Upload-Zeile ist freigegeben.
  if (select count(*) from ${ZIEL} c where c.id in (select id from _wissen_neu)) <> zeilen_neu then
    raise exception 'Abgleich abgebrochen: nicht alle % Zeilen angekommen', zeilen_neu;
  end if;
  if exists (select 1 from ${ZIEL} c where c.id in (select id from _wissen_neu) and c.pruefstatus <> 'freigegeben') then
    raise exception 'Abgleich abgebrochen: eine kopierte Zeile ist nicht freigegeben';
  end if;
end
$abgleich$;`;
}

function hauptprogramm() {
  const args = process.argv.slice(2);
  const ziel = zielAus(args);
  if (!ziel) {
    console.error("Aufruf: node scripts/wissen-abgleich.mjs --linked|--local|--db-url <url> [--anwenden] [--max <n>]");
    process.exit(2);
  }
  const anwenden = args.includes("--anwenden");
  const max = args.includes("--max") ? Number(args[args.indexOf("--max") + 1]) : 5;
  const zusammenfassung = [];
  const sag = (zeile = "") => {
    console.log(zeile);
    zusammenfassung.push(zeile);
  };

  const v = abfrage(ziel, SQL_VORAUSSETZUNG)[0];
  if (!v?.quelle || !v?.ziel || !v?.quelle_b || !v?.ziel_b) {
    throw new Error("public_preview oder public hat keine Wissensbasis-Tabellen (wissen_chunks, wissen_begriffe). Abbruch.");
  }

  const plan = () => abfrage(ziel, SQL_PLAN);
  const zeigePlan = (zeilen) => {
    const neu = zeilen.filter((z) => z.art === "neu");
    const skip = zeilen.filter((z) => z.art === "uebersprungen");
    const einordnung = zeilen.filter((z) => z.art === "einordnung");
    sag(`Neue Dokumente (freigegeben in public_preview, in public nicht vorhanden): ${neu.length}`);
    for (const z of neu) sag(`  + ${z.titel ?? z.quelle_id}  (${z.zeilen} Abschnitte${z.upload ? ", Upload" : ""})`);
    sag(`Übersprungen (quelle_id schon in public, zum Beispiel ein angefangenes Buch, oder prüfende Person in public unbekannt): ${skip.length}`);
    for (const z of skip) sag(`  - ${z.titel ?? z.quelle_id}  (${z.zeilen} Abschnitte)`);
    for (const z of einordnung) sag(`Einordnung nachzuziehen (${z.quelle_id}): ${z.zeilen} Zeilen`);
    return { neu, einordnung: einordnung.reduce((s, z) => s + z.zeilen, 0) };
  };

  let stand = zeigePlan(plan());
  if (!anwenden) {
    sag("");
    sag("Trockenlauf: nichts wurde geändert. Zum Anwenden --anwenden angeben.");
  } else {
    if (stand.einordnung > 0) {
      for (const anweisung of SQL_EINORDNUNG) abfrage(ziel, anweisung, { leerErlaubt: true });
      sag("Einordnung übernommen.");
    }
    let runden = 0;
    while (stand.neu.length > 0) {
      if (++runden > 60) throw new Error("Abgleich abgebrochen: mehr als 60 Schritte, bitte prüfen.");
      const vorher = stand.neu.length;
      abfrage(ziel, sqlSchritt(max), { leerErlaubt: true });
      stand = zeigePlan(plan());
      if (stand.neu.length >= vorher) throw new Error("Abgleich abgebrochen: ein Schritt hat keine Dokumente übernommen.");
      sag(`Schritt ${runden} fertig, noch offen: ${stand.neu.length}`);
    }
    sag("Abgleich abgeschlossen.");
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Wissensbasis-Abgleich (public_preview nach public)\nModus: ${anwenden ? "angewendet" : "Trockenlauf"}\n\n\`\`\`\n${zusammenfassung.join("\n")}\n\`\`\`\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) hauptprogramm();
