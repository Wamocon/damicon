-- =============================================================================
-- Damicon - KI-Assistent: Werkzeugaufrufe sichtbar machen (Tool-Calling)
-- =============================================================================
-- Bisher (Migration 20260930000000) stuetzte sich der Assistent ausschliesslich
-- auf einen einmalig gebauten Text-Wissenskontext (baueGesamtWissenskontext(),
-- domain/ki-assistent.ts) - fuer Zahlen, die sich staendig aendern (MwSt-
-- Umsatz, offene ESUTD-Fristen, Kuehlketten-Status), wird dieser Kontext sofort
-- veraltet. Diese Migration ergaenzt lediglich die Spalte, in der src/lib/ai/
-- agent.ts festhaelt, WELCHE Werkzeuge fuer eine Antwort tatsaechlich
-- aufgerufen wurden (Name je Aufruf, keine Ergebnisdaten - die stehen bereits
-- im Antworttext) - fuer eine nachvollziehbare Anzeige im Chat ("gepruft:
-- MwSt-Status, Kuehlkette") und fuer das Protokoll.
--
-- Bewusst NICHT Teil dieser Migration: die eigentliche Rechenlogik der
-- Werkzeuge. Jedes Werkzeug ruft ausschliesslich bereits vorhandene, geprueften
-- Datenzugriffsfunktionen auf (ladeMwstStatus, ladeKuehlkettenUebersicht,
-- ladeOffeneEsutdFristen, ladeCompliance) - kein rohes SQL, das das Modell
-- selbst formulieren koennte. Siehe src/lib/ai/tools.ts.
-- =============================================================================

set search_path = public;

alter table public.ki_chat_nachrichten
  add column if not exists werkzeugaufrufe jsonb;

comment on column public.ki_chat_nachrichten.werkzeugaufrufe is
  'Namen der Werkzeuge, die fuer diese Antwort aufgerufen wurden (z. B. ["mwstStatusAbrufen"]), in Aufrufreihenfolge - null, wenn keine Werkzeuge liefen. Nur bei rolle = assistent gesetzt. Keine Ergebnisdaten, nur Namen fuer eine nachvollziehbare Anzeige.';
