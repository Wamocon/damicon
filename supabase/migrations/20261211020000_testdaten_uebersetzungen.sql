-- Übersetzungen der Freitexte der Test- und Beispieldaten in alle Sprachen (Datenänderung, idempotent).
--
-- DIESE DATEI IST ERZEUGT aus supabase/uebersetzungen/testdaten.json (node scripts/uebersetzungen-erzeugen.mjs). Änderungen gehören in die JSON-Datei.
--
-- Die Testdaten (Kennung 7e57da7a-0000-4000-8000-...) und die Beispieldaten (seed.sql) standen bisher nur auf Deutsch (eine Nachricht auf Russisch). Diese Migration
-- trägt ihre Übersetzungen ins Englische, Russische und Kasachische in die Spalte i18n ein (Migration 20261211010000). 196 Texte in 22 Spalten von 13 Tabellen.
-- Die Oberfläche zeigt je nach Sprache die Übersetzung und fällt auf das Original zurück, wo keine steht.
--
-- Was sie ändert: nur die Spalte i18n, nur in Zeilen, deren Text genau dem Original in der Liste entspricht, und nur wo die Spalte noch keine Übersetzung hat.
-- Dieselbe Zeile mit demselben Text bekommt dieselbe Übersetzung, ob Testdaten, Beispieldaten oder von Hand erfasst. Ein von Hand geänderter Text bekommt keine.
-- Originale, Beträge, Zeitpunkte und alle anderen Spalten bleiben unberührt. Ein zweiter Lauf ändert nichts.
--
-- Die Trigger der Tabellen sind für die Dauer dieser Migration abgeschaltet (Buchungen, Verlauf, Nachrichten und Stände sind unveränderlich, andere Trigger würden
-- Zeitstempel setzen oder Verlaufseinträge schreiben). Es ändert sich nur i18n.
--
-- Die kasachischen Texte sind noch nicht von einer Muttersprachlerin oder einem Muttersprachler geprüft.

alter table public.abholrunden disable trigger user;
alter table public.abholstopps disable trigger user;
alter table public.dokumente disable trigger user;
alter table public.esutd_ereignisse disable trigger user;
alter table public.esutd_vertraege disable trigger user;
alter table public.finance_ledger_entries disable trigger user;
alter table public.preislisten disable trigger user;
alter table public.reklamation_ereignisse disable trigger user;
alter table public.reklamationen disable trigger user;
alter table public.vorbestellung_nachrichten disable trigger user;
alter table public.wirtschaftlichkeit_ist disable trigger user;
alter table public.wirtschaftlichkeit_posten disable trigger user;
alter table public.wirtschaftlichkeit_staende disable trigger user;

-- abholrunden.fahrzeug (1 Text)
update public.abholrunden t
   set i18n = t.i18n || jsonb_build_object('fahrzeug', v.uebers::jsonb)
  from (values
    ('Kühlwagen Gazelle Next, 412 KAL 05', '{"en":"Refrigerated van Gazelle Next, 412 KAL 05","ru":"Рефрижератор ГАЗель Next, 412 KAL 05","kk":"Тоңазытқыш фургон Gazelle Next, 412 KAL 05"}')
  ) as v(original, uebers)
 where t.fahrzeug = v.original
   and not (t.i18n ? 'fahrzeug');

-- abholrunden.notiz (2 Texte)
update public.abholrunden t
   set i18n = t.i18n || jsonb_build_object('notiz', v.uebers::jsonb)
  from (values
    ('Letzte Runde vor dem Winterpreis, falls das Wetter hält.', '{"en":"Last round before the winter price, if the weather holds.","ru":"Последний рейс до зимней цены, если позволит погода.","kk":"Қысқы бағаға дейінгі соңғы рейс, ауа райы көтерсе."}'),
    ('Viel Verkehr am Stadtrand von Almaty, zehn Minuten Verzögerung vor Kaskelen.', '{"en":"Heavy traffic on the outskirts of Almaty, ten minutes delay before Kaskelen.","ru":"Большой поток машин на окраине Алматы, задержка десять минут перед Каскеленом.","kk":"Алматы шетінде көлік көп, Қаскелеңге дейін он минут кешігу."}')
  ) as v(original, uebers)
 where t.notiz = v.original
   and not (t.i18n ? 'notiz');

-- abholstopps.bemerkung (3 Texte)
update public.abholstopps t
   set i18n = t.i18n || jsonb_build_object('bemerkung', v.uebers::jsonb)
  from (values
    ('Etwas weniger Ware als geplant, kleinere Früchte.', '{"en":"Slightly less goods than planned, smaller fruit.","ru":"Товара немного меньше плана, ягоды мельче.","kk":"Өнім жоспардан сәл аз, жидектер ұсақтау."}'),
    ('Ware sauber verlesen, 13 Steigen.', '{"en":"Goods sorted cleanly, 13 crates.","ru":"Товар хорошо переборан, 13 ящиков.","kk":"Өнім таза сұрыпталған, 13 жәшік."}'),
    ('Zwei Steigen zu feucht, vom Betrieb getauscht.', '{"en":"Two crates too wet, replaced by the farm.","ru":"Два ящика слишком влажные, хозяйство их заменило.","kk":"Екі жәшік тым ылғалды, шаруашылық ауыстырды."}')
  ) as v(original, uebers)
 where t.bemerkung = v.original
   and not (t.i18n ? 'bemerkung');

-- dokumente.bezug (9 Texte)
update public.dokumente t
   set i18n = t.i18n || jsonb_build_object('bezug', v.uebers::jsonb)
  from (values
    ('42 Vertraege', '{"en":"42 contracts","ru":"42 договора","kk":"42 шарт"}'),
    ('Antrag 2026-114', '{"en":"Application 2026-114","ru":"Заявка 2026-114","kk":"Өтінім 2026-114"}'),
    ('Betrieb', '{"en":"Farm","ru":"Хозяйство","kk":"Шаруашылық"}'),
    ('Kontingent Polana 1800 kg', '{"en":"Quota Polana 1800 kg","ru":"Квота Полана 1800 кг","kk":"Полана квотасы 1800 кг"}'),
    ('Kontingent Polka 2400 kg', '{"en":"Quota Polka 2400 kg","ru":"Квота Полька 2400 кг","kk":"Полька квотасы 2400 кг"}'),
    ('Kontingent Polka 3100 kg', '{"en":"Quota Polka 3100 kg","ru":"Квота Полька 3100 кг","kk":"Полька квотасы 3100 кг"}'),
    ('Personenbezogene Daten', '{"en":"Personal data","ru":"Персональные данные","kk":"Жеке деректер"}'),
    ('Plantage Issyk', '{"en":"Issyk plantation","ru":"Плантация Иссык","kk":"Есік плантациясы"}'),
    ('Zukauf Saison 2026', '{"en":"Purchases season 2026","ru":"Закуп сезона 2026","kk":"2026 маусымдағы сатып алу"}')
  ) as v(original, uebers)
 where t.bezug = v.original
   and not (t.i18n ? 'bezug');

-- dokumente.name (16 Texte)
update public.dokumente t
   set i18n = t.i18n || jsonb_build_object('name', v.uebers::jsonb)
  from (values
    ('Einwilligungsvorlage Saisonkräfte', '{"en":"Consent template seasonal workers","ru":"Форма согласия для сезонных работников","kk":"Маусымдық жұмысшыларға арналған келісім үлгісі"}'),
    ('ESUTD-Sammelnachweis Saisonkraefte', '{"en":"ESUTD collective proof seasonal workers","ru":"Сводное подтверждение ЕСУТД по сезонным работникам","kk":"Маусымдық жұмысшылар бойынша ЕСУТД жиынтық растамасы"}'),
    ('Foerderdossier gosagro.kz - Kuehlhaus', '{"en":"Funding dossier gosagro.kz, cold store","ru":"Досье по субсидии gosagro.kz, холодильный склад","kk":"gosagro.kz қолдау құжаттамасы, тоңазытқыш қойма"}'),
    ('GlobalG.A.P.-Zertifikat', '{"en":"GlobalG.A.P. certificate","ru":"Сертификат GlobalG.A.P.","kk":"GlobalG.A.P. сертификаты"}'),
    ('Hygienezulassung Kühlhaus', '{"en":"Hygiene approval cold store","ru":"Санитарное разрешение на холодильный склад","kk":"Тоңазытқыш қойманың гигиеналық рұқсаты"}'),
    ('Liefervertrag Almaty Fresh Market', '{"en":"Supply contract Almaty Fresh Market","ru":"Договор поставки Almaty Fresh Market","kk":"Almaty Fresh Market жеткізу шарты"}'),
    ('Liefervertrag Gastro-Distributor Almaty', '{"en":"Supply contract Gastro-Distributor Almaty","ru":"Договор поставки с Gastro-Distributor Almaty","kk":"Gastro-Distributor Almaty жеткізу шарты"}'),
    ('Pachtvertrag Plantage Issyk', '{"en":"Lease contract Issyk plantation","ru":"Договор аренды плантации Иссык","kk":"Есік плантациясын жалға алу шарты"}'),
    ('Rahmenliefervertrag Handelskette A', '{"en":"Framework supply contract Handelskette A","ru":"Рамочный договор поставки Handelskette A","kk":"Handelskette A жақтау жеткізу шарты"}'),
    ('Rückstandsanalyse Himbeeren 2025 (Labor Almaty)', '{"en":"Residue analysis raspberries 2025 (Almaty laboratory)","ru":"Анализ остатков на малине 2025 (лаборатория Алматы)","kk":"2025 жылғы таңқурайдағы қалдықтар талдауы (Алматы зертханасы)"}'),
    ('Rückstandsanalyse Himbeeren 2026 (Labor Almaty)', '{"en":"Residue analysis raspberries 2026 (Almaty laboratory)","ru":"Анализ остатков на малине 2026 (лаборатория Алматы)","kk":"2026 жылғы таңқурайдағы қалдықтар талдауы (Алматы зертханасы)"}'),
    ('Sachkundenachweis Pflanzenschutz (Betriebsleitung)', '{"en":"Plant protection competence certificate (operations manager)","ru":"Свидетельство о квалификации по защите растений (руководитель производства)","kk":"Өсімдік қорғау бойынша біліктілік куәлігі (өндіріс басшысы)"}'),
    ('Spritzprotokoll KW 30 - Parzelle Sued', '{"en":"Spray log week 30, south plot","ru":"Журнал опрыскивания, неделя 30, южный участок","kk":"Бүрку журналы, 30-апта, оңтүстік телім"}'),
    ('Spritzprotokoll KW 36 - Parzelle Nord', '{"en":"Spray log week 36, north plot","ru":"Журнал опрыскивания, неделя 36, северный участок","kk":"Бүрку журналы, 36-апта, солтүстік телім"}'),
    ('Zukaufvereinbarung Nachbarbetrieb Kaskelen', '{"en":"Purchase agreement neighbouring farm Kaskelen","ru":"Соглашение о закупе у соседнего хозяйства (Каскелен)","kk":"Көрші шаруашылықтан сатып алу келісімі (Қаскелең)"}'),
    ('Zukaufvereinbarung Nachbarbetrieb Uzynagash', '{"en":"Purchase agreement neighbouring farm Uzynagash","ru":"Соглашение о закупе у соседнего хозяйства (Узынагаш)","kk":"Көрші шаруашылықтан сатып алу келісімі (Үзынағаш)"}')
  ) as v(original, uebers)
 where t.name = v.original
   and not (t.i18n ? 'name');

-- dokumente.rechtsgrundlage (1 Text)
update public.dokumente t
   set i18n = t.i18n || jsonb_build_object('rechtsgrundlage', v.uebers::jsonb)
  from (values
    ('Gesetz der Republik Kasachstan Nr. 94-V vom 21.05.2013 über personenbezogene Daten und ihren Schutz', '{"en":"Law of the Republic of Kazakhstan No. 94-V of 21.05.2013 on personal data and their protection","ru":"Закон Республики Казахстан № 94-V от 21.05.2013 «О персональных данных и их защите»","kk":"Қазақстан Республикасының 2013 жылғы 21 мамырдағы № 94-V «Дербес деректер және оларды қорғау туралы» Заңы"}')
  ) as v(original, uebers)
 where t.rechtsgrundlage = v.original
   and not (t.i18n ? 'rechtsgrundlage');

-- esutd_ereignisse.beschreibung (3 Texte)
update public.esutd_ereignisse t
   set i18n = t.i18n || jsonb_build_object('beschreibung', v.uebers::jsonb)
  from (values
    ('Einsatzort von Plantage Talgar auf Plantage Issyk gewechselt.', '{"en":"Place of work changed from Talgar plantation to Issyk plantation.","ru":"Место работы изменено с плантации Талгар на плантацию Иссык.","kk":"Жұмыс орны Талғар плантациясынан Есік плантациясына ауыстырылды."}'),
    ('Vergütungssatz je kg ab 08.10.2026 angepasst (900 statt 850 Tenge).', '{"en":"Pay rate per kg adjusted from 08.10.2026 (900 instead of 850 tenge).","ru":"Ставка оплаты за кг изменена с 08.10.2026 (900 вместо 850 тенге).","kk":"Бір келі үшін төлем мөлшері 08.10.2026 бастап өзгертілді (850 орнына 900 теңге)."}'),
    ('Vertrag auf Wunsch der Arbeitnehmerin zum 09.10.2026 beendet, Saisonende der Brigade.', '{"en":"Contract ended at the employee''s request on 09.10.2026, end of season for the crew.","ru":"Договор расторгнут по желанию работницы 09.10.2026, конец сезона бригады.","kk":"Шарт қызметкердің өтініші бойынша 09.10.2026 күні тоқтатылды, бригаданың маусымы аяқталды."}')
  ) as v(original, uebers)
 where t.beschreibung = v.original
   and not (t.i18n ? 'beschreibung');

-- esutd_ereignisse.bestaetigung (1 Text)
update public.esutd_ereignisse t
   set i18n = t.i18n || jsonb_build_object('bestaetigung', v.uebers::jsonb)
  from (values
    ('Quittung enbek.kz vom 08.09.2026, Nr. 4529177', '{"en":"Receipt from enbek.kz of 08.09.2026, No. 4529177","ru":"Квитанция enbek.kz от 08.09.2026, № 4529177","kk":"enbek.kz түбіртегі, 08.09.2026, № 4529177"}')
  ) as v(original, uebers)
 where t.bestaetigung = v.original
   and not (t.i18n ? 'bestaetigung');

-- esutd_vertraege.bestaetigung (12 Texte)
update public.esutd_vertraege t
   set i18n = t.i18n || jsonb_build_object('bestaetigung', v.uebers::jsonb)
  from (values
    ('Quittung enbek.kz vom 04.08.2026, Nr. 4402192', '{"en":"Receipt from enbek.kz of 04.08.2026, No. 4402192","ru":"Квитанция enbek.kz от 04.08.2026, № 4402192","kk":"enbek.kz түбіртегі, 04.08.2026, № 4402192"}'),
    ('Quittung enbek.kz vom 04.08.2026, Nr. 4447178', '{"en":"Receipt from enbek.kz of 04.08.2026, No. 4447178","ru":"Квитанция enbek.kz от 04.08.2026, № 4447178","kk":"enbek.kz түбіртегі, 04.08.2026, № 4447178"}'),
    ('Quittung enbek.kz vom 04.08.2026, Nr. 4488825', '{"en":"Receipt from enbek.kz of 04.08.2026, No. 4488825","ru":"Квитанция enbek.kz от 04.08.2026, № 4488825","kk":"enbek.kz түбіртегі, 04.08.2026, № 4488825"}'),
    ('Quittung enbek.kz vom 07.07.2026, Nr. 4442567', '{"en":"Receipt from enbek.kz of 07.07.2026, No. 4442567","ru":"Квитанция enbek.kz от 07.07.2026, № 4442567","kk":"enbek.kz түбіртегі, 07.07.2026, № 4442567"}'),
    ('Quittung enbek.kz vom 11.08.2026, Nr. 4445776', '{"en":"Receipt from enbek.kz of 11.08.2026, No. 4445776","ru":"Квитанция enbek.kz от 11.08.2026, № 4445776","kk":"enbek.kz түбіртегі, 11.08.2026, № 4445776"}'),
    ('Quittung enbek.kz vom 14.07.2026, Nr. 4485797', '{"en":"Receipt from enbek.kz of 14.07.2026, No. 4485797","ru":"Квитанция enbek.kz от 14.07.2026, № 4485797","kk":"enbek.kz түбіртегі, 14.07.2026, № 4485797"}'),
    ('Quittung enbek.kz vom 16.06.2026, Nr. 4401481', '{"en":"Receipt from enbek.kz of 16.06.2026, No. 4401481","ru":"Квитанция enbek.kz от 16.06.2026, № 4401481","kk":"enbek.kz түбіртегі, 16.06.2026, № 4401481"}'),
    ('Quittung enbek.kz vom 16.06.2026, Nr. 4467508', '{"en":"Receipt from enbek.kz of 16.06.2026, No. 4467508","ru":"Квитанция enbek.kz от 16.06.2026, № 4467508","kk":"enbek.kz түбіртегі, 16.06.2026, № 4467508"}'),
    ('Quittung enbek.kz vom 18.08.2026, Nr. 4477260', '{"en":"Receipt from enbek.kz of 18.08.2026, No. 4477260","ru":"Квитанция enbek.kz от 18.08.2026, № 4477260","kk":"enbek.kz түбіртегі, 18.08.2026, № 4477260"}'),
    ('Quittung enbek.kz vom 21.07.2026, Nr. 4404747', '{"en":"Receipt from enbek.kz of 21.07.2026, No. 4404747","ru":"Квитанция enbek.kz от 21.07.2026, № 4404747","kk":"enbek.kz түбіртегі, 21.07.2026, № 4404747"}'),
    ('Quittung enbek.kz vom 23.06.2026, Nr. 4434521', '{"en":"Receipt from enbek.kz of 23.06.2026, No. 4434521","ru":"Квитанция enbek.kz от 23.06.2026, № 4434521","kk":"enbek.kz түбіртегі, 23.06.2026, № 4434521"}'),
    ('Quittung enbek.kz vom 23.06.2026, Nr. 4476177', '{"en":"Receipt from enbek.kz of 23.06.2026, No. 4476177","ru":"Квитанция enbek.kz от 23.06.2026, № 4476177","kk":"enbek.kz түбіртегі, 23.06.2026, № 4476177"}')
  ) as v(original, uebers)
 where t.bestaetigung = v.original
   and not (t.i18n ? 'bestaetigung');

-- finance_ledger_entries.beschreibung (49 Texte)
update public.finance_ledger_entries t
   set i18n = t.i18n || jsonb_build_object('beschreibung', v.uebers::jsonb)
  from (values
    ('116 kg zu 2100 Tenge je kg', '{"en":"116 kg at 2100 tenge per kg","ru":"116 кг по 2100 тенге за кг","kk":"116 кг, келісі 2100 теңге"}'),
    ('117 kg zu 2050 Tenge je kg', '{"en":"117 kg at 2050 tenge per kg","ru":"117 кг по 2050 тенге за кг","kk":"117 кг, келісі 2050 теңге"}'),
    ('22 kg zu 2050 Tenge je kg', '{"en":"22 kg at 2050 tenge per kg","ru":"22 кг по 2050 тенге за кг","kk":"22 кг, келісі 2050 теңге"}'),
    ('25 kg zu 2050 Tenge je kg', '{"en":"25 kg at 2050 tenge per kg","ru":"25 кг по 2050 тенге за кг","kk":"25 кг, келісі 2050 теңге"}'),
    ('33 kg zu 2050 Tenge je kg', '{"en":"33 kg at 2050 tenge per kg","ru":"33 кг по 2050 тенге за кг","kk":"33 кг, келісі 2050 теңге"}'),
    ('35 kg zu 2050 Tenge je kg', '{"en":"35 kg at 2050 tenge per kg","ru":"35 кг по 2050 тенге за кг","kk":"35 кг, келісі 2050 теңге"}'),
    ('37 kg zu 2050 Tenge je kg', '{"en":"37 kg at 2050 tenge per kg","ru":"37 кг по 2050 тенге за кг","kk":"37 кг, келісі 2050 теңге"}'),
    ('38 kg zu 2050 Tenge je kg', '{"en":"38 kg at 2050 tenge per kg","ru":"38 кг по 2050 тенге за кг","kk":"38 кг, келісі 2050 теңге"}'),
    ('53 kg zu 2050 Tenge je kg', '{"en":"53 kg at 2050 tenge per kg","ru":"53 кг по 2050 тенге за кг","kk":"53 кг, келісі 2050 теңге"}'),
    ('55 kg zu 2050 Tenge je kg', '{"en":"55 kg at 2050 tenge per kg","ru":"55 кг по 2050 тенге за кг","kk":"55 кг, келісі 2050 теңге"}'),
    ('60 kg zu 1900 Tenge je kg', '{"en":"60 kg at 1900 tenge per kg","ru":"60 кг по 1900 тенге за кг","kk":"60 кг, келісі 1900 теңге"}'),
    ('68 kg zu 2100 Tenge je kg', '{"en":"68 kg at 2100 tenge per kg","ru":"68 кг по 2100 тенге за кг","kk":"68 кг, келісі 2100 теңге"}'),
    ('72 kg zu 2050 Tenge je kg', '{"en":"72 kg at 2050 tenge per kg","ru":"72 кг по 2050 тенге за кг","kk":"72 кг, келісі 2050 теңге"}'),
    ('77 kg zu 2050 Tenge je kg', '{"en":"77 kg at 2050 tenge per kg","ru":"77 кг по 2050 тенге за кг","kk":"77 кг, келісі 2050 теңге"}'),
    ('82 kg zu 1900 Tenge je kg', '{"en":"82 kg at 1900 tenge per kg","ru":"82 кг по 1900 тенге за кг","kk":"82 кг, келісі 1900 теңге"}'),
    ('83 kg zu 2100 Tenge je kg', '{"en":"83 kg at 2100 tenge per kg","ru":"83 кг по 2100 тенге за кг","kk":"83 кг, келісі 2100 теңге"}'),
    ('84 kg zu 2100 Tenge je kg', '{"en":"84 kg at 2100 tenge per kg","ru":"84 кг по 2100 тенге за кг","kk":"84 кг, келісі 2100 теңге"}'),
    ('93 kg zu 2100 Tenge je kg', '{"en":"93 kg at 2100 tenge per kg","ru":"93 кг по 2100 тенге за кг","kk":"93 кг, келісі 2100 теңге"}'),
    ('95 kg zu 2050 Tenge je kg', '{"en":"95 kg at 2050 tenge per kg","ru":"95 кг по 2050 тенге за кг","kk":"95 кг, келісі 2050 теңге"}'),
    ('96 kg zu 1900 Tenge je kg', '{"en":"96 kg at 1900 tenge per kg","ru":"96 кг по 1900 тенге за кг","kk":"96 кг, келісі 1900 теңге"}'),
    ('Anteil an der Tour zu Almaty Fresh Market', '{"en":"Share of the tour to Almaty Fresh Market","ru":"Доля в рейсе к клиенту Almaty Fresh Market","kk":"Almaty Fresh Market клиентіне жеткізу рейсіндегі үлес"}'),
    ('Anteil an der Tour zu Gastro-Distributor Almaty', '{"en":"Share of the tour to Gastro-Distributor Almaty","ru":"Доля в рейсе к клиенту Gastro-Distributor Almaty","kk":"Gastro-Distributor Almaty клиентіне жеткізу рейсіндегі үлес"}'),
    ('Anteil an der Tour zu Handelskette A', '{"en":"Share of the tour to Handelskette A","ru":"Доля в рейсе к клиенту Handelskette A","kk":"Handelskette A клиентіне жеткізу рейсіндегі үлес"}'),
    ('Beispielbuchung direkt an der Charge', '{"en":"Sample entry directly on the batch","ru":"Пример проводки прямо на партии","kk":"Партияға тікелей жазылған үлгі жазба"}'),
    ('Brigade Nord', '{"en":"North crew","ru":"Бригада Север","kk":"Солтүстік бригада"}'),
    ('Brigade Nord, Vorkuehlung', '{"en":"North crew, pre-cooling","ru":"Бригада Север, предварительное охлаждение","kk":"Солтүстік бригада, алдын ала салқындату"}'),
    ('Brigade Ost', '{"en":"East crew","ru":"Бригада Восток","kk":"Шығыс бригада"}'),
    ('Lieferung Gastro-Distributor', '{"en":"Delivery Gastro distributor","ru":"Поставка гастро-дистрибьютору","kk":"Гастро-дистрибьюторға жеткізу"}'),
    ('Lieferung Handelskette A', '{"en":"Delivery Handelskette A","ru":"Поставка Handelskette A","kk":"Handelskette A жеткізілімі"}'),
    ('Nachbarbetrieb Kaskelen', '{"en":"Neighbouring farm Kaskelen","ru":"Соседнее хозяйство Каскелен","kk":"Көрші шаруашылық Қаскелең"}'),
    ('Pflückaufgabe PA-S-260925-01', '{"en":"Picking task PA-S-260925-01","ru":"Задание на сбор PA-S-260925-01","kk":"Теру тапсырмасы PA-S-260925-01"}'),
    ('Pflückaufgabe PA-S-260926-02', '{"en":"Picking task PA-S-260926-02","ru":"Задание на сбор PA-S-260926-02","kk":"Теру тапсырмасы PA-S-260926-02"}'),
    ('Pflückaufgabe PA-S-260928-03', '{"en":"Picking task PA-S-260928-03","ru":"Задание на сбор PA-S-260928-03","kk":"Теру тапсырмасы PA-S-260928-03"}'),
    ('Pflückaufgabe PA-S-260929-04', '{"en":"Picking task PA-S-260929-04","ru":"Задание на сбор PA-S-260929-04","kk":"Теру тапсырмасы PA-S-260929-04"}'),
    ('Pflückaufgabe PA-S-260930-05', '{"en":"Picking task PA-S-260930-05","ru":"Задание на сбор PA-S-260930-05","kk":"Теру тапсырмасы PA-S-260930-05"}'),
    ('Pflückaufgabe PA-S-261001-06', '{"en":"Picking task PA-S-261001-06","ru":"Задание на сбор PA-S-261001-06","kk":"Теру тапсырмасы PA-S-261001-06"}'),
    ('Pflückaufgabe PA-S-261002-07', '{"en":"Picking task PA-S-261002-07","ru":"Задание на сбор PA-S-261002-07","kk":"Теру тапсырмасы PA-S-261002-07"}'),
    ('Pflückaufgabe PA-S-261003-08', '{"en":"Picking task PA-S-261003-08","ru":"Задание на сбор PA-S-261003-08","kk":"Теру тапсырмасы PA-S-261003-08"}'),
    ('Pflückaufgabe PA-S-261005-09', '{"en":"Picking task PA-S-261005-09","ru":"Задание на сбор PA-S-261005-09","kk":"Теру тапсырмасы PA-S-261005-09"}'),
    ('Pflückaufgabe PA-S-261006-10', '{"en":"Picking task PA-S-261006-10","ru":"Задание на сбор PA-S-261006-10","kk":"Теру тапсырмасы PA-S-261006-10"}'),
    ('Pflückaufgabe PA-S-261007-11', '{"en":"Picking task PA-S-261007-11","ru":"Задание на сбор PA-S-261007-11","kk":"Теру тапсырмасы PA-S-261007-11"}'),
    ('Pflückaufgabe PA-S-261008-12', '{"en":"Picking task PA-S-261008-12","ru":"Задание на сбор PA-S-261008-12","kk":"Теру тапсырмасы PA-S-261008-12"}'),
    ('Pflückaufgabe PA-S-261009-13', '{"en":"Picking task PA-S-261009-13","ru":"Задание на сбор PA-S-261009-13","kk":"Теру тапсырмасы PA-S-261009-13"}'),
    ('Pflückaufgabe PA-S-261010-14', '{"en":"Picking task PA-S-261010-14","ru":"Задание на сбор PA-S-261010-14","kk":"Теру тапсырмасы PA-S-261010-14"}'),
    ('Pflückaufgabe PA-S-261012-15', '{"en":"Picking task PA-S-261012-15","ru":"Задание на сбор PA-S-261012-15","kk":"Теру тапсырмасы PA-S-261012-15"}'),
    ('Pflückaufgabe PA-S-261013-16', '{"en":"Picking task PA-S-261013-16","ru":"Задание на сбор PA-S-261013-16","kk":"Теру тапсырмасы PA-S-261013-16"}'),
    ('Schalen zu 125 g', '{"en":"Trays of 125 g","ru":"Лотки по 125 г","kk":"125 г контейнерлер"}'),
    ('Vorkühlung und Kühlhaus', '{"en":"Pre-cooling and cold store","ru":"Предварительное охлаждение и холодильный склад","kk":"Алдын ала салқындату және тоңазытқыш қойма"}'),
    ('Zukauf-Charge', '{"en":"Purchased batch","ru":"Закупленная партия","kk":"Сатып алынған партия"}')
  ) as v(original, uebers)
 where t.beschreibung = v.original
   and not (t.i18n ? 'beschreibung');

-- finance_ledger_entries.kategorie (10 Texte)
update public.finance_ledger_entries t
   set i18n = t.i18n || jsonb_build_object('kategorie', v.uebers::jsonb)
  from (values
    ('B2B-Verkauf', '{"en":"B2B sales","ru":"B2B-продажи","kk":"B2B сатылымы"}'),
    ('Erlös aus Lieferung Almaty Fresh Market', '{"en":"Revenue from delivery Almaty Fresh Market","ru":"Выручка от поставки Almaty Fresh Market","kk":"Almaty Fresh Market жеткізілімінен түскен түсім"}'),
    ('Erlös aus Lieferung Gastro-Distributor Almaty', '{"en":"Revenue from delivery Gastro-Distributor Almaty","ru":"Выручка от поставки Gastro-Distributor Almaty","kk":"Gastro-Distributor Almaty жеткізілімінен түскен түсім"}'),
    ('Erlös aus Lieferung Handelskette A', '{"en":"Revenue from delivery Handelskette A","ru":"Выручка от поставки Handelskette A","kk":"Handelskette A жеткізілімінен түскен түсім"}'),
    ('Ernte + Kuehlung', '{"en":"Harvest + cooling","ru":"Сбор + охлаждение","kk":"Жинау + салқындату"}'),
    ('Kühlung und Strom', '{"en":"Cooling and electricity","ru":"Охлаждение и электроэнергия","kk":"Салқындату және электр қуаты"}'),
    ('Pflücklohn', '{"en":"Picking wages","ru":"Оплата сбора","kk":"Теру жалақысы"}'),
    ('Transport', '{"en":"Transport","ru":"Транспорт","kk":"Көлік"}'),
    ('Verpackung (Schalen und Steigen)', '{"en":"Packaging (trays and crates)","ru":"Упаковка (лотки и ящики)","kk":"Қаптама (контейнерлер мен жәшіктер)"}'),
    ('Zukauf + Handling', '{"en":"Purchase + handling","ru":"Закуп + обработка","kk":"Сатып алу + өңдеу"}')
  ) as v(original, uebers)
 where t.kategorie = v.original
   and not (t.i18n ? 'kategorie');

-- preislisten.name (5 Texte)
update public.preislisten t
   set i18n = t.i18n || jsonb_build_object('name', v.uebers::jsonb)
  from (values
    ('Preisliste Herbst 2026', '{"en":"Price list autumn 2026","ru":"Прайс-лист осень 2026","kk":"2026 күзгі баға тізімі"}'),
    ('Preisliste Herbst 2026 - Handel', '{"en":"Price list autumn 2026, trade","ru":"Прайс-лист осень 2026, торговля","kk":"2026 күзгі баға тізімі, сауда"}'),
    ('Preisliste Winter 2026', '{"en":"Price list winter 2026","ru":"Прайс-лист зима 2026","kk":"2026 қысқы баға тізімі"}'),
    ('Preisliste Winter 2026 - Gastronomie', '{"en":"Price list winter 2026, catering","ru":"Прайс-лист зима 2026, общепит","kk":"2026 қысқы баға тізімі, қоғамдық тамақтану"}'),
    ('Preisliste Winter 2026 - Handel', '{"en":"Price list winter 2026, trade","ru":"Прайс-лист зима 2026, торговля","kk":"2026 қысқы баға тізімі, сауда"}')
  ) as v(original, uebers)
 where t.name = v.original
   and not (t.i18n ? 'name');

-- reklamation_ereignisse.text (11 Texte)
update public.reklamation_ereignisse t
   set i18n = t.i18n || jsonb_build_object('text', v.uebers::jsonb)
  from (values
    ('Fotos der beschädigten Schalen sind angefordert. Die Verpackung der Tour wird mit dem Fahrer geklärt.', '{"en":"Photos of the damaged trays have been requested. The packaging of the tour is being clarified with the driver.","ru":"Запрошены фото повреждённых лотков. Упаковку рейса уточняют с водителем.","kk":"Зақымданған контейнерлердің фотосуреттері сұралды. Рейс қаптамасы жүргізушімен нақтыланады."}'),
    ('Gutschrift fuer zwei Kartons erteilt, Verpackungsvorgabe an die Logistik nachgeschaerft.', '{"en":"Credit note issued for two cartons, packaging specification tightened for logistics.","ru":"Выдана кредит-нота за два картона, требования к упаковке для логистики ужесточены.","kk":"Екі қорап үшін өтемақы берілді, логистикаға арналған қаптама талабы күшейтілді."}'),
    ('Intern: Der Logger der Tour zeigt 4,1 Grad bis zur Übergabe, vor der Annahme standen die Steigen 50 Minuten in der Rampe.', '{"en":"Internal: the logger of the tour shows 4.1 degrees until handover, before acceptance the crates stood 50 minutes on the ramp.","ru":"Внутренне: логгер рейса показывает 4,1 градуса до передачи, перед приёмкой ящики 50 минут стояли на рампе.","kk":"Ішкі: рейс логгері тапсыруға дейін 4,1 градус көрсетті, қабылдау алдында жәшіктер 50 минут рампада тұрды."}'),
    ('Kuehlkurve wird mit dem Messprotokoll der Charge abgeglichen.', '{"en":"The cooling curve is being compared with the measurement log of the batch.","ru":"Кривая охлаждения сверяется с протоколом измерений партии.","kk":"Салқындату қисығы партияның өлшем хаттамасымен салыстырылуда."}'),
    ('Kühlkette der Tour geprüft: Der Logger zeigte 4,1 Grad bis zur Übergabe, die Wartezeit vor der Annahme betrug 50 Minuten. Gutschrift für 6,5 kg erteilt.', '{"en":"Cold chain of the tour checked: the logger showed 4.1 degrees until handover, the waiting time before acceptance was 50 minutes. Credit note issued for 6.5 kg.","ru":"Холодовая цепь рейса проверена: логгер показывал 4,1 градуса до передачи, ожидание перед приёмкой составило 50 минут. Выдана кредит-нота на 6,5 кг.","kk":"Рейстің суық тізбегі тексерілді: логгер тапсыруға дейін 4,1 градус көрсетті, қабылдау алдындағы күту 50 минутты құрады. 6,5 кг үшін өтемақы берілді."}'),
    ('Meldung eingegangen: Schalen beschädigt, rund ein Fünftel zerdrückt.', '{"en":"Report received: trays damaged, about one fifth crushed.","ru":"Сообщение получено: лотки повреждены, около пятой части раздавлено.","kk":"Хабарлама түсті: контейнерлер зақымданған, шамамен бестен бірі басылып қалған."}'),
    ('Meldung eingegangen: Ware bei Annahme zu warm.', '{"en":"Report received: goods too warm on acceptance.","ru":"Сообщение получено: товар при приёмке слишком тёплый.","kk":"Хабарлама түсті: қабылдау кезінде тауар тым жылы."}'),
    ('Reklamation gemeldet: Gelieferte Menge unter Bestellmenge', '{"en":"Complaint reported: delivered quantity below ordered quantity","ru":"Рекламация заявлена: поставленное количество меньше заказанного","kk":"Шағым жарияланды: жеткізілген көлем тапсырыс көлемінен аз"}'),
    ('Reklamation gemeldet: Kartons bei Anlieferung durchnaesst', '{"en":"Complaint reported: cartons soaked on delivery","ru":"Рекламация заявлена: картоны при доставке промокли","kk":"Шағым жарияланды: жеткізу кезінде қораптар су болып қалған"}'),
    ('Reklamation gemeldet: Ware bei Anlieferung zu warm', '{"en":"Complaint reported: goods too warm on delivery","ru":"Рекламация заявлена: товар при доставке слишком тёплый","kk":"Шағым жарияланды: жеткізу кезінде тауар тым жылы"}'),
    ('Temperaturkurve der Fahrt und Kühlkette der Charge werden geprüft.', '{"en":"The temperature curve of the trip and the cold chain of the batch are being checked.","ru":"Проверяются температурная кривая рейса и холодовая цепь партии.","kk":"Рейстің температура қисығы мен партияның суық тізбегі тексерілуде."}')
  ) as v(original, uebers)
 where t.text = v.original
   and not (t.i18n ? 'text');

-- reklamationen.beschreibung (5 Texte)
update public.reklamationen t
   set i18n = t.i18n || jsonb_build_object('beschreibung', v.uebers::jsonb)
  from (values
    ('Beim Wareneingang zeigte die Schalenmitte 9 Grad, einzelne Schalen waren weich. Foto der Messung liegt der Meldung bei.', '{"en":"At goods receipt the centre of the trays showed 9 degrees, some trays were soft. A photo of the measurement is attached to the report.","ru":"При приёмке товара в центре лотков было 9 градусов, отдельные лотки были мягкими. Фото замера приложено к сообщению.","kk":"Тауарды қабылдау кезінде контейнер ортасы 9 градус көрсетті, кейбір контейнерлер жұмсақ болды. Өлшемнің фотосы хабарламаға тіркелген."}'),
    ('Drei Steigen mit eingedrückten Deckeln, rund ein Fünftel der Schalen zerdrückt.', '{"en":"Three crates with dented lids, about one fifth of the trays crushed.","ru":"Три ящика с помятыми крышками, около пятой части лотков раздавлено.","kk":"Үш жәшіктің қақпағы басылып қалған, контейнерлердің шамамен бестен бірі басылған."}'),
    ('Kuehlkette laut Messprotokoll erst nach 72 Minuten erreicht (siehe audit_events kuehlkette.verstoss). Kunde meldet weiche, ueberreife Beeren bei Anlieferung.', '{"en":"Cold chain reached only after 72 minutes according to the measurement log (see audit_events kuehlkette.verstoss). Customer reports soft, overripe berries on delivery.","ru":"Холодовая цепь по протоколу измерений достигнута только через 72 минуты (см. audit_events kuehlkette.verstoss). Клиент сообщает о мягких, перезрелых ягодах при доставке.","kk":"Өлшем хаттамасы бойынша суық тізбекке тек 72 минуттан кейін қол жетті (қараңыз audit_events kuehlkette.verstoss). Клиент жеткізу кезінде жұмсақ, шамадан тыс піскен жидектер туралы хабарлады."}'),
    ('Laut Lieferschein 49,5 kg angekuendigt, im Wareneingang wurden nur 46,0 kg gewogen.', '{"en":"49.5 kg announced according to the delivery note, only 46.0 kg were weighed at goods receipt.","ru":"По накладной заявлено 49,5 кг, при приёмке взвешено только 46,0 кг.","kk":"Жүкқұжат бойынша 49,5 кг жарияланды, тауар қабылдауда тек 46,0 кг өлшенді."}'),
    ('Zwei von acht Kartons waren an der Unterseite durchnaesst, Ware in diesen Kartons nicht mehr verkaufsfaehig.', '{"en":"Two of eight cartons were soaked on the underside, goods in these cartons no longer saleable.","ru":"Два из восьми картонов промокли снизу, товар в этих картонах больше не годен к продаже.","kk":"Сегіз қораптың екеуі төменгі жағынан су болып қалды, бұл қораптардағы тауар енді сатуға жарамсыз."}')
  ) as v(original, uebers)
 where t.beschreibung = v.original
   and not (t.i18n ? 'beschreibung');

-- reklamationen.betreff (5 Texte)
update public.reklamationen t
   set i18n = t.i18n || jsonb_build_object('betreff', v.uebers::jsonb)
  from (values
    ('Gelieferte Menge unter Bestellmenge', '{"en":"Delivered quantity below ordered quantity","ru":"Поставленное количество меньше заказанного","kk":"Жеткізілген көлем тапсырыс көлемінен аз"}'),
    ('Kartons bei Anlieferung durchnaesst', '{"en":"Cartons soaked on delivery","ru":"Картоны при доставке промокли","kk":"Жеткізу кезінде қораптар су болып қалған"}'),
    ('Schalen beschädigt', '{"en":"Trays damaged","ru":"Лотки повреждены","kk":"Контейнерлер зақымданған"}'),
    ('Ware bei Anlieferung zu warm', '{"en":"Goods too warm on delivery","ru":"Товар при доставке слишком тёплый","kk":"Жеткізу кезінде тауар тым жылы"}'),
    ('Ware bei Annahme zu warm', '{"en":"Goods too warm on acceptance","ru":"Товар при приёмке слишком тёплый","kk":"Қабылдау кезінде тауар тым жылы"}')
  ) as v(original, uebers)
 where t.betreff = v.original
   and not (t.i18n ? 'betreff');

-- reklamationen.loesung (2 Texte)
update public.reklamationen t
   set i18n = t.i18n || jsonb_build_object('loesung', v.uebers::jsonb)
  from (values
    ('Gutschrift fuer zwei Kartons erteilt, Verpackungsvorgabe an die Logistik nachgeschaerft.', '{"en":"Credit note issued for two cartons, packaging specification tightened for logistics.","ru":"Выдана кредит-нота за два картона, требования к упаковке для логистики ужесточены.","kk":"Екі қорап үшін өтемақы берілді, логистикаға арналған қаптама талабы күшейтілді."}'),
    ('Kühlkette der Tour geprüft: Der Logger zeigte 4,1 Grad bis zur Übergabe, die Wartezeit vor der Annahme betrug 50 Minuten. Gutschrift für 6,5 kg erteilt.', '{"en":"Cold chain of the tour checked: the logger showed 4.1 degrees until handover, the waiting time before acceptance was 50 minutes. Credit note issued for 6.5 kg.","ru":"Холодовая цепь рейса проверена: логгер показывал 4,1 градуса до передачи, ожидание перед приёмкой составило 50 минут. Выдана кредит-нота на 6,5 кг.","kk":"Рейстің суық тізбегі тексерілді: логгер тапсыруға дейін 4,1 градус көрсетті, қабылдау алдындағы күту 50 минутты құрады. 6,5 кг үшін өтемақы берілді."}')
  ) as v(original, uebers)
 where t.loesung = v.original
   and not (t.i18n ? 'loesung');

-- vorbestellung_nachrichten.text (12 Texte)
update public.vorbestellung_nachrichten t
   set i18n = t.i18n || jsonb_build_object('text', v.uebers::jsonb)
  from (values
    ('Bestätigt. Die Temperaturkurve der Fahrt hängt am Lieferschein.', '{"en":"Confirmed. The temperature curve of the trip is attached to the delivery note.","ru":"Подтверждено. Температурная кривая рейса приложена к накладной.","kk":"Расталды. Рейстің температура қисығы жеткізу жүкқұжатына тіркелген."}'),
    ('Danke. Bitte den Lieferschein mit der ЭСФ-Nummer mitgeben, damit die Buchhaltung ihn gleich verbuchen kann.', '{"en":"Thank you. Please include the delivery note with the ЭСФ number so that accounting can book it right away.","ru":"Спасибо. Пожалуйста, приложите накладную с номером ЭСФ, чтобы бухгалтерия могла сразу её провести.","kk":"Рақмет. Бухгалтерия бірден есепке алуы үшін ЭСФ нөмірі бар жеткізу жүкқұжатын қоса беріңіз."}'),
    ('Guten Tag, das passt. Die Ernte läuft am Vortag, die Lieferung ist bis neun Uhr eingeplant.', '{"en":"Good day, that works. The harvest runs the day before, the delivery is scheduled by nine o''clock.","ru":"Добрый день, это подходит. Сбор идёт накануне, поставка запланирована до девяти часов.","kk":"Қайырлы күн, бұл жарайды. Жинау алдыңғы күні жүреді, жеткізу сағат тоғызға дейін жоспарланған."}'),
    ('Guten Tag, wir brauchen 120 kg Polka zum angegebenen Termin, bitte bis neun Uhr an der Warenannahme. Schalen zu 125 g.', '{"en":"Good day, we need 120 kg of Polka on the stated date, please at goods receipt by nine o''clock. Trays of 125 g.","ru":"Добрый день, нам нужно 120 кг Польки к указанному сроку, просим доставить на приёмку товара до девяти часов. Лотки по 125 г.","kk":"Қайырлы күн, көрсетілген мерзімге 120 кг Полька керек, тауар қабылдауға сағат тоғызға дейін жеткізуіңізді сұраймыз. 125 г контейнерлер."}'),
    ('Machen wir. Die ЭСФ wird am Liefertag ausgestellt.', '{"en":"Will do. The ЭСФ is issued on the day of delivery.","ru":"Сделаем. ЭСФ выписывается в день поставки.","kk":"Жасаймыз. ЭСФ жеткізу күні шығарылады."}'),
    ('Storniert. Das Kontingent ist wieder frei.', '{"en":"Cancelled. The quota is available again.","ru":"Отменено. Квота снова свободна.","kk":"Бас тартылды. Квота қайтадан бос."}'),
    ('Verstanden, die Menge ist im Kontingent frei. Welches Lieferfenster passt Ihnen?', '{"en":"Understood, the quantity is available in the quota. Which delivery window suits you?","ru":"Понятно, объём свободен в квоте. Какое окно поставки вам подходит?","kk":"Түсінікті, көлем квотада бос. Сізге қандай жеткізу терезесі ыңғайлы?"}'),
    ('Wir brauchen die Polana doch nicht, der Aktionstag wurde verschoben. Bitte stornieren.', '{"en":"We do not need the Polana after all, the promotion day was postponed. Please cancel.","ru":"Полана нам всё-таки не нужна, акция перенесена. Пожалуйста, отмените.","kk":"Полана бізге керек емес болды, акция күні ауыстырылды. Бас тартуыңызды сұраймыз."}'),
    ('Wir möchten 200 kg Polka abrufen, bitte gegen das Kontingent aus dem Rahmenvertrag buchen.', '{"en":"We would like to call off 200 kg of Polka, please book it against the quota from the framework contract.","ru":"Мы хотим вызвать 200 кг Польки, просим провести по квоте из рамочного договора.","kk":"200 кг Полька шақыртқымыз келеді, жақтау шарттағы квота есебінен өткізуіңізді сұраймыз."}'),
    ('Zwischen sieben und neun Uhr am Zentrallager, bitte mit Kühlnachweis.', '{"en":"Between seven and nine o''clock at the central warehouse, please with cooling proof.","ru":"С семи до девяти часов на центральном складе, пожалуйста, с подтверждением охлаждения.","kk":"Сағат жеттіден тоғызға дейін орталық қоймада, суыту дәлелімен бірге."}'),
    ('Добрый день! Нужно 60 кг Поланы к четвергу, лучше в мелкой упаковке (125 г). Возможно ли?', '{"de":"Guten Tag! Wir brauchen 60 kg Polana bis Donnerstag, am liebsten in kleiner Verpackung (125 g). Ist das möglich?","en":"Good day! We need 60 kg of Polana by Thursday, preferably in small packaging (125 g). Is that possible?","kk":"Қайырлы күн! Бейсенбіге 60 кг Полана керек, шағын қаптамада (125 г) болса жақсы. Бұл мүмкін бе?"}'),
    ('Здравствуйте! Проверяем объём по прогнозу сбора и ответим до конца завтрашнего дня.', '{"de":"Guten Tag! Wir prüfen die Menge anhand der Ernteprognose und antworten bis zum Ende des morgigen Tages.","en":"Hello! We are checking the volume against the harvest forecast and will reply by the end of tomorrow.","kk":"Сәлеметсіз бе! Көлемді жинау болжамы бойынша тексеріп жатырмыз, ертеңгі күннің соңына дейін жауап береміз."}')
  ) as v(original, uebers)
 where t.text = v.original
   and not (t.i18n ? 'text');

-- wirtschaftlichkeit_ist.notiz (3 Texte)
update public.wirtschaftlichkeit_ist t
   set i18n = t.i18n || jsonb_build_object('notiz', v.uebers::jsonb)
  from (values
    ('Eine Reklamation weniger als im Vormonat, zwei Abholfahrten gespart.', '{"en":"One complaint fewer than in the previous month, two collection trips saved.","ru":"На одну рекламацию меньше, чем в прошлом месяце, сэкономлено два рейса вывоза.","kk":"Өткен айға қарағанда бір шағым аз, екі жинау рейсі үнемделді."}'),
    ('Eingesparte Stunden bei Steigen-Erfassung und Lohnvorbereitung, von der Buchhaltung bestätigt.', '{"en":"Hours saved in crate recording and payroll preparation, confirmed by accounting.","ru":"Сэкономленные часы на учёте ящиков и подготовке расчёта зарплаты, подтверждено бухгалтерией.","kk":"Жәшіктерді есепке алу мен жалақы дайындауда үнемделген сағаттар, бухгалтерия растады."}'),
    ('Erstmonat nach dem Start: Ausschuss laut Chargen, bewertet mit den Vollkosten.', '{"en":"First month after the start: rejects according to the batches, valued at full cost.","ru":"Первый месяц после старта: брак по партиям, оценён по полной себестоимости.","kk":"Іске қосудан кейінгі алғашқы ай: партиялар бойынша жарамсыз өнім, толық өзіндік құн бойынша бағаланды."}')
  ) as v(original, uebers)
 where t.notiz = v.original
   and not (t.i18n ? 'notiz');

-- wirtschaftlichkeit_posten.bezeichnung (20 Texte)
update public.wirtschaftlichkeit_posten t
   set i18n = t.i18n || jsonb_build_object('bezeichnung', v.uebers::jsonb)
  from (values
    ('Auditvorbereitung: Rückverfolgbarkeit und Nachweise auf Knopfdruck', '{"en":"Audit preparation: traceability and evidence at the push of a button","ru":"Подготовка к аудиту: прослеживаемость и подтверждения одним нажатием","kk":"Аудитке дайындық: қадағалау мүмкіндігі және дәлелдер бір басумен"}'),
    ('Einrichtung, Datenübernahme und Anbindung der Portale (ЭСФ, ЕСУТД)', '{"en":"Setup, data migration and connection of the portals (ЭСФ, ЕСУТД)","ru":"Настройка, перенос данных и подключение порталов (ЭСФ, ЕСУТД)","kk":"Баптау, деректерді көшіру және порталдарды қосу (ЭСФ, ЕСУТД)"}'),
    ('Ernte- und Haftpflichtversicherung, GlobalG.A.P., Gebühren und Genehmigungen', '{"en":"Crop and liability insurance, GlobalG.A.P., fees and permits","ru":"Страхование урожая и ответственности, GlobalG.A.P., сборы и разрешения","kk":"Егін және жауапкершілікті сақтандыру, GlobalG.A.P., алымдар мен рұқсаттар"}'),
    ('Feldgeräte: 14 Tablets mit Scankopf und Schutzhüllen', '{"en":"Field devices: 14 tablets with scan head and protective cases","ru":"Полевые устройства: 14 планшетов со сканером и защитными чехлами","kk":"Далалық құрылғылар: сканері мен қорғаныс қаптамалары бар 14 планшет"}'),
    ('Festes Personal: Betriebsleitung, Agronomie, Lager, Fahrer, Buchhaltung (14 Stellen)', '{"en":"Permanent staff: operations management, agronomy, warehouse, drivers, accounting (14 positions)","ru":"Постоянный персонал: руководство производства, агрономия, склад, водители, бухгалтерия (14 штатных единиц)","kk":"Тұрақты қызметкерлер: өндіріс басшылығы, агрономия, қойма, жүргізушілер, бухгалтерия (14 орын)"}'),
    ('Geringerer Schwund vom Pflücken bis zum Kunden', '{"en":"Lower shrinkage from picking to the customer","ru":"Меньшие потери от сбора до клиента","kk":"Теруден клиентке дейінгі ысырап азаяды"}'),
    ('Hosting und Datenbank (Vercel, Supabase)', '{"en":"Hosting and database (Vercel, Supabase)","ru":"Хостинг и база данных (Vercel, Supabase)","kk":"Хостинг және дерекқор (Vercel, Supabase)"}'),
    ('Instandhaltung, Grundlast Strom und Abschreibung von Kühlhaus, Sortierhalle und Lager', '{"en":"Maintenance, base-load electricity and depreciation of cold store, sorting hall and warehouse","ru":"Содержание, базовая нагрузка электроэнергии и амортизация холодильного склада, сортировочного цеха и склада","kk":"Тоңазытқыш қойманы, сұрыптау цехын және қойманы күтіп-ұстау, электр қуатының базалық жүктемесі және амортизация"}'),
    ('KI-Assistent, Spracherkennung, Karten und Routing', '{"en":"AI assistant, speech recognition, maps and routing","ru":"ИИ-ассистент, распознавание речи, карты и маршрутизация","kk":"ЖИ-көмекші, сөйлеуді тану, карталар және маршруттау"}'),
    ('Leasing, Versicherung und feste Wartung der vier Kühlfahrzeuge und der Feldfahrzeuge', '{"en":"Leasing, insurance and fixed maintenance of the four refrigerated vehicles and the field vehicles","ru":"Лизинг, страхование и постоянное обслуживание четырёх рефрижераторов и полевых машин","kk":"Төрт тоңазытқыш көлікті және далалық көліктерді лизингке алу, сақтандыру және тұрақты қызмет көрсету"}'),
    ('Pacht der Anbauflächen (50 ha) und Wassernutzung', '{"en":"Lease of the growing areas (50 ha) and water use","ru":"Аренда посевных площадей (50 га) и водопользование","kk":"Егістік алқаптарын (50 га) жалға алу және су пайдалану"}'),
    ('Plattform Damicon bis zur Abnahme (Festpreis)', '{"en":"Damicon platform up to acceptance (fixed price)","ru":"Платформа Damicon до приёмки (фиксированная цена)","kk":"Damicon платформасы қабылдауға дейін (тіркелген баға)"}'),
    ('Schulung von Brigaden, Betriebsleitung und Büro in vier Sprachen', '{"en":"Training of crews, operations management and office in four languages","ru":"Обучение бригад, руководства производства и офиса на четырёх языках","kk":"Бригадаларды, өндіріс басшылығын және кеңсені төрт тілде оқыту"}'),
    ('Steuer- und Rechtsberatung, Bank, Büro, Kommunikation', '{"en":"Tax and legal advice, bank, office, communication","ru":"Налоговые и юридические консультации, банк, офис, связь","kk":"Салықтық және құқықтық кеңес, банк, кеңсе, байланыс"}'),
    ('Temperaturlogger und Gateways für Kühlhaus und Fahrzeuge', '{"en":"Temperature loggers and gateways for cold store and vehicles","ru":"Температурные логгеры и шлюзы для холодильного склада и транспорта","kk":"Тоңазытқыш қойма мен көліктерге арналған температура логгерлері мен шлюздер"}'),
    ('Tropfbewässerung, Folientunnel und Pflanzen: Instandhaltung und Abschreibung', '{"en":"Drip irrigation, polytunnels and plants: maintenance and depreciation","ru":"Капельный полив, плёночные туннели и растения: содержание и амортизация","kk":"Тамшылатып суару, пленкалы туннельдер және өсімдіктер: күтіп-ұстау және амортизация"}'),
    ('Wartung und Support mit vier Stunden Reaktionszeit', '{"en":"Maintenance and support with four hours response time","ru":"Обслуживание и поддержка со временем реакции четыре часа","kk":"Реакция уақыты төрт сағат болатын қызмет көрсету және қолдау"}'),
    ('Wegfall der Papier- und Excel-Erfassung (Steigen, Lohn, Berichte)', '{"en":"No more paper and Excel recording (crates, wages, reports)","ru":"Отказ от бумажного и Excel-учёта (ящики, зарплата, отчёты)","kk":"Қағаз бен Excel есебінен бас тарту (жәшіктер, жалақы, есептер)"}'),
    ('Weiterentwicklung, kontingentiert auf 60 Stunden im Jahr', '{"en":"Further development, capped at 60 hours per year","ru":"Развитие, ограничено 60 часами в год","kk":"Әрі қарай дамыту, жылына 60 сағатпен шектелген"}'),
    ('Weniger Reklamationen und Gutschriften, kürzere Abholfahrten, schnellere Fakturierung', '{"en":"Fewer complaints and credit notes, shorter collection trips, faster invoicing","ru":"Меньше рекламаций и кредит-нот, короче рейсы вывоза, быстрее выставление счетов","kk":"Шағымдар мен өтемақылар азаяды, жинау рейстері қысқарады, шот жылдамырақ шығарылады"}')
  ) as v(original, uebers)
 where t.bezeichnung = v.original
   and not (t.i18n ? 'bezeichnung');

-- wirtschaftlichkeit_posten.kategorie (15 Texte)
update public.wirtschaftlichkeit_posten t
   set i18n = t.i18n || jsonb_build_object('kategorie', v.uebers::jsonb)
  from (values
    ('Anlagen', '{"en":"Facilities","ru":"Сооружения и установки","kk":"Қондырғылар"}'),
    ('Dienste', '{"en":"Services","ru":"Сервисы","kk":"Қызметтер"}'),
    ('Einrichtung', '{"en":"Setup","ru":"Настройка","kk":"Баптау"}'),
    ('Entwicklung', '{"en":"Development","ru":"Разработка","kk":"Әзірлеу"}'),
    ('Fahrzeuge', '{"en":"Vehicles","ru":"Транспорт","kk":"Көліктер"}'),
    ('Gebäude und Kühlhaus', '{"en":"Buildings and cold store","ru":"Здания и холодильный склад","kk":"Ғимараттар және тоңазытқыш қойма"}'),
    ('Hardware', '{"en":"Hardware","ru":"Оборудование","kk":"Жабдық"}'),
    ('Hosting', '{"en":"Hosting","ru":"Хостинг","kk":"Хостинг"}'),
    ('Pacht und Land', '{"en":"Lease and land","ru":"Аренда и земля","kk":"Жалға алу және жер"}'),
    ('Personal', '{"en":"Personnel","ru":"Персонал","kk":"Персонал"}'),
    ('Schulung', '{"en":"Training","ru":"Обучение","kk":"Оқыту"}'),
    ('Versicherung und Zertifikate', '{"en":"Insurance and certificates","ru":"Страхование и сертификаты","kk":"Сақтандыру және сертификаттар"}'),
    ('Verwaltung', '{"en":"Administration","ru":"Управление","kk":"Әкімшілік"}'),
    ('Wartung', '{"en":"Maintenance","ru":"Обслуживание","kk":"Қызмет көрсету"}'),
    ('Weiterentwicklung', '{"en":"Further development","ru":"Развитие","kk":"Дамыту"}')
  ) as v(original, uebers)
 where t.kategorie = v.original
   and not (t.i18n ? 'kategorie');

-- wirtschaftlichkeit_posten.notiz (9 Texte)
update public.wirtschaftlichkeit_posten t
   set i18n = t.i18n || jsonb_build_object('notiz', v.uebers::jsonb)
  from (values
    ('Festpreisangebot vom 24.06.2026, Abnahme zum Saisonstart.', '{"en":"Fixed-price offer of 24.06.2026, acceptance at the start of the season.","ru":"Предложение с фиксированной ценой от 24.06.2026, приёмка к началу сезона.","kk":"2026 жылғы 24 маусымдағы тіркелген бағалы ұсыныс, қабылдау маусым басына."}'),
    ('Fixer Anteil aus den Stromabrechnungen des Vorjahres, die Abschreibung nach Bilanz geschätzt.', '{"en":"Fixed share from last year''s electricity bills, depreciation estimated from the balance sheet.","ru":"Постоянная доля по счетам за электроэнергию прошлого года, амортизация оценена по балансу.","kk":"Өткен жылғы электр қуаты шоттарындағы тұрақты үлес, амортизация баланс бойынша бағаланған."}'),
    ('Geschätzt aus dem Aufwand für Nachweisordner und Rückfragen von Handelsketten vor der Saison.', '{"en":"Estimated from the effort for evidence folders and enquiries from retail chains before the season.","ru":"Оценка по затратам на папки с подтверждающими документами и запросы торговых сетей перед сезоном.","kk":"Маусым алдындағы растама қапшықтары мен сауда желілерінің сұраулары бойынша шығындардан бағаланған."}'),
    ('Geschätzt aus den Stunden für Erfassung, Lohnvorbereitung und Berichte der Betriebsleitung, der Buchhaltung und der Vorarbeiter im Vorjahr.', '{"en":"Estimated from the hours spent on recording, payroll preparation and reports by operations management, accounting and foremen in the previous year.","ru":"Оценка по часам, затраченным в прошлом году на учёт, подготовку зарплаты и отчёты руководством производства, бухгалтерией и бригадирами.","kk":"Өткен жылы өндіріс басшылығы, бухгалтерия және бригадирлер есепке алуға, жалақы дайындауға және есептерге жұмсаған сағаттардан бағаланған."}'),
    ('Hochrechnung auf 350 t Jahresmenge: Verlustquote von 8,4 % (Baseline) auf 5,3 % (Chargen der Saison), bewertet mit 1.500 Tenge je kg. Das ergibt rund 31.700 EUR.', '{"en":"Projection to an annual quantity of 350 t: loss rate from 8.4 % (baseline) to 5.3 % (batches of the season), valued at 1,500 tenge per kg. This gives about 31,700 EUR.","ru":"Расчёт на годовой объём 350 т: доля потерь снижается с 8,4 % (базовый уровень) до 5,3 % (партии сезона), оценка по 1 500 тенге за кг. Это даёт около 31 700 EUR.","kk":"Жылдық 350 т көлемге есептеу: ысырап үлесі 8,4 %-дан (базалық деңгей) 5,3 %-ға дейін (маусым партиялары) төмендейді, келісі 1 500 теңгемен бағаланады. Бұл шамамен 31 700 EUR береді."}'),
    ('Lohnliste September 2026, hochgerechnet auf zwölf Monate. Saisonkräfte (Pflücker) stehen nicht hier, sie sind variable Kosten.', '{"en":"Payroll of September 2026, extrapolated to twelve months. Seasonal workers (pickers) are not included here, they are variable costs.","ru":"Ведомость зарплаты за сентябрь 2026, пересчитана на двенадцать месяцев. Сезонные работники (сборщики) здесь не учтены, это переменные затраты.","kk":"2026 жылғы қыркүйектегі жалақы тізімі, он екі айға есептелген. Маусымдық жұмысшылар (терушілер) мұнда жоқ, олар айнымалы шығындар."}'),
    ('Ohne die Kosten des Systems: sie stehen bei den laufenden Kosten des Systems.', '{"en":"Excluding the costs of the system: they are listed under the recurring costs of the system.","ru":"Без затрат на систему: они указаны в текущих затратах системы.","kk":"Жүйенің шығындарынсыз: олар жүйенің ағымдағы шығындарында көрсетілген."}'),
    ('Pachtverträge mit Laufzeit bis 2031.', '{"en":"Lease contracts running until 2031.","ru":"Договоры аренды со сроком до 2031 года.","kk":"2031 жылға дейін жарамды жалға алу шарттары."}'),
    ('Sammelposten, weil die Vorgabe den Nutzen nicht aufteilt.', '{"en":"Lump-sum item because the specification does not break the benefit down.","ru":"Сводная статья, потому что в исходных данных выгода не разбита.","kk":"Жиынтық бап, себебі бастапқы деректерде пайда бөлінбеген."}')
  ) as v(original, uebers)
 where t.notiz = v.original
   and not (t.i18n ? 'notiz');

-- wirtschaftlichkeit_staende.bezeichnung (2 Texte)
update public.wirtschaftlichkeit_staende t
   set i18n = t.i18n || jsonb_build_object('bezeichnung', v.uebers::jsonb)
  from (values
    ('Kennzahlenliste der Geschäftsführung vom 23.09.2026', '{"en":"Management''s list of key figures of 23.09.2026","ru":"Перечень показателей руководства от 23.09.2026","kk":"Басшылықтың 2026 жылғы 23 қыркүйектегі көрсеткіштер тізімі"}'),
    ('Nach dem Septemberabschluss, mit Plan-Ist', '{"en":"After the September close, with plan vs actual","ru":"После закрытия сентября, с планом и фактом","kk":"Қыркүйекті жапқаннан кейін, жоспар мен нақтылықпен"}')
  ) as v(original, uebers)
 where t.bezeichnung = v.original
   and not (t.i18n ? 'bezeichnung');

alter table public.abholrunden enable trigger user;
alter table public.abholstopps enable trigger user;
alter table public.dokumente enable trigger user;
alter table public.esutd_ereignisse enable trigger user;
alter table public.esutd_vertraege enable trigger user;
alter table public.finance_ledger_entries enable trigger user;
alter table public.preislisten enable trigger user;
alter table public.reklamation_ereignisse enable trigger user;
alter table public.reklamationen enable trigger user;
alter table public.vorbestellung_nachrichten enable trigger user;
alter table public.wirtschaftlichkeit_ist enable trigger user;
alter table public.wirtschaftlichkeit_posten enable trigger user;
alter table public.wirtschaftlichkeit_staende enable trigger user;
