-- =============================================================================
-- Damicon - Nachbesserung: gemessen_am ist Pflicht, nicht nur "meist gesetzt"
-- =============================================================================
-- Uebersehen in der vorherigen Migration (20260928000000): kuehlketten_
-- messungen.gemessen_am blieb schon seit Migration 20260911000000 "not null",
-- nur der Default wurde entfernt (der Trigger fuellt vor der NOT-NULL-Pruefung,
-- siehe Kommentar dort). Ohne dieselbe Einschraenkung koennte ein direkter
-- API-Aufruf (nicht ueber die Server-Action-Kernfunktion) eine Zeile ohne
-- Messzeitpunkt hinterlassen, falls der Trigger je uebersprungen wuerde -
-- unwahrscheinlich, aber die Spalte selbst sollte das nicht zulassen. Die
-- Tabelle ist fabrikneu und leer, das Nachziehen ist gefahrlos.
-- =============================================================================

set search_path = public;

alter table public.transport_temperatur_messungen
  alter column gemessen_am set not null;
