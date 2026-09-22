-- =============================================================================
-- Damicon - Der Bereich Markt bekommt gerechnete Kennzahlen
-- =============================================================================
-- Von den vierzehn Baseline-Kennzahlen rechnete kpi_aktuell() bisher acht.
-- Der Bereich Markt war der einzige ohne eine einzige: reklamationsquote und
-- liefertreue standen in src/lib/domain/kpis.ts als "berechenbar", trugen
-- aber beide den Vermerk "braucht: Aggregation in kpi_aktuell()". Genau die
-- kommt hier - an den Tabellen aendert sich nichts.
--
--   * reklamationsquote: beanstandete Menge gegen zugestellte Menge.
--     Abgelehnte Reklamationen zaehlen mit. Wer nur die anerkannten Faelle
--     zaehlt, misst die eigene Entscheidung statt der Beanstandung.
--   * liefertreue: zugesagter Termin gegen Zustellung, nur ueber
--     Lieferungen mit Vorbestellung. Das Tagesgeschaeft ohne Zusage
--     mitzuzaehlen wuerde die Quote schoenrechnen.
--
-- Die uebrigen acht Bloecke sind unveraendert uebernommen. Die Funktion muss
-- als Ganzes neu geschrieben werden, weil plpgsql kein Anfuegen kennt.
--
-- Wirkt auch auf kpi_verlauf: kpi_verlauf_schreiben() (20261104000000) legt
-- je Kennzahl einen Messpunkt an, die zwei neuen laufen ab dem naechsten
-- Schreiblauf mit und bekommen nach dem zweiten Punkt einen Trend.
-- =============================================================================

set search_path = public;

CREATE OR REPLACE FUNCTION public.kpi_aktuell()
 RETURNS TABLE(schluessel text, wert numeric, einheit text, basis text, datensaetze integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
begin
  return query
  select 'verlustquote',
         round(100.0 * sum(c.ausschuss_kg) / nullif(sum(c.menge_kg + c.ausschuss_kg), 0), 1),
         '%',
         'Ausschuss gegen Gesamtmenge über alle Chargen',
         count(*)::integer
    from public.chargen c
   where c.menge_kg + c.ausschuss_kg > 0
  having count(*) > 0;

  -- Bewusst inklusive der Chargen, die die 60-Minuten-Grenze gerissen haben -
  -- sonst zeigt die Kennzahl nur die guten Faelle. Ausreisser ueber einem Tag
  -- gelten als Datenfehler (z. B. eine sehr spaet nachgetragene Messung) und
  -- werden von der Durchschnittsbildung ausgenommen, tauchen aber weiter in
  -- der Datensatzzahl auf.
  return query
  select 'zeitBisVorkuehlung',
         round(avg(extract(epoch from (c.vorkuehlung_zeitpunkt - c.pflueck_zeitpunkt)) / 60)
               filter (where c.vorkuehlung_zeitpunkt - c.pflueck_zeitpunkt < interval '1 day')
               ::numeric, 0),
         'min',
         'Mittel über alle gemessenen Chargen, inklusive Grenzverletzungen',
         count(*)::integer
    from public.chargen c
   where c.pflueck_zeitpunkt is not null
     and c.vorkuehlung_zeitpunkt is not null
  having count(*) > 0;

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
  having count(*) > 1 and min(kg_h) > 0;

  -- Massgeblich ist der tatsaechliche Pflueckzeitpunkt, nicht die geplante
  -- Faelligkeit - sonst misst die Kennzahl den Plan, nicht die Ernte. Rein
  -- geplante Chargen ohne Pflueckzeitpunkt zaehlen nicht mit, ebenso wenig
  -- zwei Ernten am selben Tag (Abstand 0 ist keine Erntefolge).
  return query
  with echte_ernten as (
    select c.reihenblock_id, c.pflueck_zeitpunkt::date as datum
      from public.chargen c
     where c.reihenblock_id is not null and c.pflueck_zeitpunkt is not null
  ),
  folge as (
    select reihenblock_id, datum,
           lag(datum) over (partition by reihenblock_id order by datum) as vorher
      from echte_ernten
  ),
  abstand as (
    select (datum - vorher) as tage from folge where vorher is not null and datum <> vorher
  )
  select 'pflueckintervall',
         round(100.0 * count(*) filter (where tage <= 3) / nullif(count(*), 0), 0),
         '%',
         'Anteil der tatsächlichen Erntefolgen im Abstand von höchstens drei Tagen',
         count(*)::integer
    from abstand
  having count(*) > 0;

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

  return query
  select 'esutdAbdeckung',
         round(100.0 * count(*) filter (where p.esutd = 'erfasst') / nullif(count(*), 0), 0),
         '%',
         'Pflücker mit erfasstem Arbeitsvertrag',
         count(*)::integer
    from public.pfluecker p
  having count(*) > 0;

  -- Umfang bewusst offen benannt: alle Buchungen gegen alle Erntemengen der
  -- Saison, noch ohne Zeitfenster und ohne Chargenbezug in der Buchung (das
  -- Feld finance_ledger_entries.charge_id steht bereit, ist aber noch nicht
  -- befuellt). Eine engere Definition ist eine Entscheidung der Buchhaltung,
  -- keine Korrektur der Abfrage.
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
         'Alle Erlös- und Kostenbuchungen gegen die gesamte Erntemenge - noch ohne Zeitfenster oder Chargenbezug je Buchung',
         (select count(*)::integer from public.finance_ledger_entries)
   where (select kg from mengen) > 0
     and (select db from buchungen) is not null;

  -- ---------------------------------------------------------------------
  -- Markt: Reklamationsquote
  -- ---------------------------------------------------------------------
  -- Beanstandete Menge gegen zugestellte Menge. Beide Seiten stehen seit
  -- 20260908120000 (Reklamationen) und 20260926000000 (Lieferungen) in
  -- eigenen Tabellen; gefehlt hat nur diese Aggregation - der Hinweis
  -- "braucht: Aggregation in kpi_aktuell()" steht so in kpis.ts.
  --
  -- Gezaehlt wird ueber den ganzen Betrieb, nicht je Kunde: es ist eine
  -- Betriebskennzahl, keine Kundenauswertung. Abgelehnte Reklamationen
  -- zaehlen bewusst mit - beanstandet wurde die Ware trotzdem, und eine
  -- Quote, die nur die anerkannten Faelle zeigt, misst die eigene
  -- Entscheidung statt der Beanstandung.
  return query
  with geliefert as (
    select sum(l.menge_kg) as kg
      from public.lieferungen l
     where l.status = 'zugestellt'
  ),
  beanstandet as (
    select coalesce(sum(r.betroffene_menge_kg), 0) as kg
      from public.reklamationen r
  )
  select 'reklamationsquote',
         round(100.0 * (select kg from beanstandet) / nullif((select kg from geliefert), 0), 1),
         '%',
         'Beanstandete Menge gegen zugestellte Menge',
         (select count(*)::integer from public.reklamationen)
   where (select kg from geliefert) > 0;

  -- ---------------------------------------------------------------------
  -- Markt: Liefertreue
  -- ---------------------------------------------------------------------
  -- Zugesagter Termin gegen tatsaechliche Zustellung. Gerechnet wird nur
  -- ueber Lieferungen, die auf eine Vorbestellung zurueckgehen: beim
  -- Tagesgeschaeft ohne Zusage gibt es nichts zu halten, und es
  -- mitzuzaehlen wuerde die Quote schoenrechnen.
  --
  -- Verglichen wird auf Tagesebene - der Liefertermin ist ein Datum, die
  -- Zustellung ein Zeitstempel. Wer am zugesagten Tag liefert, ist
  -- puenktlich, gleich zu welcher Stunde.
  return query
  select 'liefertreue',
         round(100.0 * count(*) filter (where l.geliefert_am::date <= v.liefertermin)
               / nullif(count(*), 0), 0),
         '%',
         'Zugestellt bis zum zugesagten Termin, ueber Lieferungen mit Vorbestellung',
         count(*)::integer
    from public.lieferungen l
    join public.vorbestellungen v on v.id = l.vorbestellung_id
   where l.geliefert_am is not null
     and v.liefertermin is not null
     and l.status = 'zugestellt'
  having count(*) > 0;

end;
$function$;
