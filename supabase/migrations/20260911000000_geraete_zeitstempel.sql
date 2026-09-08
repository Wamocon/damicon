-- =============================================================================
-- Damicon - Getrennte Zeitstempel fuer Geraet und Servereingang
-- =============================================================================
-- Anforderung 2.6 aus dem Masterplan (P1): "Ohne diese Trennung ist die
-- 60-Minuten-Kennzahl bei verzoegerter Synchronisierung nicht messbar."
--
-- Der Fehler bisher, konkret: aufgabe_fortschreiben() setzte
-- chargen.pflueck_zeitpunkt auf now() im Moment, in dem der Statuswechsel auf
-- 'in_arbeit' beim SERVER ankam - nicht im Moment, in dem die Brigade auf dem
-- Feld tatsaechlich mit dem Pfluecken begann. Bei einer Synchronisierung mit
-- Verzoegerung (kein Netz auf der Flaeche) verschiebt sich der gemessene
-- Start der Kuehlkettenuhr genau um diese Verzoegerung nach hinten - ein
-- echter 90-Minuten-Verstoss kann so als unauffaellige 45-Minuten-Messung
-- erscheinen. Dieselbe Luecke betraf kuehlketten_messungen.gemessen_am und
-- steigen.scan_zeitpunkt.
--
-- Loesung: das Geraet liefert seinen eigenen Zeitstempel mit (vom Client
-- gesetzt, nicht vom Server erraten). Der Servereingang wird IMMER zusaetzlich
-- aufgezeichnet, nie ueberschrieben - so bleibt eine Verzoegerung sichtbar,
-- statt sie zu verstecken. Ein Geraet-Zeitstempel wird nur uebernommen, wenn
-- er plausibel ist (nicht in der Zukunft, nicht unplausibel weit in der
-- Vergangenheit) - eine gefaelschte fruehe Pflueckzeit wuerde sonst einen
-- echten Verstoss verdecken koennen. "Plausibel" ist datenbankseitig
-- durchgesetzt, nicht nur im Formular.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Gemeinsamer Pruefbaustein
-- ---------------------------------------------------------------------------
-- Liefert den Geraet-Zeitpunkt zurueck, wenn er plausibel ist, sonst den
-- Servereingang als ehrlichen Rueckfall. "Plausibel": nicht mehr als 5 Minuten
-- in der Zukunft (Taktabweichung zwischen Geraeten), nicht mehr als 24 Stunden
-- vor dem Servereingang (eine laengere Offline-Phase auf einer drei Hektar
-- grossen Flaeche ist kein plausibles Feldszenario, eher eine falsch gestellte
-- Geraeteuhr oder ein Uebertragungsfehler).
create or replace function public.geraet_zeitpunkt_pruefen(
  p_geraet timestamptz,
  p_server timestamptz default now()
)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_geraet is null then
    return p_server;
  end if;

  -- Eigener SQLSTATE (nicht der generische 23514/check_violation): dieser
  -- Code steht bereits fuer die Wartezeitsperre (dbFehler() in
  -- lib/actions/status.ts mappt ihn auf "Die Wartezeit ist noch nicht
  -- abgelaufen.") - eine unplausible Geraeteuhr braucht eine eigene,
  -- zutreffende Meldung statt dieser falschen.
  if p_geraet > p_server + interval '5 minutes' then
    raise exception
      'Geraete-Zeitstempel % liegt in der Zukunft (Servereingang %). Bitte Geraeteuhr pruefen.',
      p_geraet, p_server
      using errcode = 'DA001';
  end if;

  if p_geraet < p_server - interval '24 hours' then
    raise exception
      'Geraete-Zeitstempel % liegt mehr als 24 Stunden vor dem Servereingang %. '
      'Vermutlich eine falsch gestellte Geraeteuhr - bitte pruefen.',
      p_geraet, p_server
      using errcode = 'DA001';
  end if;

  return p_geraet;
end;
$$;

comment on function public.geraet_zeitpunkt_pruefen is
  'Anforderung 2.6: gibt den Geraete-Zeitstempel zurueck, wenn plausibel, sonst '
  'den Servereingang. Zentral fuer pflueckaufgaben, kuehlketten_messungen und '
  'steigen - eine Stelle, keine Kopie der Grenzwerte je Tabelle.';

-- ---------------------------------------------------------------------------
-- 2. pflueckaufgaben: Arbeitsbeginn
-- ---------------------------------------------------------------------------
alter table public.pflueckaufgaben
  add column if not exists arbeitsbeginn_geraet_zeitpunkt timestamptz,
  add column if not exists arbeitsbeginn_server_eingang timestamptz;

comment on column public.pflueckaufgaben.arbeitsbeginn_geraet_zeitpunkt is
  'Vom Client beim Statuswechsel auf in_arbeit mitgegebener Zeitpunkt (lokale '
  'Geraeteuhr) - startet die Kuehlkettenuhr, wenn plausibel.';
comment on column public.pflueckaufgaben.arbeitsbeginn_server_eingang is
  'Wann der Statuswechsel tatsaechlich beim Server ankam - unveraendert, auch '
  'wenn der Geraete-Zeitstempel verwendet wird. Macht eine Synchronisierungs-'
  'verzoegerung sichtbar statt sie zu verstecken.';

-- Servereingang immer festhalten, unabhaengig davon, ob der Geraete-
-- Zeitstempel plausibel ist. Eigener BEFORE-Trigger, weil
-- aufgabe_fortschreiben() als AFTER-Trigger NEW nicht mehr aendern kann.
create or replace function public.pflueckaufgabe_server_eingang_stempeln()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'in_arbeit' and old.status <> 'in_arbeit' then
    new.arbeitsbeginn_server_eingang := now();
  end if;
  return new;
end;
$$;

drop trigger if exists trg_pflueckaufgabe_server_eingang on public.pflueckaufgaben;
create trigger trg_pflueckaufgabe_server_eingang
  before update on public.pflueckaufgaben
  for each row execute function public.pflueckaufgabe_server_eingang_stempeln();

-- aufgabe_fortschreiben() (Migration 20260905180000): der Start der
-- Kuehlkettenuhr nutzt jetzt den geprueften Geraete-Zeitstempel statt now().
-- trg_pflueckaufgabe_server_eingang ist BEFORE, aufgabe_fortschreiben AFTER -
-- new.arbeitsbeginn_server_eingang ist zum Zeitpunkt dieses Aufrufs bereits
-- gesetzt.
create or replace function public.aufgabe_fortschreiben()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'in_arbeit' and old.status <> 'in_arbeit' then
    update public.chargen
       set pflueck_zeitpunkt = coalesce(
             pflueck_zeitpunkt,
             public.geraet_zeitpunkt_pruefen(
               new.arbeitsbeginn_geraet_zeitpunkt,
               coalesce(new.arbeitsbeginn_server_eingang, now())
             )
           )
     where pflueckaufgabe_id = new.id;
  end if;

  if new.ist_menge_kg is distinct from old.ist_menge_kg then
    update public.chargen
       set menge_kg = new.ist_menge_kg
     where pflueckaufgabe_id = new.id;
  end if;

  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen' then
    update public.reihenbloecke r
       set letzte_ernte = greatest(
             coalesce(r.letzte_ernte, '-infinity'::date),
             coalesce(
               (select c.ernte_datum from public.chargen c
                 where c.pflueckaufgabe_id = new.id),
               current_date
             )
           )
     where r.id = new.reihenblock_id;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. kuehlketten_messungen: gemessen_am wird zum geprueften Geraete-Zeitpunkt
-- ---------------------------------------------------------------------------
alter table public.kuehlketten_messungen
  add column if not exists geraet_zeitpunkt timestamptz,
  add column if not exists server_eingang_zeitpunkt timestamptz;

-- Der bisherige "not null default now()" wuerde gemessen_am schon vor dem
-- Trigger fuellen (Spaltenvorgaben wirken vor BEFORE-Triggern) - dann liesse
-- sich im Trigger nicht mehr unterscheiden "bewusst mitgegeben" von "einfach
-- nicht gesetzt". Ohne Default kommt ein nicht mitgegebener Wert als NULL an,
-- die NOT-NULL-Pruefung selbst greift weiterhin erst nach dem Trigger.
alter table public.kuehlketten_messungen alter column gemessen_am drop default;

comment on column public.kuehlketten_messungen.geraet_zeitpunkt is
  'Vom Client mitgegebener Messzeitpunkt (lokale Geraeteuhr). gemessen_am '
  'uebernimmt ihn, wenn plausibel - siehe geraet_zeitpunkt_pruefen().';
comment on column public.kuehlketten_messungen.server_eingang_zeitpunkt is
  'Wann die Messung tatsaechlich beim Server ankam - unveraendert.';

-- kuehlkette_bewerten() (Migration 20260905180000): gemessen_am wird jetzt
-- selbst vom Trigger gesetzt (aus geraet_zeitpunkt, geprueft), nicht mehr
-- unveraendert aus der Anwendung uebernommen.
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

  -- Ein ausdruecklich mitgegebener gemessen_am-Wert (Seed-Daten, Test-
  -- Fixtures mit bewusst zurueckdatierten Zeitpunkten) bleibt unangetastet -
  -- nur ein fehlender Wert wird aus dem Geraete-Zeitstempel berechnet. Ohne
  -- diese Unterscheidung wuerde z. B. ein Testfall "vor 999 Tagen gemessen"
  -- beim Insert stillschweigend auf "jetzt" ueberschrieben.
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
    when new.temperatur_c > 8 then 'verstoss'
    when v_pflueck is null then 'warnung'
    when new.minuten_seit_pfluecken > 60 then 'verstoss'
    when new.minuten_seit_pfluecken > 45 or new.temperatur_c > 4 then 'warnung'
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

-- ---------------------------------------------------------------------------
-- 4. steigen: derselbe Mechanismus fuer den Scan-Zeitpunkt
-- ---------------------------------------------------------------------------
alter table public.steigen
  add column if not exists geraet_zeitpunkt timestamptz,
  add column if not exists server_eingang_zeitpunkt timestamptz;

comment on column public.steigen.geraet_zeitpunkt is
  'Vom Client mitgegebener Scan-Zeitpunkt (lokale Geraeteuhr). scan_zeitpunkt '
  'uebernimmt ihn, wenn plausibel.';
comment on column public.steigen.server_eingang_zeitpunkt is
  'Wann die Steige tatsaechlich beim Server ankam - unveraendert.';

-- Bisher kein eigener Trigger fuer steigen - scan_zeitpunkt kam direkt aus der
-- Anwendung (new Date() auf dem Server). Jetzt uebernimmt die Datenbank das,
-- konsistent mit den beiden anderen Tabellen.
create or replace function public.steige_zeitpunkt_stempeln()
returns trigger
language plpgsql
as $$
begin
  new.server_eingang_zeitpunkt := coalesce(new.server_eingang_zeitpunkt, now());

  -- scan_zeitpunkt war schon vor dieser Migration nullable ohne Default -
  -- ein ausdruecklich mitgegebener Wert (Seed-Daten mit historischen
  -- Zeitpunkten) bleibt deshalb unangetastet, nur ein fehlender wird berechnet.
  if new.scan_zeitpunkt is null then
    new.scan_zeitpunkt := public.geraet_zeitpunkt_pruefen(new.geraet_zeitpunkt, new.server_eingang_zeitpunkt);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_steige_zeitpunkt on public.steigen;
create trigger trg_steige_zeitpunkt
  before insert on public.steigen
  for each row execute function public.steige_zeitpunkt_stempeln();
