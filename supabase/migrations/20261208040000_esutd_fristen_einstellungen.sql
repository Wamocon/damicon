-- =============================================================================
-- Damicon - ЕСУТД: Fristen aus den Einstellungen, für Abschluss, Änderung und Beendigung (15.10.2026)
-- =============================================================================
-- Grundlage: Erlass des Arbeitsministers Nr. 353 vom 03.09.2020 (docs/ENTSCHEIDUNGSGRUNDLAGEN.md):
--   * neuer Vertrag: 5 Arbeitstage nach Unterschrift beider Seiten,
--   * Änderung: 15 Kalendertage,
--   * Beendigung: 3 Arbeitstage.
-- Die Tage stehen in betriebs_einstellungen (esutd.frist_abschluss_tage, esutd.frist_aenderung_tage, esutd.frist_beendigung_tage) und sind in der
-- Oberfläche pflegbar. Ist eine Einstellung nicht gesetzt (null), gibt es für diese Art keine Frist, statt dass ein Wert erfunden wird.
--
-- Neu: esutd_vertraege.unterzeichnet_am. Die Frist des Abschlusses beginnt mit der Unterschrift, nicht mit dem Vertragsbeginn. Ist sie nicht
-- erfasst, gilt wie bisher der Vertragsbeginn. Samstag und Sonntag zählen nicht, einen Feiertagskalender gibt es weiter nicht.
-- Die Sicht esutd_vertraege_mit_frist behält ihre Spalten, v_esutd_meldungen liefert jetzt auch für offene Änderungen und Beendigungen die Frist.
-- Keine Datenänderung.
-- =============================================================================

set search_path = public;

alter table public.esutd_vertraege
  add column if not exists unterzeichnet_am date;

comment on column public.esutd_vertraege.unterzeichnet_am is
  'Tag der Unterschrift beider Seiten. Ab hier läuft die Meldefrist des Abschlusses. Leer: es gilt vertrag_beginn_am.';

create or replace view public.esutd_vertraege_mit_frist
with (security_invoker = true)
as
select
  e.id,
  e.pfluecker_id,
  e.vertragsnummer,
  e.erfasst_am,
  e.status,
  e.outbox_id,
  e.created_at,
  e.vertrag_beginn_am,
  case
    when e.status = 'offen'
         and coalesce(e.unterzeichnet_am, e.vertrag_beginn_am) is not null
         and public.einstellung_zahl('esutd.frist_abschluss_tage') is not null
      then public.werktage_addieren(coalesce(e.unterzeichnet_am, e.vertrag_beginn_am), public.einstellung_zahl('esutd.frist_abschluss_tage')::integer)
  end as meldefrist_am
from public.esutd_vertraege e;

comment on view public.esutd_vertraege_mit_frist is
  'esutd_vertraege plus die berechnete Meldefrist des Abschlusses (nur bei offenem Status): Arbeitstage nach Unterschrift oder Vertragsbeginn, Tage aus der Einstellung esutd.frist_abschluss_tage.';

create or replace view public.v_esutd_meldungen
with (security_invoker = true) as
select
  'vertrag'::text                                   as quelle,
  v.id,
  v.pfluecker_id,
  p.name                                            as pfluecker_name,
  p.ausweis                                         as pfluecker_ausweis,
  'abschluss'::text                                 as art,
  v.vertrag_beginn_am                               as ereignis_am,
  null::text                                        as beschreibung,
  v.vertragsnummer,
  v.status::text                                    as status,
  v.erfasst_am,
  v.bestaetigung,
  v.beleg_dokument_id,
  f.meldefrist_am,
  v.created_at
from public.esutd_vertraege v
join public.esutd_vertraege_mit_frist f on f.id = v.id
left join public.pfluecker p on p.id = v.pfluecker_id
union all
select
  'ereignis'::text,
  e.id,
  v.pfluecker_id,
  p.name,
  p.ausweis,
  e.art,
  e.ereignis_am,
  e.beschreibung,
  v.vertragsnummer,
  e.status,
  e.erfasst_am,
  e.bestaetigung,
  e.beleg_dokument_id,
  case
    when e.status <> 'offen' then null::date
    when e.art = 'aenderung' and public.einstellung_zahl('esutd.frist_aenderung_tage') is not null
      then e.ereignis_am + public.einstellung_zahl('esutd.frist_aenderung_tage')::integer
    when e.art = 'beendigung' and public.einstellung_zahl('esutd.frist_beendigung_tage') is not null
      then public.werktage_addieren(e.ereignis_am, public.einstellung_zahl('esutd.frist_beendigung_tage')::integer)
    else null::date
  end,
  e.created_at
from public.esutd_ereignisse e
join public.esutd_vertraege v on v.id = e.vertrag_id
left join public.pfluecker p on p.id = v.pfluecker_id;

comment on view public.v_esutd_meldungen is
  'Abschluss, Aenderung und Beendigung der Saisonvertraege als eine Liste (WMCNL-1447). Die Meldefrist der offenen Meldungen kommt aus den Einstellungen esutd.frist_*.';
