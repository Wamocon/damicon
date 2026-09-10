-- =============================================================================
-- Damicon - Rueckverfolgung einer Reklamation bis Person, Kuehlzeit und
-- Nachbarbetrieb (Masterplan-Anforderung 3.4 und 6.3)
-- =============================================================================
-- Die Datenbank traegt die komplette Kette bereits strukturell (reklamationen
-- -> chargen -> steigen -> pfluecker, chargen -> kuehlketten_messungen,
-- chargen -> zukauf_positionen -> nachbarbetriebe), der Anwendungscode hat sie
-- bisher nirgends gezogen: ladeReklamation() joint nur bis reihenbloecke.
-- Diese Migration aendert kein Schema, nur eine RLS-Luecke, die beim
-- Nachziehen der Kette aufgefallen ist.
--
-- HOCH: kuehlketten_messungen war fuer JEDE angemeldete Rolle lesbar.
-- 20260905200000_kette_haerten.sql (Abschnitt 5) hat genau dieses Muster fuer
-- steigen bereits korrigiert, mit der Begruendung "Kunde und Erzeuger haetten
-- daraus Anwesenheitsprofile bauen koennen" - dieselbe Begruendung gilt fuer
-- kuehlketten_messungen unveraendert (jede Messung haengt 1:1 an einer
-- Charge, Kunde/Erzeuger haetten betriebsweite Kuehlkettendaten statt nur der
-- eigenen Lieferungen lesen koennen). Die Tabelle wurde damals offenbar
-- schlicht nicht mitgezogen. Ohne diese Korrektur wuerde die neue
-- Rueckverfolgung in der Anwendung zwar fuers Buero funktionieren, RLS haette
-- aber weiterhin auch Kunde/Erzeuger/Picker Rohzugriff auf die Tabelle
-- gegeben.
-- =============================================================================

set search_path = public;

drop policy if exists kuehlketten_messungen_select_intern on public.kuehlketten_messungen;
create policy kuehlketten_messungen_select_feld on public.kuehlketten_messungen
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade'));
