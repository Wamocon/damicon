-- =============================================================================
-- Damicon - Beispieldaten fuer Deckungsbeitrag je Charge (Anforderung 3.3)
-- =============================================================================
-- finance_ledger_entries ist append-only UND unloeschbar (block_ledger_
-- mutation(), siehe auch die Datenkorrektur in Migration 20260920010000 nach
-- dem Anforderung-4.3-Zwischenfall). Ein Integrationstest darf hier deshalb
-- keine eigenen Buchungen mehr anlegen. Statt eines Test-Seiteneffekts daher
-- hier: ein einmaliges, dauerhaft sichtbares Beispiel, ergaenzend zu den vier
-- Kostentraegern aus 20260909000000_finanzen_schreibrechte.sql (Abschnitt
-- "Finanzen: Kostentraeger + Ledger" in seed.sql) - zeigt eine Buchung, die
-- direkt an einer Charge statt (nur) an einem Kostentraeger haengt.
-- reihenblock_id bleibt bewusst null (wie ein Zukauf-Fall) statt eines
-- bestehenden Reihenblocks - vermeidet jeden Konflikt mit der Unique-
-- Constraint auf (reihenblock_id, sorte_id, ernte_datum) bereits vorhandener
-- Chargen, ganz ohne eine konkrete Datums-/Block-Kollision ausschliessen zu
-- muessen. Idempotent ueber den eindeutigen Charge-Code, damit ein erneutes
-- db push nichts verdoppelt.
-- =============================================================================

set search_path = public;

do $$
declare
  v_sorte_id uuid;
  v_charge_id uuid;
begin
  if exists (select 1 from public.chargen where code = 'CH-BEISPIEL-JE-CHARGE') then
    return;
  end if;

  select id into v_sorte_id from public.sorten order by name limit 1;
  if v_sorte_id is null then
    return;
  end if;

  insert into public.chargen (code, reihenblock_id, sorte_id, ernte_datum)
  values ('CH-BEISPIEL-JE-CHARGE', null, v_sorte_id, '2026-08-28')
  returning id into v_charge_id;

  insert into public.finance_ledger_entries (charge_id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung)
  values
    (v_charge_id, 'erloes', 'B2B-Verkauf', 20000, '2026-08-28', 'Beispiel Anforderung 3.3 - direkt an der Charge gebucht'),
    (v_charge_id, 'kosten', 'Ernte + Kuehlung', 8000, '2026-08-28', 'Beispiel Anforderung 3.3 - direkt an der Charge gebucht');
end;
$$;
