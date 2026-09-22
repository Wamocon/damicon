-- =============================================================================
-- Damicon - Achte Rolle: ceo (1/2, nur der Enum-Wert)
-- =============================================================================
-- Weicht bewusst von "Anforderung 7.1 aus dem Masterplan (P0): Rollenmodell mit
-- sieben Rollen" ab (siehe Kommentare in src/lib/rbac.ts und src/lib/auth.ts,
-- sowie die Einfuehrung von "picker" in Migration 20260909010000_picker_rolle.sql,
-- die genau diese Anforderung zitiert). Diese Abweichung ist Teil des Auftrags
-- und gehoert in die PR-Beschreibung, nicht stillschweigend in den Code.
--
-- Bewusst eine eigene Migration, nur mit dieser einen Anweisung: ein frisch per
-- ALTER TYPE ... ADD VALUE angelegter Enum-Wert darf innerhalb DERSELBEN
-- Transaktion nirgends verwendet werden - auch nicht als String-Literal im
-- Rumpf einer in derselben Datei neu angelegten Funktion. Jede Migrationsdatei
-- laeuft hier als ein exec()/eine Transaktion (siehe supabase/tests/
-- pglite-fast.mjs); die Rechteerweiterung, die 'ceo' tatsaechlich verwendet,
-- steht deshalb in der naechsten Migration (20261108010000_ceo_rechte.sql).
-- =============================================================================

set search_path = public;

alter type public.app_role add value if not exists 'ceo' after 'admin';
