-- =============================================================================
-- Damicon - Wirtschaftlichkeit erfassen und auswerten (WMCNL-2470)
-- =============================================================================
-- Die Wirtschaftlichkeitsseite rechnete bisher aus Konstanten der Kennzahlenliste vom 23.09.2026. Das genuegt, um der
-- Geschaeftsfuehrung eine Rechnung zu zeigen, nicht, um sie zu fuehren: eine Investitionsrechnung, die nie gegen die
-- Wirklichkeit gehalten wird, bleibt Papier. Diese Migration legt das Geruest an:
--
--   (a) Erfassung: Investitions-, Betriebs- und Nutzenposten mit Betrag, Waehrung, Datum und Herkunft (belegt oder
--       geschaetzt), dazu die Annahmen der Rechnung (Kalkulationszins, Wechselkurs, Vollkosten vorher, Horizont).
--   (b) Historie: ein Stand haelt Posten, Annahmen und Ergebnis fest. Aeltere Staende bleiben lesbar, mit ihrem eigenen
--       Wechselkurs. Ein gedrucktes Blatt vom Januar zeigt den Januarkurs.
--   (c) Plan-Ist: die tatsaechlich eingetretenen vermiedenen Kosten je Monat und Kategorie, gegen die Annahme gestellt.
--
-- Entscheidungen:
--   * Die Kennzahlen rechnen ab jetzt aus Zeilen. Fehlt eine ganze Art (kein Nutzenposten, kein Investitionsposten), zeigt
--     die Seite "offen" statt einer Null. Die Konstanten der Domain bleiben als Rueckfall fuer den Betrieb ohne Datenbank.
--   * Die Annahmen stehen in genau einer Zeile (id = 1). Sie startet mit den Werten, die bisher im Code standen, mit ihrer
--     bisherigen Herkunft: Zins, Vollkosten und Menge als geschaetzt, Kurs und Nutzenbeginn als belegt. Der Horizont von drei Jahren ist fest. Es werden
--     keine neuen Zahlen erfunden.
--   * Die vermarktete Menge wird nicht neu erfasst, sondern aus den Lieferungen abgeleitet (Sicht v_vermarktete_menge),
--     aber nur, wenn die Daten mindestens ein Jahr zurueckreichen: eine Saison ist keine Jahressumme. Vorher gilt der Wert
--     der Annahmen, sonst "offen".
--   * Staende sind unveraenderlich (append-only), wie die Protokolle. Sie tragen den vollstaendigen Stand der Rechnung als
--     Momentaufnahme; die Seite rechnet sie mit denselben Funktionen nach und zeigt sie mit ihrem Kurs.
--   * Lesen darf das Buero und die Betriebsleitung, schreiben duerfen admin, ceo (ueber admin) und buchhaltung, wie die
--     Matrix es fuer wirtschaftlichkeit vorgibt. Die Betriebsleitung bleibt bei "sehen".
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- Annahmen
-- ---------------------------------------------------------------------------
create table if not exists public.wirtschaftlichkeit_annahmen (
  id                       smallint primary key default 1 check (id = 1),
  kalkulationszins         numeric(5, 4) not null check (kalkulationszins >= 0 and kalkulationszins <= 1),
  kurs_eur_tenge           numeric(12, 4) not null check (kurs_eur_tenge > 0),
  kurs_rub_tenge           numeric(12, 4) not null check (kurs_rub_tenge > 0),
  kurs_stichtag            date not null,
  kurs_quelle              text check (kurs_quelle is null or char_length(btrim(kurs_quelle)) between 1 and 200),
  vollkosten_vorher_tenge  numeric(12, 2) check (vollkosten_vorher_tenge is null or vollkosten_vorher_tenge > 0),
  -- Ueberschreibt die aus den Lieferungen abgeleitete Menge, solange gesetzt.
  vermarktete_menge_kg     numeric(14, 2) check (vermarktete_menge_kg is null or vermarktete_menge_kg > 0),
  nutzenbeginn_wochen_von  smallint check (nutzenbeginn_wochen_von is null or nutzenbeginn_wochen_von between 0 and 104),
  nutzenbeginn_wochen_bis  smallint check (nutzenbeginn_wochen_bis is null or nutzenbeginn_wochen_bis between 0 and 104),
  -- Erster Monat des Echtbetriebs: Raster fuer den Plan-Ist-Vergleich.
  echtbetrieb_beginn       date,
  -- Je Annahme "belegt" oder "geschaetzt"; fehlt ein Schluessel, gilt "geschaetzt".
  herkunft                 jsonb not null default '{}'::jsonb,
  updated_at               timestamptz not null default now(),
  constraint wirtschaftlichkeit_annahmen_nutzenbeginn check (
    nutzenbeginn_wochen_von is null or nutzenbeginn_wochen_bis is null or nutzenbeginn_wochen_von <= nutzenbeginn_wochen_bis
  )
);

comment on table public.wirtschaftlichkeit_annahmen is
  'Annahmen der Investitionsrechnung (WMCNL-2470): genau eine Zeile. Startwerte sind die bisherigen Konstanten der Domain mit ihrer Herkunft.';

insert into public.wirtschaftlichkeit_annahmen
  (id, kalkulationszins, kurs_eur_tenge, kurs_rub_tenge, kurs_stichtag, kurs_quelle, vollkosten_vorher_tenge,
   nutzenbeginn_wochen_von, nutzenbeginn_wochen_bis, herkunft)
values
  (1, 0.1200, 513.4600, 5.3100, date '2026-09-23',
   'Nationalbank der Republik Kasachstan, offizieller Kurs vom 23.09.2026', 1500, 6, 8,
   '{"kalkulationszins":"geschaetzt","kurs":"belegt","vollkosten":"geschaetzt","menge":"geschaetzt","nutzenbeginn":"belegt"}'::jsonb)
on conflict (id) do nothing;

drop trigger if exists trg_wirtschaftlichkeit_annahmen_updated on public.wirtschaftlichkeit_annahmen;
create trigger trg_wirtschaftlichkeit_annahmen_updated
  before update on public.wirtschaftlichkeit_annahmen
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Posten: Investition (einmalig), Betrieb (je Jahr), Nutzen (vermiedene Kosten je Jahr, geplant)
-- ---------------------------------------------------------------------------
create table if not exists public.wirtschaftlichkeit_posten (
  id                      uuid primary key default gen_random_uuid(),
  art                     text not null check (art in ('investition', 'betrieb', 'nutzen')),
  -- Nutzen: schwund, handarbeit, audit oder sonstiges. Investition und Betrieb: frei benannt.
  kategorie               text not null check (char_length(btrim(kategorie)) between 1 and 60),
  bezeichnung             text not null check (char_length(btrim(bezeichnung)) between 1 and 120),
  betrag                  numeric(14, 2) not null check (betrag >= 0),
  waehrung                text not null default 'EUR' check (waehrung in ('EUR', 'KZT', 'RUB')),
  datum                   date not null default public.heute_almaty(),
  herkunft                text not null default 'belegt' check (herkunft in ('belegt', 'geschaetzt')),
  notiz                   text check (notiz is null or char_length(btrim(notiz)) between 1 and 500),
  erfasst_von_profil_id   uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint wirtschaftlichkeit_posten_nutzen_kategorie check (art <> 'nutzen' or kategorie in ('schwund', 'handarbeit', 'audit', 'sonstiges'))
);

comment on table public.wirtschaftlichkeit_posten is
  'Posten der Investitionsrechnung (WMCNL-2470): einmalige Investition, laufende Betriebskosten je Jahr, geplanter Nutzen je Jahr.';
create index if not exists idx_wirtschaftlichkeit_posten_art on public.wirtschaftlichkeit_posten (art, datum);

drop trigger if exists trg_wirtschaftlichkeit_posten_updated on public.wirtschaftlichkeit_posten;
create trigger trg_wirtschaftlichkeit_posten_updated
  before update on public.wirtschaftlichkeit_posten
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Ist: tatsaechlich eingetretene vermiedene Kosten je Monat
-- ---------------------------------------------------------------------------
create table if not exists public.wirtschaftlichkeit_ist (
  id                      uuid primary key default gen_random_uuid(),
  monat                   date not null check (monat = date_trunc('month', monat)::date),
  kategorie               text not null check (kategorie in ('schwund', 'handarbeit', 'audit', 'sonstiges')),
  betrag                  numeric(14, 2) not null check (betrag >= 0),
  waehrung                text not null default 'EUR' check (waehrung in ('EUR', 'KZT', 'RUB')),
  notiz                   text check (notiz is null or char_length(btrim(notiz)) between 1 and 500),
  erfasst_von_profil_id   uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now()
);

comment on table public.wirtschaftlichkeit_ist is
  'Ist-Werte des Nutzens (WMCNL-2470): was an Kosten tatsaechlich vermieden wurde, je Monat und Kategorie, gegen die Annahme gestellt.';
create index if not exists idx_wirtschaftlichkeit_ist_monat on public.wirtschaftlichkeit_ist (monat);

-- ---------------------------------------------------------------------------
-- Staende: unveraenderliche Momentaufnahmen
-- ---------------------------------------------------------------------------
create table if not exists public.wirtschaftlichkeit_staende (
  id                      uuid primary key default gen_random_uuid(),
  bezeichnung             text not null check (char_length(btrim(bezeichnung)) between 1 and 120),
  stand_am                timestamptz not null default now(),
  -- Annahmen, Posten und Ergebnis zum Zeitpunkt des Standes, inklusive Wechselkurs und Stichtag.
  snapshot                jsonb not null,
  erstellt_von_profil_id  uuid references public.profiles(id) on delete set null,
  created_at              timestamptz not null default now()
);

comment on table public.wirtschaftlichkeit_staende is
  'Staende der Investitionsrechnung (WMCNL-2470): Momentaufnahme von Annahmen, Posten und Ergebnis mit eigenem Wechselkurs. Append-only.';
create index if not exists idx_wirtschaftlichkeit_staende_zeit on public.wirtschaftlichkeit_staende (stand_am desc);

drop trigger if exists trg_wirtschaftlichkeit_staende_unveraenderlich on public.wirtschaftlichkeit_staende;
create trigger trg_wirtschaftlichkeit_staende_unveraenderlich
  before update or delete on public.wirtschaftlichkeit_staende
  for each row execute function public.block_ledger_mutation();

-- ---------------------------------------------------------------------------
-- Vermarktete Menge aus den Lieferungen
-- ---------------------------------------------------------------------------
-- Die zugestellten Lieferungen der letzten 365 Tage. "belastbar" erst, wenn die erste Lieferung mindestens 365 Tage
-- zurueckliegt: eine Saison ist keine Jahressumme, und eine Hochrechnung waere eine Annahme, keine Messung. Der Tag ist
-- der Tag in Almaty. security invoker: die Zeilensicherheit von lieferungen gilt durch die Sicht hindurch.
create or replace view public.v_vermarktete_menge
with (security_invoker = true) as
select
  coalesce(sum(l.menge_kg) filter (where (l.geliefert_am at time zone 'Asia/Almaty')::date > public.heute_almaty() - 365), 0)::numeric(14, 2) as menge_kg_12_monate,
  min((l.geliefert_am at time zone 'Asia/Almaty')::date)                                                                                  as erste_lieferung,
  coalesce(public.heute_almaty() - min((l.geliefert_am at time zone 'Asia/Almaty')::date), 0)                                             as tage_abdeckung,
  coalesce(public.heute_almaty() - min((l.geliefert_am at time zone 'Asia/Almaty')::date), 0) >= 365                                       as belastbar
from public.lieferungen l
where l.status = 'zugestellt' and l.geliefert_am is not null;

comment on view public.v_vermarktete_menge is
  'Vermarktete Menge der letzten 365 Tage aus zugestellten Lieferungen; belastbar erst, wenn die Daten ein volles Jahr zurueckreichen (WMCNL-2470).';

-- ---------------------------------------------------------------------------
-- Zeilensicherheit
-- ---------------------------------------------------------------------------
alter table public.wirtschaftlichkeit_annahmen enable row level security;
alter table public.wirtschaftlichkeit_annahmen force row level security;
alter table public.wirtschaftlichkeit_posten enable row level security;
alter table public.wirtschaftlichkeit_posten force row level security;
alter table public.wirtschaftlichkeit_ist enable row level security;
alter table public.wirtschaftlichkeit_ist force row level security;
alter table public.wirtschaftlichkeit_staende enable row level security;
alter table public.wirtschaftlichkeit_staende force row level security;

create policy wirtschaftlichkeit_annahmen_select on public.wirtschaftlichkeit_annahmen
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
create policy wirtschaftlichkeit_annahmen_update on public.wirtschaftlichkeit_annahmen
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung')) with check (public.has_role('admin', 'buchhaltung'));

create policy wirtschaftlichkeit_posten_select on public.wirtschaftlichkeit_posten
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
create policy wirtschaftlichkeit_posten_insert on public.wirtschaftlichkeit_posten
  for insert to authenticated with check (public.has_role('admin', 'buchhaltung'));
create policy wirtschaftlichkeit_posten_update on public.wirtschaftlichkeit_posten
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung')) with check (public.has_role('admin', 'buchhaltung'));
create policy wirtschaftlichkeit_posten_delete on public.wirtschaftlichkeit_posten
  for delete to authenticated using (public.has_role('admin', 'buchhaltung'));

create policy wirtschaftlichkeit_ist_select on public.wirtschaftlichkeit_ist
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
create policy wirtschaftlichkeit_ist_insert on public.wirtschaftlichkeit_ist
  for insert to authenticated with check (public.has_role('admin', 'buchhaltung'));
create policy wirtschaftlichkeit_ist_update on public.wirtschaftlichkeit_ist
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung')) with check (public.has_role('admin', 'buchhaltung'));
create policy wirtschaftlichkeit_ist_delete on public.wirtschaftlichkeit_ist
  for delete to authenticated using (public.has_role('admin', 'buchhaltung'));

create policy wirtschaftlichkeit_staende_select on public.wirtschaftlichkeit_staende
  for select to authenticated using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));
create policy wirtschaftlichkeit_staende_insert on public.wirtschaftlichkeit_staende
  for insert to authenticated with check (public.has_role('admin', 'buchhaltung'));

revoke all on public.wirtschaftlichkeit_annahmen from public, anon, authenticated;
revoke all on public.wirtschaftlichkeit_posten from public, anon, authenticated;
revoke all on public.wirtschaftlichkeit_ist from public, anon, authenticated;
revoke all on public.wirtschaftlichkeit_staende from public, anon, authenticated;
revoke all on public.v_vermarktete_menge from public, anon;
grant select, update on public.wirtschaftlichkeit_annahmen to authenticated;
grant select, insert, update, delete on public.wirtschaftlichkeit_posten to authenticated;
grant select, insert, update, delete on public.wirtschaftlichkeit_ist to authenticated;
grant select, insert on public.wirtschaftlichkeit_staende to authenticated;
grant select on public.v_vermarktete_menge to authenticated;
