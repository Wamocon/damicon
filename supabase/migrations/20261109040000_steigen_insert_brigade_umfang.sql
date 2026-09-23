-- =============================================================================
-- Steigen: INSERT-Policy auf die eigene Brigade begrenzen (WMCNL-2453)
-- =============================================================================
-- 20261018000000_brigade_schreibumfang.sql hat pflueckaufgaben_update_feld
-- und steigen_update_feld auf die eigene Brigade begrenzt, steigen_insert_feld
-- (aus der aelteren 20260905180000_nachweiskette.sql) dabei aber uebersehen -
-- die Policy prueft bis heute nur die Rolle (has_role('admin',
-- 'betriebsleitung', 'brigade')), nicht die Brigadenzugehoerigkeit der
-- Aufgabe. Die SELECT-Policy auf pflueckaufgaben zeigt jede Aufgabe
-- brigadeuebergreifend, das Steige-Formular ist also fuer jede sichtbare
-- Aufgabe interaktiv nutzbar.
--
-- Fuer eine fremde Aufgabe griff das Steige-INSERT deshalb bislang durch,
-- scheiterte aber am eigenen Trigger: public.steige_nummer_vergeben()
-- (20260915000000) schreibt selbst, ohne SECURITY DEFINER,
-- UPDATE pflueckaufgaben SET steigen_zaehler = steigen_zaehler + 1 - genau
-- dieses UPDATE ist ueber pflueckaufgaben_update_feld bereits brigade-
-- eingegrenzt. Das UPDATE betraf bei einer fremden Aufgabe 0 Zeilen, v_nummer
-- blieb NULL, und die Steige-Zeile scheiterte an einem NOT-NULL/Check auf die
-- Nummer mit einer technischen, irrefuehrenden Meldung ("Steige ohne
-- gueltige Pflueckaufgabe kann keine Nummer erhalten") statt einer klaren
-- Rechtemeldung. Die gesamte Transaktion wird dabei zurueckgerollt - kein
-- Datenverlust, aber eine falsche Fehlerursache fuer den Anwender.
--
-- Fix: steigen_insert_feld bekommt dieselbe Brigade-Eingrenzung wie
-- steigen_update_feld (ohne den dortigen darf_kontrollieren-Sonderfall - der
-- gilt der Vier-Augen-Kontrolle an bereits bestehenden Steigen, nicht dem
-- Neuanlegen). Eine fremde Aufgabe blockt die RLS jetzt direkt mit 42501,
-- die Oberflaeche zeigt darauf bereits "Ihre Rolle darf diesen Vorgang nicht
-- ausfuehren" (dbFehler(), lib/actions/status.ts) - dieselbe klare Meldung
-- wie bei jeder anderen RLS-Ablehnung im Feldablauf.
-- =============================================================================

set search_path = public;

drop policy if exists steigen_insert_feld on public.steigen;
create policy steigen_insert_feld on public.steigen
  for insert to authenticated
  with check (
    public.has_role('admin', 'betriebsleitung')
    or (
      public.has_role('brigade')
      and (
        pflueckaufgabe_id is null
        or exists (
          select 1 from public.pflueckaufgaben a
           where a.id = steigen.pflueckaufgabe_id
             and (a.brigade_id is null or a.brigade_id = public.current_brigade_id())
        )
      )
    )
  );

comment on policy steigen_insert_feld on public.steigen is
  'Admin/Betriebsleitung uneingeschraenkt, Brigade nur fuer Steigen ohne Aufgabenbezug oder an einer Aufgabe der eigenen bzw. noch unzugeteilten Brigade - dieselbe Eingrenzung wie steigen_update_feld/pflueckaufgaben_update_feld (20261018000000). Ersetzt die rollen-only steigen_insert_feld aus 20260905180000_nachweiskette.sql (WMCNL-2453: fremde Aufgaben scheiterten zuvor am Trigger steige_nummer_vergeben() mit einer irrefuehrenden technischen Meldung statt einer klaren Rechtemeldung).';
