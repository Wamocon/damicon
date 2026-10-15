-- =============================================================================
-- Damicon - Trigramm-Indizes für die globale Datensuche (15.10.2026)
-- =============================================================================
-- search_everything() (WMCNL-1467) sucht mit ILIKE '%text%'. Ein führendes Prozentzeichen nutzt keinen gewöhnlichen Index, bei wachsenden Tabellen läse
-- jede Suche jede Zeile. Ein GIN-Index mit Trigrammen (pg_trgm) bedient genau dieses Muster, ohne dass sich die Treffer oder die Rangfolge ändern.
--
--   * Indiziert sind die Spalten, die die Suche durchsucht: Code der Steigen, Chargen, Pflückaufgaben und Reihenblöcke, Name und Ausweis der Pflücker,
--     Name und Bezug der Dokumente, Name der B2B-Kunden.
--   * Wo die Erweiterung fehlt (die schnellen Tests mit PGlite), bleibt die Migration ohne Wirkung. Das ist gewollt: nur die Geschwindigkeit hängt am Index,
--     nie das Ergebnis. Auf der Supabase-Datenbank gibt es die Erweiterung, die Meldung im Lauf zeigt, falls doch nicht.
--
-- Keine Datenänderung.
-- =============================================================================

set search_path = public;

do $$
begin
  begin
    create extension if not exists pg_trgm with schema extensions;
  exception when others then
    raise notice 'pg_trgm nicht verfuegbar (%): ohne Trigramm-Index bleibt die Suche richtig, wird bei grossen Tabellen aber langsamer.', sqlerrm;
    return;
  end;

  create index if not exists idx_steigen_code_trgm on public.steigen using gin (code extensions.gin_trgm_ops);
  create index if not exists idx_chargen_code_trgm on public.chargen using gin (code extensions.gin_trgm_ops);
  create index if not exists idx_pflueckaufgaben_code_trgm on public.pflueckaufgaben using gin (code extensions.gin_trgm_ops);
  create index if not exists idx_pfluecker_name_trgm on public.pfluecker using gin (name extensions.gin_trgm_ops);
  create index if not exists idx_pfluecker_ausweis_trgm on public.pfluecker using gin (ausweis extensions.gin_trgm_ops);
  create index if not exists idx_reihenbloecke_code_trgm on public.reihenbloecke using gin (code extensions.gin_trgm_ops);
  create index if not exists idx_dokumente_name_trgm on public.dokumente using gin (name extensions.gin_trgm_ops);
  create index if not exists idx_dokumente_bezug_trgm on public.dokumente using gin (bezug extensions.gin_trgm_ops);
  create index if not exists idx_b2b_kunden_name_trgm on public.b2b_kunden using gin (name extensions.gin_trgm_ops);
end;
$$;
