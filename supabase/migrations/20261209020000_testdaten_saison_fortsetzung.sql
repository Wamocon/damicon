-- Testdaten Saisonfortsetzung 25.09. bis 15.10.2026 (Datenänderung, idempotent).
--
-- Der Bestand endet am 24.09.2026. Alles, was auf "die letzten Tage" schaut (Wetter, Kühlkette, Lieferungen, Arbeitszeiten,
-- Lohn, Deckungsbeitrag), steht seitdem leer. Diese Migration setzt die Herbsternte fort, bis zum ersten Frost am 14.10.2026:
--
--   16 Pflückaufgaben (Polka und Polana auf den erntereifen Blöcken), jede mit Charge, Steigen, Arbeitszeiten, eine Kühlmessung,
--   Touren und Lieferungen mit Übergabequittung, Transporttemperaturen, Vorbestellungen, sechs Zukaufpositionen, zwei Reklamationen
--   und das Wetter vom 20.09. bis 15.10. (Herbstgang, Kälteeinbruch am 08./09.10., erster Frost am 14.10.).
--
-- Die Daten gehen durch dieselben Trigger wie jede Erfassung in der Anwendung. Nur die Prüfung der Transportmessung auf
-- "noch nicht zugestellt" wird für die Dauer des Einfügens abgeschaltet, weil eine nachträglich erzeugte Historie die Lieferung
-- schon als zugestellt trägt.
--
-- Schutz: Die Migration greift nur, wenn Betriebsdaten da sind (erntereife Blöcke, Pflücker, Kunden). Eine leere Datenbank
-- (CI, lokaler Stack vor dem Seed) bleibt unverändert. Jede Zeile trägt eine feste Kennung 7e57da7a-0000-4000-8000-... (Testdaten),
-- ein zweiter Lauf ändert nichts. Die Chargen entstehen per Trigger und hängen über pflueckaufgabe_id an diesen Kennungen.

-- ------------------------------------------------------------------------------------------------------------------------------
-- Bezugsdaten
-- ------------------------------------------------------------------------------------------------------------------------------
create temp table _bloecke as
select row_number() over (order by b.code) as rn, b.id, b.sorte_id
  from public.reihenbloecke b
 where b.status = 'erntereif' and b.sorte_id is not null;

create temp table _leute as
select row_number() over (order by p.ausweis) as rn, p.id, p.brigade_id
  from public.pfluecker p
 where p.ausweis not ilike 'TEST%';

create temp table _kunden as
select row_number() over (order by k.created_at, k.name) as rn, k.id, k.name
  from public.b2b_kunden k;

-- Ernteplan: ein Eintrag je Pflückaufgabe. Zufall ist deterministisch (hashtext), derselbe Lauf ergibt dieselben Zahlen.
create temp table _ernte as
with tage(nr, tag) as (
  values (1,  date '2026-09-25'), (2,  date '2026-09-26'), (3,  date '2026-09-28'), (4,  date '2026-09-29'),
         (5,  date '2026-09-30'), (6,  date '2026-10-01'), (7,  date '2026-10-02'), (8,  date '2026-10-03'),
         (9,  date '2026-10-05'), (10, date '2026-10-06'), (11, date '2026-10-07'), (12, date '2026-10-08'),
         (13, date '2026-10-09'), (14, date '2026-10-10'), (15, date '2026-10-12'), (16, date '2026-10-13')
), zahl as (
  select t.nr, t.tag,
         (abs(hashtext('ernte:' || t.nr || ':1'))::numeric % 1000) / 1000.0 as u1,
         (abs(hashtext('ernte:' || t.nr || ':2'))::numeric % 1000) / 1000.0 as u2,
         (abs(hashtext('ernte:' || t.nr || ':3'))::numeric % 1000) / 1000.0 as u3,
         (abs(hashtext('ernte:' || t.nr || ':4'))::numeric % 1000) / 1000.0 as u4
    from tage t
), plan as (
  select z.*,
         ('7e57da7a-0000-4000-8000-10' || lpad(z.nr::text, 4, '0') || '000000')::uuid as aufgabe_id,
         (select b.id from _bloecke b where b.rn = ((z.nr - 1) % (select nullif(count(*), 0) from _bloecke)) + 1) as block_id,
         (select b.sorte_id from _bloecke b where b.rn = ((z.nr - 1) % (select nullif(count(*), 0) from _bloecke)) + 1) as sorte_id,
         (select l.brigade_id from _leute l where l.rn = ((z.nr - 1) % (select nullif(count(*), 0) from _leute)) + 1) as brigade_id,
         round(112 - 3.6 * z.nr + 14 * z.u1) as ziel,
         2 + (z.nr % 3) as leute
    from zahl z
)
select p.nr, p.tag, p.aufgabe_id, p.block_id, p.sorte_id, p.brigade_id, p.leute, p.ziel,
       round(p.ziel * (0.90 + 0.16 * p.u2), 1) as ist,
       round(p.ziel * (0.90 + 0.16 * p.u2) * (0.034 + 0.034 * p.u3), 1) as ausschuss,
       round(0.95 + 0.14 * p.u4, 2) as qf,
       ((p.tag + time '06:00') at time zone 'Asia/Almaty') as beginn,
       ((p.tag + time '08:00') at time zone 'Asia/Almaty') as gepflueckt,
       -- Zwei Aufgaben (1. und 9.10.) überschreiten die Sechzig-Minuten-Regel der Vorkühlung, die übrigen liegen bei 24 bis 46 Minuten.
       case when p.nr in (6, 13) then round(66 + 8 * p.u1) else round(24 + 22 * p.u2) end::integer as verzug,
       round(2.2 + 1.8 * p.u3, 1) as temp1
  from plan p
 where p.block_id is not null and p.brigade_id is not null
   and exists (select 1 from _kunden)
   and not exists (select 1 from public.pflueckaufgaben a where a.id = p.aufgabe_id);

-- Mannschaft je Aufgabe: vorwärts durch die Pflückerliste, reihum.
create temp table _team as
select e.nr, k.k, l.id as pfluecker_id
  from _ernte e
 cross join lateral generate_series(0, e.leute - 1) as k(k)
  join _leute l on l.rn = ((e.nr + k.k - 1) % (select count(*) from _leute)) + 1;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Wetter 20.09. bis 15.10. (betriebsweite Reihe; die Temperatursumme läuft als Tagesmittel minus 5 Grad weiter)
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.wetter_messungen (id, feldparzelle_id, gemessen_am, temp_min_c, temp_max_c, niederschlag_mm, temperatursumme)
with letzte as (
  select w.gemessen_am as tag, w.temperatursumme as summe
    from public.wetter_messungen w
   where w.feldparzelle_id is null
   order by w.gemessen_am desc
   limit 1
), tage as (
  select d::date as tag, row_number() over (order by d) as n
    from letzte l, generate_series(l.tag + 1, date '2026-10-15', interval '1 day') as d
   where l.tag >= date '2026-09-01' and l.tag < date '2026-10-15'
), werte as (
  select t.tag, t.n,
         -- Mittel von 20 Grad am 20.09. auf knapp 9 Grad am 15.10.; Kaltlufteinbruch am 8. und 9.10.; Frost in der Nacht auf den 14.10.
         (20 - (t.tag - date '2026-09-20') * 0.44
            - case when t.tag in (date '2026-10-08', date '2026-10-09') then 4.5 else 0 end) as mittel,
         (abs(hashtext('wetter:' || t.tag || ':a'))::numeric % 1000) / 1000.0 as ua,
         (abs(hashtext('wetter:' || t.tag || ':b'))::numeric % 1000) / 1000.0 as ub,
         (abs(hashtext('wetter:' || t.tag || ':c'))::numeric % 1000) / 1000.0 as uc
    from tage t
), tag_werte as (
  select w.tag, w.n,
         case w.tag when date '2026-10-14' then -0.8 when date '2026-10-15' then 0.4
              else round(w.mittel - 6.5 - 2.0 * w.ua, 1) end as tmin,
         round(w.mittel + 5.5 + 3.0 * w.ub, 1) as tmax,
         case w.tag when date '2026-10-07' then 11.4 when date '2026-10-08' then 6.8 when date '2026-09-24' then 4.2
              when date '2026-09-27' then 2.6 when date '2026-10-02' then 0.8
              else case when w.uc > 0.9 then round(1 + 8 * w.uc, 1) else 0 end end as regen
    from werte w
)
select ('7e57da7a-0000-4000-8000-50' || lpad(extract(day from tw.tag)::text, 2, '0') || lpad(extract(month from tw.tag)::text, 2, '0') || '000000')::uuid,
       null, tw.tag, tw.tmin, tw.tmax, tw.regen,
       round((select l.summe from letzte l) + sum(greatest(0, (tw.tmin + tw.tmax) / 2 - 5)) over (order by tw.tag), 1)
  from tag_werte tw
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Pflückaufgaben, abgeschlossen. Die Charge je Aufgabe legt der Trigger an.
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.pflueckaufgaben (id, code, reihenblock_id, brigade_id, sorte_id, status, faelligkeit, zielmenge_kg, ist_menge_kg,
                                    pfluecker_anzahl, qualitaetsfaktor, ausschuss_kg)
select e.aufgabe_id, 'PA-S-' || to_char(e.tag, 'YYMMDD') || '-' || lpad(e.nr::text, 2, '0'), e.block_id, e.brigade_id, e.sorte_id,
       'abgeschlossen', e.beginn, e.ziel, e.ist, e.leute, e.qf, e.ausschuss
  from _ernte e
on conflict (id) do nothing;

-- Die Chargen tragen nach dem Anlegen noch keine Menge und keinen Pflückzeitpunkt.
update public.chargen c
   set menge_kg = e.ist, ausschuss_kg = e.ausschuss, pflueck_zeitpunkt = e.gepflueckt
  from _ernte e
 where c.pflueckaufgabe_id = e.aufgabe_id;

-- Die letzte Ernte des Blocks.
update public.reihenbloecke b
   set letzte_ernte = x.tag
  from (select e.block_id, max(e.tag) as tag from _ernte e group by e.block_id) x
 where b.id = x.block_id and (b.letzte_ernte is null or b.letzte_ernte < x.tag);

-- ------------------------------------------------------------------------------------------------------------------------------
-- Kühlmessungen: eine je Charge bei der Vorkühlung. Der Trigger bewertet sie und setzt Vorkühlzeitpunkt und Status. (Eine zweite
-- Messung im Kühlhaus bliebe über 60 Minuten und würde vom Trigger als Verstoß gewertet; die Regel gilt der Vorkühlung.)
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.kuehlketten_messungen (id, charge_id, gemessen_am, temperatur_c, server_eingang_zeitpunkt)
select ('7e57da7a-0000-4000-8000-22' || lpad(e.nr::text, 4, '0') || '000001')::uuid, c.id,
       e.gepflueckt + (e.verzug || ' minutes')::interval, e.temp1,
       e.gepflueckt + (e.verzug || ' minutes')::interval + interval '1 minute'
  from _ernte e
  join public.chargen c on c.pflueckaufgabe_id = e.aufgabe_id
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Steigen und Arbeitszeiten. Dieselbe Mannschaft liefert beides, sonst fällt sie aus der Kennzahl Pflückleistung.
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.steigen (id, code, qr_token, charge_id, pflueckaufgabe_id, gewicht_kg, scan_zeitpunkt, server_eingang_zeitpunkt, pfluecker_id)
select ('7e57da7a-0000-4000-8000-20' || lpad(e.nr::text, 4, '0') || lpad(g.i::text, 6, '0'))::uuid, '', '', c.id, e.aufgabe_id,
       round(e.ist / greatest(e.leute, round(e.ist / 4.2)), 2),
       e.beginn + ((20 + (g.i * 95) / greatest(e.leute, round(e.ist / 4.2))::integer) || ' minutes')::interval,
       e.beginn + ((22 + (g.i * 95) / greatest(e.leute, round(e.ist / 4.2))::integer) || ' minutes')::interval,
       t.pfluecker_id
  from _ernte e
  join public.chargen c on c.pflueckaufgabe_id = e.aufgabe_id
 cross join lateral generate_series(1, greatest(e.leute, round(e.ist / 4.2))::integer) as g(i)
  join _team t on t.nr = e.nr and t.k = (g.i - 1) % e.leute
on conflict (id) do nothing;

insert into public.arbeitszeiten (id, pfluecker_id, pflueckaufgabe_id, beginn, ende)
select ('7e57da7a-0000-4000-8000-21' || lpad(e.nr::text, 4, '0') || lpad((t.k + 1)::text, 6, '0'))::uuid, t.pfluecker_id, e.aufgabe_id,
       e.beginn + (t.k * 10 || ' minutes')::interval,
       e.beginn + (t.k * 10 || ' minutes')::interval
         + (greatest(60, round(e.ist / (6.0 + 1.3 * (abs(hashtext('leistung:' || e.nr))::numeric % 1000) / 1000.0) * 60 / e.leute))::integer || ' minutes')::interval
  from _ernte e
  join _team t on t.nr = e.nr
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Auslieferung: ein Tag nach der Ernte (sonntags am Montag), jede vierte Charge geht an zwei Kunden. Eine Tour je Liefertag.
-- ------------------------------------------------------------------------------------------------------------------------------
create temp table _liefer as
with basis as (
  select e.nr, e.tag, e.aufgabe_id, e.sorte_id, e.ist,
         case when extract(dow from e.tag + 1) = 0 then e.tag + 2 else e.tag + 1 end as liefertag,
         case when e.nr % 4 = 0 then 2 else 1 end as teile
    from _ernte e
), aufgeteilt as (
  select b.*, s.seq,
         case when b.teile = 1 then b.ist when s.seq = 1 then round(b.ist * 0.6, 1) else b.ist - round(b.ist * 0.6, 1) end as menge
    from basis b
   cross join lateral generate_series(1, b.teile) as s(seq)
), mit_kunde as (
  select a.*, k.id as kunde_id, k.name as kunde_name
    from aufgeteilt a
    join _kunden k on k.rn = ((a.nr + a.seq - 2) % (select count(*) from _kunden)) + 1
)
select m.*,
       dense_rank() over (order by m.liefertag) as tour_nr,
       row_number() over (partition by m.liefertag order by m.nr, m.seq) as reihenfolge
  from mit_kunde m;

insert into public.touren (id, datum, status, distanz_km, dauer_minuten)
select ('7e57da7a-0000-4000-8000-30' || lpad(l.tour_nr::text, 4, '0') || '000000')::uuid, l.liefertag, 'abgeschlossen',
       round(38 + 42 * (abs(hashtext('tour:' || l.tour_nr))::numeric % 1000) / 1000.0),
       round(95 + 85 * (abs(hashtext('tourzeit:' || l.tour_nr))::numeric % 1000) / 1000.0)::integer
  from (select distinct tour_nr, liefertag from _liefer) l
on conflict (id) do nothing;

-- Zwei Drittel der Lieferungen gehen auf eine Vorbestellung zurück; jede siebte kommt einen Tag nach dem zugesagten Termin.
insert into public.vorbestellungen (id, b2b_kunde_id, sorte_id, menge_kg, liefertermin, status)
select ('7e57da7a-0000-4000-8000-31' || lpad(l.nr::text, 4, '0') || lpad(l.seq::text, 6, '0'))::uuid, l.kunde_id, l.sorte_id, round(l.menge),
       case when l.nr % 7 = 0 then l.liefertag - 1 else l.liefertag end, 'geliefert'
  from _liefer l
 where l.nr % 3 <> 0
on conflict (id) do nothing;

insert into public.lieferungen (id, vorbestellung_id, b2b_kunde_id, charge_id, geliefert_am, menge_kg, status, empfaenger_name,
                                geraet_zeitpunkt, server_eingang_zeitpunkt, tour_id, tour_reihenfolge)
select ('7e57da7a-0000-4000-8000-32' || lpad(l.nr::text, 4, '0') || lpad(l.seq::text, 6, '0'))::uuid,
       case when l.nr % 3 <> 0 then ('7e57da7a-0000-4000-8000-31' || lpad(l.nr::text, 4, '0') || lpad(l.seq::text, 6, '0'))::uuid end,
       l.kunde_id, c.id,
       ((l.liefertag + time '08:30') at time zone 'Asia/Almaty') + ((l.reihenfolge - 1) * 40 || ' minutes')::interval,
       l.menge, 'zugestellt', 'Warenannahme ' || l.kunde_name,
       ((l.liefertag + time '08:30') at time zone 'Asia/Almaty') + ((l.reihenfolge - 1) * 40 || ' minutes')::interval,
       ((l.liefertag + time '08:30') at time zone 'Asia/Almaty') + ((l.reihenfolge - 1) * 40 + 3 || ' minutes')::interval,
       ('7e57da7a-0000-4000-8000-30' || lpad(l.tour_nr::text, 4, '0') || '000000')::uuid, l.reihenfolge
  from _liefer l
  join public.chargen c on c.pflueckaufgabe_id = l.aufgabe_id
on conflict (id) do nothing;

update public.chargen c
   set status = 'ausgeliefert'
  from _ernte e
 where c.pflueckaufgabe_id = e.aufgabe_id and c.status <> 'ausgeliefert';

-- Transporttemperaturen: vier Messpunkte je Fahrt, kurz vor der Übergabe. Der Trigger lässt sie nur bei nicht zugestellten
-- Lieferungen zu, deshalb für diese Anweisung abgeschaltet; das Ergebnis bewertet das Temperaturband wie im Trigger.
alter table public.transport_temperatur_messungen disable trigger trg_transport_kuehlkette_bewerten;

insert into public.transport_temperatur_messungen (id, lieferung_id, gemessen_am, server_eingang_zeitpunkt, temperatur_c, ergebnis)
select ('7e57da7a-0000-4000-8000-33' || lpad(l.nr::text, 4, '0') || lpad((l.seq * 10 + m.punkt)::text, 6, '0'))::uuid,
       ('7e57da7a-0000-4000-8000-32' || lpad(l.nr::text, 4, '0') || lpad(l.seq::text, 6, '0'))::uuid,
       v.geliefert_am - ((90 - m.punkt * 30) || ' minutes')::interval,
       v.geliefert_am - ((90 - m.punkt * 30) || ' minutes')::interval + interval '1 minute',
       round(2.0 + 2.4 * (abs(hashtext('transport:' || l.nr || ':' || l.seq || ':' || m.punkt))::numeric % 1000) / 1000.0, 1),
       public.temperaturband_bewerten(round(2.0 + 2.4 * (abs(hashtext('transport:' || l.nr || ':' || l.seq || ':' || m.punkt))::numeric % 1000) / 1000.0, 1))
  from _liefer l
  join public.lieferungen v on v.id = ('7e57da7a-0000-4000-8000-32' || lpad(l.nr::text, 4, '0') || lpad(l.seq::text, 6, '0'))::uuid
 cross join generate_series(0, 3) as m(punkt)
on conflict (id) do nothing;

alter table public.transport_temperatur_messungen enable trigger trg_transport_kuehlkette_bewerten;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Zukauf bei den Nachbarbetrieben (sechs Positionen, eine Rechnung noch ohne Preis wie nach dem CSV-Import)
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.zukauf_positionen (id, nachbarbetrieb_id, sorte_id, menge_kg, preis_tenge_kg, rechnungsdatum)
select ('7e57da7a-0000-4000-8000-40' || lpad(z.nr::text, 4, '0') || '000000')::uuid, n.id, s.id, z.menge, z.preis, z.datum
  from (values
    (1, 1, 'Polka',  86.0,  1560, date '2026-09-26'),
    (2, 2, 'Polana', 64.5,  1620, date '2026-09-30'),
    (3, 1, 'Polka',  72.0,  1590, date '2026-10-03'),
    (4, 2, 'Polka',  58.0,  1680, date '2026-10-07'),
    (5, 1, 'Polana', 41.5,  1740, date '2026-10-10'),
    (6, 2, 'Polka',  36.0,  null, date '2026-10-13')
  ) as z(nr, nb, sorte, menge, preis, datum)
  join (select row_number() over (order by name) as rn, id from public.nachbarbetriebe) n on n.rn = ((z.nb - 1) % greatest(1, (select count(*) from public.nachbarbetriebe))) + 1
  join public.sorten s on s.name = z.sorte
 where exists (select 1 from _ernte)
on conflict (id) do nothing;

-- ------------------------------------------------------------------------------------------------------------------------------
-- Reklamationen: eine abgeschlossen (Temperatur, Gutschrift), eine in Prüfung (Verpackung, Frist läuft)
-- ------------------------------------------------------------------------------------------------------------------------------
insert into public.reklamationen (id, code, charge_id, b2b_kunde_id, grund, betreff, beschreibung, betroffene_menge_kg, status,
                                  gemeldet_von, gemeldet_am, erledigt_am, loesung, gutschrift_tenge)
select ('7e57da7a-0000-4000-8000-60' || lpad(r.nr::text, 4, '0') || '000000')::uuid, r.code, c.id, l.b2b_kunde_id, r.grund::public.reklamation_grund,
       r.betreff, r.beschreibung, r.menge, r.status::public.reklamation_status,
       (select p.id from public.profiles p where p.role::text = 'kunde' order by p.created_at limit 1),
       r.gemeldet, r.erledigt, r.loesung, r.gutschrift
  from (values
    (1, 'RK-S-261003-1', 7,  'temperatur', 'Ware bei Annahme zu warm',
       'Beim Wareneingang zeigte die Schalenmitte 9 Grad, einzelne Schalen waren weich. Foto der Messung liegt der Meldung bei.', 6.5,
       'erledigt', timestamptz '2026-10-03 11:20:00+05', timestamptz '2026-10-06 15:40:00+05',
       'Kühlkette der Tour geprüft: Der Logger zeigte 4,1 Grad bis zur Übergabe, die Wartezeit vor der Annahme betrug 50 Minuten. Gutschrift für 6,5 kg erteilt.', 10400),
    (2, 'RK-S-261013-2', 15, 'verpackung', 'Schalen beschädigt',
       'Drei Steigen mit eingedrückten Deckeln, rund ein Fünftel der Schalen zerdrückt.', 9.0,
       'in_pruefung', timestamptz '2026-10-13 14:10:00+05', null, null, null)
  ) as r(nr, code, ernte_nr, grund, betreff, beschreibung, menge, status, gemeldet, erledigt, loesung, gutschrift)
  join public.chargen c on c.pflueckaufgabe_id = ('7e57da7a-0000-4000-8000-10' || lpad(r.ernte_nr::text, 4, '0') || '000000')::uuid
  join public.lieferungen l on l.charge_id = c.id
 where l.id = ('7e57da7a-0000-4000-8000-32' || lpad(r.ernte_nr::text, 4, '0') || '000001')::uuid
on conflict (id) do nothing;

-- Verlauf der Reklamationen. Die Anwendung schreibt ihn bei jedem Statuswechsel; die Zeilen sind unveränderlich und tragen hier die
-- tatsächlichen Zeitpunkte der Bearbeitung. Eine Notiz der Betriebsleitung ist für den Kunden nicht sichtbar.
insert into public.reklamation_ereignisse (id, reklamation_id, neuer_status, text, sichtbar_fuer_kunde, autor_id, created_at)
select ('7e57da7a-0000-4000-8000-61' || lpad(e.rekl::text, 2, '0') || lpad(e.lfd::text, 2, '0') || '000000')::uuid,
       ('7e57da7a-0000-4000-8000-60' || lpad(e.rekl::text, 4, '0') || '000000')::uuid,
       e.status::public.reklamation_status, e.text, e.sichtbar,
       case when e.von_leitung then (select p.id from public.profiles p where p.role::text = 'betriebsleitung' order by p.created_at limit 1) end,
       e.zeit
  from (values
    (1, 1, 'offen',       'Meldung eingegangen: Ware bei Annahme zu warm.',                                                                     true,  false, timestamptz '2026-10-03 11:20:00+05'),
    (1, 2, 'in_pruefung', 'Temperaturkurve der Fahrt und Kühlkette der Charge werden geprüft.',                                                 true,  true,  timestamptz '2026-10-03 14:05:00+05'),
    (1, 3, null,          'Intern: Der Logger der Tour zeigt 4,1 Grad bis zur Übergabe, vor der Annahme standen die Steigen 50 Minuten in der Rampe.', false, true, timestamptz '2026-10-04 09:30:00+05'),
    (1, 4, 'erledigt',    'Kühlkette der Tour geprüft: Der Logger zeigte 4,1 Grad bis zur Übergabe, die Wartezeit vor der Annahme betrug 50 Minuten. Gutschrift für 6,5 kg erteilt.', true, true, timestamptz '2026-10-06 15:40:00+05'),
    (2, 1, 'offen',       'Meldung eingegangen: Schalen beschädigt, rund ein Fünftel zerdrückt.',                                              true,  false, timestamptz '2026-10-13 14:10:00+05'),
    (2, 2, 'in_pruefung', 'Fotos der beschädigten Schalen sind angefordert. Die Verpackung der Tour wird mit dem Fahrer geklärt.',             true,  true,  timestamptz '2026-10-13 16:30:00+05')
  ) as e(rekl, lfd, status, text, sichtbar, von_leitung, zeit)
 where exists (select 1 from public.reklamationen r where r.id = ('7e57da7a-0000-4000-8000-60' || lpad(e.rekl::text, 4, '0') || '000000')::uuid)
on conflict (id) do nothing;

-- migration:destruktiv-ok (nur die temporären Hilfstabellen dieser Migration)
drop table _team;
drop table _liefer;
drop table _ernte;
drop table _kunden;
drop table _leute;
drop table _bloecke;
