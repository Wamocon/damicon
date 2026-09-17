-- =============================================================================
-- Damicon - WMC-Vibecode-Cleanup: gemeinsame Temperaturbandbreite
-- =============================================================================
-- Fund aus der Gesamt-Bestandsaufnahme: die reine Temperaturklassifizierung
-- (<=4 Grad ok, 4 bis 8 Grad warnung, > 8 Grad verstoss) stand wortgleich in
-- zwei Trigger-Funktionen - kuehlkette_bewerten() (Migration 20260911000000)
-- und transport_kuehlkette_bewerten() (Migration 20260928030000), Letztere
-- kopierte die Bandbreite bewusst und dokumentiert von der ersten. Jetzt eine
-- gemeinsame, reine Funktion, beide Trigger rufen sie auf. Verhalten
-- unveraendert - reine Extract-Function-Refaktorierung, keine neue Regel.
-- =============================================================================

set search_path = public;

create or replace function public.temperaturband_bewerten(grad numeric)
returns public.kuehlkette_ergebnis
language sql
immutable
as $$
  select case
    when grad > 8 then 'verstoss'::public.kuehlkette_ergebnis
    when grad > 4 then 'warnung'::public.kuehlkette_ergebnis
    else 'ok'::public.kuehlkette_ergebnis
  end;
$$;

comment on function public.temperaturband_bewerten is
  'WMC-Vibecode-Cleanup: buendelt die reine Temperaturbandbreite (<=4 ok, 4 '
  'bis 8 warnung, > 8 verstoss), die zuvor wortgleich in kuehlkette_bewerten() '
  'und transport_kuehlkette_bewerten() stand.';

-- ---------------------------------------------------------------------------
-- transport_kuehlkette_bewerten(): reine Temperaturbewertung, direkter
-- Aufruf. Rest unveraendert gegenueber 20260928030000.
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

  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  if new.gemessen_am is null then
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  new.ergebnis := public.temperaturband_bewerten(new.temperatur_c);

  return new;
end;
$$;

comment on function public.transport_kuehlkette_bewerten is
  'Anforderung 3.2: prueft den Geraete-Zeitstempel, bewertet die '
  'Transporttemperatur ueber temperaturband_bewerten() (WMC-Vibecode-Cleanup, '
  'vorher wortgleiche Kopie der Bandbreite) und lehnt Messungen auf '
  'stornierten Lieferungen ab (SQLSTATE DA002). Bewusst ohne "for share" '
  '(siehe Migrationskommentar 20260928030000).';

-- ---------------------------------------------------------------------------
-- kuehlkette_bewerten(): Zeit UND Temperatur kombiniert - nur der reine
-- Temperaturanteil wandert in die gemeinsame Funktion, die Zeitkomponente
-- bleibt hier (hat bei Transportmessungen keine Entsprechung). Rest
-- unveraendert gegenueber 20260911000000.
-- ---------------------------------------------------------------------------
create or replace function public.kuehlkette_bewerten()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pflueck timestamptz;
begin
  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  if new.gemessen_am is null then
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  select pflueck_zeitpunkt into v_pflueck
    from public.chargen where id = new.charge_id;

  -- Wiederhergestellt aus 20260905200000_kette_haerten.sql, dabei versehentlich
  -- verloren gegangen: eine Messung vor dem Pflueckzeitpunkt ist unmoeglich und
  -- wird abgelehnt statt stillschweigend eine negative Minutenzahl zu kappen.
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
  -- beurteilen - das ist eine Warnung, kein "ok" (Ueberlebenden-Fehler, siehe
  -- 20260905200000_kette_haerten.sql).
  new.ergebnis := case
    when public.temperaturband_bewerten(new.temperatur_c) = 'verstoss' then 'verstoss'
    when v_pflueck is null then 'warnung'
    when new.minuten_seit_pfluecken > 60 then 'verstoss'
    when new.minuten_seit_pfluecken > 45
      or public.temperaturband_bewerten(new.temperatur_c) = 'warnung' then 'warnung'
    else 'ok'
  end;

  -- vorkuehlung_zeitpunkt ist der frueheste gemessene Zeitpunkt ueberhaupt -
  -- unabhaengig davon, ob die Zieltemperatur schon erreicht wurde. Nur so
  -- zaehlen auch die Chargen, die zu spaet oder zu warm ankamen, in die
  -- Kennzahl "Zeit bis zur Vorkuehlung" hinein statt lautlos zu fehlen.
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
  'Bewertet Zeit UND Temperatur seit dem Pflueckzeitpunkt (Kuehlketten-Uhr, '
  'Anforderung 3.1). Der reine Temperaturanteil laeuft ueber '
  'temperaturband_bewerten() (WMC-Vibecode-Cleanup, vorher wortgleiche Kopie '
  'mit transport_kuehlkette_bewerten()), die Zeitkomponente bleibt hier.';
