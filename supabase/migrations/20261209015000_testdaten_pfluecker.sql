-- Testdaten Saisonkräfte (Datenänderung, idempotent).
--
-- Die Brigaden führen eine Stärke von vier bis sechs Personen (zusammen 20), erfasst sind aber nur fünf Pflücker. Damit sind die Listen
-- im Personalbereich, die Verteilung der Steigen, die Pflückleistung je Person, die Einarbeitung und die ЕСУТД-Abdeckung zu dünn, um
-- etwas zu zeigen. Diese Migration ergänzt zehn Saisonkräfte in den Brigaden Nord, Süd und Ost (die Nachbarbetriebs-Brigade arbeitet
-- mit eigenem Personal) und ihre Einarbeitung. Die Migration liegt vor der Saisonfortsetzung (20261209020000), damit deren Ernteplan die
-- Personen schon kennt.
--
-- Die Namen sind erfunden (Initial und Familienname wie im Bestand), die Ausweisnummern folgen dem Muster MAL-04nn.
-- Schutz: nur mit Betriebsdaten und nur, wo der Ausweis noch nicht vergeben ist. Kennung 7e57da7a-0000-4000-8000-...

insert into public.pfluecker (id, brigade_id, name, ausweis, esutd)
select ('7e57da7a-0000-4000-8000-95' || lpad(v.nr::text, 4, '0') || '000000')::uuid, b.id, v.name, v.ausweis, 'offen'
  from (values
    (1,  'Brigade Sued', 'A. Kasymova',       'MAL-0405'),
    (2,  'Brigade Sued', 'T. Dauletov',       'MAL-0409'),
    (3,  'Brigade Nord', 'K. Zhaksylykov',    'MAL-0412'),
    (4,  'Brigade Nord', 'S. Mukhametova',    'MAL-0415'),
    (5,  'Brigade Nord', 'B. Orazbaev',       'MAL-0426'),
    (6,  'Brigade Sued', 'G. Sadykova',       'MAL-0433'),
    (7,  'Brigade Sued', 'R. Nurgaliev',      'MAL-0436'),
    (8,  'Brigade Ost',  'Z. Abdrakhmanova',  'MAL-0438'),
    (9,  'Brigade Ost',  'E. Bekturov',       'MAL-0443'),
    (10, 'Brigade Ost',  'M. Tleuova',        'MAL-0447')
  ) as v(nr, brigade, name, ausweis)
  join public.brigaden b on b.name = v.brigade
 where exists (select 1 from public.pfluecker where ausweis = 'MAL-0417')
   and exists (select 1 from public.chargen)
   and not exists (select 1 from public.pfluecker x where x.ausweis = v.ausweis)
on conflict (id) do nothing;

-- Einarbeitung: sechs Schritte am Tag nach Arbeitsbeginn, bei der neuesten Kraft (seit 12.10.) erst die ersten vier.
insert into public.einarbeitung_fortschritt (id, pfluecker_id, schritt_id, erledigt_am)
select ('7e57da7a-0000-4000-8000-96' || lpad(v.nr::text, 2, '0') || lpad(s.reihenfolge::text, 2, '0') || '000000')::uuid, p.id, s.id,
       ((v.beginn + 1) + time '08:30' + (s.reihenfolge * 20 || ' minutes')::interval) at time zone 'Asia/Almaty'
  from (values
    (1, 'MAL-0405', date '2026-06-15'), (2, 'MAL-0409', date '2026-06-15'), (3, 'MAL-0412', date '2026-06-22'),
    (4, 'MAL-0415', date '2026-06-22'), (5, 'MAL-0426', date '2026-07-20'), (6, 'MAL-0433', date '2026-08-03'),
    (7, 'MAL-0436', date '2026-08-03'), (8, 'MAL-0438', date '2026-08-10'), (9, 'MAL-0443', date '2026-08-17'),
    (10, 'MAL-0447', date '2026-10-12')
  ) as v(nr, ausweis, beginn)
  join public.pfluecker p on p.ausweis = v.ausweis and p.id::text like '7e57da7a-0000-4000-8000-95%'
  join public.einarbeitung_schritte s on (v.nr < 10 or s.reihenfolge <= 4)
on conflict (pfluecker_id, schritt_id) do nothing;
