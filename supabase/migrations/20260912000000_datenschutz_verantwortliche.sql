-- =============================================================================
-- Damicon - Benannte Verantwortliche im Compliance-Cockpit (Anforderung 4.8)
-- =============================================================================
-- 20260908000000_datenschutz_granular.sql baute Zweckverzeichnis, Einwilligung,
-- Zugriffsprotokoll, Vorfaelle und Drittweitergaben - aber keine Stelle im
-- Datenmodell benennt, WER fuer einen Verarbeitungszweck bzw. einen Vorfall
-- verantwortlich ist. Der Masterplan verlangt genau das: "Einwilligungs-
-- verwaltung, Speicherfristen, benannte Verantwortliche". Diese Migration
-- ergaenzt eine verantwortliche Person je Verarbeitungszweck (wer beantwortet
-- Rueckfragen zu diesem Zweck) und je Datenschutzvorfall (wer bearbeitet
-- diesen konkreten Fall) - beides mit Bezug auf ein Profil, nicht auf einen
-- Freitext-Namen, damit die Referenz stabil bleibt.
--
-- Bewusst NICHT NOT NULL: seed.sql legt Verarbeitungszwecke und Vorfaelle an,
-- bevor die Demo-Profile ueberhaupt existieren (die entstehen erst durch die
-- Auth-Anmeldung in seed-auth.mjs, das NACH seed.sql laeuft) - eine
-- Fremdschluessel-Pflicht liesse sich zu diesem Zeitpunkt gar nicht erfuellen.
-- Stattdessen erzwingt die Anwendungsebene das Feld bei neu erfassten
-- Vorfaellen (vorfallErfassen() in lib/actions/compliance.ts), und
-- seed-auth.mjs traegt die verantwortliche Person fuer die Seed-Datensaetze
-- nach, sobald die Profile existieren - derselbe Nachtrags-Ablauf wie bei
-- brigade_id/b2b_kunde_id/pfluecker_id in derselben Datei.
-- =============================================================================

set search_path = public;

alter table public.verarbeitungszwecke
  add column if not exists verantwortlich_profil_id uuid references public.profiles(id) on delete set null;

comment on column public.verarbeitungszwecke.verantwortlich_profil_id is
  'Anforderung 4.8: benannte verantwortliche Person fuer Rueckfragen zu diesem Verarbeitungszweck. Nullable aus Seed-Reihenfolge (siehe Migrationskommentar) - Anwendungsebene erzwingt das Feld bei neuen Zwecken.';

alter table public.datenschutzvorfaelle
  add column if not exists verantwortlich_profil_id uuid references public.profiles(id) on delete set null;

comment on column public.datenschutzvorfaelle.verantwortlich_profil_id is
  'Anforderung 4.8: benannte verantwortliche Person fuer die Bearbeitung dieses Vorfalls. Nullable aus Seed-Reihenfolge (siehe Migrationskommentar) - vorfallErfassen() in lib/actions/compliance.ts erzwingt das Feld bei neu erfassten Vorfaellen.';
