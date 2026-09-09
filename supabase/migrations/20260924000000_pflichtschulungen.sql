-- =============================================================================
-- Damicon - Jaehrliche Pflichtschulung mit Nachweis und Fristueberwachung
-- (Masterplan-Anforderung 4.10)
-- =============================================================================
-- schulungsvideos existiert seit dem initialen Schema, war aber reine
-- Video-Bibliothek ohne jede Nachweisfuehrung (der urspruengliche
-- Tabellenkommentar "mehrsprachige Kurzeinarbeitung der Saisonkraefte"
-- beschreibt denselben fachlichen Zweck, den inzwischen Anforderung 2.12
-- (einarbeitung_schritte/-fortschritt) mit einer eigenen, bebilderten
-- Checkliste abdeckt - schulungsvideos wird mit dieser Migration bewusst
-- fuer den davon verschiedenen Zweck weiterverwendet, um den sie im
-- Masterplan tatsaechlich noch offen ist: WIEDERKEHRENDE, jaehrlich
-- aufzufrischende Pflichtschulungen (typischerweise Arbeitssicherheit),
-- nicht die einmalige Erstunterweisung.
--
-- Zielgruppe der Nachweisfuehrung: Nachweis je profiles.id (nicht wie bei
-- Anforderung 2.12 je pfluecker_id) - das Masterplan-Quelldokument benennt
-- keine einzelne Rolle, deshalb bewusst die inklusivere, allgemeinere
-- Verknuepfung ueber die Anmeldung, nicht nur Saisonkraefte. Ausgenommen
-- bleiben erzeuger/kunde: beides betriebsfremde Vertragspartner, keine
-- Arbeitskraefte auf der Plantage, fuer die eine Arbeitssicherheits-
-- Pflichtschulung fachlich keinen Sinn ergibt.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. schulungsvideos: pflicht-Kennzeichen + Frist
-- ---------------------------------------------------------------------------
alter table public.schulungsvideos
  add column if not exists pflicht boolean not null default false,
  add column if not exists frist_monate integer not null default 12
    constraint schulungsvideos_frist_monate_positiv check (frist_monate > 0);

comment on column public.schulungsvideos.pflicht is
  'Anforderung 4.10: markiert eine wiederkehrende Pflichtschulung (z. B. Arbeitssicherheit), im Unterschied zu einem optionalen Erklaervideo.';
comment on column public.schulungsvideos.frist_monate is
  'Anforderung 4.10: Gueltigkeitsdauer einer Teilnahme in Monaten, danach gilt die Schulung als faellig. Default 12 ("jaehrlich").';

-- ---------------------------------------------------------------------------
-- 2. Teilnahme-/Abschlussnachweis
-- ---------------------------------------------------------------------------
-- Bewusst OHNE unique(profil_id, schulungsvideo_id) - anders als
-- einarbeitung_fortschritt (Anforderung 2.12, einmalige Erstunterweisung)
-- ist eine Pflichtschulung wiederkehrend: dieselbe Person legt denselben
-- Nachweis planmaessig jedes Jahr erneut ab, jede Teilnahme ist ein eigener,
-- zeitgestempelter Datensatz.
create table public.schulungsteilnahmen (
  id                    uuid primary key default gen_random_uuid(),
  schulungsvideo_id     uuid not null references public.schulungsvideos(id) on delete cascade,
  profil_id             uuid not null references public.profiles(id) on delete cascade,
  abgeschlossen_am      timestamptz not null default now(),
  -- Nur gesetzt, wenn das Buero die Teilnahme fuer jemand anderen erfasst
  -- (z. B. eine gemeinsame Praesenzschulung); bei einer Selbstauskunft bleibt
  -- das Feld leer.
  erfasst_von_profil_id uuid references public.profiles(id) on delete set null,
  created_at            timestamptz not null default now()
);
comment on table public.schulungsteilnahmen is
  'Anforderung 4.10: Teilnahme-/Abschlussnachweis einer Pflichtschulung, ein Datensatz je tatsaechlicher Teilnahme (nicht nur je Person/Video).';
create index idx_schulungsteilnahmen_profil on public.schulungsteilnahmen(profil_id);
create index idx_schulungsteilnahmen_video on public.schulungsteilnahmen(schulungsvideo_id);

alter table public.schulungsteilnahmen enable row level security;
alter table public.schulungsteilnahmen force row level security;

create policy schulungsteilnahmen_select_buero on public.schulungsteilnahmen
  for select to authenticated
  using (public.has_office_access());

create policy schulungsteilnahmen_select_own on public.schulungsteilnahmen
  for select to authenticated
  using (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
  );

-- Selbstauskunft: die eigene Teilnahme melden. has_office_access() erlaubt
-- zusaetzlich, sie fuer eine andere Person zu erfassen (Praesenzschulung).
create policy schulungsteilnahmen_insert_own on public.schulungsteilnahmen
  for insert to authenticated
  with check (
    profil_id = (select p.id from public.profiles p where p.auth_user_id = auth.uid())
    or public.has_office_access()
  );

-- Korrektur nur als Loeschen + neu Erfassen durchs Buero (kein Update-Pfad),
-- gleiches Prinzip wie einarbeitung_fortschritt (Anforderung 2.12).
create policy schulungsteilnahmen_delete_buero on public.schulungsteilnahmen
  for delete to authenticated
  using (public.has_office_access());

-- ---------------------------------------------------------------------------
-- 3. Fristueberwachung als View
-- ---------------------------------------------------------------------------
-- Eine Zeile je Person und Pflichtschulung, mit der letzten Teilnahme und dem
-- daraus errechneten Faelligkeitsdatum. security_invoker: profiles_select_self
-- laesst eine normale Anmeldung nur die eigene Zeile sehen, has_office_access()
-- alle - dieselbe Eingrenzung gilt automatisch fuer diese View, ohne eigene
-- Rollenpruefung hier.
create view public.schulungsteilnahmen_status
with (security_invoker = true)
as
select
  p.id                    as profil_id,
  p.full_name,
  p.role,
  sv.id                   as schulungsvideo_id,
  sv.titel,
  sv.frist_monate,
  letzte.abgeschlossen_am as letzte_teilnahme_am,
  case
    when letzte.abgeschlossen_am is null then null
    else letzte.abgeschlossen_am + (sv.frist_monate || ' months')::interval
  end                      as faellig_am,
  case
    when letzte.abgeschlossen_am is null then 'nie'
    when letzte.abgeschlossen_am + (sv.frist_monate || ' months')::interval < now() then 'ueberfaellig'
    when letzte.abgeschlossen_am + (sv.frist_monate || ' months')::interval < now() + interval '30 days'
      then 'bald_faellig'
    else 'aktuell'
  end                      as status
from public.profiles p
cross join public.schulungsvideos sv
left join lateral (
  select max(st.abgeschlossen_am) as abgeschlossen_am
  from public.schulungsteilnahmen st
  where st.profil_id = p.id and st.schulungsvideo_id = sv.id
) letzte on true
where sv.pflicht
  and p.role in ('admin', 'betriebsleitung', 'buchhaltung', 'brigade', 'picker');

comment on view public.schulungsteilnahmen_status is
  'Anforderung 4.10: Fristueberwachung. Eine Zeile je Person (nur Arbeitskraefte-Rollen) und Pflichtschulung, status in (nie, ueberfaellig, bald_faellig, aktuell). security_invoker: RLS von profiles/schulungsteilnahmen gilt unveraendert durch die View hindurch.';

grant select on public.schulungsteilnahmen_status to authenticated;
