-- =============================================================================
-- Fotobelege: INSERT auf die eigene Brigade begrenzen (WMCNL-2488, Cleanup)
-- =============================================================================
-- Dieselbe Luecke wie bei den Steigen (20261109040000_steigen_insert_brigade_
-- umfang.sql), nur bei den Fotobelegen: media_belege_insert_feld
-- (20260905120000) und belege_insert_feld auf storage.objects
-- (20260905130000) fragen nur nach der Rolle. Eine Brigade konnte damit ueber
-- die Server-Aktion oder direkt ueber die API Fotos an Aufgaben fremder
-- Brigaden haengen. Die Oberflaeche blendet das Formular dort zwar aus, eine
-- Schranke ist das aber nicht.
--
-- Fix: Brigade nur an Aufgaben der eigenen oder einer noch unzugeteilten
-- Brigade - dieselbe Eingrenzung wie pflueckaufgaben_update_feld
-- (20261018000000) und steigen_insert_feld. Admin, CEO (has_role zaehlt ihn
-- als admin) und Betriebsleitung bleiben unbeschraenkt.
--
-- Storage: Der erste Ordner eines Fotobelegs ist die Aufgaben-ID
-- (belegKern in src/lib/actions/pflueckaufgaben.ts). Uebergabequittungen der
-- Lieferungen liegen im selben Bucket unter "lieferungen/" und bleiben fuer
-- die Brigade offen (logistik:update, src/lib/actions/lieferungen.ts).
-- split_part statt storage.foldername(): gleiche Wirkung, und die schnelle
-- PGlite-Pruefung (supabase/tests/pglite-fast.mjs) kennt nur ein minimales
-- storage-Schema ohne die Hilfsfunktionen.
-- =============================================================================

set search_path = public;

drop policy if exists media_belege_insert_feld on public.media_belege;

create policy media_belege_insert_feld on public.media_belege
  for insert to authenticated
  with check (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and exists (
        select 1 from public.pflueckaufgaben a
         where a.id = media_belege.pflueckaufgabe_id
           and (a.brigade_id is null or a.brigade_id = public.current_brigade_id())
      )
    )
  );

comment on policy media_belege_insert_feld on public.media_belege is
  'Admin/Betriebsleitung uneingeschraenkt, Brigade nur an Aufgaben der eigenen bzw. noch unzugeteilten Brigade - dieselbe Eingrenzung wie pflueckaufgaben_update_feld und steigen_insert_feld. Ersetzt die rollen-only Policy aus 20260905120000 (WMCNL-2488, Cleanup).';

drop policy if exists belege_insert_feld on storage.objects;

create policy belege_insert_feld on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'belege'
    and (
      public.has_role('admin', 'betriebsleitung')
      or (
        public.has_role('brigade')
        and (
          split_part(name, '/', 1) = 'lieferungen'
          or exists (
            select 1 from public.pflueckaufgaben a
             where a.id::text = split_part(name, '/', 1)
               and (a.brigade_id is null or a.brigade_id = public.current_brigade_id())
          )
        )
      )
    )
  );
