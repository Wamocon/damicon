-- =============================================================================
-- Damicon - Wer nach einem Lohnsatz bezahlt wird, darf ihn lesen
-- =============================================================================
-- WMCNL-2420. Auf Buero > Qualitaetsfaktor-Lohn steht fuer die Rolle picker der
-- Satz "Wer danach bezahlt wird, darf die Grundlage sehen." Der Abschnitt
-- darunter zeigte trotzdem "Noch kein Lohnsatz hinterlegt". Die Kommentare der
-- Migrationen 20260908130000 und 20261024000000 versprechen dasselbe ("ein Lohn,
-- dessen Grundlage geheim ist, laesst sich nicht nachrechnen"), die Policies
-- lohn_saetze_select_office und lohn_steuersaetze_kz_select_office lassen aber
-- nur das Buero lesen. Die Zusage stand also im Text und fehlte in der Regel.
--
-- Neu: die Rolle picker liest die beiden Satztabellen, damit die eigene
-- Abrechnung (lohn_abrechnungen_select_own, lohn_monatsabzuege_select_own) gegen
-- ihre Grundlage nachrechenbar ist. Beide Tabellen enthalten nur Saetze
-- (Stundenlohn, kg-Satz, Faktor-Korridor, gesetzliche Prozentsaetze), keine
-- Angaben zu einzelnen Personen. Schreiben darf weiterhin nur die Buchhaltung
-- (und admin), daran aendert sich nichts.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 21.
-- =============================================================================

set search_path = public;

create policy lohn_saetze_select_picker on public.lohn_saetze
  for select to authenticated
  using (public.has_role('picker'));

create policy lohn_steuersaetze_kz_select_picker on public.lohn_steuersaetze_kz
  for select to authenticated
  using (public.has_role('picker'));
