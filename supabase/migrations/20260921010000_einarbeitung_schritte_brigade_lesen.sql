-- =============================================================================
-- Damicon - Brigade liest den Einarbeitungskatalog mit (Nachtrag Anforderung 2.12)
-- =============================================================================
-- Die Ausgangsmigration (20260921000000) hat die Policy
-- einarbeitung_schritte_select auf admin/betriebsleitung/erzeuger/picker
-- beschraenkt, ihr eigener Kommentar sagt aber "alle mit Zugriff auf das
-- Modul 'schulungen' lesen" - laut rbac.ts hat auch brigade
-- view("schulungen") (Zugriff auf die Video-Bibliothek, bereits vor
-- Anforderung 2.12 vorhanden). Ohne diesen Nachtrag wuerde eine
-- Brigade-Anmeldung im Modul "schulungen" eine leere Liste statt der sechs
-- Schritte sehen: RLS liefert bei fehlender Policy keine Fehlermeldung,
-- sondern stillschweigend null Zeilen - ladeEinarbeitung() faellt dabei
-- NICHT auf die Demo-Daten zurueck, weil kein "error" auftritt, nur eine
-- leere Menge.
--
-- einarbeitung_fortschritt bleibt unveraendert: brigade hat kein
-- schulungen:complete (rbac.ts) und in aller Regel auch keine eigene
-- pfluecker_id, die With-Check-Bedingung der insert_own-Policy liefe damit
-- ohnehin ins Leere.
-- =============================================================================

set search_path = public;

drop policy einarbeitung_schritte_select on public.einarbeitung_schritte;
create policy einarbeitung_schritte_select on public.einarbeitung_schritte
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'erzeuger', 'picker', 'brigade'));
