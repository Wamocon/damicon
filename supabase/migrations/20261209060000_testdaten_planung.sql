-- Testdaten Planung und Kommunikation (Datenänderung, idempotent).
--
--   Rotationsplan   Brigaden für die Termine der nächsten sieben Tage (je nach Plantage des Blocks), damit Einsatzplan und Bedarf
--                   etwas zeigen. Lange verstrichene Termine, die weder erledigt noch gesperrt wurden, gelten als übersprungen.
--   Pflückaufgaben  Zwei offene Aufgaben für die nächsten Werktage (eine von der Brigade angenommen).
--   Abholrunden     Drei abgeschlossene Runden zu den Nachbarbetrieben (26.09., 03.10., 10.10.) mit Abholzeiten, Mengen,
--                   Kühlhaus-Ankunft und Straßengeometrie, dazu eine geplante Runde am nächsten Werktag.
--   Vorbestellungen Vier neue aus dem B2B-Portal (zwei bestätigt, eine angefragt, eine storniert) mit Nachrichtenverläufen.
--   Preislisten     Winterpreise ab 01.11.2026 mit Staffeln ab 100 und 250 kg (Handel 6 % günstiger, Gastronomie 7 % teurer wegen kleiner Schalen); die Herbstlisten laufen am 31.10. aus.
--
-- Die Daten gehen durch dieselben Trigger wie in der Anwendung. Ausnahmen für nachträglich erzeugte Historie: Stopps abgeschlossener
-- Runden und die Zeitstempel der Nachrichten (der Trigger setzt sonst "jetzt"), dafür sind die Trigger nur für die jeweilige Anweisung
-- abgeschaltet. Alle Termine in der Zukunft hängen am Ausführungstag (heute_almaty()), die Historie hat feste Daten.
--
-- Die Straßengeometrie der Abholroute stammt vom Routendienst OSRM (Betrieb, Uzynagash, Kaskelen, zurück): 112,8 km, 122 Minuten
-- Fahrzeit, Teilstrecken 58, 42 und 22 Minuten.
--
-- Schutz: Nur mit Betriebsdaten; jede Gruppe prüft vorher, ob sie schon angelegt wurde. Kennung 7e57da7a-0000-4000-8000-...

-- ------------------------------------------------------------------------------------------------------------------------------
-- Rotationsplan
-- ------------------------------------------------------------------------------------------------------------------------------
-- Fehlende Termine der nächsten zwei Wochen erzeugt der Generator der Anwendung. Er setzt am zuletzt geplanten Termin jedes Blocks an und
-- legt nichts an, wo der Plan weit genug reicht.
select public.rotationsplan_generieren(2, public.heute_almaty())
 where exists (select 1 from public.pflueckaufgaben where id::text like '7e57da7a-0000-4000-8000-10%');

update public.rotationsplan_eintraege
   set status = 'uebersprungen'
 where status = 'geplant' and geplant_fuer < public.heute_almaty() - 2 and pflueckaufgabe_id is null;

update public.rotationsplan_eintraege r
   set brigade_id = x.brigade_id
  from (
    select r2.id,
           (select b.id
              from public.brigaden b
             where b.plantage_id = pl.id
             order by b.name
            offset (extract(doy from r2.geplant_fuer)::integer % greatest(1, (select count(*) from public.brigaden b2 where b2.plantage_id = pl.id)))
             limit 1) as brigade_id
      from public.rotationsplan_eintraege r2
      join public.reihenbloecke rb on rb.id = r2.reihenblock_id
      join public.reihengruppen rg on rg.id = rb.reihengruppe_id
      join public.feldparzellen fp on fp.id = rg.feldparzelle_id
      join public.plantagen pl on pl.id = fp.plantage_id
     where r2.status = 'geplant' and r2.brigade_id is null
       and r2.geplant_fuer >= public.heute_almaty() and r2.geplant_fuer <= public.heute_almaty() + 7
  ) x
 where r.id = x.id and x.brigade_id is not null;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Zwei offene Pflückaufgaben für die nächsten Werktage
-- ------------------------------------------------------------------------------------------------------------------------------
create temp table _werktage as
select n, d
  from (
    select row_number() over (order by g.d) as n, g.d::date as d
      from generate_series(public.heute_almaty() + 1, public.heute_almaty() + 10, interval '1 day') as g(d)
     where extract(dow from g.d) between 1 and 5
  ) w
 where n <= 3;

create temp table _offen as
select v.nr, w.d,
       ('7e57da7a-0000-4000-8000-10' || lpad(v.nr::text, 4, '0') || '000000')::uuid as aufgabe_id,
       v.status, v.ziel, v.leute,
       (select b.id from public.reihenbloecke b where b.status = 'erntereif' and b.sorte_id is not null order by b.code
         offset ((v.nr - 17) % greatest(1, (select count(*) from public.reihenbloecke b2 where b2.status = 'erntereif' and b2.sorte_id is not null))) limit 1) as block_id
  from (values (17, 1, 'angenommen', 48, 3), (18, 2, 'offen', 42, 3)) as v(nr, wtag, status, ziel, leute)
  join _werktage w on w.n = v.wtag;

insert into public.pflueckaufgaben (id, code, reihenblock_id, brigade_id, sorte_id, status, faelligkeit, zielmenge_kg, pfluecker_anzahl)
select o.aufgabe_id, 'PA-S-' || to_char(o.d, 'YYMMDD') || '-' || lpad(o.nr::text, 2, '0'), o.block_id,
       (select p.brigade_id from public.pfluecker p where p.ausweis not ilike 'TEST%' and p.brigade_id is not null order by p.ausweis offset (o.nr % 3) limit 1),
       (select b.sorte_id from public.reihenbloecke b where b.id = o.block_id), o.status::public.pflueckaufgabe_status,
       (o.d + time '06:00') at time zone 'Asia/Almaty', o.ziel, o.leute
  from _offen o
 where o.block_id is not null
   and exists (select 1 from public.pflueckaufgaben x where x.id::text like '7e57da7a-0000-4000-8000-10%')
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Abholrunden
-- ------------------------------------------------------------------------------------------------------------------------------
create temp table _runden as
select v.*, ('7e57da7a-0000-4000-8000-38' || lpad(v.nr::text, 4, '0') || '000000')::uuid as runde_id
  from (values
    (1, date '2026-09-26', 'abgeschlossen', null::text),
    (2, date '2026-10-03', 'abgeschlossen', 'Viel Verkehr am Stadtrand von Almaty, zehn Minuten Verzögerung vor Kaskelen.'),
    (3, date '2026-10-10', 'abgeschlossen', null)
  ) as v(nr, datum, status, notiz)
 where exists (select 1 from public.nachbarbetriebe where name = 'Nachbarbetrieb Uzynagash' and breitengrad is not null)
   and exists (select 1 from public.nachbarbetriebe where name = 'Nachbarbetrieb Kaskelen' and breitengrad is not null)
   and not exists (select 1 from public.abholrunden where id::text like '7e57da7a-0000-4000-8000-38%');

insert into public.abholrunden (id, datum, status, fahrzeug, notiz, distanz_km, dauer_minuten, ab_erstem_stopp_minuten, routen_geometrie,
                                gestartet_am, ankunft_geraet_zeitpunkt, kuehlhaus_an, kapazitaet_kg, start_zeit)
select r.runde_id, r.datum, 'abgeschlossen', 'Kühlwagen Gazelle Next, 412 KAL 05', r.notiz, 112.8, 140, 64,
       '{"type":"LineString","coordinates":[[76.85119,43.222],[76.84362,43.22986],[76.83808,43.24739],[76.79779,43.23345],[76.72702,43.22491],[76.69867,43.21616],[76.68188,43.21391],[76.60637,43.22369],[76.49763,43.21927],[76.3786,43.2236],[76.36213,43.22617],[76.36522,43.22504],[76.35158,43.22227],[76.33815,43.21161],[76.31689,43.21124],[76.318,43.20476],[76.31204,43.19924],[76.30577,43.18124],[76.30527,43.17023],[76.311,43.14927],[76.30527,43.17023],[76.30577,43.18124],[76.31204,43.19924],[76.318,43.20476],[76.31689,43.21124],[76.33815,43.21161],[76.35158,43.22227],[76.36564,43.22493],[76.49764,43.21913],[76.60757,43.22345],[76.61731,43.22217],[76.61704,43.2058],[76.62825,43.20362],[76.62832,43.20175],[76.62902,43.20883],[76.63812,43.20752],[76.64512,43.21502],[76.65166,43.21743],[76.68006,43.21386],[76.69214,43.21475],[76.72696,43.22473],[76.79757,43.23321],[76.81357,43.23982],[76.83596,43.24506],[76.85101,43.21998],[76.85119,43.222]]}'::jsonb,
       (r.datum + time '06:15') at time zone 'Asia/Almaty',
       (r.datum + case r.nr when 2 then time '08:50' else time '08:40' end) at time zone 'Asia/Almaty',
       (r.datum + case r.nr when 2 then time '08:50' else time '08:40' end) at time zone 'Asia/Almaty',
       600, time '06:15'
  from _runden r
on conflict (id) do nothing;

-- Stopps vergangener Runden entstehen nicht über die Oberfläche, sondern fertig: die Prüfung "neuer Stopp beginnt geplant" ist für
-- diese eine Anweisung abgeschaltet. Reihenfolge wie die Route sie vorgibt: erst Uzynagash (58 Minuten), dann Kaskelen.
alter table public.abholstopps disable trigger trg_abholstopp_pruefen;

insert into public.abholstopps (id, runde_id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg, sorte_id, status, menge_ist_kg, pflueckbeginn,
                                geraet_zeitpunkt, abgeholt_am, bemerkung, ankunft_geplant)
select ('7e57da7a-0000-4000-8000-39' || lpad(r.nr::text, 4, '0') || lpad(v.reihenfolge::text, 6, '0'))::uuid, r.runde_id, nb.id, v.reihenfolge,
       v.geplant, s.id, 'abgeholt', v.ist,
       (r.datum + v.pflueck) at time zone 'Asia/Almaty', (r.datum + v.abgeholt) at time zone 'Asia/Almaty', (r.datum + v.abgeholt) at time zone 'Asia/Almaty',
       v.bemerkung, (r.datum + v.ankunft) at time zone 'Asia/Almaty'
  from _runden r
  join (values
    (1, 'Nachbarbetrieb Uzynagash', 0, 65.0, 'Polana', 63.8, time '06:55', time '07:20', 'Ware sauber verlesen, 13 Steigen.',            time '07:15'),
    (1, 'Nachbarbetrieb Kaskelen',  1, 85.0, 'Polka',  85.2, time '07:45', time '08:12', null,                                          time '08:05'),
    (2, 'Nachbarbetrieb Uzynagash', 0, 60.0, 'Polka',  58.0, time '06:50', time '07:18', 'Zwei Steigen zu feucht, vom Betrieb getauscht.', time '07:15'),
    (2, 'Nachbarbetrieb Kaskelen',  1, 70.0, 'Polka',  72.6, time '08:00', time '08:15', null,                                          time '08:05'),
    (3, 'Nachbarbetrieb Uzynagash', 0, 35.0, 'Polka',  36.0, time '07:05', time '07:28', null,                                          time '07:15'),
    (3, 'Nachbarbetrieb Kaskelen',  1, 45.0, 'Polana', 40.9, time '07:50', time '08:15', 'Weniger Ware nach dem Frost in der Nacht.',    time '08:05')
  ) as v(runde, betrieb, reihenfolge, geplant, sorte, ist, pflueck, abgeholt, bemerkung, ankunft) on v.runde = r.nr
  join public.nachbarbetriebe nb on nb.name = v.betrieb
  join public.sorten s on s.name = v.sorte
on conflict (id) do nothing;

alter table public.abholstopps enable trigger trg_abholstopp_pruefen;

-- Die geplante Runde am nächsten Werktag: zwei Stopps, Ankunftszeiten aus den Teilstrecken ab 06:15.
insert into public.abholrunden (id, datum, status, fahrzeug, notiz, distanz_km, dauer_minuten, ab_erstem_stopp_minuten, routen_geometrie, kapazitaet_kg, start_zeit)
select '7e57da7a-0000-4000-8000-380004000000'::uuid, w.d, 'geplant', 'Kühlwagen Gazelle Next, 412 KAL 05', 'Letzte Runde vor dem Winterpreis, falls das Wetter hält.',
       112.8, 140, 64, g.geometrie, 600, time '06:15'
  from _werktage w
 cross join (select routen_geometrie as geometrie from public.abholrunden where id = '7e57da7a-0000-4000-8000-380001000000'::uuid) g
 where w.n = 1
   and not exists (select 1 from public.abholrunden where id = '7e57da7a-0000-4000-8000-380004000000'::uuid)
on conflict (id) do nothing;

insert into public.abholstopps (id, runde_id, nachbarbetrieb_id, reihenfolge, menge_geplant_kg, sorte_id, status, ankunft_geplant)
select ('7e57da7a-0000-4000-8000-390004' || lpad(v.reihenfolge::text, 6, '0'))::uuid, '7e57da7a-0000-4000-8000-380004000000'::uuid, nb.id, v.reihenfolge,
       v.geplant, s.id, 'geplant', (w.d + v.ankunft) at time zone 'Asia/Almaty'
  from _werktage w
  join (values
    ('Nachbarbetrieb Uzynagash', 0, 45.0, 'Polka',  time '07:15'),
    ('Nachbarbetrieb Kaskelen',  1, 55.0, 'Polana', time '08:05')
  ) as v(betrieb, reihenfolge, geplant, sorte, ankunft) on true
  join public.nachbarbetriebe nb on nb.name = v.betrieb
  join public.sorten s on s.name = v.sorte
 where w.n = 1 and exists (select 1 from public.abholrunden where id = '7e57da7a-0000-4000-8000-380004000000'::uuid)
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Vorbestellungen aus dem B2B-Portal mit Nachrichten
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.vorbestellungen (id, b2b_kunde_id, sorte_id, menge_kg, liefertermin, status)
select ('7e57da7a-0000-4000-8000-34' || lpad(v.nr::text, 4, '0') || '000000')::uuid, k.id, s.id, v.menge, w.d, 'angefragt'
  from (values
    (1, 'Almaty Fresh Market',       'Polka',  120, 1),
    (2, 'Gastro-Distributor Almaty', 'Polana',  60, 2),
    (3, 'Handelskette A',            'Polka',  200, 3),
    (4, 'Almaty Fresh Market',       'Polana',  50, 2)
  ) as v(nr, kunde, sorte, menge, wtag)
  join _werktage w on w.n = v.wtag
  join public.b2b_kunden k on k.name = v.kunde
  join public.sorten s on s.name = v.sorte
 where exists (select 1 from public.pflueckaufgaben x where x.id::text like '7e57da7a-0000-4000-8000-10%')
on conflict (id) do nothing;

-- Bestätigung, Reservierung im Kontingent und Stornierung laufen über die Statuswechsel, die den Trigger auslösen.
update public.vorbestellungen set status = 'bestaetigt'
 where id in ('7e57da7a-0000-4000-8000-340001000000'::uuid, '7e57da7a-0000-4000-8000-340003000000'::uuid, '7e57da7a-0000-4000-8000-340004000000'::uuid) and status = 'angefragt';
update public.vorbestellungen set status = 'storniert'
 where id = '7e57da7a-0000-4000-8000-340004000000'::uuid and status = 'bestaetigt';

alter table public.vorbestellung_nachrichten disable trigger trg_vorbestellung_nachricht_vorbereiten;

insert into public.vorbestellung_nachrichten (id, vorbestellung_id, autor_profil_id, autor_name, autor_rolle, text, created_at)
select ('7e57da7a-0000-4000-8000-35' || lpad(m.vorbestellung::text, 4, '0') || lpad(m.lfd::text, 6, '0'))::uuid,
       ('7e57da7a-0000-4000-8000-34' || lpad(m.vorbestellung::text, 4, '0') || '000000')::uuid,
       p.id,
       coalesce(p.full_name, m.name), m.rolle::public.app_role, m.text,
       ((public.heute_almaty() - m.tage) + m.uhr) at time zone 'Asia/Almaty'
  from (values
    (1, 1, 'kunde',           'Almaty Fresh Market', 3, time '09:12', 'Guten Tag, wir brauchen 120 kg Polka zum angegebenen Termin, bitte bis neun Uhr an der Warenannahme. Schalen zu 125 g.'),
    (1, 2, 'betriebsleitung', null,                  3, time '11:40', 'Guten Tag, das passt. Die Ernte läuft am Vortag, die Lieferung ist bis neun Uhr eingeplant.'),
    (1, 3, 'kunde',           'Almaty Fresh Market', 2, time '08:05', 'Danke. Bitte den Lieferschein mit der ЭСФ-Nummer mitgeben, damit die Buchhaltung ihn gleich verbuchen kann.'),
    (1, 4, 'betriebsleitung', null,                  2, time '10:20', 'Machen wir. Die ЭСФ wird am Liefertag ausgestellt.'),
    (2, 1, 'kunde',           'Einkauf Gastro-Distributor Almaty', 1, time '15:30', 'Добрый день! Нужно 60 кг Поланы к четвергу, лучше в мелкой упаковке (125 г). Возможно ли?'),
    (2, 2, 'betriebsleitung', null,                  1, time '16:45', 'Здравствуйте! Проверяем объём по прогнозу сбора и ответим до конца завтрашнего дня.'),
    (3, 1, 'kunde',           'Einkauf Handelskette A', 4, time '10:00', 'Wir möchten 200 kg Polka abrufen, bitte gegen das Kontingent aus dem Rahmenvertrag buchen.'),
    (3, 2, 'betriebsleitung', null,                  4, time '14:10', 'Verstanden, die Menge ist im Kontingent frei. Welches Lieferfenster passt Ihnen?'),
    (3, 3, 'kunde',           'Einkauf Handelskette A', 3, time '08:40', 'Zwischen sieben und neun Uhr am Zentrallager, bitte mit Kühlnachweis.'),
    (3, 4, 'betriebsleitung', null,                  3, time '09:55', 'Bestätigt. Die Temperaturkurve der Fahrt hängt am Lieferschein.'),
    (4, 1, 'kunde',           'Almaty Fresh Market', 2, time '09:30', 'Wir brauchen die Polana doch nicht, der Aktionstag wurde verschoben. Bitte stornieren.'),
    (4, 2, 'betriebsleitung', null,                  2, time '10:05', 'Storniert. Das Kontingent ist wieder frei.')
  ) as m(vorbestellung, lfd, rolle, name, tage, uhr, text)
  left join lateral (
    select pr.id, pr.full_name from public.profiles pr
     where (m.rolle = 'kunde' and m.name = 'Almaty Fresh Market' and pr.role::text = 'kunde' and pr.full_name = m.name)
        or (m.rolle = 'betriebsleitung' and pr.role::text = 'betriebsleitung')
     order by pr.created_at limit 1
  ) p on true
 where exists (select 1 from public.vorbestellungen where id = ('7e57da7a-0000-4000-8000-34' || lpad(m.vorbestellung::text, 4, '0') || '000000')::uuid)
   and coalesce(p.full_name, m.name) is not null
on conflict (id) do nothing;

alter table public.vorbestellung_nachrichten enable trigger trg_vorbestellung_nachricht_vorbereiten;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Preislisten: Winterpreise ab 01.11.2026 mit Staffeln, die Herbstlisten laufen am 31.10. aus
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.preislisten (id, name, gueltig_ab, aktiv, kundengruppe, preise_inkl_mwst)
select v.id::uuid, v.name, date '2026-11-01', true, v.gruppe::public.kundengruppe, false
  from (values
    ('7e57da7a-0000-4000-8000-360001000000', 'Preisliste Winter 2026', null::text),
    ('7e57da7a-0000-4000-8000-360002000000', 'Preisliste Winter 2026 - Handel', 'handel'),
    ('7e57da7a-0000-4000-8000-360003000000', 'Preisliste Winter 2026 - Gastronomie', 'gastronomie')
  ) as v(id, name, gruppe)
 where exists (select 1 from public.preislisten where name = 'Preisliste Herbst 2026')
on conflict (id) do nothing;

insert into public.preislisten_positionen (id, preisliste_id, sorte_id, preis_tenge_kg, min_menge_kg)
select ('7e57da7a-0000-4000-8000-37' || lpad((l.nr * 100 + p.nr * 10 + st.nr)::text, 4, '0') || '000000')::uuid, l.id::uuid, s.id,
       round(p.basis * (1 - st.rabatt) * l.faktor / 5) * 5, st.min_menge
  from (values (1, '7e57da7a-0000-4000-8000-360001000000', 1.00), (2, '7e57da7a-0000-4000-8000-360002000000', 0.94), (3, '7e57da7a-0000-4000-8000-360003000000', 1.07)) as l(nr, id, faktor)
  cross join (values (1, 'Polka', 2300), (2, 'Polana', 2250), (3, 'Kweli', 2200), (4, 'Tulameen', 2100)) as p(nr, sorte, basis)
  cross join (values (0, 0.000, 0), (1, 0.025, 100), (2, 0.050, 250)) as st(nr, rabatt, min_menge)
  join public.sorten s on s.name = p.sorte
 where exists (select 1 from public.preislisten where id = l.id::uuid)
   and (l.nr = 1 or st.nr = 0)
on conflict (id) do nothing;

update public.preislisten
   set gueltig_bis = date '2026-10-31'
 where name in ('Preisliste Herbst 2026', 'Preisliste Herbst 2026 - Handel') and gueltig_bis is null
   and exists (select 1 from public.preislisten where id = '7e57da7a-0000-4000-8000-360001000000'::uuid);

-- migration:destruktiv-ok (nur die temporären Hilfstabellen dieser Migration)
drop table _runden;
drop table _offen;
drop table _werktage;
