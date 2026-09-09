-- =============================================================================
-- Damicon - Stichprobenkontrolle je Steige (Anforderung 2.10)
-- =============================================================================
-- "Stichprobenkontrolle der Steigen, ein Klick je Steige" - die Freigabe lag
-- bisher ausschliesslich auf Ebene der Pflueckaufgabe (aufgabeStatusSetzen()
-- von beleg_pruefung auf abgeschlossen), die Steigen-Tabelle selbst hatte kein
-- eigenes Kontroll-/Freigabefeld. Eine Aufgabe umfasst mehrere Steigen, die
-- Anforderung verlangt aber eine Pruefung je einzelner Steige.
--
-- kontrolliert_am als nullable Zeitstempel statt eines zusaetzlichen Booleans
-- (gleiches Muster wie widerrufen_am/gemeldet_am/behoben_am an anderer
-- Stelle im Schema) - "kontrolliert" ist kontrolliert_am is not null, der
-- Zeitpunkt selbst ist Teil des Nachweises.
-- =============================================================================

set search_path = public;

alter table public.steigen
  add column if not exists kontrolliert_am timestamptz,
  add column if not exists kontrolliert_von_profil_id uuid references public.profiles(id) on delete set null;

comment on column public.steigen.kontrolliert_am is
  'Anforderung 2.10: Zeitpunkt der Stichprobenkontrolle dieser einzelnen Steige, unabhaengig vom Abschluss der Pflueckaufgabe. Null = noch nicht kontrolliert.';
comment on column public.steigen.kontrolliert_von_profil_id is
  'Anforderung 2.10: wer die Stichprobenkontrolle durchgefuehrt hat.';
