-- =============================================================================
-- Transportmessung: nach Zustellung ebenso gesperrt wie nach Storno (WMCNL-2372)
-- =============================================================================
-- Die Seite behauptet im Fliesstext: "Eine zugestellte oder stornierte
-- Lieferung ist unveraenderlich." transport_kuehlkette_bewerten() lehnte
-- bislang nur 'storniert' ab - eine bereits zugestellte Lieferung liess sich
-- weiterhin um Transportmessungen ergaenzen, das UI zeigte das Formular dort
-- unveraendert weiter an. Es gibt keinen separaten "im Uebergabemoment"-Weg:
-- uebergabeErfassen() (lib/actions/lieferungen.ts) nimmt keine Temperatur
-- entgegen, jede Messung nach der Zustellung ist also ein echter, im
-- Nachhinein moeglicher Nachtrag - genau das Problem, das die Seite
-- ausschliesst.
--
-- Eigener Fehlercode statt der Wiederverwendung von DA002 (storniert): die
-- Meldung "Diese Lieferung wurde storniert" waere fuer eine zugestellte
-- Lieferung schlicht falsch. Gleiches Codemuster wie DA001-DA003
-- (lib/actions/status.ts).
-- =============================================================================

set search_path = public;

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

  if v_status = 'zugestellt' then
    raise exception
      'Diese Lieferung wurde bereits zugestellt - eine zugestellte Lieferung '
      'ist unveraenderlich, dafuer laesst sich keine Transportmessung mehr '
      'erfassen.'
      using errcode = 'DA004';
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

comment on function public.transport_kuehlkette_bewerten is
  'Prueft den Geraete-Zeitstempel, bewertet die Transporttemperatur und lehnt Messungen auf stornierten (DA002) oder bereits zugestellten (DA004, WMCNL-2372) Lieferungen ab - beide sind laut Anwendung unveraenderliche Endzustaende.';
