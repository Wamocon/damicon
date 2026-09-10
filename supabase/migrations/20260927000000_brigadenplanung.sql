-- =============================================================================
-- Damicon - Brigadenplanung: Schicht-Konzept, Reserveliste, Bedarfsrechnung
-- (Masterplan-Anforderung 2.11 Teil 2, ohne Wetterszenarien)
-- =============================================================================
-- Modul "personal" hatte Reifegrad "demo" (PersonalDemo, hartkodierte
-- Beispieldaten), kein Schicht-Konzept, keine Reserveliste, keine
-- Bedarfsrechnung.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: Wetterszenarien. Anforderung 2.13
-- (Wetteranbindung) ist im Masterplan-Audit bereits als "bewusst offen,
-- Prioritaet P2, 2027" eingestuft (WMCNL-1603/1604) - eine bereits
-- getroffene, dokumentierte Zurueckstellung, keine neue Entscheidung dieser
-- Migration.
--
-- Kein Schema-Neubau fuer Schicht-Konzept und Reserveliste noetig - beide
-- lassen sich aus bereits vorhandenen, nullbaren Spalten ableiten, ohne eine
-- Kennzahl zu erfinden:
--   * Schicht = welche Brigade an welchem Tag wie viele Reihenbloecke
--     zugewiesen hat, direkt aus rotationsplan_eintraege.brigade_id/
--     geplant_fuer (Migration 20260910000000, Rotationsplan-Engine).
--   * Reserveliste = ein Pfluecker ohne aktuelle Brigadenzuordnung
--     (pfluecker.brigade_id is null), dieselbe Spalten-Semantik, die das
--     initiale Schema bereits vorsieht.
--   * Bedarfsrechnung = wie viele fuer die naechsten Tage geplante
--     Reihenbloecke noch KEINER Brigade zugewiesen sind - eine direkt
--     gezaehlte, nicht erfundene Groesse (kein Verhaeltnis "Pfluecker je
--     Hektar" o. ae., das eine fachliche Festlegung waere).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Schicht-Konzept: Brigade-Einsatz je Tag
-- ---------------------------------------------------------------------------
create view public.brigade_einsatzplan
with (security_invoker = true)
as
select
  r.geplant_fuer,
  b.id as brigade_id,
  b.name as brigade_name,
  b.staerke,
  count(*) as bloecke_zugewiesen
from public.rotationsplan_eintraege r
join public.brigaden b on b.id = r.brigade_id
where r.status = 'geplant'
group by r.geplant_fuer, b.id, b.name, b.staerke
order by r.geplant_fuer, b.name;

comment on view public.brigade_einsatzplan is
  'Anforderung 2.11: Schicht-Konzept - welche Brigade ist an welchem Tag fuer '
  'wie viele Reihenbloecke eingeteilt, direkt aus rotationsplan_eintraege '
  'abgeleitet.';

grant select on public.brigade_einsatzplan to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Bedarfsrechnung: geplante Reihenbloecke je Tag ohne Brigade
-- ---------------------------------------------------------------------------
create view public.brigadenplanung_bedarf
with (security_invoker = true)
as
select
  r.geplant_fuer,
  count(*) as bloecke_gesamt,
  count(*) filter (where r.brigade_id is not null) as bloecke_zugewiesen,
  count(*) filter (where r.brigade_id is null) as bloecke_offen
from public.rotationsplan_eintraege r
where r.status = 'geplant'
group by r.geplant_fuer
order by r.geplant_fuer;

comment on view public.brigadenplanung_bedarf is
  'Anforderung 2.11: Bedarfsrechnung - je geplantem Erntetag die Anzahl '
  'Reihenbloecke insgesamt, bereits einer Brigade zugewiesen und noch offen. '
  'Bewusst keine Pfluecker-je-Block-Kennzahl (fachliche Festlegung, nicht '
  'Teil dieser Migration), nur die direkt gezaehlte Zuweisungsluecke.';

grant select on public.brigadenplanung_bedarf to authenticated;
