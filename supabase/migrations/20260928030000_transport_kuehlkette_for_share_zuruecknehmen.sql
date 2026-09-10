-- =============================================================================
-- Damicon - "for share" aus transport_kuehlkette_bewerten() zurueckgenommen
-- (selbst verursachter Fehler der vorherigen Migration 20260928020000)
-- =============================================================================
-- Die vorherige Migration fuegte "for share" an die Statuspruefung an, um die
-- dort gefundene Race Condition (parallele Stornierung waehrend eines
-- Inserts) abzusichern. Beim Nachtest mit einer echten "kunde"-Sitzung
-- (Integrationstest "Anforderung 3.2: ein Kunde erfasst keine
-- Transportmessung") zeigte sich, dass genau diese Aenderung selbst einen
-- neuen, echten Fehler einfuehrt: mit "for share" liefert
--   select status into v_status from public.lieferungen where id = ... for share
-- fuer eine angemeldete "kunde"-Rolle KEINE Zeile mehr, obwohl dieselbe
-- Person dieselbe Lieferung ueber einen gewoehnlichen (ungesperrten) SELECT
-- weiterhin problemlos liest (per Testskript direkt nachgestellt, nicht nur
-- vermutet). Die lieferungen_select_kunde_buero-Policy dieser Rolle haengt
-- ueber current_b2b_kunde_id() an einer SECURITY-DEFINER-Funktion - in
-- genau dieser Kombination mit einer Sperrklausel (FOR SHARE/UPDATE) liefert
-- die Zeile keine sichtbaren Datensaetze mehr, die Funktion faellt
-- faelschlich auf "Unbekannte Lieferung" (23503) zurueck.
--
-- Praktische Tragweite gering (kunde darf ohnehin nie einfuegen,
-- transport_messungen_insert_feld laesst nur admin/betriebsleitung/brigade
-- zu - deren lieferungen-Sichtbarkeit haengt nicht von current_b2b_kunde_id()
-- ab, siehe has_office_access()/has_role('brigade')), aber ein Trigger darf
-- fuer eine tatsaechlich existierende, fuer die aufrufende Rolle sichtbare
-- Lieferung nicht "Unbekannte Lieferung" behaupten. Eine kaputte Sperre ist
-- schlechter als die schmale, bereits an anderer Stelle des Projekts
-- akzeptierte Race Condition (siehe kuehlkette_bewerten(), das denselben
-- ungesperrten Lesezugriff auf chargen nutzt) - deshalb Ruecknahme statt
-- eines Workarounds an dieser Stelle.
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

  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  if new.gemessen_am is null then
    new.gemessen_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  -- Dieselbe reine Temperaturbandbreite wie in kuehlkette_bewerten()
  -- (Migration 20260911000000) - siehe Migrationskommentar in
  -- 20260928000000_transport_temperaturlogger.sql.
  new.ergebnis := case
    when new.temperatur_c > 8 then 'verstoss'
    when new.temperatur_c > 4 then 'warnung'
    else 'ok'
  end;

  return new;
end;
$$;

comment on function public.transport_kuehlkette_bewerten is
  'Anforderung 3.2: prueft den Geraete-Zeitstempel, bewertet die '
  'Transporttemperatur (dieselbe Bandbreite wie kuehlkette_bewerten()) und '
  'lehnt Messungen auf stornierten Lieferungen ab (SQLSTATE DA002). Bewusst '
  'ohne "for share" (siehe Migrationskommentar 20260928030000) - das '
  'Schmalspur-Race-Fenster ist dieselbe akzeptierte Klasse wie bei '
  'kuehlkette_bewerten(), eine Sperre brach hier die Sichtbarkeit fuer die '
  '"kunde"-Rolle ueber eine SECURITY-DEFINER-RLS-Policy.';
