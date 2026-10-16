-- Testdaten Stammdaten (Datenänderung, idempotent).
--
-- Mehrere Stammdatenfelder stehen leer und erscheinen in der Oberfläche als "noch nicht erhoben" oder "noch nicht eingetragen":
-- Rechtsform und Identifikationsnummer der Kunden, Anschrift, Koordinaten und Abholfenster der Nachbarbetriebe, die Werte der
-- Kontaktkanäle. Ohne sie bleiben die ЭСФ-Entwürfe lückenhaft (keine BIN des Kunden) und die Abholrunden ohne Route (keine Anschrift).
--
-- Gefüllt werden nur Felder, die noch leer sind. Was jemand von Hand eingetragen hat, bleibt unberührt. Die Identifikationsnummern
-- sind erfunden, tragen aber die richtige Struktur und eine gültige Prüfziffer (pruefziffer_stimmt()):
--   BIN der TOO:    JJMM + 4 + 0 + fünfstellige Laufnummer + Prüfziffer
--   IIN der Farmen: JJMMTT + 3 + vierstellige Laufnummer + Prüfziffer
-- Die Koordinaten liegen auf den Orten (Almaty, Kaskelen, Uzynagash), nicht auf echten Grundstücken.

update public.b2b_kunden
   set adresse = coalesce(adresse, 'Zhandosov Street 98, Almaty'),
       breitengrad = coalesce(breitengrad, 43.228620),
       laengengrad = coalesce(laengengrad, 76.876100),
       geokodiert_am = coalesce(geokodiert_am, timestamptz '2026-09-22 10:13:00+05')
 where name = 'Almaty Fresh Market' and adresse is null;

update public.b2b_kunden
   set rechtsform = 'too', identifikationsnummer = '990101400129'
 where name = 'Almaty Fresh Market' and identifikationsnummer is null and rechtsform is null
   and not exists (select 1 from public.b2b_kunden x where x.identifikationsnummer = '990101400129');

update public.b2b_kunden
   set rechtsform = 'too', identifikationsnummer = '140340074319'
 where name = 'Gastro-Distributor Almaty' and identifikationsnummer is null and rechtsform is null
   and not exists (select 1 from public.b2b_kunden x where x.identifikationsnummer = '140340074319');

update public.b2b_kunden
   set rechtsform = 'too', identifikationsnummer = '110940012751'
 where name = 'Handelskette A' and identifikationsnummer is null and rechtsform is null
   and not exists (select 1 from public.b2b_kunden x where x.identifikationsnummer = '110940012751');

-- Nachbarbetriebe: Farmen (Bauern- oder Farmbetrieb, kh_fh) mit Zufahrt und Abholfenster am Morgen.
update public.nachbarbetriebe
   set rechtsform = 'kh_fh', identifikationsnummer = '740312301870',
       adresse = 'Zufahrt Farm Baitulin, Ortsrand Kaskelen',
       breitengrad = 43.201700, laengengrad = 76.628300, geokodiert_am = timestamptz '2026-10-14 09:00:00+05',
       abhol_von = time '06:30', abhol_bis = time '09:30'
 where name = 'Nachbarbetrieb Kaskelen' and rechtsform is null and identifikationsnummer is null
   and not exists (select 1 from public.nachbarbetriebe x where x.identifikationsnummer = '740312301870');

update public.nachbarbetriebe
   set rechtsform = 'kh_fh', identifikationsnummer = '680925304120',
       adresse = 'Zufahrt Farm Dzhaksybekov, Uzynagash',
       breitengrad = 43.151700, laengengrad = 76.320500, geokodiert_am = timestamptz '2026-10-14 09:00:00+05',
       abhol_von = time '07:00', abhol_bis = time '10:00'
 where name = 'Nachbarbetrieb Uzynagash' and rechtsform is null and identifikationsnummer is null
   and not exists (select 1 from public.nachbarbetriebe x where x.identifikationsnummer = '680925304120');

-- Kontaktkanäle: die drei vorhandenen Zeilen tragen keinen Wert und sind abgeschaltet. Ein vierter Kanal (Instagram) kommt dazu.
update public.kontaktkanaele set wert = '+7 701 555 0142', aktiv = true where typ = 'whatsapp' and wert is null;
update public.kontaktkanaele set wert = '@malina_bestellung', aktiv = true where typ = 'telegram' and wert is null;
update public.kontaktkanaele set wert = 'https://pay.kaspi.kz/pay/malina-almaty', aktiv = true where typ = 'kaspi_qr' and wert is null;

insert into public.kontaktkanaele (id, typ, bezeichnung, wert, aktiv, reihenfolge)
select '7e57da7a-0000-4000-8000-900000000001'::uuid, 'instagram', 'Instagram', '@malina.almaty', true, 4
 where exists (select 1 from public.kontaktkanaele)
   and not exists (select 1 from public.kontaktkanaele where typ = 'instagram')
on conflict (id) do nothing;
