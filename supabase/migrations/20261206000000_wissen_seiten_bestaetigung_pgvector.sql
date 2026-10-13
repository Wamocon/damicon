-- =============================================================================
-- Wissensbasis: fehlende Seiten bestätigen oder nachladen (Spalte bestaetigte_seiten, Tabelle wissen_seiten_nachtrag, Funktion wissen_nachtrag_einreihen)
-- =============================================================================
-- Die Seitenverlauf-Prüfung beim Hochladen (src/lib/wissen/seitenverlauf.ts) findet Lücken in der Folge der gedruckten Seitenzahlen. Bisher bestätigte die
-- prüfende Person sie mit einem Freitext-Vermerk. Jetzt gilt (docs/wissensbasis-supabase.md, Punkt 17):
--   * Die prüfende Person gibt die gedruckten Seitenzahlen an, die KORREKT fehlen (Leerseiten, Notizseiten). Deckt die Angabe nicht alle gefundenen Lücken
--     ab, gibt es keine Freigabe: Es fehlt echter Inhalt. Bestätigte Seiten fließen nicht in die Qualität ein, offene schon.
--   * Fehlen echte Seiten, werden sie als OCR-PDF nachgeladen. Die Anwendung reiht sie an der Stelle der Lücke in das Buch ein (wissen_nachtrag_einreihen
--     nummeriert die Abschnitte des Pakets neu) und merkt sich in wissen_seiten_nachtrag, welche gedruckten Seiten sie nachgeladen hat. Alternativ wird
--     das Buch gelöscht und neu hochgeladen.
--
-- Änderungen:
--   1. wissen_seiten_vermerk: neue Spalte bestaetigte_seiten (die bestätigt fehlenden Seiten, "48-49, 120"); der Freitext-Vermerk wird freiwillig
--      (Grund, zum Beispiel "Leere Seiten im Buch"). Bestehende Zeilen bleiben unverändert und gelten weiter als bestätigt.
--   2. wissen_seiten_nachtrag (neu, leer): eine Zeile je Nachtrag. Nur service_role.
--   3. wissen_nachtrag_einreihen(): setzt die neuen Abschnitte eines Nachtrags an die richtige Stelle im Paket (teil und teile). Nur service_role.
--   4. wissen_liste() liefert zusätzlich seiten_bestaetigt, seiten_vermerkt und seiten_nachgeladen; sonst unverändert gegenüber 20261205000000.
-- Keine Datenänderung an vorhandenen Dokumenten. Der Dateiname endet auf _pgvector.sql: wissen_chunks gibt es in PGlite nicht, die schnellen Tests
-- überspringen ihn.
-- =============================================================================

set search_path = public;

alter table public.wissen_seiten_vermerk add column if not exists bestaetigte_seiten text;
alter table public.wissen_seiten_vermerk alter column vermerk drop not null;
alter table public.wissen_seiten_vermerk drop constraint if exists wissen_seiten_vermerk_vermerk_check;
alter table public.wissen_seiten_vermerk
  add constraint wissen_seiten_vermerk_vermerk_check check (vermerk is null or char_length(vermerk) between 3 and 300);

comment on column public.wissen_seiten_vermerk.bestaetigte_seiten is
  'Gedruckte Seitenzahlen, die die prüfende Person als korrekt fehlend bestätigt hat ("48-49, 120"). Leer bei Zeilen aus der Zeit des Freitext-Vermerks.';
comment on column public.wissen_seiten_vermerk.vermerk is
  'Freiwilliger Grund der prüfenden Person (zum Beispiel "Leere Seiten im Buch"); früher Pflicht.';

create table if not exists public.wissen_seiten_nachtrag (
  quelle_id text not null,
  nr integer not null check (nr >= 1),
  seiten text not null check (char_length(seiten) between 1 and 400),
  abschnitte integer not null check (abschnitte >= 0),
  nachgeladen_von uuid references public.profiles(id) on delete set null,
  nachgeladen_am timestamptz not null default now(),
  primary key (quelle_id, nr)
);

comment on table public.wissen_seiten_nachtrag is
  'Nachgeladene Scanseiten eines hochgeladenen Buchs (eine Zeile je Nachtrag, seiten = gedruckte Seitenzahlen, zum Beispiel "48-49"). Nur service_role.';

alter table public.wissen_seiten_nachtrag enable row level security;
revoke all on public.wissen_seiten_nachtrag from anon, authenticated;

-- Reiht die Abschnitte eines Nachtrags (p_neue) in ein Paket (pfad) ein: Die ersten p_nach vorhandenen Abschnitte (in der Reihenfolge teil, id) bleiben vorn,
-- danach folgen die neuen, dann die übrigen. teil wird fortlaufend neu vergeben, teile ist danach die Zahl der Abschnitte des Pakets. Liefert diese Zahl.
create or replace function public.wissen_nachtrag_einreihen(p_quelle_id text, p_pfad text, p_neue uuid[], p_nach integer)
returns integer
language plpgsql
volatile
set search_path = public
as $$
declare
  anzahl integer;
begin
  -- teil zählt wie im Chunker ab 0
  with alt as (
    select c.id, (row_number() over (order by c.teil nulls last, c.id) - 1)::integer as rn
      from public.wissen_chunks c
     where c.quelle_id = p_quelle_id and c.pfad = p_pfad and not (c.id = any (p_neue))
  ),
  neu as (
    select c.id, (row_number() over (order by c.teil nulls last, c.id) - 1)::integer as rn
      from public.wissen_chunks c
     where c.quelle_id = p_quelle_id and c.pfad = p_pfad and c.id = any (p_neue)
  ),
  davor as (
    select least(greatest(p_nach, 0), (select count(*)::integer from alt)) as n
  ),
  ziel as (
    select a.id, case when a.rn < d.n then a.rn else a.rn + coalesce(cardinality(p_neue), 0) end as neu_teil from alt a, davor d
    union all
    select n.id, d.n + n.rn as neu_teil from neu n, davor d
  ),
  gesamt as (select count(*)::integer as n from ziel)
  update public.wissen_chunks c
     set teil = z.neu_teil, teile = g.n
    from ziel z, gesamt g
   where c.id = z.id;
  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;

revoke all on function public.wissen_nachtrag_einreihen(text, text, uuid[], integer) from public, anon, authenticated;
grant execute on function public.wissen_nachtrag_einreihen(text, text, uuid[], integer) to service_role;

create or replace function public.wissen_liste()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(g)), '[]'::jsonb)
  from (
    select (array_agg(z.id order by z.id))[1] as id,
           z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
           z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
           z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
           z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk, z.seiten_bestaetigt, z.seiten_vermerkt, z.seiten_nachgeladen,
           count(*)::int as anzahl
    from (
      select c.id, c.quelle_id, c.pfad, c.titel, c.bereich, c.rollen, c.eingelesen_am, c.autoritaetsstufe, c.quellenart, c.cluster, c.textgrundlage,
             c.pruefstatus, c.pruefen_bis, c.url, c.rechtsstelle,
             c.extra ->> 'quelle' as upload_quelle,
             c.extra ->> 'hochgeladen_von_name' as hochgeladen_von,
             c.extra ->> 'hochgeladen_von' as hochgeladen_von_id,
             c.extra ->> 'paket' as paket,
             c.extra ->> 'pakete_gesamt' as pakete_gesamt,
             c.extra ->> 'guete' as guete,
             c.extra ->> 'guete_hinweise' as guete_hinweise,
             q.prozent as guete_prozent,
             o.groesse as original_groesse,
             c.extra -> 'seiten_pruefung' ->> 'fehlend' as seiten_fehlend,
             c.extra -> 'seiten_pruefung' ->> 'stellen' as seiten_stellen,
             v.vermerk as seiten_vermerk,
             v.bestaetigte_seiten as seiten_bestaetigt,
             (v.quelle_id is not null) as seiten_vermerkt,
             n.seiten as seiten_nachgeladen
      from public.wissen_chunks c
      left join public.wissen_qualitaet q on q.quelle_id = c.quelle_id
      left join public.wissen_original o on o.quelle_id = c.quelle_id
      left join public.wissen_seiten_vermerk v on v.quelle_id = c.quelle_id
      left join (
        select t.quelle_id, string_agg(t.seiten, ', ' order by t.nr) as seiten
          from public.wissen_seiten_nachtrag t
         group by t.quelle_id
      ) n on n.quelle_id = c.quelle_id
    ) z
    group by z.quelle_id, z.pfad, z.titel, z.bereich, z.rollen, z.eingelesen_am, z.autoritaetsstufe, z.quellenart, z.cluster, z.textgrundlage,
             z.pruefstatus, z.pruefen_bis, z.url, z.rechtsstelle,
             z.upload_quelle, z.hochgeladen_von, z.hochgeladen_von_id, z.paket, z.pakete_gesamt, z.guete, z.guete_hinweise, z.guete_prozent, z.original_groesse,
             z.seiten_fehlend, z.seiten_stellen, z.seiten_vermerk, z.seiten_bestaetigt, z.seiten_vermerkt, z.seiten_nachgeladen
  ) g
$$;

revoke all on function public.wissen_liste() from public, anon, authenticated;
grant execute on function public.wissen_liste() to service_role;
