-- =============================================================================
-- Damicon - Initiales Datenbankschema
-- =============================================================================
-- Betriebssteuerung fuer einen Himbeerbetrieb, Domaenenmodell-Remapping aus dem
-- 1Cati-ERP-Oekosystem (Analyse Kapitel 4). Vier Zonen: Feld, Hof, Buero, Markt.
--
-- 1Cati-Entitaet          -> Damicon-Aequivalent
--   companies             -> betriebe
--   sites                 -> plantagen
--   site_blocks           -> feldparzellen
--   site_floors           -> reihengruppen
--   units                 -> reihenbloecke  (Zustandsautomat inkl. blocked -> wartezeitgesperrt)
--   workforce_tasks       -> pflueckaufgaben
--   media_reports         -> media_belege
--   finance_ledger_entries-> finance_ledger_entries  (Unveraenderlichkeit bleibt)
--   integration_outbox    -> integration_outbox
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- Hilfsfunktion: updated_at automatisch pflegen
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.app_role as enum (
  'admin', 'betriebsleitung', 'buchhaltung', 'brigade', 'erzeuger', 'kunde'
);

create type public.plantage_typ as enum ('eigen', 'nachbarbetrieb');
create type public.spalierrichtung as enum ('n_s', 'o_w');
create type public.sorte_typ as enum ('remontierend', 'sommertragend');

-- units-Zustandsautomat aus 1Cati: occupied/vacant/reserved/maintenance/blocked
create type public.reihenblock_status as enum (
  'bepflanzt',          -- occupied
  'erntereif',          -- reserved
  'ruhend',             -- vacant
  'rueckschnitt',       -- maintenance
  'wartezeitgesperrt'   -- blocked (PSM-Wartezeit laeuft, Ernte gesperrt)
);

create type public.pflueckaufgabe_status as enum (
  'offen', 'angenommen', 'in_arbeit', 'beleg_pruefung', 'abgeschlossen'
);
create type public.beleg_art as enum ('schale', 'reihenblock', 'steige');
create type public.charge_status as enum ('offen', 'gekuehlt', 'verladen', 'ausgeliefert');
create type public.kuehlkette_ergebnis as enum ('ok', 'warnung', 'verstoss');
create type public.esutd_status as enum ('erfasst', 'offen');

create type public.dokument_kategorie as enum (
  'spritzmittelprotokoll', 'esutd_nachweis', 'liefervertrag',
  'foerderdossier', 'zertifikat', 'sonstiges'
);
create type public.dokument_status as enum ('gueltig', 'prueflauf', 'abgelaufen');
create type public.integration_status as enum ('verbunden', 'sandbox', 'geplant');
create type public.outbox_status as enum ('pending', 'sent', 'acked', 'failed');
create type public.vorbestellung_status as enum ('angefragt', 'bestaetigt', 'geliefert', 'storniert');
create type public.ledger_typ as enum ('erloes', 'kosten');
create type public.lohn_status as enum ('entwurf', 'freigegeben', 'ausgezahlt');

-- ---------------------------------------------------------------------------
-- RBAC - sechs Kernrollen, uebernommen aus 1Cati lib/rbac.ts
-- ---------------------------------------------------------------------------
create table public.profiles (
  id            uuid primary key default gen_random_uuid(),
  auth_user_id  uuid unique references auth.users(id) on delete cascade,
  full_name     text not null,
  email         text,
  role          public.app_role not null default 'brigade',
  brigade_id    uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.profiles is 'Nutzerprofile mit Rolle. Remapping der 1Cati-Rollen admin/manager/accountant/staff/owner/tenant.';
create trigger trg_profiles_updated before update on public.profiles
  for each row execute function public.set_updated_at();

-- Rollen-Aufloesung fuer RLS (liest die Rolle des aktuellen Auth-Users).
create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where auth_user_id = auth.uid() limit 1;
$$;

create or replace function public.has_office_access()
returns boolean
language sql
stable
as $$
  select public.current_app_role() in ('admin', 'betriebsleitung', 'buchhaltung');
$$;

-- =========================================================================
-- ZONE FELD - Standort-Hierarchie, Anbau, Ernte, Pflanzenschutz
-- =========================================================================

create table public.betriebe (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.betriebe is '1Cati companies - Betreiberfirma bzw. Aggregator-Marke.';
create trigger trg_betriebe_updated before update on public.betriebe
  for each row execute function public.set_updated_at();

create table public.nachbarbetriebe (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  ort                text,
  kontakt            text,
  identitaets_digest text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.nachbarbetriebe is '1Cati vendors - Nachbarbetriebe im Zukauf (Aggregator, Horizont 2).';
create trigger trg_nachbarbetriebe_updated before update on public.nachbarbetriebe
  for each row execute function public.set_updated_at();

create table public.sorten (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  typ          public.sorte_typ not null,
  erntefenster text,
  schale_g     integer,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.sorten is 'Sortenkatalog (1Cati listings), remontierend vs. sommertragend.';
create trigger trg_sorten_updated before update on public.sorten
  for each row execute function public.set_updated_at();

create table public.plantagen (
  id                 uuid primary key default gen_random_uuid(),
  betrieb_id         uuid not null references public.betriebe(id) on delete cascade,
  name               text not null,
  ort                text,
  typ                public.plantage_typ not null default 'eigen',
  nachbarbetrieb_id  uuid references public.nachbarbetriebe(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.plantagen is '1Cati sites - Plantage bzw. angeschlossener Nachbarbetrieb.';
create index idx_plantagen_betrieb on public.plantagen(betrieb_id);
create trigger trg_plantagen_updated before update on public.plantagen
  for each row execute function public.set_updated_at();

create table public.feldparzellen (
  id           uuid primary key default gen_random_uuid(),
  plantage_id  uuid not null references public.plantagen(id) on delete cascade,
  name         text not null,
  flaeche_ha   numeric(6,2),
  sorte_id     uuid references public.sorten(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.feldparzellen is '1Cati site_blocks - Feldparzelle.';
create index idx_feldparzellen_plantage on public.feldparzellen(plantage_id);
create trigger trg_feldparzellen_updated before update on public.feldparzellen
  for each row execute function public.set_updated_at();

create table public.reihengruppen (
  id                     uuid primary key default gen_random_uuid(),
  feldparzelle_id        uuid not null references public.feldparzellen(id) on delete cascade,
  name                   text not null,
  spalierrichtung        public.spalierrichtung not null default 'n_s',
  anzahl_reihenbloecke   integer not null default 0,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.reihengruppen is '1Cati site_floors - Spalier-/Rutenreihen-Gruppe.';
create index idx_reihengruppen_parzelle on public.reihengruppen(feldparzelle_id);
create trigger trg_reihengruppen_updated before update on public.reihengruppen
  for each row execute function public.set_updated_at();

create table public.reihenbloecke (
  id              uuid primary key default gen_random_uuid(),
  reihengruppe_id uuid not null references public.reihengruppen(id) on delete cascade,
  code            text not null unique,
  sorte_id        uuid references public.sorten(id) on delete set null,
  status          public.reihenblock_status not null default 'ruhend',
  laenge_m        numeric(6,1),
  letzte_ernte    date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.reihenbloecke is '1Cati units - Reihenblock mit Zustandsautomat. Status blocked = wartezeitgesperrt.';
create index idx_reihenbloecke_gruppe on public.reihenbloecke(reihengruppe_id);
create index idx_reihenbloecke_status on public.reihenbloecke(status);
create trigger trg_reihenbloecke_updated before update on public.reihenbloecke
  for each row execute function public.set_updated_at();

-- Personal --------------------------------------------------------------------

create table public.brigaden (
  id          uuid primary key default gen_random_uuid(),
  plantage_id uuid references public.plantagen(id) on delete set null,
  name        text not null,
  vorarbeiter text,
  staerke     integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.brigaden is 'Brigaden-Zuordnung ueber workforce_tasks statt Bewohnerzuordnung.';
create trigger trg_brigaden_updated before update on public.brigaden
  for each row execute function public.set_updated_at();

alter table public.profiles
  add constraint fk_profiles_brigade foreign key (brigade_id)
  references public.brigaden(id) on delete set null;

create table public.pfluecker (
  id          uuid primary key default gen_random_uuid(),
  brigade_id  uuid references public.brigaden(id) on delete set null,
  name        text not null,
  ausweis     text not null unique,
  esutd       public.esutd_status not null default 'offen',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.pfluecker is '1Cati StaffMember - Pflueckerstamm mit Ausweis.';
create index idx_pfluecker_brigade on public.pfluecker(brigade_id);
create trigger trg_pfluecker_updated before update on public.pfluecker
  for each row execute function public.set_updated_at();

create table public.esutd_vertraege (
  id             uuid primary key default gen_random_uuid(),
  pfluecker_id   uuid not null references public.pfluecker(id) on delete cascade,
  vertragsnummer text,
  erfasst_am     date,
  status         public.esutd_status not null default 'offen',
  outbox_id      uuid,
  created_at     timestamptz not null default now()
);
comment on table public.esutd_vertraege is 'ESUTD-Arbeitsvertragserfassung, angebunden ueber integration_outbox.';

-- Pflanzenschutz ------------------------------------------------------------

create table public.psm_mittel (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  wirkstoff      text,
  wartezeit_tage integer not null default 3,
  created_at     timestamptz not null default now()
);
comment on table public.psm_mittel is 'Pflanzenschutzmittel-Katalog mit mittelspezifischer Wartezeit.';

create table public.pflanzenschutz_behandlungen (
  id             uuid primary key default gen_random_uuid(),
  reihenblock_id uuid not null references public.reihenbloecke(id) on delete cascade,
  psm_mittel_id  uuid not null references public.psm_mittel(id),
  behandelt_am   date not null,
  wartezeit_tage integer not null,
  freigabe_am    date generated always as (behandelt_am + wartezeit_tage) stored,
  freigegeben    boolean not null default false,
  dokument_id    uuid,
  created_at     timestamptz not null default now()
);
comment on table public.pflanzenschutz_behandlungen is 'Erntesperre nach Behandlung. Muster aus 1Cati payment-restriction-control, Bedingung = Wartezeit-Ablauf.';
create index idx_behandlungen_block on public.pflanzenschutz_behandlungen(reihenblock_id);

-- Bei neuer Behandlung: Reihenblock sperren. Muster "Bedingung sperrt Aktion bis erfuellt".
create or replace function public.lock_reihenblock_on_behandlung()
returns trigger
language plpgsql
as $$
begin
  update public.reihenbloecke
     set status = 'wartezeitgesperrt'
   where id = new.reihenblock_id
     and status <> 'wartezeitgesperrt';
  return new;
end;
$$;
create trigger trg_behandlung_lock after insert on public.pflanzenschutz_behandlungen
  for each row execute function public.lock_reihenblock_on_behandlung();

-- Ernte / Chargen / Aufgaben / Belege / Steigen -----------------------------

create table public.chargen (
  id                    uuid primary key default gen_random_uuid(),
  code                  text not null unique,
  reihenblock_id        uuid references public.reihenbloecke(id) on delete set null,
  sorte_id              uuid references public.sorten(id) on delete set null,
  ernte_datum           date not null default current_date,
  status                public.charge_status not null default 'offen',
  pflueck_zeitpunkt     timestamptz,
  vorkuehlung_zeitpunkt timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
comment on table public.chargen is 'Charge = Herkunftsblock + Sorte + Erntetag. Kern der Nachweiskette.';
create index idx_chargen_block on public.chargen(reihenblock_id);
create trigger trg_chargen_updated before update on public.chargen
  for each row execute function public.set_updated_at();

create table public.pflueckaufgaben (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique,
  reihenblock_id   uuid not null references public.reihenbloecke(id) on delete cascade,
  charge_id        uuid references public.chargen(id) on delete set null,
  brigade_id       uuid references public.brigaden(id) on delete set null,
  sorte_id         uuid references public.sorten(id) on delete set null,
  status           public.pflueckaufgabe_status not null default 'offen',
  faelligkeit      timestamptz,
  zielmenge_kg     numeric(8,2) not null default 0,
  ist_menge_kg     numeric(8,2) not null default 0,
  pfluecker_anzahl integer not null default 0,
  qualitaetsfaktor numeric(4,2),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
comment on table public.pflueckaufgaben is '1Cati workforce_tasks - Pflueckaufgabe je Brigade und Reihenblock.';
create index idx_pflueckaufgaben_block on public.pflueckaufgaben(reihenblock_id);
create index idx_pflueckaufgaben_status on public.pflueckaufgaben(status);
create trigger trg_pflueckaufgaben_updated before update on public.pflueckaufgaben
  for each row execute function public.set_updated_at();

create table public.media_belege (
  id                uuid primary key default gen_random_uuid(),
  pflueckaufgabe_id uuid not null references public.pflueckaufgaben(id) on delete cascade,
  art               public.beleg_art not null,
  aufgenommen_am    timestamptz not null default now(),
  hinweis           text,
  digest            text,
  storage_path      text,
  created_at        timestamptz not null default now()
);
comment on table public.media_belege is '1Cati media_reports - Fotobeleg (Schale, Reihenblock, Steige) an der Aufgabe.';
create index idx_media_belege_aufgabe on public.media_belege(pflueckaufgabe_id);

create table public.steigen (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  qr_token          text not null unique,
  charge_id         uuid references public.chargen(id) on delete set null,
  pflueckaufgabe_id uuid references public.pflueckaufgaben(id) on delete set null,
  gewicht_kg        numeric(6,2),
  scan_zeitpunkt    timestamptz,
  created_at        timestamptz not null default now()
);
comment on table public.steigen is 'QR-Steigenkennung (1Cati Migration 28). QR-pro-Steige statt QR-pro-Zone.';

-- Kuehlkette / Rotation / Wetter ------------------------------------------

create table public.kuehlketten_messungen (
  id                     uuid primary key default gen_random_uuid(),
  charge_id              uuid not null references public.chargen(id) on delete cascade,
  gemessen_am            timestamptz not null default now(),
  temperatur_c           numeric(4,1) not null,
  minuten_seit_pfluecken integer,
  ergebnis               public.kuehlkette_ergebnis not null default 'ok',
  created_at             timestamptz not null default now()
);
comment on table public.kuehlketten_messungen is 'Kuehlketten-Uhr: harte 60-Minuten-Grenze Pfluecken bis Vorkuehlung, Ziel 0-1 Grad.';
create index idx_kuehlkette_charge on public.kuehlketten_messungen(charge_id);

create table public.rotationsplan_eintraege (
  id             uuid primary key default gen_random_uuid(),
  reihenblock_id uuid not null references public.reihenbloecke(id) on delete cascade,
  brigade_id     uuid references public.brigaden(id) on delete set null,
  geplant_fuer   date not null,
  intervall_tage integer not null default 3,
  status         text not null default 'geplant',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.rotationsplan_eintraege is 'Rotationsplan-Engine: Pflueckintervall 2-3 Tage je Reihenblock. Neu, kein 1Cati-Vorbild.';
create trigger trg_rotationsplan_updated before update on public.rotationsplan_eintraege
  for each row execute function public.set_updated_at();

create table public.wetter_messungen (
  id               uuid primary key default gen_random_uuid(),
  feldparzelle_id  uuid references public.feldparzellen(id) on delete set null,
  gemessen_am      date not null,
  temp_min_c       numeric(4,1),
  temp_max_c       numeric(4,1),
  niederschlag_mm  numeric(5,1),
  temperatursumme  numeric(7,1),
  created_at       timestamptz not null default now()
);
comment on table public.wetter_messungen is 'Einfache Wetteranbindung + Temperatursummen-Heuristik (kein ML in Phase 1).';

-- =========================================================================
-- ZONE MARKT - Sorten, Kontingente, B2B, Aggregator, Schulungen
-- =========================================================================

create table public.b2b_kunden (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  kontakt            text,
  identitaets_digest text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table public.b2b_kunden is 'B2B-Kunden. Digest-Muster aus 1Cati identity-verification.';
create trigger trg_b2b_kunden_updated before update on public.b2b_kunden
  for each row execute function public.set_updated_at();

create table public.kontingente (
  id            uuid primary key default gen_random_uuid(),
  sorte_id      uuid not null references public.sorten(id) on delete cascade,
  b2b_kunde_id  uuid references public.b2b_kunden(id) on delete set null,
  menge_kg      numeric(10,2) not null default 0,
  reserviert_kg numeric(10,2) not null default 0,
  saison        text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.kontingente is 'Kontingent-Vorbestellung. Buchungsmuster aus 1Cati reservations.';
create trigger trg_kontingente_updated before update on public.kontingente
  for each row execute function public.set_updated_at();

create table public.preislisten (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  gueltig_ab  date not null default current_date,
  gueltig_bis date,
  aktiv       boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.preislisten_positionen (
  id            uuid primary key default gen_random_uuid(),
  preisliste_id uuid not null references public.preislisten(id) on delete cascade,
  sorte_id      uuid not null references public.sorten(id) on delete cascade,
  preis_tenge_kg numeric(10,2) not null,
  min_menge_kg  numeric(10,2) not null default 0,
  created_at    timestamptz not null default now()
);
create index idx_preispos_liste on public.preislisten_positionen(preisliste_id);

create table public.vorbestellungen (
  id           uuid primary key default gen_random_uuid(),
  b2b_kunde_id uuid not null references public.b2b_kunden(id) on delete cascade,
  sorte_id     uuid not null references public.sorten(id) on delete restrict,
  menge_kg     numeric(10,2) not null,
  liefertermin date,
  status       public.vorbestellung_status not null default 'angefragt',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table public.vorbestellungen is '1Cati reservations - Liefer-/Abholtermin, Kontingent-Vorbestellung.';
create trigger trg_vorbestellungen_updated before update on public.vorbestellungen
  for each row execute function public.set_updated_at();

create table public.lieferungen (
  id                    uuid primary key default gen_random_uuid(),
  vorbestellung_id      uuid references public.vorbestellungen(id) on delete set null,
  b2b_kunde_id          uuid not null references public.b2b_kunden(id) on delete cascade,
  charge_id             uuid references public.chargen(id) on delete set null,
  geliefert_am          timestamptz,
  menge_kg              numeric(10,2) not null default 0,
  lieferschein_outbox_id uuid,
  created_at            timestamptz not null default now()
);
comment on table public.lieferungen is 'Abholrunden / Tourenplanung. Lifecycle-Muster aus 1Cati booking-lifecycle-repository.';

create table public.zukauf_positionen (
  id                uuid primary key default gen_random_uuid(),
  nachbarbetrieb_id uuid not null references public.nachbarbetriebe(id) on delete cascade,
  charge_id         uuid references public.chargen(id) on delete set null,
  sorte_id          uuid references public.sorten(id) on delete set null,
  menge_kg          numeric(10,2) not null,
  preis_tenge_kg    numeric(10,2) not null,
  rechnungsdatum    date,
  created_at        timestamptz not null default now()
);
comment on table public.zukauf_positionen is 'Aggregator: Zukaufmenge wird Rechnungsposition (1Cati vendor-invoice-repository), getrennte Chargenfuehrung.';

create table public.schulungsvideos (
  id             uuid primary key default gen_random_uuid(),
  titel          text not null,
  thema          text,
  dauer_sekunden integer,
  sprachen       text[] not null default '{}',
  storage_path   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.schulungsvideos is '1Cati video-library - mehrsprachige Kurzeinarbeitung der Saisonkraefte.';
create trigger trg_schulungsvideos_updated before update on public.schulungsvideos
  for each row execute function public.set_updated_at();

-- =========================================================================
-- ZONE BUERO - Finanzen, Lohn, Dokumente, Compliance, Integrationen
-- =========================================================================

create table public.kostentraeger (
  id            uuid primary key default gen_random_uuid(),
  reihenblock_id uuid references public.reihenbloecke(id) on delete set null,
  sorte_id      uuid references public.sorten(id) on delete set null,
  erntetag      date,
  bezeichnung   text not null,
  created_at    timestamptz not null default now(),
  unique (reihenblock_id, sorte_id, erntetag)
);
comment on table public.kostentraeger is 'Kostentraeger je Reihenblock, Sorte und Erntetag (1Cati: nur Einheit/Zeitraum).';

create table public.finance_ledger_entries (
  id             uuid primary key default gen_random_uuid(),
  kostentraeger_id uuid references public.kostentraeger(id) on delete set null,
  charge_id      uuid references public.chargen(id) on delete set null,
  typ            public.ledger_typ not null,
  kategorie      text not null,
  betrag_tenge   numeric(14,2) not null,
  buchungsdatum  date not null default current_date,
  beschreibung   text,
  created_at     timestamptz not null default now()
);
comment on table public.finance_ledger_entries is '1Cati finance_ledger_entries - Deckungsbeitrag. Unveraenderlich (Trigger blockt UPDATE/DELETE).';
create index idx_ledger_kostentraeger on public.finance_ledger_entries(kostentraeger_id);
create index idx_ledger_datum on public.finance_ledger_entries(buchungsdatum);

-- Unveraenderlichkeits-Trigger (1Cati-Muster): Ledger-Eintraege sind append-only.
create or replace function public.block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception 'finance_ledger_entries ist unveraenderlich (append-only). % nicht erlaubt.', tg_op;
end;
$$;
create trigger trg_ledger_no_update before update on public.finance_ledger_entries
  for each row execute function public.block_ledger_mutation();
create trigger trg_ledger_no_delete before delete on public.finance_ledger_entries
  for each row execute function public.block_ledger_mutation();

create table public.lohn_abrechnungen (
  id                     uuid primary key default gen_random_uuid(),
  pfluecker_id           uuid not null references public.pfluecker(id) on delete cascade,
  periode_start          date not null,
  periode_ende           date not null,
  grundlohn_tenge        numeric(12,2) not null default 0,
  mengen_komponente_tenge numeric(12,2) not null default 0,
  qualitaetsfaktor       numeric(4,2) not null default 1.00,
  gesamt_tenge           numeric(12,2) not null default 0,
  status                 public.lohn_status not null default 'entwurf',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
comment on table public.lohn_abrechnungen is 'Qualitaetsfaktor-Lohn: Grundlohn + Mengenkomponente + Qualitaetsfaktor. Neu, kein 1Cati-Vorbild.';
create trigger trg_lohn_updated before update on public.lohn_abrechnungen
  for each row execute function public.set_updated_at();

create table public.lohn_positionen (
  id                 uuid primary key default gen_random_uuid(),
  lohn_abrechnung_id uuid not null references public.lohn_abrechnungen(id) on delete cascade,
  pflueckaufgabe_id  uuid references public.pflueckaufgaben(id) on delete set null,
  menge_kg           numeric(8,2) not null default 0,
  qualitaetsfaktor   numeric(4,2) not null default 1.00,
  betrag_tenge       numeric(12,2) not null default 0,
  created_at         timestamptz not null default now()
);
create index idx_lohnpos_abrechnung on public.lohn_positionen(lohn_abrechnung_id);

create table public.dokumente (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kategorie      public.dokument_kategorie not null default 'sonstiges',
  bezug          text,
  stand          date,
  status         public.dokument_status not null default 'gueltig',
  reihenblock_id uuid references public.reihenbloecke(id) on delete set null,
  charge_id      uuid references public.chargen(id) on delete set null,
  storage_path   text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.dokumente is '1Cati document-storage.ts - Spritzmittelprotokolle, Vertraege, ESUTD-Nachweise.';
create index idx_dokumente_kategorie on public.dokumente(kategorie);
create trigger trg_dokumente_updated before update on public.dokumente
  for each row execute function public.set_updated_at();

-- FK-Nachtrag: Behandlung -> Dokument
alter table public.pflanzenschutz_behandlungen
  add constraint fk_behandlung_dokument foreign key (dokument_id)
  references public.dokumente(id) on delete set null;

create table public.foerderdossiers (
  id            uuid primary key default gen_random_uuid(),
  portal        text not null,
  antragsnummer text,
  titel         text not null,
  status        text not null default 'entwurf',
  eingereicht_am date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table public.foerderdossiers is 'Foerdermitteldossier fuer gosagro.kz / qoldau.kz. Container-Muster aus 1Cati.';
create trigger trg_foerderdossiers_updated before update on public.foerderdossiers
  for each row execute function public.set_updated_at();

create table public.consent_records (
  id             uuid primary key default gen_random_uuid(),
  subjekt        text not null,
  zweck          text not null,
  rechtsgrundlage text,
  erteilt_am     timestamptz not null default now(),
  widerrufen_am  timestamptz,
  created_at     timestamptz not null default now()
);
comment on table public.consent_records is 'Consent-Ledger aus 1Cati. Texte nach kasachstanischem Datenschutzrecht neu.';

create table public.audit_events (
  id           uuid primary key default gen_random_uuid(),
  actor        text,
  aktion       text not null,
  ressource    text not null,
  ressource_id uuid,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
comment on table public.audit_events is '1Cati ai_action_logs / audit_events / access_events - append-only Compliance-Log.';
create index idx_audit_ressource on public.audit_events(ressource, created_at desc);
create trigger trg_audit_no_update before update on public.audit_events
  for each row execute function public.block_ledger_mutation();
create trigger trg_audit_no_delete before delete on public.audit_events
  for each row execute function public.block_ledger_mutation();

create table public.integrationen (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name       text not null,
  system     text not null,
  status     public.integration_status not null default 'geplant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.integrationen is 'Registry der staatlichen Pflichtintegrationen (ESF, ESUTD, gosagro.kz, qoldau.kz).';
create trigger trg_integrationen_updated before update on public.integrationen
  for each row execute function public.set_updated_at();

create table public.integration_outbox (
  id             uuid primary key default gen_random_uuid(),
  ziel_system    text not null,
  richtung       text not null default 'outbox',
  payload        jsonb not null default '{}'::jsonb,
  status         public.outbox_status not null default 'pending',
  versuche       integer not null default 0,
  letzter_fehler text,
  verarbeitet_am timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table public.integration_outbox is '1Cati integration_outbox - Bruecke zu ESF, ESUTD, FFoerderportalen (kein Eigenbau der Buchhaltung).';
create index idx_outbox_status on public.integration_outbox(status);
create trigger trg_outbox_updated before update on public.integration_outbox
  for each row execute function public.set_updated_at();

-- FK-Nachtraege auf integration_outbox
alter table public.esutd_vertraege
  add constraint fk_esutd_outbox foreign key (outbox_id)
  references public.integration_outbox(id) on delete set null;
alter table public.lieferungen
  add constraint fk_lieferung_outbox foreign key (lieferschein_outbox_id)
  references public.integration_outbox(id) on delete set null;

create table public.kpi_baseline (
  id              uuid primary key default gen_random_uuid(),
  key             text not null unique,
  name            text not null,
  zone            text not null,
  ziel            text,
  baseline_wert   text,
  gut_richtung    text not null default 'up',
  unterschrieben_am date,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table public.kpi_baseline is '14 Baseline-KPIs, mit dem Kunden am 01.10.2026 als Baseline unterschrieben.';
create trigger trg_kpi_updated before update on public.kpi_baseline
  for each row execute function public.set_updated_at();
