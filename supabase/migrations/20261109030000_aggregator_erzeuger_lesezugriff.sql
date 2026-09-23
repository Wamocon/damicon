-- =============================================================================
-- Aggregator: Lesezugriff fuer erzeuger auf nachbarbetriebe/zukauf_positionen
-- (WMCNL-2369)
-- =============================================================================
-- src/lib/rbac.ts gibt der Rolle "erzeuger" seit laengerem crud("aggregator")
-- (siehe 20260908140000_aggregator_zukauf.sql, Punkt 3) - die Anwendung zeigt
-- ihr also das komplette Aggregator-Modul samt Import-Formular an. Die
-- SELECT-Policies auf nachbarbetriebe und zukauf_positionen stammen aber noch
-- aus der pauschalen Buero-Schleife in 20260902090100_rls_policies.sql
-- (using (public.has_office_access())) und wurden von der gezielten
-- Rollen-Nachbesserung in 20261023000000_lesezugriff_nach_rolle.sql NICHT
-- erfasst - jene Migration hat fuer erzeuger ausdruecklich nur die
-- Produktionssicht (reihenbloecke/pflueckaufgaben/...) und chargen
-- nachgezogen, nachbarbetriebe/zukauf_positionen blieben aussen vor.
--
-- Folge: ein erzeuger sieht auf /de/dashboard/markt/aggregator durchweg
-- Nullwerte und keine "Bekannte Nachbarbetriebe" (RLS filtert alle Zeilen
-- kommentarlos heraus, kein Fehler, also bleibt die "Live-Daten"-Kennzeichnung
-- bestehen) - das Kernmodul der Rolle ist damit unbenutzbar, und der eigene
-- CSV-Import weist real angebundene Betriebe faelschlich als "nicht bekannt"
-- ab, weil die Referenzliste (ladeNachbarbetriebe()) leer ankommt.
--
-- Schreibrechte bleiben unveraendert admin/betriebsleitung (siehe die dortige
-- Begruendung, Punkt 3: bewusst offene Self-Service-Frage, kein Teil dieses
-- Befunds) - hier geht es ausschliesslich um das fehlende Leserecht.
-- =============================================================================

set search_path = public;

drop policy if exists nachbarbetriebe_select_office on public.nachbarbetriebe;
create policy nachbarbetriebe_select_office_erzeuger on public.nachbarbetriebe
  for select to authenticated
  using (public.has_office_access() or public.has_role('erzeuger'));

drop policy if exists zukauf_positionen_select_office on public.zukauf_positionen;
create policy zukauf_positionen_select_office_erzeuger on public.zukauf_positionen
  for select to authenticated
  using (public.has_office_access() or public.has_role('erzeuger'));

comment on policy nachbarbetriebe_select_office_erzeuger on public.nachbarbetriebe is
  'Buero (has_office_access) und erzeuger lesen die Nachbarbetrieb-Stammdaten - erzeuger hat laut rbac.ts crud("aggregator"), das Aggregator-Modul ist das Kernmodul der Rolle (WMCNL-2369). Ersetzt nachbarbetriebe_select_office aus 20260902090100_rls_policies.sql.';
comment on policy zukauf_positionen_select_office_erzeuger on public.zukauf_positionen is
  'Buero (has_office_access) und erzeuger lesen die Zukaufpositionen - siehe nachbarbetriebe_select_office_erzeuger, dieselbe Luecke (WMCNL-2369). Ersetzt zukauf_positionen_select_office aus 20260902090100_rls_policies.sql.';
