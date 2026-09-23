-- WMCNL-2398: Anforderungsnummern verlassen die Oberflaeche.
--
-- Die zwei Beispielbuchungen aus 20260923010000 tragen im Belegtext eine
-- Anforderungsnummer aus dem Analysedokument. Der Text steht nicht im
-- Sprachkatalog, sondern in den Daten, und erscheint deshalb unuebersetzt in
-- der Buchungsliste unter /dashboard/buero/finanzen - fuer jede Rolle, die
-- das Finanzmodul sehen darf.
--
-- Die alte Migration bleibt unberuehrt (Regel 3 in scripts/pruefe-migrationen.mjs),
-- die schon geschriebenen Zeilen bekommen hier ihren neuen Text. Frische
-- Datenbanken erhalten ihn direkt aus supabase/seed.sql.

update public.finance_ledger_entries
set beschreibung = 'Beispielbuchung direkt an der Charge'
where beschreibung = 'Beispiel Anforderung 3.3 - direkt an der Charge gebucht';
