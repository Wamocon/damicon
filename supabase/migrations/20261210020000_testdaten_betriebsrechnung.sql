-- Testdaten Wirtschaftlichkeit des Betriebs (Datenänderung, idempotent).
--
-- Die Seite Wirtschaftlichkeit rechnet jetzt zuerst den Betrieb (Migration 20261210010000): Erlöse, variable Kosten, Fixkosten und Ergebnis über drei bis
-- fünf Jahre. Ohne Planung und ohne Fixkosten steht die Rechnung auf "Angaben fehlen". Diese Migration erfasst eine Planung für die Saison 2026/27, die zu den
-- Zahlen der Seite passt:
--
--   Jahresmenge     350 t        (dieselbe Zahl wie bei den Annahmen des Systems)
--   Verkaufspreis   1.850 Tenge je kg im ersten Jahr (das Finanzjournal der letzten zwölf Monate liegt bei rund 1.770 Tenge je kg)
--   Variable Kosten 1.100 Tenge je kg im ersten Jahr (Lohn, Verpackung, Kühlung, Transport, Dünger, Pflanzenschutz)
--   Fixkosten       140 Mio. Tenge je Jahr in sieben Posten, so dass Vollkosten vor dem System bei 1.500 Tenge je kg liegen (die Annahme "Vollkosten vorher")
--   Entwicklung     Menge +6 %, Preis +6 %, variable Kosten +8 %, Fixkosten +7 % je Jahr; Abschreibung des Systems über fünf Jahre
--
-- Alles ist als geschätzt gekennzeichnet; die Fixkosten sind je Posten belegt oder geschätzt, so dass die Seite "Teilweise geschätzt" zeigt. Die Zahlen
-- ersetzen keine Planung der Geschäftsführung, sie machen die Rechnung sichtbar und prüfbar.
--
-- Schutz: Die Planung wird nur gesetzt, wenn noch kein Planwert da ist, und die Fixkosten nur, wenn keine erfasst sind. Eigene Eingaben der Geschäftsführung
-- werden nie ergänzt oder verdoppelt. Eine leere Datenbank (CI, lokaler Stack vor dem Seed) bleibt leer, denn ohne Chargen gibt es keinen Betrieb.
-- Erkennbar sind die Zeilen an der Kennung 7e57da7a-0000-4000-8000-... (Testdaten).

update public.wirtschaftlichkeit_annahmen
   set plan_preis_tenge_kg           = 1850,
       plan_variable_kosten_tenge_kg = 1100,
       plan_menge_entwicklung        = 0.06,
       plan_preis_entwicklung        = 0.06,
       plan_kosten_entwicklung       = 0.08,
       plan_fixkosten_entwicklung    = 0.07,
       plan_abschreibung_jahre       = 5,
       herkunft                      = herkunft || '{"preis": "geschaetzt", "kosten": "geschaetzt", "entwicklung": "geschaetzt"}'::jsonb
 where id = 1
   and vermarktete_menge_kg is not null
   and plan_preis_tenge_kg is null
   and plan_variable_kosten_tenge_kg is null
   and plan_menge_entwicklung is null
   and plan_preis_entwicklung is null
   and plan_kosten_entwicklung is null
   and plan_fixkosten_entwicklung is null
   and plan_abschreibung_jahre is null
   and exists (select 1 from public.chargen)
   and not exists (select 1 from public.wirtschaftlichkeit_posten where art = 'fixkosten');

insert into public.wirtschaftlichkeit_posten (id, art, kategorie, bezeichnung, betrag, waehrung, datum, herkunft, notiz, erfasst_von_profil_id)
select v.id::uuid, 'fixkosten', v.kategorie, v.bezeichnung, v.betrag, 'KZT', v.datum, v.herkunft, v.notiz, (select id from public.profiles where role::text = 'ceo' order by created_at limit 1)
  from (values
    ('7e57da7a-0000-4000-8000-000000000601', 'Personal', 'Festes Personal: Betriebsleitung, Agronomie, Lager, Fahrer, Buchhaltung (14 Stellen)', 58800000, date '2026-09-01', 'belegt', 'Lohnliste September 2026, hochgerechnet auf zwölf Monate. Saisonkräfte (Pflücker) stehen nicht hier, sie sind variable Kosten.'),
    ('7e57da7a-0000-4000-8000-000000000602', 'Pacht und Land', 'Pacht der Anbauflächen (50 ha) und Wassernutzung', 6000000, date '2026-09-01', 'belegt', 'Pachtverträge mit Laufzeit bis 2031.'),
    ('7e57da7a-0000-4000-8000-000000000603', 'Fahrzeuge', 'Leasing, Versicherung und feste Wartung der vier Kühlfahrzeuge und der Feldfahrzeuge', 18000000, date '2026-09-01', 'belegt', null),
    ('7e57da7a-0000-4000-8000-000000000604', 'Gebäude und Kühlhaus', 'Instandhaltung, Grundlast Strom und Abschreibung von Kühlhaus, Sortierhalle und Lager', 22000000, date '2026-09-01', 'geschaetzt', 'Fixer Anteil aus den Stromabrechnungen des Vorjahres, die Abschreibung nach Bilanz geschätzt.'),
    ('7e57da7a-0000-4000-8000-000000000605', 'Anlagen', 'Tropfbewässerung, Folientunnel und Pflanzen: Instandhaltung und Abschreibung', 16200000, date '2026-09-01', 'geschaetzt', null),
    ('7e57da7a-0000-4000-8000-000000000606', 'Versicherung und Zertifikate', 'Ernte- und Haftpflichtversicherung, GlobalG.A.P., Gebühren und Genehmigungen', 9000000, date '2026-09-01', 'belegt', null),
    ('7e57da7a-0000-4000-8000-000000000607', 'Verwaltung', 'Steuer- und Rechtsberatung, Bank, Büro, Kommunikation', 10000000, date '2026-09-01', 'geschaetzt', 'Ohne die Kosten des Systems: sie stehen bei den laufenden Kosten des Systems.')
  ) as v(id, kategorie, bezeichnung, betrag, datum, herkunft, notiz)
 where exists (select 1 from public.chargen)
   and not exists (select 1 from public.wirtschaftlichkeit_posten where art = 'fixkosten')
   -- nur zur Planung dieser Migration: wer eigene Planwerte erfasst hat, bekommt keine Testfixkosten dazu
   and exists (select 1 from public.wirtschaftlichkeit_annahmen where id = 1 and plan_preis_tenge_kg = 1850 and plan_variable_kosten_tenge_kg = 1100 and plan_fixkosten_entwicklung = 0.07)
on conflict (id) do nothing;
