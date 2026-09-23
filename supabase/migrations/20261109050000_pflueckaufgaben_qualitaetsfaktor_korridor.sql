-- =============================================================================
-- Pflueckaufgaben: Korridor fuer den manuellen Qualitaetsfaktor (WMCNL-2382)
-- =============================================================================
-- pflueckaufgaben.qualitaetsfaktor (die manuelle Einschaetzung der
-- Betriebsleitung beim Abschluss, siehe Migrationskopf 20260908130000, Punkt
-- 2 - nicht zu verwechseln mit dem automatisch berechneten Lohn-
-- Qualitaetsfaktor in lohn_positionen/lohn_abrechnungen) hatte bislang weder
-- eine Vorbelegung noch eine Wertebereichspruefung: das Feld liess sich leer
-- lassen (dann blieb die Spalte NULL) oder mit jedem beliebigen Wert
-- befuellen. src/lib/actions/pflueckaufgaben.ts erzwingt seit dieser
-- Aenderung serverseitig ein Pflichtfeld im Korridor 0,90 bis 1,10 (derselbe
-- Standard-Korridor wie lohn_saetze.qualitaetsfaktor_min/max, hier bewusst
-- fest statt dynamisch nachgeschlagen - beide Felder bleiben unabhaengig
-- voneinander). Diese Migration ergaenzt dieselbe Grenze als CHECK direkt an
-- der Spalte, zweite Verteidigungslinie wie ueberall sonst in diesem Projekt.
--
-- NULL bleibt erlaubt: die Spalte traegt bei jeder noch nicht abgeschlossenen
-- Aufgabe (offen/angenommen/in_arbeit/beleg_pruefung) weiterhin keinen Wert -
-- das Pflichtfeld gilt nur fuer den Abschluss-Vorgang selbst, nicht fuer die
-- Spalte als Ganzes.
--
-- Bestandspruefung: die beiden bereits gesetzten Werte im Seed (1.08, 0.97,
-- siehe supabase/seed.sql) liegen beide im Korridor.
-- =============================================================================

set search_path = public;

alter table public.pflueckaufgaben
  add constraint pflueckaufgaben_qualitaetsfaktor_korridor
  check (qualitaetsfaktor is null or qualitaetsfaktor between 0.90 and 1.10);

comment on column public.pflueckaufgaben.qualitaetsfaktor is
  'Manuelle Einschaetzung der Betriebsleitung bei der Belegpruefung/dem Abschluss (WMCNL-2382: Korridor 0,90-1,10, wie lohn_saetze.qualitaetsfaktor_min/max, aber unabhaengig davon). Nicht der automatisch berechnete Lohn-Qualitaetsfaktor - siehe Migrationskopf 20260908130000, Punkt 2.';
