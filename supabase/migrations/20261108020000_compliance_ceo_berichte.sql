-- =============================================================================
-- Damicon - Automatische Compliance-Uebersicht fuer die Rolle ceo
-- =============================================================================
-- Bisher wird ein Pruefbericht (lib/pruefung/agenten.ts, fuehrePruefungAus())
-- nirgends gespeichert, nur Start und Ende landen in audit_events. Diese Tabelle
-- speichert den vollstaendigen, bereits versiegelten Bericht unveraendert (das
-- Siegel bleibt damit nachtraeglich pruefbar, siegelGueltig() in lib/pruefung/
-- befund.ts), dazu einen Verweis auf den vorigen Bericht und die daraus
-- abgeleiteten Aenderungen - Grundlage fuer "was hat sich seit dem letzten
-- Bericht geaendert" auf der CEO-Startseite.
--
-- Append-only nach demselben Muster wie audit_events und
-- finance_ledger_entries (block_ledger_mutation(), Migration
-- 20260905150000_audit_meldung.sql): kein UPDATE, kein DELETE, auch nicht per
-- direktem API-Zugriff.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Tabelle
-- ---------------------------------------------------------------------------
create table public.compliance_ceo_berichte (
  id                 uuid primary key default gen_random_uuid(),
  erstellt_am        timestamptz not null default now(),
  -- Wird von einem Trigger serverseitig aus der Sitzung gesetzt (siehe unten),
  -- nie aus der Client-Eingabe uebernommen - gleiches Muster wie actor in
  -- audit_events (audit_actor_setzen(), Migration 20260905160000_haerten.sql).
  ausgeloest_von     uuid references public.profiles(id) on delete set null,
  quelle             text not null check (quelle in ('auto-login', 'manuell')),
  bereiche           text[] not null check (bereiche <@ array['audit', 'steuer', 'recht', 'risiko']),
  -- Der vollstaendige Bericht aus fuehrePruefungAus(), unveraendert - inklusive
  -- Siegel. Keine eigene Spaltenzerlegung: der Bericht ist bereits ein in sich
  -- geschlossenes, versiegeltes Dokument (siehe lib/pruefung/typen.ts).
  bericht            jsonb not null,
  voriger_bericht_id uuid references public.compliance_ceo_berichte(id) on delete set null,
  -- Je geaenderter Befund-Id: vorheriger Status/Schwere gegenueber diesem
  -- Bericht. Leer beim ersten Bericht oder wenn kein Befund sich veraendert
  -- hat, obwohl die zugrundeliegenden Betriebsdaten es taten.
  aenderungen        jsonb not null default '[]'::jsonb
);
comment on table public.compliance_ceo_berichte is
  'Automatisch beim CEO-Login erzeugte Compliance-Berichte (alle vier Pruefbereiche in einem Lauf) sowie manuell ueber den Aktualisieren-Knopf. Append-only.';
create index idx_compliance_ceo_berichte_erstellt on public.compliance_ceo_berichte(erstellt_am desc);

-- ---------------------------------------------------------------------------
-- 2. Ausloeser wird gesetzt, nicht behauptet
-- ---------------------------------------------------------------------------
create or replace function public.ceo_bericht_ausloeser_setzen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profil_id uuid;
begin
  if auth.uid() is null then
    -- Serverseitiger Vorgang ohne Sitzung (service_role): kein Ausloeser zu ermitteln.
    new.ausgeloest_von := null;
    return new;
  end if;

  select id into v_profil_id
    from public.profiles
   where auth_user_id = auth.uid()
   limit 1;

  new.ausgeloest_von := v_profil_id;
  return new;
end;
$$;

create trigger trg_ceo_bericht_ausloeser
  before insert on public.compliance_ceo_berichte
  for each row execute function public.ceo_bericht_ausloeser_setzen();

-- Append-only: block_ledger_mutation() existiert bereits generisch
-- (Migration 20260905150000_audit_meldung.sql) und wird hier wiederverwendet.
create trigger trg_compliance_ceo_berichte_no_update before update on public.compliance_ceo_berichte
  for each row execute function public.block_ledger_mutation();
create trigger trg_compliance_ceo_berichte_no_delete before delete on public.compliance_ceo_berichte
  for each row execute function public.block_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------
alter table public.compliance_ceo_berichte enable row level security;

create policy compliance_ceo_berichte_select on public.compliance_ceo_berichte
  for select to authenticated
  using (public.has_role('ceo', 'admin'));

create policy compliance_ceo_berichte_insert on public.compliance_ceo_berichte
  for insert to authenticated
  with check (public.has_role('ceo'));
