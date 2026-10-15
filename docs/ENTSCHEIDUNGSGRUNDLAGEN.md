# Entscheidungsgrundlagen (Recherche vom 15.10.2026)

Stand: 15.10.2026. Diese Datei hält fest, worauf die Festlegungen in `docs/OFFENE-PUNKTE.md` und im System beruhen. Jede Aussage trägt eine Einstufung:

* **B** belegt (Primärquelle gelesen)
* **W** wahrscheinlich (Fachquelle oder Spiegel des Gesetzestextes)
* **U** unsicher (Auslegung, Einzelquelle, Widerspruch)

Gesetze ändern sich. Die Werte, die davon abhängen, stehen deshalb nicht im Code, sondern in der Einstellungsseite der Administration (Bereich „Einstellungen“) mit Quelle und Stand. Rechtsberatung ersetzt diese Zusammenstellung nicht.

## 1. ЭСФ (elektronische Rechnung) und Umsatzsteuer

| Aussage | Einstufung | Quelle |
|---|---|---|
| Regelfrist: frühestens am Umsatztag, spätestens 15 Kalendertage danach (Steuerkodex 2025, Art. 493 Abs. 1; alt Art. 413 Abs. 1 Ziff. 4) | B | Steuerkodex 214-VIII |
| Jeder MwSt-Zahler stellt bei jedem Umsatz eine ЭСФ aus (Art. 491 Abs. 1) | B | Steuerkodex 214-VIII |
| Sonderfristen: Monatsrechnung bis zum 20. des Folgemonats (Energie, Kommunales, Spedition), Export 20 Kalendertage. Keine davon betrifft gewöhnliche Warenlieferungen | B | Art. 493 Abs. 2, 3 |
| Liefertag: bei Lieferpflicht des Verkäufers die Übergabe an den Spediteur oder die Verladung, sonst das Datum des beidseitig unterzeichneten Übergabedokuments (Art. 460 Abs. 1) | B | Steuerkodex 214-VIII |
| Netto und MwSt getrennt: Das Formular führt Preis „ohne indirekte Steuern“, Satz, Betrag und Wert „mit indirekten Steuern“ | B | Erlass Finanzminister Nr. 629 vom 28.10.2025, Anlage 2 |
| Regelsatz 16 Prozent, kein ermäßigter Satz für Lebensmittel, keine Befreiung für Agrarerzeugnisse (Befreiungen nur für Landtechnik) | B | Art. 503 Abs. 1, Art. 474 bis 478 |
| Registrierungsschwelle 10.000 MRP, MRP 2026 = 4.325 KZT, also 43,25 Mio. KZT | B / W | Art. 99 Abs. 4; Kapital.kz |
| Landwirtevorteil: zusätzlicher Vorsteuerabzug 80 Prozent bei getrennter Buchführung (Art. 490). Das ist keine Befreiung | B | Steuerkodex 214-VIII |
| Preislisten im B2B brutto oder netto: keine Norm, keine belastbare Quelle | U | |
| Verschiebung eines Fristendes auf den nächsten Arbeitstag gilt für die Ausstellung der ЭСФ selbst nicht gesichert | U | Art. 64 Abs. 1, 2 regelt Steuerpflichten allgemein |

**Festlegung im System:** Preise stehen je Preisliste mit Schalter „netto“ (Vorgabe) oder „inkl. MwSt“. Die ЭСФ rechnet immer netto plus Satz. Die Frist von 15 Kalendertagen ist eine Einstellung mit Quelle. Die Frist rechnet ab dem Liefertag und verschiebt sich nicht auf einen Arbeitstag (vorsichtige Lesart).

## 2. ЕСУТД (Arbeitsverträge)

Grundlage: Erlass des Arbeitsministers Nr. 353 vom 03.09.2020 (Stand 30.04.2026), Pflicht aus Arbeitsgesetzbuch Art. 23 Abs. 2 Ziff. 27. [B]

| Vorgang | Frist |
|---|---|
| Neuer Vertrag | 5 Arbeitstage nach Unterschrift beider Seiten (Pkt. 7) |
| Änderung | 15 Kalendertage (Pkt. 8) |
| Beendigung | 3 Arbeitstage (Pkt. 12) |
| Verlängerung eines befristeten Vertrags | 15 Arbeitstage (Pkt. 13-1) |
| Fehlerkorrektur | 30 Arbeitstage (Pkt. 9) |
| Wiedereinstellung | 10 Arbeitstage (Pkt. 10) |

Saisonverträge und Verträge mit Ausländern haben keine eigene Frist, es gelten dieselben [W, aus dem Wortlaut gefolgert]. Fristzählung (Arbeitsgesetzbuch Art. 13): Der Lauf beginnt am Folgetag, Kalendertage schließen Nichtarbeitstage ein, fällt das Ende auf einen Nichtarbeitstag, endet die Frist am nächsten Arbeitstag. [B] Bußgelder: КоАП Art. 98, Gesetz 257-VIII, wirksam ab 12.03.2026, Höhe [W].

**Festlegung im System:** Je Vorgang eine Frist mit Art der Tage (Arbeitstage oder Kalendertage) als Einstellung. Der Feiertagskalender 2026 ist nicht geprüft, das System zählt Samstag und Sonntag als Nichtarbeitstage und kennt keine Feiertage. Der Risiko-Radar meldet offene Änderungen und Beendigungen mit ihrer Frist.

## 3. Kalkulationszins und Förderung

| Aussage | Einstufung | Quelle |
|---|---|---|
| Basiszins der Nationalbank 16,25 % seit 04.09.2026, nächster Termin 23.10.2026 | B | nationalbank.kz, Astana Times |
| Inflation 9,3 % im September 2026, Prognose 2026: 9 bis 11 %, Ziel 5 % in 2028 | B | nationalbank.kz |
| KASE 15.10.2026: Staatsanleihen (MEUKAM) rund 10 Jahre 13,65 bis 14,00 %, bis 1 Jahr 15,59 % (inverse Kurve) | B | kase.kz |
| Unternehmenskredite in Tenge 22,0 % (April 2026), Kleinunternehmen 23,7 %, mittlere 18,9 % (Q4 2025) | W | Kursiv, Kapital.kz |
| Eine übliche Spanne für Agrarbetriebe ist nicht belegt | U | |
| Förderkredit „Ken Dala 2“ der Agrarkreditgesellschaft: 5 % für Landwirte, 664,4 Mrd. KZT in der Saison 2026 | W | Trend.az, 16.09.2026 |

**Festlegung im System:** Richtwert für den Kalkulationszins **20 Prozent nominal** (risikoloser Satz rund 13,9 Prozent plus 4 bis 8 Prozentpunkte Betriebsrisiko, Gegenprobe Kreditzinsen), Sensitivität bei 16 und 24 Prozent. Der Richtwert ist eine Einstellung, die Geschäftsführung kann ihn ersetzen. Die Wirtschaftlichkeitsrechnung zeigt weiter „geschätzt“, solange der Betrieb keinen eigenen Wert einträgt.

## 4. Datenhaltung in Kasachstan

* Gesetz 94-V über personenbezogene Daten gilt weiter, geändert 2026 (231-VIII, 256-VIII, 326-VIII). [W]
* Art. 12 Abs. 2: Speicherung in einer Datenbank auf dem Gebiet Kasachstans, ohne Unterscheidung nach Staatsangehörigkeit. [W]
* Regeln (Erlass 338/НҚ, ab 12.07.2026): Daten beschränkten Zugangs werden in Serverräumen im Land gespeichert. Das träfe auch Funktionen, die in Europa laufen (Vercel). [W / U Auslegung]
* Art. 16: Übermittlung ins Ausland nur bei angemessenem Schutz oder mit Einwilligung. [W]
* Neu: Register der Verarbeiter und der Verstöße. [W]
* KoAP Art. 79 (seit 13.03.2025), Bußgelder in MRP, für Kleinbetriebe 60 MRP (unrechtmäßige Erhebung) bis 750 MRP (fehlende Schutzmaßnahmen mit Datenverlust), also 259.500 bis 3,24 Mio. KZT. [W]
* Erntehelfer: Name samt Vatersname und ИИН sind Identifikatoren. [W]
* Anbieter: Yandex Cloud kz1 (Karaganda) mit Managed PostgreSQL. Supabase Cloud hat keine Region in Kasachstan, der Selbstbetrieb per Docker läuft auf jeder Kasachstan-VM. [W / B]

**Festlegung:** Die Plattform zieht, wie am 13.10.2026 entschieden, nach der Beauftragung und vor dem Produktivbetrieb in ein kasachisches Rechenzentrum. Die Analyse der Dienste steht in `docs/Plattform-Kasachstan.md`.

## 5. KI-Gesetz und Sprachdienste

* KI-Gesetz 230-VIII, in Kraft seit 18.01.2026: Nutzer müssen erfahren, dass sie mit KI sprechen. Synthetische Inhalte werden gekennzeichnet. Emotionserkennung ohne Einwilligung ist verboten. [W]
* Soniox: Kasachisch in Echtzeit, Regionen US, EU, Japan, Indien, keine in Kasachstan. [B]
* Yandex SpeechKit: Kasachisch und Russisch, Hybridbetrieb im Land vorgesehen. [W] Soyle (ISSAI): läuft in der Nazarbayev University, API nicht dokumentiert. [W]

## 6. Sprachenrecht

* Sprachengesetz 151-I: Kasachisch ist Staatssprache (Art. 4), Russisch in Staatsorganen gleichberechtigt (Art. 5). Buchhaltungs-, Finanz- und technische Unterlagen in Kasachisch und Russisch (Art. 10, Reichweite für Private unklar). Werbung, Preislisten und Aushänge in Kasachisch, bei Bedarf Russisch (Art. 21). [W]
* Für private Betriebssoftware fand die Recherche keine Pflicht zu einer kasachischen Oberfläche (Art. 22 gilt für staatliche Stellen). [W]

**Festlegung (Sprachpolitik, 1518):** Die Oberfläche bleibt in Deutsch, Englisch, Russisch und Kasachisch. Die Standardsprache für Konten in Kasachstan ist Russisch, Kasachisch ist gleichrangig wählbar. Alles Verbrauchernahe (Preislisten, Abholauftrag, Lieferplan, Rechnungsunterlagen) gibt es auf Kasachisch und Russisch.

## 7. 1C und Temperaturlogger

**1C**

* OData-Standardschnittstelle ab Plattform 8.3.5, OData v3, Pfad `<Server>/<Basis>/odata/standard.odata/<Objekt>`, JSON per `?$format=json`, Basic-Authentifizierung. [B]
* Anlegen per POST mit JSON, Buchen als eigener Aufruf `…/Post?PostingModeOperational=false`. [B]
* Feldnamen eines Realisierungsdokuments sind konfigurationsabhängig und stehen in `$metadata` der jeweiligen Basis. [U]
* „1С:ЭСФ für Kasachstan“ ist in Бухгалтерия для Казахстана ab 3.0.49.1 eingebaut. [B]
* HMAC-Prüfung gibt es in 1C nicht eingebaut. [B]

**Festlegung:** Die Auslieferung kann ein Mapping je Integration anwenden, das die Administration in der Oberfläche pflegt (Vorlage mit Platzhaltern), und neben der HMAC-Signatur auch Basic-Authentifizierung mit Zugangsdaten aus einer Umgebungsvariable. So lässt sich 1C per OData anbinden, ohne dass Feldnamen im Code stehen. Alternativ prüft ein kleiner Übersetzer die Signatur.

**Temperaturlogger**

Für kein Fabrikat (Testo, Elpro, Sensitech, Tempmate, MadgeTech, Lascar, Dickson, Rotronic, iButton) ist eine öffentliche Beschreibung der CSV-Spalten belegt. [B] Belegt sind die Cloud-Schnittstellen von Testo (Saveris Logger API, Anmeldung per Token) und Elpro (elproCLOUD, Messwerte mit `sensorId`, `deviceId`, `value`, `timeStamp` in UTC, `unit` in K, °C oder °F).

**Festlegung:** Der Import erkennt Trennzeichen (`;` `,` Tab), Dezimalkomma, Metadatenblöcke über der Tabelle, mehrere Datumsformate und Kodierungen (UTF-8, Windows-1251, Windows-1252). Die Zeitzone des Geräts wird beim Import gewählt. Der Import versteht außerdem das Messwertmodell von elproCLOUD. Als Testdaten dienen echte Exporte der Geräte des Betriebs.

## Quellen

Alle abgerufen am 15.10.2026.

* Steuerkodex 214-VIII vom 18.07.2025: https://adilet.zan.kz/rus/docs/K2500000214
* Alter Steuerkodex 120-VI: https://adilet.zan.kz/rus/docs/K1700000120
* Erlass Finanzminister Nr. 629 vom 28.10.2025: https://adilet.zan.kz/rus/docs/V2500037241
* Arbeitsgesetzbuch 414-V: https://adilet.zan.kz/rus/docs/K1500000414
* Erlass Arbeitsminister Nr. 353 vom 03.09.2020: https://adilet.zan.kz/rus/docs/V2000021173
* KGD-Pressemitteilung zur ЭСФ: https://pro1c.kz/news/avtomatizatsiya/novye-funktsii-v-is-esf-s-1-yanvarya-2026-goda-press-reliz-kgd-mf-rk/
* MRP 2026: https://kapital.kz/gosudarstvo/143213/mrp-mzp-i-drugie-raschetnye-pokazateli-na-2026-god.html
* ЕСУТД für Nichtansässige: https://new.wpk.kz/esutd_for_nonresidents
* Bußgelder ЕСУТД: https://uchet.kz/news/esutd-za-chto-i-na-skolko-budut-shtrafovat-s-12-marta-2026-goda/
* Nationalbank: https://nationalbank.kz/ru und https://astanatimes.com/2026/09/national-bank-cuts-base-rate-to-16-25-amid-continued-disinflation/
* KASE Staatspapiere: https://kase.kz/ru/markets/government-securities
* Datenschutzgesetz: https://kodeksy-kz.com/ka/o_personalnyh_dannyh_i_ih_zawite/12.htm
* Datenlokalisierung (AmCham): https://amcham.kz/wp-content/uploads/2026/05/2026-05-15_AmCham_DataLocalization_Issue-Brief_ENG_v5.pdf
* Yandex Cloud Kasachstan: https://yandex.cloud/ru-kz/docs/overview/concepts/region
* Supabase Regionen: https://supabase.com/docs/guides/platform/regions
* KI-Gesetz: https://www.ey.com/ru_kz/technical/tax-alerts/2025/12/law-on-artificial-intelligence-kazakhstan
* Sprachengesetz: https://prg.kz/m/amp/document/1008034/1/10000
* 1C OData: https://habr.com/en/companies/1c/articles/308420/ und https://1cfresh.com/articles/data_odata
* Testo Saveris Logger API: https://developers.testo.dev/saveris-logger-api/general/overview/
* elproCLOUD: https://elproag.atlassian.net/wiki/spaces/POM/pages/649003049/elproCLOUD+Data+Exchange
