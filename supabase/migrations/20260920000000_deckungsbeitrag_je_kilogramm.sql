-- =============================================================================
-- Damicon - Deckungsbeitrag je Kilogramm (Anforderung 4.3)
-- =============================================================================
-- deckungsbeitrag_je_kostentraeger (Migration 20260909000000) liefert bereits
-- den Deckungsbeitrag gruppiert nach Reihenblock, Sorte, Kunde und Erntetag,
-- aber nur als absolute Tenge-Summe. Die Anforderung verlangt "je Kilogramm" -
-- ohne Division durch die tatsaechlich geerntete Menge ist der Wert zwischen
-- unterschiedlich grossen Ernten nicht vergleichbar.
--
-- Die geerntete Menge kommt aus pflueckaufgaben.ist_menge_kg, verknuepft ueber
-- chargen: kostentraeger traegt dieselbe Kombination aus Reihenblock, Sorte
-- und Datum (erntetag) wie chargen (reihenblock_id, sorte_id, ernte_datum) -
-- das war bereits beim Anlegen von kostentraeger so vorgesehen (Anforderung
-- 4.2). "is not distinct from" statt "=", weil alle drei Spalten auf
-- kostentraeger nullable sind (z. B. Zukauf-Kostentraeger ohne eigenen
-- Reihenblock) und zwei NULL-Werte fachlich zusammengehoeren sollen.
--
-- Zukauf-Kostentraeger (kein reihenblock_id) liefern bewusst keine Menge und
-- damit keinen Wert je Kilogramm - sie haben keine eigene Pflueckaufgabe,
-- die Menge steht stattdessen in zukauf_positionen (Anforderung 6.x, ausserhalb
-- dieses Scopes).
-- =============================================================================

set search_path = public;

create or replace view public.deckungsbeitrag_je_kostentraeger
with (security_invoker = true)
as
select
  kt.id                                                                     as kostentraeger_id,
  kt.bezeichnung,
  kt.erntetag,
  rb.code                                                                   as reihenblock_code,
  s.name                                                                    as sorte_name,
  bk.name                                                                   as b2b_kunde_name,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)      as erloes_tenge,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)      as kosten_tenge,
  coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)
    - coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)  as deckungsbeitrag_tenge,
  count(fle.id)                                                             as buchungen,
  geerntet.menge_kg,
  case
    when coalesce(geerntet.menge_kg, 0) > 0 then
      round(
        (
          coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'erloes'), 0)
          - coalesce(sum(fle.betrag_tenge) filter (where fle.typ = 'kosten'), 0)
        ) / geerntet.menge_kg,
        2
      )
    else null
  end                                                                        as deckungsbeitrag_je_kg_tenge
from public.kostentraeger kt
left join public.reihenbloecke rb on rb.id = kt.reihenblock_id
left join public.sorten s on s.id = kt.sorte_id
left join public.b2b_kunden bk on bk.id = kt.b2b_kunde_id
left join public.finance_ledger_entries fle on fle.kostentraeger_id = kt.id
left join lateral (
  select sum(pa.ist_menge_kg) as menge_kg
  from public.chargen c
  join public.pflueckaufgaben pa on pa.charge_id = c.id
  where c.reihenblock_id is not distinct from kt.reihenblock_id
    and c.sorte_id is not distinct from kt.sorte_id
    and c.ernte_datum is not distinct from kt.erntetag
    and kt.reihenblock_id is not null
) geerntet on true
group by kt.id, kt.bezeichnung, kt.erntetag, rb.code, s.name, bk.name, geerntet.menge_kg;

comment on view public.deckungsbeitrag_je_kostentraeger is
  'Erloes minus Kosten je Kostentraeger, aus dem unveraenderlichen Ledger gerechnet '
  '(Anforderung 4.3: inklusive Deckungsbeitrag je Kilogramm, aus der tatsaechlich '
  'geernteten Menge in pflueckaufgaben.ist_menge_kg). security_invoker: RLS der '
  'Basistabellen gilt unveraendert, die View selbst vergibt keine zusaetzlichen Rechte.';
