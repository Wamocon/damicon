# Glossar, vorhandener Bestand

Steuerbegriffe, die **bereits** in `src/messages/` stehen und im Produkt ausgeliefert werden. Das vollstaendige Glossar wird darauf aufgebaut und darf ihm nicht widersprechen. Wer hier etwas aendert, aendert auch die Uebersetzungsdateien.

Erhoben am 2026-09-18 aus `de.json`, `ru.json`, `kk.json`.

## Bestand

| Deutsch | Russisch | Kasachisch | Englisch | Fundstelle im Produkt |
|---|---|---|---|---|
| Rechtsform | правовая форма | құқықтық нысан | legal form | Stammdaten, `rechtsform` |
| Steuernummer | налоговый номер | салық нөмірі | tax number | Stammdaten, Titel |
| ИИН (natuerliche Person) | ИИН | ЖСН | IIN | `nummernart.iin` |
| БИН (juristische Person) | БИН | БСН | BIN | `nummernart.bin` |
| Mehrwertsteuer | НДС | ҚҚС | VAT | Startseite, Konformitaetsblock |
| Umsatzsteuer-Identnummer | Идент. номер плательщика НДС | ҚҚС бойынша СТН | VAT payer ID | Stammdaten |
| Elektronische Rechnung | ЭСФ | ЭСФ | e-invoice | Modul `esf` |
| Warenbegleitschein | сопроводительная накладная | ілеспе жүкқұжат | goods accompanying note | Modul `esf` |
| Arbeitsvertragsregister | ЕСУТД | ЕСУТД | unified labour contract register | Modul `personal` |
| Krestjanskoje Chosjaistwo | крестьянское хозяйство | шаруа қожалығы | peasant farm | `rechtsform.kh_fh` |
| Steuerkodex 2026 | Налоговый кодекс 2026 | 2026 жылғы Салық кодексі | Tax Code 2026 | Handbuch, Gesetzestabelle |
| Lohn | зарплата | жалақы | wage | Modul `lohn` |

## Drei Beobachtungen, die zu pruefen sind

**Der Satz zur Mehrwertsteuer steht bereits im Produkt, ist inzwischen belegt und trotzdem irrefuehrend.** In allen drei Sprachfassungen erscheint "Mehrwertsteuer 16 Prozent, Registrierungsschwelle 43,25 Mio. Tenge". Beide Zahlen stimmen: Art. 503 п.1 НК РК nennt 16 Prozent, und 10.000 МРП bei einem МРП von 4.325 Tenge ergeben genau 43.250.000 Tenge.

**Fuer den Betrieb, fuer den dieses System gebaut wird, ist die Schwelle dennoch gegenstandslos.** Art. 731 п.1 пп.6 НК РК stellt ein КХ/ФХ im Sonderregime von der Mehrwertsteuer frei, ausgenommen Einfuhr-USt und USt fuer Nichtresidenten. Eine Umsatzschwelle, ab der man USt-pflichtig wird, greift dort nicht. Relevant wird sie erst fuer Geschaeftsteile **ausserhalb** des Sonderregimes, also fuer das Zukaufmodul.

Der Textbaustein beschreibt damit die allgemeine Rechtslage richtig und die Lage des Nutzers falsch. Er braucht entweder eine Einschraenkung oder eine Bindung an das Regime des jeweiligen Mandanten. Herleitung: `pruefbericht-aktualitaet.md` Abschnitt 4.1, Volldarstellung in `kernwissen/khfh-regime-rohbefund.md` Abschnitt 3.

**ЭСФ wird in der kasachischen Fassung nicht uebersetzt.** Die kasachische Datei uebernimmt die russische Abkuerzung. Ob im amtlichen kasachischen Sprachgebrauch eine eigene Abkuerzung gilt, ist offen und gehoert ins vollstaendige Glossar.

**СТН ist moeglicherweise veraltet.** Die kasachische Fassung fuehrt "ҚҚС бойынша СТН". СТН ist die Steuerzahler-Registriernummer. Nach der Abschaffung der РНН traegt die Rolle in Kasachstan die ИИН oder БИН. Ob es daneben eine eigene Mehrwertsteuer-Registriernummer gibt, ist zu klaeren. Falls nicht, beschreibt der Textbaustein etwas, das es nicht gibt.

## Was noch fehlt

Ohne Entsprechung in allen vier Sprachen sind bisher unter anderem: ИПН, ОПВ, ОПВР, ВОСМС, ОСМС, СО, СН, МРП, МЗП, СНТ, виртуальный склад, ККМ, ОФД, НКТ, КПН, КПН у источника, НДС за нерезидента, СУР, ФНО, камеральный контроль, единый земельный налог, специальный налоговый режим. Diese kommen aus der laufenden Recherche.
