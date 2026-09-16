-- =============================================================================
-- Damicon - Wetteranbindung mit Temperatursummen-Heuristik (Masterplan-
-- Anforderung 2.13)
-- =============================================================================
-- wetter_messungen existiert seit dem allerersten Schema (20260902090000),
-- trug aber noch nie eine Schreib-Policy - nur die generelle Lese-Haertung
-- (wetter_messungen_select_intern, jede angemeldete Rolle). Diese Migration
-- erlaubt das Schreiben durch dieselben Rollen, die auch das Modul "wetter"
-- verwalten duerfen (rbac.ts: crud("rotationsplan") fuer betriebsleitung,
-- view("rotationsplan") fuer brigade - "wetter" teilt sich die Ressource mit
-- dem Rotationsplan, siehe modules.ts).
--
-- Bewusst KEINE Unique-Constraint auf (feldparzelle_id, gemessen_am): eine
-- solche Constraint muesste "feldparzelle_id is null" als Teilindex abbilden,
-- was sich ueber den Supabase-JS-Client nicht als upsert-Konfliktziel
-- ansprechen laesst. Die Server Action liest den Bestand stattdessen selbst
-- vor dem Schreiben (siehe actions/wetter.ts) - bei taeglich maximal einer
-- Zeile keine Performancefrage.
-- =============================================================================

set search_path = public;

create policy wetter_messungen_insert_leitung on public.wetter_messungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

create policy wetter_messungen_update_leitung on public.wetter_messungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));
