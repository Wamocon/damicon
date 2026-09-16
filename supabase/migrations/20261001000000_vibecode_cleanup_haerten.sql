-- =============================================================================
-- Damicon - WMC-Vibecode-Cleanup: Haertungsluecken aus der Gesamt-Bestandsaufnahme
-- =============================================================================
-- Fund aus einer projektweiten Migrations-Konsistenzpruefung (WMC-Vibecode-
-- Cleanup, alle 53 bisherigen Migrationen gelesen): vier Tabellen aktivieren
-- RLS nur ueber "enable", nicht zusaetzlich ueber "force" wie praktisch jede
-- andere sensible Tabelle im Projekt (arbeitszeiten, einwilligungen,
-- reklamationen, lohn_saetze, einarbeitung_fortschritt, schulungsteilnahmen
-- und weitere). Ohne FORCE gilt RLS nicht fuer den Tabellenbesitzer selbst -
-- in dieser Umgebung kein bekannter Angriffsweg (die Anwendung verbindet sich
-- nie als Tabellenbesitzer), aber eine Inkonsistenz gegenueber dem sonst
-- durchgaengigen Haertungsmuster, die keinen Grund hat, hier zu fehlen.
--
-- Zusaetzlicher Fund: transport_temperatur_messungen (Migration
-- 20260928000000, Anforderung 3.2) traegt denselben fachlichen Charakter wie
-- kuehlketten_messungen, naemlich lueckenloser, beweisrelevanter
-- Kuehlkettennachweis, verzichtete aber - anders als kuehlketten_messungen
-- und pflanzenschutz_behandlungen (Migration 20260917000000) - auf den
-- zweiten, von RLS unabhaengigen Verteidigungswall (Sperr-Trigger). Bisher
-- verliess sie sich ausschliesslich auf das Fehlen einer Update-/Delete-
-- Policy - dieselbe Funktion block_erntebuchung_mutation() greift hier
-- unveraendert, keine neue Funktion noetig.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. FORCE ROW LEVEL SECURITY nachziehen, wo bisher nur ENABLE stand.
-- ---------------------------------------------------------------------------
alter table public.sync_protokoll force row level security;
alter table public.transport_temperatur_messungen force row level security;
alter table public.ki_anbieter force row level security;
alter table public.ki_chat_nachrichten force row level security;

-- ---------------------------------------------------------------------------
-- 2. transport_temperatur_messungen unveraenderlich machen, analog
--    kuehlketten_messungen/pflanzenschutz_behandlungen (20260917000000).
-- ---------------------------------------------------------------------------
create trigger trg_transport_messung_no_update before update on public.transport_temperatur_messungen
  for each row execute function public.block_erntebuchung_mutation();
create trigger trg_transport_messung_no_delete before delete on public.transport_temperatur_messungen
  for each row execute function public.block_erntebuchung_mutation();

comment on table public.transport_temperatur_messungen is
  'Transportphasen-Kuehlkettennachweis (Anforderung 3.2) - append-only wie kuehlketten_messungen, block_erntebuchung_mutation() verhindert Update/Delete auch fuer den Tabellenbesitzer (WMC-Vibecode-Cleanup nachgezogen).';
