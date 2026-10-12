# Abdeckung des Bestands durch die 20 Fachbücher (12.10.2026)

Frage: Welche der 320 Internet-Dokumente des Bestands stehen schon in den 20 hochgeladenen Fachbüchern, und was gibt es nur im Bestand? Grundlage: alle 5.655 Abschnitte des Bestands und alle 16.541 Abschnitte der Bücher im Schema `public_preview`, rein lesend ausgewertet. Es wurde nichts verändert oder gelöscht. Das Ergebnis ist eine **Empfehlung**.

## Methode

1. **Wörtlich:** Anteil der 5-Wort-Folgen eines Bestandsabschnitts, die so im Text der Bücher stehen (findet Gesetzestexte, Spiegelseiten, Zitate).
2. **Inhaltlich:** je Bestandsabschnitt der ähnlichste Buchabschnitt nach den gespeicherten Vektoren (Kosinus, Modell bge-m3).
3. **Fachliche Prüfung:** Wo Ähnlichkeit 0,78 oder mehr auftritt, wurden die Aussagen des Bestandsabschnitts mit den Buchstellen Satz für Satz verglichen (zwei Prüfer, Stichwortsuche im Buchtext). Ähnlichkeit allein gilt nicht als Abdeckung: Gleiches Thema heißt nicht gleiche Aussage.
4. **Steuerkodex:** das große Einzeldokument (848 Artikel) wurde je Artikel wörtlich gegen das Buch gerechnet.

## Ergebnis

| Gruppe | Dokumente | Empfehlung |
| --- | --- | --- |
| Berührt die Bücher nicht (kein Abschnitt mit Ähnlichkeit ab 0,78) | 275 | behalten |
| Berührt, geprüft: vollständig abgedeckt | 10 | **Löschkandidat**, aber erst wenn das deckende Buch freigegeben und lückenlos ist |
| Berührt, geprüft: teilweise abgedeckt | 25 | behalten (Rest steht nur im Bestand) |
| Berührt, geprüft: nicht abgedeckt (nur gleiches Thema) | 9 | behalten |
| Steuerkodex als Ganzes (`adilet-nk-214-viii-ru`, 848 Artikel, 2,65 Mio. Zeichen, 43 % des Bestands) | 1 | im Buch zu 90 %+ wörtlich vorhanden, siehe unten |

## Steuerkodex (amtlicher Text, 848 Artikel)

Das Buch "Налоговый кодекс" enthält 775 der 848 Artikel zu mindestens 90 % wörtlich, 48 Artikel zu 70 bis 90 % (OCR-Abweichungen, Zahlen, redaktionelle Unterschiede), 25 Artikel unter 70 %. Die schwachen Artikel sind drei Fälle:

- **Fehlende Scanseiten im Buch** (gedruckte Seiten 70-71, 78-79, 162-163, 488-489): betrifft Art. 88 bis 89, 99 bis 103, 108, 238, 240, 338 und 722 bis 724 (im Buchtext fehlen sie, die Artikelfolge dort springt). Hier steht der Text **nur im Bestand**.
- **Tabellen** (zum Beispiel Art. 576 Sätze der Kfz-Steuer, Art. 749 Exportrentesteuer): im Buch durch die OCR verstümmelt, im Bestand sauber. Auch hier ist der Bestand besser.
- **Redaktionelle Unterschiede** (zum Beispiel Art. 848 Übergangsfristen): Fassung oder Stand weichen leicht ab.

Empfehlung: Das Dokument **nicht löschen, solange das Buch Lücken hat** und nicht freigegeben ist. Es ist die vollständige, amtliche Quelle (Adilet). Ist das Buch neu gescannt und freigegeben, ist es umgekehrt ein Löschkandidat oder das Buch ist überflüssig. Eine Teillöschung einzelner Artikel ist in der Oberfläche nicht vorgesehen.

## Die 44 berührten Dokumente

Titel und Anteil der Abschnitte mit Ähnlichkeit ab 0,78; Urteil nach Satzvergleich; "Abw." heißt, Bestand und Buch widersprechen sich (andere Fassung, alte Artikelnummern, andere Zahl).

| Nr | Dokument | Anteil | Urteil | Abw. | Sicherheit | Was nur im Bestand steht |
| --- | --- | --- | --- | --- | --- | --- |
| 01 | Zivilgesetzbuch Kasachstans, Artikel 58: Grundlagen des Wirtschaftsto… | 100% | abgedeckt | nein | hoch | nichts Sachliches |
| 02 | Unternehmerkodex, Kapitel 25: Staatliche Foerderung von Investitionst… | 100% | teilweise | ja | hoch | die Gliederung nach prioritärem und strategischem Projekt, Abs. 4 insgesamt. Gleich ist nur die Definition der juristischen Person (Satz 2 von Abs. 1). |
| 03 | Neues Steuergesetzbuch ab 1. Januar 2026: Betriebsstaette in den Arti… | 100% | abgedeckt | ja | hoch | nichts Sachliches |
| 04 | Investitionspraeferenzen: Vertragspartner und zustaendige Investition… | 100% | teilweise | ja | mittel | die Verknüpfung "Sonderinvestitionsprojekt" mit Befreiung von Einfuhrzöllen und Steuern, wie sie die KGD-Seite formuliert; die englische Fassung der Seite. |
| 05 | Gesetz über die ТОО und ТДО: Mindestkapital und Kapitalaufbringung (A… | 80% | teilweise | nein | mittel | Art. 23 Abs. 3 (Aufzählung der Einlagearten, Ausnahme nur Geld für SFK, Zahlungsorganisationen), Abs. 5 Nutzungsrecht als Einlage mit Wertbestimmung nach Nutzungsentgelt, Abs. 7 Landausgliederung; Art. 24 Abs. 3 und 4 (Folgen der… |
| 06 | NK RK Art. 518, 530: Bemessungsgrundlage und Frist der EAWU-Einfuhr-U… | 79% | abgedeckt | nein | hoch | nichts Sachliches |
| 07 | Gesetz über Devisenregulierung und Devisenkontrolle (2018): Registrie… | 78% | nicht abgedeckt | nein | hoch | Art. 13 Abs. 2 (Registriernummer für Devisenverträge und Auslandskonten), Art. 14 vollständig (Registrierung von Kapitalverkehrsverträgen vor Erfüllungsbeginn, Frist fünf Werktage, Ausnahmen Nationalbank und Finanzministerium, Ve… |
| 08 | Amtliche FAQ des Komitees fuer Staatseinnahmen: Betriebsstaette bei S… | 77% | teilweise | ja | hoch | der konkrete Fall der Anfrage (Software und Beratung eines russischen Nichtansässigen, Frage der Befreiung nach Ansässigkeitsbescheinigung, Art. 212 und 212-1 alt, Frage wer Steuerzahler ist). Das ist Verwaltungsmeinung und Praxi… |
| 09 | pavlodar.com: Kodex-Spiegel, Art. 357 НК РК (КПН-Saetze) | 76% | abgedeckt | nein | hoch | nichts Sachliches |
| 10 | NK RK Art. 479: Von der USt befreite Importe (Spiegel) | 67% | abgedeckt | nein | hoch | nichts Sachliches |
| 11 | Rechtsform Bauern-/Farmwirtschaft (KFH): heutige Regelung im Unterneh… | 62% | abgedeckt | nein | hoch | nichts Sachliches |
| 12 | NK RK Art. 125-128: Erstattung des USt-Ueberschusses (Exporteur-Schne… | 53% | abgedeckt | nein | hoch | nichts Sachliches |
| 13 | 1C:BIT Kasachstan: Buchhaltung fuer Import und Export ab 2026 | 49% | teilweise | nein | niedrig | Beispiele mit konkreten Unternehmen, Buchungs- und 1C-Praxis, Dokumentenlisten für Drittlandzoll (ГТД, СНТ, ЭСФ-Korrektur), Hinweise zu Formularzeilen der Erklärung 300.00, Währungskontrolle in der Praxis, einmalige Luxusakzise f… |
| 14 | ENPF: Erhoehung des Arbeitgeber-Pflichtpensionsbeitrags (OPVR) auf 3,… | 48% | teilweise | nein | mittel | Datum und Wortlaut der Pressemitteilung (06.01.2026), Aussage, dass die Kontrolle beim Staatseinnahmenkomitee liegt, dass Auszahlungen bei Wegzug oder Staatsbürgerschaftswechsel enden, nicht vererbbar sind und auf die übrigen Tei… |
| 15 | KGD Gebietsabteilung Abai: Kontosperrung - VERALTETE Rechtsgrundlage… | 48% | teilweise | ja | hoch | Der Bestand beruht auf Art. 118 des alten Kodex (genannt als Nr. 121-VI; das Buch "Kommentar zum Arbeitsgesetzbuch", freigegeben, Paket 11, führt den Steuerkodex vom 25.12.2017 als Nr. 120-VI). Die Gründe und Fristen weichen vom… |
| 16 | Steuerkodex 214-VIII, Spiegelportal (artikelweise) | 44% | abgedeckt | nein | hoch | nichts Sachliches |
| 17 | Gesetz Nr. 304-I Ueber die Pruefungstaetigkeit: Grundstruktur und Anw… | 42% | teilweise | nein | mittel | Art. 1 Nr. 1 bis 3 als Gesetzesdefinitionen (akkreditierte Berufsorganisation, Akkreditierung, Attestierung), Art. 5 Abs. 1 als Gesetzestext und die Definition des Initiativprüfung (Art. 5 Abs. 3); das Buch kennt "обязательный un… |
| 18 | Gesetz Nr. 167-VI vom 2. Juli 2018 ueber Devisenregulierung und Devis… | 40% | teilweise | ja | mittel | Art. 2 Abs. 2 und 3 (Geltung außerhalb Kasachstans nur für Ansässige, Sonderregime für beaufsichtigte Finanzorganisationen), Art. 3 (Währungsrecht besteht aus Gesetzen, Erlassen und Rechtsakten der Aufsichtsorgane; direkte Anwend… |
| 19 | Datenschutzgesetz Nr. 94-V: staatliche Aufsicht, keine eindeutige Aud… | 40% | nicht abgedeckt | nein | hoch | Art. 27-2 (staatliche Kontrolle als außerplanmäßige Prüfung; Nationalbank nach Unternehmerkodex), Art. 27-3 (Kontrolle der Staatsorgane durch das Aufsichtsorgan, Plan, höchstens jährlich), Art. 28 (Staatsanwaltschaft, höchste Auf… |
| 20 | Gesetz Nr. 304-I Art. 5 Abs. 2: Pflichtpruefung bei Investitionsvertr… | 39% | teilweise | ja | mittel | Art. 5 Abs. 1 und Abs. 3 als Gesetzestext (Definition Initiativprüfung). |
| 21 | Amtlicher Online-Kommentar zum Steuerkodex (Steuerkomitee des Finanzm… | 38% | nicht abgedeckt | ja | hoch | Alle Artikelnummern gehören zum alten Steuerkodex von 2017. Das Buch enthält den neuen Kodex 214-VIII mit anderen Nummern, z.B. Vertretung alt Art. 17, neu Art. 38; Einkommen von Nichtansässigen alt Art. 192, neu Art. 679; verein… |
| 22 | mybuh.kz: Sonderregime fuer Agrarerzeuger und Bauernwirtschaften | 38% | teilweise | nein | mittel | die Auslegungen des Blogs: Ausländer, ausländische juristische Personen und Staatenlose dürfen das Regime nicht anwenden; Verarbeitung zugekaufter oder importierter Erzeugnisse oder Lohnverarbeitung durch Dritte fällt nicht unter… |
| 23 | pro1c.kz: Spezielle Steuerregime 2026 (Gesamtuebersicht) | 37% | teilweise | nein | mittel | Pressemitteilungen und Erläuterungen des Staatseinnahmenkomitees (KGD) zum Übergang auf die Sonderregime 2026 (Anzeige vom 1. Januar bis 28. Februar, Abmeldung von der USt zum 1. Januar 2026, Warenbestände zu 12 %), Übergang der… |
| 24 | Gesetz Nr. 66-III vom 8. Juli 2005, Artikel 11: Subventionierung des… | 36% | nicht abgedeckt | nein | hoch | die vollständige Liste der Subventionsrichtungen (Zinsverbilligung, Investitionskostenerstattung, Saatgut, Versicherung, Düngemittel, Pestizide, Kuponverzinsung von Anleihen, Fischverarbeitung usw.), die dritte Bedingung "приняти… |
| 25 | Zemelny Kodeks (Land-Gesetzbuch) der Republik Kasachstan, Artikel 24:… | 35% | teilweise | ja | mittel | Preisregeln des Abs. 2 (Kaufpreis gleich Katasterwert nach Art. 10 und 11 ZK oder Vorzugspreis, Vorzugspreise je Verwaltungseinheit durch die Regierung), Altbesitzer mit eingekauftem Dauernutzungsrecht werden ohne Zuzahlung Eigen… |
| 26 | Bodengesetzbuch der Republik Kasachstan, Artikel 24: Verbot des Agrar… | 35% | teilweise | ja | mittel | wie Mappe 25 (Preis und Vorzugspreis, Verfügungssperre, Ratenzahlung Art. 49, Grenzzone, Forstland, Naturalgrants, Änderungsvermerke). |
| 27 | KGD-Gebietsdepartement Nordkasachstan: Erlaeuterung Sonderregime КХ/Ф… | 33% | teilweise | ja | mittel | die Bezugnahme auf den alten Steuerkodex vom 25.12.2017 (Art. 697, 702 bis 705, Fassung Stand 28.12.2021), der Begriff "Einheitliche Grundsteuer (ЕЗН)", die Bedingung "nicht USt-pflichtig" aus Art. 702 alt, der Hinweis auf Art. 2… |
| 28 | NK RK Art. 134: Stundung der Einfuhr-USt fuer Drittlandimporte | 31% | abgedeckt | nein | hoch | nichts Sachliches |
| 29 | zakon.kz: Neue Verfahrensregeln fuer die Erteilung von Arbeitserlaubn… | 29% | nicht abgedeckt | nein | hoch | alle Aussagen der Ministerialverordnung vom 28.03.2025 (Wirksamkeit ab 01.09.2025): Informationssystem migration.enbek.kz, Meldung der Vakanz an die Arbeitsbörse und Antrag erst nach 15 Kalendertagen mit Veröffentlichungscode, An… |
| 30 | pro1c.kz: EAWU-Warenrueckverfolgbarkeit ab 1. September 2026 | 28% | teilweise | nein | hoch | Ministerialverordnung Nr. 623 vom 24.10.2025 (Funktionsregeln der Rückverfolgbarkeit), Beschluss des EAWU-Kommissionsrats Nr. 5 vom 26.01.2026 mit 34 Zolltarifcodes (Haushaltskühlschränke, Waschmaschinen, Fernsehempfänger usw.),… |
| 31 | KGD-Vorsitzenden-Blog: Ist Agentenverguetung USt-pflichtig? (2021) | 27% | teilweise | ja | mittel | die Einzelfallauskunft des KGD (Agenturvertrag über Organisation von Waggonreparaturen, Folgerung: Auftrag im Namen und auf Rechnung des Auftraggebers ist kein Umsatz des Beauftragten), die Behandlung nach IFRS 15 (Prinzipal gege… |
| 32 | mybuh.kz: Krestjanskoje Chosjaistwo - was zaehlt 2026 zum Einkommen | 24% | abgedeckt | nein | hoch | nichts Sachliches |
| 33 | mybuh.kz: Was lohnt sich fuer den Tierhalter mehr, ТОО oder КХ | 23% | teilweise | nein | mittel | der eigentliche Praxisvergleich TOO gegen KFH und die daraus gezogene Empfehlung, die Aufstellung der Pflichten je Rechtsform (Beiträge OPV, OPVR, SO, VOSMS monatlich, Formular 920.00 einmal jährlich und 200.00 vierteljährlich),… |
| 34 | Rechtsanwaltskammer Kasachstans: Fehlende Verfahrensordnung zur Zollb… | 20% | nicht abgedeckt | nein | mittel | die gesamte Fachanalyse des Beitrags: Artikel 43 und Anlage 6 des EAWU-Vertrags (Tarifvergünstigungen), Beschluss der Eurasischen Wirtschaftskommission zur Befreiung von Anlagen für prioritäre Investitionsprojekte, Verweis auf di… |
| 35 | uchet.kz: ESUTD - wofuer und in welcher Hoehe wird ab 12.03.2026 gest… | 15% | teilweise | ja | mittel | Gesetz vom 09.01.2026 Nr. 257-VIII und Inkrafttreten am 12.03.2026 als Quelle der Änderung, die Tenge-Beträge selbst, der Hinweis, dass das Fehlen eines Bestellungsbescheids für die zuständige Person nicht von der Strafe befreit,… |
| 36 | Formular 200.00 - Blankett und Ausfuellregeln 2026 | 14% | nicht abgedeckt | nein | mittel | der Kern des Dokuments, die Ausfüllvorschriften zum Formular 200.00 (Zeilen 200.00.001 bis 200.00.015, Anlagen 200.01 bis 200.03, Spalten A bis AB, Kategorien der Beschäftigten, Codes der Einkommensarten 1060 bis 1120, Schlüssel… |
| 37 | mybuh.kz: Sind Geraet und Land persoenliches Eigentum und ИПН-pflicht… | 12% | teilweise | ja | mittel | die Auslegung des Beitrags, dass Ausrüstung nicht in der Liste des Wertzuwachses steht und deshalb bei Verkauf nicht besteuert wird (sofern nicht unternehmerisch genutzt), die Einordnung von Grundstücken je nach Zweck (kein Wohnz… |
| 38 | Moore Kasachstan: Einheitliches System der Arbeitsvertragserfassung -… | 11% | teilweise | ja | mittel | Gesetz vom 09.01.2026 Nr. 257-VIII und Inkrafttreten am 12.03.2026 als Quelle, Tenge-Beträge, Praxisempfehlungen (interne Prüfung, Verantwortliche per Anordnung benennen, Fristenkontrolle), Nachrichten- und Menüteile der Moore-We… |
| 39 | pro1c.kz: Steuern und Zahlungen ИП (ОУР, СНР) 2026 | 11% | teilweise | nein | mittel | die Fachbeiträge der Redaktion: Berechnungsbasis der sozialen Abgaben (2025 abzüglich Pensionsbeiträge, 2026 aus dem einheitlichen erklärten Einkommen), Obergrenze der OPVR-Bemessung (50 MZP, Höchstzahlung 148 750 Tenge), Verweis… |
| 40 | Formular 910.00 - vereinfachte Erklaerung (Kleinunternehmen) 2026 | 6% | nicht abgedeckt | nein | hoch | die Ausfüllvorschriften des Formulars 910.00 und der Anlage 910.01 (Zeilen 910.00.001 bis 910.00.010 mit monatlichen Teilzeilen I bis VII für Sozialabgaben und Pensionsbeiträge, Angaben zur Verantwortung, Felder für die Annahme d… |
| 41 | Handel und Aussenhandel - Rohbefund (P12 bis P15) | 4% | teilweise | ja | mittel | der Dokumentcharakter ist eigene Recherche. Nicht im Buch sind: Anlage 18 zum EAWU-Vertrag (180 Tage nach Versand, Rechtsfolge), Zollkodex der EAWU (Art. 59 Zollstundung, Art. 219 bis 221 vorübergehende Einfuhr), Ratsbeschluss Nr… |
| 42 | Das КХ/ФХ-Regime - Rohbefund (P5, Sektoral/Agrar) | 3% | teilweise | nein | mittel | der Rechercheteil und die Argumentation: Konfliktauflösung der drei Zahlen 0,5 % / 10 % und 15 % / 8 500 MRP mit Quellenbelegen und amtlichen Bestätigungen des KGD Ostkasachstan, kasachisch-russische Gegenprüfung, Aussage, dass d… |
| 43 | Dentons: Global Tax Guide - Kasachstan | 3% | teilweise | ja | mittel | der Übersichtscharakter in englischer Sprache und alles, was auf dem alten Kodex 2017 beruht: Doppelbesteuerungsabkommen mit 55 Staaten, Quellensteuersätze (15 % auf Dividenden und Zinsen, 20 % bei bevorzugten Staaten, Wegfall de… |
| 44 | Formular 300.00 - Blankett und Ausfuellregeln 2026 (USt-Erklaerung) | 2% | nicht abgedeckt | nein | hoch | die komplette Ausfüllvorschrift zum Formular 300.00 und den Anlagen 300.01 bis 300.08 (Zeilen 300.00.001 bis 300.00.0xx mit Spalten A, B, Registerdaten, Status des Lieferanten K / E usw., Anzeige 328.00 für EAWU-Einfuhr), Hinweis… |

Die ausführlichen Begründungen mit Fundstellen (Buch und Paket) liegen als Arbeitsdateien der Prüfung vor und lassen sich auf Wunsch ins Repository legen.

## Wichtige Einzelbefunde

- **Veraltete Fassungen im Bestand.** Das Buch ist der neue Steuerkodex 214-VIII (ab 01.01.2026). Mehrere Bestandsdokumente zitieren den alten Kodex (2017) oder einen älteren Stand: Nr. 08 und 21 (alte Artikelnummern, Vortrag auf zehn Perioden gegen Verjährungsfrist), Nr. 15 (Kontosperrung nach altem Art. 118, andere Gründe und Fristen), Nr. 02 (Unternehmerkodex Art. 283 in der alten Fassung), Nr. 27, 31, 37, 41, 43 (alte Nummern, Umsatzsteuer 12 gegen 16 Prozent und Sozialsteuer 11 gegen 6 Prozent im Dentons-Leitfaden, Haltefrist 1 gegen 2 Jahre). Diese Dokumente widersprechen dem Buch und dürfen **nicht als Duplikat gelöscht, sondern müssen als veraltet gekennzeichnet oder entfernt werden** (Entscheidung offen).
- **Inhaltliche Abweichungen mit rechtlicher Wirkung:** Nr. 18 (Definition des Ansässigen ohne die Ausnahme für dauerhaft im Ausland lebende Staatsbürger und ohne Aufenthaltsgenehmigung), Nr. 20 (andere Liste der Pflichtprüfungsfälle als im Lehrbuch), Nr. 04 (Zuordnung des Spezialinvestitionsvertrags zu einer anderen Behörde), Nr. 25 und 26 (Bodengesetzbuch Art. 24 Abs. 5: zwei Wege im Bestand, drei im Kommentar).
- **Dubletten im Bestand selbst:** Nr. 25 und 26 (gleicher Text und Link), Nr. 35 und 38 (Zweitabdruck).
- **Formular-Anleitungen** (200.00, 300.00, 910.00): durch die Bücher nicht gedeckt, obwohl die Ähnlichkeit hoch ist (sie zitieren Kodexartikel). Die Zeilenvorschriften stehen in keinem Buch.
- **ESUTD-Berichtigung:** Bestand nennt 30 Arbeitstage, das Buch (Kommentar Arbeitsgesetzbuch, Verordnung Nr. 353) 30 Kalendertage, der Satz ist im Buch nur bis zum Doppelpunkt erhalten. Prüfen.
- **Webseiten-Rauschen:** Bei fast allen "abgedeckten" Dokumenten besteht der Rest aus Menüs, Werbung und Nutzerkommentaren der Spiegelseiten, ohne Gesetzeswert.

## Voraussetzungen vor einem Löschen

- Alle "abgedeckt"-Urteile stützen sich auf Bücher, die **noch auf Freigabe warten** (Steuerkodex, Zivilkodex, Kommentar Buch 3) oder **Lücken im Scan** haben (Steuerkodex 8 Seiten, Nachschlagewerk 6 Seiten, Kommentar Buch 3 sechs Seiten). Erst nach Neuscan und Freigabe löschen.
- Das Entfernen läuft nicht über die Oberfläche (dort sind nur hochgeladene Dokumente löschbar), sondern über einen geprüften, bedingten Löschlauf mit Trockenlauf. Entscheidung vom 12.10.2026: in beiden Schemas, `public_preview` erst bei erfolgreichem Buch-Upload, `public` erst nach dem Merge nach main und erst nachdem das Dokument in `public_preview` entfernt ist (sonst kopiert der Abgleich es zurück). Dasselbe gilt für die veralteten Dokumente.
- Unabhängig davon bleiben die 21 Entfernen-Kandidaten aus der Bestandsanalyse vom 09.10.2026 (18 Arbeitsdokumente der Recherche, eine Dublette, zwei nicht verifizierbare Quellen) offen.

## Dokumente ohne Berührung mit den Büchern (275)

Kein Abschnitt dieser Dokumente hat eine inhaltliche Ähnlichkeit ab 0,78 zu einem Buchabschnitt: Sie behandeln andere Themen (Agrar, Lebensmittel-Audit und Standards, Formulare, Branchen- und Länderberichte, Recherche-Rohbefunde) und sind durch die Bücher nicht gedeckt.

| Dokument | Art | Sprache | Abschnitte |
| --- | --- | --- | --- |
| About SQFI | standard | de | 154 |
| COPYRIGHT | standard | de | 28 |
| Food Safety Auditor Professional Development Framework stakeholder consultation Stakehold… | praxisbeitrag | de | 136 |
| FSSC 22000 SCHEME FOOD SAFETY MANAGEMENT SYSTEM CERTIFICATION | standard | de | 161 |
| OECD Public Governance Policy Papers | praxisbeitrag | de | 134 |
| Positionspapier Interne Revision und Risikomanagement | praxisbeitrag | de | 36 |
| Tesco Nurture Module Scheme Rules | standard | de | 56 |
| Abgrenzung: Hoechste Auditkammer (staatliche Finanzkontrolle) versus private Pruefungsauf… | behoerdeninfo | ru | 2 |
| ADB-Darlehen zur Unterstuetzung der Fiskal- und Finanzsektorreform Kasachstans | praxisbeitrag | en | 8 |
| AG-Gesetz Nr. 415-II Art. 61: interne Revisionsstelle ist optional | fachliteratur | ru | 1 |
| Agrarkreditkorporation: aufgedeckte Betrugsschemata bei Kreditnehmern | fachliteratur | ru | 1 |
| Agrarsubventionen: Monitoring nach Auszahlung und gerichtliche Rueckforderung | praxisbeitrag | ru | 1 |
| Agribusiness-Förderung in Kasachstan: Baiterek, Agrarian Credit Corporation und KazAgroFi… | fachliteratur | en | 3 |
| AIFC Court: Rechtsgrundlage, Struktur und Praxis des Gerichts des Astana International Fi… | fachliteratur | en | 1 |
| AIFC: Steuerregime (offizielle Darstellung) | behoerdeninfo | en | 3 |
| Angebliche jaehrliche IT-Audit-Pflicht nach Regierungsbeschluss Nr. 832/2016: NICHT VERIF… | internetrecherche | ru | 2 |
| Anhebung des kasachischen Mehrwertsteuer-Standardsatzes auf sechzehn Prozent zum 1. Janua… | praxisbeitrag | ru | 1 |
| Antikorruptionsgesetz Nr. 410-V: System der Antikorruptionsmassnahmen | fachliteratur | ru | 1 |
| Apfelbarriere: Kasachstan schließt die Grenze für EAWU-Partner (nationalbusiness.kz) | fachliteratur | ru | 2 |
| API-Interface ИС ЭСФ mit Modul Virtueller Lager - Entwickleranleitung | behoerdeninfo | ru | 5 |
| Arqabuh.kz, Gehalts-/Lohnsteuerrechner 2026 | internetquelle | ru | 3 |
| Art. 5: Pflichtpruefungspflichtige Unternehmenstypen und TOO/LLC-Schwelle | praxisbeitrag | ru | 1 |
| Audit-Fachliteratur 2021–2026 | internetrecherche | de | 7 |
| Auftrag Widerlegungsrunde (19.09.2026) | internetrecherche | de | 4 |
| Auftrag: Audit-Fachliteratur 2021–2026 | internetrecherche | de | 6 |
| Baiterek-Holding-Kodex: Anforderungen an Audit-Ausschuss und interne Revision | behoerdeninfo | ru | 1 |
| Bankengesetz Nr. 258-VIII und Risikomanagementanforderungen der Nationalbank | fachliteratur | ru | 2 |
| Besonderheiten der Digitalisierung der Landwirtschaft in Kasachstan | fachliteratur | ru | 20 |
| Bestand in den Virtuellen Lager eintragen (Praxisanleitung) | praxisbeitrag | ru | 4 |
| Bio-/Oeko-Zertifizierung: neue Rechtsgrundlage Gesetz Nr. 89-VIII (2024) | fachliteratur | ru | 2 |
| Blockchain- und IoT-Rueckverfolgbarkeit in landwirtschaftlichen Lieferketten | fachliteratur | en | 3 |
| Bureau of National Statistics - Hauptportal | behoerdeninfo | ru | 7 |
| Calculators.kz, Rechner-Sammlung | internetquelle | ru | 4 |
| CISG (UN-Kaufrecht): Anwendungsbereich, Struktur und Kernbegriffe | fachliteratur | en | 2 |
| Contract and Commercial Management: The Operational Guide (Cummins et al.) | internetquelle | en | 2 |
| COSO Enterprise Risk Management - Integrating with Strategy and Performance (2017) | standard | en | 2 |
| COSO Enterprise Risk Management Framework: Grundlagen des Risikomanagements | fachliteratur | en | 2 |
| COSO Internal Control - Integrated Framework (2013) | standard | en | 2 |
| Datenschutz bei KI-Nutzung: Einwilligung, Anonymisierung, grenzueberschreitende Uebermitt… | fachliteratur | en | 2 |
| Dauerhaftes Verbot von Verkauf und Verpachtung von Agrarland an Auslaender seit 2021 | rechtsnorm | ru | 3 |
| Der General Counsel als Lawyer-Statesman (Heineman, Harvard Law School Forum) | praxisbeitrag | en | 2 |
| Deutsche autorisierte Uebersetzung des Three Lines Model (DIIR) | fachliteratur | de | 3 |
| Digitale Kontrollinstrumente: gosagro.kz, Tier-ID-Datenbank, JerInSpectr | fachliteratur | ru | 2 |
| Digitaler Kodex Nr. 255-VIII: Rahmen fuer Datenverarbeitung | fachliteratur | ru | 1 |
| Digitales Antragsverfahren fuer Agrarsubventionen ueber das Portal gosagro.kz | fachliteratur | ru | 6 |
| Digitalisierung des staatlichen Rechnungspruefungsaudits: Konzept bis 2030 | fachliteratur | ru | 3 |
| Digitalisierung, Ausbildung und Frameworks | fachliteratur | de | 20 |
| Dokumentiertes Umgehungsrisiko: Anteilserwerb statt eigener Landpacht | fachliteratur | ru | 1 |
| DOS Immigration: Vollständiger Leitfaden zur ТОО Registrierung in Kasachstan | praxisbeitrag | en | 11 |
| DSGVO Artikel 28: Anforderungen an Auftragsverarbeitungsverträge | fachliteratur | de | 7 |
| DSGVO Artikel 5: Grundprinzipien der Verarbeitung personenbezogener Daten | fachliteratur | de | 3 |
| Enhanced Partnership and Cooperation Agreement zwischen der EU und Kasachstan (Amtsblatt… | rechtsnorm | en | 3 |
| Environmental Code of the Republic of Kazakhstan, No. 400-VI (as amended) (IEA Policy Dat… | fachliteratur | en | 2 |
| Erfahrungsbericht aus dem Expat.com-Forum: Schwierigkeiten mit Visum und Arbeitserlaubnis… | forum | en | 3 |
| Erfahrungsbericht eines kasachischen Gründers: Devisenkontrolle und internationale Zahlun… | internetquelle | ru | 1 |
| Erklaerbare KI (XAI) im Audit: akademische Literatur zu Transparenz und Haftung | fachliteratur | en | 3 |
| ESG-, Nachhaltigkeits- und Qualitätsaudit (Sustainability Audit, ESG Assurance, Non-Finan… | fachliteratur | de | 23 |
| European Data Protection Law and Practice (Ustaran, IAPP) | internetquelle | en | 1 |
| EY Kasachstan: Themen des Projektbueros zur Kodex-Umsetzung (Juli 2026) | praxisbeitrag | en | 27 |
| Fachpresse zu Pachtstatistik und zweitem Moratorium (Kasachstani-Privatisierung) | fachliteratur | ru | 1 |
| FAO-Schulungen für Landwirte in Kasachstan zur Reduzierung des Pestizideinsatzes | praxisbeitrag | en | 5 |
| Finanz-, Abschluss- und Steuerprüfung (Financial Audit, Statutory Audit, External Audit,… | fachliteratur | de | 24 |
| Finanzmarktaufsicht ARDFM: Erreichbarkeit und Registerfrage ungeklaert | fachliteratur | ru | 1 |
| Foreign Ownership Rules in Kazakhstan: The 2026 Regulatory Reality for Foreign Investors | fachliteratur | en | 3 |
| Forensik, Betrugsprüfung und Compliance-Audit | fachliteratur | de | 24 |
| Formular 100.00 (KPN-Jahreserklaerung) - Frist und Einordnung | praxisbeitrag | ru | 10 |
| Formular 913.00 (Einzelhandelssteuer-Regime) - ab 2026 abgeschafft | praxisbeitrag | ru | 36 |
| Fruehere Rechnungshofkritik an der Baiterek-Reorganisation (2020) | fachliteratur | ru | 1 |
| Gemeinsame Verordnung Nr. 78 und Nr. 1054 aus dem Jahr 2023: Registrierungspflicht ab 50.… | rechtsnorm | ru | 2 |
| Gemeinsamer Auftrag für die Rechercheagenten (Phase 1 und 2) | internetrecherche | de | 5 |
| Generative KI und Unternehmensführung: Vorsichtsmaßnahmen für Vorstände (Harvard Law Scho… | praxisbeitrag | en | 2 |
| Gesetz der Republik Kasachstan Nr. 331-II vom 3. Juli 2002 „Über den Schutz von Pflanzen"… | rechtsnorm | en | 2 |
| Gesetz der Republik Kasachstan Nr. 344-I vom 11. Februar 1999 „Über die Pflanzenquarantän… | rechtsnorm | ru | 2 |
| Gesetz der Republik Kasachstan Nr. 385-II vom 8. Februar 2003 „Über das Saatgutwesen" (Sa… | rechtsnorm | ru | 2 |
| Gesetz der Republik Kasachstan Nr. 422-I vom 13. Juli 1999 „Über den Schutz von Selektion… | rechtsnorm | ru | 3 |
| Gesetz Nr. 331-II 'Über den Pflanzenschutz' (2002), Artikel 14-6: Staatliche Registrierun… | rechtsnorm | ru | 2 |
| Gesetz Nr. 94-V vom 21. Mai 2013 über personenbezogene Daten und deren Schutz | rechtsnorm | ru | 4 |
| Gesetz Nr. 94-V, Artikel 12: Pflicht zur Datenspeicherung auf kasachischem Staatsgebiet | rechtsnorm | ru | 1 |
| Gesetz Nr. 94-V, Artikel 16: Voraussetzungen der grenzueberschreitenden Datenuebermittlung | rechtsnorm | ru | 2 |
| Gesetz Ueber Buchhaltung und Finanzberichterstattung Nr. 234-III | fachliteratur | ru | 2 |
| Gesetz Ueber Pflanzenquarantaene Nr. 344-I | rechtsnorm | ru | 1 |
| Gesetzentwurf zur Produktion und zum Umlauf von Bio-Produkten in Kasachstan (2024) | internetquelle | ru | 5 |
| Gesondertes Moratorium: kein privater Erwerb von Staatsland durch Kasachstani | internetquelle | ru | 1 |
| Getreidegesetz Nr. 143-II: Qualitaets- und Lagerkontrolle | rechtsnorm | ru | 4 |
| GFSI-recognised Certification Programme Owners Version 2020 | standard | de | 5 |
| GRATA International: Datenschutzaufsicht, Digitalministerium und Meldepflicht seit 2024 | praxisbeitrag | en | 2 |
| Greenleaf und Kaldani: Data Privacy Laws in Central Asia, zwischen postsowjetischem Erbe… | fachliteratur | en | 4 |
| Grenzüberschreitende Datenübermittlungen unter der DSGVO (White & Case) | fachliteratur | en | 3 |
| Habr Fachbeitrag: Regulierung personenbezogener Daten in Kasachstan, Überblick und Besond… | internetquelle | ru | 2 |
| Hallucination-Free? Zuverlässigkeit führender KI-Rechtsrechercheprodukte (Stanford-Studie) | praxisbeitrag | en | 2 |
| Halyk Bank: Praktische Hinweise zur Devisenkontrolle fuer Unternehmen | fachliteratur | ru | 1 |
| Harvey AI in der Praxis: Nutzerbewertungen von Rechtsanwenderinnen und -anwendern | forum | en | 3 |
| Haupttrends bei staatlichen Foerdermassnahmen fuer die Landwirtschaft in Kasachstan unter… | fachliteratur | ru | 34 |
| Hoechste Auditkammer: Bericht vom 11.12.2024 zu Agrarsubventionen | internetquelle | ru | 2 |
| IAASB Automated Tools and Techniques Guidance (2020/2021) | standard | en | 3 |
| IAASB Catalog of Issues v2 (November 2025): offene Probleme KI im Audit | fachliteratur | en | 2 |
| IAASB Technology Quality Management Initiative (2025/2026): Stand der KI-Leitlinie | standard | en | 4 |
| IFS Food | standard | de | 317 |
| IIA Global Internal Audit Standards (in Kraft seit Januar 2025) | standard | en | 4 |
| IIA Three Lines Model (2020): Nachfolger des Three Lines of Defense-Modells | standard | en | 1 |
| inbusiness.kz: Wer ab 2027 eine Genehmigung zur Wassernutzung braucht | internetquelle | ru | 9 |
| Index: damicon-audit-kb-grundlagen | internetrecherche | de | 5 |
| Index: damicon-audit-kb-kasachstan | internetrecherche | de | 21 |
| Index: WAMOCON Legal Grundlagenwissen (laenderunabhaengig, KEIN kasachisches Recht) | internetrecherche | de | 4 |
| Index: WAMOCON Legal Wissensdatenbank Kasachstan (kasachstanspezifisch) | internetrecherche | de | 17 |
| Informatisierungsgesetz Nr. 418-V und Regeln fuer das Audit von Informationssystemen | rechtsnorm | ru | 3 |
| INHALT | praxisbeitrag | de | 39 |
| Integration von KazAgro in die Staatsholding Baiterek | behoerdeninfo | ru | 2 |
| Integrity Report | praxisbeitrag | de | 94 |
| International Arbitration Centre (IAC) des AIFC: Schiedsverfahren und Mediation als Alter… | praxisbeitrag | en | 1 |
| Interne Korruptionsrisikoanalyse nach Art. 8 Antikorruptionsgesetz | fachliteratur | ru | 2 |
| Interne Revision und öffentlicher Sektor | internetrecherche | de | 26 |
| iris.kz: Voller USt-Ruecktransfer fuer Agrarexporteure bleibt - Art. 484 soll entfallen | praxisbeitrag | ru | 6 |
| ISO 19011:2026 (4. Ausgabe) - Leitfaden zur Auditierung von Managementsystemen | standard | en | 1 |
| ISO 31000: Grundsätze, Rahmen und Prozess des Risikomanagements | internetquelle | en | 2 |
| ISO 31000:2018 - Risikomanagement, Leitlinien | standard | en | 1 |
| ISO 37301: Anforderungen an Compliance Management Systeme | fachliteratur | en | 3 |
| ISSAI 140 | standard | de | 33 |
| IT-, Cybersecurity- und KI-Audit (IT Audit, Information Systems Audit, Cybersecurity Audi… | internetrecherche | de | 29 |
| Kamerakontrolle 2026: 30 Tage Antwortfrist, Kontosperrung binnen eines Tages | praxisbeitrag | ru | 17 |
| Kammer der Wirtschaftspruefer der Republik Kasachstan (Palata Auditorov RK) | praxisbeitrag | ru | 1 |
| Kasachische Obst- und Gemüseproduzenten steigen auf ökologischen Anbau um (EastFruit) | internetquelle | ru | 5 |
| Kasachische wissenschaftliche Literatur zu KI im Staatsaudit und Rechnungswesen | fachliteratur | ru | 3 |
| Kasachisches KI-Gesetz Nr. 230-VIII: Audit-Pflicht fuer Hochrisiko-KI-Systeme | rechtsnorm | ru | 2 |
| Kasachisches Verrechnungspreisgesetz Nr. 67-IV | rechtsnorm | ru | 1 |
| Kasachstan beschließt ein neues Wassergesetzbuch (Germany Trade & Invest) | fachliteratur | de | 2 |
| Kasachstan hebt Ausländerquote für 2026 auf 0,3 Prozent an (Qazinform-Bericht) | internetquelle | en | 1 |
| Kasachstanisches Rechtsforum, Unterforum Buchhalter und Steuerzahler | forum | ru | 4 |
| KazakhExport: Exportkreditversicherung und -finanzierung | behoerdeninfo | ru | 4 |
| Kazakhstan Introduces Extended Producer Responsibility (EPR) (Pravsky Consulting) | fachliteratur | en | 2 |
| KGD-Dokument: Hintergrund zu ИС Астана-1 (АСИКУДА/ASYCUDA) | fachliteratur | ru | 3 |
| KGD-Erlaeuterung: Sonderregime fuer Bauern-/Farmwirtschaften | behoerdeninfo | ru | 3 |
| KGD-FAQ: Wie verbindet man sich mit ИС Астана-1? | behoerdeninfo | ru | 4 |
| KGD-Formularuebersicht ФНО 2026 | behoerdeninfo | ru | 6 |
| KGD-Sektion API-Interfeys (Einstiegsseite) | behoerdeninfo | ru | 4 |
| KGD: Anwendungsbereiche des Risikomanagementsystems (SUR) | behoerdeninfo | ru | 12 |
| KGD: API-Interface der elektronischen Rechnung (ESF) - Kontrastbeleg | behoerdeninfo | ru | 5 |
| KGD: Informationssystem ASTANA-1 (Zolldeklaration) - Nutzerseite | behoerdeninfo | ru | 4 |
| KGD: Katalog elektronischer Dienste (inkl. API-Sektion) | behoerdeninfo | ru | 8 |
| KGD: Nachschlagewerke fuer Aussenhandel (u.a. ТН ВЭД-Klassifikator) | behoerdeninfo | ru | 7 |
| KGD: zentrale API-Dokumentationsseite | behoerdeninfo | ru | 4 |
| Kollegija Auditorov und der Professionelle Rat fuer Pruefungstaetigkeit | fachliteratur | ru | 2 |
| Komitee fuer staatliche Inspektion im Agrarindustriekomplex: Statut | verwaltungsanweisung | ru | 2 |
| Komplexer Plan zur Entwicklung der Agraroekonomie 2026-2028 | fachliteratur | ru | 1 |
| Komplexplan zur Entwicklung der Agrarökonomie Kasachstans 2026 bis 2028 | internetquelle | ru | 6 |
| KPMG Clara und KPMG Audit Chat: generative KI in der Pruefungsplattform (2024) | fachliteratur | en | 1 |
| KPMG Kasachstan: Uebersicht der Tax Newsflashes | praxisbeitrag | en | 5 |
| KPMG Kaukasus/Zentralasien: KI-gestuetztes Risikomanagement (regionale Perspektive) | fachliteratur | ru | 1 |
| KPMG Law Kasachstan (02/2026): Rechtsunsicherheit bei mittelbarer Auslandsbeteiligung | praxisbeitrag | ru | 1 |
| KPMG Law Kasachstan: Ungeklaerte Reichweite des Bodenrechtsverbots bei indirekter Beteili… | praxisbeitrag | ru | 9 |
| KPMG Tax Newsflash Kasachstan, Juli 2026 | praxisbeitrag | en | 6 |
| KPMG Tax Newsflash Kasachstan, Juli 2026, zweite Ausgabe | praxisbeitrag | en | 7 |
| KPMG: Kasachstan schlaegt neue Steuermassnahmen vor (September 2026) | praxisbeitrag | en | 7 |
| Kursiv Media: Unterzeichnung des Vollverbots fuer auslaendischen Agrarlandbesitz durch Pr… | fachliteratur | ru | 1 |
| Landkodex Art. 144-148: Aufgaben der staatlichen Landkontrolle | fachliteratur | ru | 2 |
| Landkodex Art. 92-94: Zwangsentzug von Agrarland bei Nichtnutzung | fachliteratur | ru | 2 |
| Landkodex Nr. 442-II: aktuelle Fassung und juengste Aenderung | fachliteratur | ru | 1 |
| Landwirtschaftsflaechen in Kasachstan: Zustand und Trends der Qualitaetsverbesserung | fachliteratur | ru | 10 |
| Liste der zugelassenen Fiskaldatenoperatoren (ОФД) 2026 | praxisbeitrag | ru | 6 |
| Lücken und offene Fragen | internetrecherche | de | 23 |
| Marktdaten: Wachstum des kasachischen Buchhaltungs- und Pruefungsdienstleistungsmarkts | fachliteratur | ru | 1 |
| MG Partner: Besonderheiten der Devisenkontrolle für Nichtresidenten in Kasachstan | fachliteratur | ru | 1 |
| Migrationsregistrierung ueber eqonaq.kz: Die Drei-Werktage-Frist fuer den Gastgeber | praxisbeitrag | ru | 1 |
| MindBridge: KI-gestuetzte kontinuierliche Anomalieerkennung | fachliteratur | en | 1 |
| Ministerium fuer Wasserressourcen und Bewaesserung der Republik Kasachstan: Digitalisieru… | behoerdeninfo | ru | 3 |
| Moore Kasachstan: Kernaenderungen des neuen Steuerkodex | praxisbeitrag | en | 8 |
| Musterkodex fuer staatlich kontrollierte Aktiengesellschaften ausserhalb Samruk-Kazyna | fachliteratur | ru | 2 |
| mybuh.kz: Darf das КХ von Privatpersonen ohne Belege gekaufte Ware weiterverkaufen? | praxisbeitrag | ru | 9 |
| mybuh.kz: Muss ein КХ im ОУР die Formulare 700.00 und 701.01 einreichen? | praxisbeitrag | ru | 8 |
| mybuh.kz: Recht auf zusaetzlichen USt-Vorsteuerabzug fuer Schokoladen-/Zuckerwarenerzeuger | praxisbeitrag | ru | 9 |
| mybuh.kz: Regierung pruefte ИПН-Senkung fuer ЛПХ und КПН-Satz fuer Agrarkooperativen | praxisbeitrag | ru | 7 |
| mybuh.kz: Schwelle fuer die USt-Registrierung 2026 | praxisbeitrag | ru | 7 |
| mybuh.kz: SPK und LPCH koennten von der USt befreit werden | praxisbeitrag | ru | 7 |
| mybuh.kz: Virtuelles Lager 2026 - Warenabschreibung und СНТ ohne Bussgeld | praxisbeitrag | ru | 19 |
| mybuh.kz: Welche Erzeuger haben Anspruch auf den zusaetzlichen USt-Vorsteuerabzug | praxisbeitrag | ru | 7 |
| Nationaler Kodex der Unternehmensfuehrung der RK (Atameken, 2021) | fachliteratur | ru | 1 |
| Negativbefund: keine KI-Stellungnahme der privaten Pruefungskammer audit.kz | praxisbeitrag | ru | 1 |
| Neue Geldwäsche bezogene Anforderung: Persönliche Anwesenheit des Gründers bei der ТОО Re… | praxisbeitrag | ru | 2 |
| Neuer Authentifizierungsmechanismus in ИС ЭСФ - NCALayer-Pflicht (1C-Praxis) | praxisbeitrag | ru | 17 |
| Neuordnung der kasachischen Antikorruptionsinstitutionen zum 3. Juli 2025 | internetquelle | ru | 1 |
| New Yorker Übereinkommen von 1958: Beitritt Kasachstans und Inkrafttreten 1996 (UNCITRAL-… | rechtsnorm | en | 1 |
| Nutzen von Contract Lifecycle Management (CLM) für Rechtsabteilungen | praxisbeitrag | en | 2 |
| Obst- und Beerenexport aus Kasachstan wuchs 2024 um 23 Prozent (EastFruit) | internetquelle | ru | 2 |
| OECD Peer Review: Wettbewerbsrecht und Wettbewerbspolitik in Kasachstan (November 2025) | praxisbeitrag | en | 2 |
| OECD Steuerpolitik-Ueberpruefung Kasachstan 2020 | praxisbeitrag | en | 22 |
| OECD/G20 BEPS Action 13: Verrechnungspreisdokumentation | standard | en | 1 |
| Offener Datensatz Auditorenregister auf data.egov.kz: widerspruechlicher Status | fachliteratur | ru | 1 |
| Offizielle Erklärung Kasachstans bei der UNCAC-Unterzeichnungskonferenz in Mérida (2003) | behoerdeninfo | en | 6 |
| Offizielles Regierungsdokument (gov.kz): Rechtsgrundlage und Befugnisse der Agentur für S… | verwaltungsanweisung | en | 3 |
| OSMS-Beitragssaetze 2026: Arbeitgeber 3%, Arbeitnehmer 2% | praxisbeitrag | ru | 7 |
| Overview of Kazakhstan's WTO Accession Commitments (WTO, 2015) | behoerdeninfo | en | 2 |
| PART II BENCHMARK REQUIREMENTS IMPLEMENTATION HANDBOOK | standard | de | 108 |
| Patentgesetz Nr. 427-I von 1999: Patentfähigkeit und der Ausschluss von Computerprogramme… | rechtsnorm | en | 2 |
| Pflicht zur Antikorruptions-Compliance-Dienststelle, getrennt von interner Revision | internetquelle | ru | 3 |
| Phytosanitaerzertifikat fuer den Export von Himbeeren | fachliteratur | ru | 1 |
| Praesidialerlass Nr. 248 vom 06.05.2016: erstes Moratorium fuer Agrarland | rechtsnorm | ru | 2 |
| Praxisdiskussion zur Auswahl von Contract-Lifecycle-Management-Software | forum | en | 2 |
| Praxiserfahrungen mit GRC-Plattformen: Nutzerbewertungen zu ServiceNow GRC | forum | en | 2 |
| Pressemitteilung: Aenderung der API-Authentifizierungsmethode (ИС ЭСФ) | behoerdeninfo | ru | 5 |
| Prioritaetenliste fuer Investitionspraeferenzen: Pflanzenbau und mehrjaehrige Kulturen | verwaltungsanweisung | ru | 1 |
| Prodengi.kz, Lohnsteuerrechner | internetquelle | ru | 4 |
| Profinance.kz, Brutto-Netto-Gehaltsrechner | internetquelle | ru | 10 |
| PwC CEO-Umfrage 2026 Kasachstan: Steuern erstmals Top-Sorge | praxisbeitrag | ru | 6 |
| PwC Halo und EY Helix: etablierte Analytics-Plattformen im Audit | fachliteratur | en | 2 |
| PwC Worldwide Tax Summaries - Kasachstan (aktuell, Kontrollquelle) | fachliteratur | en | 5 |
| QazTrade-Kostenerstattung: Rechtsgrundlage und Saetze | behoerdeninfo | ru | 3 |
| QazTrade: Exportfoerderprogramme | behoerdeninfo | ru | 10 |
| Quellenkarte | internetrecherche | de | 16 |
| RAG in der Rechtstechnologie: Nutzen und Grenzen für juristische KI-Assistenten | praxisbeitrag | en | 2 |
| README: Wissensdatenbank Kasachstan-spezifisches Audit-Material | internetrecherche | de | 4 |
| README: Wissensdatenbank laenderunabhaengiges Audit-Grundlagenwissen | internetrecherche | de | 2 |
| Reform des institutionellen Investorenschutzes: Der Generalstaatsanwalt als neuer Investi… | fachliteratur | ru | 3 |
| Regierungsbeschluss Nr. 1041 vom 24. November 2023: Die Einhundertzwanzig-Tage-Schwelle f… | rechtsnorm | ru | 3 |
| Regierungsportal primeminister.kz: Aktuelle Foerdersaetze fuer Gewaechshausbau und Bewaes… | verwaltungsanweisung | ru | 2 |
| Research-Plan: Audit in Kasachstan | internetrecherche | de | 19 |
| Research: Audit in Kasachstan | internetrecherche | de | 4 |
| Retrieval Augmented Generation (RAG) und Vektordatenbanken: technische Grundlagen | fachliteratur | en | 2 |
| Running Legal Like a Business: The Fundamentals of Legal Operations for Law Departments | internetquelle | en | 1 |
| Russischsprachiger Fachueberblick zum kasachischen Nationalkodex (nccg.ru) | fachliteratur | ru | 1 |
| Saatgutgesetz Nr. 385-II, Artikel 19: Voraussetzungen der Ein- und Ausfuhr von Saatgut | rechtsnorm | ru | 2 |
| Saatgutkontrollgesetz Nr. 385-II | rechtsnorm | ru | 2 |
| Samruk-Kazyna Corporate-Governance-Kodex: verpflichtende interne Revision | fachliteratur | ru | 1 |
| Sanktionen-Rohbefund: Steuer- und Nebenpflichtverstoesse Kasachstan | internetrecherche | de | 15 |
| Sonderbesteuerungsregime fuer Agrarerzeuger bis 31.12.2025 (altes Steuergesetzbuch) | fachliteratur | ru | 1 |
| Sozialkodex Nr. 224-VII: Abloesung des fruaeheren Beschaeftigungsgesetzes zum 1. Juli 2023 | rechtsnorm | ru | 1 |
| Staatliche Sortenkommission Kasachstans (Госсорткомиссия): Zustaendige Fachbehoerde fuer… | fachliteratur | ru | 2 |
| Staatliches Auditorenregister auditor.dfo.kz: 536 registrierte Organisationen | fachliteratur | ru | 1 |
| Statistikgesetz Nr. 257-IV: Meldepflichten landwirtschaftlicher Unternehmen | rechtsnorm | ru | 2 |
| Statistische Meldeformulare fuer die Landwirtschaft: 29-SCH und 49-SCH | behoerdeninfo | ru | 6 |
| Steuerkodex Artikel 399: Befreiung von der Einfuhrumsatzsteuer für Investitionsprojekte | rechtsnorm | en | 4 |
| Steuerreform zum 01.01.2026: neues Steuergesetzbuch K2500000214 | internetquelle | ru | 2 |
| Strafgesetzbuch der Republik Kasachstan, Artikel 253: Kommerzielle Bestechung | rechtsnorm | ru | 4 |
| Subventionsregeln fuer Investitionsvorhaben im Agrarindustriekomplex: Antrags- und Pruefv… | fachliteratur | ru | 1 |
| Suchbegriffe je Agent und Sprache | internetrecherche | de | 4 |
| Table of contents | praxisbeitrag | de | 54 |
| Tax-Compliance-Managementsystem als Referenzmodell (Deutschland) | fachliteratur | de | 1 |
| Technische Pruefung: Portal der Hoechsten Auditkammer (gov.kz) | behoerdeninfo | ru | 1 |
| TR CU (TR TS) 021/2011 „Über die Sicherheit von Lebensmitteln", Analyse von Schmidt & Sch… | praxisbeitrag | en | 1 |
| TR CU (TR TS) 022/2011 „Über die Kennzeichnung von Lebensmitteln", Analyse von Schmidt &… | praxisbeitrag | en | 1 |
| uchet.kz: Wie berechnet ein Kommissionaer seinen USt-Umsatz | praxisbeitrag | ru | 6 |
| Uebersicht der Agrarsubventionsregeln per Ministererlass | fachliteratur | ru | 2 |
| Umweltgesetzbuch der Republik Kasachstan Nr. 400-VI (2021), Artikel 12: Vier Kategorien u… | rechtsnorm | ru | 4 |
| UN-Konvention gegen Korruption (UNCAC): Struktur, Zeitachse und Bezug zu Kasachstan | praxisbeitrag | en | 5 |
| Unicaselaw: Kasachstans Steuerreform 2026 - vom Haushaltsdefizit zur Unternehmenslast | praxisbeitrag | en | 12 |
| UNIDROIT Principles of International Commercial Contracts (2016): Grundprinzipien | fachliteratur | en | 2 |
| Unternehmerkodex Artikel 287: Befreiung von Zollzöllen im Rahmen von Investitionsverträgen | rechtsnorm | en | 4 |
| Urheberrechtsgesetz Nr. 6-I von 1996: Schutz von Computerprogrammen als literarisches Werk | rechtsnorm | en | 4 |
| USt-Registrierung 2026: Schwelle und Strafen | praxisbeitrag | ru | 9 |
| Verbesserung des Mechanismus fiskalischer Dezentralisierung auf regionaler Ebene (Mastera… | fachliteratur | ru | 2 |
| Verbindlichkeit internationaler Pruefungsstandards (ISA/MSA) in Kasachstan | praxisbeitrag | en | 2 |
| Vergleich COSO ERM und ISO 31000 (Fachartikel) | fachliteratur | en | 1 |
| Verschaerfte Mindestanforderungen an Pruefungsgesellschaften (Erlass vom 13.03.2026) | internetquelle | ru | 1 |
| Vertrag über die Eurasische Wirtschaftsunion, Artikel 97: Arbeitnehmerfreizügigkeit für E… | rechtsnorm | ru | 5 |
| Veterinaergesetz Nr. 339-II: Kontrollverfahren und Inspektorenbefugnisse | rechtsnorm | ru | 4 |
| Vorlaeuferprogramme: Konzept AIC 2021-2030 und Programm 2017-2021 | verwaltungsanweisung | ru | 2 |
| WAMOCON Legal Grundlagenwissen (länderunabhängig) | internetrecherche | de | 2 |
| WAMOCON Legal Wissensdatenbank Kasachstan | internetrecherche | de | 5 |
| Was gute Auftragsverarbeitungsverträge ausmacht: Praxisanalyse eines DPA-Vertrags | praxisbeitrag | en | 2 |
| Wassergesetzbuch der Republik Kasachstan Nr. 178-VIII (2025), Artikel 17: Recht auf Wasse… | rechtsnorm | ru | 3 |
| Wasserkodex der Republik Kasachstan Nr. 178-VIII vom 9. April 2025 | rechtsnorm | ru | 5 |
| WCR Consulting: Praktischer Schutz von Quellcode durch Hinterlegung bei Kazpatent | praxisbeitrag | ru | 2 |
| Weitere Berufskammern und Register: audit.kz, auditkz.kz, psad.kz, KASE | praxisbeitrag | ru | 3 |
| Weitere Pruefungsfeststellungen der Hoechsten Auditkammer 2023-2025 | internetquelle | ru | 2 |
| Welche Erdbeer- und Beerensorten werden in Kasachstan angebaut, und gibt es staatliche Fö… | fachliteratur | ru | 2 |
| Weltbank ROSC/JERP-KZ-Bericht (Dezember 2020) zum kasachischen Pruefungswesen | praxisbeitrag | en | 1 |
| Weltbank Wirtschaftsbericht Kasachstan Januar 2025 | praxisbeitrag | en | 6 |
| WIPO: Was ist geistiges Eigentum? Grundbegriffe und Schutzrechte | fachliteratur | en | 2 |
| World Bank Business Ready 2025: Wirtschaftsprofil Kasachstan (Nachfolgebericht zu Doing B… | praxisbeitrag | en | 2 |
| Zemelny Kodeks Respubliki Kasachstan: Tekuschtschaja situazija (Landgesetzbuch der Republ… | fachliteratur | ru | 2 |
| Zivilgesetzbuch RK Besonderer Teil, Spiegelportal (artikelweise) | fachliteratur | ru | 7 |
| Zustaendige Behoerde fuer die Regulierung der Pruefungstaetigkeit: Finanzministerium | fachliteratur | ru | 1 |
| Zustaendigkeitswechsel der Pruefer-Lizenzierung an den Ausschuss KVGA ab 04.08.2026 | internetquelle | ru | 1 |
| Аренда сельхозземель: у иностранцев есть лазейка (Landpacht: Ausländer haben ein Schlupfl… | internetquelle | ru | 2 |
| Вопросы к аудитору / юристу в Республике Казахстан | internetrecherche | de | 10 |
| ТК ЕАЭС Art. 37-60: Zollwert, Berechnung, Faelligkeit, Stundung (inkl. Agrar-Sonderregel) | fachliteratur | ru | 5 |
