-- =============================================================================
-- Damicon - Supabase-Grundlagen fuer den PGlite-Schnelltest
-- =============================================================================
-- PGlite ist reines Postgres ohne die Supabase-Plattform drumherum. Die
-- Migrationen setzen aber auth.users, auth.uid(), die Rollen anon/authenticated/
-- service_role und ein minimales storage-Schema voraus. Dieser Stub bildet nur
-- das nach, was die Migrationen tatsaechlich verwenden - siehe
-- supabase/tests/pglite-fast.mjs fuer den Kontext.
--
-- Uebernommen aus dem Muster des Schwesterprojekts
-- "Digitalisierung-Himbeerenbetrieb" (dortiges supabase/fixtures/auth-stub.sql),
-- auf das reduziert, was Damicons eigene Migrationen brauchen.
-- =============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  -- raw_user_meta_data: vom Anmeldenden selbst befuellt (z.B. beim Signup).
  -- raw_app_meta_data: nur vom service_role schreibbar - hier liegt seit der
  -- Haertungsmigration die Rolle, damit niemand sich selbst hochstuft.
  raw_user_meta_data  jsonb not null default '{}'::jsonb,
  raw_app_meta_data   jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now()
);

-- auth.uid()/auth.role() lesen normalerweise den JWT-Claim der eingehenden
-- Anfrage. Ohne PostgREST/GoTrue simuliert der Test das ueber eine Session-
-- Variable: select set_config('request.jwt.claim.sub', '<uuid>', false).
create or replace function auth.uid() returns uuid
language sql stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create or replace function auth.role() returns text
language sql stable
as $$
  select coalesce(current_setting('request.jwt.claim.role', true), 'anon');
$$;

create schema if not exists storage;

create table if not exists storage.buckets (
  id                text primary key,
  name              text not null,
  public            boolean not null default false,
  file_size_limit   bigint,
  allowed_mime_types text[]
);

create table if not exists storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets(id),
  name        text,
  owner       uuid,
  created_at  timestamptz not null default now()
);
alter table storage.objects enable row level security;

grant usage on schema auth, storage, public to anon, authenticated, service_role;

-- Wie auf der Plattform: Tabellenrechte auf storage.objects, damit die
-- Storage-Policies ueberhaupt greifen. Ohne sie scheitert jeder Upload schon
-- an der fehlenden Berechtigung, und ein Test auf "verboten" waere gruen,
-- ohne die Policy je beruehrt zu haben.
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;

-- Supabase erteilt anon/authenticated/service_role automatisch Tabellen-Grants;
-- ohne die Plattform drumherum fehlen sie. Row Level Security bleibt die
-- eigentliche Schranke - die Grants oeffnen nur die Tuer, durch die RLS dann
-- filtert. "for role postgres", weil die Migrationen unter dieser Rolle laufen.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  grant execute on functions to anon, authenticated, service_role;
