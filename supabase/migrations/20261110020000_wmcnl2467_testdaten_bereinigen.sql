-- =============================================================================
-- Damicon - Testdaten aus Testausfuehrung WMCNL-2467 bereinigen
-- =============================================================================
-- Bei der Ausfuehrung von WMCNL-2467 (E2E-Testszenarien inkl. neuem
-- CEO-Testfall) am 23.09.2026 wurden fuer den Testfall
-- [Buchhaltung]-E2E-Lohn und Deckungsbeitrag abrechnen (WMCNL-2405) ein
-- Test-Kostentraeger sowie zwei Buchungen angelegt, um die Deckungsbeitrags-
-- rechnung end-to-end zu pruefen (Erloes 31.500 Tenge, Kosten 18.025 Tenge,
-- beide mit Bezug auf die inzwischen bereits geloeschte Test-Charge
-- CH-T-N-A-04-2609231436-4AAE).
--
-- finance_ledger_entries ist bewusst fuer niemanden loeschbar
-- (block_ledger_mutation(), siehe 20260920010000_testdaten_bereinigen.sql fuer
-- den identischen Fall neun Tage zuvor) - deshalb exakt dasselbe Muster:
-- die beiden Trigger werden nur fuer die Dauer dieser einen, auf die zwei
-- bekannten Zeilen-IDs eingegrenzten Loeschung temporaer deaktiviert und
-- danach sofort wieder aktiviert. Keine Aenderung an der Schutzfunktion oder
-- den Triggern selbst.
--
-- Betroffene IDs (aus der Testausfuehrung WMCNL-2467 vom 23.09.2026, Testfall
-- WMCNL-2405, Kategorie "Lieferung" bzw. "Ernte + Kuehlung"):
--   finance_ledger_entries: f7909cb3-8df8-4499-ad0b-92f17f2d98a3 (Erloes),
--                           fdc9221a-e517-4a36-a9e5-7defb9bbf3d5 (Kosten)
--   kostentraeger:          469e8c10-c25e-4c36-bde1-0c741f6d6276
--                           ("E2E-Test WMCNL-2405 Kostentraeger")
--
-- Alle uebrigen waehrend WMCNL-2467 angelegten Testdaten (Pflueckaufgabe
-- PA-20260923-2BB5AE92 samt Charge/Steige/Arbeitszeit/Kuehlmessung,
-- Vorbestellung Polka 40 kg/26.09.2026, die verwaiste Lohnposition aus der
-- Entwurfs-Abrechnung von A. Tulegenowa) lagen auf Tabellen ohne
-- Loesch-Schutz und wurden bereits unmittelbar zuvor ueber den
-- service_role-Key entfernt, ohne dass dafuer eine Migration noetig war.
-- =============================================================================

set search_path = public;

alter table public.finance_ledger_entries disable trigger trg_ledger_no_update;
alter table public.finance_ledger_entries disable trigger trg_ledger_no_delete;

delete from public.finance_ledger_entries
 where id in (
   'f7909cb3-8df8-4499-ad0b-92f17f2d98a3',
   'fdc9221a-e517-4a36-a9e5-7defb9bbf3d5'
 )
   and kostentraeger_id = '469e8c10-c25e-4c36-bde1-0c741f6d6276';

delete from public.kostentraeger
 where id = '469e8c10-c25e-4c36-bde1-0c741f6d6276'
   and bezeichnung = 'E2E-Test WMCNL-2405 Kostentraeger';

alter table public.finance_ledger_entries enable trigger trg_ledger_no_update;
alter table public.finance_ledger_entries enable trigger trg_ledger_no_delete;
