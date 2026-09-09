-- =============================================================================
-- Damicon - Aufwandmenge und durchfuehrende Person (Anforderung 2.4)
-- =============================================================================
-- "Behandlungsdokumentation mit Mittel, Menge, Block, Datum, Person" - Mittel,
-- Block und Datum stehen bereits in pflanzenschutz_behandlungen, Menge fehlte
-- komplett im Domaenenmodell, Person stand nur als generischer Freitext im
-- Audit-Log (audit_events.actor), nicht strukturiert und nicht zwingend die
-- tatsaechlich ausfuehrende Person (nur wer das Formular abgeschickt hat).
--
-- aufwandmenge + aufwandmenge_einheit statt einer blossen Zahl: Pflanzenschutz-
-- mittel werden je nach Formulierung in l/ha (fluessig) oder kg/ha (fest)
-- ausgebracht, eine Einheit ohne Kontext waere falsch interpretierbar.
--
-- durchgefuehrt_von_profil_id referenziert profiles, nicht pfluecker: die
-- Behandlung erfassen laut RBAC nur admin/betriebsleitung/brigade (Ressource
-- "pflanzenschutz"), das sind Profile-Rollen, keine Pflueckenden. Nullable aus
-- Seed-Reihenfolge (gleiches Muster wie verantwortlich_profil_id in Migration
-- 20260912000000: seed.sql kann vor den Profilen laufen), die Anwendungsebene
-- erzwingt beide neuen Felder beim Erfassen (behandlungErfassen()).
--
-- pflanzenschutz_behandlungen ist seit Migration 20260917010000 ausserhalb der
-- einen erlaubten Freigabe-Ausnahme unveraenderlich - die neuen Spalten werden
-- deshalb ausschliesslich beim Anlegen gesetzt, nie nachtraeglich korrigiert.
-- =============================================================================

set search_path = public;

do $$ begin
  create type public.aufwandmenge_einheit as enum ('l_ha', 'kg_ha');
exception when duplicate_object then null;
end $$;

alter table public.pflanzenschutz_behandlungen
  add column if not exists aufwandmenge numeric(6,2),
  add column if not exists aufwandmenge_einheit public.aufwandmenge_einheit,
  add column if not exists durchgefuehrt_von_profil_id uuid references public.profiles(id) on delete set null,
  add constraint behandlung_menge_mit_einheit check (
    (aufwandmenge is null) = (aufwandmenge_einheit is null)
  );

comment on column public.pflanzenschutz_behandlungen.aufwandmenge is
  'Anforderung 2.4: ausgebrachte Menge je Hektar, immer zusammen mit aufwandmenge_einheit gesetzt. Nullable aus Seed-Reihenfolge, Anwendungsebene erzwingt das Feld bei neu erfassten Behandlungen.';
comment on column public.pflanzenschutz_behandlungen.durchgefuehrt_von_profil_id is
  'Anforderung 2.4: die tatsaechlich ausfuehrende Person, strukturiert statt als Freitext im Audit-Log. Nullable aus Seed-Reihenfolge, Anwendungsebene erzwingt das Feld bei neu erfassten Behandlungen.';
