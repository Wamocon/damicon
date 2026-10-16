-- Nimmt die Testdaten aus den Migrationen 20261209* wieder zurück (Hilfsskript, KEINE Migration).
--
-- Die Testdaten tragen die feste Kennung 7e57da7a-0000-4000-8000-... Dieses Skript löscht genau diese Zeilen und kehrt die Folgen zurück,
-- die ihr Einfügen im übrigen Bestand hatte (verbrauchte Rotationsplan-Einträge, reservierte Kontingente, Gültigkeit der Preislisten).
--
-- Aufruf lokal:   docker exec -i supabase_db_damicon psql -U postgres -v ON_ERROR_STOP=1 -1 < supabase/testdaten-entfernen.sql
-- Aufruf Cloud:   NICHT von Hand. Eine Rücknahme gehört wie jede Datenänderung in eine Migrationsdatei (Projektregel), die den Inhalt dieses
--                 Skripts übernimmt. Mehrere Journale sind unveränderlich (Buchungen, Kühl- und Transportmessungen, Meldeverlauf, Nachrichten,
--                 Stände): Das Skript schaltet für die Dauer des Löschens ihre Sperrtrigger ab und danach wieder ein.
--
-- Bewusst NICHT zurückgenommen, weil sie Zeilen ohne Kennung betreffen oder von selbst nachgerechnet werden:
--   * Ergänzungen an bestehenden Stammdaten (Kunden, Nachbarbetriebe, Kontaktkanäle, Gültigkeit vorhandener Dokumente, Fristen der Förderdossiers),
--   * Brigaden-Zuweisung und "übersprungen" im Rotationsplan,
--   * Benachrichtigungen (der stündliche Lauf erzeugt sie aus dem Stand der Daten neu) und Punkte in kpi_verlauf,
--   * die Weiterschreibung von Reihenblöcken (letzte_ernte).
--
-- Reihenfolge von hinten nach vorn, damit kein Fremdschlüssel im Weg steht.

alter table public.finance_ledger_entries disable trigger trg_ledger_no_delete;
alter table public.finance_ledger_entries disable trigger trg_ledger_no_update;
alter table public.kuehlketten_messungen disable trigger trg_kuehlmessung_no_delete;
alter table public.transport_temperatur_messungen disable trigger trg_transport_messung_no_delete;
alter table public.wirtschaftlichkeit_staende disable trigger trg_wirtschaftlichkeit_staende_unveraenderlich;
alter table public.vorbestellung_nachrichten disable trigger trg_vorbestellung_nachricht_unveraenderlich;
alter table public.esutd_meldeverlauf disable trigger trg_esutd_meldeverlauf_unveraenderlich;
alter table public.abholstopps disable trigger trg_abholstopp_pruefen;
alter table public.abholrunden disable trigger trg_abholrunde_pruefen;

-- Buchungen (auch die, die nur an einer Testcharge hängen)
delete from public.finance_ledger_entries
 where id::text like '7e57da7a-0000-4000-8000-%'
    or charge_id in (select c.id from public.chargen c where c.pflueckaufgabe_id::text like '7e57da7a-0000-4000-8000-%')
    or kostentraeger_id::text like '7e57da7a-0000-4000-8000-%';
delete from public.kostentraeger where id::text like '7e57da7a-0000-4000-8000-%';

-- Nachweise, Behörden
delete from public.foerder_checkpunkte where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.esf_belege where id::text like '7e57da7a-0000-4000-8000-%'
    or lieferung_id::text like '7e57da7a-0000-4000-8000-%';
delete from public.esutd_meldeverlauf where vertrag_id::text like '7e57da7a-0000-4000-8000-%';
delete from public.esutd_ereignisse where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.esutd_vertraege where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.dokumente where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.kontaktkanaele where id::text like '7e57da7a-0000-4000-8000-%';

-- Vorbestellungen: bestätigte geben ihre Reservierung im Kontingent zurück
update public.kontingente k
   set reserviert_kg = greatest(0, k.reserviert_kg - x.menge)
  from (select v.b2b_kunde_id, v.sorte_id, sum(v.menge_kg) as menge
          from public.vorbestellungen v
         where v.id::text like '7e57da7a-0000-4000-8000-%' and v.status = 'bestaetigt'
         group by v.b2b_kunde_id, v.sorte_id) x
 where k.b2b_kunde_id = x.b2b_kunde_id and k.sorte_id = x.sorte_id;
delete from public.vorbestellung_nachrichten where id::text like '7e57da7a-0000-4000-8000-%';

-- Markt und Auslieferung
alter table public.reklamation_ereignisse disable trigger trg_reklamation_ereignisse_no_delete;
delete from public.reklamation_ereignisse where id::text like '7e57da7a-0000-4000-8000-%' or reklamation_id::text like '7e57da7a-0000-4000-8000-%';
alter table public.reklamation_ereignisse enable trigger trg_reklamation_ereignisse_no_delete;
delete from public.reklamationen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.transport_temperatur_messungen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.lieferungen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.vorbestellungen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.touren where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.zukauf_positionen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.abholstopps where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.abholrunden where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.preislisten where id::text like '7e57da7a-0000-4000-8000-%';
update public.preislisten set gueltig_bis = null
 where name in ('Preisliste Herbst 2026', 'Preisliste Herbst 2026 - Handel') and gueltig_bis = date '2026-10-31';

-- Ernte: erst die Rotationsplan-Einträge freigeben, die eine Testaufgabe verbraucht hat
update public.rotationsplan_eintraege
   set status = 'geplant', pflueckaufgabe_id = null
 where pflueckaufgabe_id::text like '7e57da7a-0000-4000-8000-%';
delete from public.kuehlketten_messungen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.arbeitszeiten where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.steigen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.chargen where pflueckaufgabe_id::text like '7e57da7a-0000-4000-8000-%';
delete from public.pflueckaufgaben where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.einarbeitung_fortschritt where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.pfluecker where id::text like '7e57da7a-0000-4000-8000-%';

-- Wetter, Wirtschaftlichkeit
delete from public.wetter_messungen where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.wirtschaftlichkeit_staende where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.wirtschaftlichkeit_ist where id::text like '7e57da7a-0000-4000-8000-%';
delete from public.wirtschaftlichkeit_posten where id::text like '7e57da7a-0000-4000-8000-%';
update public.wirtschaftlichkeit_annahmen
   set vermarktete_menge_kg = null, echtbetrieb_beginn = null
 where id = 1 and vermarktete_menge_kg = 350000 and echtbetrieb_beginn = date '2026-09-01';

-- Der ЕСУТД-Status der Pflücker ohne Verträge fällt auf den Ausgangswert zurück
update public.pfluecker p
   set esutd = 'offen'
 where not exists (select 1 from public.esutd_vertraege v where v.pfluecker_id = p.id)
   and p.ausweis in ('MAL-0421', 'MAL-0441');

alter table public.finance_ledger_entries enable trigger trg_ledger_no_delete;
alter table public.finance_ledger_entries enable trigger trg_ledger_no_update;
alter table public.kuehlketten_messungen enable trigger trg_kuehlmessung_no_delete;
alter table public.transport_temperatur_messungen enable trigger trg_transport_messung_no_delete;
alter table public.wirtschaftlichkeit_staende enable trigger trg_wirtschaftlichkeit_staende_unveraenderlich;
alter table public.vorbestellung_nachrichten enable trigger trg_vorbestellung_nachricht_unveraenderlich;
alter table public.esutd_meldeverlauf enable trigger trg_esutd_meldeverlauf_unveraenderlich;
alter table public.abholstopps enable trigger trg_abholstopp_pruefen;
alter table public.abholrunden enable trigger trg_abholrunde_pruefen;
