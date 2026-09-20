-- Wissensbasis (Recht, Steuer, Compliance, Audit) in Postgres: pgvector statt eines eigenen Servers.
--
-- Warum hier: Die Wissenssuche lief lokal gegen Qdrant, das Vercel nicht erreicht. Postgres mit
-- pgvector liegt schon in Supabase, braucht keinen zusaetzlichen Dienst, und die Rollenrechte der
-- Wissensbasis koennen dieselbe Zeilensicherheit (RLS) nutzen wie der Rest der Anwendung:
-- "Sicherheit durch Abwesenheit" gilt damit auch in der Datenbank, nicht nur im Code.
--
-- Aufbau (gleich der lokalen Qdrant-Sammlung, damit beide dieselben Ergebnisse liefern):
--   wissen_chunks     Textstellen mit Belegdaten, dichtem Vektor (bge-m3, 1024) und sparsem Vektor
--   wissen_begriffe   Dokumenthaeufigkeit je Wort fuer die IDF-Gewichtung der lexikalischen Suche
--   wissen_importe    Protokoll: welcher Korpus, welches Modell, wann, wie viele Stellen
--   wissen_suche()    Hybridsuche (dicht + lexikalisch, Reciprocal Rank Fusion) mit Rollenfilter
--
-- Schreiben darf nur der Dienst (service_role, ETL-Skript scripts/wissen-nach-supabase.ts).
-- Lesen darf, wer eine Buero-Rolle hat UND dessen Rolle in wissen_chunks.rollen steht.

create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------------
-- Textstellen
-- ---------------------------------------------------------------------------
create table if not exists public.wissen_chunks (
  id uuid primary key,
  chunk_id text,
  quelle_id text,
  norm_id text,
  sprache text not null default 'de',
  autoritaetsstufe smallint check (autoritaetsstufe between 1 and 5),
  rechtsstelle text,
  titel text,
  gueltig_ab text,
  gueltig_bis text,
  ist_ueberholt boolean not null default false,
  ersetzt_durch text,
  abgerufen_am text,
  url text,
  konfidenz text,
  pfad text,
  bereich text not null,
  teil integer,
  teile integer,
  kontext text,
  text text not null,
  rollen text[] not null default '{}',
  eingelesen_am text,
  embed_modell text,
  -- Alles, was der Import sonst noch mitbringt, geht nicht verloren.
  extra jsonb not null default '{}'::jsonb,
  -- Dichter Vektor (Bedeutung). Der Suchraum haengt am Modell: ein anderes Modell braucht neue Vektoren.
  dense extensions.vector(1024) not null,
  -- Sparser Vektor (Woerter, Zahlen, Artikelnummern): Index = Wort-Hash, Wert = 1 + ln(Haeufigkeit).
  sparse extensions.sparsevec(1000000000) not null,
  erstellt_am timestamptz not null default now()
);

comment on table public.wissen_chunks is
  'Wissensbasis fuer Recht, Steuer, Compliance und Audit: Textstellen mit Belegdaten und Vektoren. Schreiben nur ueber service_role (ETL), Lesen nur mit passender Rolle (RLS).';

create index if not exists wissen_chunks_dense_idx
  on public.wissen_chunks using hnsw (dense extensions.vector_cosine_ops) with (m = 16, ef_construction = 128);
create index if not exists wissen_chunks_rollen_idx on public.wissen_chunks using gin (rollen);
create index if not exists wissen_chunks_bereich_idx on public.wissen_chunks (bereich);
create index if not exists wissen_chunks_quelle_idx on public.wissen_chunks (quelle_id);

alter table public.wissen_chunks enable row level security;

-- Wer eine Stelle sieht, entscheidet die Rolle aus dem Profil, nicht ein Wert aus dem Client.
drop policy if exists wissen_chunks_lesen on public.wissen_chunks;
create policy wissen_chunks_lesen on public.wissen_chunks
  for select to authenticated
  using ((select public.current_app_role())::text = any (rollen));

-- Keine Policies fuer insert/update/delete: fuer authenticated und anon ist Schreiben gesperrt.
revoke all on public.wissen_chunks from anon, authenticated;
grant select on public.wissen_chunks to authenticated;

-- ---------------------------------------------------------------------------
-- Dokumenthaeufigkeit fuer die IDF-Gewichtung (Qdrant macht das serverseitig, Postgres nicht)
-- ---------------------------------------------------------------------------
create table if not exists public.wissen_begriffe (
  hash integer primary key,
  df integer not null check (df > 0),
  idf real not null
);

comment on table public.wissen_begriffe is
  'Dokumenthaeufigkeit (df) und IDF je Wort-Hash. idf = ln(1 + (N - df + 0.5) / (df + 0.5)), N = Anzahl der Textstellen beim Import.';

alter table public.wissen_begriffe enable row level security;
drop policy if exists wissen_begriffe_lesen on public.wissen_begriffe;
create policy wissen_begriffe_lesen on public.wissen_begriffe for select to authenticated using (true);
revoke all on public.wissen_begriffe from anon, authenticated;
grant select on public.wissen_begriffe to authenticated;

-- ---------------------------------------------------------------------------
-- Importprotokoll
-- ---------------------------------------------------------------------------
create table if not exists public.wissen_importe (
  id uuid primary key default gen_random_uuid(),
  gestartet_am timestamptz not null default now(),
  quelle text not null,
  embed_modell text,
  dimension integer,
  chunks integer not null,
  begriffe integer not null,
  bemerkung text
);

comment on table public.wissen_importe is 'Welcher Korpus mit welchem Modell wann eingelesen wurde (Nachweis fuer Pruefungen).';

alter table public.wissen_importe enable row level security;
drop policy if exists wissen_importe_lesen on public.wissen_importe;
create policy wissen_importe_lesen on public.wissen_importe for select to authenticated using (public.has_office_access());
revoke all on public.wissen_importe from anon, authenticated;
grant select on public.wissen_importe to authenticated;

-- ---------------------------------------------------------------------------
-- Hybridsuche
-- ---------------------------------------------------------------------------
-- p_fragen: [{"dense": [1024 Zahlen], "begriffe": [Wort-Hashes]}, ...], eine Formulierung je Eintrag
-- (zum Beispiel die Frage des Nutzers und dieselbe Frage auf Russisch). Jede Formulierung liefert
-- eine dichte und eine lexikalische Kandidatenliste, alle werden per Reciprocal Rank Fusion vereint.
--
-- p_rrf_k: Konstante der Reciprocal Rank Fusion. Klein (2, wie bei Qdrant) gewichtet die obersten Raenge
-- stark, gross (60, Lehrbuchwert) glaettet sie. Fuer kurze Trefferlisten mit klarem Spitzenreiter ist 2 besser.
--
-- security invoker: Die Zeilensicherheit (RLS) der aufrufenden Person gilt. p_rolle kann die
-- Ergebnisse nur weiter EINSCHRAENKEN (zum Beispiel "Ansicht als Rolle"), nie erweitern.
-- hnsw.iterative_scan: bei einem Filter (Rolle, Stufe) liest der Index weiter, bis genug Zeilen
-- uebrig sind, statt zu wenige zurueckzugeben.
create or replace function public.wissen_suche(
  p_fragen jsonb,
  p_limit integer default 8,
  p_kandidaten integer default 40,
  p_rolle text default null,
  p_nur_aktuell boolean default true,
  p_max_stufe integer default null,
  p_rrf_k integer default 2
)
returns table (id uuid, punktzahl double precision, payload jsonb)
language sql
stable
security invoker
set search_path = public, extensions
set hnsw.iterative_scan = 'relaxed_order'
set hnsw.ef_search = '100'
as $$
  with f as (
    select (t.ord)::int as ord, t.elem
    from jsonb_array_elements(p_fragen) with ordinality as t(elem, ord)
  ),
  dq as (
    select f.ord, (f.elem -> 'dense')::text::extensions.vector as q
    from f
    where jsonb_typeof(f.elem -> 'dense') = 'array'
  ),
  dichte as (
    select dq.ord, k.id, row_number() over (partition by dq.ord order by k.abstand) as rang
    from dq
    cross join lateral (
      select c.id, (c.dense operator(extensions.<=>) dq.q) as abstand
      from public.wissen_chunks c
      where (p_rolle is null or p_rolle = any (c.rollen))
        and (not p_nur_aktuell or not c.ist_ueberholt)
        and (p_max_stufe is null or c.autoritaetsstufe <= p_max_stufe)
      order by c.dense operator(extensions.<=>) dq.q
      limit p_kandidaten
    ) k
  ),
  sq as (
    -- Fragevektor: jedes bekannte Wort mit seinem IDF-Gewicht. Unbekannte Woerter tragen nichts bei.
    select f.ord,
      (select ('{' || string_agg(b.hash::text || ':' || b.idf::text, ',' order by b.hash) || '}/1000000000')::extensions.sparsevec
       from public.wissen_begriffe b
       where b.hash in (select (jsonb_array_elements_text(f.elem -> 'begriffe'))::int)) as q
    from f
  ),
  lexikalisch as (
    select sq.ord, k.id, row_number() over (partition by sq.ord order by k.wert) as rang
    from sq
    cross join lateral (
      select c.id, (c.sparse operator(extensions.<#>) sq.q) as wert
      from public.wissen_chunks c
      where sq.q is not null
        and (p_rolle is null or p_rolle = any (c.rollen))
        and (not p_nur_aktuell or not c.ist_ueberholt)
        and (p_max_stufe is null or c.autoritaetsstufe <= p_max_stufe)
      order by c.sparse operator(extensions.<#>) sq.q
      limit p_kandidaten
    ) k
    -- <#> ist das NEGATIVE Skalarprodukt: nur echte Ueberlappung (< 0) ist ein Treffer.
    where k.wert < 0
  ),
  vereint as (
    select d.id, sum(1.0 / (p_rrf_k + d.rang)) as punkt
    from (
      select id, rang from dichte
      union all
      select id, rang from lexikalisch
    ) d
    group by d.id
  )
  select c.id,
    v.punkt::double precision,
    jsonb_build_object(
      'chunk_id', c.chunk_id, 'quelle_id', c.quelle_id, 'norm_id', c.norm_id, 'sprache', c.sprache,
      'autoritaetsstufe', c.autoritaetsstufe, 'rechtsstelle', c.rechtsstelle, 'titel', c.titel,
      'gueltig_ab', c.gueltig_ab, 'gueltig_bis', c.gueltig_bis, 'ist_ueberholt', c.ist_ueberholt,
      'ersetzt_durch', c.ersetzt_durch, 'abgerufen_am', c.abgerufen_am, 'url', c.url,
      'konfidenz', c.konfidenz, 'pfad', c.pfad, 'bereich', c.bereich, 'teil', c.teil, 'teile', c.teile,
      'kontext', c.kontext, 'text', c.text, 'rollen', to_jsonb(c.rollen),
      'eingelesen_am', c.eingelesen_am, 'embed_modell', c.embed_modell
    )
  from vereint v
  join public.wissen_chunks c on c.id = v.id
  order by v.punkt desc, c.id
  limit p_limit;
$$;

comment on function public.wissen_suche is
  'Hybridsuche der Wissensbasis (dicht + lexikalisch, RRF). security invoker: RLS der aufrufenden Person gilt.';

revoke all on function public.wissen_suche(jsonb, integer, integer, text, boolean, integer, integer) from public, anon;
grant execute on function public.wissen_suche(jsonb, integer, integer, text, boolean, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
