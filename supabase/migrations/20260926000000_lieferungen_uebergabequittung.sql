-- =============================================================================
-- Damicon - Digitale Uebergabequittung und Lieferstatus fuer Kunden
-- (Masterplan-Anforderung 3.5 Teil 2 und 5.2 Teil 2a)
-- =============================================================================
-- lieferungen stand seit dem initialen Schema als reine Verknuepfungstabelle
-- (Kunde, Charge, Vorbestellung, Menge) ohne jeden Status, ohne Nachweis der
-- tatsaechlichen Uebergabe und mit einer RLS-Luecke: lieferungen_select_intern
-- liess bisher JEDE angemeldete Rolle ALLE Lieferungen ALLER Kunden lesen.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Tourenplanung nach Lieferfenstern, ICS-Feed, Routenlogik (Anforderung
--     3.5 Teil 1) - das ist ein eigenstaendiges, deutlich groesseres Vorhaben
--     (Kartenintegration, Fahrzeug-/Zeitfenster-Logik), keine fachliche
--     Blockade fuer die Uebergabequittung, siehe Migrationskommentar unten.
--   * Rechnungshistorie (Anforderung 5.2 Teil 2b) - dafuer fehlt eine
--     fachliche Festlegung, was ueberhaupt als "Rechnung" gilt (eine aus
--     lieferungen/preislisten errechnete Proforma-Groesse, oder die
--     tatsaechlich von der Buchhaltung manuell gebuchte Ledger-Zeile in
--     finance_ledger_entries, die abweichen kann) - eine Erfindung waere kein
--     Ersatz fuer diese Entscheidung, dieselbe Kategorie offener Punkt wie
--     die UNECE-Qualitaetsklassen (Anforderung 2.9) oder die Antragsvorlagen
--     (Anforderung 4.12).
--
-- Die Uebergabequittung ist unabhaengig von der Tourenplanung sinnvoll: sie
-- beantwortet nur "was ist beim Uebergabemoment tatsaechlich passiert", nicht
-- "auf welcher Route". lieferungen.vorbestellung_id ist bereits nullable,
-- eine Lieferung existiert schon heute ohne jeden Tour-Bezug.
--
-- Wiederverwendete, bereits etablierte Muster statt neuer Konzepte:
--   * Geraet-/Server-Zeitstempel (geraet_zeitpunkt_pruefen(), Migration
--     20260911000000) - dieselbe Funktion, keine Kopie der Pruefgrenzen.
--   * Kundenscoping ueber current_b2b_kunde_id() (Migration
--     20260908120000_reklamationen.sql).
--   * Unveraenderlichkeit nach Abschluss, gleiches Governance-Prinzip wie
--     pflueckaufgaben nach Freigabe und kuehlketten_messungen.
--   * Temperaturabgleich ("logistik.todo" in messages/*.json) ueber den
--     bereits vorhandenen Join lieferungen.charge_id -> kuehlketten_messungen,
--     keine neue Temperatur-Spalte noetig.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Status + Uebergabequittung
-- ---------------------------------------------------------------------------
create type public.lieferung_status as enum ('geplant', 'zugestellt', 'storniert');

alter table public.lieferungen
  add column status public.lieferung_status not null default 'geplant',
  -- Die entgegennehmende Person beim Kunden hat in aller Regel kein eigenes
  -- System-Login, deshalb Klartext statt eines profiles-Verweises.
  add column empfaenger_name text,
  add column beleg_storage_path text,
  add column abgezeichnet_von_profil_id uuid references public.profiles(id) on delete set null,
  add column geraet_zeitpunkt timestamptz,
  add column server_eingang_zeitpunkt timestamptz;

comment on column public.lieferungen.status is
  'Anforderung 3.5/5.2: geplant/zugestellt/storniert - bewusst keine feinere '
  'Tourenplanungs-Granularitaet (kommissioniert/unterwegs), das bleibt Teil '
  'der noch offenen Tourenplanung.';
comment on column public.lieferungen.geliefert_am is
  'Zeitpunkt der Uebergabe, aus geraet_zeitpunkt validiert (siehe Trigger '
  'lieferung_uebergabe_pruefen) - existierte bereits seit dem initialen '
  'Schema, wurde aber nirgends gesetzt.';

-- ---------------------------------------------------------------------------
-- 2. Uebergabe erfassen: Geraete-Zeitstempel, Pflichtangabe, Unveraenderlichkeit
-- ---------------------------------------------------------------------------
create or replace function public.lieferung_uebergabe_pruefen()
returns trigger
language plpgsql
as $$
begin
  -- Korrektur nur als neue Zeile durchs Buero, gleiches Prinzip wie bei
  -- pflueckaufgaben nach Freigabe und kuehlketten_messungen - eine bereits
  -- zugestellte oder stornierte Lieferung ist abgeschlossen.
  if old.status in ('zugestellt', 'storniert') then
    raise exception 'Eine bereits zugestellte oder stornierte Lieferung ist unveraenderlich.'
      using errcode = '23514';
  end if;

  if new.status = 'zugestellt' then
    if new.empfaenger_name is null or btrim(new.empfaenger_name) = '' then
      raise exception 'Eine Uebergabequittung braucht den Namen der empfangenden Person.'
        using errcode = '23514';
    end if;
    new.server_eingang_zeitpunkt := now();
    new.geliefert_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);

    -- Mengenabgleich mit der Vorbestellung ("logistik.todo"): die zugehoerige
    -- Vorbestellung folgt automatisch in den Status "geliefert" nach, sofern
    -- sie nicht bereits storniert wurde - dieselbe Fortschreiben-Philosophie
    -- wie aufgabe_fortschreiben()/kuehlkette_bewerten().
    if new.vorbestellung_id is not null then
      update public.vorbestellungen
         set status = 'geliefert'
       where id = new.vorbestellung_id
         and status <> 'storniert';
    end if;
  end if;

  return new;
end;
$$;

comment on function public.lieferung_uebergabe_pruefen is
  'Anforderung 3.5: prueft und setzt geliefert_am beim Uebergang auf '
  'zugestellt, sperrt danach jede weitere Aenderung, schreibt den Status der '
  'verknuepften Vorbestellung fort.';

create trigger trg_lieferung_uebergabe before update on public.lieferungen
  for each row execute function public.lieferung_uebergabe_pruefen();

-- ---------------------------------------------------------------------------
-- 3. RLS: bisherige Luecke (jede angemeldete Rolle liest alles) schliessen
-- ---------------------------------------------------------------------------
drop policy if exists lieferungen_select_intern on public.lieferungen;

create policy lieferungen_select_kunde_buero on public.lieferungen
  for select to authenticated
  using (
    public.has_office_access()
    or public.has_role('brigade')
    or b2b_kunde_id = public.current_b2b_kunde_id()
  );

-- Anlegen einer neuen (geplanten) Lieferung bleibt Planungsaufgabe des
-- Bueros, das Erfassen der Uebergabe (UPDATE) teilen sich Buero und Brigade -
-- dieselbe Rollenaufteilung wie bei pflueckaufgaben_insert_feld.
create policy lieferungen_insert_buero on public.lieferungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

create policy lieferungen_update_feld on public.lieferungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- Dieselbe, bisher offene Luecke betraf vorbestellungen (Kontingent-
-- Vorbestellung eines Kunden) - hier nur die Lese-Haertung, da die volle
-- Schreib-/Bearbeitungslogik (Statuswechsel durchs Buero, Storno durch den
-- Kunden) Teil der noch nicht umgesetzten Anforderung 5.1 (B2B-Portal-
-- Kontingente) ist und dort eine eigene fachliche Festlegung braucht (wie
-- reserviert_kg verbraucht/zurueckgesetzt wird).
drop policy if exists vorbestellungen_select_intern on public.vorbestellungen;

create policy vorbestellungen_select_kunde_buero on public.vorbestellungen
  for select to authenticated
  using (
    public.has_office_access()
    or b2b_kunde_id = public.current_b2b_kunde_id()
  );
