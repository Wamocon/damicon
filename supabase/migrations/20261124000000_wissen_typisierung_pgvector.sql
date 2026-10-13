-- =============================================================================
-- Wissensbasis: Typisierung der Quellen und Vier-Augen-Pruefung fuer Uploads
-- =============================================================================
-- Hintergrund: Der Admin-Upload (PR #144) nimmt Texte von aussen in die Wissensbasis auf. Sie unterscheiden sich in
-- Herkunft und Verlaesslichkeit (Gesetz, Fachbuch, Forum, KI-Zusammenfassung). Dieses Skript fuehrt ein:
--
--   quellenart     Art der Quelle (Liste und Regeln: src/lib/wissen/quellenart.ts). Kein CHECK, damit eine neue Art
--                  keine Migration braucht, wie schon bei bereich.
--   textgrundlage  original, amtlich_uebersetzt, fachlich_uebersetzt, maschinell_uebersetzt (ebenfalls ohne CHECK).
--   pruefstatus    ungeprueft | freigegeben | abgelehnt. Bestand und ETL: freigegeben (Voreinstellung). Ein Upload
--                  beginnt IMMER ungeprueft und ist fuer niemanden sichtbar, bis eine ZWEITE Person ihn freigibt.
--   pruefen_bis    Wiedervorlage: danach wird die Quelle nicht mehr gefunden, bis eine zweite Person verlaengert
--                  (Internetquellen und Foren, deren Methoden sich laufend aendern, laufen nach 12 Monaten ab).
--   geprueft_von   profiles.id der pruefenden Person, geprueft_am der Zeitpunkt.
--
-- Das Vier-Augen-Prinzip steht NICHT nur in der Anwendung: Ein Wachter (Trigger) lehnt jede Freigabe und Verlaengerung
-- ab, deren geprueft_von der Person entspricht, die hochgeladen hat (extra.hochgeladen_von), und jeden Upload, der nicht
-- ungeprueft beginnt. Auch ein Fehler im Anwendungscode kann das Prinzip damit nicht umgehen.
--
-- Wer ungeprueft ist, sieht nur der Dienst (service_role): Die Zeilensicherheit (RLS) laesst nur freigegebene Zeilen
-- zu, und wissen_suche filtert zusaetzlich selbst (fuer Aufrufe mit dem Dienstschluessel, der RLS umgeht).
--
-- Rueckwaertskompatibel: alle bestehenden Zeilen sind freigegeben, ohne Wiedervorlage, Art und Textgrundlage leer.
-- Pruefung: supabase/tests/wissen-pgvector.mjs und supabase/tests/wissen-upload-db.ts (echtes Postgres).
-- Der Dateiname endet auf _pgvector.sql: PGlite kann pgvector nicht, die schnellen Tests ueberspringen ihn.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- Spalten
-- ---------------------------------------------------------------------------
alter table public.wissen_chunks
  add column if not exists quellenart text,
  add column if not exists textgrundlage text,
  add column if not exists pruefstatus text not null default 'freigegeben',
  add column if not exists pruefen_bis date,
  add column if not exists geprueft_von uuid references public.profiles (id) on delete set null,
  add column if not exists geprueft_am timestamptz;

alter table public.wissen_chunks
  add constraint wissen_chunks_pruefstatus_check check (pruefstatus in ('ungeprueft', 'freigegeben', 'abgelehnt'));

create index if not exists wissen_chunks_pruefstatus_idx
  on public.wissen_chunks (pruefstatus) where pruefstatus <> 'freigegeben';

comment on column public.wissen_chunks.quellenart is
  'Art der Quelle (rechtsnorm, fachliteratur, forum ...), Liste in src/lib/wissen/quellenart.ts. NULL = Bestand ohne Typisierung.';
comment on column public.wissen_chunks.textgrundlage is
  'original, amtlich_uebersetzt, fachlich_uebersetzt oder maschinell_uebersetzt.';
comment on column public.wissen_chunks.pruefstatus is
  'ungeprueft (Quarantaene, nur der Dienst sieht die Zeile), freigegeben oder abgelehnt. Uploads beginnen ungeprueft; freigeben darf nur eine andere Person als die hochladende.';
comment on column public.wissen_chunks.pruefen_bis is
  'Wiedervorlage: ab diesem Datum wird die Quelle nicht mehr gefunden, bis eine zweite Person verlaengert. NULL = nie.';
comment on column public.wissen_chunks.geprueft_von is 'profiles.id der Person, die freigegeben oder verlaengert hat.';
comment on column public.wissen_chunks.geprueft_am is 'Zeitpunkt der letzten Freigabe oder Verlaengerung.';

-- ---------------------------------------------------------------------------
-- Waechter: Vier-Augen-Prinzip in der Datenbank
-- ---------------------------------------------------------------------------
create or replace function public.wissen_pruefung_wache()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  hochgeladen_von text;
  ist_upload boolean;
begin
  if tg_op = 'INSERT' then
    -- Ein Upload beginnt immer ungeprueft. Das Skript und der ETL legen freigegebene Zeilen an, aber ohne diesen Marker.
    if new.extra ->> 'quelle' = 'upload' and new.pruefstatus <> 'ungeprueft' then
      raise exception 'Vier-Augen-Prinzip: Ein hochgeladenes Wissensdokument beginnt immer ungeprueft (war: %).', new.pruefstatus
        using errcode = '23514';
    end if;
    return new;
  end if;

  ist_upload := old.extra ->> 'quelle' = 'upload';
  hochgeladen_von := old.extra ->> 'hochgeladen_von';

  if new.pruefstatus is distinct from old.pruefstatus then
    -- Entschieden ist entschieden: freigegeben und abgelehnt bleiben so.
    if old.pruefstatus <> 'ungeprueft' then
      raise exception 'Der Pruefstatus eines entschiedenen Dokuments aendert sich nicht mehr (war: %).', old.pruefstatus
        using errcode = '23514';
    end if;
    if new.pruefstatus = 'freigegeben' and ist_upload then
      if new.geprueft_von is null or new.geprueft_am is null then
        raise exception 'Eine Freigabe braucht geprueft_von und geprueft_am.' using errcode = '23514';
      end if;
      if hochgeladen_von is null or new.geprueft_von::text = hochgeladen_von then
        raise exception 'Vier-Augen-Prinzip: Ein Dokument gibt nicht die Person frei, die es hochgeladen hat.'
          using errcode = '23514';
      end if;
    end if;
  elsif ist_upload and new.pruefen_bis is distinct from old.pruefen_bis then
    -- Verlaengerung der Wiedervorlage: nur freigegebene Dokumente, nur nach vorne, nur durch eine zweite Person.
    if new.pruefstatus <> 'freigegeben' or old.pruefen_bis is null or new.pruefen_bis is null or new.pruefen_bis <= old.pruefen_bis then
      raise exception 'Die Wiedervorlage laesst sich nur bei einem freigegebenen Dokument nach hinten verschieben.'
        using errcode = '23514';
    end if;
    if new.geprueft_von is null or hochgeladen_von is null or new.geprueft_von::text = hochgeladen_von then
      raise exception 'Vier-Augen-Prinzip: Ein Dokument verlaengert nicht die Person, die es hochgeladen hat.'
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.wissen_pruefung_wache() from public, anon, authenticated;

drop trigger if exists wissen_chunks_pruefung_einfuegen on public.wissen_chunks;
create trigger wissen_chunks_pruefung_einfuegen
  before insert on public.wissen_chunks
  for each row execute function public.wissen_pruefung_wache();

drop trigger if exists wissen_chunks_pruefung_aendern on public.wissen_chunks;
create trigger wissen_chunks_pruefung_aendern
  before update on public.wissen_chunks
  for each row execute function public.wissen_pruefung_wache();

-- ---------------------------------------------------------------------------
-- Zeilensicherheit: nur Freigegebenes ist lesbar
-- ---------------------------------------------------------------------------
-- Vorher: Rolle steht in rollen. Jetzt zusaetzlich freigegeben. Ungepruefte und abgelehnte Zeilen liest nur der Dienst
-- (service_role umgeht RLS): auch ein Admin findet sie weder in der Suche noch ueber die Tabelle.
drop policy if exists wissen_chunks_lesen on public.wissen_chunks;
create policy wissen_chunks_lesen on public.wissen_chunks
  for select to authenticated
  using (pruefstatus = 'freigegeben' and (select public.current_app_role())::text = any (rollen));

-- ---------------------------------------------------------------------------
-- Hybridsuche: zusaetzlich nur Freigegebenes und Nicht-Abgelaufenes, Typisierung im Payload
-- ---------------------------------------------------------------------------
-- Unveraendert gegenueber 20261102000000_wissen_pgvector.sql, ausser:
--   * beide Kandidatensuchen filtern pruefstatus = 'freigegeben' und pruefen_bis (Wiedervorlage)
--   * der Payload traegt quellenart, textgrundlage, pruefstatus und pruefen_bis
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
  with f as materialized (
    select (t.ord)::int as ord, t.elem
    from jsonb_array_elements(p_fragen) with ordinality as t(elem, ord)
  ),
  dq as materialized (
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
        and c.pruefstatus = 'freigegeben'
        and (c.pruefen_bis is null or c.pruefen_bis >= current_date)
      order by c.dense operator(extensions.<=>) dq.q
      limit p_kandidaten
    ) k
  ),
  sq as materialized (
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
        and c.pruefstatus = 'freigegeben'
        and (c.pruefen_bis is null or c.pruefen_bis >= current_date)
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
      'eingelesen_am', c.eingelesen_am, 'embed_modell', c.embed_modell,
      'quellenart', c.quellenart, 'textgrundlage', c.textgrundlage,
      'pruefstatus', c.pruefstatus, 'pruefen_bis', c.pruefen_bis
    )
  from vereint v
  join public.wissen_chunks c on c.id = v.id
  order by v.punkt desc, c.id
  limit p_limit;
$$;

comment on function public.wissen_suche is
  'Hybridsuche der Wissensbasis (dicht + lexikalisch, RRF). security invoker: RLS der aufrufenden Person gilt. Nur freigegebene, nicht abgelaufene Zeilen.';

revoke all on function public.wissen_suche(jsonb, integer, integer, text, boolean, integer, integer) from public, anon;
grant execute on function public.wissen_suche(jsonb, integer, integer, text, boolean, integer, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
