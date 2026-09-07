-- =============================================================================
-- Damicon - Haertung nach dem Sicherheitsaudit vom 05.09.2026
-- =============================================================================
-- Das Audit zu Meilenstein B hat vier kritische Loecher in der eigenen Arbeit
-- gefunden. Diese Migration schliesst sie:
--
--   1. Selbstregistrierung als admin: die Rolle kam aus raw_user_meta_data,
--      das jeder Anmeldende frei setzen kann. Sie kommt jetzt aus
--      raw_app_meta_data, das nur der service_role schreiben darf.
--   2. Personenbezogene Daten fuer anon lesbar: Pflueckernamen, Ausweisnummern,
--      Dokumente und Belege waren ohne Anmeldung abrufbar.
--   3. Die Brigade konnte ihre eigene Ernte freigeben: die approve-Schranke
--      stand nur in der Anwendung, nicht in der Datenbank.
--   4. Die Wartezeitsperre griff nur beim Anlegen einer Pflueckaufgabe, nicht
--      bei einer bereits laufenden.
--
-- Dazu zwei weitere Befunde: der Urheber im Audit-Protokoll war frei waehlbar,
-- und beide Storage-Buckets waren fuer jede angemeldete Rolle lesbar.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Rolle nur noch aus app_metadata (service_role), Standard: kunde
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.app_role;
  v_name text;
begin
  -- raw_app_meta_data ist fuer den Anmeldenden nicht schreibbar; nur der
  -- Admin-API-Aufruf mit service_role kann hier eine Rolle setzen. Fehlt sie,
  -- bekommt der neue Zugang die niedrigste Rolle.
  v_role := coalesce(
    nullif(new.raw_app_meta_data ->> 'role', '')::public.app_role,
    'kunde'
  );
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    split_part(new.email, '@', 1)
  );

  update public.profiles
     set auth_user_id = new.id,
         email        = new.email,
         role         = v_role,
         full_name    = v_name
   where auth_user_id is null
     and lower(email) = lower(new.email);

  if not found then
    insert into public.profiles (auth_user_id, full_name, email, role)
    values (new.id, v_name, new.email, v_role)
    on conflict (auth_user_id) do nothing;
  end if;

  return new;
end;
$$;

-- Ein Profil darf seine eigene Rolle nicht anheben. Die vorhandene
-- Update-Policy prueft das bereits ueber current_app_role(); zusaetzlich ein
-- Trigger, damit auch service_role-naher Code nicht versehentlich eskaliert.
create or replace function public.profil_rolle_schuetzen()
returns trigger
language plpgsql
as $$
begin
  if new.role <> old.role and auth.uid() is not null
     and not public.has_role('admin') then
    raise exception 'Die eigene Rolle laesst sich nicht aendern.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_profil_rolle on public.profiles;
create trigger trg_profil_rolle
  before update of role on public.profiles
  for each row execute function public.profil_rolle_schuetzen();

-- ---------------------------------------------------------------------------
-- 2. Lesezugriff einschraenken
-- ---------------------------------------------------------------------------
-- Bisher lasen anon UND authenticated alle Betriebsdaten. Oeffentlich bleibt
-- nur, was auch auf einer oeffentlichen Seite stehen duerfte.
do $$
declare
  t text;
  -- Betriebsdaten: ab jetzt nur noch fuer Angemeldete.
  intern text[] := array[
    'betriebe','plantagen','feldparzellen','reihengruppen','reihenbloecke',
    'brigaden','psm_mittel','pflanzenschutz_behandlungen','chargen',
    'pflueckaufgaben','steigen','kuehlketten_messungen',
    'rotationsplan_eintraege','wetter_messungen','kontingente','preislisten',
    'preislisten_positionen','vorbestellungen','lieferungen','integrationen'
  ];
begin
  foreach t in array intern loop
    execute format('drop policy if exists %I on public.%I;', t || '_select_public', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (true);',
      t || '_select_intern', t
    );
  end loop;
end;
$$;

-- Personenbezogen: Pflueckerstamm nur fuer Buero und Feldleitung.
drop policy if exists pfluecker_select_public on public.pfluecker;
create policy pfluecker_select_personal on public.pfluecker
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade'));

-- Nachweise: Dokumente nur Buero, Fotobelege zusaetzlich das Feld.
drop policy if exists dokumente_select_public on public.dokumente;
create policy dokumente_select_buero on public.dokumente
  for select to authenticated
  using (public.has_office_access());

drop policy if exists media_belege_select_public on public.media_belege;
create policy media_belege_select_feld on public.media_belege
  for select to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade'));

-- Oeffentlich bleiben: Sortenkatalog, Schulungsvideos und die Baseline-
-- Kennzahlen - alles drei ist fuer die oeffentliche Seite gedacht.

-- ---------------------------------------------------------------------------
-- 3. Freigabe einer Pflueckaufgabe nur durch die Leitung
-- ---------------------------------------------------------------------------
-- Die Brigade darf Menge und Belege melden, aber nicht die eigene Arbeit
-- abnehmen. Das Vier-Augen-Prinzip gehoert in die Datenbank, nicht nur in die
-- Anwendung.
create or replace function public.pflueckaufgabe_freigabe_pruefen()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'abgeschlossen' and old.status <> 'abgeschlossen'
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Nur die Betriebsleitung schliesst eine Pflueckaufgabe ab.'
      using errcode = 'insufficient_privilege';
  end if;

  if new.qualitaetsfaktor is distinct from old.qualitaetsfaktor
     and not public.has_role('admin', 'betriebsleitung') then
    raise exception 'Der Qualitaetsfaktor wird von der Betriebsleitung gesetzt.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Eine abgeschlossene Aufgabe bleibt abgeschlossen.
  if old.status = 'abgeschlossen' and new.status <> 'abgeschlossen' then
    raise exception 'Eine abgeschlossene Pflueckaufgabe laesst sich nicht zurueckdrehen.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pflueckaufgabe_freigabe on public.pflueckaufgaben;
create trigger trg_pflueckaufgabe_freigabe
  before update on public.pflueckaufgaben
  for each row execute function public.pflueckaufgabe_freigabe_pruefen();

-- ---------------------------------------------------------------------------
-- 4. Wartezeitsperre gilt auch fuer laufende Aufgaben
-- ---------------------------------------------------------------------------
-- Bisher griff die Pruefung nur beim Anlegen. Wird nach dem Anlegen gespritzt,
-- lief die Aufgabe weiter - genau der Fall, den das System verhindern soll.
create or replace function public.pflueckaufgabe_sperre_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_status public.reihenblock_status;
  v_code   text;
begin
  select status, code
    into v_status, v_code
    from public.reihenbloecke
   where id = new.reihenblock_id;

  if v_status = 'wartezeitgesperrt' then
    raise exception
      'Reihenblock % ist wartezeitgesperrt - keine Ernte und keine Aufgabe moeglich.', v_code
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_pflueckaufgabe_sperre on public.pflueckaufgaben;
create trigger trg_pflueckaufgabe_sperre
  before insert on public.pflueckaufgaben
  for each row execute function public.pflueckaufgabe_sperre_pruefen();

-- Bei laufenden Aufgaben nur die Vorgaenge sperren, die Ernte bedeuten:
-- Statuswechsel und Mengenmeldung. Ein Zurueckstellen bleibt moeglich.
create trigger trg_pflueckaufgabe_sperre_update
  before update on public.pflueckaufgaben
  for each row
  when (
    new.reihenblock_id is distinct from old.reihenblock_id
    or new.ist_menge_kg is distinct from old.ist_menge_kg
    or (new.status is distinct from old.status and new.status <> 'offen')
  )
  execute function public.pflueckaufgabe_sperre_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Urheber im Audit-Protokoll wird gesetzt, nicht behauptet
-- ---------------------------------------------------------------------------
create or replace function public.audit_actor_setzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil record;
begin
  if auth.uid() is null then
    -- Serverseitige Vorgaenge (service_role) duerfen ihren Urheber benennen.
    new.actor := coalesce(new.actor, 'system');
    return new;
  end if;

  select full_name, role into v_profil
    from public.profiles
   where auth_user_id = auth.uid()
   limit 1;

  new.actor := coalesce(v_profil.full_name, 'unbekannt')
               || ' (' || coalesce(v_profil.role::text, 'ohne Rolle') || ')';
  return new;
end;
$$;

drop trigger if exists trg_audit_actor on public.audit_events;
create trigger trg_audit_actor
  before insert on public.audit_events
  for each row execute function public.audit_actor_setzen();

-- ---------------------------------------------------------------------------
-- 6. Storage: Lesen je Bucket und Rolle
-- ---------------------------------------------------------------------------
drop policy if exists belege_select_authenticated on storage.objects;

create policy belege_select_feld on storage.objects
  for select to authenticated
  using (
    bucket_id = 'belege'
    and public.has_role('admin', 'betriebsleitung', 'buchhaltung', 'brigade')
  );

create policy dokumente_select_buero on storage.objects
  for select to authenticated
  using (bucket_id = 'dokumente' and public.has_office_access());
