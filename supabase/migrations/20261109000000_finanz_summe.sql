-- =============================================================================
-- Damicon - Summenfunktion fuer das Finanzjournal
-- =============================================================================
-- Die Uebersichtsseite und die Finanzseite zeigen beide Erloese und Kosten
-- eines Zeitraums. Bis hierher rechneten sie verschieden: die Kachel las das
-- Journal nach Buchungsdatum, die Seite summierte
-- deckungsbeitrag_je_kostentraeger nach Erntetag. Letzteres ist als Monatszahl
-- irrefuehrend - die View summiert alle Buchungen eines Kostentraegers ueber
-- dessen ganze Laufzeit und laesst sich nur danach eingrenzen, WANN geerntet
-- wurde, nicht danach, wann gebucht wurde. Zwei Seiten, zwei Zahlen, beide
-- "September".
--
-- Ab hier rechnen beide dasselbe: das Journal nach Buchungsdatum. Es ist die
-- Quelle, auf die sich die Oberflaeche ohnehin beruft ("unveraenderliche
-- Buchungen"), und die Zahl heisst dann genau das, was sie sagt.
--
-- Warum eine Funktion und nicht zwei Spalten im Client addiert:
-- supabase/config.toml begrenzt jede Antwort auf max_rows = 1000. Wer alle
-- Buchungen holt und selbst summiert, bekommt ab der tausendsten stillschweigend
-- eine falsche Summe - und zwar eine, die plausibel aussieht. Heute stehen 374
-- Zeilen im Journal, eine Saison bringt rund 400 dazu. Die Funktion gibt eine
-- Zeile zurueck, unabhaengig davon, wie viele sie gelesen hat.
--
-- Ohne SECURITY DEFINER: die Funktion laeuft mit den Rechten der aufrufenden
-- Rolle, RLS auf finance_ledger_entries greift also unveraendert. Wer die
-- Buchungen nicht sehen darf, bekommt auch ihre Summe nicht.
-- =============================================================================

set search_path = public;

create or replace function public.finanz_summe(
  von date default null,
  bis date default null
)
returns table (
  erloes_tenge numeric,
  kosten_tenge numeric,
  buchungen bigint
)
language sql
stable
as $$
  select
    coalesce(sum(betrag_tenge) filter (where typ = 'erloes'), 0)::numeric as erloes_tenge,
    coalesce(sum(betrag_tenge) filter (where typ = 'kosten'), 0)::numeric as kosten_tenge,
    count(*)::bigint                                                      as buchungen
  from public.finance_ledger_entries
  -- NULL heisst "nach dieser Seite offen": so deckt dieselbe Funktion den
  -- gewaehlten Monat und die Gesamtsumme ab.
  where (von is null or buchungsdatum >= von)
    and (bis is null or buchungsdatum <= bis);
$$;

comment on function public.finanz_summe(date, date) is
  'Erloese, Kosten und Anzahl der Buchungen im Zeitraum, aus dem unveraenderlichen '
  'Finanzjournal nach buchungsdatum. NULL laesst die jeweilige Grenze offen. '
  'SECURITY INVOKER: RLS auf finance_ledger_entries gilt unveraendert.';

grant execute on function public.finanz_summe(date, date) to authenticated;
