-- =============================================================================
-- Damicon - Kennzahlen-Verlauf nur fuer die Rollen, die die Kennzahl sehen
-- =============================================================================
-- Bisher durfte jedes angemeldete Konto jede Zeile von public.kpi_verlauf lesen
-- (kpi_verlauf_select_intern, using (true)). Welche Rolle welche Kennzahl
-- sieht, entschied allein die Anwendung (sichtbarFuer in src/lib/domain/kpis.ts,
-- ceo zusaetzlich ueberall, wo admin steht). Seit der KI-Assistent Himbi mit
-- dem allgemeinen Werkzeug datenLesen jede Tabelle unter RLS lesen kann, reichte
-- das nicht mehr: ein Kunde oder ein Pfluecker haette sich ueber Himbi den
-- Verlauf von Deckungsbeitrag oder Verlustquote holen koennen (Befund vom
-- 28.09.2026, Nutzerentscheidung "auf die Rollen einschraenken").
--
-- Jetzt zieht die Datenbank dieselbe Grenze wie die Anwendung, je Kennzahl:
--   - public.kpi_sichtbar(schluessel) spiegelt sichtbarFuer. has_role() laesst
--     ceo ueberall zu, wo admin steht, genau wie kpisFuerRolle().
--   - Eine Kennzahl, die hier (noch) nicht steht, sehen nur admin und ceo -
--     lieber zu eng als zu weit. supabase/tests/uebersicht.ts prueft, dass die
--     Liste hier und sichtbarFuer in kpis.ts uebereinstimmen.
--   - public.kpi_trend ist eine Sicht mit security_invoker und folgt damit
--     automatisch.
-- Schreiben bleibt, wie es war (nur service_role bzw. die security-definer-
-- Funktionen kpi_verlauf_schreiben und kpi_verlauf_nachrechnen).
-- =============================================================================

set search_path = public;

create or replace function public.kpi_sichtbar(p_schluessel text)
returns boolean
language sql
stable
set search_path = public
as $$
  select case p_schluessel
    when 'verlustquote'          then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'vermarktungsfaehig'    then public.has_role('admin', 'betriebsleitung')
    when 'zeitBisVorkuehlung'    then public.has_role('admin', 'betriebsleitung', 'brigade')
    when 'zeitBisKunde'          then public.has_role('admin', 'betriebsleitung')
    when 'pflueckleistung'       then public.has_role('admin', 'betriebsleitung', 'brigade')
    when 'pflueckStreuung'       then public.has_role('admin', 'betriebsleitung', 'brigade')
    when 'pflueckintervall'      then public.has_role('admin', 'betriebsleitung', 'brigade')
    when 'behandlungenWartezeit' then public.has_role('admin', 'betriebsleitung', 'brigade')
    when 'reklamationsquote'     then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'liefertreue'           then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'belegteVerkaeufe'      then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'deckungsbeitrag'       then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'esutdAbdeckung'        then public.has_role('admin', 'betriebsleitung', 'buchhaltung')
    when 'websiteAnfragen'       then public.has_role('admin', 'betriebsleitung')
    else public.has_role('admin')
  end;
$$;

comment on function public.kpi_sichtbar is
  'Darf die angemeldete Rolle diese Kennzahl sehen? Spiegelt sichtbarFuer in src/lib/domain/kpis.ts; unbekannte Kennzahlen nur admin und ceo.';

revoke all on function public.kpi_sichtbar(text) from public;
grant execute on function public.kpi_sichtbar(text) to authenticated;

drop policy if exists kpi_verlauf_select_intern on public.kpi_verlauf;
drop policy if exists kpi_verlauf_select_rolle on public.kpi_verlauf;

create policy kpi_verlauf_select_rolle on public.kpi_verlauf
  for select to authenticated
  using (public.kpi_sichtbar(schluessel));
