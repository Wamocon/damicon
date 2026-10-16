-- =============================================================================
-- Damicon - Nachbesserungen aus der Prüfung des Pull Requests #156 (15.10.2026)
-- =============================================================================
-- Die Prüfung (WMC-Vibecode-Cleanup) fand in den Migrationen 20261207010000 bis 20261207110000 einen P1 und mehrere P2. Diese Migration ändert
-- sie NICHT, sondern korrigiert den Endzustand (die Migrationen laufen schon in public_preview). Keine Datenänderung an vorhandenen Zeilen.
--
--   1. P1 Nachbarbetriebe: Die Policy der Brigade (abholrunden) gab ihr GANZE Zeilen der Nachbarbetriebe, auch identifikationsnummer
--      (ИИН oder БИН, bei Einzelbauern eine Personenkennung) und identitaets_digest. Ein Spaltenrecht gibt es für authenticated nicht
--      (alle Rollen teilen die Datenbankrolle). Die Policy entfällt. Die Abholrunde liest Name, Ort, Anschrift, Kontakt und Koordinaten
--      über abholrunde_nachbarbetriebe(): Das Büro sieht alle, die Brigade nur die Betriebe, die in einem Stopp stehen.
--   2. ЕСУТД: esutd_status_abgleichen() war eine security-definer-Funktion ohne revoke, über /rpc für jede Rolle (auch anon) aufrufbar und
--      schrieb pfluecker.esutd an der Zeilensicherheit vorbei. Jetzt sind die beiden Nachzieh-Trigger selbst definer, und die drei Funktionen
--      haben kein execute mehr für public, anon und authenticated.
--   3. ЕСУТД: Das Löschen eines offenen Abschlusses löschte per on delete cascade auch erfasste Änderungen und Beendigungen samt
--      Bestätigung und Beleg (die Löschpolicy der Ereignisse gilt bei der Kaskade nicht). Ein Trigger lässt es nicht mehr zu (DA017).
--   4. Abholstopps: Ein Stopp ließ sich direkt als abgeholt anlegen (mit freiem Pflückbeginn und Abholzeit, vorbei an der Geräteprüfung), und
--      Pflückbeginn und Abholzeit eines abgeholten Stopps blieben bis zum Abschluss der Runde änderbar: Aus "Verstoß" wurde "ok". Jetzt beginnt
--      ein Stopp immer geplant und ohne Abholdaten, und beide Zeitangaben sind nach der Abholung fest (DA015).
--   5. ЭСФ: Der Idempotenzschlüssel der Auslieferung war esf:<id>:<status>. Wird ein abgelehnter Beleg neu ausgestellt, ergab das denselben
--      Schlüssel, on conflict do nothing verwarf die zweite Meldung, und der korrigierte Beleg erreichte das Zielsystem nie. Der Schlüssel
--      trägt jetzt den Zeitpunkt des Statuswechsels.
--   6. Transportmessungen: logger_kennung gibt es nur bei quelle = logger (so stand es im Kommentar, der Check fehlte).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Nachbarbetriebe der Abholrunde ohne Stammdatenleck
-- ---------------------------------------------------------------------------
drop policy if exists nachbarbetriebe_select_abholrunde_brigade on public.nachbarbetriebe;

create or replace function public.abholrunde_nachbarbetriebe()
returns table (id uuid, name text, ort text, adresse text, kontakt text, breitengrad numeric, laengengrad numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.has_office_access() then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad
        from public.nachbarbetriebe n;
  elsif public.current_app_role() = 'brigade' then
    return query
      select n.id, n.name, n.ort, n.adresse, n.kontakt, n.breitengrad, n.laengengrad
        from public.nachbarbetriebe n
       where exists (select 1 from public.abholstopps s where s.nachbarbetrieb_id = n.id);
  end if;
end;
$$;

revoke all on function public.abholrunde_nachbarbetriebe() from public, anon;
grant execute on function public.abholrunde_nachbarbetriebe() to authenticated;

comment on function public.abholrunde_nachbarbetriebe() is
  'Nachbarbetriebe der Abholrunde ohne Stammdaten wie identifikationsnummer: Büro alle, Brigade nur die Betriebe in einem Abholstopp. Ersetzt die Tabellen-Policy der Brigade.';

-- ---------------------------------------------------------------------------
-- 2. ЕСУТД: Nachziehen nicht mehr über /rpc aufrufbar
-- ---------------------------------------------------------------------------
create or replace function public.esutd_vertrag_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.esutd_status_abgleichen(old.pfluecker_id);
    return old;
  end if;
  perform public.esutd_status_abgleichen(new.pfluecker_id);
  return new;
end;
$$;

create or replace function public.esutd_ereignis_nachziehen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pfluecker uuid;
begin
  select pfluecker_id into v_pfluecker from public.esutd_vertraege where id = case when tg_op = 'DELETE' then old.vertrag_id else new.vertrag_id end;
  perform public.esutd_status_abgleichen(v_pfluecker);
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.esutd_status_abgleichen(uuid) from public, anon, authenticated;
revoke all on function public.esutd_vertrag_nachziehen() from public, anon, authenticated;
revoke all on function public.esutd_ereignis_nachziehen() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. ЕСУТД: ein Vertrag mit erfassten Meldungen bleibt
-- ---------------------------------------------------------------------------
create or replace function public.esutd_vertrag_loeschen_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.esutd_ereignisse e where e.vertrag_id = old.id and e.status = 'erfasst') then
    raise exception 'Der Vertrag hat erfasste Meldungen (Aenderung oder Beendigung) und bleibt.'
      using errcode = 'DA017';
  end if;
  return old;
end;
$$;

revoke all on function public.esutd_vertrag_loeschen_pruefen() from public, anon, authenticated;

drop trigger if exists trg_esutd_vertrag_loeschen_pruefen on public.esutd_vertraege;
create trigger trg_esutd_vertrag_loeschen_pruefen
  before delete on public.esutd_vertraege
  for each row execute function public.esutd_vertrag_loeschen_pruefen();

-- ---------------------------------------------------------------------------
-- 4. Abholstopps: Beginn immer geplant, Zeitangaben nach der Abholung fest
-- ---------------------------------------------------------------------------
-- Unverändert gegenüber 20261207100000 bis auf zwei Blöcke (mit "NEU" gekennzeichnet).
create or replace function public.abholstopp_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status public.tour_status;
begin
  select status into v_status
    from public.abholrunden
   where id = case when tg_op = 'DELETE' then old.runde_id else new.runde_id end;

  -- Die Runde ist weg (Kaskade beim Loeschen einer geplanten Runde): nichts mehr zu pruefen.
  if v_status is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op in ('INSERT', 'DELETE') then
    if v_status <> 'geplant' then
      raise exception 'Stopps lassen sich nur in einer geplanten Runde anlegen oder entfernen.'
        using errcode = 'DA015';
    end if;
    -- NEU: Ein Stopp beginnt immer geplant und ohne Abholdaten. Direkt als abgeholt angelegt, liefe er an der Geraetepruefung vorbei.
    if tg_op = 'INSERT'
       and (new.status::text <> 'geplant' or new.abgeholt_am is not null or new.menge_ist_kg is not null or new.pflueckbeginn is not null) then
      raise exception 'Ein neuer Stopp beginnt immer geplant und ohne Abholdaten.'
        using errcode = 'DA015';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_status = 'abgeschlossen' then
    raise exception 'Die Abholrunde ist abgeschlossen, ihre Stopps aendern sich nicht mehr.'
      using errcode = 'DA015';
  end if;

  if new.runde_id is distinct from old.runde_id or new.nachbarbetrieb_id is distinct from old.nachbarbetrieb_id then
    raise exception 'Ein Stopp wechselt weder die Runde noch den Nachbarbetrieb.'
      using errcode = 'check_violation';
  end if;

  -- NEU: Pflueckbeginn und Abholzeit sind der Nachweis der Kuehlkette. Nach der Abholung aendern sie sich nicht mehr (Menge und
  -- Bemerkung bleiben bis zum Abschluss der Runde korrigierbar).
  if old.status::text = 'abgeholt' and new.status is not distinct from old.status
     and (new.pflueckbeginn is distinct from old.pflueckbeginn
          or new.abgeholt_am is distinct from old.abgeholt_am
          or new.geraet_zeitpunkt is distinct from old.geraet_zeitpunkt) then
    raise exception 'Pflueckbeginn und Abholzeit eines abgeholten Stopps aendern sich nicht mehr.'
      using errcode = 'DA015';
  end if;

  if new.status is distinct from old.status then
    if old.status <> 'geplant' then
      raise exception 'Dieser Stopp ist schon erledigt und aendert sich nicht mehr.'
        using errcode = 'DA015';
    end if;
    if v_status <> 'unterwegs' then
      raise exception 'Die Runde ist noch nicht gestartet. Abholungen lassen sich erst unterwegs erfassen.'
        using errcode = 'DA016';
    end if;

    if new.status = 'abgeholt' then
      new.abgeholt_am := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, now());
      if new.pflueckbeginn is not null
         and (new.pflueckbeginn > new.abgeholt_am or new.pflueckbeginn < new.abgeholt_am - interval '24 hours') then
        raise exception 'Der Pflueckbeginn muss vor der Abholung liegen, hoechstens 24 Stunden davor.'
          using errcode = 'check_violation';
      end if;
    else
      -- entfallen: nichts abgeholt, nichts zu bewerten.
      new.abgeholt_am := null;
      new.menge_ist_kg := null;
      new.pflueckbeginn := null;
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. ЭСФ: Idempotenzschlüssel je Statuswechsel
-- ---------------------------------------------------------------------------
create or replace function public.esf_beleg_einreihen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status in ('ausgestellt', 'bestaetigt') and new.status is distinct from old.status then
    perform public.integration_einreihen(
      'esf',
      'esf.beleg_' || new.status,
      jsonb_build_object(
        'belegId', new.id,
        'lieferungId', new.lieferung_id,
        'status', new.status,
        'esfNummer', new.esf_nummer,
        'ausgestelltAm', new.ausgestellt_am,
        'bestaetigtAm', new.bestaetigt_am,
        'entwurf', new.entwurf
      ),
      -- Der Zeitpunkt des Statuswechsels gehoert zum Schluessel: Wird ein abgelehnter Beleg neu ausgestellt, ist das eine neue Meldung.
      'esf:' || new.id || ':' || new.status || ':' || (extract(epoch from clock_timestamp()) * 1000000)::bigint
    );
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Transportmessungen: logger_kennung nur bei quelle = logger
-- ---------------------------------------------------------------------------
alter table public.transport_temperatur_messungen drop constraint if exists transport_messung_kennung_nur_logger;
alter table public.transport_temperatur_messungen
  add constraint transport_messung_kennung_nur_logger check (quelle = 'logger' or logger_kennung is null) not valid;
alter table public.transport_temperatur_messungen validate constraint transport_messung_kennung_nur_logger;

notify pgrst, 'reload schema';
