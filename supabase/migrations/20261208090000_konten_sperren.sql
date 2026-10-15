-- =============================================================================
-- Damicon - Konten sperren statt löschen (15.10.2026)
-- =============================================================================
-- Entscheidung zur Rollenverwaltung: Ein Konto, das nicht mehr arbeiten soll, wird gesperrt, nicht gelöscht. Das Löschen hängt an unveränderlichen Zeilen
-- (Belege, Stände, Runden: 20261208020000 löst die Fremdschlüssel, damit es überhaupt geht), und eine gesperrte Person bleibt in Protokollen und Verläufen
-- mit Namen sichtbar. Das Löschen bleibt Sache des Datenschutzes (Anonymisieren, Auftrag der Administration).
--
--   * profiles.gesperrt_am, gesperrt_von, gesperrt_grund. Gesperrt heißt: keine App-Rolle. current_app_role(), current_b2b_kunde_id(), current_brigade_id()
--     und current_profil_id() liefern für ein gesperrtes Konto null, also greift keine rollenbezogene Policy mehr, auch nicht mit einem noch gültigen Token.
--     Zusätzlich sperrt der Server die Anmeldung im Auth-Dienst (ban_duration), damit kein neues Token entsteht.
--   * Setzen und Aufheben nur über konto_sperren() (Administration, mit Grund, nicht das eigene Konto). Ein direkter Update, auch auf das eigene Profil, wird
--     abgelehnt (DA019).
--   * Der letzte aktive Administrator lässt sich weder sperren noch herabstufen (DA011). Die Zählung der Administratoren schließt gesperrte aus.
--
-- Keine Datenänderung. Alle bestehenden Konten bleiben aktiv.
-- =============================================================================

set search_path = public;

alter table public.profiles
  add column if not exists gesperrt_am timestamptz,
  add column if not exists gesperrt_von uuid,
  add column if not exists gesperrt_grund text check (gesperrt_grund is null or char_length(btrim(gesperrt_grund)) between 3 and 300);

comment on column public.profiles.gesperrt_am is 'Zeitpunkt der Sperre. Ein gesperrtes Konto hat keine App-Rolle und meldet sich nicht mehr an. Null: aktiv.';
comment on column public.profiles.gesperrt_von is 'Profil der Person, die gesperrt hat (ohne Fremdschlüssel: die Zeile soll eine Löschung dieser Person überstehen).';
comment on column public.profiles.gesperrt_grund is 'Grund der Sperre, nur für die Administration gedacht.';

create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() and gesperrt_am is null limit 1;
$$;

create or replace function public.current_b2b_kunde_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b2b_kunde_id from public.profiles where auth_user_id = auth.uid() and gesperrt_am is null limit 1;
$$;

create or replace function public.current_brigade_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select brigade_id from public.profiles where auth_user_id = auth.uid() and gesperrt_am is null limit 1;
$$;

create or replace function public.current_profil_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where auth_user_id = auth.uid() and gesperrt_am is null limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Der letzte aktive Administrator
-- ---------------------------------------------------------------------------
create or replace function public.profil_letzter_admin_schuetzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role = 'admin' and old.gesperrt_am is null and (new.role <> 'admin' or new.gesperrt_am is not null)
     and not exists (select 1 from public.profiles p where p.role = 'admin' and p.gesperrt_am is null and p.id <> old.id) then
    raise exception 'Der letzte Administrator behaelt seine Rolle und bleibt aktiv.'
      using errcode = 'DA011';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profil_letzter_admin on public.profiles;
create trigger trg_profil_letzter_admin
  before update of role, gesperrt_am on public.profiles
  for each row execute function public.profil_letzter_admin_schuetzen();

-- ---------------------------------------------------------------------------
-- Die Sperre ändert sich nur über die Funktion
-- ---------------------------------------------------------------------------
create or replace function public.profil_sperre_schuetzen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if (new.gesperrt_am is distinct from old.gesperrt_am or new.gesperrt_von is distinct from old.gesperrt_von or new.gesperrt_grund is distinct from old.gesperrt_grund)
     and current_user in ('authenticated', 'anon')
     and coalesce(current_setting('damicon.konto_sperren', true), '') <> 'ja' then
    raise exception 'Ein Konto sperrt nur die Administration ueber die Funktion konto_sperren().'
      using errcode = 'DA019';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profil_sperre on public.profiles;
create trigger trg_profil_sperre
  before update of gesperrt_am, gesperrt_von, gesperrt_grund on public.profiles
  for each row execute function public.profil_sperre_schuetzen();

-- Sperrt (p_sperren = true) oder entsperrt ein Konto. Gibt den Auth-Benutzer zurück, damit der Server die Anmeldung im Auth-Dienst mitsperrt.
create or replace function public.konto_sperren(p_profil uuid, p_sperren boolean, p_grund text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ziel   public.profiles%rowtype;
  v_akteur uuid;
  v_grund  text := nullif(btrim(coalesce(p_grund, '')), '');
begin
  if not coalesce(public.has_role('admin'), false) then
    raise exception 'Konten sperrt nur die Administration.' using errcode = '42501';
  end if;
  select id into v_akteur from public.profiles where auth_user_id = auth.uid();
  select * into v_ziel from public.profiles where id = p_profil for update;
  if not found then
    raise exception 'Konto nicht gefunden.' using errcode = '23503';
  end if;
  if v_ziel.id = v_akteur then
    raise exception 'Das eigene Konto sperrt man nicht.' using errcode = '23514';
  end if;
  if p_sperren and (v_grund is null or char_length(v_grund) < 3 or char_length(v_grund) > 300) then
    raise exception 'Fuer die Sperre braucht es einen Grund mit 3 bis 300 Zeichen.' using errcode = '23514';
  end if;

  perform set_config('damicon.konto_sperren', 'ja', true);
  if p_sperren then
    update public.profiles set gesperrt_am = coalesce(gesperrt_am, now()), gesperrt_von = v_akteur, gesperrt_grund = v_grund where id = v_ziel.id;
  else
    update public.profiles set gesperrt_am = null, gesperrt_von = null, gesperrt_grund = null where id = v_ziel.id;
  end if;
  perform set_config('damicon.konto_sperren', '', true);
  return v_ziel.auth_user_id;
end;
$$;

revoke all on function public.konto_sperren(uuid, boolean, text) from public, anon;
grant execute on function public.konto_sperren(uuid, boolean, text) to authenticated;

comment on function public.konto_sperren(uuid, boolean, text) is
  'Sperrt oder entsperrt ein Konto (nur Administration, nicht das eigene, mit Grund). Der letzte aktive Administrator lässt sich nicht sperren (DA011). Gibt den Auth-Benutzer zurück.';
