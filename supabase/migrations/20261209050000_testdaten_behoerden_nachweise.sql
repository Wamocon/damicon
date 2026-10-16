-- Testdaten Behörden und Nachweise (Datenänderung, idempotent).
--
--   ЭСФ        Belege zu allen zugestellten Lieferungen ohne Beleg, nach Alter der Lieferung gestaffelt (Stichtag 16.10.2026):
--              ältere Lieferungen sind bestätigt, wenige ausgestellt, abgelehnt oder auf Papier geführt, drei bleiben als Entwurf
--              liegen und sind überfällig (Frist 15 Kalendertage). Jüngere Lieferungen haben einen Entwurf oder noch keinen Beleg.
--   ЕСУТД      Ein Arbeitsvertrag je Pflücker (15). Zwölf sind gemeldet, drei offen (einer überfällig, zwei in Frist). Dazu eine gemeldete
--              und eine offene Änderung (in Frist) sowie eine offene Beendigung, die überfällig ist.
--   Förderung  Checkpunkte zu den Dossiers (Antragsformular bis Zahlungsbelege) mit Fristen.
--   Nachweise  Gültigkeit der vorhandenen Dokumente, zehn weitere Nachweise (Zertifikate, Verträge, Vereinbarungen) und eine Version.
--
-- Ein Beleg entsteht wie in der Anwendung: erst als Entwurf mit Standbild der Lieferung, dann Statuswechsel. Die Einreihung in die
-- Auslieferungswarteschlange wird für diese Anweisungen abgeschaltet, sonst entstünden über hundert wartende Ereignisse mit dem
-- Zeitpunkt der Migration. Die Warteschlange füllt die Migration "Testdaten Planung" gezielt.
--
-- Schutz: Belege nur, wenn der Betrieb nicht MwSt-registriert ist (der Entwurf rechnet sonst mit Satz); Verträge und Checkpunkte nur,
-- wo es noch keine gibt. Kennung 7e57da7a-0000-4000-8000-... Zum Zurücknehmen siehe supabase/testdaten-entfernen.sql.

-- ------------------------------------------------------------------------------------------------------------------------------
-- ЭСФ-Belege
-- ------------------------------------------------------------------------------------------------------------------------------
create temp table _esf as
with basis as (
  select l.id as lieferung_id, l.menge_kg, (l.geliefert_am at time zone 'Asia/Almaty')::date as liefertag,
         k.name as kunde, k.identifikationsnummer as bin, k.rechtsform::text as rechtsform, k.kundengruppe,
         c.code as charge_code, s.id as sorte_id, s.name as sorte
    from public.lieferungen l
    join public.b2b_kunden k on k.id = l.b2b_kunde_id
    left join public.chargen c on c.id = l.charge_id
    left join public.vorbestellungen v on v.id = l.vorbestellung_id
    left join public.sorten s on s.id = coalesce(c.sorte_id, v.sorte_id)
   where l.status = 'zugestellt' and l.geliefert_am is not null
     and not exists (select 1 from public.esf_belege b where b.lieferung_id = l.id)
     and not coalesce((select m.mwst_registriert from public.betriebe_mwst_status m limit 1), false)
), mit_preis as (
  select b.*, pr.preis
    from basis b
    left join lateral (
      select pp.preis_tenge_kg as preis
        from public.preislisten pl
        join public.preislisten_positionen pp on pp.preisliste_id = pl.id
       where pl.aktiv and (pl.kundengruppe is not distinct from b.kundengruppe or pl.kundengruppe is null) and pp.sorte_id = b.sorte_id
         and pl.gueltig_ab <= b.liefertag and (pl.gueltig_bis is null or pl.gueltig_bis >= b.liefertag) and pp.min_menge_kg <= b.menge_kg
       order by (pl.kundengruppe is not null) desc, pl.gueltig_ab desc, pp.min_menge_kg desc
       limit 1
    ) pr on true
), plan as (
  select m.*, date '2026-10-16' - m.liefertag as alter_tage,
         (abs(hashtext('esf:' || m.lieferung_id))::numeric % 1000) / 1000.0 as u,
         (abs(hashtext('esf2:' || m.lieferung_id))::numeric % 1000) / 1000.0 as u2
    from mit_preis m
), ziel as (
  select p.*,
         case
           when p.alter_tage > 15 then
             case when p.u < 0.03 then 'entwurf' when p.u < 0.07 then 'papier' when p.u < 0.11 then 'abgelehnt'
                  when p.u < 0.20 then 'ausgestellt' else 'bestaetigt' end
           when p.alter_tage > 7 then
             case when p.u < 0.30 then 'entwurf' when p.u < 0.45 then 'keiner' when p.u < 0.70 then 'ausgestellt' else 'bestaetigt' end
           else
             case when p.u < 0.45 then 'entwurf' else 'keiner' end
         end as ziel
    from plan p
)
select z.*,
       row_number() over (order by z.liefertag, z.lieferung_id) as rn,
       case when z.ziel in ('ausgestellt', 'bestaetigt', 'abgelehnt')
            then row_number() over (partition by (z.ziel in ('ausgestellt', 'bestaetigt', 'abgelehnt')) order by z.liefertag, z.lieferung_id) end as nummer_lfd
  from ziel z;

insert into public.esf_belege (id, lieferung_id, status, entwurf, created_at)
select ('7e57da7a-0000-4000-8000-80' || lpad(e.rn::text, 4, '0') || '000000')::uuid, e.lieferung_id, 'entwurf',
       jsonb_build_object(
         'version', 1,
         'stichtag', e.liefertag,
         'kunde', jsonb_build_object('name', e.kunde, 'identifikationsnummer', e.bin, 'rechtsform', e.rechtsform),
         'ware', jsonb_build_object('sorte', e.sorte, 'chargeCode', e.charge_code, 'mengeKg', e.menge_kg,
                                    'preisTengeKg', e.preis, 'betragTenge', round(e.preis * e.menge_kg, 2)),
         'mwst', jsonb_build_object('registriert', false, 'prozent', null, 'betragTenge', null,
                                    'gesamtTenge', round(e.preis * e.menge_kg, 2), 'annahme', 'netto'),
         'luecken', to_jsonb(array_remove(array[
           case when e.sorte is null then 'sorte' end,
           case when e.preis is null then 'preis' end,
           case when e.bin is null then 'identifikationsnummer' end], null))),
       ((e.liefertag + 1) + time '10:00') at time zone 'Asia/Almaty'
  from _esf e
 where e.ziel <> 'keiner'
on conflict (id) do nothing;

alter table public.esf_belege disable trigger trg_esf_beleg_einreihen;

update public.esf_belege b
   set status = 'ausgestellt',
       esf_nummer = 'ESF-2026-' || lpad((240100 + e.nummer_lfd)::text, 6, '0'),
       ausgestellt_am = e.liefertag + 1 + floor(e.u2 * 3)::integer
  from _esf e
 where b.lieferung_id = e.lieferung_id and b.status = 'entwurf' and e.ziel in ('ausgestellt', 'bestaetigt', 'abgelehnt');

update public.esf_belege b
   set status = 'bestaetigt', bestaetigt_am = b.ausgestellt_am + 1 + floor(e.u * 2)::integer
  from _esf e
 where b.lieferung_id = e.lieferung_id and b.status = 'ausgestellt' and e.ziel = 'bestaetigt';

update public.esf_belege b
   set status = 'abgelehnt', bemerkung = 'Vom Kunden abgelehnt: Die BIN auf der Rechnung stimmte nicht mit dem Vertrag überein. Neue ЭСФ nach Klärung.'
  from _esf e
 where b.lieferung_id = e.lieferung_id and b.status = 'ausgestellt' and e.ziel = 'abgelehnt';

update public.esf_belege b
   set status = 'papier', bemerkung = 'Kunde ohne Zugang zum ISESF, Rechnung und Warenbegleitschein auf Papier übergeben.'
  from _esf e
 where b.lieferung_id = e.lieferung_id and b.status = 'entwurf' and e.ziel = 'papier';

alter table public.esf_belege enable trigger trg_esf_beleg_einreihen;

-- ------------------------------------------------------------------------------------------------------------------------------
-- ЕСУТД: Arbeitsverträge der Saisonkräfte
-- ------------------------------------------------------------------------------------------------------------------------------
-- Ein Vertrag je Pflücker (ohne die TEST-Konten). Gemeldet (erfasst) am Werktag nach dem Beginn, innerhalb der Frist von fünf Arbeitstagen.
-- Offen sind drei Verträge: MAL-0421 (Beginn 05.10., unterzeichnet 02.10., Frist 09.10., überfällig), MAL-0441 (Beginn 12.10., in Frist bis
-- 19.10.) und MAL-0447 (Beginn 12.10., in Frist). Die Quittungsnummer ist abgeleitet, nicht echt.
insert into public.esutd_vertraege (id, pfluecker_id, vertragsnummer, erfasst_am, status, vertrag_beginn_am, bestaetigung, unterzeichnet_am)
select ('7e57da7a-0000-4000-8000-81' || lpad(v.nr::text, 4, '0') || '000000')::uuid, p.id, 'AV-2026-' || substr(v.ausweis, 7),
       case when v.status = 'erfasst' then v.erfasst end, v.status::public.esutd_status, v.beginn,
       case when v.status = 'erfasst' then 'Quittung enbek.kz vom ' || to_char(v.erfasst, 'DD.MM.YYYY') || ', Nr. ' || (4400000 + abs(hashtext(v.ausweis)) % 100000) end,
       v.unterzeichnet
  from (values
    (1,  'MAL-0405', date '2026-06-15', date '2026-06-12', date '2026-06-16', 'erfasst'),
    (2,  'MAL-0409', date '2026-06-15', date '2026-06-12', date '2026-06-16', 'erfasst'),
    (3,  'MAL-0412', date '2026-06-22', date '2026-06-19', date '2026-06-23', 'erfasst'),
    (4,  'MAL-0415', date '2026-06-22', date '2026-06-19', date '2026-06-23', 'erfasst'),
    (5,  'MAL-0417', date '2026-07-06', date '2026-07-03', date '2026-07-07', 'erfasst'),
    (6,  'MAL-0418', date '2026-07-13', date '2026-07-10', date '2026-07-14', 'erfasst'),
    (7,  'MAL-0426', date '2026-07-20', date '2026-07-17', date '2026-07-21', 'erfasst'),
    (8,  'MAL-0430', date '2026-08-03', date '2026-07-31', date '2026-08-04', 'erfasst'),
    (9,  'MAL-0433', date '2026-08-03', date '2026-07-31', date '2026-08-04', 'erfasst'),
    (10, 'MAL-0436', date '2026-08-03', date '2026-07-31', date '2026-08-04', 'erfasst'),
    (11, 'MAL-0438', date '2026-08-10', date '2026-08-07', date '2026-08-11', 'erfasst'),
    (12, 'MAL-0443', date '2026-08-17', date '2026-08-14', date '2026-08-18', 'erfasst'),
    (13, 'MAL-0421', date '2026-10-05', date '2026-10-02', null::date,        'offen'),
    (14, 'MAL-0441', date '2026-10-12', date '2026-10-12', null,               'offen'),
    (15, 'MAL-0447', date '2026-10-12', date '2026-10-12', null,               'offen')
  ) as v(nr, ausweis, beginn, unterzeichnet, erfasst, status)
  join public.pfluecker p on p.ausweis = v.ausweis
 where not exists (select 1 from public.esutd_vertraege x where x.pfluecker_id = p.id)
on conflict (id) do nothing;

-- Änderungen und Beendigung. Die erfasste Änderung entsteht offen und wird dann gemeldet, damit der Meldeverlauf einen Eintrag trägt.
insert into public.esutd_ereignisse (id, vertrag_id, art, ereignis_am, beschreibung, status)
select ('7e57da7a-0000-4000-8000-82' || lpad(v.nr::text, 4, '0') || '000000')::uuid, vt.id, v.art, v.ereignis_am, v.beschreibung, 'offen'
  from (values
    (1, 'MAL-0417', 'aenderung',  date '2026-10-08', 'Vergütungssatz je kg ab 08.10.2026 angepasst (900 statt 850 Tenge).'),
    (2, 'MAL-0430', 'beendigung', date '2026-10-09', 'Vertrag auf Wunsch der Arbeitnehmerin zum 09.10.2026 beendet, Saisonende der Brigade.'),
    (3, 'MAL-0418', 'aenderung',  date '2026-09-01', 'Einsatzort von Plantage Talgar auf Plantage Issyk gewechselt.')
  ) as v(nr, ausweis, art, ereignis_am, beschreibung)
  join public.pfluecker p on p.ausweis = v.ausweis
  join public.esutd_vertraege vt on vt.pfluecker_id = p.id
on conflict (id) do nothing;

update public.esutd_ereignisse
   set status = 'erfasst', erfasst_am = date '2026-09-08', bestaetigung = 'Quittung enbek.kz vom 08.09.2026, Nr. 4529177'
 where id = '7e57da7a-0000-4000-8000-820003000000'::uuid and status = 'offen';

-- ------------------------------------------------------------------------------------------------------------------------------
-- Förderung: Fristen der Dossiers und ihre Checkpunkte
-- ------------------------------------------------------------------------------------------------------------------------------
update public.foerderdossiers
   set frist_am = date '2026-11-15', notizen = 'Antrag 2026-114 bei gosagro.kz eingereicht. Rückfragen der Förderstelle bis 15.11.2026 beantworten, Zahlungsbelege der Kälteanlage nachreichen.'
 where portal = 'gosagro.kz' and titel = 'Foerderung Vorkuehlanlage' and frist_am is null;

update public.foerderdossiers
   set frist_am = date '2026-11-30', notizen = 'Entwurf: Antragsformular und Identifikation liegen vor, Kostenaufstellung und Flächennachweis fehlen noch. Einreichung bis 30.11.2026.'
 where portal = 'qoldau.kz' and titel = 'Himbeerförderungsprogramm' and frist_am is null;

insert into public.foerder_checkpunkte (id, dossier_id, vorlage_key, bezeichnung, pflicht, frist_am, erledigt_am, reihenfolge)
select ('7e57da7a-0000-4000-8000-83' || lpad(v.nr::text, 4, '0') || '000000')::uuid, d.id, v.vorlage, v.bezeichnung, v.pflicht, v.frist, v.erledigt, v.reihenfolge
  from (values
    (1, 'gosagro.kz', 'Foerderung Vorkuehlanlage', 'antragsformular',  null,                                              true,  null::date,        date '2026-08-12', 1),
    (2, 'gosagro.kz', 'Foerderung Vorkuehlanlage', 'identifikation',   null,                                              true,  null,              date '2026-08-12', 2),
    (3, 'gosagro.kz', 'Foerderung Vorkuehlanlage', 'kostenaufstellung', null,                                             true,  null,              date '2026-08-25', 3),
    (4, 'gosagro.kz', 'Foerderung Vorkuehlanlage', 'flaechennachweis', null,                                              true,  null,              date '2026-08-26', 4),
    (5, 'gosagro.kz', 'Foerderung Vorkuehlanlage', 'zahlungsbelege',   null,                                              true,  date '2026-11-15', null,             5),
    (6, 'qoldau.kz',  'Himbeerförderungsprogramm', 'antragsformular',  null,                                              true,  null,              date '2026-10-08', 1),
    (7, 'qoldau.kz',  'Himbeerförderungsprogramm', 'identifikation',   null,                                              true,  null,              date '2026-10-08', 2),
    (8, 'qoldau.kz',  'Himbeerförderungsprogramm', 'kostenaufstellung', null,                                             true,  date '2026-10-30', null,             3),
    (9, 'qoldau.kz',  'Himbeerförderungsprogramm', 'flaechennachweis', null,                                              true,  date '2026-10-30', null,             4),
    (10, 'qoldau.kz', 'Himbeerförderungsprogramm', null, 'Stellungnahme des Landwirtschaftsamts Talgar einholen',        true,  date '2026-11-10', null,             5),
    (11, 'qoldau.kz', 'Himbeerförderungsprogramm', 'zahlungsbelege',   null,                                              false, null,              null,             6)
  ) as v(nr, portal, titel, vorlage, bezeichnung, pflicht, frist, erledigt, reihenfolge)
  join public.foerderdossiers d on d.portal = v.portal and d.titel = v.titel
 where not exists (select 1 from public.foerder_checkpunkte c where c.dossier_id = d.id)
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Nachweise: Gültigkeit der vorhandenen Dokumente, neue Nachweise, eine Version
-- ------------------------------------------------------------------------------------------------------------------------------
update public.dokumente set gueltig_von = date '2025-11-02', gueltig_bis = date '2026-11-01'
 where name = 'GlobalG.A.P.-Zertifikat' and gueltig_von is null and gueltig_bis is null and not unbefristet;
update public.dokumente set unbefristet = true
 where name = 'Spritzprotokoll KW 36 - Parzelle Nord' and gueltig_bis is null and not unbefristet;
update public.dokumente set unbefristet = true
 where name = 'Spritzprotokoll KW 30 - Parzelle Sued' and gueltig_bis is null and not unbefristet;
update public.dokumente set gueltig_von = date '2026-08-15', gueltig_bis = date '2027-08-14',
       b2b_kunde_id = (select k.id from public.b2b_kunden k where k.name = 'Handelskette A')
 where name = 'Rahmenliefervertrag Handelskette A' and gueltig_von is null and gueltig_bis is null and not unbefristet;
update public.dokumente set gueltig_von = date '2026-08-28', gueltig_bis = date '2026-12-31'
 where name = 'ESUTD-Sammelnachweis Saisonkraefte' and gueltig_von is null and gueltig_bis is null and not unbefristet;
update public.dokumente set unbefristet = true
 where name = 'Foerderdossier gosagro.kz - Kuehlhaus' and gueltig_bis is null and not unbefristet;

-- Vorversion zuerst, dann die neue Version mit Verweis auf sie (die Verknüpfung lässt sich nach dem Anlegen nicht mehr setzen).
insert into public.dokumente (id, name, kategorie, bezug, stand, status, gueltig_von, gueltig_bis, warnung_tage, rechtsgrundlage)
select v.id::uuid, v.name, v.kategorie::public.dokument_kategorie, v.bezug, v.stand, v.status::public.dokument_status, v.von, v.bis, v.warnung, v.grundlage
  from (values
    ('7e57da7a-0000-4000-8000-900000000010', 'Rückstandsanalyse Himbeeren 2025 (Labor Almaty)', 'zertifikat', 'Betrieb', date '2025-09-18', 'abgelaufen', date '2025-09-18', date '2026-09-17', 60, null),
    ('7e57da7a-0000-4000-8000-900000000011', 'Sachkundenachweis Pflanzenschutz (Betriebsleitung)', 'zertifikat', 'Betrieb', date '2024-04-10', 'gueltig', date '2024-04-10', date '2027-04-09', 90, null),
    ('7e57da7a-0000-4000-8000-900000000012', 'Hygienezulassung Kühlhaus', 'zertifikat', 'Betrieb', date '2025-03-01', 'gueltig', date '2025-03-01', date '2026-12-31', 60, null),
    ('7e57da7a-0000-4000-8000-900000000013', 'Liefervertrag Gastro-Distributor Almaty', 'liefervertrag', 'Kontingent Polana 1800 kg', date '2026-06-01', 'gueltig', date '2026-06-01', date '2027-05-31', 60, null),
    ('7e57da7a-0000-4000-8000-900000000014', 'Liefervertrag Almaty Fresh Market', 'liefervertrag', 'Kontingent Polka 2400 kg', date '2026-07-01', 'gueltig', date '2026-07-01', date '2026-12-31', 60, null),
    ('7e57da7a-0000-4000-8000-900000000015', 'Zukaufvereinbarung Nachbarbetrieb Kaskelen', 'sonstiges', 'Zukauf Saison 2026', date '2026-08-01', 'gueltig', date '2026-08-01', date '2026-11-30', 60, null),
    ('7e57da7a-0000-4000-8000-900000000016', 'Zukaufvereinbarung Nachbarbetrieb Uzynagash', 'sonstiges', 'Zukauf Saison 2026', date '2026-08-01', 'gueltig', date '2026-08-01', date '2026-10-31', 60, null),
    ('7e57da7a-0000-4000-8000-900000000017', 'Pachtvertrag Plantage Issyk', 'sonstiges', 'Plantage Issyk', date '2024-01-01', 'gueltig', date '2024-01-01', date '2033-12-31', 180, null),
    ('7e57da7a-0000-4000-8000-900000000018', 'Einwilligungsvorlage Saisonkräfte', 'sonstiges', 'Personenbezogene Daten', date '2026-05-20', 'gueltig', null, null, 60,
       'Gesetz der Republik Kasachstan Nr. 94-V vom 21.05.2013 über personenbezogene Daten und ihren Schutz')
  ) as v(id, name, kategorie, bezug, stand, status, von, bis, warnung, grundlage)
 where exists (select 1 from public.dokumente)
on conflict (id) do nothing;

update public.dokumente set unbefristet = true where id = '7e57da7a-0000-4000-8000-900000000018'::uuid and gueltig_bis is null and not unbefristet;

update public.dokumente
   set b2b_kunde_id = (select k.id from public.b2b_kunden k where k.name = 'Gastro-Distributor Almaty')
 where id = '7e57da7a-0000-4000-8000-900000000013'::uuid and b2b_kunde_id is null;
update public.dokumente
   set b2b_kunde_id = (select k.id from public.b2b_kunden k where k.name = 'Almaty Fresh Market')
 where id = '7e57da7a-0000-4000-8000-900000000014'::uuid and b2b_kunde_id is null;
update public.dokumente
   set nachbarbetrieb_id = (select n.id from public.nachbarbetriebe n where n.name = 'Nachbarbetrieb Kaskelen')
 where id = '7e57da7a-0000-4000-8000-900000000015'::uuid and nachbarbetrieb_id is null;
update public.dokumente
   set nachbarbetrieb_id = (select n.id from public.nachbarbetriebe n where n.name = 'Nachbarbetrieb Uzynagash')
 where id = '7e57da7a-0000-4000-8000-900000000016'::uuid and nachbarbetrieb_id is null;
update public.dokumente
   set verantwortlich_id = (select p.id from public.profiles p where p.role::text = 'betriebsleitung' order by p.created_at limit 1)
 where id in ('7e57da7a-0000-4000-8000-900000000011'::uuid, '7e57da7a-0000-4000-8000-900000000012'::uuid) and verantwortlich_id is null;

-- Neue Version der Rückstandsanalyse: ersetzt die von 2025 (gleiche Kategorie, Verweis nur beim Anlegen möglich).
insert into public.dokumente (id, name, kategorie, bezug, stand, status, gueltig_von, gueltig_bis, warnung_tage, ersetzt_id)
select '7e57da7a-0000-4000-8000-900000000019'::uuid, 'Rückstandsanalyse Himbeeren 2026 (Labor Almaty)', 'zertifikat', 'Betrieb', date '2026-09-10', 'gueltig',
       date '2026-09-10', date '2027-09-09', 60, '7e57da7a-0000-4000-8000-900000000010'::uuid
 where exists (select 1 from public.dokumente where id = '7e57da7a-0000-4000-8000-900000000010'::uuid)
on conflict (id) do nothing;

-- migration:destruktiv-ok (nur die temporäre Hilfstabelle dieser Migration)
drop table _esf;
