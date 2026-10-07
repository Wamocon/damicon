-- =============================================================================
-- Damicon - Entwicklungsrest "Test123" am Lohnsatz entfernen
-- =============================================================================
-- WMCNL-2390. Die Notiz des Lohnsatzes lautete "Test123". Sie stammt aus einer
-- Eingabe waehrend der Entwicklung, nicht aus dem Seed, und steht fuer jede Rolle
-- mit Leserecht im Kasten "Lohnsatz" auf Buero > Lohn: ein Demozugang zeigt an
-- einer geldrelevanten Stelle einen Platzhalter.
--
-- Die Notiz ist reiner Freitext und fliesst in keine Berechnung ein. Der Eingriff
-- trifft genau die Saetze, deren Notiz woertlich "Test123" lautet; jede andere
-- Notiz, auch eine echte, bleibt unangetastet. Auf einer frischen Datenbank
-- (Seed) trifft die Anweisung keine Zeile.
-- =============================================================================

set search_path = public;

update public.lohn_saetze
   set notiz = null
 where notiz = 'Test123';
