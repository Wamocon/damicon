-- =============================================================================
-- Damicon - Risiko-, Steuer- und Pruefungsoekosystem (Teil 1: MwSt + ESUTD)
-- =============================================================================
-- Zwei gesetzliche Fristen, die beide dieselbe Form haben ("N Werktage nach
-- einem Ereignis"), aber aus unabhaengigen Rechtsgrundlagen stammen und
-- deshalb NICHT in einer gemeinsamen generischen "Frist"-Tabelle
-- zusammengefasst werden - das waere eine Abstraktion, die keiner der beiden
-- Fachdomaenen wirklich gehoert:
--
--   1. ESUTD (Steuerkodex/Arbeitsrecht RK): ein Arbeitsvertrag muss innerhalb
--      von 5 Werktagen nach Vertragsbeginn im ESUTD-System erfasst werden.
--      public.esutd_vertraege existiert bereits seit der Initialmigration,
--      verlinkt ueber outbox_id an public.integration_outbox fuer eine
--      spaetere echte Anbindung an enbek.kz - bislang aber ungenutzt: kein
--      Code liest oder schreibt diese Tabelle, nur der statische Status an
--      pfluecker.esutd wird angezeigt. Es fehlte das Datum, ab dem die Frist
--      ueberhaupt zu rechnen ist.
--
--   2. MwSt-Registrierung (Steuerkodex RK 2026, Art. 82/Registrierungspflicht):
--      wer den rollierenden 12-Monats-Umsatz von 10.000 MRP (43.250.000 Tenge
--      bei МРП 4.325 fuer 2026) ueberschreitet, muss sich innerhalb von
--      5 Werktagen zur Mehrwertsteuer registrieren. Komplett neu - Damicon
--      hatte bislang ueberhaupt keine MwSt-Modellierung, obwohl der Satz zum
--      01.01.2026 von 12 auf 16 Prozent gestiegen ist.
--
-- Gemeinsame Basis ist ALLEIN die Werktagsrechnung (Abschnitt 1) - eine reine
-- Funktion, von beiden Domaenen aufgerufen, sonst bleibt jede Domaene bei
-- ihren eigenen Tabellen und Regeln.
--
-- BEWUSST NICHT TEIL DIESER MIGRATION:
--   * Ein kasachischer Feiertagskalender. werktage_addieren() ueberspringt
--     Samstag/Sonntag, nicht die gesetzlichen Feiertage RK - ein erfundener
--     Kalender waere falscher als die offene Luecke. Die berechnete Frist
--     kann deshalb im Einzelfall einen Tag zu frueh liegen, niemals zu spaet.
--   * Ermaessigte MwSt-Saetze fuer Medizinprodukte (5 %/10 %) - Damicon
--     verkauft Himbeeren, kein Sortiment, fuer das dieser Satz je greift.
--   * Die tatsaechliche Uebermittlung an ESUTD/enbek.kz oder das Einreichen
--     der MwSt-Registrierung beim Finanzamt - hier wird nur RICHTIG GERECHNET
--     und die Frist sichtbar gemacht, nicht eingereicht (dieselbe Grenze wie
--     bei den Lohnabzuegen, Migration 20261024000000).
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Werktage addieren - gemeinsame Basis fuer beide Fristen
-- ---------------------------------------------------------------------------
-- IMMUTABLE, kein Tabellenzugriff: eine reine Kalenderfunktion, isoliert
-- testbar wie lohn_qualitaetsfaktor()/lohn_kz_abzuege_berechnen(). Zaehlt
-- Montag-Freitag, ueberspringt Samstag/Sonntag - siehe Migrationskopf zur
-- fehlenden Feiertagsschaerfe.
create or replace function public.werktage_addieren(
  p_start   date,
  p_anzahl  integer
)
returns date
language plpgsql
immutable
as $$
declare
  v_datum   date := p_start;
  v_gezaehlt integer := 0;
begin
  if p_anzahl < 0 then
    raise exception 'werktage_addieren erwartet eine nicht-negative Anzahl.'
      using errcode = 'invalid_parameter_value';
  end if;
  while v_gezaehlt < p_anzahl loop
    v_datum := v_datum + 1;
    -- ISO-Wochentag: 6 = Samstag, 7 = Sonntag.
    if extract(isodow from v_datum) < 6 then
      v_gezaehlt := v_gezaehlt + 1;
    end if;
  end loop;
  return v_datum;
end;
$$;
comment on function public.werktage_addieren is
  'Addiert N Werktage (Mo-Fr) zu einem Datum, ohne kasachischen Feiertagskalender - siehe Migrationskopf 20261025000000. Gemeinsame Basis fuer die ESUTD- und die MwSt-Registrierungsfrist.';

-- ---------------------------------------------------------------------------
-- 2. ESUTD: die fehlende Spalte nachtragen und nutzbar machen
-- ---------------------------------------------------------------------------
alter table public.esutd_vertraege
  add column if not exists vertrag_beginn_am date;

comment on column public.esutd_vertraege.vertrag_beginn_am is
  'Datum, ab dem der Arbeitsvertrag gilt - Ankerpunkt der gesetzlichen 5-Werktage-Meldefrist. Ohne dieses Feld liess sich die Frist gar nicht erst rechnen (siehe Migrationskopf).';
comment on column public.esutd_vertraege.erfasst_am is
  'Datum der tatsaechlichen ESUTD-Meldung. Getrennt von vertrag_beginn_am: das eine ist der Fristbeginn, das andere der Erledigungszeitpunkt.';

-- Erfassen: nur mit Vertragsbeginn sinnvoll - ohne ihn liesse sich die Frist
-- nicht anzeigen, und eine Zeile ohne erkennbaren Zweck waere schlimmer als
-- keine Zeile.
alter table public.esutd_vertraege
  add constraint esutd_vertraege_beginn_bei_offen check (
    status <> 'offen' or vertrag_beginn_am is not null
  );

-- Schreibrechte: bislang nur service_role (Prototyp-Grundstand). rbac.ts
-- gibt admin/betriebsleitung crud("personal") - dieselbe Rollenmenge, die
-- auch pfluecker/brigaden pflegt.
create policy esutd_vertraege_insert_leitung on public.esutd_vertraege
  for insert to authenticated
  with check (public.has_role('admin', 'betriebsleitung'));

create policy esutd_vertraege_update_leitung on public.esutd_vertraege
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung'))
  with check (public.has_role('admin', 'betriebsleitung'));

-- Lesesicht mit der berechneten Meldefrist - gleiches Muster wie
-- schulungsteilnahmen_status (Migration 20260924000000): die Faelligkeit wird
-- in SQL berechnet (einzige Stelle der Regel, siehe Migrationskopf), die
-- Ansicht liest nur. security_invoker = true: RLS von esutd_vertraege gilt
-- durch die View hindurch unveraendert - ohne diese Klausel liefe die
-- Sichtbarkeitspruefung mit den Rechten der View-Eigentuemerin (postgres),
-- nicht der abfragenden Person, ein sonst leicht uebersehener RLS-Umgehungsweg.
create view public.esutd_vertraege_mit_frist
with (security_invoker = true)
as
select
  e.*,
  case when e.status = 'offen' and e.vertrag_beginn_am is not null
    then public.werktage_addieren(e.vertrag_beginn_am, 5)
    else null
  end as meldefrist_am
from public.esutd_vertraege e;

comment on view public.esutd_vertraege_mit_frist is
  'esutd_vertraege plus die berechnete 5-Werktage-Meldefrist (nur bei offenem Status). Keine eigene Schreiblogik, reine Lesesicht fuer die Personal-Ansicht.';

grant select on public.esutd_vertraege_mit_frist to authenticated;

-- ---------------------------------------------------------------------------
-- 3. MwSt-Saetze - historisiert wie lohn_steuersaetze_kz, dieselbe Begruendung:
--    ein gesetzlicher Satz aendert sich unabhaengig von jeder betrieblichen
--    Entscheidung.
-- ---------------------------------------------------------------------------
create table public.mwst_saetze (
  id                uuid primary key default gen_random_uuid(),
  gueltig_ab        date not null default current_date,
  gueltig_bis       date,
  standard_prozent  numeric(5,2) not null check (standard_prozent >= 0),
  -- Registrierungsschwelle als bereits aufgeloester Tenge-Betrag, nicht als
  -- MRP-Zahl mit separat zu pflegendem MRP-Wert - gleiches Prinzip wie
  -- lohn_steuersaetze_kz.ipn_freibetrag_tenge (siehe dortiger Kommentar).
  schwelle_tenge    numeric(14,2) not null check (schwelle_tenge > 0),
  quelle            text not null,
  notiz             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint mwst_saetze_zeitraum check (gueltig_bis is null or gueltig_bis > gueltig_ab)
);
comment on table public.mwst_saetze is
  'Gesetzlicher Mehrwertsteuersatz und Registrierungsschwelle, historisiert. Nur der Standardsatz - ermaessigte Medizinsaetze sind fuer ein Himbeeren verkaufendes Unternehmen nicht einschlaegig, siehe Migrationskopf.';

create unique index idx_mwst_saetze_gueltig_ab on public.mwst_saetze(gueltig_ab);
create index idx_mwst_saetze_lookup on public.mwst_saetze(gueltig_ab desc);

create trigger trg_mwst_saetze_updated before update on public.mwst_saetze
  for each row execute function public.set_updated_at();

create or replace function public.mwst_satz_vorherigen_schliessen()
returns trigger
language plpgsql
as $$
begin
  update public.mwst_saetze
     set gueltig_bis = new.gueltig_ab
   where gueltig_bis is null
     and gueltig_ab < new.gueltig_ab
     and id <> new.id;
  return new;
end;
$$;
create trigger trg_mwst_satz_vorherigen_schliessen
  after insert on public.mwst_saetze
  for each row execute function public.mwst_satz_vorherigen_schliessen();

insert into public.mwst_saetze (gueltig_ab, standard_prozent, schwelle_tenge, quelle, notiz)
values (
  '2026-01-01', 16.00, 43250000.00,
  'Steuerkodex RK 2026 (in Kraft seit 01.01.2026), Registrierungsschwelle 10.000 MRP, МРП 2026 = 4.325 Tenge.',
  'Erster Satz - vor 2026 gab es in Damicon keine MwSt-Modellierung, daher kein Vorgaengersatz.'
);

-- ---------------------------------------------------------------------------
-- 4. Registrierungsstatus des eigenen Betriebs
-- ---------------------------------------------------------------------------
alter table public.betriebe
  add column if not exists mwst_registriert boolean not null default false,
  add column if not exists mwst_registriert_am date,
  -- Einmal gesetzt, nie zurueckgesetzt: das Ueberschreiten der Schwelle ist
  -- ein einmaliges gesetzliches Ereignis, kein Zustand, der mit sinkendem
  -- Umsatz wieder verschwindet - siehe mwst_schwelle_pruefen() unten.
  add column if not exists mwst_schwelle_ueberschritten_am date,
  -- Letzter bekannter Stand, damit die Ansicht eine Zahl zeigen kann, ohne
  -- bei jedem Seitenaufruf den Umsatz neu zu summieren - dieselbe
  -- Zurueckhaltung wie bei lohn_periode_berechnen()/rotationsplan_generieren():
  -- Neuberechnung ist ein bewusster Knopfdruck, nicht ein Nebeneffekt des
  -- Lesens.
  add column if not exists mwst_letzter_umsatz_tenge numeric(14,2),
  add column if not exists mwst_letzte_pruefung_am timestamptz;

comment on column public.betriebe.mwst_registriert is
  'Ob der Betrieb bei der Steuerbehoerde als Mehrwertsteuerzahler registriert ist. Steuert, ob Proforma-Rechnungen ueberhaupt eine MwSt-Zeile zeigen (siehe berechneProforma(), src/lib/domain/rechnungshistorie.ts) - ohne Registrierung wird keine MwSt ausgewiesen, unabhaengig vom Satz.';
comment on column public.betriebe.mwst_schwelle_ueberschritten_am is
  'Datum, an dem der rollierende 12-Monats-Umsatz erstmals die Registrierungsschwelle ueberschritt - Ankerpunkt der 5-Werktage-Meldefrist. Bleibt gesetzt, auch wenn der Umsatz spaeter wieder unter die Schwelle faellt.';

-- betriebe_update_leitung (Migration 20261021000000) erlaubte bislang nur
-- admin/betriebsleitung. rbac.ts gibt jedoch auch buchhaltung crud
-- ("stammdaten"), und die MwSt-Registrierung ist tatsaechlich buchhalterisch
-- zu verantworten, nicht durch die Betriebsleitung - ein Fund, kein
-- Seiteneffekt dieser Migration. Die Policy wird deshalb ersetzt, nicht nur
-- ergaenzt (Postgres kennt kein "ALTER POLICY ... ADD ROLE").
drop policy if exists betriebe_update_leitung on public.betriebe;
create policy betriebe_update_leitung on public.betriebe
  for update to authenticated
  using (public.has_role('admin', 'betriebsleitung', 'buchhaltung'))
  with check (public.has_role('admin', 'betriebsleitung', 'buchhaltung'));

alter table public.mwst_saetze enable row level security;
alter table public.mwst_saetze force row level security;

create policy mwst_saetze_select_office on public.mwst_saetze
  for select to authenticated
  using (public.has_office_access());

create policy mwst_saetze_insert_buchhaltung on public.mwst_saetze
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy mwst_saetze_update_buchhaltung on public.mwst_saetze
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

grant execute on function public.werktage_addieren(date, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Rollierender 12-Monats-Umsatz und die Schwellenpruefung
-- ---------------------------------------------------------------------------
-- Grundlage ist finance_ledger_entries.betrag_tenge mit typ = 'erloes' - die
-- tatsaechlich gebuchte Ledger-Zeile, NICHT die unpersistierte TS-Proforma aus
-- berechneProforma() (siehe deren Kommentar: "keine rechtsverbindliche
-- Rechnung"). Die Schwellenpruefung braucht eine echte, buchhalterisch
-- verantwortete Zahl, keine Kalkulation ohne Tabellenbezug.
create or replace function public.mwst_umsatz_12_monate(p_stichtag date default current_date)
returns numeric
language sql
stable
as $$
  select coalesce(sum(betrag_tenge), 0)
    from public.finance_ledger_entries
   where typ = 'erloes'
     and buchungsdatum > (p_stichtag - interval '12 months')::date
     and buchungsdatum <= p_stichtag;
$$;
comment on function public.mwst_umsatz_12_monate is
  'Rollierender 12-Kalendermonats-Umsatz aus finance_ledger_entries (typ=erloes) zu einem Stichtag - Grundlage der MwSt-Registrierungsschwelle. Der Zugriff wird per REVOKE gesperrt (siehe unten), nicht nur durch das Fehlen eines Grants - zwei getrennte Automatismen erteilen ihn sonst trotzdem: (1) Postgres vergibt EXECUTE auf eine neu angelegte Funktion standardmaessig an PUBLIC, dem jede Rolle implizit angehoert; (2) supabase/fixtures/auth-stub.sql legt zusaetzlich ALTER DEFAULT PRIVILEGES fest, die JEDER neuen Funktion im Schema automatisch EXECUTE fuer anon/authenticated/service_role mitgeben - derselbe Mechanismus, den echtes Supabase produktiv verwendet. Beide Automatismen mussten beim Bau erst per fehlgeschlagenem Test entdeckt werden (supabase/tests/pglite-fast.mjs, Abschnitt 14d): "keinen Grant erteilen" allein sperrte nichts, es brauchte einen expliziten REVOKE gegen alle drei Rollen. Aufrufbar bleibt die Funktion ausschliesslich ueber mwst_schwelle_pruefen() (SECURITY DEFINER, eigener has_role()-Einstieg), das die Rechte seines Definers durchreicht, unabhaengig von den Rechten des urspruenglichen Aufrufers.';

-- Siehe Funktionskommentar: sowohl der PUBLIC-Default als auch der
-- projekteigene auth-stub-Automatismus muessen aktiv entzogen werden.
revoke execute on function public.mwst_umsatz_12_monate(date) from public, anon, authenticated;

-- SECURITY DEFINER mit explizitem has_role()-Einstieg, gleiches Muster wie
-- lohn_monat_abzuege_berechnen(): schreibt auf betriebe, das RLS dort
-- verlangt bereits eine Rolle, aber die Funktion soll unabhaengig vom
-- Zeilenzugriff des Aufrufers zuverlaessig einmal pro Betrieb pruefen.
--
-- Idempotent und einseitig: ein bereits gesetztes
-- mwst_schwelle_ueberschritten_am wird nie ueberschrieben (siehe
-- Spaltenkommentar oben) - ein erneuter Aufruf nach der ersten Ueberschreitung
-- aendert nichts mehr, unabhaengig davon, wie oft er laeuft.
create or replace function public.mwst_schwelle_pruefen()
returns table (
  betrieb_id                 uuid,
  umsatz_12_monate_tenge      numeric,
  schwelle_tenge              numeric,
  schwelle_ueberschritten     boolean,
  schwelle_ueberschritten_am  date,
  meldefrist_am               date
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_satz     public.mwst_saetze;
  v_betrieb  record;
  v_umsatz   numeric;
begin
  if not public.has_role('admin', 'buchhaltung') then
    raise exception 'Nur Buchhaltung oder Admin pruefen die MwSt-Schwelle.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_satz
    from public.mwst_saetze
   where gueltig_ab <= current_date
     and (gueltig_bis is null or gueltig_bis > current_date)
   order by gueltig_ab desc
   limit 1;

  if not found then
    raise exception 'Kein gesetzlicher MwSt-Satz fuer den heutigen Tag hinterlegt.'
      using errcode = 'no_data_found';
  end if;

  -- Ueber alle Betriebe (in diesem Prototyp genau einer) - dieselbe
  -- Schleifenform wie lohn_monat_abzuege_berechnen() ueber Pfluecker.
  for v_betrieb in select id, mwst_schwelle_ueberschritten_am from public.betriebe
  loop
    v_umsatz := public.mwst_umsatz_12_monate(current_date);

    -- Letzten Stand immer mitschreiben (auch ohne Ueberschreitung) - Grundlage
    -- fuer eine Anzeige, die nicht bei jedem Aufruf neu rechnen muss.
    update public.betriebe
       set mwst_letzter_umsatz_tenge = v_umsatz,
           mwst_letzte_pruefung_am = now()
     where id = v_betrieb.id;

    if v_umsatz >= v_satz.schwelle_tenge and v_betrieb.mwst_schwelle_ueberschritten_am is null then
      update public.betriebe
         set mwst_schwelle_ueberschritten_am = current_date
       where id = v_betrieb.id;
      v_betrieb.mwst_schwelle_ueberschritten_am := current_date;
    end if;

    return query select
      v_betrieb.id,
      v_umsatz,
      v_satz.schwelle_tenge,
      v_betrieb.mwst_schwelle_ueberschritten_am is not null,
      v_betrieb.mwst_schwelle_ueberschritten_am,
      case when v_betrieb.mwst_schwelle_ueberschritten_am is not null
        then public.werktage_addieren(v_betrieb.mwst_schwelle_ueberschritten_am, 5)
        else null
      end;
  end loop;
end;
$$;
comment on function public.mwst_schwelle_pruefen is
  'Prueft den rollierenden 12-Monats-Umsatz gegen die gesetzliche MwSt-Registrierungsschwelle und setzt betriebe.mwst_schwelle_ueberschritten_am beim ersten Ueberschreiten - einmalig, nie zurueckgesetzt. Liefert die daraus berechnete 5-Werktage-Meldefrist mit.';

-- mwst_umsatz_12_monate() bewusst OHNE Grant an authenticated - siehe deren
-- Funktionskommentar. Nur mwst_schwelle_pruefen() ist von aussen aufrufbar.
grant execute on function public.mwst_schwelle_pruefen() to authenticated;

-- Lesesicht mit der berechneten Meldefrist - gleiches Muster wie
-- esutd_vertraege_mit_frist oben: die Werktagsregel bleibt einzig in SQL
-- (public.werktage_addieren), die Ansicht liest nur, kein zweiter,
-- TS-seitiger Nachbau derselben Kalenderschleife.
create view public.betriebe_mwst_status
with (security_invoker = true)
as
select
  b.id as betrieb_id,
  b.mwst_registriert,
  b.mwst_registriert_am,
  b.mwst_schwelle_ueberschritten_am,
  b.mwst_letzter_umsatz_tenge,
  b.mwst_letzte_pruefung_am,
  case when b.mwst_schwelle_ueberschritten_am is not null
    then public.werktage_addieren(b.mwst_schwelle_ueberschritten_am, 5)
    else null
  end as meldefrist_am
from public.betriebe b;

comment on view public.betriebe_mwst_status is
  'betriebe-Spalten zur MwSt-Registrierung plus die berechnete 5-Werktage-Meldefrist. Reine Lesesicht, keine eigene Schreiblogik.';

grant select on public.betriebe_mwst_status to authenticated;
