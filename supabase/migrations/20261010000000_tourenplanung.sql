-- =============================================================================
-- Damicon - Tourenplanung mit Routenoptimierung (Masterplan-Anforderung 3.5,
-- Teil 1)
-- =============================================================================
-- Teil 2 (digitale Uebergabequittung, Migration 20260926000000) und Teil 2a/2b
-- (Lieferstatus, Rechnungshistorie, siehe spaetere Migrationen) sind bereits
-- angebunden. Dieser Teil war bewusst zurueckgestellt: "ein eigenstaendiges,
-- deutlich groesseres Vorhaben (Kartenintegration, Fahrzeug-/
-- Zeitfenster-Logik)".
--
-- Nutzer-Entscheidungen fuer diesen Umsetzungsschritt:
--   * Adressen werden als Text erfasst und beim Speichern automatisch
--     geokodiert (Nominatim/OSM), nicht manuell als Koordinaten gepflegt.
--   * Routenoptimierung ueber OSRM (Open Source Routing Machine, oeffentlicher
--     Demo-Server, kein API-Key) statt einer reinen Reihenfolge nach
--     Liefertermin.
--
-- Fahrzeug-/Zeitfenster-Logik (die zweite im Masterplan genannte
-- Komplexitaet) bleibt bewusst aussen vor - eine einzelne taegliche Tour ohne
-- Fahrzeugkapazitaet ist der kleinste Schritt, der schon einen echten Nutzen
-- bringt (weniger gefahrene Kilometer), ohne eine Flottenplanung zu erfinden,
-- die noch niemand angefordert hat.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Adresse + Koordinaten je B2B-Kunde
-- ---------------------------------------------------------------------------
alter table public.b2b_kunden
  add column if not exists adresse text,
  add column if not exists breitengrad numeric(9,6),
  add column if not exists laengengrad numeric(9,6),
  add column if not exists geokodiert_am timestamptz;

comment on column public.b2b_kunden.adresse is
  'Anforderung 3.5: vom Buero eingetragene Anschrift, Grundlage fuer die automatische Geokodierung (breitengrad/laengengrad).';
comment on column public.b2b_kunden.geokodiert_am is
  'Zeitpunkt der letzten erfolgreichen Geokodierung. null, solange die Adresse noch nicht geokodiert werden konnte (z. B. Tippfehler) - dann bleiben breitengrad/laengengrad ebenfalls null statt eines falschen Rateergebnisses.';

-- ---------------------------------------------------------------------------
-- 2. Touren
-- ---------------------------------------------------------------------------
create type public.tour_status as enum ('geplant', 'unterwegs', 'abgeschlossen');

create table public.touren (
  id                uuid primary key default gen_random_uuid(),
  datum             date not null,
  status            public.tour_status not null default 'geplant',
  distanz_km        numeric(7,2),
  dauer_minuten     integer,
  routen_geometrie  jsonb,
  erstellt_von_profil_id uuid references public.profiles(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table public.touren is
  'Anforderung 3.5 Teil 1: eine geplante Abholrunde/Auslieferungstour fuer einen Tag. routen_geometrie ist die von OSRM zurueckgelieferte GeoJSON-Liniengeometrie, distanz_km/dauer_minuten die von OSRM geschaetzten Werte - reine Anzeige, keine Abrechnungsgrundlage.';

create trigger trg_touren_updated before update on public.touren
  for each row execute function public.set_updated_at();

alter table public.touren enable row level security;
alter table public.touren force row level security;

create policy touren_select_buero on public.touren
  for select to authenticated
  using (public.has_office_access());

create policy touren_write_buero on public.touren
  for all to authenticated
  using (public.has_office_access())
  with check (public.has_office_access());

-- ---------------------------------------------------------------------------
-- 3. Lieferungen einer Tour zuordnen
-- ---------------------------------------------------------------------------
alter table public.lieferungen
  add column if not exists tour_id uuid references public.touren(id) on delete set null,
  add column if not exists tour_reihenfolge integer;

comment on column public.lieferungen.tour_id is
  'Anforderung 3.5 Teil 1: optionale Zuordnung zu einer geplanten Tour. null = weiterhin eigenstaendig geplant, wie vor dieser Migration.';
comment on column public.lieferungen.tour_reihenfolge is
  'Position innerhalb der Tour nach der OSRM-Routenoptimierung (0-basiert), nicht die Reihenfolge der Planung.';

create index if not exists idx_lieferungen_tour on public.lieferungen(tour_id);
