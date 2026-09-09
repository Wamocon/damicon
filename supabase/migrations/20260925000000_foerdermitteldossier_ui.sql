-- =============================================================================
-- Damicon - Foerdermitteldossier als bedienbares UI-Modul (Masterplan-Anforderung 4.12)
-- =============================================================================
-- foerderdossiers stand seit dem initialen Schema als reines Container-
-- Datenmodell (WMCNL-1640 bestaetigt Schema + Seed-Daten), aber ohne jedes
-- Schreibrecht (nur die office-Select-Policy aus 20260902090100_rls_policies.sql,
-- keine INSERT/UPDATE-Policy - Prototyp-Stand "Schreibzugriff ausschliesslich
-- ueber service_role") und ohne jede Oberflaeche. rbac.ts gibt
-- betriebsleitung/buchhaltung bereits seit langem crud("foerdermittel"),
-- lief bisher aber ins Leere.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: echte Antragsvorlagen fuer
-- gosagro.kz/qoldau.kz. Das waere eine fachliche Festlegung (welche Felder,
-- welche Nachweise verlangt der jeweilige Foerdertopf tatsaechlich), die eine
-- Erfindung waere, keine Umsetzung - dieselbe Kategorie offener Punkt wie die
-- UNECE-Qualitaetsklassen (Anforderung 2.9/Fragenkatalog), die einen
-- Agronomen brauchen. Umgesetzt wird der buchfuehrungsnahe Teil, der sich
-- tatsaechlich technisch abschliessen laesst: Dossier anlegen, Status und
-- Frist pflegen, angehaengte Nachweisdokumente sehen (Container-Muster aus
-- dem Tabellenkommentar, bisher nur ueber den Zufall gleicher Freitexte in
-- dokumente.bezug/foerderdossiers.antragsnummer erkennbar, nicht ueber eine
-- echte Verknuepfung).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Fristenmonitor + Notizen
-- ---------------------------------------------------------------------------
alter table public.foerderdossiers
  add column if not exists frist_am date,
  add column if not exists notizen text;

comment on column public.foerderdossiers.frist_am is
  'Anforderung 4.12: naechste Frist (Antrags-, Nachweis- oder Berichtsfrist je nach Status), Grundlage des Fristenmonitors in der Oberflaeche.';

-- Bisher voellig freier Text - ohne einen geschlossenen Wertebereich wuerde
-- die Oberflaeche (Statuspille je Wert, Filterlogik) staendig neue,
-- inkonsistente Schreibweisen riskieren.
alter table public.foerderdossiers
  add constraint foerderdossiers_status_wertebereich
    check (status in ('entwurf', 'eingereicht', 'in_pruefung', 'bewilligt', 'abgelehnt', 'ausgezahlt'));

-- ---------------------------------------------------------------------------
-- 2. Schreibrechte (bisher komplett ohne INSERT/UPDATE-Policy)
-- ---------------------------------------------------------------------------
create policy foerderdossiers_insert_buero on public.foerderdossiers
  for insert to authenticated
  with check (public.has_office_access());

create policy foerderdossiers_update_buero on public.foerderdossiers
  for update to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());

-- ---------------------------------------------------------------------------
-- 3. Echte Verknuepfung zu Nachweisdokumenten (Container-Muster)
-- ---------------------------------------------------------------------------
alter table public.dokumente
  add column if not exists foerderdossier_id uuid references public.foerderdossiers(id) on delete set null;
create index if not exists idx_dokumente_foerderdossier on public.dokumente(foerderdossier_id);

-- Backfill: die einzige bisherige Seed-Zeile war nur ueber gleichlautenden
-- Freitext erkennbar (dokumente.bezug = 'Antrag 2026-114' entspricht
-- foerderdossiers.antragsnummer = '2026-114').
update public.dokumente d
   set foerderdossier_id = f.id
  from public.foerderdossiers f
 where d.bezug = 'Antrag ' || f.antragsnummer
   and d.foerderdossier_id is null;
