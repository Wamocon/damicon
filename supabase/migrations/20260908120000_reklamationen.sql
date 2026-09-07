-- =============================================================================
-- Damicon - Reklamationsmanagement (WMCNL-1455)
-- =============================================================================
-- Neues Modul, angelehnt an das Schwesterprojekt Digitalisierung-Himbeerenbetrieb
-- (public.complaints/complaint_events), aber auf Damicons Muster uebersetzt:
-- deutsche Namen, echte Postgres-Enums statt text+check, und vor allem eine
-- Anbindung an public.chargen statt an ein eigenes allocations/sales_documents-
-- Paar - von der Charge aus lassen sich Reihenblock, Pfluecker und Kuehlkurve
-- bereits zurueckverfolgen (siehe public.rueckstandsnachweis()).
--
-- Enthalten:
--   1. profiles.b2b_kunde_id - fehlende Verknuepfung zwischen einer
--      "kunde"-Anmeldung und ihrer Zeile in b2b_kunden. Ohne sie liesse sich
--      "Kunde sieht nur eigene Reklamation" nicht RLS-sauber umsetzen.
--      Selbst-Zuordnung wird per Trigger verhindert (analog trg_profil_rolle) -
--      sonst koennte sich ein Kunde per Profil-Update einer fremden Firma
--      zuordnen und deren Reklamationen lesen.
--   2. Enums reklamation_grund / reklamation_status
--   3. public.reklamationen - eine Reklamation je Charge/B2B-Kunde
--   4. public.reklamation_ereignisse - Verlauf, append-only, mit
--      automatischem Protokolleintrag bei jedem Statuswechsel
--   5. RLS: Bueoro-Rollen alles, Kunde nur die eigene Reklamation ueber
--      b2b_kunde_id, Brigade keine Policy = kein Zugriff (RLS default-deny)
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. profiles.b2b_kunde_id
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists b2b_kunde_id uuid references public.b2b_kunden(id) on delete set null;

comment on column public.profiles.b2b_kunde_id is
  'Verknuepfung einer "kunde"-Anmeldung zu ihrer Zeile in b2b_kunden - Voraussetzung fuer "Kunde sieht nur eigene Reklamation". Analog brigade_id fuer die Rolle brigade.';

create index if not exists idx_profiles_b2b_kunde on public.profiles(b2b_kunde_id);

-- Ohne diesen Schutz koennte sich eine "kunde"-Anmeldung ueber die bestehende
-- Policy profiles_update_self (erlaubt Aendern des eigenen Datensatzes) selbst
-- einer beliebigen b2b_kunden-Zeile zuordnen und damit fremde Reklamationen
-- lesen - dieselbe Schwachstelle wie bei der Rolle vor trg_profil_rolle.
create or replace function public.profil_b2b_kunde_schuetzen()
returns trigger
language plpgsql
as $$
begin
  if new.b2b_kunde_id is distinct from old.b2b_kunde_id
     and auth.uid() is not null
     and not public.has_office_access() then
    raise exception 'Die Verknuepfung zu einem B2B-Kunden wird nur vom Buero gesetzt.'
      using errcode = 'insufficient_privilege';
  end if;
  return new;
end;
$$;
comment on function public.profil_b2b_kunde_schuetzen is
  'Verhindert, dass sich eine Anmeldung per Profil-Update selbst einem B2B-Kunden zuordnet. Gesetzt wird die Zuordnung heute ausschliesslich ueber den service_role-Key (siehe supabase/seed-auth.mjs) - ein Buero-UI dafuer ist noch nicht gebaut.';

drop trigger if exists trg_profil_b2b_kunde on public.profiles;
create trigger trg_profil_b2b_kunde
  before update of b2b_kunde_id on public.profiles
  for each row execute function public.profil_b2b_kunde_schuetzen();

-- Hilfsfunktion fuer RLS, analog current_app_role().
create or replace function public.current_b2b_kunde_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select b2b_kunde_id from public.profiles where auth_user_id = auth.uid() limit 1;
$$;
comment on function public.current_b2b_kunde_id is
  'B2B-Kunde der aktuell angemeldeten "kunde"-Rolle, fuer RLS-Policies, die eine Reklamation auf den eigenen Kunden beschraenken.';

-- ---------------------------------------------------------------------------
-- 2. Enums
-- ---------------------------------------------------------------------------
create type public.reklamation_grund as enum (
  'qualitaet', 'menge', 'verspaetung', 'verpackung', 'temperatur', 'sonstiges'
);
create type public.reklamation_status as enum (
  'offen', 'in_pruefung', 'angenommen', 'abgelehnt', 'erledigt'
);

-- ---------------------------------------------------------------------------
-- 3. public.reklamationen
-- ---------------------------------------------------------------------------
create table public.reklamationen (
  id                  uuid primary key default gen_random_uuid(),
  code                text not null unique,
  charge_id           uuid references public.chargen(id) on delete set null,
  b2b_kunde_id        uuid not null references public.b2b_kunden(id) on delete restrict,
  grund               public.reklamation_grund not null,
  betreff             text not null,
  beschreibung        text,
  betroffene_menge_kg numeric(10,1),
  status              public.reklamation_status not null default 'offen',
  gemeldet_von        uuid references public.profiles(id) on delete set null,
  gemeldet_am         timestamptz not null default now(),
  frist_am            date,
  erledigt_am         timestamptz,
  loesung             text,
  gutschrift_tenge    numeric(12,2),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint reklamation_menge_positiv
    check (betroffene_menge_kg is null or betroffene_menge_kg >= 0),
  constraint reklamation_gutschrift_positiv
    check (gutschrift_tenge is null or gutschrift_tenge >= 0),
  -- Eine Entscheidung braucht eine Begruendung UND einen Abschlusszeitpunkt -
  -- eine Reklamation laesst sich nicht wortlos "angenommen" oder "abgelehnt".
  constraint reklamation_abschluss_braucht_begruendung check (
    status not in ('angenommen', 'abgelehnt', 'erledigt')
    or (erledigt_am is not null and loesung is not null)
  ),
  -- Eine Gutschrift setzt eine Annahme voraus - eine abgelehnte Reklamation
  -- bekommt keine Kompensation.
  constraint reklamation_gutschrift_nur_bei_annahme check (
    gutschrift_tenge is null or status in ('angenommen', 'erledigt')
  )
);
comment on table public.reklamationen is
  'Reklamation eines B2B-Kunden, angebunden an die Nachweiskette ueber charge_id - von der Charge aus lassen sich Reihenblock, Pfluecker und Kuehlkurve bereits zurueckverfolgen (siehe public.rueckstandsnachweis()).';

create index idx_reklamationen_kunde on public.reklamationen(b2b_kunde_id, gemeldet_am desc);
create index idx_reklamationen_charge on public.reklamationen(charge_id);
-- Faelligkeitsliste: nur offene/in Pruefung befindliche Reklamationen tragen
-- eine relevante Frist (analog complaints_open_idx im Schwesterprojekt bzw.
-- idx_vorfaelle_offen in dieser Codebasis).
create index idx_reklamationen_offen on public.reklamationen(frist_am)
  where status in ('offen', 'in_pruefung');

create trigger trg_reklamationen_updated before update on public.reklamationen
  for each row execute function public.set_updated_at();

-- Antwortfrist: 5 Werktage, vereinfacht als 5 Kalendertage ab Meldung (gleiche
-- Vereinfachung wie bei drittweitergabe_frist_setzen). Wird nur gesetzt, wenn
-- das Buero beim Anlegen keine eigene Frist vorgibt.
create or replace function public.reklamation_frist_setzen()
returns trigger
language plpgsql
as $$
begin
  if new.frist_am is null then
    new.frist_am := (new.gemeldet_am + interval '5 days')::date;
  end if;
  return new;
end;
$$;
create trigger trg_reklamation_frist before insert on public.reklamationen
  for each row execute function public.reklamation_frist_setzen();

-- Der Abschlusszeitpunkt gehoert in die Datenbank, nicht in die Anwendung:
-- sobald der Status in eine Endlage wechselt, wird erledigt_am gesetzt, falls
-- die Aktion es nicht schon selbst mitgegeben hat. Ohne diesen Trigger wuerde
-- ein vergessenes erledigt_am erst an der Check-Constraint scheitern.
create or replace function public.reklamation_abschluss_setzen()
returns trigger
language plpgsql
as $$
begin
  if new.status in ('angenommen', 'abgelehnt', 'erledigt')
     and old.status not in ('angenommen', 'abgelehnt', 'erledigt') then
    new.erledigt_am := coalesce(new.erledigt_am, now());
  end if;
  return new;
end;
$$;
create trigger trg_reklamation_abschluss before update on public.reklamationen
  for each row execute function public.reklamation_abschluss_setzen();

-- ---------------------------------------------------------------------------
-- 4. public.reklamation_ereignisse - Verlauf, append-only
-- ---------------------------------------------------------------------------
create table public.reklamation_ereignisse (
  id                  uuid primary key default gen_random_uuid(),
  reklamation_id      uuid not null references public.reklamationen(id) on delete cascade,
  neuer_status        public.reklamation_status,
  text                text not null,
  sichtbar_fuer_kunde boolean not null default true,
  autor_id            uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);
comment on table public.reklamation_ereignisse is
  'Verlauf einer Reklamation: Kommentare und automatisch protokollierte Statuswechsel. Append-only wie audit_events/personenbezogene_zugriffe - ueber dieselbe block_ledger_mutation()-Funktion, deren Meldungstext historisch "finance_ledger_entries" nennt, aber tabellenunabhaengig ueber den Fehlercode P0001 ausgewertet wird (siehe supabase/tests/integration.mjs).';
create index idx_reklamation_ereignisse_rekl on public.reklamation_ereignisse(reklamation_id, created_at);

create trigger trg_reklamation_ereignisse_no_update before update on public.reklamation_ereignisse
  for each row execute function public.block_ledger_mutation();
create trigger trg_reklamation_ereignisse_no_delete before delete on public.reklamation_ereignisse
  for each row execute function public.block_ledger_mutation();

-- Jeder Statuswechsel schreibt automatisch einen Verlaufseintrag - unabhaengig
-- davon, ob die Anwendung daran denkt (analog complaint_state_logged im
-- Schwesterprojekt). Der Text uebernimmt die Loesung, falls vorhanden, sonst
-- einen generischen Hinweis. Der erste Eintrag ("Reklamation gemeldet")
-- entsteht NICHT hier, sondern explizit in der Anlegen-Action - dieser
-- Trigger feuert nur bei UPDATE, eine frisch angelegte Reklamation hat noch
-- keinen alten Status, gegen den sich "geaendert" vergleichen liesse.
create or replace function public.reklamation_status_protokollieren()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into public.reklamation_ereignisse (
      reklamation_id, neuer_status, text, sichtbar_fuer_kunde, autor_id
    ) values (
      new.id,
      new.status,
      coalesce(new.loesung, 'Status geändert auf ' || new.status::text),
      true,
      (select id from public.profiles where auth_user_id = auth.uid())
    );
  end if;
  return new;
end;
$$;
create trigger trg_reklamation_status_protokoll after update on public.reklamationen
  for each row execute function public.reklamation_status_protokollieren();

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.reklamationen enable row level security;
alter table public.reklamationen force row level security;
alter table public.reklamation_ereignisse enable row level security;
alter table public.reklamation_ereignisse force row level security;

-- Buero sieht alles, ein Kunde nur Reklamationen des eigenen B2B-Kunden. Die
-- Brigade bekommt hier bewusst keine Zeile - RLS verweigert dann per Default,
-- deckungsgleich mit rbac.ts, wo "reklamationen" fuer brigade/erzeuger gar
-- nicht in rolePermissions auftaucht.
create policy reklamationen_select_kunde_buero on public.reklamationen
  for select to authenticated
  using (
    public.has_office_access()
    or (b2b_kunde_id is not null and b2b_kunde_id = public.current_b2b_kunde_id())
  );

create policy reklamationen_insert_kunde_buero on public.reklamationen
  for insert to authenticated
  with check (
    public.has_office_access()
    or (
      public.current_app_role() = 'kunde'
      and b2b_kunde_id is not null
      and b2b_kunde_id = public.current_b2b_kunde_id()
    )
  );

-- Statuswechsel, Loesungstext und Gutschrift bleiben dem Buero vorbehalten
-- (rbac: reklamationen:update/:approve nur bei betriebsleitung/buchhaltung).
create policy reklamationen_update_buero on public.reklamationen
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'))
  with check (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

create policy reklamation_ereignisse_select_kunde_buero on public.reklamation_ereignisse
  for select to authenticated
  using (
    exists (
      select 1 from public.reklamationen r
       where r.id = reklamation_ereignisse.reklamation_id
         and (
           public.has_office_access()
           or (
             sichtbar_fuer_kunde
             and r.b2b_kunde_id is not null
             and r.b2b_kunde_id = public.current_b2b_kunde_id()
           )
         )
    )
  );

create policy reklamation_ereignisse_insert_kunde_buero on public.reklamation_ereignisse
  for insert to authenticated
  with check (
    exists (
      select 1 from public.reklamationen r
       where r.id = reklamation_ereignisse.reklamation_id
         and (
           public.has_office_access()
           or (
             public.current_app_role() = 'kunde'
             and r.b2b_kunde_id is not null
             and r.b2b_kunde_id = public.current_b2b_kunde_id()
           )
         )
    )
  );

grant execute on function public.current_b2b_kunde_id() to authenticated;
