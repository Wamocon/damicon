-- =============================================================================
-- Damicon - Regulaere Freigabe bleibt trotz Anforderung 4.1 moeglich
-- =============================================================================
-- Die vorherige Migration (20260917000000) hat pflanzenschutz_behandlungen
-- fuer die Anwendung vollstaendig unveraenderlich gemacht. Das blockt aber
-- einen legitimen, bereits bestehenden Schreibpfad: reihenblock_freigeben()
-- (security invoker, siehe 20260905120000_auth_und_schreibrechte.sql) setzt
-- nach Ablauf der Wartezeit freigegeben = true - genau dieses Update wurde
-- vom Integrationstest "Sperre: Freigabe nach Ablauf der Wartezeit setzt den
-- Status zurueck" aufgedeckt.
--
-- Diese Migration ersetzt den pauschalen Update-Schutz durch einen
-- gezielten: erlaubt bleibt ausschliesslich der Uebergang freigegeben
-- false -> true, sonst nichts. behandelt_am, wartezeit_tage,
-- reihenblock_id, psm_mittel_id und dokument_id bleiben fuer jede
-- angemeldete Anwendungsrolle unveraenderlich (die eigentliche Absicht von
-- Anforderung 4.1: die Wartezeitsperre darf nicht rueckwirkend unterlaufen
-- werden). Das DELETE-Verbot aus der vorherigen Migration bleibt
-- unveraendert bestehen.
-- =============================================================================

set search_path = public;

create or replace function public.behandlung_aendern_pruefen()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    -- Serverseitiger Aufruf (service_role): Korrektur/Testaufraeumarbeiten
    -- bleiben moeglich, laufen aber ausserhalb der Anwendung.
    return new;
  end if;

  -- Regulaere Freigabe nach Ablauf der Wartezeit (reihenblock_freigeben()):
  -- ausschliesslich freigegeben false -> true, sonst identisch zur alten Zeile.
  if new.freigegeben = true and old.freigegeben = false
     and new.reihenblock_id is not distinct from old.reihenblock_id
     and new.psm_mittel_id is not distinct from old.psm_mittel_id
     and new.behandelt_am is not distinct from old.behandelt_am
     and new.wartezeit_tage is not distinct from old.wartezeit_tage
     and new.dokument_id is not distinct from old.dokument_id then
    return new;
  end if;

  raise exception 'pflanzenschutz_behandlungen ist ueber die Anwendung unveraenderlich (Anforderung 4.1), ausser der regulaeren Freigabe nach Ablauf der Wartezeit.'
    using errcode = '23514';
end;
$$;

comment on function public.behandlung_aendern_pruefen is
  'Anforderung 4.1: pflanzenschutz_behandlungen ist ueber die Anwendung unveraenderlich, mit einer einzigen Ausnahme: der Uebergang freigegeben false -> true durch reihenblock_freigeben(). Alle Bestandsfelder muessen dabei unveraendert bleiben. service_role (auth.uid() is null) bleibt unbeschraenkt.';

drop trigger if exists trg_behandlung_no_update on public.pflanzenschutz_behandlungen;
create trigger trg_behandlung_aendern before update on public.pflanzenschutz_behandlungen
  for each row execute function public.behandlung_aendern_pruefen();
