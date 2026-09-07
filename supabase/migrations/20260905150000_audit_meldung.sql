-- =============================================================================
-- Damicon - Korrektur der Sperrmeldung fuer Append-only-Tabellen
-- =============================================================================
-- public.block_ledger_mutation() schuetzt sowohl finance_ledger_entries als
-- auch audit_events. Die Meldung nannte bisher immer das Finanzjournal, auch
-- wenn ein Loeschversuch am Audit-Protokoll scheiterte.
-- =============================================================================

set search_path = public;

create or replace function public.block_ledger_mutation()
returns trigger
language plpgsql
as $$
begin
  raise exception '%.% ist unveraenderlich (append-only). % nicht erlaubt.',
    tg_table_schema, tg_table_name, tg_op;
end;
$$;
