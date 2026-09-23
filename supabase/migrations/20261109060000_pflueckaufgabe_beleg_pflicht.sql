-- =============================================================================
-- Pflueckaufgaben: Fotobeleg-Pflicht beim Abschluss durchsetzen (WMCNL-2373)
-- =============================================================================
-- Die Anwendung selbst behauptet, ohne Fotobeleg lasse sich eine Aufgabe
-- nicht abschliessen - durchgesetzt wurde das nirgends. Zwei belegfreie
-- Aufgaben liessen sich trotzdem auf 'abgeschlossen' setzen, darunter eine
-- bereits aus dem Startdatenbestand (PA-2026-0912-03).
--
-- public.pflueckaufgabe_freigabe_pruefen() (zuletzt
-- 20260917000000_erntebuchungen_unveraenderlich.sql) prueft beim Uebergang
-- nach 'abgeschlossen' bislang nur die Rolle, keine Belegpflicht. Diese
-- Migration ergaenzt eine EXISTS-Pruefung gegen media_belege nach demselben
-- Stil wie die Nachbarpruefungen derselben Funktion (eigene Bedingung,
-- eigene Fehlermeldung, passender errcode).
--
-- PA-2026-0912-03 aus dem Seed ist bereits abgeschlossen und traegt keinen
-- Beleg - das bleibt unberuehrt (der Trigger prueft nur beim UEBERGANG nach
-- 'abgeschlossen', old.status <> 'abgeschlossen', nicht rueckwirkend fuer
-- bereits abgeschlossene Zeilen). Diese Altdaten-Luecke bleibt dokumentiert,
-- keine stille Korrektur historischer Zeilen.
-- =============================================================================

set search_path = public;

create or replace function public.pflueckaufgabe_freigabe_pruefen()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen'
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Nur die Betriebsleitung schliesst eine Pflueckaufgabe ab.'
      using errcode = 'insufficient_privilege';
  end if;

  -- WMCNL-2373: der Fotobeleg ist der Qualitaetsnachweis je Charge - ohne
  -- ihn faellt die Rueckverfolgung lueckenhaft aus, und die nachgelagerte
  -- Lohnabrechnung beruht auf einer nicht belegten Menge.
  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen'
     and not exists (
       select 1 from public.media_belege m where m.pflueckaufgabe_id = new.id
     ) then
    raise exception 'Ohne Fotobeleg laesst sich die Aufgabe nicht abschliessen.'
      using errcode = '23514';
  end if;

  if new.qualitaetsfaktor is distinct from old.qualitaetsfaktor
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Der Qualitaetsfaktor wird von der Betriebsleitung gesetzt.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Anforderung 4.1: nach Abschluss sind Menge, Ausschuss und Qualitaetsfaktor
  -- ein abgenommener, unveraenderlicher Wert - fuer ALLE Rollen, nicht nur
  -- fuer die Brigade. Eine Korrektur ist im heutigen Datenmodell nur als
  -- neuer, gesondert dokumentierter Vorgang moeglich, kein stilles
  -- Ueberschreiben mehr, auch nicht durch admin/betriebsleitung.
  if old.status = 'abgeschlossen'
     and (new.ist_menge_kg is distinct from old.ist_menge_kg
          or new.ausschuss_kg is distinct from old.ausschuss_kg
          or new.qualitaetsfaktor is distinct from old.qualitaetsfaktor) then
    raise exception 'Menge, Ausschuss und Qualitaetsfaktor einer abgeschlossenen Aufgabe sind unveraenderlich.'
      using errcode = '23514';
  end if;

  -- Eine abgeschlossene Aufgabe bleibt abgeschlossen (unveraendert).
  if old.status = 'abgeschlossen' and new.status <> 'abgeschlossen' then
    raise exception 'Eine abgeschlossene Pflueckaufgabe laesst sich nicht zurueckdrehen.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

comment on function public.pflueckaufgabe_freigabe_pruefen is
  'Anforderung 4.1 + WMCNL-2373: Erntemengen (ist_menge_kg, ausschuss_kg, qualitaetsfaktor) sind nach Abschluss fuer alle Rollen unveraenderlich, keine Ausnahme mehr fuer admin/betriebsleitung. Status bleibt unumkehrbar auf abgeschlossen. Der Uebergang nach abgeschlossen verlangt mindestens einen Fotobeleg (media_belege).';
