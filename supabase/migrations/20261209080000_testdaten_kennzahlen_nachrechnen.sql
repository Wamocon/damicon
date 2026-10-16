-- Testdaten Kennzahlenverlauf nachrechnen (Datenänderung, idempotent).
--
-- kpi_verlauf bekommt täglich einen Messpunkt je Kennzahl (Dienstschlüssel-Lauf um 03:10). Die Messpunkte ab 25.09.2026 stammen aus der Zeit
-- vor den Testdaten der Saisonfortsetzung (Migration 20261209020000) und tragen deshalb nur die damaligen Betriebsdaten. Diese Migration
-- rechnet die Tage vom 25.09.2026 bis heute aus dem jetzigen Stand nach. kpi_verlauf_nachrechnen() korrigiert vorhandene Punkte, statt sie
-- zu verdoppeln, und ändert nichts vor dem 25.09.2026.
--
-- Schutz: nur mit Betriebsdaten und erst, wenn die Saisonfortsetzung angelegt ist. Eine leere Datenbank bleibt unverändert.

select public.kpi_verlauf_nachrechnen(date '2026-09-25', public.heute_almaty(), 1)
 where exists (select 1 from public.pflueckaufgaben where id::text like '7e57da7a-0000-4000-8000-10%')
   and public.heute_almaty() >= date '2026-09-25';
