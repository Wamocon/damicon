-- =============================================================================
-- Wissensbasis: Bestandspflege (Analysen im Adminbereich, Entfernen nach Prüfung)
-- =============================================================================
-- Die Administration soll den Bestand der Wissensbasis in der Oberfläche prüfen können (Dubletten, durch Bücher abgedeckt, veraltet, Arbeitsdokumente,
-- Wiedervorlage) und Dokumente nach der Prüfung entfernen. Diese Migration liefert zwei Bausteine, keine Datenänderung:
--
--   1. wissen_naehe(p_quelle_id, p_proben)   Für ein Dokument werden bis zu p_proben Abschnitte gleichmäßig ausgewählt, und zu jedem der Abschnitt eines ANDEREN
--      Dokuments mit der größten inhaltlichen Ähnlichkeit (Kosinus der Vektoren, Index HNSW) gesucht. Die Anwendung bewertet daraus Dublette und Abdeckung durch
--      Bücher (bestandspflege.ts). Nur für den Dienst (service_role), denn die Funktion liest auch ungeprüfte Dokumente.
--
--   2. wissen_entfernt                       Grabstein-Tabelle: Welche Dokumente wurden bewusst entfernt (quelle_id, Titel, Grund, wer, wann). Der Abgleich
--      von public_preview nach public (scripts/wissen-abgleich.mjs) kopiert nichts, was hier steht. Sonst käme ein in public entferntes Dokument beim nächsten
--      Merge aus der Vorschau zurück. Nur für den Dienst lesbar und schreibbar (keine Policy).
--
-- Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests überspringen ihn.
-- =============================================================================

set search_path = public;

create table if not exists public.wissen_entfernt (
  quelle_id text primary key,
  titel text,
  grund text not null,
  abschnitte integer not null default 0,
  entfernt_am timestamptz not null default now(),
  entfernt_von uuid references public.profiles (id) on delete set null
);

comment on table public.wissen_entfernt is
  'Bewusst entfernte Wissensdokumente (Bestandspflege). Der Abgleich public_preview nach public kopiert kein Dokument aus dieser Liste zurück.';

alter table public.wissen_entfernt enable row level security;
revoke all on public.wissen_entfernt from anon, authenticated;

create or replace function public.wissen_naehe(p_quelle_id text, p_proben integer default 6)
returns table (
  probe uuid,
  naechster_abschnitt uuid,
  naechste_quelle_id text,
  naechster_titel text,
  naechster_ist_upload boolean,
  aehnlichkeit double precision
)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.iterative_scan = 'relaxed_order'
set hnsw.ef_search = '100'
as $$
  with abschnitte as (
    select c.id, c.dense,
           row_number() over (order by c.teil nulls last, c.id) as rn,
           count(*) over () as n
      from public.wissen_chunks c
     where c.quelle_id = p_quelle_id
  ),
  proben as (
    select a.id, a.dense
      from abschnitte a
     where p_proben >= a.n
        or a.rn in (select 1 + (i * (a.n - 1)) / greatest(p_proben - 1, 1) from generate_series(0, p_proben - 1) as i)
  )
  select p.id, x.id, x.quelle_id, x.titel, (x.extra ->> 'quelle' = 'upload'),
         1 - (x.dense operator(extensions.<=>) p.dense)
    from proben p
    cross join lateral (
      select c.id, c.quelle_id, c.titel, c.extra, c.dense
        from public.wissen_chunks c
       where c.quelle_id is distinct from p_quelle_id
       order by c.dense operator(extensions.<=>) p.dense
       limit 1
    ) x
$$;

comment on function public.wissen_naehe(text, integer) is
  'Zu bis zu p_proben gleichmäßig gewählten Abschnitten eines Dokuments der ähnlichste Abschnitt eines anderen Dokuments (Kosinus). Nur service_role.';

revoke all on function public.wissen_naehe(text, integer) from public, anon, authenticated;
grant execute on function public.wissen_naehe(text, integer) to service_role;
