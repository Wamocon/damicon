-- =============================================================================
-- Wartezeitsperre am Reihenblock bekommt einen eigenen Fehlercode (WMCNL-2472)
-- =============================================================================
-- pflueckaufgabe_sperre_pruefen() (20260905160000_haerten.sql) meldet die
-- Wartezeitsperre bisher ueber errcode = 'check_violation' (23514) - genau
-- den Sammelcode, den dbFehler() (src/lib/actions/status.ts) pauschal auf
-- fehler.regel ("Nicht moeglich: Die Wartezeit ist noch nicht abgelaufen.")
-- abbildet. JEDE andere 23514/P0001-Bedingung im Schreibpfad auf
-- pflueckaufgaben (z. B. pflueckaufgabe_freigabe_pruefen(): "abgeschlossene
-- Aufgabe laesst sich nicht zurueckdrehen") zeigt deshalb woertlich dieselbe
-- Wartezeit-Meldung, selbst wenn mit einer Wartezeit gar nichts zu tun ist -
-- gleiches ueberladenes Codemuster wie bei DA001-DA004 an anderer Stelle.
--
-- Gemeldeter Fall (Testausfuehrung WMCNL-2467, WMCNL-2472): Betriebsleitung
-- schliesst eine Pflueckaufgabe im Status Belegpruefung ab (Freigeben +
-- Qualitaetsfaktor), obwohl laut Rueckstandsnachweis auf derselben Seite
-- beide Behandlungen des zugehoerigen Reihenblocks laengst als eingehalten
-- markiert sind. Die Wartezeit JE BEHANDLUNG (pflanzenschutz_behandlungen.
-- freigabe_am, rein datumsbasiert) ist aber nur die halbe Regel:
-- reihenbloecke.status bleibt 'wartezeitgesperrt', bis jemand mit
-- "approve"-Recht den Block zusaetzlich ueber reihenblock_freigeben()
-- manuell freigibt - eine separate Aktion im Bereich Reihenbloecke/
-- Rotationsplan (src/lib/actions/reihenbloecke.ts), die auf der
-- Beleg-pruefen-Seite der Pflueckaufgabe nirgends sichtbar ist. Die
-- generische Meldung "Wartezeit ist noch nicht abgelaufen" ist in diesem
-- Fall zusaetzlich sachlich irrefuehrend: die Wartezeit je Behandlung ist ja
-- bereits abgelaufen, es fehlt die gesonderte Blockfreigabe.
--
-- Fix: eigener Code DA005 mit einer Meldung, die die tatsaechlich fehlende
-- Aktion benennt. Die Regel selbst (keine Ernte an einem wartezeitgesperrten
-- Block) bleibt unveraendert - das ist eine Pflanzenschutz-Auflage, keine
-- Darstellungsfrage.
-- =============================================================================

set search_path = public;

create or replace function public.pflueckaufgabe_sperre_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_status public.reihenblock_status;
  v_code   text;
begin
  select status, code
    into v_status, v_code
    from public.reihenbloecke
   where id = new.reihenblock_id;

  if v_status = 'wartezeitgesperrt' then
    raise exception
      'Reihenblock % ist wartezeitgesperrt - der Block muss zusaetzlich zur Behandlungs-Wartezeit ueber Reihenbloecke freigegeben werden.', v_code
      using errcode = 'DA005';
  end if;

  return new;
end;
$$;

comment on function public.pflueckaufgabe_sperre_pruefen is
  'Verhindert Ernte/Statuswechsel/Mengenmeldung an einem wartezeitgesperrten Reihenblock. Eigener Fehlercode DA005 statt der ueberladenen 23514-Sammelklasse (WMCNL-2472): die Blockfreigabe ist ein separater, manueller Schritt (reihenblock_freigeben()), unabhaengig von der je Behandlung bereits abgelaufenen Wartezeit, und verdient eine eigene, zutreffende Meldung statt der pauschalen "Wartezeit"-Meldung.';
