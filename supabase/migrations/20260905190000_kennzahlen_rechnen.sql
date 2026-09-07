-- =============================================================================
-- Damicon - Meilenstein C: Kennzahlen rechnen statt behaupten
-- =============================================================================
-- Vor dieser Migration waren alle 14 Baseline-Kennzahlen Textkonstanten. Von den
-- 14 war genau eine ueberhaupt berechenbar. Mit der geschlossenen Nachweiskette
-- (Charge, Person, Arbeitszeit, Kuehlzeit) kommen sieben weitere dazu.
--
-- public.kpi_aktuell() liefert je Kennzahl den gerechneten Wert und die Basis,
-- aus der er stammt. Was sich nicht rechnen laesst, liefert die Funktion
-- bewusst NICHT - dann zeigt die Oberflaeche weiter den Platzhalter aus
-- kpi_baseline und sagt dazu, was fehlt.
--
-- Am 01.10.2026 wird die Baseline unterschrieben. Danach ist diese Funktion die
-- Stelle, an der die Fortschreibung haengt.
-- =============================================================================

set search_path = public;

create or replace function public.kpi_aktuell()
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
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
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
         group by 1, 2
      ) m
      join (
        select pfluecker_id, pflueckaufgabe_id, sum(minuten) as minuten
          from public.arbeitszeiten
         where minuten is not null and pflueckaufgabe_id is not null
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
  -- desselben Reihenblocks geerntet wurde.
  return query
  with bewertet as (
    select b.id,
           not exists (
             select 1 from public.chargen c
              where c.reihenblock_id = b.reihenblock_id
                and c.ernte_datum >= b.behandelt_am
                and c.ernte_datum < b.freigabe_am
           ) as eingehalten
      from public.pflanzenschutz_behandlungen b
     where b.freigabe_am is not null
  )
  select 'behandlungenWartezeit',
         round(100.0 * count(*) filter (where eingehalten) / nullif(count(*), 0), 0),
         '%',
         'Behandlungen ohne Ernte im Sperrzeitraum',
         count(*)::integer
    from bewertet
  having count(*) > 0;

  -- --- Abdeckung der Saisonkräfte in ЕСУТД --------------------------------
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
  ),
  mengen as (
    select sum(c.menge_kg) as kg from public.chargen c
  )
  select 'deckungsbeitrag',
         round((select db from buchungen) / nullif((select kg from mengen), 0), 0),
         '₸/kg',
         'Erlöse abzüglich Kosten gegen vermarktungsfähige Erntemenge',
         (select count(*)::integer from public.finance_ledger_entries)
   where (select kg from mengen) > 0
     and (select db from buchungen) is not null;
end;
$$;

comment on function public.kpi_aktuell is
  'Berechnet die Baseline-Kennzahlen, die sich aus den vorhandenen Daten ableiten lassen. Nicht gelieferte Schluessel bleiben Platzhalter aus kpi_baseline.';

grant execute on function public.kpi_aktuell() to authenticated;
