-- =============================================================================
-- Damicon - Preislisten: netto oder brutto (15.10.2026)
-- =============================================================================
-- Entscheidung: Die Vorgabe ist netto. Die ЭСФ führt den Wert "ohne indirekte Steuern" und rechnet Satz und Betrag dazu (Erlass des Finanzministers Nr. 629
-- vom 28.10.2025, Anlage 2), für Preislisten im B2B gibt es keine Norm, die netto oder brutto vorschreibt (docs/ENTSCHEIDUNGSGRUNDLAGEN.md). Wer seine Preise
-- brutto führt, kennzeichnet die Liste, und die ЭСФ teilt dann den Gesamtbetrag durch 1 plus Satz.
--
-- Die Angabe gilt für die ganze Liste: sie wird beim Anlegen gesetzt und ändert sich nicht (die Anwendung bietet keinen Weg, und eine Umstellung bestehender
-- Listen würde jedem Preis eine andere Bedeutung geben). Alle vorhandenen Listen bleiben netto. Keine Datenänderung.
-- =============================================================================

set search_path = public;

alter table public.preislisten
  add column if not exists preise_inkl_mwst boolean not null default false;

comment on column public.preislisten.preise_inkl_mwst is
  'true: die Preise der Liste enthalten die MwSt (brutto). false: netto (Vorgabe). Die ЭСФ rechnet immer netto plus Satz.';
