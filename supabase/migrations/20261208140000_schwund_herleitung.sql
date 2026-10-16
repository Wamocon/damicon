-- =============================================================================
-- Damicon - Schwund-Nutzen aus den Betriebsdaten herleiten (15.10.2026)
-- =============================================================================
-- Der Nutzen der Wirtschaftlichkeit steht als Summe und je Kategorie (Schwund, Handarbeit, Audit, Sonstiges), aber jede Zahl war eine Handeingabe oder ein
-- Modellwert. Für den Schwund gibt es Betriebsdaten: Die Chargen tragen Menge und Ausschuss, und die Verlustquote vor der Einführung steht in der Baseline
-- (kpi_baseline). Aus dem Rückgang der Verlustquote, der Jahresmenge und den Vollkosten je Kilogramm folgt, was der geringere Schwund wert ist.
--
-- Diese Funktion liefert die beiden Betriebszahlen: die Verlustquote und die Gesamtmenge (Menge plus Ausschuss) der Chargen der letzten 365 Tage bis zum
-- Stichtag. Die Rechnung selbst (Rückgang mal Menge mal Kosten je Kilogramm durch Kurs) steht in der Anwendung (herleiteSchwundNutzen), mit ihrer
-- Eingabe sichtbar neben dem Ergebnis. security invoker: es gilt die Zeilensicherheit der aufrufenden Person.
--
-- Keine Datenänderung.
-- =============================================================================

set search_path = public;

create or replace function public.schwund_herleitung(p_stichtag date default public.heute_almaty())
returns table (verlust_prozent numeric, gesamt_kg numeric, chargen integer, von date, bis date)
language sql
stable
security invoker
set search_path = public
as $$
  select round(100.0 * sum(c.ausschuss_kg) / nullif(sum(c.menge_kg + c.ausschuss_kg), 0), 2),
         sum(c.menge_kg + c.ausschuss_kg),
         count(*)::integer,
         min(c.ernte_datum),
         max(c.ernte_datum)
    from public.chargen c
   where c.menge_kg + c.ausschuss_kg > 0
     and c.ernte_datum <= p_stichtag
     and c.ernte_datum > p_stichtag - 365
  having count(*) > 0;
$$;

revoke all on function public.schwund_herleitung(date) from public, anon;
grant execute on function public.schwund_herleitung(date) to authenticated;

comment on function public.schwund_herleitung(date) is
  'Verlustquote (Ausschuss gegen Menge plus Ausschuss) und Gesamtmenge der Chargen der letzten 365 Tage bis zum Stichtag. Grundlage der Herleitung des Schwund-Nutzens. Ohne Chargen keine Zeile.';
