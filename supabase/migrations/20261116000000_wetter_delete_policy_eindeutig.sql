-- =============================================================================
-- Damicon - Wettermessungen: Loeschrecht fuer die Aktualisierung, ein Tag eine Zeile
-- =============================================================================
-- WMCNL-2389. Die Tabelle "Letzte 14 Tage" zeigte 14 Zeilen fuer neun Tage, der
-- 12. bis 16.09. stand je doppelt, und die Temperatursumme war damit verzerrt.
--
-- Ursache: wetterAktualisieren() (actions/wetter.ts) ersetzt den Bestand der
-- laufenden Saison durch Loeschen und Neuschreiben. Die Migration
-- 20261007000000 gab aber nur eine INSERT- und eine UPDATE-Policy, keine fuer
-- DELETE. Unter RLS loescht ein DELETE ohne Policy keine Zeile und meldet
-- trotzdem keinen Fehler. Das Neuschreiben haengte die ganze Saison deshalb bei
-- jedem Klick auf "Jetzt aktualisieren" noch einmal an.
--
-- Diese Migration
--   1. raeumt die vorhandenen Dubletten der betriebsweiten Messreihe auf
--      (feldparzelle_id is null) und behaelt je Tag die zuletzt geschriebene
--      Zeile, deren Temperatursumme zum letzten Lauf passt,
--   2. gibt admin und betriebsleitung das Loeschrecht, wie es Einfuegen und
--      Aendern schon haben,
--   3. macht "ein Tag, eine Zeile" zur Regel der Datenbank. Der Teilindex
--      taugt nicht als Upsert-Ziel des Supabase-Clients (siehe Kopf von
--      20261007000000), die Server Action loescht und schreibt aber ohnehin
--      selbst. Ein gleichzeitiger zweiter Lauf scheitert jetzt mit 23505 statt
--      still zu verdoppeln.
-- Pruefung: supabase/tests/pglite-fast.mjs, Abschnitt 18.
-- =============================================================================

set search_path = public;

delete from public.wetter_messungen w
 using public.wetter_messungen neuer
 where w.feldparzelle_id is null
   and neuer.feldparzelle_id is null
   and w.gemessen_am = neuer.gemessen_am
   and (w.created_at, w.id) < (neuer.created_at, neuer.id);

create policy wetter_messungen_delete_leitung on public.wetter_messungen
  for delete to authenticated
  using (public.has_role('admin', 'betriebsleitung'));

create unique index if not exists wetter_messungen_betrieb_tag_eindeutig
  on public.wetter_messungen (gemessen_am)
  where feldparzelle_id is null;

comment on index public.wetter_messungen_betrieb_tag_eindeutig is
  'WMCNL-2389: die betriebsweite Messreihe (feldparzelle_id is null) hat je Tag genau eine Zeile.';
