-- =============================================================================
-- Damicon - B2B-Portal: Preisliste einsehen und Vorbestellung aufgeben
-- (Masterplan-Anforderung 5.1, Teil 2 von 2)
-- =============================================================================
-- b2b_portal-ansicht.tsx zeigt seit Anforderung 3.5 Teil 2/5.2 Teil 2a bereits
-- "Meine Lieferungen" (Lieferstatus). Diese Migration ergaenzt den zweiten,
-- bislang komplett fehlenden Teil: vorbestellungen hatte seit dem initialen
-- Schema ueberhaupt keine INSERT-/UPDATE-Policy fuer eine "kunde"- oder
-- Buero-Rolle - eine Vorbestellung liess sich ausschliesslich per
-- service_role (Seed/Server) anlegen, nie durch das Portal selbst.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Kontingent-Verbrauch (kontingente.reserviert_kg wird bei einer
--     Vorbestellung weder geprueft noch fortgeschrieben) - dieselbe offene
--     fachliche Festlegung wie bereits in der Uebergabequittungs-Migration
--     (20260926000000) dokumentiert: wie reserviert_kg verbraucht/
--     zurueckgesetzt wird, ist keine technische, sondern eine betriebliche
--     Entscheidung. Eine Vorbestellung bleibt deshalb bewusst eine reine
--     ANFRAGE (status startet als 'angefragt'), die das Buero manuell
--     gegen den bekannten Kontingent-Stand prueft und bestaetigt - genau die
--     Pruefung, fuer die der Status-Übergang ohnehin schon existiert.
--   * Preisliste je Kundengruppe (im Anforderungstext genannt) - es gibt im
--     Schema keine Kundengruppen-Zuordnung zu preislisten, nur "aktiv"/
--     Gueltigkeitszeitraum. Eine Kundengruppen-Segmentierung waere dieselbe
--     Kategorie offener Punkt wie die UNECE-Qualitaetsklassen (Anforderung
--     2.9) - alle aktiven Preislisten werden deshalb allen Kunden gleich
--     angezeigt, keine erfundene Segmentierung.
--
-- kontingente-RLS-Haertung im selben Zug: die Tabelle traegt seit dem
-- initialen Schema noch die aus 20260905160000_haerten.sql geerbte
-- "kontingente_select_intern" (jede angemeldete Rolle liest ALLE Kontingente
-- ALLER Kunden) - dieselbe Luecken-Klasse, die fuer kuehlketten_messungen
-- (20260922000000), lieferungen und vorbestellungen (20260926000000) bereits
-- geschlossen wurde, hier nachgezogen, obwohl der Verbrauch selbst (siehe
-- oben) noch offen bleibt.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. kontingente: Lese-Haertung (dieselbe Rollenaufteilung wie lieferungen).
--    Ein Kontingent ohne Kundenbezug (b2b_kunde_id ist nullable) ist keinem
--    Kunden zugeordnet - bleibt bewusst nur fuers Buero/Brigade sichtbar,
--    keine Gleichheitspruefung gegen null.
-- ---------------------------------------------------------------------------
drop policy if exists kontingente_select_intern on public.kontingente;

create policy kontingente_select_kunde_buero on public.kontingente
  for select to authenticated
  using (
    public.has_office_access()
    or public.has_role('brigade')
    or b2b_kunde_id = public.current_b2b_kunde_id()
  );

-- ---------------------------------------------------------------------------
-- 2. vorbestellungen: Anlegen (Kunde fuer die eigene Firma, Buero fuer jede)
--    und ein enges Storno-Update fuer den Kunden. Die volle Statuspflege
--    (bestaetigt/storniert/geliefert) bleibt dem Buero vorbehalten -
--    "geliefert" wird ohnehin bereits automatisch durch
--    lieferung_uebergabe_pruefen() (Migration 20260926000000) fortgeschrieben.
-- ---------------------------------------------------------------------------
create policy vorbestellungen_insert_kunde_buero on public.vorbestellungen
  for insert to authenticated
  with check (
    b2b_kunde_id = public.current_b2b_kunde_id()
    or public.has_role('admin', 'betriebsleitung')
  );

create policy vorbestellungen_update_buero on public.vorbestellungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Eigene, noch nicht bestaetigte Vorbestellung stornieren - nach der
-- Bestaetigung durch das Buero ist das nur noch dessen Aufgabe (Ruecksprache
-- statt stillem Storno einer bereits zugesagten Menge).
create policy vorbestellungen_update_kunde_storno on public.vorbestellungen
  for update to authenticated
  using (b2b_kunde_id = public.current_b2b_kunde_id() and status = 'angefragt')
  with check (b2b_kunde_id = public.current_b2b_kunde_id() and status = 'storniert');
