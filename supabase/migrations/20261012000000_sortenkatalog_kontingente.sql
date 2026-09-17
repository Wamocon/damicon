-- =============================================================================
-- Damicon - Kontingent-Verwaltung und aggregierte Verfuegbarkeit je Sorte
-- (Masterplan-Modul "Sorten- und Kontingentkatalog", bisher reifegrad "demo")
-- =============================================================================
-- sorten hat bereits Schreib-RLS (sorten_insert_leitung/sorten_update_leitung,
-- Migration 20260905120000). kontingente dagegen war bislang vollstaendig
-- schreibgeschuetzt - nur der Trigger vorbestellung_kontingent_abgleichen()
-- durfte reserviert_kg fortschreiben (Migration 20261006000000). Das Buero
-- hatte keinen Weg, ein Kontingent ueberhaupt erst anzulegen oder die
-- vereinbarte Menge (menge_kg) zu aendern.
--
-- Nutzer-Entscheidung: zusaetzlich eine aggregierte Verfuegbarkeits-Uebersicht
-- je Sorte/Saison (Summe ueber alle Kunden, ohne einzelne Kundenzuordnung
-- offenzulegen) - entspricht dem Balken "reserviert/Kontingent gesamt" aus
-- der bisherigen Demo-Oberflaeche.
-- =============================================================================

set search_path = public;

-- Kein delete: ein Kontingent bleibt bestehen, auch wenn nichts mehr
-- reserviert ist - dieselbe "nie loeschen, nur pflegen"-Haltung wie bei
-- preislisten (Migration 20261011000000). "for all" spiegelt trotzdem die
-- for-all-Konvention der anderen Write-Policies dieser Session, die
-- Anwendung selbst bietet nur anlegen/Menge aendern an.
create policy kontingente_write_leitung on public.kontingente
  for all to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Aggregierte Verfuegbarkeit je Sorte/Saison. Anders als
-- abrechnung_je_nachbarbetrieb()/lohn_periode_berechnen() bewusst OHNE
-- has_role()-Pruefung in der Funktion: das Ergebnis enthaelt keine
-- Kundenzuordnung (nur Sorte, Saison und Summen), darf also von jeder
-- angemeldeten Rolle abgerufen werden - die Beschraenkung auf "authenticated"
-- (kein anon) erfolgt allein ueber grant/revoke unten.
create or replace function public.kontingent_verfuegbarkeit_je_sorte()
returns table (
  sorte_id             uuid,
  sorte_name           text,
  saison               text,
  menge_kg_gesamt      numeric,
  reserviert_kg_gesamt numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    s.id,
    s.name,
    k.saison,
    sum(k.menge_kg),
    sum(k.reserviert_kg)
  from public.kontingente k
  join public.sorten s on s.id = k.sorte_id
  group by s.id, s.name, k.saison
  order by s.name, k.saison desc;
$$;

comment on function public.kontingent_verfuegbarkeit_je_sorte is
  'Sorten- und Kontingentkatalog: Summe ueber alle Kunden je Sorte/Saison, ohne einzelne Kundenzuordnung - fuer die Verfuegbarkeits-Uebersicht, die jede angemeldete Rolle sehen darf (siehe grant unten).';

revoke all on function public.kontingent_verfuegbarkeit_je_sorte() from public;
grant execute on function public.kontingent_verfuegbarkeit_je_sorte() to authenticated;
