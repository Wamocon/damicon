-- =============================================================================
-- Damicon - Preisstaffelung je Kundengruppe (Masterplan-Anforderung 5.1/5.2)
-- =============================================================================
-- Bislang offene fachliche Festlegung, siehe Migrationskommentar
-- 20260929000000: "Eine Kundengruppen-Segmentierung wäre derselbe offene
-- Punkt wie die UNECE-Qualitätsklassen". Nutzer-Entscheidung fuer diesen
-- Umsetzungsschritt: feste Kundengruppe an b2b_kunden (kein frei verwaltbares
-- Gruppen-Register, keine Preis-Zuordnung direkt je einzelnem Kunden). Eine
-- Preisliste ohne Kundengruppe gilt als Standard-Fallback fuer alle Kunden,
-- auch fuer noch nicht zugeordnete.
--
-- Ausserdem: fuer preislisten/preislisten_positionen gab es bislang
-- ueberhaupt keine Schreib-Policy (nur die *_select_intern-Policies aus
-- Migration 20260905160000) - Preislisten entstanden bislang ausschliesslich
-- ueber service_role (Migration/Seed). Dieser Nachtrag ergaenzt das um
-- Buero-Schreibrechte, ohne die bestehenden Lesepolicies anzufassen.
-- =============================================================================

set search_path = public;

create type public.kundengruppe as enum ('handel', 'gastronomie', 'einzelhandel');

alter table public.b2b_kunden
  add column if not exists kundengruppe public.kundengruppe;
comment on column public.b2b_kunden.kundengruppe is
  'Anforderung 5.1/5.2: feste Kundengruppe fuer die Preisstaffelung. null = noch nicht zugeordnet, sieht ausschliesslich die gruppenlose Standard-Preisliste.';

alter table public.preislisten
  add column if not exists kundengruppe public.kundengruppe;
comment on column public.preislisten.kundengruppe is
  'null = Standard-Preisliste, gilt als Fallback fuer alle Kundengruppen und fuer Kunden ohne zugeordnete Gruppe. Gesetzt = gilt nur fuer diese Kundengruppe und geht einer passenden Standard-Preisliste vor (siehe preisAmStichtag()).';

-- b2b_kunden.kundengruppe ist bereits durch die bestehende Policy
-- b2b_kunden_update_buero (Migration 20261010010000) abgedeckt, kein
-- spaltenspezifisches Schreibrecht noetig.

create policy preislisten_write_buero on public.preislisten
  for all to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());

create policy preislisten_positionen_write_buero on public.preislisten_positionen
  for all to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());
