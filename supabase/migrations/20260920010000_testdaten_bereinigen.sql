-- =============================================================================
-- Damicon - Einmalige Bereinigung von Testdaten in finance_ledger_entries
-- =============================================================================
-- Bei der Testentwicklung fuer Anforderung 4.3 sind versehentlich zwei echte
-- Testbuchungen in finance_ledger_entries gelandet (kategorie = 'Test'), samt
-- des zugehoerigen Test-Kostentraegers. finance_ledger_entries ist bewusst
-- fuer niemanden loeschbar (block_ledger_mutation(), bereits im urspruenglichen
-- Schema so angelegt, nicht Teil dieser Session) - genau deshalb ist diese
-- Migration noetig: die beiden Trigger werden fuer die Dauer dieser einen,
-- exakt auf die zwei bekannten Zeilen-IDs eingegrenzten Loeschung temporaer
-- deaktiviert und danach sofort wieder aktiviert. Keine Aenderung an der
-- Schutzfunktion oder den Triggern selbst, nur eine einmalige, chirurgische
-- Korrektur der durch den Testlauf entstandenen Fehldaten.
--
-- Betroffene IDs (identifiziert ueber kategorie = 'Test', eindeutig aus dem
-- Testlauf vom 09.09.2026, keine Produktivbuchung traegt diese Kategorie):
--   finance_ledger_entries: f44db9af-9b04-495e-a106-aa1772eecadb,
--                           5c7b33d5-88f3-4a80-89d9-c31889026b57
--   kostentraeger:          01e87aa0-49ee-424f-8903-9cbcdc63202b,
--                           40945290-c7c5-48c1-9de1-7d3fdbed8caf
--
-- Kuenftige Tests fuer Anforderung 4.3 duerfen aus genau diesem Grund keine
-- echten finance_ledger_entries-Zeilen mehr anlegen, siehe Korrektur im
-- Integrationstest (supabase/tests/integration.mjs).
-- =============================================================================

set search_path = public;

alter table public.finance_ledger_entries disable trigger trg_ledger_no_update;
alter table public.finance_ledger_entries disable trigger trg_ledger_no_delete;

delete from public.finance_ledger_entries
 where id in (
   'f44db9af-9b04-495e-a106-aa1772eecadb',
   '5c7b33d5-88f3-4a80-89d9-c31889026b57'
 )
   and kategorie = 'Test';

delete from public.kostentraeger
 where id in (
   '01e87aa0-49ee-424f-8903-9cbcdc63202b',
   '40945290-c7c5-48c1-9de1-7d3fdbed8caf'
 )
   and bezeichnung like '\_\_it\_dbkg%';

alter table public.finance_ledger_entries enable trigger trg_ledger_no_update;
alter table public.finance_ledger_entries enable trigger trg_ledger_no_delete;
