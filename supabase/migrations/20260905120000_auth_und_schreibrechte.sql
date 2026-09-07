-- =============================================================================
-- Damicon - Meilenstein B: echte Auth + rollenabhaengige Schreibrechte
-- =============================================================================
-- Meilenstein A hatte nur Lese-Policies; geschrieben hat ausschliesslich der
-- service_role-Key. Mit echter Auth (Supabase Auth) bekommt jede Ressource
-- eigene Schreib-Policies, die an die sieben Damicon-Rollen gebunden sind
-- (Analyse Kapitel 10: "RLS ist kein Copy-Paste").
--
-- Enthalten:
--   1. Rollenhelfer has_role()
--   2. Profil-Anlage beim Anlegen eines Auth-Users
--   3. Schreib-Policies je Ressource und Rolle
--   4. Sperrlogik: ein wartezeitgesperrter Reihenblock laesst sich nicht
--      vorzeitig freischalten - die Regel liegt in der Datenbank, nicht im UI
--   5. RPC reihenblock_freigeben() fuer die regulaere Freigabe nach Ablauf
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Rollenhelfer
-- ---------------------------------------------------------------------------
create or replace function public.has_role(variadic erlaubt public.app_role[])
returns boolean
language sql
stable
as $$
  select public.current_app_role() = any(erlaubt);
$$;
comment on function public.has_role is
  'Prueft die App-Rolle des angemeldeten Nutzers gegen eine Liste erlaubter Rollen.';

-- ---------------------------------------------------------------------------
-- 2. Profil beim Anlegen eines Auth-Users erzeugen bzw. verknuepfen
-- ---------------------------------------------------------------------------
-- Rolle und Name kommen aus raw_user_meta_data. Existiert bereits ein
-- unverknuepftes Profil mit derselben E-Mail, wird es uebernommen statt
-- dupliziert.
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
  v_role := coalesce(
    nullif(new.raw_user_meta_data ->> 'role', '')::public.app_role,
    'brigade'
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

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- 3. Schreib-Policies je Ressource
-- ---------------------------------------------------------------------------
-- Die Zuordnung folgt src/lib/rbac.ts. Wer eine Ressource dort nur "view" hat,
-- bekommt hier keine Schreib-Policy.

-- Standort-Hierarchie: Betriebsleitung pflegt Plantage, Parzelle, Reihengruppe
-- und Reihenblock (rbac: standort:create/update, reihenbloecke:create/update).
do $$
declare
  t text;
  standort_tables text[] := array[
    'plantagen','feldparzellen','reihengruppen','reihenbloecke'
  ];
begin
  foreach t in array standort_tables loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_role(''admin'', ''betriebsleitung''));',
      t || '_insert_leitung', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_role(''admin'', ''betriebsleitung''))
         with check (public.has_role(''admin'', ''betriebsleitung''));',
      t || '_update_leitung', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated
         using (public.has_role(''admin'', ''betriebsleitung''));',
      t || '_delete_leitung', t
    );
  end loop;
end;
$$;

-- Sortenkatalog: Betriebsleitung pflegt Sorten (rbac: sortenkatalog:create/update).
create policy sorten_insert_leitung on public.sorten
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy sorten_update_leitung on public.sorten
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Pflanzenschutz: nur Leitung. Das Anlegen einer Behandlung sperrt den Block
-- (Trigger aus der Initialmigration), das Freigeben laeuft ueber das Update.
create policy psm_mittel_insert_leitung on public.psm_mittel
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

create policy behandlungen_insert_leitung on public.pflanzenschutz_behandlungen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy behandlungen_update_leitung on public.pflanzenschutz_behandlungen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Pflueckaufgaben und Belege: zusaetzlich die Brigade (rbac: pflueckaufgaben:crud).
create policy pflueckaufgaben_insert_feld on public.pflueckaufgaben
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy pflueckaufgaben_update_feld on public.pflueckaufgaben
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

create policy media_belege_insert_feld on public.media_belege
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

create policy chargen_insert_feld on public.chargen
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));
create policy chargen_update_feld on public.chargen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'brigade'))
  with check (public.has_role('admin', 'betriebsleitung', 'brigade'));

-- Personal: Leitung pflegt Brigaden und Pflueckerstamm.
create policy brigaden_insert_leitung on public.brigaden
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy brigaden_update_leitung on public.brigaden
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

create policy pfluecker_insert_leitung on public.pfluecker
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));
create policy pfluecker_update_leitung on public.pfluecker
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Dokumente: Buero-Rollen (rbac: dokumente:crud bei admin/leitung/buchhaltung).
create policy dokumente_insert_buero on public.dokumente
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
create policy dokumente_update_buero on public.dokumente
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'))
  with check (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

-- Audit: append-only fuer alle Angemeldeten. Update/Delete blockiert bereits
-- ein Trigger aus der Initialmigration.
create policy audit_events_insert_authenticated on public.audit_events
  for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- 4. Sperrlogik in der Datenbank
-- ---------------------------------------------------------------------------
-- Der Kern des Systems: ein wartezeitgesperrter Reihenblock darf nicht per
-- Statuswechsel freigeschaltet werden, solange eine Behandlung offen und die
-- Wartezeit nicht abgelaufen ist. Die Regel gehoert in die Datenbank, damit sie
-- auch bei direktem API-Zugriff greift.
create or replace function public.reihenblock_sperre_pruefen()
returns trigger
language plpgsql
as $$
declare
  v_freigabe_am date;
begin
  if old.status = 'wartezeitgesperrt' and new.status <> 'wartezeitgesperrt' then
    select max(freigabe_am)
      into v_freigabe_am
      from public.pflanzenschutz_behandlungen
     where reihenblock_id = new.id
       and not freigegeben;

    if v_freigabe_am is not null and v_freigabe_am > current_date then
      raise exception
        'Reihenblock % ist bis % wartezeitgesperrt.', new.code, v_freigabe_am
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_reihenblock_sperre on public.reihenbloecke;
create trigger trg_reihenblock_sperre
  before update of status on public.reihenbloecke
  for each row execute function public.reihenblock_sperre_pruefen();

-- ---------------------------------------------------------------------------
-- 5. Regulaere Freigabe nach Ablauf der Wartezeit
-- ---------------------------------------------------------------------------
-- security invoker: die RLS-Policies des Aufrufers gelten weiter, die Funktion
-- buendelt nur die zwei Schritte (Behandlung quittieren, Status zuruecksetzen).
create or replace function public.reihenblock_freigeben(
  p_block  uuid,
  p_status public.reihenblock_status default 'bepflanzt'
)
returns public.reihenbloecke
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_block  public.reihenbloecke;
  v_offen  date;
begin
  select max(freigabe_am)
    into v_offen
    from public.pflanzenschutz_behandlungen
   where reihenblock_id = p_block
     and not freigegeben;

  if v_offen is null then
    raise exception 'Fuer diesen Reihenblock ist keine Sperre offen.'
      using errcode = 'no_data_found';
  end if;

  if v_offen > current_date then
    raise exception 'Wartezeit laeuft noch bis %.', v_offen
      using errcode = 'check_violation';
  end if;

  update public.pflanzenschutz_behandlungen
     set freigegeben = true
   where reihenblock_id = p_block
     and not freigegeben;

  update public.reihenbloecke
     set status = p_status
   where id = p_block
  returning * into v_block;

  if v_block.id is null then
    raise exception 'Reihenblock nicht gefunden oder keine Schreibberechtigung.'
      using errcode = 'insufficient_privilege';
  end if;

  return v_block;
end;
$$;
comment on function public.reihenblock_freigeben is
  'Gibt einen wartezeitgesperrten Reihenblock frei, sobald die Wartezeit abgelaufen ist.';

grant execute on function public.has_role(public.app_role[]) to authenticated;
grant execute on function public.reihenblock_freigeben(uuid, public.reihenblock_status) to authenticated;
