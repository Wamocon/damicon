-- =============================================================================
-- Damicon - Schreibrecht fuer die Kundenadresse (Nachtrag zu 20261010000000)
-- =============================================================================
-- b2b_kunden trug bislang ueberhaupt keine Schreib-Policy fuer authenticated -
-- Kunden entstehen bisher ausschliesslich ueber den Einladungsfluss
-- (service_role, Migration 20261002000000). Die Tourenplanung braucht aber
-- einen Weg, eine Adresse nachzutragen/zu korrigieren - dafuer reicht ein
-- UPDATE-Recht fuers Buero, kein INSERT: eine neue Firma entsteht weiterhin
-- ausschliesslich ueber die Einladung, nicht durch dieses Formular.
-- =============================================================================

set search_path = public;

create policy b2b_kunden_update_buero on public.b2b_kunden
  for update to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());
