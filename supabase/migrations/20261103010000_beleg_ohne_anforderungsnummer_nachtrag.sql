-- =============================================================================
-- Damicon - Nachtrag zu 20261103000000: Trigger fuer die Korrektur oeffnen
-- =============================================================================
-- WMCNL-2398 Nachtrag. 20261103000000_beleg_ohne_anforderungsnummer.sql wollte
-- den Belegtext der beiden Beispielbuchungen aus 20260923010000 korrigieren,
-- ist aber beim Push auf die gehostete Datenbank an trg_ledger_no_update
-- gescheitert (Actions-Lauf "Datenbank-Migration", Merge von PR #102):
-- finance_ledger_entries ist ueber block_ledger_mutation() fuer JEDEN
-- Aufrufer unveraenderlich, auch fuer den service_role-Key der Migration
-- selbst (anders als bei den Erntebuchungen aus
-- 20260917000000_erntebuchungen_unveraenderlich.sql, die einen
-- service_role-Aufruf bewusst durchlassen).
--
-- Die alte Migration bleibt unveraendert (Regel 3 in
-- scripts/pruefe-migrationen.mjs, eine bereits gemergte Migration wird nicht
-- erneut ausgefuehrt). Dieser Nachtrag holt exakt dieselbe Korrektur nach dem
-- bereits etablierten Muster aus 20260920010000_testdaten_bereinigen.sql
-- nach: den Update-Trigger fuer die Dauer der einen, per WHERE eng
-- eingegrenzten Aktualisierung deaktivieren, danach sofort wieder aktivieren.
-- Frische Datenbanken brauchen diesen Nachtrag nicht, sie erhalten den Text
-- bereits korrekt aus supabase/seed.sql.
-- =============================================================================

set search_path = public;

alter table public.finance_ledger_entries disable trigger trg_ledger_no_update;

update public.finance_ledger_entries
set beschreibung = 'Beispielbuchung direkt an der Charge'
where beschreibung = 'Beispiel Anforderung 3.3 - direkt an der Charge gebucht';

alter table public.finance_ledger_entries enable trigger trg_ledger_no_update;
