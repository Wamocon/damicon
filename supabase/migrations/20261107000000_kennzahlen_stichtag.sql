-- =============================================================================
-- Damicon - Kennzahlen zu einem Stichtag, und der Verlauf daraus
-- =============================================================================
-- public.kpi_aktuell() kannte bisher nur das Jetzt. Damit laesst sich kein
-- Verlauf bilden: ruft man sie fuer dreissig vergangene Tage auf, liefert sie
-- dreissigmal denselben Wert, und jeder Trendpfeil steht auf waagerecht.
--
-- Die Testdaten tragen aber echte Historie - 132 Chargen ueber 127 Erntetage
-- vom 15.07.2025 bis 23.09.2026, dazu 359 Arbeitszeiten im selben Zeitraum.
-- Sieben der acht gerechneten Kennzahlen lassen sich deshalb rueckwirkend
-- bestimmen, indem man die zugrunde liegenden Zeilen auf einen Stichtag
-- begrenzt.
--
-- Diese Migration legt an:
--   1. kpi_aktuell_stichtag(datum)   - dieselbe Rechnung, nur mit Daten bis
--                                      zu diesem Tag
--   2. kpi_aktuell()                 - ruft jetzt (1) mit current_date auf,
--                                      statt die Logik ein zweites Mal zu
--                                      fuehren
--   3. kpi_verlauf_nachrechnen(...)  - schreibt den Verlauf rueckwirkend
--
-- ZWEI VERHALTENSAENDERUNGEN, ausdruecklich benannt:
--
--   a) kpi_aktuell() schliesst jetzt Zeilen mit einem Datum IN DER ZUKUNFT
--      aus. Im Bestand gibt es eine Charge mit Erntedatum 23.09.2026,
--      waehrend heute der 22. ist. Bisher floss sie in die Kennzahl ein - ein
--      Istwert, der morgen liegt. Das war ein Fehler und ist hier behoben.
--   b) esutdAbdeckung bleibt ueber die Zeit konstant. Die Tabelle pfluecker
--      traegt kein Datum, also laesst sich nicht sagen, wie die Abdeckung im
--      Juli aussah. Die Kennzahl steht im Verlauf, ihr Pfeil bleibt aber
--      flach, bis jemand die Erfassung mit einem Datum versieht.
-- =============================================================================

set search_path = public;

create or replace function public.kpi_aktuell_stichtag(p_stichtag date)
returns table (
  schluessel text,
  wert       numeric,
  einheit    text,
  basis      text,
  datensaetze integer
)
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  -- --- Verlustquote vom Pflücken bis zum Kunden --------------------------
  return query
  select 'verlustquote',
         round(100.0 * sum(c.ausschuss_kg) / nullif(sum(c.menge_kg + c.ausschuss_kg), 0), 1),
         '%',
         'Ausschuss gegen Gesamtmenge über alle Chargen',
         count(*)::integer
    from public.chargen c
   where c.menge_kg + c.ausschuss_kg > 0
     and c.ernte_datum <= p_stichtag
  having count(*) > 0;

  -- --- Zeit vom Pflücken bis zur Vorkühlung -------------------------------
  -- Der Kern des Geschäftsmodells: über 60 Minuten ist die Ware am nächsten
  -- Tag nur noch Industrieware.
  return query
  select 'zeitBisVorkuehlung',
         round(avg(extract(epoch from (c.vorkuehlung_zeitpunkt - c.pflueck_zeitpunkt)) / 60)::numeric, 0),
         'min',
         'Mittel über alle Chargen mit Pflück- und Vorkühlzeitpunkt',
         count(*)::integer
    from public.chargen c
   where c.pflueck_zeitpunkt is not null
     and c.vorkuehlung_zeitpunkt is not null
     and c.pflueck_zeitpunkt < (p_stichtag + 1)::timestamptz
  having count(*) > 0;

  -- --- Pflückleistung je Person und Stunde --------------------------------
  -- Menge und Zeit werden GETRENNT verdichtet und erst dann zusammengeführt.
  -- Ein direkter Join würde die Arbeitszeit mit der Zahl der Steigen
  -- vervielfachen und die Leistung um ein Vielfaches zu niedrig ausweisen.
  return query
  with je_person as (
    select m.pfluecker_id,
           sum(m.kg) as kg,
           sum(z.minuten) / 60.0 as stunden
      from (
        select pfluecker_id, pflueckaufgabe_id, sum(gewicht_kg) as kg
          from public.steigen
         where pfluecker_id is not null and pflueckaufgabe_id is not null
           and (scan_zeitpunkt is null or scan_zeitpunkt < (p_stichtag + 1)::timestamptz)
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
           and beginn < (p_stichtag + 1)::timestamptz
         group by 1, 2
      ) z on z.pfluecker_id = m.pfluecker_id
         and z.pflueckaufgabe_id = m.pflueckaufgabe_id
     group by m.pfluecker_id
    having sum(z.minuten) > 0
  )
  select 'pflueckleistung',
         round(sum(kg) / nullif(sum(stunden), 0), 1),
         'kg/h',
         'Erntemenge je Steige gegen erfasste Arbeitszeit',
         count(*)::integer
    from je_person
  having count(*) > 0;

  -- --- Streuung der Pflückleistung (beste zu schwächste Kraft) ------------
  return query
  with je_person as (
    select m.pfluecker_id,
           sum(m.kg) / nullif(sum(z.minuten) / 60.0, 0) as kg_h
      from (
        select pfluecker_id, pflueckaufgabe_id, sum(gewicht_kg) as kg
          from public.steigen
         where pfluecker_id is not null and pflueckaufgabe_id is not null
           and (scan_zeitpunkt is null or scan_zeitpunkt < (p_stichtag + 1)::timestamptz)
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
           and beginn < (p_stichtag + 1)::timestamptz
         group by 1, 2
      ) z on z.pfluecker_id = m.pfluecker_id
         and z.pflueckaufgabe_id = m.pflueckaufgabe_id
     group by m.pfluecker_id
    having sum(z.minuten) > 0
  )
  select 'pflueckStreuung',
         round(max(kg_h) / nullif(min(kg_h), 0), 1),
         'x',
         'Beste gegen schwächste Kraft, mindestens zwei Personen nötig',
         count(*)::integer
    from je_person
  having count(*) > 1;

  -- --- Eingehaltenes Pflückintervall je Reihenblock -----------------------
  -- Aus den tatsächlichen Erntedaten der Chargen, nicht aus dem Plan.
  return query
  with folge as (
    select c.reihenblock_id,
           c.ernte_datum,
           lag(c.ernte_datum) over (partition by c.reihenblock_id order by c.ernte_datum) as vorher
      from public.chargen c
     where c.reihenblock_id is not null
       and c.ernte_datum <= p_stichtag
  ),
  abstand as (
    select (ernte_datum - vorher) as tage
      from folge
     where vorher is not null
  )
  select 'pflueckintervall',
         round(100.0 * count(*) filter (where tage <= 3) / nullif(count(*), 0), 0),
         '%',
         'Anteil der Erntefolgen im Abstand von höchstens drei Tagen',
         count(*)::integer
    from abstand
  having count(*) > 0;

  -- --- Behandlungen mit eingehaltener Wartezeit ---------------------------
  -- Eine Behandlung gilt als eingehalten, wenn im Sperrzeitraum keine Charge
  -- desselben Reihenblocks geerntet wurde. Die Gegenprobe endet ebenfalls am
  -- Stichtag: was danach geerntet wurde, war an diesem Tag noch nicht
  -- bekannt.
  return query
  with bewertet as (
    select b.id,
           not exists (
             select 1 from public.chargen c
              where c.reihenblock_id = b.reihenblock_id
                and c.ernte_datum >= b.behandelt_am
                and c.ernte_datum < b.freigabe_am
                and c.ernte_datum <= p_stichtag
           ) as eingehalten
      from public.pflanzenschutz_behandlungen b
     where b.freigabe_am is not null
       and b.behandelt_am <= p_stichtag
  )
  select 'behandlungenWartezeit',
         round(100.0 * count(*) filter (where eingehalten) / nullif(count(*), 0), 0),
         '%',
         'Behandlungen ohne Ernte im Sperrzeitraum',
         count(*)::integer
    from bewertet
  having count(*) > 0;

  -- --- Abdeckung der Saisonkräfte in ЕСУТД --------------------------------
  -- Ohne Stichtagsfilter: public.pfluecker traegt kein Datum, es laesst sich
  -- nicht sagen, wie die Abdeckung im Juli aussah. Die Kennzahl steht damit
  -- im Verlauf, ihr Pfeil bleibt aber flach.
  return query
  select 'esutdAbdeckung',
         round(100.0 * count(*) filter (where p.esutd = 'erfasst') / nullif(count(*), 0), 0),
         '%',
         'Pflücker mit erfasstem Arbeitsvertrag',
         count(*)::integer
    from public.pfluecker p
  having count(*) > 0;

  -- --- Deckungsbeitrag je kg ---------------------------------------------
  return query
  with buchungen as (
    select sum(case when l.typ = 'erloes' then l.betrag_tenge else -l.betrag_tenge end) as db
      from public.finance_ledger_entries l
     where l.buchungsdatum <= p_stichtag
  ),
  mengen as (
    select sum(c.menge_kg) as kg
      from public.chargen c
     where c.ernte_datum <= p_stichtag
  )
  select 'deckungsbeitrag',
         round((select db from buchungen) / nullif((select kg from mengen), 0), 0),
         '₸/kg',
         'Erlöse abzüglich Kosten gegen vermarktungsfähige Erntemenge',
         (select count(*)::integer from public.finance_ledger_entries l
           where l.buchungsdatum <= p_stichtag)
   where (select kg from mengen) > 0
     and (select db from buchungen) is not null;
end;
$$;

comment on function public.kpi_aktuell_stichtag is
  'Baseline-Kennzahlen zu einem Stichtag. Grundlage fuer den rueckwirkenden Verlauf; esutdAbdeckung bleibt konstant, weil pfluecker kein Datum traegt.';

grant execute on function public.kpi_aktuell_stichtag(date) to authenticated;

-- ---------------------------------------------------------------------------
-- kpi_aktuell() fuehrt die Logik nicht mehr selbst
-- ---------------------------------------------------------------------------
-- Vorher stand derselbe Rechenweg zweimal im Schema: einmal ohne und einmal
-- mit Stichtag. Zwei Fassungen derselben Rechnung laufen frueher oder spaeter
-- auseinander, und dann zeigt die Kachel etwas anderes als ihr Verlauf.
create or replace function public.kpi_aktuell()
returns table (
  schluessel text,
  wert       numeric,
  einheit    text,
  basis      text,
  datensaetze integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select * from public.kpi_aktuell_stichtag(current_date);
$$;

comment on function public.kpi_aktuell is
  'Berechnet die Baseline-Kennzahlen zum heutigen Tag. Ruft kpi_aktuell_stichtag(current_date); Zeilen mit einem Datum in der Zukunft bleiben dadurch aussen vor.';

grant execute on function public.kpi_aktuell() to authenticated;

-- ---------------------------------------------------------------------------
-- Den Verlauf rueckwirkend fuellen
-- ---------------------------------------------------------------------------
-- Schreibt je Stichtag einen Messpunkt. Vorhandene Punkte werden korrigiert,
-- nicht verdoppelt - dieselbe Regel wie in kpi_verlauf_schreiben().
--
-- p_schritt: Abstand in Tagen. Ueber ein Jahr genuegt ein Punkt je Woche,
-- fuer die letzten Wochen ist taeglich sinnvoll. Wer beides will, ruft die
-- Funktion zweimal mit verschiedenen Zeitraeumen auf.
create or replace function public.kpi_verlauf_nachrechnen(
  p_von     date,
  p_bis     date default current_date,
  p_schritt integer default 1
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  tag     date := p_von;
  punkte  integer := 0;
  zeilen  integer;
begin
  if p_schritt < 1 then
    raise exception 'p_schritt muss mindestens 1 sein';
  end if;

  while tag <= p_bis loop
    insert into public.kpi_verlauf (schluessel, gemessen_am, wert, einheit, basis, datensaetze)
    select k.schluessel, tag, k.wert, k.einheit, k.basis, coalesce(k.datensaetze, 0)
      from public.kpi_aktuell_stichtag(tag) k
     where k.wert is not null
    on conflict (schluessel, gemessen_am) do update
      set wert        = excluded.wert,
          einheit     = excluded.einheit,
          basis       = excluded.basis,
          datensaetze = excluded.datensaetze;

    get diagnostics zeilen = row_count;
    punkte := punkte + zeilen;
    tag := tag + p_schritt;
  end loop;

  return punkte;
end;
$$;

comment on function public.kpi_verlauf_nachrechnen is
  'Fuellt kpi_verlauf rueckwirkend aus kpi_aktuell_stichtag(). Vorhandene Punkte werden korrigiert, nicht verdoppelt.';

revoke all on function public.kpi_verlauf_nachrechnen(date, date, integer) from public;
grant execute on function public.kpi_verlauf_nachrechnen(date, date, integer) to service_role;
