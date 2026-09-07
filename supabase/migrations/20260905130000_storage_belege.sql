-- =============================================================================
-- Damicon - Meilenstein B: Ablage fuer Fotobelege und Dokumente
-- =============================================================================
-- Zwei private Buckets:
--   belege     - Fotobelege zur Pflueckaufgabe (Schale, Reihenblock, Steige).
--                Schreiben duerfen Feldrollen, denn der Beleg entsteht im Feld.
--   dokumente  - Spritzprotokolle, Vertraege, Nachweise. Schreiben duerfen die
--                Buerorollen.
-- Gelesen wird ausschliesslich ueber serverseitig erzeugte signierte URLs.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('belege', 'belege', false, 8388608,
   array['image/jpeg', 'image/png', 'image/webp']),
  ('dokumente', 'dokumente', false, 16777216,
   array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lesen: jede angemeldete Rolle darf die Belege des Betriebs sehen; die
-- Sichtbarkeit der zugehoerigen Fachdaten regeln die Tabellen-Policies.
create policy belege_select_authenticated on storage.objects
  for select to authenticated
  using (bucket_id in ('belege', 'dokumente'));

create policy belege_insert_feld on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'belege'
    and public.has_role('admin', 'betriebsleitung', 'brigade')
  );

create policy dokumente_insert_buero on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'dokumente'
    and public.has_role('admin', 'betriebsleitung', 'buchhaltung')
  );

-- Loeschen bleibt der Administration vorbehalten - ein Beleg ist ein Nachweis.
create policy belege_delete_admin on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('belege', 'dokumente')
    and public.has_role('admin')
  );
