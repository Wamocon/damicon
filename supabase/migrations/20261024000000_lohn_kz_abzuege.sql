-- =============================================================================
-- Damicon - Gesetzliche Lohnabzuege Kasachstan (ОПВ/ВОСМС/ИПН, Arbeitgeberlast)
-- =============================================================================
-- Hintergrund: lohn_periode_berechnen() (Migration 20260908130000) rechnet
-- Grundlohn + Mengenkomponente je Abrechnungsperiode - das ist der Bruttolohn.
-- Bislang endet die Kette dort. Kein Feld in diesem Projekt zieht ОПВ
-- (Pflicht-Rentenbeitrag), ВОСМС (Pflicht-Krankenversicherung) oder ИПН
-- (Einkommensteuer) ab, und nichts weist die zusaetzliche Arbeitgeberlast
-- (ОПВР/СО/СН/ОСМС) aus. Eine Bruttolohn-Abrechnung ohne diese Abzuege ist
-- fuer die Lohnbuchhaltung nicht durch, nur begonnen.
--
-- Neues Steuerrecht ab 1. Januar 2026 (Steuerkodex RK 2026) - Saetze unten
-- sind die zu diesem Zeitpunkt oeffentlich bestaetigten Werte, keine Annahme:
-- ОПВ 10 %, ВОСМС 2 %, ИПН 10 % auf die Bemessungsgrundlage nach Abzug von
-- ОПВ, ВОСМС und dem Standardabzug 30 МРП (129 750 Tenge bei einem МРП von
-- 4 325 Tenge in 2026); Arbeitgeberseite ОПВР 3,5 %, СО 5 %, СН 6 %, ОСМС 3 %.
-- Bemessungsgrenzen: ОПВ bis 4 250 000 Tenge Bruttolohn, ВОСМС bis
-- 1 700 000 Tenge.
--
-- WARUM EIN MONATSAGGREGAT, NICHT JE lohn_abrechnungen-ZEILE (WICHTIGE
-- ENTSCHEIDUNG): ОПВ/ВОСМС-Bemessungsgrenze, der Standardabzug 30 МРП und die
-- ИПН-Bemessungsgrundlage sind im kasachischen Recht Monatsgroessen - sie
-- gelten GENAU EINMAL pro Kalendermonat und Person, unabhaengig davon, wie
-- viele Abrechnungsperioden in diesem Monat liegen. lohn_abrechnungen.
-- periode_start/-ende sind in Damicon aber freie, beliebig kurze Zeitraeume
-- (siehe Seed: zwei Tage) - wuerde der Abzug je Zeile gerechnet, bekaeme eine
-- Person mit drei Perioden im selben Monat den Standardabzug und die volle
-- Bemessungsgrenze dreimal statt einmal, ein handfester Rechtsfehler. Diese
-- Migration fuehrt deshalb eine EIGENE, monatliche Aggregatstabelle
-- (lohn_monatsabzuege) ein statt lohn_abrechnungen um weitere Spalten zu
-- erweitern - Bruttogrundlage ist die Summe aller lohn_abrechnungen.
-- gesamt_tenge einer Person in diesem Kalendermonat, unabhaengig davon, wie
-- viele Zeilen das sind. Deckt eine bestehende lohn_abrechnungen-Periode zwei
-- Kalendermonate ab (in diesem Projekt bislang nicht vorgesehen), zaehlt sie
-- vollstaendig im Monat ihres periode_start - eine dokumentierte
-- Vereinfachung, kein uebersehener Fall.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION (offene Folgearbeit, keine unentdeckten
-- Luecken):
--   * Der Standardabzug 30 МРП gilt laut Gesetz nur auf schriftlichen Antrag
--     der Person und nur an einer Arbeitsstelle. Diese Berechnung wendet ihn
--     grundsaetzlich an (Normalfall bei genau einem Arbeitgeber, wie hier) -
--     ein Feld fuer den Widerruf im Einzelfall gibt es noch nicht.
--   * Sonderfreibetraege (Invaliditaet, Kriegsveteranen: 882/5000 МРП pro
--     Jahr) sind nicht abgebildet - dafuer fehlt ein vertrauenswuerdiges Feld
--     am Pfluecker-Stammsatz, das diesen Status haelt.
--   * СН (Sozialsteuer) wird hier als einfacher Prozentsatz auf den
--     Bruttolohn gerechnet. Fruehere Fassungen des Steuerrechts kuerzten СН
--     um die bereits gezahlte СО - ob das im Steuerkodex 2026 unveraendert
--     fortbesteht, liess sich mit den verfuegbaren Quellen fuer diese
--     Migration nicht abschliessend klaeren. Bis zur Bestaetigung durch eine
--     Fachkraft ist der hier ausgewiesene СН-Betrag als Naeherung zu
--     behandeln, kein abgabefertiger Wert.
--   * Auslaendische Arbeitskraft, Befreiungen fuer Rentner/Menschen mit
--     Behinderung bei ОПВ/ВОСМС: nicht abgebildet.
--   * Die tatsaechliche Meldung/Abfuehrung an ЕНПФ/Finanzamt bleibt
--     ausserhalb dieses Systems - hier wird nur richtig GERECHNET, nicht
--     eingereicht.
-- Ein erfundener Sonderfall waere schlimmer als eine offen dokumentierte
-- Grenze - dieselbe Haltung wie im Kopf von 20260908130000 (dortige "bewusst
-- NICHT uebernommen"-Liste).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Gesetzliche Saetze - historisiert wie lohn_saetze, aber eigene Tabelle:
--    ein betrieblicher Lohnsatz (Tenge/Stunde) und ein gesetzlicher Steuersatz
--    (Prozent, per Gesetz) aendern sich aus unabhaengigen Gruenden und zu
--    unabhaengigen Zeitpunkten - eine gemeinsame Tabelle wuerde beides
--    vermischen.
-- ---------------------------------------------------------------------------
create table public.lohn_steuersaetze_kz (
  id                            uuid primary key default gen_random_uuid(),
  gueltig_ab                    date not null default current_date,
  gueltig_bis                   date,
  opv_prozent                   numeric(5,2) not null check (opv_prozent >= 0),
  opv_bemessungsgrenze_tenge    numeric(14,2) not null check (opv_bemessungsgrenze_tenge > 0),
  vosms_prozent                 numeric(5,2) not null check (vosms_prozent >= 0),
  vosms_bemessungsgrenze_tenge  numeric(14,2) not null check (vosms_bemessungsgrenze_tenge > 0),
  ipn_prozent                   numeric(5,2) not null check (ipn_prozent >= 0),
  -- Absoluter Tenge-Betrag des Standardabzugs (30 МРП), nicht МРП selbst -
  -- gleiches Prinzip wie lohn_saetze: die Tabelle haelt den bereits
  -- aufgeloesten Geldwert der geltenden Periode, keine Formel mit einer
  -- zweiten, hier nicht gepflegten Bezugsgroesse.
  ipn_freibetrag_tenge          numeric(12,2) not null check (ipn_freibetrag_tenge >= 0),
  opvr_prozent                  numeric(5,2) not null check (opvr_prozent >= 0),
  so_prozent                    numeric(5,2) not null check (so_prozent >= 0),
  sn_prozent                    numeric(5,2) not null check (sn_prozent >= 0),
  osms_prozent                  numeric(5,2) not null check (osms_prozent >= 0),
  quelle                        text not null,
  notiz                         text,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  constraint lohn_steuersaetze_kz_zeitraum check (gueltig_bis is null or gueltig_bis > gueltig_ab)
);
comment on table public.lohn_steuersaetze_kz is
  'Gesetzliche Lohnabzugssaetze Kasachstan (ОПВ/ВОСМС/ИПН/ОПВР/СО/СН/ОСМС), historisiert wie lohn_saetze. Getrennt von lohn_saetze, weil ein betrieblicher Lohnsatz und ein gesetzlicher Steuersatz aus unabhaengigen Gruenden wechseln.';
comment on column public.lohn_steuersaetze_kz.quelle is
  'Pflichtangabe: woher dieser Satz stammt (z. B. Steuerkodex RK, Artikel/Datum). Ein gesetzlicher Prozentsatz ohne nachvollziehbare Quelle ist im Streitfall wertlos.';

create unique index idx_lohn_steuersaetze_kz_gueltig_ab on public.lohn_steuersaetze_kz(gueltig_ab);
create index idx_lohn_steuersaetze_kz_lookup on public.lohn_steuersaetze_kz(gueltig_ab desc);

create trigger trg_lohn_steuersaetze_kz_updated before update on public.lohn_steuersaetze_kz
  for each row execute function public.set_updated_at();

-- Wie trg_lohn_satz_vorherigen_schliessen (20260908130000): ein neuer Satz
-- schliesst automatisch den vorherigen, damit sich zwei gesetzliche Saetze
-- nie ueberlappen.
create or replace function public.lohn_steuersatz_kz_vorherigen_schliessen()
returns trigger
language plpgsql
as $$
begin
  update public.lohn_steuersaetze_kz
     set gueltig_bis = new.gueltig_ab
   where gueltig_bis is null
     and gueltig_ab < new.gueltig_ab
     and id <> new.id;
  return new;
end;
$$;
create trigger trg_lohn_steuersatz_kz_vorherigen_schliessen
  after insert on public.lohn_steuersaetze_kz
  for each row execute function public.lohn_steuersatz_kz_vorherigen_schliessen();

-- Startsatz zum Inkrafttreten des neuen Steuerkodex. Ein einzelner Insert,
-- keine Migrationslogik, die "irgendeinen" Satz erfindet - ohne diese Zeile
-- liefe lohn_monat_abzuege_berechnen() unten fuer 2026 sofort auf
-- 'no_data_found', exakt wie lohn_periode_berechnen() ohne lohn_saetze-Zeile.
insert into public.lohn_steuersaetze_kz (
  gueltig_ab, opv_prozent, opv_bemessungsgrenze_tenge,
  vosms_prozent, vosms_bemessungsgrenze_tenge,
  ipn_prozent, ipn_freibetrag_tenge,
  opvr_prozent, so_prozent, sn_prozent, osms_prozent,
  quelle, notiz
) values (
  '2026-01-01', 10.00, 4250000.00,
  2.00, 1700000.00,
  10.00, 129750.00,
  3.50, 5.00, 6.00, 3.00,
  'Steuerkodex RK 2026 (in Kraft seit 01.01.2026); ИПН-Standardabzug 30 МРП, МРП 2026 = 4 325 Tenge.',
  'Erster Satz nach dem neuen Steuerkodex - vor 2026 gab es in Damicon keine Lohnabzugsrechnung, daher kein Vorgaengersatz zu historisieren.'
);

-- ---------------------------------------------------------------------------
-- 2. Reine Rechenfunktion: Bruttomonatslohn -> alle Abzuege/Arbeitgeberlast
-- ---------------------------------------------------------------------------
-- IMMUTABLE und ohne Tabellenzugriff wie lohn_qualitaetsfaktor() - dieselbe
-- Begruendung: eine reine Funktion aus expliziten Parametern ist ohne
-- Datenbestand testbar (siehe supabase/tests/pglite-fast.mjs), und die
-- Rechenregel steht an einer Stelle statt verdoppelt zwischen Funktion und
-- Aufrufer.
--
-- Reihenfolge der Bemessung (gesetzlich vorgeschrieben, nicht frei waehlbar):
--   1. ОПВ und ВОСМС vom Bruttolohn, jeweils gekappt an der eigenen
--      Bemessungsgrenze.
--   2. ИПН-Bemessungsgrundlage = Brutto - ОПВ - ВОСМС - Standardabzug, nie
--      negativ (sonst waere ИПН negativ, ein Widerspruch in sich - siehe
--      greatest(0, ...) unten).
--   3. Arbeitgeberlast (ОПВР/СО/СН/ОСМС) wird VOM BRUTTOLOHN berechnet, nicht
--      von der ИПН-Bemessungsgrundlage - sie mindert den Nettolohn der
--      Person nicht, sondern kommt als zusaetzliche Kosten beim Arbeitgeber
--      hinzu (arbeitgeberkosten_gesamt_tenge = Brutto + alle vier Lasten).
create or replace function public.lohn_kz_abzuege_berechnen(
  p_brutto_monat_tenge numeric,
  p_satz               public.lohn_steuersaetze_kz
)
returns table (
  opv_tenge                      numeric,
  vosms_tenge                    numeric,
  ipn_bemessungsgrundlage_tenge  numeric,
  ipn_tenge                      numeric,
  netto_tenge                    numeric,
  opvr_tenge                     numeric,
  so_tenge                       numeric,
  sn_tenge                       numeric,
  osms_tenge                     numeric,
  arbeitgeberkosten_gesamt_tenge numeric
)
language sql
immutable
as $$
  with abzuege as (
    select
      round(least(p_brutto_monat_tenge, p_satz.opv_bemessungsgrenze_tenge)
            * p_satz.opv_prozent / 100.0, 2) as v_opv,
      round(least(p_brutto_monat_tenge, p_satz.vosms_bemessungsgrenze_tenge)
            * p_satz.vosms_prozent / 100.0, 2) as v_vosms
  ),
  grundlage as (
    select
      v_opv, v_vosms,
      greatest(0, round(p_brutto_monat_tenge - v_opv - v_vosms - p_satz.ipn_freibetrag_tenge, 2)) as v_grundlage
    from abzuege
  ),
  ipn as (
    select
      v_opv, v_vosms, v_grundlage,
      round(v_grundlage * p_satz.ipn_prozent / 100.0, 2) as v_ipn
    from grundlage
  )
  select
    v_opv,
    v_vosms,
    v_grundlage,
    v_ipn,
    round(p_brutto_monat_tenge - v_opv - v_vosms - v_ipn, 2),
    round(p_brutto_monat_tenge * p_satz.opvr_prozent / 100.0, 2),
    round(p_brutto_monat_tenge * p_satz.so_prozent / 100.0, 2),
    round(p_brutto_monat_tenge * p_satz.sn_prozent / 100.0, 2),
    round(p_brutto_monat_tenge * p_satz.osms_prozent / 100.0, 2),
    round(
      p_brutto_monat_tenge
      + p_brutto_monat_tenge * p_satz.opvr_prozent / 100.0
      + p_brutto_monat_tenge * p_satz.so_prozent / 100.0
      + p_brutto_monat_tenge * p_satz.sn_prozent / 100.0
      + p_brutto_monat_tenge * p_satz.osms_prozent / 100.0,
      2
    )
  from ipn
$$;
comment on function public.lohn_kz_abzuege_berechnen is
  'Reine Funktion: Bruttomonatslohn + gesetzlicher Satz -> ОПВ/ВОСМС/ИПН, Nettolohn und Arbeitgeberlast (ОПВР/СО/СН/ОСМС). Kein Tabellenzugriff, deshalb ohne Datenbestand testbar.';

-- ---------------------------------------------------------------------------
-- 3. Monatsaggregat je Pfluecker - siehe Migrationskopf, warum ein
--    eigenstaendiges Monatsaggregat statt weiterer Spalten an
--    lohn_abrechnungen.
-- ---------------------------------------------------------------------------
create table public.lohn_monatsabzuege (
  id                              uuid primary key default gen_random_uuid(),
  pfluecker_id                    uuid not null references public.pfluecker(id) on delete cascade,
  jahr                            integer not null check (jahr between 2026 and 2100),
  monat                           integer not null check (monat between 1 and 12),
  brutto_gesamt_tenge             numeric(14,2) not null check (brutto_gesamt_tenge >= 0),
  opv_tenge                       numeric(14,2) not null check (opv_tenge >= 0),
  vosms_tenge                     numeric(14,2) not null check (vosms_tenge >= 0),
  ipn_bemessungsgrundlage_tenge   numeric(14,2) not null check (ipn_bemessungsgrundlage_tenge >= 0),
  ipn_tenge                       numeric(14,2) not null check (ipn_tenge >= 0),
  netto_tenge                     numeric(14,2) not null check (netto_tenge >= 0),
  opvr_tenge                      numeric(14,2) not null check (opvr_tenge >= 0),
  so_tenge                        numeric(14,2) not null check (so_tenge >= 0),
  sn_tenge                        numeric(14,2) not null check (sn_tenge >= 0),
  osms_tenge                      numeric(14,2) not null check (osms_tenge >= 0),
  arbeitgeberkosten_gesamt_tenge  numeric(14,2) not null check (arbeitgeberkosten_gesamt_tenge >= 0),
  steuersatz_id                   uuid not null references public.lohn_steuersaetze_kz(id),
  berechnet_am                    timestamptz not null default now(),
  unique (pfluecker_id, jahr, monat)
);
comment on table public.lohn_monatsabzuege is
  'Gesetzliche Lohnabzuege je Pfluecker und Kalendermonat, aggregiert aus lohn_abrechnungen.gesamt_tenge dieses Monats - siehe Migrationskopf fuer die Begruendung des Monatsbezugs. Deterministisch aus lohn_kz_abzuege_berechnen() neu erzeugbar, deshalb kein Freigabestatus wie lohn_abrechnungen.';
comment on column public.lohn_monatsabzuege.steuersatz_id is
  'Welcher gesetzliche Satz fuer diesen Monat angewendet wurde - macht die Abrechnung nachvollziehbar, auch wenn sich der Satz spaeter aendert.';

create index idx_lohn_monatsabzuege_pfluecker on public.lohn_monatsabzuege(pfluecker_id, jahr, monat);

-- ---------------------------------------------------------------------------
-- 4. RPC: Monatsabzuege berechnen
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER mit explizitem has_role()-Einstieg - gleiches Muster wie
-- lohn_periode_berechnen(): die Funktion schreibt fuer viele Personen in
-- einem Lauf, das bildet sich nicht als einfache RLS-Zeilenbedingung ab.
create or replace function public.lohn_monat_abzuege_berechnen(
  p_jahr  integer,
  p_monat integer
)
returns table (verarbeitet integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_satz          public.lohn_steuersaetze_kz;
  v_monatsanfang  date;
  v_monatsende    date;
  v_pfluecker     record;
  v_brutto        numeric;
  v_abzuege       record;
  v_verarbeitet   integer := 0;
begin
  if not public.has_role('admin', 'buchhaltung') then
    raise exception 'Nur Buchhaltung oder Admin berechnen Monatsabzuege.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_jahr is null or p_monat is null or p_monat not between 1 and 12 then
    raise exception 'jahr und ein gueltiger monat (1-12) sind Pflichtfelder.'
      using errcode = 'not_null_violation';
  end if;

  v_monatsanfang := make_date(p_jahr, p_monat, 1);
  v_monatsende := (v_monatsanfang + interval '1 month' - interval '1 day')::date;

  -- Der gesetzliche Satz, der zu Beginn dieses Monats gilt - dieselbe
  -- Nachschlagelogik wie lohn_periode_berechnen() fuer lohn_saetze.
  select * into v_satz
    from public.lohn_steuersaetze_kz
   where gueltig_ab <= v_monatsanfang
     and (gueltig_bis is null or gueltig_bis > v_monatsanfang)
   order by gueltig_ab desc
   limit 1;

  if not found then
    raise exception 'Fuer % gibt es keinen gesetzlichen Lohnabzugssatz.', to_char(v_monatsanfang, 'YYYY-MM')
      using errcode = 'no_data_found';
  end if;

  -- Jeder Pfluecker mit mindestens einer lohn_abrechnungen-Zeile, deren
  -- periode_start in diesen Kalendermonat faellt - siehe Migrationskopf,
  -- warum periode_start (nicht periode_ende) der massgebliche Monatsbezug
  -- ist.
  for v_pfluecker in
    select distinct la.pfluecker_id as id
      from public.lohn_abrechnungen la
     where la.periode_start between v_monatsanfang and v_monatsende
  loop
    select coalesce(sum(gesamt_tenge), 0) into v_brutto
      from public.lohn_abrechnungen
     where pfluecker_id = v_pfluecker.id
       and periode_start between v_monatsanfang and v_monatsende;

    select * into v_abzuege from public.lohn_kz_abzuege_berechnen(v_brutto, v_satz);

    -- Deterministisch neu erzeugbar (siehe Tabellenkommentar) - Delete+Insert
    -- statt Upsert, gleiches Muster wie lohn_positionen in
    -- lohn_periode_berechnen().
    delete from public.lohn_monatsabzuege
     where pfluecker_id = v_pfluecker.id and jahr = p_jahr and monat = p_monat;

    insert into public.lohn_monatsabzuege (
      pfluecker_id, jahr, monat, brutto_gesamt_tenge,
      opv_tenge, vosms_tenge, ipn_bemessungsgrundlage_tenge, ipn_tenge, netto_tenge,
      opvr_tenge, so_tenge, sn_tenge, osms_tenge, arbeitgeberkosten_gesamt_tenge,
      steuersatz_id
    ) values (
      v_pfluecker.id, p_jahr, p_monat, v_brutto,
      v_abzuege.opv_tenge, v_abzuege.vosms_tenge, v_abzuege.ipn_bemessungsgrundlage_tenge,
      v_abzuege.ipn_tenge, v_abzuege.netto_tenge,
      v_abzuege.opvr_tenge, v_abzuege.so_tenge, v_abzuege.sn_tenge, v_abzuege.osms_tenge,
      v_abzuege.arbeitgeberkosten_gesamt_tenge,
      v_satz.id
    );

    v_verarbeitet := v_verarbeitet + 1;
  end loop;

  return query select v_verarbeitet;
end;
$$;
comment on function public.lohn_monat_abzuege_berechnen is
  'Aggregiert lohn_abrechnungen.gesamt_tenge je Pfluecker fuer einen Kalendermonat und schreibt die gesetzlichen Abzuege (lohn_kz_abzuege_berechnen) nach lohn_monatsabzuege. Deterministisch, immer sicher erneut ausfuehrbar.';

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------
alter table public.lohn_steuersaetze_kz enable row level security;
alter table public.lohn_steuersaetze_kz force row level security;

-- Wie lohn_saetze_select_office: wer nach diesen Regeln bezahlt wird, darf
-- sie sehen.
create policy lohn_steuersaetze_kz_select_office on public.lohn_steuersaetze_kz
  for select to authenticated
  using (public.has_office_access());

create policy lohn_steuersaetze_kz_insert_buchhaltung on public.lohn_steuersaetze_kz
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_steuersaetze_kz_update_buchhaltung on public.lohn_steuersaetze_kz
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

alter table public.lohn_monatsabzuege enable row level security;
alter table public.lohn_monatsabzuege force row level security;

-- Buero sieht alle, ein picker zusaetzlich die eigene Zeile - dasselbe
-- Muster wie lohn_abrechnungen_select_office/-_select_own
-- (20260908130000/20260909010000): zwei permissive Policies, von Postgres
-- mit OR verknuepft.
create policy lohn_monatsabzuege_select_office on public.lohn_monatsabzuege
  for select to authenticated
  using (public.has_office_access());

create policy lohn_monatsabzuege_select_own on public.lohn_monatsabzuege
  for select to authenticated
  using (
    pfluecker_id = (
      select p.pfluecker_id from public.profiles p where p.auth_user_id = auth.uid()
    )
  );

create policy lohn_monatsabzuege_insert_buchhaltung on public.lohn_monatsabzuege
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy lohn_monatsabzuege_delete_buchhaltung on public.lohn_monatsabzuege
  for delete to authenticated
  using (public.has_role('admin', 'buchhaltung'));

grant execute on function public.lohn_kz_abzuege_berechnen(numeric, public.lohn_steuersaetze_kz) to authenticated;
grant execute on function public.lohn_monat_abzuege_berechnen(integer, integer) to authenticated;
