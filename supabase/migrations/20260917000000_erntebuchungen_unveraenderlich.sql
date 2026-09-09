-- =============================================================================
-- Damicon - Unveraenderliche Erntebuchungen (Anforderung 4.1)
-- =============================================================================
-- "Unveraenderliche Erntebuchungen, Korrektur nur als Gegenbuchung" ist im
-- Repo bereits fuer finance_ledger_entries und audit_events echt
-- unveraenderlich (block_ledger_mutation()). Der Masterplan-Audit vom
-- 08.09.2026 hat die Luecke benannt: Erntemengen, Kuehlprotokolle und
-- Behandlungen lassen sich nach Abschluss weiter direkt ueberschreiben, der
-- Schutz-Trigger fehlt. Diese Migration schliesst das fuer alle drei Bereiche:
--
--   1. pflueckaufgaben: pflueckaufgabe_freigabe_pruefen() erlaubte der
--      Betriebsleitung bisher, ist_menge_kg/ausschuss_kg/qualitaetsfaktor
--      auch nach 'abgeschlossen' weiter zu ueberschreiben (nur die Brigade
--      war ausgeschlossen). Das war die urspruengliche kritische Luecke aus
--      20260905200000_kette_haerten.sql nur zur Haelfte geschlossen - jetzt
--      sind diese Felder nach Abschluss fuer ALLE Rollen unveraenderlich,
--      genau wie der Ledger. Der Status selbst bleibt bereits unumkehrbar
--      gesperrt (bestehende Regel, unveraendert).
--   2. pflanzenschutz_behandlungen: bisher komplett ungeschuetzt - behandelt_am
--      liess sich rueckdatieren und haette damit die Wartezeitsperre eines
--      Reihenblocks unterlaufen koennen (die Sperre haengt direkt an
--      freigabe_am = behandelt_am + wartezeit_tage). Jetzt vollstaendig
--      append-only nach demselben Muster wie finance_ledger_entries.
--   3. kuehlketten_messungen: ebenfalls bisher ungeschuetzt. Eine Messung ist
--      ein Zeitpunkt-Fakt, eine Korrektur ist fachlich eine neue Messung,
--      keine Aenderung der alten. Ebenfalls vollstaendig append-only.
--
-- Fuer 2. und 3. gilt bewusst keine Rollenausnahme, auch nicht fuer
-- admin/betriebsleitung - identisch zur Strenge von finance_ledger_entries.
-- Eine Korrektur bedeutet einen neuen Datensatz, kein Ueberschreiben der
-- Historie.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. pflueckaufgaben: Erntemengen nach Abschluss fuer alle Rollen gesperrt
-- ---------------------------------------------------------------------------
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
  'Anforderung 4.1: Erntemengen (ist_menge_kg, ausschuss_kg, qualitaetsfaktor) sind nach Abschluss fuer alle Rollen unveraenderlich, keine Ausnahme mehr fuer admin/betriebsleitung. Status bleibt unumkehrbar auf abgeschlossen.';

-- ---------------------------------------------------------------------------
-- 2. + 3. pflanzenschutz_behandlungen und kuehlketten_messungen:
--    append-only fuer die Anwendung, nicht fuer den service_role-Key
-- ---------------------------------------------------------------------------
-- Bewusst NICHT block_ledger_mutation() wiederverwendet: diese Funktion
-- blockt ausnahmslos jeden Aufrufer, auch service_role, das ist fuer
-- finance_ledger_entries/audit_events richtig so (auch ein kompromittierter
-- Service-Key darf die Finanz-/Audit-Historie nicht manipulieren) - fuer
-- Behandlungen und Kuehlmessungen waere dieselbe Strenge aber operativ
-- problematisch: die gehostete Datenbank ist keine Wegwerf-Instanz, echte
-- Korrekturen und Testdaten-Aufraeumarbeiten laufen bewusst ueber den
-- service_role-Key (Server/Migrationen), niemals ueber eine angemeldete
-- Anwendungsrolle. auth.uid() ist bei einem service_role-Aufruf null (kein
-- JWT-Subject) - dasselbe Erkennungsmuster wie audit_actor_setzen() in
-- 20260905160000_haerten.sql.
create or replace function public.block_erntebuchung_mutation()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    -- Serverseitiger Aufruf (service_role): Korrektur/Testaufraeumarbeiten
    -- bleiben moeglich, laufen aber ausserhalb der Anwendung.
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  raise exception '% ist ueber die Anwendung unveraenderlich (Anforderung 4.1). % nicht erlaubt.',
    tg_table_name, tg_op
    using errcode = '23514';
end;
$$;

comment on function public.block_erntebuchung_mutation is
  'Anforderung 4.1: blockt UPDATE/DELETE fuer jede angemeldete Anwendungsrolle, auch admin/betriebsleitung. Nur ein service_role-Aufruf (auth.uid() is null, z. B. Korrektur oder Testaufraeumarbeiten) darf durch.';

create trigger trg_behandlung_no_update before update on public.pflanzenschutz_behandlungen
  for each row execute function public.block_erntebuchung_mutation();
create trigger trg_behandlung_no_delete before delete on public.pflanzenschutz_behandlungen
  for each row execute function public.block_erntebuchung_mutation();

comment on table public.pflanzenschutz_behandlungen is
  'Erntesperre nach Behandlung. Muster aus 1Cati payment-restriction-control, Bedingung = Wartezeit-Ablauf. Anforderung 4.1: ueber die Anwendung unveraenderlich - behandelt_am darf die Wartezeitsperre nicht rueckwirkend unterlaufen.';

create trigger trg_kuehlmessung_no_update before update on public.kuehlketten_messungen
  for each row execute function public.block_erntebuchung_mutation();
create trigger trg_kuehlmessung_no_delete before delete on public.kuehlketten_messungen
  for each row execute function public.block_erntebuchung_mutation();

comment on table public.kuehlketten_messungen is
  'Kuehlketten-Uhr: harte 60-Minuten-Grenze Pfluecken bis Vorkuehlung, Ziel 0-1 Grad. Anforderung 4.1: ueber die Anwendung unveraenderlich - eine Korrektur ist fachlich eine neue Messung.';
