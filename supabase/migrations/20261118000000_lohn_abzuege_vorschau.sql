-- =============================================================================
-- Damicon - Gesetzliche Lohnabzuege fuer ein frei gewaehltes Brutto vorrechnen
-- =============================================================================
-- WMCNL-2304. Die Rechenregeln fuer ОПВ, ВОСМС und ИПН lassen sich bisher nur an
-- dem pruefen, was zufaellig in den Abrechnungen steht. Ein Bruttobetrag,
-- der den ИПН-Zweig mit positiver Steuer durchlaufen soll (ab rund 147 000 Tenge
-- im Monat), kommt in den vorhandenen Daten nicht vor.
--
-- lohn_kz_abzuege_berechnen() ist dafuer die richtige Quelle: eine reine
-- Funktion, die auch lohn_monat_abzuege_berechnen() benutzt. Diese Funktion
-- sucht nur den Satz zum Stichtag heraus (dieselbe Nachschlagelogik wie die
-- Monatsberechnung) und reicht ihn weiter. Sie schreibt nichts.
--
-- SECURITY INVOKER: wer die Saetze nicht lesen darf (lohn_steuersaetze_kz_select_
-- office), bekommt keine Zeile zurueck. Das Vorrechnen oeffnet also keinen
-- Zugriff, den die Tabelle nicht ohnehin erlaubt.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 13.
-- =============================================================================

set search_path = public;

create or replace function public.lohn_kz_abzuege_vorschau(
  p_brutto_monat_tenge numeric,
  p_stichtag           date default current_date
)
returns table (
  satz_gueltig_ab                date,
  opv_tenge                      numeric,
  vosms_tenge                    numeric,
  ipn_bemessungsgrundlage_tenge  numeric,
  ipn_tenge                      numeric,
  netto_tenge                    numeric,
  opvr_tenge                     numeric,
  so_tenge                       numeric,
  sn_tenge                       numeric,
  osms_tenge                     numeric,
  arbeitgeberkosten_gesamt_tenge numeric
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_satz public.lohn_steuersaetze_kz;
begin
  if p_brutto_monat_tenge is null or p_brutto_monat_tenge < 0 or p_brutto_monat_tenge > 100000000 then
    raise exception 'Ungueltiger Bruttobetrag.' using errcode = '22023';
  end if;

  select s.* into v_satz
    from public.lohn_steuersaetze_kz s
   where s.gueltig_ab <= p_stichtag
     and (s.gueltig_bis is null or s.gueltig_bis > p_stichtag)
   order by s.gueltig_ab desc
   limit 1;

  -- Kein Satz sichtbar: entweder gibt es zum Stichtag keinen, oder die Rolle darf
  -- die Saetze nicht lesen. Beides heisst fuer den Aufrufer "keine Zeile".
  if not found then
    return;
  end if;

  return query
    select v_satz.gueltig_ab,
           a.opv_tenge, a.vosms_tenge, a.ipn_bemessungsgrundlage_tenge, a.ipn_tenge,
           a.netto_tenge, a.opvr_tenge, a.so_tenge, a.sn_tenge, a.osms_tenge,
           a.arbeitgeberkosten_gesamt_tenge
      from public.lohn_kz_abzuege_berechnen(p_brutto_monat_tenge, v_satz) a;
end;
$$;

comment on function public.lohn_kz_abzuege_vorschau is
  'WMCNL-2304: gesetzliche Lohnabzuege fuer ein frei eingegebenes Monatsbrutto, mit dem Satz zum Stichtag. Schreibt nichts. Wer die Saetze nicht lesen darf, bekommt keine Zeile.';

grant execute on function public.lohn_kz_abzuege_vorschau(numeric, date) to authenticated;
