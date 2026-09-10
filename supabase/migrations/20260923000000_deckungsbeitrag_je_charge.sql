-- =============================================================================
-- Damicon - Deckungsbeitrag je Charge statt nur pauschal je Kostentraeger
-- (Masterplan-Anforderung 3.3)
-- =============================================================================
-- finance_ledger_entries.charge_id steht seit dem initialen Schema bereit,
-- wurde aber nirgends befuellt - jede Buchung liess sich nur bis zum
-- Kostentraeger zurueckverfolgen (Block/Sorte/Erntetag/Kunde als Gruppe),
-- nicht bis zur einzelnen Charge (ein Kostentraeger kann mehrere Chargen
-- desselben Tages/Blocks/Sorte umfassen, wenn an einem Tag mehrfach
-- gepflueckt wurde). "Chargenverfolgung bis zur Rechnung" (Anforderung 3.3)
-- heisst: eine Buchung optional direkt an einer Charge festmachen koennen,
-- nicht nur am groeberen Kostentraeger.
--
-- Kein Schema-Update noetig (die Spalte existiert bereits) - nur eine neue
-- View, analog zu deckungsbeitrag_je_kostentraeger (Migration
-- 20260909000000) und deren Erweiterung um menge_kg/je_kg
-- (20260920000000, Anforderung 4.3). Bewusst ein INNER JOIN auf
-- finance_ledger_entries statt eines LEFT JOIN von chargen aus: die
-- allermeisten Chargen haben keine direkt zugeordnete Buchung (die Buchung
-- haengt normalerweise am Kostentraeger), eine Zeile pro Charge ohne jede
-- Buchung waere reines Rauschen. menge_kg kommt hier direkt aus
-- pflueckaufgaben.charge_id (seit der Kette in Meilenstein C automatisch
-- gefuellt) - einfacher als die Lateral-Matching-Konstruktion der
-- Kostentraeger-View, die block/sorte/erntetag zusammenfuehren muss, weil
-- ein Kostentraeger keine eigene charge_id kennt.
-- =============================================================================

set search_path = public;

create view public.deckungsbeitrag_je_charge
with (security_invoker = true)
as
select
  c.id                                                                      as charge_id,
  c.code                                                                    as charge_code,
  c.ernte_datum,
  rb.code                                                                   as reihenblock_code,
  s.name                                                                    as sorte_name,
  pa.menge_kg,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)      as erloes_tenge,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)      as kosten_tenge,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)
    - coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)  as deckungsbeitrag_tenge,
  case
    when coalesce(pa.menge_kg, 0) > 0 then
      (coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)
        - coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)) / pa.menge_kg
  end                                                                        as deckungsbeitrag_je_kg_tenge,
  count(fle.id)                                                             as buchungen
from public.chargen c
join public.finance_ledger_entries fle on fle.charge_id = c.id
left join public.reihenbloecke rb on rb.id = c.reihenblock_id
left join public.sorten s on s.id = c.sorte_id
left join lateral (
  select sum(p.ist_menge_kg) as menge_kg
  from public.pflueckaufgaben p
  where p.charge_id = c.id
) pa on true
group by c.id, c.code, c.ernte_datum, rb.code, s.name, pa.menge_kg;

comment on view public.deckungsbeitrag_je_charge is
  'Erloes minus Kosten je einzelner Charge, nur fuer Chargen mit mindestens '
  'einer direkt zugeordneten Ledger-Buchung (Anforderung 3.3). '
  'security_invoker: RLS der Basistabellen (finance_ledger_entries nur '
  'Buero-Rollen) gilt unveraendert durch die View hindurch.';

grant select on public.deckungsbeitrag_je_charge to authenticated;
