-- =============================================================================
-- Damicon - Belegregister fuer die elektronische Rechnung (ЭСФ), Stufe 1 (WMCNL-1440)
-- =============================================================================
-- Seit 01.01.2026 muss jede Lieferung ueber das staatliche ЭСФ-System belegt werden,
-- Papier nur bei Stoerung. Eine Anbindung an das System (Stufe 2) braucht den Zugang der
-- Behoerde und ist noch nicht moeglich. Stufe 1 fuehrt das, was der Betrieb heute ohne
-- Werkzeug von Hand fuehrt: welche Lieferung hat welchen Beleg, in welchem Zustand, und
-- welche Lieferung hat noch keinen.
--
-- Entscheidungen:
--   * Ein Beleg je Lieferung (unique). Wird ein Beleg abgelehnt, beginnt dieselbe Zeile
--     wieder bei "entwurf": die Geschichte steht im Protokoll (audit_events), nicht in
--     einer Kette von Zeilen, die ein Mensch zusammensuchen muesste.
--   * Das System stellt die ЭСФ nicht aus. "entwurf" ist ein Standbild der Angaben, die
--     das Buero im Portal braucht (Kaeufer, Ware, Menge, Preis laut Preisliste am
--     Liefertag, MwSt). Wann das Standbild gilt, steht im Entwurf selbst (Stichtag).
--     Erfundene Felder eines amtlichen Formats gibt es nicht.
--   * Status: entwurf -> ausgestellt -> bestaetigt | abgelehnt. Eine abgelehnte ЭСФ geht
--     zurueck auf entwurf oder auf papier. "papier" ist nur bei Stoerung zulaessig und
--     verlangt deshalb eine Begruendung. Bestaetigt und papier sind Endzustaende.
--   * Ab "ausgestellt" ist das Standbild unveraenderlich: was dem Beleg zugrunde lag,
--     bleibt nachvollziehbar, auch wenn sich Preisliste oder Kundendaten spaeter aendern.
--   * Nur zugestellte Lieferungen bekommen einen Beleg (DA014): vor der Uebergabe stehen
--     Menge und Liefertag nicht fest.
--   * Lesen darf das Buero, schreiben duerfen admin, ceo und buchhaltung, wie die
--     Anwendung es mit integrationen:update vorgibt. Geloescht wird nur ein Entwurf.
--   * Ungueltige Statuswechsel und das Aendern eines ausgestellten Entwurfs scheitern mit
--     DA013, in der Datenbank, nicht nur in der Anwendung.
--   * Die Sicht v_esf_offen listet die zugestellten Lieferungen ohne ausgestellten Beleg.
--     Eine gesetzliche Frist ist hier nicht hinterlegt: sie zu erfinden waere falsch. Die
--     Sicht zeigt das Alter in Tagen, die Fachseite entscheidet, was ueberfaellig heisst.
-- =============================================================================

set search_path = public;

create table if not exists public.esf_belege (
  id                     uuid primary key default gen_random_uuid(),
  -- restrict: ein Steuerbeleg verschwindet nicht mit seiner Lieferung.
  lieferung_id           uuid not null unique references public.lieferungen(id) on delete restrict,
  status                 text not null default 'entwurf'
                           check (status in ('entwurf', 'ausgestellt', 'bestaetigt', 'abgelehnt', 'papier')),
  -- Die Nummer vergibt das staatliche System, sie wird von Hand uebernommen.
  esf_nummer             text check (esf_nummer is null or char_length(btrim(esf_nummer)) between 1 and 100),
  ausgestellt_am         date,
  bestaetigt_am          date,
  -- Grund der Ablehnung oder Stoerung, sonst freie Anmerkung.
  bemerkung              text check (bemerkung is null or char_length(btrim(bemerkung)) between 3 and 500),
  entwurf                jsonb not null,
  erstellt_von_profil_id uuid references public.profiles(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint esf_belege_status_angaben check (
    case status
      when 'entwurf' then esf_nummer is null and ausgestellt_am is null and bestaetigt_am is null
      when 'ausgestellt' then esf_nummer is not null and ausgestellt_am is not null and bestaetigt_am is null
      when 'bestaetigt' then esf_nummer is not null and ausgestellt_am is not null
                             and bestaetigt_am is not null and bestaetigt_am >= ausgestellt_am
      when 'abgelehnt' then esf_nummer is not null and ausgestellt_am is not null
                            and bestaetigt_am is null and bemerkung is not null
      when 'papier' then esf_nummer is null and ausgestellt_am is null and bestaetigt_am is null
                         and bemerkung is not null
    end
  )
);

comment on table public.esf_belege is
  'Belegregister der elektronischen Rechnung (ЭСФ), Stufe 1 (WMCNL-1440): ein Beleg je zugestellter Lieferung, Status und Standbild der Angaben. Keine Anbindung an das staatliche System.';
comment on column public.esf_belege.entwurf is
  'Standbild der Angaben fuer das Portal (Kaeufer, Ware, Preis am Liefertag, MwSt). Ab "ausgestellt" unveraenderlich.';

create index if not exists idx_esf_belege_status on public.esf_belege (status);

-- ---------------------------------------------------------------------------
-- Statuswechsel und Unveraenderlichkeit
-- ---------------------------------------------------------------------------
create or replace function public.esf_beleg_pruefen()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lieferung_status public.lieferung_status;
  v_profil uuid;
begin
  if tg_op = 'INSERT' then
    select status into v_lieferung_status from public.lieferungen where id = new.lieferung_id;
    if v_lieferung_status is null then
      raise exception 'Lieferung nicht gefunden.' using errcode = '23503';
    end if;
    if v_lieferung_status <> 'zugestellt' then
      raise exception 'Nur eine zugestellte Lieferung bekommt einen Beleg.' using errcode = 'DA014';
    end if;
    if new.status <> 'entwurf' then
      raise exception 'Ein neuer Beleg beginnt als Entwurf.' using errcode = 'DA013';
    end if;
    if auth.uid() is not null then
      select id into v_profil from public.profiles where auth_user_id = auth.uid();
      new.erstellt_von_profil_id := v_profil;
    end if;
    return new;
  end if;

  -- UPDATE: die Lieferung bleibt, der Entwurf ist nur im Zustand "entwurf" aenderbar.
  if new.lieferung_id is distinct from old.lieferung_id then
    raise exception 'Ein Beleg gehoert zu genau einer Lieferung.' using errcode = 'DA013';
  end if;
  if new.status is distinct from old.status then
    if not (
      (old.status = 'entwurf'     and new.status in ('ausgestellt', 'papier'))
      or (old.status = 'ausgestellt' and new.status in ('bestaetigt', 'abgelehnt'))
      or (old.status = 'abgelehnt'   and new.status in ('entwurf', 'papier'))
    ) then
      raise exception 'Der Wechsel von % nach % ist nicht vorgesehen.', old.status, new.status using errcode = 'DA013';
    end if;
  elsif old.status in ('bestaetigt', 'papier') then
    raise exception 'Ein bestaetigter oder auf Papier gefuehrter Beleg ist abgeschlossen.' using errcode = 'DA013';
  end if;
  if old.status <> 'entwurf' and new.entwurf is distinct from old.entwurf then
    -- Eine Ausnahme: aus "abgelehnt" beginnt ein neuer Entwurf mit neuem Standbild.
    if not (old.status = 'abgelehnt' and new.status = 'entwurf') then
      raise exception 'Der Entwurf eines ausgestellten Belegs ist unveraenderlich.' using errcode = 'DA013';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_esf_beleg_pruefen on public.esf_belege;
create trigger trg_esf_beleg_pruefen
  before insert or update on public.esf_belege
  for each row execute function public.esf_beleg_pruefen();

-- ---------------------------------------------------------------------------
-- Zeilensicherheit
-- ---------------------------------------------------------------------------
alter table public.esf_belege enable row level security;
alter table public.esf_belege force row level security;

create policy esf_belege_select_buero on public.esf_belege
  for select to authenticated using (public.has_office_access());
create policy esf_belege_insert on public.esf_belege
  for insert to authenticated with check (public.has_role('admin', 'ceo', 'buchhaltung'));
create policy esf_belege_update on public.esf_belege
  for update to authenticated
  using (public.has_role('admin', 'ceo', 'buchhaltung'))
  with check (public.has_role('admin', 'ceo', 'buchhaltung'));
create policy esf_belege_delete_entwurf on public.esf_belege
  for delete to authenticated
  using (status = 'entwurf' and public.has_role('admin', 'ceo', 'buchhaltung'));

revoke all on public.esf_belege from public;
revoke all on public.esf_belege from anon;
revoke all on public.esf_belege from authenticated;
grant select, insert, update, delete on public.esf_belege to authenticated;

-- ---------------------------------------------------------------------------
-- Zugestellte Lieferungen ohne ausgestellten Beleg
-- ---------------------------------------------------------------------------
-- security invoker: die Zeilensicherheit der drei Tabellen gilt durch die Sicht hindurch,
-- ein Kunde sieht darin nichts (b2b_kunden und esf_belege sind nur fuers Buero lesbar).
create or replace view public.v_esf_offen
with (security_invoker = true) as
select
  l.id                                                              as lieferung_id,
  k.name                                                            as kunde,
  l.geliefert_am,
  l.menge_kg,
  (public.heute_almaty() - (l.geliefert_am at time zone 'Asia/Almaty')::date) as tage_seit_lieferung,
  b.id                                                              as beleg_id,
  b.status                                                          as beleg_status
from public.lieferungen l
join public.b2b_kunden k on k.id = l.b2b_kunde_id
left join public.esf_belege b on b.lieferung_id = l.id
where l.status = 'zugestellt'
  and l.geliefert_am is not null
  and (b.id is null or b.status in ('entwurf', 'abgelehnt'));

comment on view public.v_esf_offen is
  'Zugestellte Lieferungen ohne ausgestellten ЭСФ-Beleg (kein Beleg, Entwurf oder abgelehnt). Das Alter in Tagen zaehlt ab dem Liefertag in Almaty.';

revoke all on public.v_esf_offen from public;
revoke all on public.v_esf_offen from anon;
grant select on public.v_esf_offen to authenticated;
