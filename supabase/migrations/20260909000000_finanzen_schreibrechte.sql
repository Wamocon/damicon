-- =============================================================================
-- Damicon - Finanzen: Schreibrechte fuer Kostentraeger/Ledger + Deckungsbeitrag
-- =============================================================================
-- Anforderung 4.2 aus dem Masterplan (P0): "Kostenstellen je Reihenblock,
-- Kostentraeger je Sorte und Kunde." Das Schema stand bereits seit dem
-- initialen Schema (kostentraeger, finance_ledger_entries), nur lesend und
-- ohne Kundenbezug - das Buero-Modul blieb deshalb reine Demo-Oberflaeche
-- (siehe src/components/demo/buero.tsx FinanzenDemo). Diese Migration macht
-- daraus einen echten Schreibpfad:
--
--   1. kostentraeger bekommt einen optionalen Kundenbezug (b2b_kunde_id) -
--      bisher liess sich nur nach Reihenblock/Sorte/Erntetag zuordnen, nicht
--      nach Kunde, wie die Anforderung es verlangt.
--   2. Insert-/Update-Policies fuer kostentraeger, Insert-Policy fuer
--      finance_ledger_entries - ausschliesslich Buero-Rollen (admin,
--      betriebsleitung*, buchhaltung). *betriebsleitung darf laut rbac.ts nur
--      lesen (view, kein create) - die RLS-Policy ist bewusst enger als
--      has_office_access() und laesst betriebsleitung hier aussen vor, damit
--      Anwendung und Datenbank uebereinstimmen.
--   3. finance_ledger_entries bleibt unveraendert append-only (Trigger
--      trg_ledger_no_update/-delete aus dem initialen Schema greift
--      unabhaengig von RLS weiter) - eine Korrektur ist nur als Gegenbuchung
--      moeglich, wie bei Anforderung 4.1 verlangt.
--   4. Eine Deckungsbeitrag-View je Kostentraeger (Vorgriff auf 4.3, P1) -
--      dieselbe Rechenarbeit-in-der-Datenbank-Philosophie wie
--      public.kpi_aktuell() und public.kuehlkette_bewerten(). security_invoker
--      sorgt dafuer, dass die RLS der Basistabellen (nur Buero-Rollen) auch
--      ueber die View hindurch gilt, nicht die Rechte des View-Eigentuemers.
-- =============================================================================

set search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Kundenbezug am Kostentraeger
-- ---------------------------------------------------------------------------
alter table public.kostentraeger
  add column if not exists b2b_kunde_id uuid references public.b2b_kunden(id) on delete set null;
create index if not exists idx_kostentraeger_kunde on public.kostentraeger(b2b_kunde_id);

comment on table public.kostentraeger is
  'Kostentraeger je Reihenblock, Sorte, Erntetag und optional Kunde (Anforderung 4.2). '
  'Kostenstelle bleibt der Reihenblock, Kostentraeger im engeren Sinn ist die '
  'Sorte-Kunde-Kombination.';

-- ---------------------------------------------------------------------------
-- 2. Schreibrechte
-- ---------------------------------------------------------------------------
create policy kostentraeger_insert_buero on public.kostentraeger
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

create policy kostentraeger_update_buero on public.kostentraeger
  for update to authenticated
  using (public.has_role('admin', 'buchhaltung'))
  with check (public.has_role('admin', 'buchhaltung'));

create policy finance_ledger_entries_insert_buero on public.finance_ledger_entries
  for insert to authenticated
  with check (public.has_role('admin', 'buchhaltung'));

-- ---------------------------------------------------------------------------
-- 3. Deckungsbeitrag je Kostentraeger
-- ---------------------------------------------------------------------------
create view public.deckungsbeitrag_je_kostentraeger
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
  count(fle.id)                                                             as buchungen
from public.kostentraeger kt
left join public.reihenbloecke rb on rb.id = kt.reihenblock_id
left join public.sorten s on s.id = kt.sorte_id
left join public.b2b_kunden bk on bk.id = kt.b2b_kunde_id
left join public.finance_ledger_entries fle on fle.kostentraeger_id = kt.id
group by kt.id, kt.bezeichnung, kt.erntetag, rb.code, s.name, bk.name;

comment on view public.deckungsbeitrag_je_kostentraeger is
  'Erloes minus Kosten je Kostentraeger, aus dem unveraenderlichen Ledger gerechnet '
  '(Anforderung 4.3, hier als Vorgriff mitgebaut - dieselbe Tabelle traegt beide '
  'Anforderungen). security_invoker: RLS der Basistabellen gilt unveraendert, die '
  'View selbst vergibt keine zusaetzlichen Rechte.';

-- Views brauchen ein eigenes GRANT, RLS der Basistabellen reicht nicht.
grant select on public.deckungsbeitrag_je_kostentraeger to authenticated;
