-- =============================================================================
-- Damicon - Schulungsvideos: Dateien je Sprache und Wiedergabe (15.10.2026)
-- =============================================================================
-- Die Tabelle schulungsvideos kennt Titel, Thema und Sprachen, aber keine Datei: das Portal konnte kein Video abspielen. Jetzt gibt es je Video und Sprache
-- eine Datei in einem privaten Speicher (Bucket "schulungsvideos"), und das Portal spielt die Datei in der Sprache der Person ab.
--
--   * schulungsvideo_dateien: eine Zeile je Video und Sprache (de, en, ru, kk), mit Pfad, Größe und Endung. Ein Auslöser hält schulungsvideos.sprachen aktuell.
--   * Hochladen, Ersetzen und Entfernen: Administration und Betriebsleitung. Der Upload läuft wie bei den Originalen der Wissensbasis direkt vom Browser
--     (wiederaufnehmbar, TUS) mit der Sitzung der Person; die Policy auf storage.objects erlaubt das Schreiben nur diesen Rollen.
--   * Lesen: jede angemeldete Rolle außer Kunde, über kurzlebige signierte Adressen, die der Server nach der Rechteprüfung (schulungen:view) erzeugt.
--   * Bucket: privat, je Datei höchstens 500 MB, nur MP4 und WebM.
--
-- Keine Datenänderung an vorhandenen Zeilen. Die Tabelle ist neu und leer.
-- =============================================================================

set search_path = public;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('schulungsvideos', 'schulungsvideos', false, 524288000, array['video/mp4', 'video/webm'])
on conflict (id) do nothing;

create table if not exists public.schulungsvideo_dateien (
  id            uuid primary key default gen_random_uuid(),
  video_id      uuid not null references public.schulungsvideos(id) on delete cascade,
  sprache       text not null check (sprache in ('de', 'en', 'ru', 'kk')),
  storage_path  text not null check (char_length(storage_path) between 5 and 300),
  dateiname     text,
  groesse_bytes bigint not null check (groesse_bytes > 0 and groesse_bytes <= 524288000),
  hochgeladen_von uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (video_id, sprache)
);

comment on table public.schulungsvideo_dateien is 'Videodatei je Schulungsvideo und Sprache, im privaten Bucket schulungsvideos. Wiedergabe über signierte Adressen.';

create trigger trg_schulungsvideo_dateien_updated before update on public.schulungsvideo_dateien
  for each row execute function public.set_updated_at();

-- schulungsvideos.sprachen folgt den Dateien (sortiert, ohne Doppelte)
create or replace function public.schulungsvideo_sprachen_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_video uuid := case when tg_op = 'DELETE' then old.video_id else new.video_id end;
begin
  update public.schulungsvideos s
     set sprachen = coalesce((select array_agg(d.sprache order by d.sprache) from public.schulungsvideo_dateien d where d.video_id = s.id), '{}')
   where s.id = v_video;
  return null;
end;
$$;

drop trigger if exists trg_schulungsvideo_sprachen on public.schulungsvideo_dateien;
create trigger trg_schulungsvideo_sprachen
  after insert or update of sprache, video_id or delete on public.schulungsvideo_dateien
  for each row execute function public.schulungsvideo_sprachen_nachziehen();

alter table public.schulungsvideo_dateien enable row level security;
alter table public.schulungsvideo_dateien force row level security;

create policy schulungsvideo_dateien_select on public.schulungsvideo_dateien
  for select to authenticated
  using (coalesce(public.current_app_role() <> 'kunde', false));

create policy schulungsvideo_dateien_insert on public.schulungsvideo_dateien
  for insert to authenticated
  with check (coalesce(public.has_role('admin', 'betriebsleitung'), false));

create policy schulungsvideo_dateien_update on public.schulungsvideo_dateien
  for update to authenticated
  using (coalesce(public.has_role('admin', 'betriebsleitung'), false))
  with check (coalesce(public.has_role('admin', 'betriebsleitung'), false));

create policy schulungsvideo_dateien_delete on public.schulungsvideo_dateien
  for delete to authenticated
  using (coalesce(public.has_role('admin', 'betriebsleitung'), false));

-- Supabase vergibt auf neue Tabellen im Schema public volle Rechte an anon und authenticated: erst alles zurücknehmen, dann spaltenweise vergeben.
revoke all on public.schulungsvideo_dateien from public, anon, authenticated;
grant select, insert, delete on public.schulungsvideo_dateien to authenticated;
grant update (storage_path, dateiname, groesse_bytes, hochgeladen_von) on public.schulungsvideo_dateien to authenticated;

-- ---------------------------------------------------------------------------
-- Speicher
-- ---------------------------------------------------------------------------
create policy schulungsvideos_objekte_select on storage.objects
  for select to authenticated
  using (bucket_id = 'schulungsvideos' and coalesce(public.current_app_role() <> 'kunde', false));

create policy schulungsvideos_objekte_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'schulungsvideos' and coalesce(public.has_role('admin', 'betriebsleitung'), false));

create policy schulungsvideos_objekte_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'schulungsvideos' and coalesce(public.has_role('admin', 'betriebsleitung'), false));
