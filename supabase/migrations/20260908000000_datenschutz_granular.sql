-- =============================================================================
-- Malina - Compliance-Cockpit mit granularem Datenschutz-Schema (WMCNL-1446)
-- =============================================================================
-- public.consent_records war eine einzige, grob strukturierte Tabelle mit
-- Freitext-Subjekt und Freitext-Zweck - fuer ein Compliance-Cockpit zu grob:
-- weder laesst sich daraus ableiten, WESSEN Daten zu welchem Zweck verarbeitet
-- werden, noch gibt es Fristen fuer Meldung oder Loeschung. Diese Migration
-- ersetzt die Tabelle durch fuenf fachlich getrennte Tabellen:
--
--   1. verarbeitungszwecke          - Zweckverzeichnis mit Rechtsgrundlage und
--                                      Aufbewahrungsfrist (Artikel 12/18).
--   2. einwilligungen                - Einwilligung als Datensatz mit Zeitpunkt,
--                                      Textfassung und Erteilungsweg statt eines
--                                      booleschen Feldes - nur so laesst sich im
--                                      Streitfall beweisen, WOZU jemand WANN
--                                      zugestimmt hat.
--   3. personenbezogene_zugriffe     - fachliches Zugriffsprotokoll (wer hat
--                                      wessen Daten gelesen/exportiert/gedruckt/
--                                      uebermittelt), getrennt vom technischen
--                                      audit_events.
--   4. datenschutzvorfaelle          - Vorfaelle mit automatisch gesetzter
--                                      Meldefrist.
--   5. drittweitergaben              - Weitergabe an Dritte mit automatisch
--                                      gesetzter Benachrichtigungsfrist.
--
-- Subjekt-Modellierung: ein Betroffener ist in Malina einer von drei
-- Tabellen - Pfluecker ohne Login, Profil mit Login oder B2B-Kunde. Statt
-- eines generischen subjekt_typ+subjekt_id-Paares (keine erzwungene
-- Fremdschluessel-Integritaet, genau die Schwaeche von consent_records.subjekt)
-- bekommt jede betroffene Tabelle drei nullable FK-Spalten mit einem Check
-- "genau eine gesetzt" (num_nonnulls). Das kostet drei Spalten statt einer,
-- gewinnt aber echte referenzielle Integritaet je Subjekttyp.
--
-- RLS-Entscheidung: abweichend vom Selbstauskunftsrecht (Artikel 24), das im
-- Schwesterprojekt Digitalisierung-Himbeerenbetrieb umgesetzt ist, lesen und
-- schreiben hier ausschliesslich die Buero-Rollen admin/betriebsleitung/
-- buchhaltung (Auftrag WMCNL-1446). Das faellige Auskunftsrecht der
-- Betroffenen ist damit bewusst nicht Teil dieser Migration.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.rechtsgrundlage_typ as enum (
  'einwilligung', 'vertrag', 'gesetzliche_pflicht'
);
create type public.einwilligung_kanal as enum ('papier', 'app', 'web', 'sms');
create type public.zugriffsaktion as enum ('lesen', 'export', 'druck', 'uebermittlung');
create type public.vorfall_art as enum (
  'unbefugter_zugriff', 'verlust', 'offenlegung', 'sonstiges'
);

-- ---------------------------------------------------------------------------
-- 1. Zweckverzeichnis
-- ---------------------------------------------------------------------------
create table public.verarbeitungszwecke (
  id                          uuid primary key default gen_random_uuid(),
  code                        text not null unique,
  bezeichnung                 text not null,
  beschreibung                text,
  rechtsgrundlage             public.rechtsgrundlage_typ not null,
  aufbewahrung_monate         smallint not null check (aufbewahrung_monate > 0),
  -- Automatisierte Entscheidung im Sinne der 2026er Novelle: loest eigene
  -- Einwilligungspflicht und Erklaerpflicht aus (z.B. Qualitaetsfaktor-Lohn).
  automatisierte_entscheidung boolean not null default false,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);
comment on table public.verarbeitungszwecke is
  'Zweckverzeichnis. Grundlage jeder Einwilligung und jeder Drittweitergabe, Basis fuer die vom Regierungsportal verlangte Liste verarbeiteter Daten.';
create trigger trg_verarbeitungszwecke_updated before update on public.verarbeitungszwecke
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. Einwilligungen (loest public.consent_records ab)
-- ---------------------------------------------------------------------------
create table public.einwilligungen (
  id                        uuid primary key default gen_random_uuid(),
  betroffener_pfluecker_id  uuid references public.pfluecker(id) on delete restrict,
  betroffener_profil_id     uuid references public.profiles(id) on delete restrict,
  betroffener_b2b_kunde_id  uuid references public.b2b_kunden(id) on delete restrict,
  zweck_id                  uuid not null references public.verarbeitungszwecke(id) on delete restrict,
  textfassung               text not null,
  sprache                   text not null default 'ru'
                              check (sprache in ('de', 'en', 'ru', 'kk', 'tr')),
  erteilt_am                timestamptz not null default now(),
  kanal                     public.einwilligung_kanal not null,
  nachweis_referenz         text,
  widerrufen_am             timestamptz,
  widerruf_grund            text,
  created_at                timestamptz not null default now(),
  constraint einwilligung_genau_ein_betroffener check (
    num_nonnulls(betroffener_pfluecker_id, betroffener_profil_id, betroffener_b2b_kunde_id) = 1
  ),
  constraint einwilligung_widerruf_braucht_grund
    check (widerrufen_am is null or widerruf_grund is not null),
  constraint einwilligung_widerruf_nach_erteilung
    check (widerrufen_am is null or widerrufen_am >= erteilt_am)
);
comment on table public.einwilligungen is
  'Einwilligung als Nachweis-Datensatz statt boolesches Feld: Zeitpunkt, Textfassung und Erteilungsweg, damit sich im Streitfall beweisen laesst, wozu wann zugestimmt wurde.';
create index idx_einwilligungen_pfluecker on public.einwilligungen(betroffener_pfluecker_id)
  where betroffener_pfluecker_id is not null;
create index idx_einwilligungen_profil on public.einwilligungen(betroffener_profil_id)
  where betroffener_profil_id is not null;
create index idx_einwilligungen_b2b on public.einwilligungen(betroffener_b2b_kunde_id)
  where betroffener_b2b_kunde_id is not null;
create index idx_einwilligungen_zweck on public.einwilligungen(zweck_id);
create index idx_einwilligungen_offen on public.einwilligungen(erteilt_am) where widerrufen_am is null;

-- Eine erteilte Einwilligung wird nicht umgeschrieben oder geloescht - nur der
-- Widerruf (widerrufen_am/widerruf_grund) ist als Update zulaessig. Anders als
-- block_ledger_mutation(), das JEDE Aenderung blockt, muss hier genau eine
-- Art von Update erlaubt bleiben - deshalb eine eigene Funktion.
create or replace function public.einwilligung_nur_widerruf()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Einwilligungen werden nicht geloescht, sondern widerrufen.'
      using errcode = '23514';
  end if;

  if new.betroffener_pfluecker_id is distinct from old.betroffener_pfluecker_id
     or new.betroffener_profil_id is distinct from old.betroffener_profil_id
     or new.betroffener_b2b_kunde_id is distinct from old.betroffener_b2b_kunde_id
     or new.zweck_id is distinct from old.zweck_id
     or new.textfassung is distinct from old.textfassung
     or new.sprache is distinct from old.sprache
     or new.erteilt_am is distinct from old.erteilt_am
     or new.kanal is distinct from old.kanal
     or new.nachweis_referenz is distinct from old.nachweis_referenz then
    raise exception 'Eine erteilte Einwilligung ist unveraenderlich. Zulaessig ist nur der Widerruf.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger trg_einwilligung_nur_widerruf
  before update or delete on public.einwilligungen
  for each row execute function public.einwilligung_nur_widerruf();

-- ---------------------------------------------------------------------------
-- 3. Personenbezogene Zugriffe (fachliches Protokoll, getrennt von
--    public.audit_events, dem technischen Ereignisprotokoll)
-- ---------------------------------------------------------------------------
create table public.personenbezogene_zugriffe (
  id                        uuid primary key default gen_random_uuid(),
  akteur_id                 uuid references public.profiles(id) on delete set null,
  betroffener_pfluecker_id  uuid references public.pfluecker(id) on delete restrict,
  betroffener_profil_id     uuid references public.profiles(id) on delete restrict,
  betroffener_b2b_kunde_id  uuid references public.b2b_kunden(id) on delete restrict,
  zweck_id                  uuid references public.verarbeitungszwecke(id) on delete set null,
  aktion                    public.zugriffsaktion not null,
  entitaet                  text not null,
  entitaet_id               uuid,
  stattgefunden_am          timestamptz not null default now(),
  client_info               text,
  constraint zugriff_genau_ein_betroffener check (
    num_nonnulls(betroffener_pfluecker_id, betroffener_profil_id, betroffener_b2b_kunde_id) = 1
  )
);
comment on table public.personenbezogene_zugriffe is
  'Fachliches Protokoll "wer hat wessen personenbezogene Daten gelesen/exportiert/gedruckt/uebermittelt" - bewusst nur bei export/druck/uebermittlung befuellt, nicht bei jedem Seitenaufruf, sonst waechst die Tabelle ungebremst.';
create index idx_zugriffe_akteur on public.personenbezogene_zugriffe(akteur_id, stattgefunden_am desc);
create index idx_zugriffe_pfluecker on public.personenbezogene_zugriffe(betroffener_pfluecker_id)
  where betroffener_pfluecker_id is not null;
create index idx_zugriffe_profil on public.personenbezogene_zugriffe(betroffener_profil_id)
  where betroffener_profil_id is not null;
create index idx_zugriffe_b2b on public.personenbezogene_zugriffe(betroffener_b2b_kunde_id)
  where betroffener_b2b_kunde_id is not null;

-- Append-only ueber die bereits vorhandene Funktion (wie schon bei
-- audit_events/finance_ledger_entries) statt einer neuen Sperrfunktion.
create trigger trg_zugriffe_no_update before update on public.personenbezogene_zugriffe
  for each row execute function public.block_ledger_mutation();
create trigger trg_zugriffe_no_delete before delete on public.personenbezogene_zugriffe
  for each row execute function public.block_ledger_mutation();

-- ---------------------------------------------------------------------------
-- 4. Datenschutzvorfaelle
-- ---------------------------------------------------------------------------
create table public.datenschutzvorfaelle (
  id                uuid primary key default gen_random_uuid(),
  festgestellt_am   timestamptz not null,
  art               public.vorfall_art not null,
  beschreibung      text not null,
  betroffene_anzahl integer check (betroffene_anzahl >= 0),
  -- Meldefrist: ein Arbeitstag ab Feststellung, vereinfacht als 24 Stunden.
  meldefrist_am     timestamptz,
  gemeldet_am       timestamptz,
  meldereferenz     text,
  behoben_am        timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint vorfall_meldung_braucht_referenz
    check (gemeldet_am is null or meldereferenz is not null)
);
comment on table public.datenschutzvorfaelle is
  'Datenschutzvorfaelle mit automatisch gesetzter Meldefrist. "Ueberfaellig" wird in lib/data/compliance.ts berechnet (meldefrist_am < now() and gemeldet_am is null) statt in einer SQL-View, wie es diesem Projekt entspricht.';
create index idx_vorfaelle_offen on public.datenschutzvorfaelle(meldefrist_am)
  where gemeldet_am is null;
create trigger trg_datenschutzvorfaelle_updated before update on public.datenschutzvorfaelle
  for each row execute function public.set_updated_at();

create or replace function public.datenschutzvorfall_meldefrist_setzen()
returns trigger
language plpgsql
as $$
begin
  if new.meldefrist_am is null then
    new.meldefrist_am := new.festgestellt_am + interval '1 day';
  end if;
  return new;
end;
$$;

create trigger trg_datenschutzvorfall_meldefrist
  before insert on public.datenschutzvorfaelle
  for each row execute function public.datenschutzvorfall_meldefrist_setzen();

-- ---------------------------------------------------------------------------
-- 5. Drittweitergaben
-- ---------------------------------------------------------------------------
create table public.drittweitergaben (
  id                          uuid primary key default gen_random_uuid(),
  betroffener_pfluecker_id    uuid references public.pfluecker(id) on delete restrict,
  betroffener_profil_id       uuid references public.profiles(id) on delete restrict,
  betroffener_b2b_kunde_id    uuid references public.b2b_kunden(id) on delete restrict,
  empfaenger                  text not null,
  zweck_id                    uuid references public.verarbeitungszwecke(id) on delete set null,
  weitergegeben_am            timestamptz not null default now(),
  -- Benachrichtigungsfrist: zehn Werktage, vereinfacht als 14 Kalendertage.
  benachrichtigungsfrist_am   timestamptz,
  benachrichtigt_am           timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  constraint drittweitergabe_genau_ein_betroffener check (
    num_nonnulls(betroffener_pfluecker_id, betroffener_profil_id, betroffener_b2b_kunde_id) = 1
  )
);
comment on table public.drittweitergaben is
  'Weitergabe personenbezogener Daten an Dritte (z.B. B2B-Kunde, Behoerde) mit automatisch gesetzter Benachrichtigungsfrist.';
create index idx_drittweitergaben_pfluecker on public.drittweitergaben(betroffener_pfluecker_id)
  where betroffener_pfluecker_id is not null;
create index idx_drittweitergaben_profil on public.drittweitergaben(betroffener_profil_id)
  where betroffener_profil_id is not null;
create index idx_drittweitergaben_b2b on public.drittweitergaben(betroffener_b2b_kunde_id)
  where betroffener_b2b_kunde_id is not null;
create index idx_drittweitergaben_zweck on public.drittweitergaben(zweck_id);
create index idx_drittweitergaben_offen on public.drittweitergaben(benachrichtigungsfrist_am)
  where benachrichtigt_am is null;
create trigger trg_drittweitergaben_updated before update on public.drittweitergaben
  for each row execute function public.set_updated_at();

create or replace function public.drittweitergabe_frist_setzen()
returns trigger
language plpgsql
as $$
begin
  if new.benachrichtigungsfrist_am is null then
    new.benachrichtigungsfrist_am := new.weitergegeben_am + interval '14 days';
  end if;
  return new;
end;
$$;

create trigger trg_drittweitergabe_frist
  before insert on public.drittweitergaben
  for each row execute function public.drittweitergabe_frist_setzen();

-- ---------------------------------------------------------------------------
-- 6. public.consent_records entfaellt - abgeloest durch verarbeitungszwecke
--    und einwilligungen. Kein Datenbestand zu migrieren (Prototyp-Seeddaten).
-- ---------------------------------------------------------------------------
drop table if exists public.consent_records;

-- ---------------------------------------------------------------------------
-- 7. RLS - ausschliesslich Buero-Rollen lesen und schreiben (Auftrag
--    WMCNL-1446, bewusst kein Selbstauskunftsrecht in dieser Migration)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  neue_tabellen text[] := array[
    'verarbeitungszwecke', 'einwilligungen', 'personenbezogene_zugriffe',
    'datenschutzvorfaelle', 'drittweitergaben'
  ];
begin
  foreach t in array neue_tabellen loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('alter table public.%I force row level security;', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.has_office_access());',
      t || '_select_buero', t
    );
  end loop;
end;
$$;

-- Schreibrechte: admin/betriebsleitung/buchhaltung, analog zu
-- dokumente_insert_buero/dokumente_update_buero. Kein Loeschen von aussen -
-- die Unveraenderlichkeits-/Append-only-Trigger oben sind die zweite
-- Verteidigungslinie, keine RLS-Delete-Policy die erste.
do $$
declare
  t text;
  schreib_tabellen text[] := array[
    'verarbeitungszwecke', 'einwilligungen', 'datenschutzvorfaelle', 'drittweitergaben'
  ];
begin
  foreach t in array schreib_tabellen loop
    execute format(
      'create policy %I on public.%I for insert to authenticated
         with check (public.has_role(''admin'', ''betriebsleitung'', ''buchhaltung''));',
      t || '_insert_buero', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated
         using (public.has_role(''admin'', ''betriebsleitung'', ''buchhaltung''))
         with check (public.has_role(''admin'', ''betriebsleitung'', ''buchhaltung''));',
      t || '_update_buero', t
    );
  end loop;
end;
$$;

-- personenbezogene_zugriffe ist append-only: nur Insert, kein Update/Delete
-- ueber RLS - block_ledger_mutation() oben verhindert es zusaetzlich auf
-- Datenbankebene, unabhaengig von der Rolle.
create policy personenbezogene_zugriffe_insert_buero on public.personenbezogene_zugriffe
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
