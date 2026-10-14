-- =============================================================================
-- Damicon - Abholrunden bei Nachbarbetrieben (WMCNL-1577)
-- =============================================================================
-- Die Tourenplanung (Migration 20261010000000) plant die Auslieferung an Kunden. Hier steht die Gegenrichtung: ein Fahrzeug
-- holt Ware bei Nachbarbetrieben ab und bringt sie ins Kuehlhaus. Fuer diese Richtung gilt die 60-Minuten-Regel der
-- Kuehlkette (Anforderung 2.6): ab dem Pflueckbeginn zaehlt die Uhr, bis die Ware im Kuehlhaus ist.
--
-- Der Ablauf:
--   geplant     Das Buero legt Datum, Fahrzeug und die Stopps an (Nachbarbetrieb, erwartete Menge).
--   unterwegs   Der Fahrer startet die Runde. Ab jetzt erfasst er je Stopp: abgeholt (mit Menge und dem Pflueckbeginn, den
--               der Nachbarbetrieb nennt) oder entfallen.
--   abgeschlossen  Der Fahrer meldet die Ankunft im Kuehlhaus. Erst wenn kein Stopp mehr offen ist. Ab hier aendert sich
--               nichts mehr: die Runde ist ein Nachweis.
--
-- Entscheidungen:
--   * Bewertet wird nicht gespeichert, sondern gerechnet (Sicht v_abholstopps_kuehlkette): Minuten vom Pflueckbeginn bis zur
--     Ankunft im Kuehlhaus, mit denselben Grenzen wie kuehlkette_bewerten() (ok bis 45, Warnung bis 60, Verstoss darueber,
--     ohne bekannten Pflueckbeginn eine Warnung). Die Runde ist nach dem Abschluss unveraenderlich, die Formel
--     deterministisch: ein gespeichertes Ergebnis waere dieselbe Zahl ein zweites Mal.
--   * Zeitpunkte setzt der Server aus der Geraeteuhr, wenn sie plausibel ist (geraet_zeitpunkt_pruefen(), Anforderung 2.6).
--   * Neue Fehlercodes: DA015 (die Runde oder ihre Stopps sind abgeschlossen oder der Wechsel ist nicht vorgesehen), DA016 (die
--     Runde ist noch nicht gestartet, oder es sind noch Stopps offen).
--   * Wer darf was: Buero (admin, ceo, betriebsleitung, buchhaltung) plant und loescht, Buero und Brigade erfassen den Ablauf
--     (Matrix: logistik, die Brigade darf "update").
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Anschrift und Koordinaten der Nachbarbetriebe
-- ---------------------------------------------------------------------------
alter table public.nachbarbetriebe
  add column if not exists adresse text,
  add column if not exists breitengrad numeric(9, 6),
  add column if not exists laengengrad numeric(9, 6),
  add column if not exists geokodiert_am timestamptz;

comment on column public.nachbarbetriebe.adresse is
  'WMCNL-1577: Anschrift des Nachbarbetriebs, Grundlage fuer die Geokodierung und die Reihenfolge der Abholrunde.';
comment on column public.nachbarbetriebe.geokodiert_am is
  'Zeitpunkt der letzten erfolgreichen Geokodierung; null, solange sie nicht gelang. Dann bleiben breitengrad und laengengrad ebenfalls null, statt eines Rateergebnisses.';

-- ---------------------------------------------------------------------------
-- 2. Abholrunden
-- ---------------------------------------------------------------------------
create table if not exists public.abholrunden (
  id                          uuid primary key default gen_random_uuid(),
  datum                       date not null,
  status                      public.tour_status not null default 'geplant',
  fahrzeug                    text check (fahrzeug is null or char_length(btrim(fahrzeug)) between 1 and 60),
  notiz                       text check (notiz is null or char_length(btrim(notiz)) between 1 and 500),
  distanz_km                  numeric(7, 2),
  dauer_minuten               integer,
  -- Geschaetzte Fahrzeit vom ersten Stopp bis zum Kuehlhaus (aus den Teilstrecken der Routenberechnung), Planungshilfe.
  ab_erstem_stopp_minuten     integer check (ab_erstem_stopp_minuten is null or ab_erstem_stopp_minuten >= 0),
  routen_geometrie            jsonb,
  gestartet_am                timestamptz,
  -- Ankunft im Kuehlhaus: aus der Geraeteuhr des Fahrers, geprueft (geraet_zeitpunkt_pruefen).
  ankunft_geraet_zeitpunkt    timestamptz,
  kuehlhaus_an                timestamptz,
  erstellt_von_profil_id      uuid references public.profiles(id) on delete set null,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

comment on table public.abholrunden is
  'WMCNL-1577: Abholrunde bei Nachbarbetrieben. geplant, unterwegs, abgeschlossen; nach dem Abschluss unveraenderlich. Die 60-Minuten-Regel der Kuehlkette gilt ab dem Pflueckbeginn bis kuehlhaus_an.';
create index if not exists idx_abholrunden_datum on public.abholrunden (datum desc);

drop trigger if exists trg_abholrunden_updated on public.abholrunden;
create trigger trg_abholrunden_updated before update on public.abholrunden
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. Stopps
-- ---------------------------------------------------------------------------
create table if not exists public.abholstopps (
  id                  uuid primary key default gen_random_uuid(),
  runde_id            uuid not null references public.abholrunden(id) on delete cascade,
  nachbarbetrieb_id   uuid not null references public.nachbarbetriebe(id) on delete restrict,
  reihenfolge         integer not null default 0 check (reihenfolge >= 0),
  menge_geplant_kg    numeric(10, 2) not null check (menge_geplant_kg > 0),
  sorte_id            uuid references public.sorten(id) on delete set null,
  status              text not null default 'geplant' check (status in ('geplant', 'abgeholt', 'entfallen')),
  menge_ist_kg        numeric(10, 2) check (menge_ist_kg is null or menge_ist_kg >= 0),
  -- Wann der Nachbarbetrieb mit dem Pfluecken dieser Ware begann (seine Angabe, vom Fahrer erfragt).
  pflueckbeginn       timestamptz,
  geraet_zeitpunkt    timestamptz,
  abgeholt_am         timestamptz,
  bemerkung           text check (bemerkung is null or char_length(btrim(bemerkung)) between 1 and 500),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint abholstopps_ein_betrieb_je_runde unique (runde_id, nachbarbetrieb_id),
  constraint abholstopps_abgeholt_mit_menge check (status <> 'abgeholt' or menge_ist_kg is not null)
);

comment on table public.abholstopps is
  'WMCNL-1577: ein Nachbarbetrieb je Runde. abgeholt braucht die tatsaechliche Menge; der Pflueckbeginn ist die Angabe des Nachbarbetriebs und startet die Kuehlkettenuhr.';
create index if not exists idx_abholstopps_runde on public.abholstopps (runde_id, reihenfolge);
create index if not exists idx_abholstopps_betrieb on public.abholstopps (nachbarbetrieb_id);

drop trigger if exists trg_abholstopps_updated on public.abholstopps;
create trigger trg_abholstopps_updated before update on public.abholstopps
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Regeln der Runde
-- ---------------------------------------------------------------------------
create or replace function public.abholrunde_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_offen    integer;
  v_letzte   timestamptz;
begin
  if tg_op = 'DELETE' then
    if old.status <> 'geplant' then
      raise exception 'Eine begonnene oder abgeschlossene Abholrunde laesst sich nicht loeschen.'
        using errcode = 'DA015';
    end if;
    return old;
  end if;

  if old.status = 'abgeschlossen' then
    raise exception 'Die Abholrunde ist abgeschlossen und aendert sich nicht mehr.'
      using errcode = 'DA015';
  end if;

  if new.status is distinct from old.status then
    if not ((old.status = 'geplant' and new.status = 'unterwegs') or (old.status = 'unterwegs' and new.status = 'abgeschlossen')) then
      raise exception 'Der Statuswechsel von % nach % ist nicht vorgesehen.', old.status, new.status
        using errcode = 'DA015';
    end if;

    if new.status = 'unterwegs' then
      if not exists (select 1 from public.abholstopps where runde_id = new.id) then
        raise exception 'Eine Abholrunde ohne Stopp kann nicht beginnen.'
          using errcode = 'check_violation';
      end if;
      new.gestartet_am := now();
    else
      select count(*) into v_offen from public.abholstopps where runde_id = new.id and status = 'geplant';
      if v_offen > 0 then
        raise exception 'Es sind noch % Stopps offen. Jeder Stopp ist abgeholt oder entfallen, bevor die Runde endet.', v_offen
          using errcode = 'DA016';
      end if;
      new.kuehlhaus_an := public.geraet_zeitpunkt_pruefen(new.ankunft_geraet_zeitpunkt, now());
      select max(abgeholt_am) into v_letzte from public.abholstopps where runde_id = new.id;
      if new.kuehlhaus_an < new.gestartet_am or (v_letzte is not null and new.kuehlhaus_an < v_letzte) then
        raise exception 'Die Ankunft im Kuehlhaus kann nicht vor dem Start oder der letzten Abholung liegen.'
          using errcode = 'check_violation';
      end if;
    end if;
  elsif old.status = 'unterwegs' and (new.datum is distinct from old.datum or new.fahrzeug is distinct from old.fahrzeug) then
    raise exception 'Datum und Fahrzeug einer laufenden Runde aendern sich nicht mehr.'
      using errcode = 'DA015';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_abholrunde_pruefen on public.abholrunden;
create trigger trg_abholrunde_pruefen
  before update or delete on public.abholrunden
  for each row execute function public.abholrunde_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Regeln der Stopps
-- ---------------------------------------------------------------------------
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

drop trigger if exists trg_abholstopp_pruefen on public.abholstopps;
create trigger trg_abholstopp_pruefen
  before insert or update or delete on public.abholstopps
  for each row execute function public.abholstopp_pruefen();

-- ---------------------------------------------------------------------------
-- 6. Bewertung der Kuehlkette je Stopp (gerechnet, nicht gespeichert)
-- ---------------------------------------------------------------------------
-- Dieselben Grenzen wie kuehlkette_bewerten(): bis 45 Minuten ok, bis 60 Warnung, darueber Verstoss. Ohne bekannten Pflueckbeginn
-- laesst sich die Zeit nicht beurteilen, das ist eine Warnung und kein "ok". Erst nach dem Abschluss der Runde, vorher steht noch
-- keine Ankunftszeit fest.
create or replace view public.v_abholstopps_kuehlkette
with (security_invoker = true) as
select
  s.id                                                                                   as stopp_id,
  s.runde_id,
  r.kuehlhaus_an,
  case
    when s.status = 'abgeholt' and r.status = 'abgeschlossen' and s.pflueckbeginn is not null
      then greatest(0, (extract(epoch from (r.kuehlhaus_an - s.pflueckbeginn)) / 60)::integer)
  end                                                                                    as minuten_bis_kuehlung,
  case
    when s.status <> 'abgeholt' or r.status <> 'abgeschlossen' then null
    when s.pflueckbeginn is null then 'warnung'::public.kuehlkette_ergebnis
    when greatest(0, (extract(epoch from (r.kuehlhaus_an - s.pflueckbeginn)) / 60)::integer) > 60 then 'verstoss'::public.kuehlkette_ergebnis
    when greatest(0, (extract(epoch from (r.kuehlhaus_an - s.pflueckbeginn)) / 60)::integer) > 45 then 'warnung'::public.kuehlkette_ergebnis
    else 'ok'::public.kuehlkette_ergebnis
  end                                                                                    as ergebnis
from public.abholstopps s
join public.abholrunden r on r.id = s.runde_id;

comment on view public.v_abholstopps_kuehlkette is
  'WMCNL-1577: Minuten vom Pflueckbeginn bis zur Ankunft im Kuehlhaus und das Ergebnis der 60-Minuten-Regel je abgeholtem Stopp einer abgeschlossenen Runde.';

-- ---------------------------------------------------------------------------
-- 7. Zeilensicherheit
-- ---------------------------------------------------------------------------
alter table public.abholrunden enable row level security;
alter table public.abholrunden force row level security;
alter table public.abholstopps enable row level security;
alter table public.abholstopps force row level security;

create policy abholrunden_select on public.abholrunden
  for select to authenticated using (public.has_office_access() or public.current_app_role() = 'brigade');
create policy abholrunden_insert on public.abholrunden
  for insert to authenticated with check (public.has_office_access());
create policy abholrunden_update on public.abholrunden
  for update to authenticated
  using (public.has_office_access() or public.current_app_role() = 'brigade')
  with check (public.has_office_access() or public.current_app_role() = 'brigade');
create policy abholrunden_delete on public.abholrunden
  for delete to authenticated using (public.has_office_access());

create policy abholstopps_select on public.abholstopps
  for select to authenticated using (public.has_office_access() or public.current_app_role() = 'brigade');
create policy abholstopps_insert on public.abholstopps
  for insert to authenticated with check (public.has_office_access());
create policy abholstopps_update on public.abholstopps
  for update to authenticated
  using (public.has_office_access() or public.current_app_role() = 'brigade')
  with check (public.has_office_access() or public.current_app_role() = 'brigade');
create policy abholstopps_delete on public.abholstopps
  for delete to authenticated using (public.has_office_access());

-- Der Fahrer braucht Name, Anschrift und Kontakt der Nachbarbetriebe seiner Runden, sonst zeigt die Stoppliste leere Zeilen.
-- Die Brigade liest deshalb genau die Nachbarbetriebe, die in einem Stopp stehen, und keinen anderen.
create policy nachbarbetriebe_select_abholrunde_brigade on public.nachbarbetriebe
  for select to authenticated
  using (
    public.current_app_role() = 'brigade'
    and exists (select 1 from public.abholstopps s where s.nachbarbetrieb_id = nachbarbetriebe.id)
  );
comment on policy nachbarbetriebe_select_abholrunde_brigade on public.nachbarbetriebe is
  'WMCNL-1577: die Brigade liest die Nachbarbetriebe, die in einem Abholstopp stehen (Name, Anschrift, Kontakt fuer die Abholrunde).';

revoke all on public.abholrunden from public, anon, authenticated;
revoke all on public.abholstopps from public, anon, authenticated;
revoke all on public.v_abholstopps_kuehlkette from public, anon;
grant select, insert, update, delete on public.abholrunden to authenticated;
grant select, insert, update, delete on public.abholstopps to authenticated;
grant select on public.v_abholstopps_kuehlkette to authenticated;
