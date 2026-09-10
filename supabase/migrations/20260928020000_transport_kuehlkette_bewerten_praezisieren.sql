-- =============================================================================
-- Damicon - Nachbesserung an transport_kuehlkette_bewerten() (adversarischer
-- Review-Fund zu Anforderung 3.2)
-- =============================================================================
-- Zwei echte Funde:
--
-- 1. Irrefuehrende Fehlermeldung: die Storno-Ablehnung nutzte bislang den
--    generischen SQLSTATE '23514', den dbFehler() (status.ts) auf
--    "fehler.regel" abbildet - Text "Die Wartezeit ist noch nicht
--    abgelaufen.". Der wurde fuer die PSM-Wartezeitsperre auf Reihenbloecke
--    geschrieben und passt inhaltlich nicht zu "diese Lieferung ist
--    storniert". Genau dieselbe Kollision hat geraet_zeitpunkt_pruefen()
--    (Migration 20260911000000) bereits geloest, dort mit einem eigenen
--    Code 'DA001' statt der ueberladenen 23514/P0001-Sammelklasse. Hier
--    jetzt derselbe Ansatz mit 'DA002'.
--
-- 2. Race Condition: die Statuspruefung war ein ungesichertes SELECT ohne
--    Sperre. Unter Read Committed (Supabase/PostgREST-Standard) kann eine
--    parallel laufende, noch nicht committete Stornierung derselben
--    Lieferung so uebersehen werden - eine Transportmessung liesse sich
--    dann noch fuer eine Lieferung erfassen, die im selben Moment storniert
--    wird. "for share" laesst die Transportmessung auf eine parallele
--    Statusaenderung derselben Zeile warten und sieht danach garantiert den
--    aktuellen Wert.
-- =============================================================================

set search_path = public;

create or replace function public.transport_kuehlkette_bewerten()
returns trigger
language plpgsql
as $$
declare
  v_status public.lieferung_status;
begin
  select status into v_status from public.lieferungen where id = new.lieferung_id for share;

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
  'lehnt Messungen auf stornierten Lieferungen ab (SQLSTATE DA002, mit '
  'for-share-Sperre gegen eine parallel laufende Stornierung).';
