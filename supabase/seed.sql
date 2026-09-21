-- =============================================================================
-- Damicon - Seed-Daten (Prototyp)
-- =============================================================================
-- Spiegelt die Mock-Daten aus src/lib/domain/. Alle Werte sind Platzhalter.
-- Wird bei `supabase db reset` nach den Migrationen geladen.
-- Idempotent: on conflict do nothing / natuerliche Schluessel.
-- =============================================================================

set search_path = public;

-- --- Betrieb & Sorten -------------------------------------------------------
insert into public.betriebe (name) values ('Damicon Aggregator - Umland Almaty')
  on conflict do nothing;

insert into public.sorten (name, typ, erntefenster, schale_g) values
  ('Polka',    'remontierend',  'Aug - erster Frost', 125),
  ('Polana',   'remontierend',  'Aug - Okt',          125),
  ('Tulameen', 'sommertragend', 'Jun - Jul',          170),
  ('Kweli',    'remontierend',  'Aug - Sep',          125)
  on conflict (name) do nothing;

-- --- Nachbarbetrieb -------------------------------------------------------
-- Zwei Betriebe, damit der Aggregator-Import (WMCNL-1453) echte Referenzdaten
-- zum Aufloesen hat: Kaskelen traegt den "alten" Zukauf-Fall mit bereits
-- eingetragenem Preis, Uzynagash unten den "neuen" Fall, wie ihn der
-- CSV-Import erzeugt (Preis noch offen).
insert into public.nachbarbetriebe (name, ort, kontakt) values
  ('Nachbarbetrieb Kaskelen', 'Kaskelen, Gebiet Almaty', 'R. Baitulin'),
  ('Nachbarbetrieb Uzynagash', 'Uzynagash, Gebiet Almaty', 'A. Dzhaksybekov')
  on conflict do nothing;

-- --- Plantagen -------------------------------------------------------------
insert into public.plantagen (betrieb_id, name, ort, typ, nachbarbetrieb_id)
select b.id, v.name, v.ort, v.typ::public.plantage_typ, n.id
from (values
  ('Plantage Talgar',        'Talgar, Gebiet Almaty',   'eigen',         null),
  ('Plantage Issyk',         'Yesik, Gebiet Almaty',    'eigen',         null),
  ('Nachbarbetrieb Kaskelen','Kaskelen, Gebiet Almaty', 'nachbarbetrieb','Nachbarbetrieb Kaskelen')
) as v(name, ort, typ, nb)
cross join (select id from public.betriebe limit 1) b
left join public.nachbarbetriebe n on n.name = v.nb
on conflict do nothing;

-- --- Feldparzellen -------------------------------------------------------
insert into public.feldparzellen (plantage_id, name, flaeche_ha, sorte_id)
select p.id, v.name, v.flaeche, s.id
from (values
  ('Plantage Talgar', 'Parzelle Nord',    3.2, 'Polka'),
  ('Plantage Talgar', 'Parzelle Ost',     2.5, 'Polana'),
  ('Plantage Issyk',  'Parzelle Sued',    4.1, 'Tulameen'),
  ('Nachbarbetrieb Kaskelen', 'Zukauf-Parzelle', 1.8, 'Polka')
) as v(plantage, name, flaeche, sorte)
join public.plantagen p on p.name = v.plantage
join public.sorten s on s.name = v.sorte
on conflict do nothing;

-- --- Reihengruppen -------------------------------------------------------
insert into public.reihengruppen (feldparzelle_id, name, spalierrichtung, anzahl_reihenbloecke)
select f.id, v.name, v.richtung::public.spalierrichtung, v.anzahl
from (values
  ('Parzelle Nord',    'Reihengruppe A', 'n_s', 8),
  ('Parzelle Nord',    'Reihengruppe B', 'n_s', 8),
  ('Parzelle Ost',     'Reihengruppe A', 'o_w', 6),
  ('Parzelle Sued',    'Reihengruppe A', 'n_s', 10),
  ('Parzelle Sued',    'Reihengruppe B', 'n_s', 9),
  ('Zukauf-Parzelle',  'Reihengruppe A', 'o_w', 5)
) as v(parzelle, name, richtung, anzahl)
join public.feldparzellen f on f.name = v.parzelle
on conflict do nothing;

-- --- Reihenbloecke ------------------------------------------------------
insert into public.reihenbloecke (reihengruppe_id, code, sorte_id, status, laenge_m, letzte_ernte)
select rg.id, v.code, s.id, v.status::public.reihenblock_status, v.laenge, v.ernte::date
from (values
  ('Parzelle Nord','Reihengruppe A','T-N-A-01','Polka','erntereif',42,'2026-08-30'),
  ('Parzelle Nord','Reihengruppe A','T-N-A-02','Polka','bepflanzt',42,'2026-08-28'),
  ('Parzelle Nord','Reihengruppe A','T-N-A-03','Polka','bepflanzt',42,'2026-08-29'),
  ('Parzelle Nord','Reihengruppe A','T-N-A-04','Polka','wartezeitgesperrt',42,'2026-08-27'),
  ('Parzelle Nord','Reihengruppe B','T-N-B-01','Polka','wartezeitgesperrt',40,'2026-08-26'),
  ('Parzelle Nord','Reihengruppe B','T-N-B-02','Polka','rueckschnitt',40,'2026-08-20'),
  ('Parzelle Ost','Reihengruppe A','T-O-A-01','Polana','erntereif',38,'2026-08-31'),
  ('Parzelle Ost','Reihengruppe A','T-O-A-02','Polana','bepflanzt',38,'2026-08-30'),
  ('Parzelle Sued','Reihengruppe A','I-S-A-01','Tulameen','ruhend',45,'2026-07-18'),
  ('Parzelle Sued','Reihengruppe A','I-S-A-02','Tulameen','ruhend',45,'2026-07-19'),
  ('Parzelle Sued','Reihengruppe B','I-S-B-01','Tulameen','rueckschnitt',44,'2026-07-15'),
  ('Zukauf-Parzelle','Reihengruppe A','K-A-01','Polka','erntereif',36,'2026-08-30')
) as v(parzelle, gruppe, code, sorte, status, laenge, ernte)
join public.feldparzellen f on f.name = v.parzelle
join public.reihengruppen rg on rg.feldparzelle_id = f.id and rg.name = v.gruppe
join public.sorten s on s.name = v.sorte
on conflict (code) do nothing;

-- --- Pflanzenschutzmittel + Behandlungen (Trigger sperrt Reihenblock) ---
insert into public.psm_mittel (name, wirkstoff, wartezeit_tage) values
  ('Signum', 'Boscalid + Pyraclostrobin', 3),
  ('SpinTor', 'Spinosad', 3)
  on conflict do nothing;

insert into public.pflanzenschutz_behandlungen
  (reihenblock_id, psm_mittel_id, behandelt_am, wartezeit_tage, aufwandmenge, aufwandmenge_einheit)
select rb.id, m.id, v.datum::date, v.wz, v.menge, v.einheit::public.aufwandmenge_einheit
from (values
  ('T-N-A-04', 'Signum', '2026-09-01', 3, 1.50, 'kg_ha'),
  ('T-N-B-01', 'SpinTor', '2026-08-31', 3, 0.30, 'l_ha')
) as v(code, mittel, datum, wz, menge, einheit)
join public.reihenbloecke rb on rb.code = v.code
join public.psm_mittel m on m.name = v.mittel
where not exists (
  select 1 from public.pflanzenschutz_behandlungen b
  where b.reihenblock_id = rb.id and b.behandelt_am = v.datum::date
);

-- --- Brigaden & Pfluecker ---------------------------------------------------
insert into public.brigaden (plantage_id, name, vorarbeiter, staerke)
select p.id, v.name, v.vorarbeiter, v.staerke
from (values
  ('Plantage Talgar',        'Brigade Nord',           'A. Iskakow',   6),
  ('Plantage Talgar',        'Brigade Ost',            'G. Nurlanowa', 4),
  ('Plantage Issyk',         'Brigade Sued',           'S. Achmetow',  5),
  ('Nachbarbetrieb Kaskelen','Brigade Nachbarbetrieb', 'R. Baitulin',  5)
) as v(plantage, name, vorarbeiter, staerke)
join public.plantagen p on p.name = v.plantage
where not exists (select 1 from public.brigaden b where b.name = v.name);

insert into public.pfluecker (brigade_id, name, ausweis, esutd)
select b.id, v.name, v.ausweis, v.esutd::public.esutd_status
from (values
  ('Brigade Nord',           'D. Sarsenbaj',   'MAL-0417', 'erfasst'),
  ('Brigade Nord',           'A. Tulegenowa',  'MAL-0418', 'erfasst'),
  ('Brigade Ost',            'M. Qojschybaj',  'MAL-0421', 'offen'),
  ('Brigade Sued',           'N. Erbolat',     'MAL-0430', 'erfasst'),
  ('Brigade Nachbarbetrieb', 'L. Achmet',      'MAL-0441', 'offen')
) as v(brigade, name, ausweis, esutd)
join public.brigaden b on b.name = v.brigade
on conflict (ausweis) do nothing;

-- --- Chargen -------------------------------------------------------------
-- Mehrere Erntetage je Reihenblock: erst daraus laesst sich das eingehaltene
-- Pflueckintervall ueberhaupt messen. Menge und Ausschuss tragen Verlustquote
-- und Deckungsbeitrag.
insert into public.chargen (code, reihenblock_id, sorte_id, ernte_datum, status,
                            pflueck_zeitpunkt, vorkuehlung_zeitpunkt, menge_kg, ausschuss_kg)
select v.code, rb.id, s.id, v.datum::date, v.status::public.charge_status,
       nullif(v.pfluecken, '')::timestamptz, nullif(v.kuehlung, '')::timestamptz,
       v.menge, v.ausschuss
from (values
  -- Block T-N-A-01: 26.08., 29.08., 01.09., 02.09. - Abstaende 3, 3, 1 Tage
  ('CH-0826-01','T-N-A-01','Polka','2026-08-26','ausgeliefert','2026-08-26T09:20:00+06','2026-08-26T10:02:00+06',46.8,3.1),
  ('CH-0829-04','T-N-A-01','Polka','2026-08-29','ausgeliefert','2026-08-29T09:05:00+06','2026-08-29T09:44:00+06',44.2,4.6),
  ('CH-0901-07','T-N-A-01','Polka','2026-09-01','verladen',    '2026-09-01T09:30:00+06','2026-09-01T10:14:00+06',49.5,3.8),
  ('CH-0902-14','T-N-A-01','Polka','2026-09-02','gekuehlt',    '2026-09-02T09:40:00+06','2026-09-02T10:21:00+06',51.4,4.2),
  -- Block T-N-A-03: 25.08., 29.08., 01.09. - ein Abstand von 4 Tagen, also gerissen
  ('CH-0825-02','T-N-A-03','Polka','2026-08-25','ausgeliefert','2026-08-25T08:50:00+06','2026-08-25T09:38:00+06',41.0,2.9),
  ('CH-0829-05','T-N-A-03','Polka','2026-08-29','ausgeliefert','2026-08-29T08:40:00+06','2026-08-29T09:22:00+06',43.7,3.4),
  ('CH-0902-12','T-N-A-03','Polka','2026-09-02','offen',       '2026-09-02T08:30:00+06','',                      44.2,5.9),
  -- Block T-O-A-01: 28.08., 31.08., 02.09. - Abstaende 3 und 2 Tage
  ('CH-0828-03','T-O-A-01','Polana','2026-08-28','ausgeliefert','2026-08-28T09:10:00+06','2026-08-28T09:52:00+06',29.4,2.2),
  ('CH-0831-06','T-O-A-01','Polana','2026-08-31','ausgeliefert','2026-08-31T09:25:00+06','2026-08-31T10:09:00+06',31.8,2.0),
  ('CH-0902-15','T-O-A-01','Polana','2026-09-02','offen',       '2026-09-02T09:15:00+06','',                      17.9,1.4)
) as v(code, block, sorte, datum, status, pfluecken, kuehlung, menge, ausschuss)
join public.reihenbloecke rb on rb.code = v.block
join public.sorten s on s.name = v.sorte
on conflict (code) do nothing;

-- --- Pflueckaufgaben ----------------------------------------------------
-- ausschuss_kg spiegelt den Wert, der bereits an der zugehoerigen Charge
-- steht - beide Seiten sollen dieselbe Zahl zeigen, nicht zwei verschiedene.
--
-- Die Faelligkeit der noch offenen Aufgaben (alles ausser "abgeschlossen")
-- ist relativ zum Seed-Zeitpunkt gesetzt, nicht auf ein festes Datum im
-- September. Sonst zeigt die Faelligkeitsanzeige in jeder Vorfuehrung "seit
-- 3 Tagen ueberfaellig" statt eines Wertes, dem man beim Naeherkommen
-- tatsaechlich zusehen kann - ein `npm run db:reset` kurz vor dem Termin
-- macht die Anzeige wieder frisch.
insert into public.pflueckaufgaben
  (code, reihenblock_id, charge_id, brigade_id, sorte_id, status, faelligkeit,
   zielmenge_kg, ist_menge_kg, ausschuss_kg, pfluecker_anzahl, qualitaetsfaktor)
select v.code, rb.id, ch.id, br.id, s.id, v.status::public.pflueckaufgabe_status,
       case v.code
         when 'PA-2026-0912-01' then now() - interval '12 minutes'  -- knapp abgegeben, jetzt in Pruefung
         when 'PA-2026-0912-02' then now() + interval '55 minutes'  -- laeuft, Frist rueckt naeher
         when 'PA-2026-0912-03' then now() + interval '3 hours 10 minutes'
         when 'PA-2026-0912-05' then now() - interval '18 minutes'  -- noch nicht angenommen, bereits ueberfaellig
         else v.faellig::timestamptz
       end,
       v.ziel, v.ist, v.ausschuss, v.anzahl, v.qf
from (values
  ('PA-2026-0912-01','T-N-A-01','CH-0902-14','Brigade Nord','Polka','beleg_pruefung','2026-09-02T11:00:00+06',48,51.4,4.2,6,1.08),
  ('PA-2026-0912-02','T-O-A-01','CH-0902-15','Brigade Ost','Polana','in_arbeit','2026-09-02T12:30:00+06',30,17.9,0,4,null),
  ('PA-2026-0912-03','K-A-01',null,'Brigade Nachbarbetrieb','Polka','angenommen','2026-09-02T14:00:00+06',26,0,0,5,null),
  ('PA-2026-0912-04','T-N-A-03','CH-0902-12','Brigade Nord','Polka','abgeschlossen','2026-09-01T11:00:00+06',45,44.2,5.9,6,0.97),
  ('PA-2026-0912-05','T-O-A-02',null,'Brigade Ost','Polana','offen','2026-09-02T15:30:00+06',28,0,0,4,null)
) as v(code, block, charge, brigade, sorte, status, faellig, ziel, ist, ausschuss, anzahl, qf)
join public.reihenbloecke rb on rb.code = v.block
join public.brigaden br on br.name = v.brigade
join public.sorten s on s.name = v.sorte
left join public.chargen ch on ch.code = v.charge
on conflict (code) do nothing;

insert into public.media_belege (pflueckaufgabe_id, art, aufgenommen_am, hinweis)
select pa.id, v.art::public.beleg_art, v.ts::timestamptz, v.hinweis
from (values
  ('PA-2026-0912-01','schale',     '2026-09-02T10:41:00+06','Verkaufsschale 125 g, geschlossene Fruchtdecke'),
  ('PA-2026-0912-01','reihenblock','2026-09-02T09:12:00+06','Reihenblock vor Pfluecken, Tau abgetrocknet'),
  ('PA-2026-0912-02','reihenblock','2026-09-02T08:55:00+06','Startbeleg Reihenblock'),
  ('PA-2026-0912-04','schale',     '2026-09-01T10:30:00+06','Schale mit leichtem Ueberreifeanteil'),
  ('PA-2026-0912-04','steige',     '2026-09-01T10:48:00+06','Steige 2 kg, QR-Etikett lesbar')
) as v(code, art, ts, hinweis)
join public.pflueckaufgaben pa on pa.code = v.code
where not exists (
  select 1 from public.media_belege m where m.pflueckaufgabe_id = pa.id and m.hinweis = v.hinweis
);

-- --- Steigen ------------------------------------------------------------
-- Die Steige traegt die Person. Erst damit reicht die Nachweiskette vom
-- Kunden bis zum Pfluecker - und die Pflueckleistung wird messbar.
-- Das Gewicht je Steige variiert leicht (Muster v1/v2), damit die Summe genau
-- die gemeldete Ist-Menge der jeweiligen Aufgabe ergibt - eine Abnahmepruefung
-- hat sonst zwei widerspruechliche Erntemengen auf derselben Karte bemaengelt.
insert into public.steigen (code, qr_token, charge_id, pflueckaufgabe_id, pfluecker_id, gewicht_kg, scan_zeitpunkt)
select 'STG-2026-' || lpad((v.start_nr + g.i)::text, 6, '0'),
       'qr-stg-' || (v.start_nr + g.i),
       ch.id, pa.id, pf.id,
       case v.muster
         when 'v1' then case when g.i < 3 then 1.9 else 2.0 end   -- 3x1,9 + 10x2,0 = 25,7 je Pfluecker
         when 'v2' then case when g.i = 0 then 2.1 else 2.0 end   -- 1x2,1 + 10x2,0 = 22,1 je Pfluecker
         else 2.0
       end,
       (v.scan::timestamptz + (g.i * interval '11 minutes'))
from (values
  -- CH-0902-14 / PA-01 (beleg_pruefung): 2x 13 Steigen a 25,7 kg = 51,4 kg,
  -- passend zur gemeldeten Ist-Menge.
  ('CH-0902-14','PA-2026-0912-01','MAL-0417',480,13,'2026-09-02T10:05:00+06','v1'),
  ('CH-0902-14','PA-2026-0912-01','MAL-0418',493,13,'2026-09-02T10:20:00+06','v1'),
  -- CH-0902-12 / PA-04 (abgeschlossen): 2x 11 Steigen a 22,1 kg = 44,2 kg.
  ('CH-0902-12','PA-2026-0912-04','MAL-0417',700,11,'2026-09-01T09:05:00+06','v2'),
  ('CH-0902-12','PA-2026-0912-04','MAL-0418',711,11,'2026-09-01T09:18:00+06','v2'),
  -- CH-0902-15 / PA-02 (in_arbeit): Aufgabe laeuft noch, bewusst noch nicht
  -- alle Steigen erfasst - das ist der reale Zwischenstand einer laufenden
  -- Aufgabe, kein Fehler. Eigener Nummernkreis (900+), damit er sich nicht
  -- mit dem Bereich von MAL-0418/PA-01 (493-505) ueberschneidet - eine
  -- Ueberschneidung liess vier Steigen zuvor still verschwinden.
  ('CH-0902-15','PA-2026-0912-02','MAL-0421',900,4,'2026-09-02T10:30:00+06','flat')
) as v(charge, aufgabe, ausweis, start_nr, anzahl, scan, muster)
join public.chargen ch on ch.code = v.charge
join public.pflueckaufgaben pa on pa.code = v.aufgabe
join public.pfluecker pf on pf.ausweis = v.ausweis
cross join lateral generate_series(0, v.anzahl - 1) as g(i)
on conflict (code) do nothing;

-- pflueckaufgaben.steigen_zaehler (Migration 20260915000000) treibt die
-- atomare Nummerierung neuer, echter Steigen an - der Backfill in der
-- Migration selbst laeuft zwangslaeufig VOR diesem Seed (Migrationen zuerst,
-- dann Seed), sieht also noch keine Zeile. Deshalb hier, direkt nach dem
-- Einfuegen der Demo-Steigen, der tatsaechliche Bestand nachgezogen - sonst
-- wuerde die erste echte, neu erfasste Steige eines Demo-Auftrags wieder bei
-- "-S001" beginnen, obwohl schon Steigen existieren.
update public.pflueckaufgaben p
   set steigen_zaehler = (
     select count(*) from public.steigen s where s.pflueckaufgabe_id = p.id
   );

-- --- Arbeitszeiten -------------------------------------------------------
-- Nenner der Pflueckleistung. Ohne diese Tabelle ist kg je Person und Stunde
-- strukturell nicht messbar - und damit auch das Lohnmodell nicht.
-- Die Dauer ist an die erhoehte Steigenzahl angepasst: ueber alle Personen
-- ergibt sich rund 6,2 kg/h - nahe an der in kpis.ts hinterlegten Baseline
-- von 6,1 kg/h, statt eines unplausibel doppelt so hohen Werts.
insert into public.arbeitszeiten (pfluecker_id, pflueckaufgabe_id, beginn, ende)
select pf.id, pa.id, v.beginn::timestamptz, v.ende::timestamptz
from (values
  ('MAL-0417','PA-2026-0912-01','2026-09-02T08:30:00+06','2026-09-02T12:18:00+06'),
  ('MAL-0418','PA-2026-0912-01','2026-09-02T08:30:00+06','2026-09-02T12:20:00+06'),
  ('MAL-0421','PA-2026-0912-02','2026-09-02T08:45:00+06','2026-09-02T10:52:00+06'),
  ('MAL-0417','PA-2026-0912-04','2026-09-01T08:20:00+06','2026-09-01T11:44:00+06'),
  ('MAL-0418','PA-2026-0912-04','2026-09-01T08:20:00+06','2026-09-01T11:50:00+06')
) as v(ausweis, aufgabe, beginn, ende)
join public.pfluecker pf on pf.ausweis = v.ausweis
join public.pflueckaufgaben pa on pa.code = v.aufgabe
where not exists (
  select 1 from public.arbeitszeiten a
   where a.pfluecker_id = pf.id and a.pflueckaufgabe_id = pa.id
);

-- Eine ordnungsgemaess eingehaltene Behandlung: behandelt am 20.08., Wartezeit
-- drei Tage, geerntet ab dem 26.08. So sieht ein sauberer Rueckstandsnachweis
-- aus - der Beleg, den Handel und Behoerde sehen wollen.
insert into public.pflanzenschutz_behandlungen
  (reihenblock_id, psm_mittel_id, behandelt_am, wartezeit_tage, freigegeben, aufwandmenge, aufwandmenge_einheit)
select rb.id, m.id, '2026-08-20'::date, 3, true, 1.50, 'kg_ha'::public.aufwandmenge_einheit
from public.reihenbloecke rb, public.psm_mittel m
where rb.code = 'T-N-A-01' and m.name = 'Signum'
  and not exists (
    select 1 from public.pflanzenschutz_behandlungen b
     where b.reihenblock_id = rb.id and b.behandelt_am = '2026-08-20'::date
  );

-- Rueckbindung Charge zur Pflueckaufgabe (der Trigger fuellt nur neue Faelle).
update public.chargen c
   set pflueckaufgabe_id = pa.id
  from public.pflueckaufgaben pa
 where pa.charge_id = c.id
   and c.pflueckaufgabe_id is null;

-- --- Kuehlketten-Messungen -------------------------------------------------
-- Der Messzeitpunkt haengt am Pflueckzeitpunkt der Charge. Minuten und Urteil
-- rechnet der Trigger public.kuehlkette_bewerten() - hier steht nur, wann
-- gemessen wurde und wie warm die Ware war.
insert into public.kuehlketten_messungen (charge_id, gemessen_am, temperatur_c)
select ch.id, ch.pflueck_zeitpunkt + (v.minuten * interval '1 minute'), v.temp
from (values
  ('CH-0902-14', 41,  3.8),
  ('CH-0902-15', 58,  6.1),
  ('CH-0902-12', 72,  8.4),
  ('CH-0901-07', 44,  3.2),
  ('CH-0829-04', 39,  2.9),
  ('CH-0826-01', 42,  3.4)
) as v(charge, minuten, temp)
join public.chargen ch on ch.code = v.charge
where ch.pflueck_zeitpunkt is not null
  and not exists (
    select 1 from public.kuehlketten_messungen k
     where k.charge_id = ch.id
       and k.gemessen_am = ch.pflueck_zeitpunkt + (v.minuten * interval '1 minute')
  );

-- --- Rotationsplan -------------------------------------------------------
insert into public.rotationsplan_eintraege (reihenblock_id, brigade_id, geplant_fuer, intervall_tage)
select rb.id, br.id, v.datum::date, v.intervall
from (values
  ('T-N-A-01', 'Brigade Nord', '2026-09-04', 3),
  ('T-N-A-02', 'Brigade Nord', '2026-09-03', 2),
  ('T-O-A-01', 'Brigade Ost',  '2026-09-04', 3)
) as v(block, brigade, datum, intervall)
join public.reihenbloecke rb on rb.code = v.block
join public.brigaden br on br.name = v.brigade
where not exists (
  select 1 from public.rotationsplan_eintraege r where r.reihenblock_id = rb.id and r.geplant_fuer = v.datum::date
);

-- --- Markt: B2B, Kontingente, Preislisten ---------------------------------
insert into public.b2b_kunden (name, kontakt, kundengruppe) values
  ('Handelskette A', 'Einkauf Frischeobst', 'handel'),
  ('Gastro-Distributor Almaty', 'Beschaffung', 'gastronomie'),
  -- Firma des kunde@damicon.demo-Demokontos (siehe supabase/seed-auth.mjs) -
  -- die Verknuepfung profiles.b2b_kunde_id zeigt auf diese Zeile.
  ('Almaty Fresh Market', 'Einkauf Frischware', 'einzelhandel')
  on conflict do nothing;

insert into public.kontingente (sorte_id, b2b_kunde_id, menge_kg, reserviert_kg, saison)
select s.id, k.id, v.menge, v.reserviert, '2026'
from (values
  ('Polka',  'Handelskette A',              4200, 3100),
  ('Polana', 'Gastro-Distributor Almaty',   2600, 1450),
  ('Kweli',  'Handelskette A',              1400, 900)
) as v(sorte, kunde, menge, reserviert)
join public.sorten s on s.name = v.sorte
join public.b2b_kunden k on k.name = v.kunde
where not exists (
  select 1 from public.kontingente c where c.sorte_id = s.id and c.b2b_kunde_id = k.id and c.saison = '2026'
);

insert into public.preislisten (name, gueltig_ab, aktiv) values
  ('Preisliste Herbst 2026', '2026-08-01', true)
  on conflict do nothing;

insert into public.preislisten_positionen (preisliste_id, sorte_id, preis_tenge_kg, min_menge_kg)
select pl.id, s.id, v.preis, 0
from (values
  ('Polka', 2100), ('Polana', 2050), ('Tulameen', 1850), ('Kweli', 2000)
) as v(sorte, preis)
join public.sorten s on s.name = v.sorte
cross join (select id from public.preislisten where name = 'Preisliste Herbst 2026') pl
where not exists (
  select 1 from public.preislisten_positionen p where p.preisliste_id = pl.id and p.sorte_id = s.id
);

-- Beispiel fuer eine gruppenspezifische Preisliste (Anforderung 5.1/5.2,
-- Preisstaffelung je Kundengruppe): Handelsketten kaufen in groesseren
-- Mengen ein und bekommen deshalb einen guenstigeren Polka-Preis als die
-- gruppenlose Standardliste oben - dieselbe Sorte, derselbe Zeitraum, aber
-- ein zweiter, spezifischerer Treffer in preisAmStichtag().
insert into public.preislisten (name, gueltig_ab, aktiv, kundengruppe) values
  ('Preisliste Herbst 2026 - Handel', '2026-08-01', true, 'handel')
  on conflict do nothing;

insert into public.preislisten_positionen (preisliste_id, sorte_id, preis_tenge_kg, min_menge_kg)
select pl.id, s.id, v.preis, 0
from (values
  ('Polka', 1900)
) as v(sorte, preis)
join public.sorten s on s.name = v.sorte
cross join (select id from public.preislisten where name = 'Preisliste Herbst 2026 - Handel') pl
where not exists (
  select 1 from public.preislisten_positionen p where p.preisliste_id = pl.id and p.sorte_id = s.id
);

insert into public.vorbestellungen (b2b_kunde_id, sorte_id, menge_kg, liefertermin, status)
select k.id, s.id, v.menge, v.termin::date, v.status::public.vorbestellung_status
from (values
  ('Handelskette A', 'Polka', 320, '2026-09-04', 'bestaetigt'),
  ('Gastro-Distributor Almaty', 'Polana', 180, '2026-09-05', 'angefragt')
) as v(kunde, sorte, menge, termin, status)
join public.b2b_kunden k on k.name = v.kunde
join public.sorten s on s.name = v.sorte
where not exists (
  select 1 from public.vorbestellungen vb where vb.b2b_kunde_id = k.id and vb.sorte_id = s.id and vb.liefertermin = v.termin::date
);

-- --- Aggregator: Zukauf --------------------------------------------------
insert into public.zukauf_positionen (nachbarbetrieb_id, charge_id, sorte_id, menge_kg, preis_tenge_kg, rechnungsdatum)
select n.id, null, s.id, 210, 1400, '2026-09-01'::date
from public.nachbarbetriebe n, public.sorten s
where n.name = 'Nachbarbetrieb Kaskelen' and s.name = 'Polka'
and not exists (select 1 from public.zukauf_positionen z where z.nachbarbetrieb_id = n.id);

-- Zweiter Fall: eine eigene Charge je Fremdbetrieb (reihenblock_id = null),
-- genau das Muster, das public.zukauf_positionen_importieren() beim
-- CSV-Import anlegt (WMCNL-1453) - Preis und Rechnungsdatum bewusst noch
-- offen, wie es der echte Ablauf vor dem Rechnungseingang zeigt.
insert into public.chargen (code, sorte_id, ernte_datum, status)
select 'ZUK-SEED-0001', s.id, '2026-09-05'::date, 'offen'
from public.sorten s
where s.name = 'Polana'
on conflict (code) do nothing;

insert into public.zukauf_positionen (nachbarbetrieb_id, charge_id, sorte_id, menge_kg, preis_tenge_kg, rechnungsdatum)
select n.id, c.id, c.sorte_id, 150, null, null
from public.nachbarbetriebe n, public.chargen c
where n.name = 'Nachbarbetrieb Uzynagash' and c.code = 'ZUK-SEED-0001'
and not exists (select 1 from public.zukauf_positionen z where z.nachbarbetrieb_id = n.id);

-- --- Schulungsvideos --------------------------------------------------------
insert into public.schulungsvideos (titel, thema, dauer_sekunden, sprachen) values
  ('Richtig pfluecken - reife Frucht erkennen', 'Ernte',      252, array['kk','ru','tr']),
  ('Steige befuellen und QR-Etikett scannen',   'Feld',       185, array['kk','ru']),
  ('Die Stunde nach dem Pfluecken - Kuehlkette','Hof',        340, array['kk','ru','tr','de']),
  ('Hygiene und Handschuhe',                    'Qualitaet',  168, array['kk','ru'])
  on conflict do nothing;

-- --- Finanzen: Kostentraeger + Ledger ------------------------------------
-- b2b_kunde_id (Migration 20260909000000, Anforderung 4.2): derselbe Kunde
-- wie in der zugehoerigen Ledger-Buchung unten ("Lieferung Handelskette A"
-- usw.) - der Zukauf-Kostentraeger K-A-01 bleibt ohne Kunde, weil die
-- Weiterverkaufsseite dort noch nicht aufgeloest ist.
insert into public.kostentraeger (reihenblock_id, sorte_id, b2b_kunde_id, erntetag, bezeichnung)
select rb.id, s.id, k.id, v.tag::date, v.code || ' / ' || v.tag
from (values
  ('T-N-A-01','Polka','Handelskette A','2026-08-30'),
  ('T-N-A-03','Polka','Handelskette A','2026-08-29'),
  ('T-O-A-01','Polana','Gastro-Distributor Almaty','2026-08-31'),
  ('K-A-01','Polka',null,'2026-08-30')
) as v(code, sorte, kunde, tag)
join public.reihenbloecke rb on rb.code = v.code
join public.sorten s on s.name = v.sorte
left join public.b2b_kunden k on k.name = v.kunde
on conflict (reihenblock_id, sorte_id, erntetag) do nothing;

insert into public.finance_ledger_entries (kostentraeger_id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung)
select kt.id, v.typ::public.ledger_typ, v.kategorie, v.betrag::numeric, v.tag::date, v.beschreibung
from (values
  ('T-N-A-01','2026-08-30','erloes','B2B-Verkauf','108780','Lieferung Handelskette A'),
  ('T-N-A-01','2026-08-30','kosten','Ernte + Kuehlung','41200','Brigade Nord, Vorkuehlung'),
  ('T-N-A-03','2026-08-29','erloes','B2B-Verkauf','92820','Lieferung Handelskette A'),
  ('T-N-A-03','2026-08-29','kosten','Ernte + Kuehlung','38900','Brigade Nord'),
  ('T-O-A-01','2026-08-31','erloes','B2B-Verkauf','61500','Lieferung Gastro-Distributor'),
  ('T-O-A-01','2026-08-31','kosten','Ernte + Kuehlung','27300','Brigade Ost'),
  ('K-A-01','2026-08-30','erloes','B2B-Verkauf','54600','Zukauf-Charge'),
  ('K-A-01','2026-08-30','kosten','Zukauf + Handling','44100','Nachbarbetrieb Kaskelen')
) as v(block, tag, typ, kategorie, betrag, beschreibung)
join public.reihenbloecke rb on rb.code = v.block
join public.kostentraeger kt on kt.reihenblock_id = rb.id and kt.erntetag = v.tag::date
where not exists (
  select 1 from public.finance_ledger_entries fle
  where fle.kostentraeger_id = kt.id and fle.typ = v.typ::public.ledger_typ and fle.betrag_tenge = v.betrag::numeric
);

-- Anforderung 3.3: eine Buchung, die direkt an einer Charge haengt statt nur
-- am (groeberen) Kostentraeger - reihenblock_id bleibt bewusst null (wie ein
-- Zukauf-Fall), damit kein Konflikt mit der Unique-Constraint auf
-- (reihenblock_id, sorte_id, erntetag) bestehender Chargen entstehen kann.
-- Dasselbe Beispiel steht fuer die gehostete Instanz in Migration
-- 20260923010000_deckungsbeitrag_je_charge_beispiel.sql - seed.sql wirkt nur
-- bei einem lokalen db reset.
insert into public.chargen (code, reihenblock_id, sorte_id, ernte_datum)
select 'CH-BEISPIEL-JE-CHARGE', null, s.id, '2026-08-28'::date
from public.sorten s
order by s.name
limit 1
on conflict do nothing;

insert into public.finance_ledger_entries (charge_id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung)
select c.id, v.typ::public.ledger_typ, v.kategorie, v.betrag::numeric, '2026-08-28'::date, v.beschreibung
from public.chargen c
join (values
  ('erloes','B2B-Verkauf','20000','Beispielbuchung direkt an der Charge'),
  ('kosten','Ernte + Kuehlung','8000','Beispielbuchung direkt an der Charge')
) as v(typ, kategorie, betrag, beschreibung) on true
where c.code = 'CH-BEISPIEL-JE-CHARGE'
and not exists (
  select 1 from public.finance_ledger_entries fle where fle.charge_id = c.id
);

-- --- Lohn (WMCNL-1444) ---------------------------------------------------
-- Lohnsatz: Grundlage der neuen Berechnungsfunktion public.lohn_periode_berechnen().
-- Zahlen sind Annahmen (wie beim Vorbild aus dem Schwesterprojekt: "ein
-- erfundener Satz in einer Lohnrechnung ist schlimmer als ein leeres Feld") -
-- gueltig ab Saisonbeginn, damit sowohl die Alt-Periode unten als auch echte
-- Berechnungslaeufe ueber die granularen Arbeitszeiten/Steigen einen Satz
-- finden.
insert into public.lohn_saetze
  (gueltig_ab, stundenlohn_tenge, kg_satz_tenge, qualitaets_ziel_ausschussquote,
   qualitaetsfaktor_min, qualitaetsfaktor_max, notiz)
select '2026-01-01'::date, 900, 850, 5.00, 0.90, 1.10,
       'Annahme fuer den Prototyp - noch keine mit dem Kunden bestaetigte Zahl.'
where not exists (select 1 from public.lohn_saetze where gueltig_ab = '2026-01-01'::date);

-- Diese zwei Zeilen stammen aus der Zeit vor der Satztabelle und tragen
-- hartkodierte Betraege ohne Rechengrundlage (der Bug, den WMCNL-1444 behebt).
-- Sie bleiben als Bestandsdaten stehen (Periode 25.-31.08. hat ohnehin keine
-- granularen Arbeitszeiten/Steigen hinterlegt, eine Neuberechnung wuerde sie
-- schlicht nicht antreffen); die tatsaechlich berechneten Abrechnungen fuer
-- die Tage mit echten Erfassungen (01.-02.09., siehe Pflueckaufgaben/Steigen/
-- Arbeitszeiten unten) entstehen ueber public.lohn_periode_berechnen(), von
-- der Buchhaltung im Dashboard ausgeloest oder im Integrationstest.
insert into public.lohn_abrechnungen
  (pfluecker_id, periode_start, periode_ende, grundlohn_tenge, mengen_komponente_tenge, qualitaetsfaktor, gesamt_tenge, status)
select p.id, '2026-08-25'::date, '2026-08-31'::date, 35000, v.menge, v.qf, v.gesamt, 'entwurf'
from (values
  ('MAL-0417', 22000, 1.06, 60420),
  ('MAL-0418', 24500, 1.11, 65895)
) as v(ausweis, menge, qf, gesamt)
join public.pfluecker p on p.ausweis = v.ausweis
where not exists (
  select 1 from public.lohn_abrechnungen la where la.pfluecker_id = p.id and la.periode_start = '2026-08-25'::date
);

-- --- Dokumente --------------------------------------------------------------
insert into public.dokumente (name, kategorie, bezug, stand, status)
select v.name, v.kat::public.dokument_kategorie, v.bezug, v.stand::date, v.status::public.dokument_status
from (values
  ('Spritzprotokoll KW 36 - Parzelle Nord','spritzmittelprotokoll','T-N-A-04, T-N-B-01','2026-09-01','gueltig'),
  ('ESUTD-Sammelnachweis Saisonkraefte','esutd_nachweis','42 Vertraege','2026-08-28','prueflauf'),
  ('Rahmenliefervertrag Handelskette A','liefervertrag','Kontingent Polka 3100 kg','2026-08-15','gueltig'),
  ('Foerderdossier gosagro.kz - Kuehlhaus','foerderdossier','Antrag 2026-114','2026-08-30','prueflauf'),
  ('GlobalG.A.P.-Zertifikat','zertifikat','Betrieb','2025-11-02','gueltig'),
  ('Spritzprotokoll KW 30 - Parzelle Sued','spritzmittelprotokoll','I-S-B-01','2026-07-20','abgelaufen')
) as v(name, kat, bezug, stand, status)
where not exists (select 1 from public.dokumente d where d.name = v.name);

insert into public.foerderdossiers (portal, antragsnummer, titel, status, eingereicht_am) values
  ('gosagro.kz', '2026-114', 'Foerderung Vorkuehlanlage', 'eingereicht', '2026-08-30')
  on conflict do nothing;

-- Anforderung 4.12: Verknuepfung zum Nachweisdokument oben. Der gleichlautende
-- Backfill in der Migration 20260925000000 wirkt nur auf der bereits laenger
-- gepflegten gehosteten Instanz (dort standen beide Zeilen schon, bevor die
-- Migration lief) - bei einem frischen Aufbau (Migrationen laufen VOR diesem
-- Skript) traf er noch auf leere Tabellen. Hier, nachdem beide Zeilen oben
-- garantiert existieren, greift er zuverlaessig.
update public.dokumente d
   set foerderdossier_id = f.id
  from public.foerderdossiers f
 where d.bezug = 'Antrag ' || f.antragsnummer
   and d.foerderdossier_id is null;

-- --- Compliance: Zweckverzeichnis, Einwilligungen, Vorfaelle --------------
-- public.profiles ist an dieser Stelle noch leer (Auth-Nutzer entstehen erst
-- ueber `npm run db:seed-auth` NACH diesem Skript) - Betroffene und Akteure
-- werden deshalb ausschliesslich ueber pfluecker/b2b_kunden gesetzt.
insert into public.verarbeitungszwecke
  (code, bezeichnung, beschreibung, rechtsgrundlage, aufbewahrung_monate, automatisierte_entscheidung)
values
  ('personaleinsatz', 'Personaleinsatz und Lohnabrechnung',
   'Einsatzplanung, Arbeitszeit und Qualitaetsfaktor-Lohn der Saisonkraefte.',
   'vertrag', 36, true),
  ('auftragsabwicklung', 'Auftragsabwicklung und Lieferung',
   'Kontingent, Bestellung und Lieferschein je B2B-Kunde.',
   'vertrag', 60, false),
  ('esutd_meldung', 'Meldung an ESUTD (enbek.kz)',
   'Gesetzlich vorgeschriebene Arbeitsvertragserfassung der Saisonkraefte.',
   'gesetzliche_pflicht', 60, false),
  ('ki_chat', 'KI-Chat-Assistent im B2B-Portal',
   'Automatisierte Beantwortung von Kundenanfragen (Gesetz Nr. 230-VIII: Transparenzpflicht).',
   'einwilligung', 12, true)
  on conflict (code) do nothing;

insert into public.einwilligungen
  (betroffener_pfluecker_id, zweck_id, textfassung, sprache, erteilt_am, kanal, nachweis_referenz)
select p.id, z.id, v.textfassung, v.sprache, v.erteilt::timestamptz, v.kanal::public.einwilligung_kanal, v.nachweis
from (values
  ('D. Sarsenbaj',  'personaleinsatz', 'Einwilligungstext Saisonkraefte, Fassung 2026-1', 'ru', '2026-08-20T08:00:00+06', 'papier', 'Ordner Personal 2026/03, Blatt 17'),
  ('N. Erbolat',    'personaleinsatz', 'Einwilligungstext Saisonkraefte, Fassung 2026-1', 'ru', '2026-08-21T08:00:00+06', 'papier', 'Ordner Personal 2026/03, Blatt 22')
) as v(pfluecker, zweck, textfassung, sprache, erteilt, kanal, nachweis)
join public.pfluecker p on p.name = v.pfluecker
join public.verarbeitungszwecke z on z.code = v.zweck
where not exists (
  select 1 from public.einwilligungen e
   where e.betroffener_pfluecker_id = p.id and e.zweck_id = z.id
);

-- Eine widerrufene Einwilligung, damit das Cockpit "offene Widerrufe" nicht
-- nur auf leeren Daten zeigt.
insert into public.einwilligungen
  (betroffener_pfluecker_id, zweck_id, textfassung, sprache, erteilt_am, kanal, nachweis_referenz,
   widerrufen_am, widerruf_grund)
select p.id, z.id, 'Einwilligungstext Saisonkraefte, Fassung 2026-1', 'ru',
       '2026-07-01T08:00:00+06', 'papier', 'Ordner Personal 2026/02, Blatt 05',
       '2026-08-10T09:00:00+06', 'Beschaeftigungsverhaeltnis beendet'
  from public.pfluecker p, public.verarbeitungszwecke z
 where p.name = 'A. Tulegenowa' and z.code = 'personaleinsatz'
   and not exists (
     select 1 from public.einwilligungen e
      where e.betroffener_pfluecker_id = p.id and e.widerrufen_am is not null
   );

insert into public.einwilligungen
  (betroffener_b2b_kunde_id, zweck_id, textfassung, sprache, erteilt_am, kanal, nachweis_referenz)
select k.id, z.id, v.textfassung, 'ru', v.erteilt::timestamptz, v.kanal::public.einwilligung_kanal, v.nachweis
from (values
  ('Handelskette A',             'auftragsabwicklung', 'Rahmenvereinbarung Datenverarbeitung B2B, Fassung 2026-1', '2026-08-15T08:00:00+06', 'web', 'Portal-Registrierung #A-2026-041'),
  ('Gastro-Distributor Almaty',  'auftragsabwicklung', 'Rahmenvereinbarung Datenverarbeitung B2B, Fassung 2026-1', '2026-08-18T08:00:00+06', 'app', 'Portal-Registrierung #A-2026-052')
) as v(kunde, zweck, textfassung, erteilt, kanal, nachweis)
join public.b2b_kunden k on k.name = v.kunde
join public.verarbeitungszwecke z on z.code = v.zweck
where not exists (
  select 1 from public.einwilligungen e
   where e.betroffener_b2b_kunde_id = k.id and e.zweck_id = z.id
);

-- Fachliches Zugriffsprotokoll: nur die Faelle export/druck/uebermittlung,
-- kein Eintrag je Seitenaufruf (siehe Kommentar in der Migration).
insert into public.personenbezogene_zugriffe
  (betroffener_pfluecker_id, zweck_id, aktion, entitaet, client_info)
select p.id, z.id, 'export'::public.zugriffsaktion, 'lohn_abrechnungen', 'Buchhaltung - Monatsabschluss August 2026'
  from public.pfluecker p, public.verarbeitungszwecke z
 where p.name = 'D. Sarsenbaj' and z.code = 'personaleinsatz'
   and not exists (
     select 1 from public.personenbezogene_zugriffe g
      where g.betroffener_pfluecker_id = p.id and g.entitaet = 'lohn_abrechnungen'
   );

insert into public.personenbezogene_zugriffe
  (betroffener_b2b_kunde_id, zweck_id, aktion, entitaet, client_info)
select k.id, z.id, 'uebermittlung'::public.zugriffsaktion, 'lieferungen', 'ISESF-Uebermittlung Lieferschein CH-0902-14'
  from public.b2b_kunden k, public.verarbeitungszwecke z
 where k.name = 'Handelskette A' and z.code = 'auftragsabwicklung'
   and not exists (
     select 1 from public.personenbezogene_zugriffe g
      where g.betroffener_b2b_kunde_id = k.id and g.entitaet = 'lieferungen'
   );

-- Datenschutzvorfaelle: einer noch offen (Meldefrist bereits ueberschritten -
-- das Cockpit soll den kritischen Fall auch mit Beispieldaten zeigen koennen),
-- einer bereits ordnungsgemaess gemeldet und behoben.
insert into public.datenschutzvorfaelle (festgestellt_am, art, beschreibung, betroffene_anzahl)
select '2026-08-25T14:00:00+06'::timestamptz, 'unbefugter_zugriff'::public.vorfall_art,
       'Unpersoenliches Konto im Buero blieb nach Personalwechsel eine Woche aktiv.', 1
where not exists (
  select 1 from public.datenschutzvorfaelle
   where beschreibung = 'Unpersoenliches Konto im Buero blieb nach Personalwechsel eine Woche aktiv.'
);

insert into public.datenschutzvorfaelle
  (festgestellt_am, art, beschreibung, betroffene_anzahl, gemeldet_am, meldereferenz, behoben_am)
select '2026-07-10T09:00:00+06'::timestamptz, 'verlust'::public.vorfall_art,
       'USB-Stick mit ESUTD-Sammelnachweis auf dem Transport zur Plantage Issyk verlegt, am Folgetag wiedergefunden.',
       42, '2026-07-11T08:00:00+06'::timestamptz, 'Meldung enbek.kz Nr. 2026-0710', '2026-07-11T16:00:00+06'::timestamptz
where not exists (
  select 1 from public.datenschutzvorfaelle
   where meldereferenz = 'Meldung enbek.kz Nr. 2026-0710'
);

-- Drittweitergaben: eine noch nicht benachrichtigte (Frist bereits ueberschritten)
-- und eine bereits benachrichtigte.
insert into public.drittweitergaben
  (betroffener_pfluecker_id, empfaenger, zweck_id, weitergegeben_am)
select p.id, 'ESUTD (enbek.kz)', z.id, '2026-08-05T08:00:00+06'::timestamptz
  from public.pfluecker p, public.verarbeitungszwecke z
 where p.name = 'M. Qojschybaj' and z.code = 'esutd_meldung'
   and not exists (
     select 1 from public.drittweitergaben d
      where d.betroffener_pfluecker_id = p.id and d.empfaenger = 'ESUTD (enbek.kz)'
   );

insert into public.drittweitergaben
  (betroffener_b2b_kunde_id, empfaenger, zweck_id, weitergegeben_am, benachrichtigt_am)
select k.id, 'ISESF - elektronische Rechnungsstellung', z.id,
       '2026-08-15T08:00:00+06'::timestamptz, '2026-08-16T09:00:00+06'::timestamptz
  from public.b2b_kunden k, public.verarbeitungszwecke z
 where k.name = 'Handelskette A' and z.code = 'auftragsabwicklung'
   and not exists (
     select 1 from public.drittweitergaben d
      where d.betroffener_b2b_kunde_id = k.id and d.empfaenger = 'ISESF - elektronische Rechnungsstellung'
   );

-- --- Reklamationsmanagement (WMCNL-1455) ------------------------------------
-- CH-0902-12 hatte laut audit_events oben tatsaechlich einen
-- Kuehlkette-Verstoss (72 Minuten) - die erste Reklamation greift genau das
-- auf, damit die Nachweiskette von der Reklamation bis zur Messung durchgeht.
insert into public.reklamationen
  (code, charge_id, b2b_kunde_id, grund, betreff, beschreibung, betroffene_menge_kg, status, gemeldet_am)
select 'REK-20260903-0001', c.id, k.id, 'temperatur'::public.reklamation_grund,
       'Ware bei Anlieferung zu warm',
       'Kuehlkette laut Messprotokoll erst nach 72 Minuten erreicht (siehe audit_events kuehlkette.verstoss). Kunde meldet weiche, ueberreife Beeren bei Anlieferung.',
       44.2, 'in_pruefung'::public.reklamation_status, '2026-09-03T09:10:00+06'::timestamptz
  from public.chargen c, public.b2b_kunden k
 where c.code = 'CH-0902-12' and k.name = 'Handelskette A'
   and not exists (select 1 from public.reklamationen where code = 'REK-20260903-0001');

insert into public.reklamationen
  (code, charge_id, b2b_kunde_id, grund, betreff, beschreibung, betroffene_menge_kg, status, gemeldet_am)
select 'REK-20260903-0002', c.id, k.id, 'menge'::public.reklamation_grund,
       'Gelieferte Menge unter Bestellmenge',
       'Laut Lieferschein 49,5 kg angekuendigt, im Wareneingang wurden nur 46,0 kg gewogen.',
       3.5, 'offen'::public.reklamation_status, '2026-09-03T14:20:00+06'::timestamptz
  from public.chargen c, public.b2b_kunden k
 where c.code = 'CH-0901-07' and k.name = 'Gastro-Distributor Almaty'
   and not exists (select 1 from public.reklamationen where code = 'REK-20260903-0002');

-- Bereits abgeschlossener Fall ohne Chargenbezug (der Kunde ordnet die
-- durchnaessten Kartons keiner einzelnen Charge zu) - zeigt, dass charge_id
-- bewusst nullable ist.
insert into public.reklamationen
  (code, b2b_kunde_id, grund, betreff, beschreibung, status, gemeldet_am, erledigt_am, loesung, gutschrift_tenge)
select 'REK-20260821-0003', k.id, 'verpackung'::public.reklamation_grund,
       'Kartons bei Anlieferung durchnaesst',
       'Zwei von acht Kartons waren an der Unterseite durchnaesst, Ware in diesen Kartons nicht mehr verkaufsfaehig.',
       'erledigt'::public.reklamation_status, '2026-08-20T10:00:00+06'::timestamptz,
       '2026-08-22T09:00:00+06'::timestamptz,
       'Gutschrift fuer zwei Kartons erteilt, Verpackungsvorgabe an die Logistik nachgeschaerft.',
       15000
  from public.b2b_kunden k
 where k.name = 'Almaty Fresh Market'
   and not exists (select 1 from public.reklamationen where code = 'REK-20260821-0003');

-- Verlauf von Hand statt ueber den Status-Protokoll-Trigger: der Trigger
-- feuert nur bei UPDATE (siehe Migration), Seed-Zeilen werden aber direkt mit
-- ihrem Zielstatus eingefuegt.
insert into public.reklamation_ereignisse (reklamation_id, text, sichtbar_fuer_kunde, created_at)
select r.id, 'Reklamation gemeldet: ' || r.betreff, true, r.gemeldet_am
  from public.reklamationen r
 where r.code in ('REK-20260903-0001', 'REK-20260903-0002', 'REK-20260821-0003')
   and not exists (
     select 1 from public.reklamation_ereignisse e
      where e.reklamation_id = r.id and e.text = 'Reklamation gemeldet: ' || r.betreff
   );

insert into public.reklamation_ereignisse (reklamation_id, neuer_status, text, sichtbar_fuer_kunde, created_at)
select r.id, 'in_pruefung'::public.reklamation_status,
       'Kuehlkurve wird mit dem Messprotokoll der Charge abgeglichen.', true,
       '2026-09-03T15:00:00+06'::timestamptz
  from public.reklamationen r
 where r.code = 'REK-20260903-0001'
   and not exists (
     select 1 from public.reklamation_ereignisse e
      where e.reklamation_id = r.id and e.neuer_status = 'in_pruefung'
   );

insert into public.reklamation_ereignisse (reklamation_id, neuer_status, text, sichtbar_fuer_kunde, created_at)
select r.id, 'erledigt'::public.reklamation_status, r.loesung, true, r.erledigt_am
  from public.reklamationen r
 where r.code = 'REK-20260821-0003'
   and not exists (
     select 1 from public.reklamation_ereignisse e
      where e.reklamation_id = r.id and e.neuer_status = 'erledigt'
   );

insert into public.audit_events (actor, aktion, ressource, metadata) values
  ('system', 'behandlung.erfasst', 'pflanzenschutz_behandlungen', '{"block":"T-N-A-04","mittel":"Signum"}'),
  ('system', 'reihenblock.gesperrt', 'reihenbloecke', '{"block":"T-N-A-04","grund":"wartezeit"}'),
  ('system', 'kuehlkette.verstoss', 'kuehlketten_messungen', '{"charge":"CH-0902-12","minuten":72}')
  on conflict do nothing;

insert into public.integrationen (key, name, system, status) values
  ('esf',       'Elektronische Rechnung / Warenbegleitschein', 'ISESF',                   'sandbox'),
  ('esutd',     'Arbeitsvertragserfassung',                    'ESUTD (enbek.kz)',        'sandbox'),
  ('virt_lager','Virtueller Lagerbestand',                      'Gosdohody / virt. Lager', 'geplant'),
  ('gosagro',   'Foerdermittelportal',                          'gosagro.kz',              'geplant'),
  ('qoldau',    'Subventionsportal',                            'qoldau.kz',               'geplant')
  on conflict (key) do nothing;

insert into public.integration_outbox (ziel_system, payload, status) values
  ('ISESF', '{"typ":"lieferschein","charge":"CH-0902-14"}', 'pending'),
  ('ISESF', '{"typ":"lieferschein","charge":"CH-0902-15"}', 'pending'),
  ('ISESF', '{"typ":"lieferschein","charge":"CH-0902-12"}', 'pending'),
  ('ESUTD', '{"typ":"vertrag","batch":"saison-2026"}',       'pending')
  on conflict do nothing;

-- --- KPI-Baseline: die 14 Kennzahlen aus der Marktanalyse Kapitel 4.10 -------
insert into public.kpi_baseline (key, name, zone, ziel, baseline_wert, gut_richtung, unterschrieben_am) values
  ('verlustquote',          'Verlustquote vom Pfluecken bis zum Kunden',            'hof',   '< 6 %',      '8,4 %',    'down', null),
  ('vermarktungsfaehig',    'Anteil vermarktungsfaehiger Schalen',                  'hof',   '> 90 %',     '82 %',     'up',   null),
  ('zeitBisVorkuehlung',    'Zeit vom Pfluecken bis zur Vorkuehlung',               'hof',   '< 60 min',   '47 min',   'down', null),
  ('zeitBisKunde',          'Zeit vom Pfluecken bis zum Kunden',                    'hof',   '< 24 h',     '19 h',     'down', null),
  ('pflueckleistung',       'Pflueckleistung je Person und Stunde',                 'feld',  '> 7 kg/h',   '6,1 kg/h', 'up',   null),
  ('pflueckStreuung',       'Streuung der Pflueckleistung (beste zu schwaechste)',  'feld',  '< 1,8x',     '2,3x',     'down', null),
  ('pflueckintervall',      'Eingehaltenes Pflueckintervall je Reihenblock',        'feld',  '> 95 %',     '84 %',     'up',   null),
  ('behandlungenWartezeit', 'Behandlungen mit eingehaltener Wartezeit',             'feld',  '100 %',      '96 %',     'up',   null),
  ('reklamationsquote',     'Reklamationsquote',                                    'markt', '< 2 %',      '3,2 %',    'down', null),
  ('liefertreue',           'Liefertreue (puenktlich und vollstaendig)',            'markt', '> 97 %',     '91 %',     'up',   null),
  ('belegteVerkaeufe',      'Anteil belegter Verkaeufe (ESF und Warenbegleitschein)','buero','100 %',      '71 %',     'up',   null),
  ('deckungsbeitrag',       'Deckungsbeitrag je kg',                                'buero', '> 700 ₸/kg', '640 ₸/kg', 'up',   null),
  ('esutdAbdeckung',        'Abdeckung der Saisonkraefte in ESUTD',                 'buero', '100 %',      '64 %',     'up',   null),
  ('websiteAnfragen',       'Anfragen ueber die Website je Monat',                  'markt', 'Ausgangswert','12',      'up',   null)
  on conflict (key) do nothing;
