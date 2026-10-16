-- Testdaten Finanzen zur Saisonfortsetzung (Datenänderung, idempotent).
--
-- Zu den 16 Chargen der Saisonfortsetzung (Migration 20261209020000) kommen Kostenträger und Buchungen im Finanzjournal, und zwar
-- mit Bezug auf die Charge UND den Kostenträger. Damit füllt sich "Deckungsbeitrag je Charge" (bisher nur zwei Beispielzeilen) und der
-- Deckungsbeitrag je Kostenträger zählt dieselben Buchungen mit, ohne sie doppelt zu rechnen: ein Erlös steht einmal im Journal.
--
--   Erlös        Menge der Lieferung mal Preis der gültigen Preisliste (Kundengruppe, sonst allgemeine Liste), am Liefertag
--   Pflücklohn   880 Tenge je kg mal Qualitätsfaktor der Aufgabe, am Erntetag
--   Verpackung   22 Tenge je Schale (Schalengewicht der Sorte), am Erntetag
--   Kühlung      45 Tenge je kg, am Erntetag
--   Transport    190 Tenge je Tourkilometer, geteilt durch die Stopps der Tour, am Liefertag
--
-- Das ergibt rund 700 bis 900 Tenge Deckungsbeitrag je kg, nahe am Ziel von 700 und über der Baseline von 640 aus dem Kennzahlenkatalog.
--
-- Das Journal ist unveränderlich (nur Anfügen). Die Migration fügt nur Chargen ohne Buchung hinzu; ein zweiter Lauf ändert nichts.
-- Kennung der Zeilen: 7e57da7a-0000-4000-8000-... (Testdaten). Zum Zurücknehmen siehe supabase/testdaten-entfernen.sql.

create temp table _fin as
select c.id as charge_id, a.id as aufgabe_id, substr(a.id::text, 27, 4)::integer as nr,
       a.reihenblock_id, a.sorte_id, c.ernte_datum, a.ist_menge_kg as ist, a.qualitaetsfaktor as qf,
       coalesce(s.schale_g, 125) as schale_g, a.code as aufgabe_code
  from public.pflueckaufgaben a
  join public.chargen c on c.pflueckaufgabe_id = a.id
  join public.sorten s on s.id = a.sorte_id
 where a.id::text like '7e57da7a-0000-4000-8000-10%'
   and a.status = 'abgeschlossen' and a.ist_menge_kg > 0 and a.qualitaetsfaktor is not null
   and not exists (select 1 from public.finance_ledger_entries f where f.charge_id = c.id);

-- Je Charge eine Lieferung mit Kunde, Preis und Tourkilometern.
create temp table _fin_lieferung as
select f.nr, f.charge_id, l.id as lieferung_id, k.name as kunde, l.menge_kg, (l.geliefert_am at time zone 'Asia/Almaty')::date as liefertag,
       coalesce(
         (select pp.preis_tenge_kg
            from public.preislisten pl
            join public.preislisten_positionen pp on pp.preisliste_id = pl.id
           where pl.aktiv and pl.kundengruppe is not distinct from k.kundengruppe and pp.sorte_id = f.sorte_id
             and pl.gueltig_ab <= (l.geliefert_am at time zone 'Asia/Almaty')::date
             and (pl.gueltig_bis is null or pl.gueltig_bis >= (l.geliefert_am at time zone 'Asia/Almaty')::date)
             and pp.min_menge_kg <= l.menge_kg
           order by pl.gueltig_ab desc, pp.min_menge_kg desc limit 1),
         (select pp.preis_tenge_kg
            from public.preislisten pl
            join public.preislisten_positionen pp on pp.preisliste_id = pl.id
           where pl.aktiv and pl.kundengruppe is null and pp.sorte_id = f.sorte_id
             and pl.gueltig_ab <= (l.geliefert_am at time zone 'Asia/Almaty')::date
             and (pl.gueltig_bis is null or pl.gueltig_bis >= (l.geliefert_am at time zone 'Asia/Almaty')::date)
             and pp.min_menge_kg <= l.menge_kg
           order by pl.gueltig_ab desc, pp.min_menge_kg desc limit 1),
         2000) as preis,
       t.distanz_km, (select count(*) from public.lieferungen x where x.tour_id = l.tour_id) as stopps,
       row_number() over (partition by f.nr order by l.tour_reihenfolge) as seq,
       count(*) over (partition by f.nr) as teile,
       l.b2b_kunde_id
  from _fin f
  join public.lieferungen l on l.charge_id = f.charge_id and l.status = 'zugestellt'
  join public.b2b_kunden k on k.id = l.b2b_kunde_id
  left join public.touren t on t.id = l.tour_id;

-- Kostenträger je Reihenblock, Sorte und Erntetag (eindeutig); den Kunden trägt er nur, wenn die Charge an einen Kunden ging.
insert into public.kostentraeger (id, reihenblock_id, sorte_id, erntetag, bezeichnung, b2b_kunde_id)
select ('7e57da7a-0000-4000-8000-70' || lpad(f.nr::text, 4, '0') || '000000')::uuid, f.reihenblock_id, f.sorte_id, f.ernte_datum,
       b.code || ' / ' || to_char(f.ernte_datum, 'YYYY-MM-DD'),
       (select min(l.b2b_kunde_id::text)::uuid from _fin_lieferung l where l.nr = f.nr and l.teile = 1)
  from _fin f
  join public.reihenbloecke b on b.id = f.reihenblock_id
on conflict (reihenblock_id, sorte_id, erntetag) do nothing;

-- Buchungen. Der Kostenträger wird über den eindeutigen Schlüssel gesucht, denn ein Block hat ihn vielleicht schon vorher bekommen.
create temp table _fin_buchung as
select f.nr, f.charge_id,
       (select k.id from public.kostentraeger k where k.reihenblock_id = f.reihenblock_id and k.sorte_id = f.sorte_id and k.erntetag = f.ernte_datum) as kostentraeger_id,
       v.typ, v.kategorie, v.betrag, v.datum, v.beschreibung, v.rang
  from _fin f
 cross join lateral (
   select 'kosten'::public.ledger_typ as typ, 'Pflücklohn' as kategorie, round(f.ist * 880 * f.qf) as betrag, f.ernte_datum as datum,
          'Pflückaufgabe ' || f.aufgabe_code as beschreibung, 1 as rang
   union all
   select 'kosten', 'Verpackung (Schalen und Steigen)', round(f.ist * 1000 / f.schale_g * 22), f.ernte_datum, 'Schalen zu ' || f.schale_g || ' g', 2
   union all
   select 'kosten', 'Kühlung und Strom', round(f.ist * 45), f.ernte_datum, 'Vorkühlung und Kühlhaus', 3
   union all
   select 'erloes', 'Erlös aus Lieferung ' || l.kunde, round(l.menge_kg * l.preis), l.liefertag,
          round(l.menge_kg) || ' kg zu ' || l.preis::integer || ' Tenge je kg', 10 + l.seq::integer
     from _fin_lieferung l where l.nr = f.nr
   union all
   select 'kosten', 'Transport', round(coalesce(l.distanz_km, 55) * 190 / greatest(l.stopps, 1)), l.liefertag, 'Anteil an der Tour zu ' || l.kunde, 20 + l.seq::integer
     from _fin_lieferung l where l.nr = f.nr
 ) v;

insert into public.finance_ledger_entries (id, kostentraeger_id, charge_id, typ, kategorie, betrag_tenge, buchungsdatum, beschreibung)
select ('7e57da7a-0000-4000-8000-71' || lpad(b.nr::text, 4, '0') || lpad(b.rang::text, 6, '0'))::uuid,
       b.kostentraeger_id, b.charge_id, b.typ, b.kategorie, b.betrag, b.datum, b.beschreibung
  from _fin_buchung b
on conflict (id) do nothing;

-- Stand der MwSt-Schwellenprüfung: Die Seite Compliance zeigt "Noch nicht geprüft", solange niemand die Prüfung ausgelöst hat. Die
-- Funktion mwst_schwelle_pruefen() verlangt eine Anmeldung als Administration oder Buchhaltung; hier wird derselbe Stand geschrieben
-- (Umsatz der letzten zwölf Monate, Zeitpunkt der Prüfung), aber nur, solange die Schwelle nicht erreicht ist. Eine Überschreitung
-- (mit Meldefrist) soll nie stillschweigend aus einer Migration entstehen, sondern aus der Prüfung selbst.
update public.betriebe b
   set mwst_letzter_umsatz_tenge = public.mwst_umsatz_12_monate(public.heute_almaty()),
       mwst_letzte_pruefung_am = now()
 where b.mwst_letzte_pruefung_am is null
   and exists (select 1 from _fin_buchung)
   and public.mwst_umsatz_12_monate(public.heute_almaty())
       < coalesce((select s.schwelle_tenge from public.mwst_saetze s
                    where s.gueltig_ab <= public.heute_almaty() and (s.gueltig_bis is null or s.gueltig_bis > public.heute_almaty())
                    order by s.gueltig_ab desc limit 1), 0);

-- migration:destruktiv-ok (nur die temporären Hilfstabellen dieser Migration)
drop table _fin_buchung;
drop table _fin_lieferung;
drop table _fin;
