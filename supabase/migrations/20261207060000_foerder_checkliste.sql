-- =============================================================================
-- Damicon - Checkliste je Foerderdossier (WMCNL-1448, Stufe 1)
-- =============================================================================
-- foerderdossiers kennt Status, Frist und angehaengte Nachweise, aber nicht, was
-- fuer einen Antrag noch fehlt. Welche Unterlagen und Schritte ein Programm
-- verlangt, legt die Foerderstelle fest und aendert sich mit jedem Programm; eine
-- fest eingebaute Antragsvorlage waere eine Erfindung (siehe Kopf der Migration
-- 20260925000000). Deshalb pflegt das Buero die Checkliste je Dossier selbst, und
-- das System hilft, nichts zu vergessen: Pflichtpunkte, Fristen, erledigt oder
-- offen, mit Fortschrittsanzeige.
--
-- Fuer den schnellen Start gibt es fuenf allgemeine Punkte als Vorschlag
-- (vorlage_key). Sie sind kein amtlicher Katalog; ihre Beschriftung kommt aus der
-- Oberflaeche und steht deshalb in jeder Sprache, in der Datenbank steht nur der
-- Schluessel. Eigene Punkte tragen ihren Text in bezeichnung.
--
-- Erledigt ist, wer ein Erledigt-Datum hat (erledigt_am). Ein zweites Feld
-- "erledigt ja/nein" waere eine zweite Wahrheit, die auseinanderlaufen kann.
--
-- Rechte wie das Dossier selbst: nur das Buero (admin, betriebsleitung,
-- buchhaltung) liest und schreibt.
-- =============================================================================

set search_path = public;

create table if not exists public.foerder_checkpunkte (
  id          uuid primary key default gen_random_uuid(),
  dossier_id  uuid not null references public.foerderdossiers(id) on delete cascade,
  vorlage_key text check (vorlage_key is null or vorlage_key in
                ('antragsformular', 'identifikation', 'kostenaufstellung', 'flaechennachweis', 'zahlungsbelege')),
  bezeichnung text check (bezeichnung is null or char_length(btrim(bezeichnung)) between 1 and 200),
  pflicht     boolean not null default true,
  frist_am    date,
  erledigt_am date,
  reihenfolge integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  -- Ein Punkt hat einen Text: aus dem Vorschlag oder eigenen.
  constraint foerder_checkpunkte_text_check check (vorlage_key is not null or bezeichnung is not null)
);

comment on table public.foerder_checkpunkte is
  'Checkliste je Foerderdossier (WMCNL-1448): was fuer den Antrag noch fehlt. Eigene Punkte oder allgemeine Vorschlaege (vorlage_key), kein amtlicher Katalog.';
comment on column public.foerder_checkpunkte.erledigt_am is
  'Erledigt, wenn gesetzt. Kein zweites Feld "erledigt", das auseinanderlaufen koennte.';

create index if not exists idx_foerder_checkpunkte_dossier on public.foerder_checkpunkte (dossier_id, reihenfolge);

create trigger trg_foerder_checkpunkte_updated before update on public.foerder_checkpunkte
  for each row execute function public.set_updated_at();

alter table public.foerder_checkpunkte enable row level security;
alter table public.foerder_checkpunkte force row level security;

create policy foerder_checkpunkte_select_buero on public.foerder_checkpunkte
  for select to authenticated
  using (public.has_office_access());

create policy foerder_checkpunkte_insert_buero on public.foerder_checkpunkte
  for insert to authenticated
  with check (public.has_office_access());

create policy foerder_checkpunkte_update_buero on public.foerder_checkpunkte
  for update to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());

create policy foerder_checkpunkte_delete_buero on public.foerder_checkpunkte
  for delete to authenticated
  using (public.has_office_access());

revoke all on public.foerder_checkpunkte from public;
revoke all on public.foerder_checkpunkte from anon;
grant select, insert, update, delete on public.foerder_checkpunkte to authenticated;
