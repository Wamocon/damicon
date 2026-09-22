-- =============================================================================
-- Damicon - Markt-Kennzahlen: Reklamationsquote und Liefertreue
-- =============================================================================
-- kpis.ts kennt beide Kennzahlen seit Langem, samt Beschriftung in allen vier
-- Sprachen; in der Datenbank fehlte nur die Aggregation. Der Hinweis "braucht:
-- Aggregation in kpi_aktuell()" steht dort woertlich.
--
-- Ein erster Anlauf (20261105000000_kennzahlen_markt.sql, nie gemergt) hat
-- dafuer kpi_aktuell() komplett neu definiert. Das lief ins Leere: kurz danach
-- hat 20261107000000_kennzahlen_stichtag.sql kpi_aktuell() zu einem Dreizeiler
-- gemacht, der die Rechnung an kpi_aktuell_stichtag(datum) abgibt - und damit
-- die beiden neuen Kennzahlen wieder ueberschrieben. Nachgemessen: die
-- Funktion lieferte acht Schluessel, reklamationsquote und liefertreue fehlten.
-- Ein blosses Hochsetzen der Version haette den Fehler nur umgedreht und den
-- Stichtag-Umbau zerstoert.
--
-- Deshalb hier am richtigen Ort: kpi_aktuell_stichtag() bekommt die beiden
-- Bloecke dazu, mit Stichtagsbezug wie die acht anderen. kpi_aktuell() bleibt
-- der Dreizeiler und erbt sie. Der Verlauf ueber kpi_verlauf_nachrechnen()
-- rechnet sie damit ebenfalls rueckwirkend.
--
-- Die acht bestehenden Bloecke sind unveraendert uebernommen.
-- =============================================================================

set search_path = public;

CREATE OR REPLACE FUNCTION public.kpi_aktuell_stichtag(p_stichtag date)
 RETURNS TABLE(schluessel text, wert numeric, einheit text, basis text, datensaetze integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $$
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
  --
  -- Beide Seiten haengen am Stichtag. Ohne das waere die Quote im Verlauf
  -- falsch: eine Reklamation von heute gegen die Liefermenge von damals.
  return query
  with geliefert as (
    select sum(l.menge_kg) as kg
      from public.lieferungen l
     where l.status = 'zugestellt'
       and l.geliefert_am < (p_stichtag + 1)::timestamptz
  ),
  beanstandet as (
    select coalesce(sum(r.betroffene_menge_kg), 0) as kg
      from public.reklamationen r
     where r.gemeldet_am < (p_stichtag + 1)::timestamptz
  )
  select 'reklamationsquote',
         round(100.0 * (select kg from beanstandet) / nullif((select kg from geliefert), 0), 1),
         '%',
         'Beanstandete Menge gegen zugestellte Menge',
         (select count(*)::integer from public.reklamationen r
           where r.gemeldet_am < (p_stichtag + 1)::timestamptz)
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
         'Zugestellt bis zum zugesagten Termin, über Lieferungen mit Vorbestellung',
         count(*)::integer
    from public.lieferungen l
    join public.vorbestellungen v on v.id = l.vorbestellung_id
   where l.geliefert_am is not null
     and v.liefertermin is not null
     and l.status = 'zugestellt'
     and l.geliefert_am < (p_stichtag + 1)::timestamptz
  having count(*) > 0;

end;
$$;
