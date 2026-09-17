-- =============================================================================
-- Damicon - Messzeitpunkt der Kuehlkette kommt vom Server, nicht vom Aufrufer
-- =============================================================================
-- kuehlkette_bewerten() uebernahm bisher jeden mitgegebenen gemessen_am-Wert
-- unveraendert ("nur ein fehlender Wert wird aus dem Geraete-Zeitstempel
-- berechnet", 20260911000000_geraete_zeitstempel.sql) und ebenso ein
-- mitgegebenes server_eingang_zeitpunkt.
--
-- Die Anwendung schickt beides nie: kuehlmessungKern() und
-- transportMessungErfassen() setzen gemessen_am ausdruecklich auf null und
-- liefern nur geraet_zeitpunkt (src/lib/actions/nachweiskette.ts,
-- src/lib/actions/lieferungen.ts). Wer aber direkt ueber die REST-API
-- schreibt - die Rolle brigade hat eine INSERT-Policy auf
-- kuehlketten_messungen - konnte den Messzeitpunkt frei waehlen und damit aus
-- einem 75-Minuten-Verstoss ein "ok" machen. Die 60-Minuten-Regel, das
-- Kernversprechen der Nachweiskette, liess sich so unterlaufen, ohne dass ein
-- Formular beteiligt war.
--
-- Diese Migration dreht die Beweislast um: fuer jeden angemeldeten Aufrufer
-- setzt der Server beide Zeitpunkte selbst. Ein trotzdem mitgegebener Wert
-- wird nicht stillschweigend ueberschrieben, sondern abgelehnt - sonst
-- glaubte der Aufrufer, sein Wert sei gespeichert.
--
-- Serverseitige Aufrufe (auth.uid() is null, also service_role: Seed,
-- Fixtures, Integrationstests mit bewusst zurueckdatierten Zeitpunkten)
-- behalten den bisherigen Weg - dasselbe Muster wie
-- block_erntebuchung_mutation() und steige_nach_abschluss_fest().
--
-- BEWUSST NICHT TEIL DIESER MIGRATION: geraet_zeitpunkt selbst bleibt ein
-- Clientwert. Er wird von geraet_zeitpunkt_pruefen() nur auf Plausibilitaet
-- geprueft (nicht in der Zukunft, hoechstens 24 h zurueck). Eine Uhr im Feld
-- laesst sich ohne Zusatzgeraet nicht beweisen; die Einengung auf dieses
-- Fenster ist die bewusste Grenze (Anforderung 2.6).
-- =============================================================================

set search_path = public;

create or replace function public.kuehlkette_bewerten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pflueck timestamptz;
begin
  if auth.uid() is null then
    -- Serverseitig: unveraendert, damit Seed und Fixtures zurueckdatieren duerfen.
    new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());
    if new.gemessen_am is null then
      new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
    end if;
  else
    if new.gemessen_am is not null or new.server_eingang_zeitpunkt is not null then
      raise exception
        'Messzeitpunkt und Servereingang setzt der Server. Bitte nur geraet_zeitpunkt mitgeben.'
        using errcode = 'check_violation';
    end if;
    new.server_eingang_zeitpunkt := now();
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  select pflueck_zeitpunkt into v_pflueck
    from public.chargen where id = new.charge_id;

  -- Eine Messung vor dem Pflueckzeitpunkt ist unmoeglich und wird abgelehnt
  -- statt stillschweigend eine negative Minutenzahl zu kappen.
  if v_pflueck is not null and new.gemessen_am < v_pflueck then
    raise exception 'Kuehlmessung kann nicht vor dem Pflueckzeitpunkt liegen.'
      using errcode = 'check_violation';
  end if;

  if v_pflueck is not null then
    new.minuten_seit_pfluecken :=
      greatest(0, (extract(epoch from (new.gemessen_am - v_pflueck)) / 60)::integer);
  else
    new.minuten_seit_pfluecken := null;
  end if;

  -- Eine deutlich zu warme Probe ist unabhaengig von der Zeitmessung ein
  -- Verstoss. Ohne bekannten Pflueckzeitpunkt laesst sich die Zeit nicht
  -- beurteilen - das ist eine Warnung, kein "ok".
  new.ergebnis := case
    when public.temperaturband_bewerten(new.temperatur_c) = 'verstoss' then 'verstoss'
    when v_pflueck is null then 'warnung'
    when new.minuten_seit_pfluecken > 60 then 'verstoss'
    when new.minuten_seit_pfluecken > 45
      or public.temperaturband_bewerten(new.temperatur_c) = 'warnung' then 'warnung'
    else 'ok'
  end;

  -- vorkuehlung_zeitpunkt ist der frueheste gemessene Zeitpunkt ueberhaupt -
  -- unabhaengig davon, ob die Zieltemperatur schon erreicht wurde.
  update public.chargen
     set vorkuehlung_zeitpunkt =
           least(coalesce(vorkuehlung_zeitpunkt, new.gemessen_am), new.gemessen_am),
         status = case
           when status = 'offen' and new.temperatur_c <= 4 then 'gekuehlt'
           else status
         end
   where id = new.charge_id;

  return new;
end;
$$;

comment on function public.kuehlkette_bewerten is
  'Bewertet eine Kuehlmessung (60-Minuten-Regel, Temperaturband) und setzt den Messzeitpunkt fuer angemeldete Aufrufer serverseitig aus geraet_zeitpunkt - ein mitgegebener gemessen_am/server_eingang_zeitpunkt wird abgelehnt (20261016000000).';

-- ---------------------------------------------------------------------------
-- Transportmessung: gleiche Regel, gleiche Begruendung
-- ---------------------------------------------------------------------------
create or replace function public.transport_kuehlkette_bewerten()
returns trigger
language plpgsql
as $$
declare
  v_status public.lieferung_status;
begin
  select status into v_status from public.lieferungen where id = new.lieferung_id;

  if v_status is null then
    raise exception 'Unbekannte Lieferung.' using errcode = '23503';
  end if;

  if v_status = 'storniert' then
    raise exception
      'Eine stornierte Lieferung fand nicht statt - dafuer laesst sich keine '
      'Transportmessung erfassen.'
      using errcode = 'DA002';
  end if;

  if auth.uid() is null then
    new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());
    if new.gemessen_am is null then
      new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
    end if;
  else
    if new.gemessen_am is not null or new.server_eingang_zeitpunkt is not null then
      raise exception
        'Messzeitpunkt und Servereingang setzt der Server. Bitte nur geraet_zeitpunkt mitgeben.'
        using errcode = 'check_violation';
    end if;
    new.server_eingang_zeitpunkt := now();
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  new.ergebnis := public.temperaturband_bewerten(new.temperatur_c);

  return new;
end;
$$;
