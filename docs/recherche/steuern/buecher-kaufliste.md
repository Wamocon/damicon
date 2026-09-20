# Buecher: Kaufliste mit Direktlinks

> **Die verbindliche Kurzfassung steht in `kaufentscheidung-buecher.md`: drei Titel, 11.280 Tenge.**
> Diese Seite bleibt als Arbeitsunterlage bestehen. Sie enthaelt die Produktadressen, die Preisrecherche, die Pruefung der digitalen Verfuegbarkeit und die Begruendungen im Einzelnen. Die Stufentabellen unten geben den Stand **vor** der Endauswahl wieder und sind deshalb laenger als die Kaufliste, die am Ende herauskam.

Zum Anklicken und Bestellen. Preise in Tenge, gegen die verlinkte Seite geprueft, Stand 2026-09-18.

Ausfuehrliche Einordnung je Titel steht in `buecherliste.md`.

## Vorab: drei Dinge, die Geld sparen

**Der gedruckte Steuerkodex ist seit dem 19.09.2026 ueberfluessig.** Beide Sprachfassungen liegen jetzt vollstaendig und artikelgenau im Korpus unter `korpus/nk-214-viii/`, geerntet vom amtlichen Server. Die gedruckten Abdrucke kosten zusammen 12.890 Tenge und enthalten exakt denselben Text. Fuer die Vektordatenbank bringen sie null. Als Griffexemplar auf dem Schreibtisch mag das trotzdem jemand wollen, das ist dann aber eine Bequemlichkeitsentscheidung und keine Datenentscheidung.

**Kein Titel laesst sich als Download kaufen.** Geprueft am 2026-09-19 fuer jeden Titel der Stufen 1 und 2, Belege unten im Abschnitt "Digitale Verfuegbarkeit". Jedes gekaufte Buch muss gescannt und durch Texterkennung, bevor es in die Vektordatenbank kann. Rechne mit etwa einer Stunde Handarbeit je 200 Seiten. Das ist der eigentliche Preis dieser Liste, nicht die Tenge.

**Einen Kommentar zum neuen Kodex gibt es nicht.** Der wertvollste Buchtyp existiert noch nicht. Ersatz ist die kostenlose Kommentarseite des KGD.

## Stufe 1: kaufen, zusammen 15.780 Tenge

Diese vier decken Luecken, die keine freie Quelle fuellt.

> **Geaendert am 2026-09-19 nach Abgleich mit dem geernteten Kodextext.** Frueher standen hier fuenf Titel fuer 18.880 Tenge. "Налоговый учет ИП и СНР" von Proskurina ist herausgenommen, Begruendung unten unter "Herausgenommen". Beim Lohntitel ist eine Einschraenkung dazugekommen.

| Titel | Preis | Bestellen | Was es bringt, das nicht frei ist |
|---|---|---|---|
| Бухгалтерские проводки (2026) - Proskurina | 6.200 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | Der einzige ausdruecklich auf 2026 aktualisierte Praxistitel. Buchungssaetze, also genau die Uebersetzung von Rechtsnorm in Buchhaltung, die im Gesetzestext nicht steht |
| Бухгалтерский учет в сельском хозяйстве (+CD) - Nazhikbaeva | 2.180 | [lem.kz](http://lem.kz/publishing-house/buhgalterskij-uchet-v-selskom-hozyajstve-cd/1242) | **Der einzige Titel zur Agrarbuchhaltung im gesamten kasachischen Markt.** Von 2015, Steuerteil veraltet, Methodik nicht. Die CD kann maschinenlesbaren Text enthalten, das waere der einzige Titel ohne Scanbedarf |
| Особенности начисления и удержания заработной платы - Zagretdinova | 2.900 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | Lohnabrechnung im Detail. Groesste Luecke im System: `lohn_abrechnungen` zahlt brutto ohne jeden Abzug. **Nur als Verfahrensbeschreibung kaufen, nie als Satzquelle**, siehe Warnung unten |
| 1С:Бухгалтерия 8.3 для Казахстана - Skoblikova | 4.500 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | Ersatz fuer den blockierten Anbietervergleich. Das Objektmodell von 1C liegt hinter einer Bezahlschranke; dieses Buch beschreibt es |

### Herausgenommen: Налоговый учет ИП и СНР (Proskurina, 3.100 Tenge)

Stand bis zum 2026-09-19 in Stufe 1 mit der Begruendung "Sonderregime, also das Thema des Betriebs". Der inzwischen geerntete Kodextext entwertet ihn.

Das Sonderregime wurde nicht geaendert, sondern **ersetzt**. Der einheitliche Bodensteuer ist abgeschafft; an seine Stelle treten Art. 728 bis 733 mit neuem Anwendungsbereich (Art. 728, samt neuer Flaechenzonen 5.000 / 3.500 / 1.500 / 500 ha), neuem Steuergegenstand (Art. 729), neuem Satz (Art. 730, 0,5 Prozent) und neuer Befreiungsliste (Art. 731, darunter die vollstaendige USt-Befreiung). Ein Titel von vor 2026 beschreibt ein Regime, das es nicht mehr gibt, und die ausfuehrliche `buecherliste.md` warnte bereits mit "**VOR 2026-KODEX**, zwingend gegenpruefen".

Wieder aufnehmen, sobald der Verlag eine Auflage von 2026 ausweist.

### Warnung zum Lohntitel

Zagretdinova bleibt in Stufe 1, weil es der einzige Titel zur Lohnabrechnung ist und die Lohnabrechnung die groesste Luecke im System. Das Zahlenwerk ist aber vollstaendig hinfaellig, falls die Auflage vor 2026 liegt:

| Groesse | Vor 2026 | Ab 2026 | Fundstelle |
|---|---|---|---|
| Einkommensteuertarif | linear 10 Prozent | progressiv ab 8.500 МРП | Art. 363 пп.1 |
| Grundfreibetrag | 14 МЗП | 30 МРП | Art. 403 |
| ОПВР | 2,5 Prozent | 3,5 Prozent | ENPF, amtlich |
| Sozialsteuer minus Sozialabgaben | zulaessig | abgeschafft | Art. 558 |
| Sozialsteuer КХ/ФХ | 6 Prozent | 0,6 / 0,3 МРП je Monat | Art. 557 п.4 |

Die Methode bleibt brauchbar, jede Zahl ist gegen den Korpus zu ersetzen.

## Stufe 2: lohnt sich, wenn Budget da ist

| Titel | Preis | Bestellen | Wofuer |
|---|---|---|---|
| Первичные документы | 6.500 | [probuh.com.kz](https://probuh.com.kz/) | Belegarten und Pflichtangaben, Vorstufe zu ЭСФ und Rechnung |
| План счетов и проводки | 3.500 | [probuh.com.kz](https://probuh.com.kz/) | Kontenrahmen, offene Frage A3 im Zielentwurf |
| Справочник ИП - Skala | 3.800 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | Einzelunternehmer, betrifft Nachbarbetriebe und Kunden |
| ИП в РК - Yurchenko | 3.500 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | dito, zweite Sicht |
| Таможенный кодекс ЕАЭС 2026 | 3.900 | [lem.kz](https://lem.kz/publishing-house/tamozheny-kodeks-ees/1709) | Aussenhandel. Erst kaufen, wenn feststeht, dass wirklich ein- oder ausgefuehrt wird |
| Бухгалтерский учет в организациях - Nurseitov | 4.900 | [lem.kz](https://lem.kz/publishing-house/catalog/buhgalterskij-uchet-i-nalogooblozhenie/166) | Allgemeines Rechnungswesen als Grundlage |
| МСФО: теория и практика - Nurseitov | 3.900 | [flip.kz](https://www.flip.kz/catalog?prod=9239) | Rechnungslegungsstandards, offene Frage A1 |
| Трудовое право РК - Hamzin (ru) | 1.980 | [lem.kz](https://lem.kz/publishing-house/catalog/trud-i-zarabotnaya-plata/179) | Arbeitsrecht, Umfeld von ЕСУТД |
| Еңбек құқығы - Hamzin (kk) | 2.200 | [lem.kz](https://lem.kz/publishing-house/catalog/trud-i-zarabotnaya-plata/179) | Kasachische Fassung, hilft der Terminologie im Glossar |

## Stufe 3: nicht kaufen

| Titel | Preis | Warum nicht |
|---|---|---|
| Налоговый кодекс РК на 2026 (ru) | 4.990 | **Text liegt frei im Korpus.** 848 Artikel, maschinenlesbar, artikelgenau |
| Қазақстан Республикасының Салық кодексі 2026 (kk) | 7.900 | dito, kasachische Fassung ebenfalls vollstaendig geerntet |
| Комментарий к НК РК - NPP/Atameken 2020 | offen | Kommentiert den **aufgehobenen** Kodex von 2017. Zudem vergriffen |
| Комментарии к Трудовому кодексу - Skala | 18.500 | Teuerster Titel der Liste, Arbeitsrecht statt Steuerrecht. Erst wenn Lohn und ЕСУТД wirklich gebaut werden |

## Kostenlos, kein Kauf noetig

Diese Quellen sind offen lizenziert oder frei zugaenglich und werden in die Ernte aufgenommen:

| Quelle | Link |
|---|---|
| Steuerkodex 214-VIII, beide Sprachen | bereits im Korpus, `korpus/nk-214-viii/` |
| KGD-Kommentar zum Steuerkodex | [kgd.gov.kz](https://kgd.gov.kz/ru/section/kommentariy-k-nalogovomu-kodeksu-rk) |
| Mergenbayeva u.a., Schattenwirtschaft Kasachstan, Economies 2026 | [mdpi.com](https://www.mdpi.com/) offener Zugang |
| Adambekova u.a., Regionale Investitionen, Economies 2026 | [mdpi.com](https://www.mdpi.com/) offener Zugang |
| Shulenbaeva u.a., Landwirtschaftliche Flaechen, Проблемы агрорынка 2025 | frei |
| CyberLeninka, Suche nach kasachischem Steuerrecht | [cyberleninka.ru](https://cyberleninka.ru/) |

## Digitale Verfuegbarkeit

Geprueft am 2026-09-19, Titel fuer Titel gegen die Verlags- und Haendlerseiten. Ergebnis vorweg: kein einziger Titel der Stufen 1 und 2 ist als Download zu kaufen. LEM verkauft nur gedruckt, auf lem.kz wie auf der Zweitseite i-lem.kz; flip.kz und Kaspi.kz fuehren dieselben Titel ebenfalls nur gedruckt. Ein Bezahl-PDF gibt es zu keinem der dreizehn Titel.

Was es stattdessen gibt, steht in der letzten Spalte.

### Stufe 1

| Titel | Jahr | Umfang | Produktseite | Digital verfuegbar |
|---|---|---|---|---|
| Бухгалтерские проводки - Proskurina | 2026 | 268 S., A5 | [lem.kz 1786](https://lem.kz/publishing-house/buhgalterskie-provodki-2026/1786) | nur Leseprobe als PDF, rund 0,5 MB |
| Бухгалтерский учет в сельском хозяйстве - Nazhikbaeva | 2015 | 164 S., A5 | [lem.kz 1242](http://lem.kz/publishing-house/buhgalterskij-uchet-v-selskom-hozyajstve-cd/1242) | elektronische Beilage frei herunterladbar, auch ohne Kauf, siehe unten |
| Особенности начисления и удержания заработной платы - Zagretdinova | 2021 | 176 S., A5 | [lem.kz 1965](https://lem.kz/publishing-house/osobennosti-nachisleniya-i-uderzhaniya-zp/1965) | nur Leseprobe als PDF |
| 1С:Предприятие 8.3 Бухгалтерия для Казахстана - Skoblikova | 2022 | 172 S., A4 | [lem.kz 2098](https://lem.kz/publishing-house/1s-predpriyatie-8-3-buhgalteriya-dlya-kazahstana-avtomatizaciya-ucheta-po-nalogam-prakticheskoe-posobie/2098) | nichts, nicht einmal eine Leseprobe |

Zwei Jahresangaben sind neu und betreffen die Kaufentscheidung. Zagretdinova ist von 2021, Skoblikova von 2022. Beide liegen vor dem Kodex von 2026; die Warnung zum Lohntitel weiter oben ist damit belegt.

Der Skoblikova-Titel heisst beim Verlag vollstaendig "1С:Предприятие 8.3 Бухгалтерия для Казахстана. Редакция 3. Автоматизация учета по налогам". Er beschreibt die Steuerautomatisierung im Stand von 2022, nicht die des neuen Kodex.

### Stufe 2

| Titel | Jahr | Umfang | Produktseite | Digital verfuegbar |
|---|---|---|---|---|
| Первичные документы | offen | offen | [probuh.com.kz](https://probuh.com.kz/) | Format nirgends angegeben, siehe unten |
| План счетов и типовые проводки | offen | offen | [probuh.com.kz](https://probuh.com.kz/) | Format nirgends angegeben, siehe unten |
| Справочное пособие ИП - Skala | 2023 | 120 S., A5 | [lem.kz 2167](https://lem.kz/publishing-house/spravochnoe-posobie-individualnogo-predprinimatelya-2023/2167) | elektronische Beilage frei herunterladbar, auch ohne Kauf |
| Индивидуальное предпринимательство в РК - Yurchenko | 2020 | 160 S., A5 | [lem.kz 1910](https://lem.kz/publishing-house/individualnoe-predprinimatelstvo-v-rk/1910) | nur Leseprobe als PDF |
| Таможенный кодекс ЕАЭС - Abdruck | 2026 | 236 S., A4 | [lem.kz 1709](https://lem.kz/publishing-house/tamozheny-kodeks-ees/1709) | Gesetzestext frei bei der Kommission, siehe unten |
| Бухгалтерский учет в организациях - Nurseitov | 2015 | 432 S., A5 | [lem.kz 1503](https://lem.kz/publishing-house/buhgalterskij-uchet-v-organizaciyah-uchebnoe-posobie/1503) | nur Leseprobe als PDF |
| МСФО: теория и практика - Nurseitov | 2007 | 568 S., gebunden | [lem.kz 1311](https://lem.kz/publishing-house/mezhdunarodnue-standartu-finansovoj-otchetnosti-teoriya-i-praktika/1311), [flip.kz](https://www.flip.kz/catalog?prod=9239) | nichts, bei flip.kz nur auf Bestellung |
| Трудовое право РК - Hamzin (ru) | 2018 | 208 S., A5 | [lem.kz 1763](https://lem.kz/publishing-house/trudovoye-pravo-uchebnik/1763) | vollstaendig online lesbar bei AnyFlip, siehe unten |
| Қазақстанның Еңбек құқығы - Hamzin (kk) | 2019 | 204 S., A5 | [lem.kz 1811](https://lem.kz/publishing-house/kazakstanin-enbek-kukygy/1811) | nur Leseprobe als PDF |

### Die Leseproben

Zu den meisten LEM-Titeln liegt eine Leseprobe als PDF offen auf dem Verlagsserver, eingebunden ueber einen Vorschau-Knopf auf der Produktseite. Bei "Трудовое право Казахстана" sind es sechs Seiten bei 186 kB. Die uebrigen Proben liegen zwischen 90 kB und 900 kB und damit in derselben Groessenordnung. Das reicht fuer Titelei und Inhaltsverzeichnis, mehr nicht. Fuer den Korpus ist es nichts, fuer die Kaufentscheidung schon: man sieht vorab die Gliederung.

### Die elektronischen Beilagen

LEM sammelt die Beilagen seiner Buecher auf einer offenen Seite: [lem.kz/content/el-prilozh](https://lem.kz/content/el-prilozh). Die Dateien liegen dort ohne Anmeldung, ohne Code aus dem Buch und ohne Kauf. Fuer die Kaufliste sind drei Eintraege einschlaegig: "Бухучет в сельском хозяйстве" (die Beilage des Nazhikbaeva-Titels aus Stufe 1), "Справочное пособие ИП (2023) Скала В.И." (Stufe 2) und "Пособие по налоговому учету ИП" (der am 2026-09-19 herausgenommene Proskurina-Titel).

Die Beilage zum Agrartitel wurde geoeffnet und geprueft. Die ZIP enthaelt eine Windows-Datei von 1,3 MB, darin Word-, RTF- und PDF-Dokumente: МСФО 41, eine Muster-Steuerrichtlinie, die Formulare 100.00, 200.00, 300.00, 320.00 und 328.00 sowie das Gesetz 533-II. Der Buchtext ist nicht dabei. Diese Rechtstexte und Formulare liegen ohnehin frei vor, die Beilage spart also keinen Scan. Die Programmdatei wurde nicht ausgefuehrt, nur ihr Inhalt ausgelesen.

### Zwei Sonderfaelle

Der **Таможенный кодекс ЕАЭС** ist derselbe Fall wie der Steuerkodex: ein Abdruck eines Gesetzestextes, den die Eurasische Kommission unter [eec.eaeunion.org](https://eec.eaeunion.org/comission/department/dep_tamoj_zak/tk_eaes.php) frei und maschinenlesbar bereitstellt. Die 3.900 Tenge kaufen Papier, keine Daten. Wenn Aussenhandel tatsaechlich dazukommt, gehoert der Text geerntet, nicht bestellt.

**Трудовое право Казахстана** von Hamzin liegt vollstaendig und frei lesbar bei AnyFlip: [anyflip.com/tpgd/rcgp](https://anyflip.com/tpgd/rcgp), hochgeladen von der Innovativen Universitaet Eurasien, deren Wissenschaftlicher Rat das Buch zur Herausgabe empfohlen hat. Der Download ist vom Hochladenden abgeschaltet, der Server antwortet auf die Download-Adresse mit "NOT_DOWNLOAD_POWER". Lesbar sind Seitenbilder, also waere Texterkennung trotzdem noetig, nur das Scannen faellt weg. Die Rechtelage dieser Kopie ist unklar, vor einer Uebernahme in den Korpus zu klaeren.

### Die beiden Titel von probuh.com.kz

Zu "Первичные документы" und "План счетов и типовые проводки" nennt die Seite weder Format noch Jahr noch Autor. Der Kauf laeuft ueber WhatsApp oder E-Mail an probuh.kz@bk.ru. Ob gedruckt oder als Datei geliefert wird, muss vor der Bestellung gefragt werden. Ein Download-Angebot bewirbt die Seite nicht.

### Was offen bleibt

Ob LEM auf Anfrage ein PDF abgibt, ist nicht geklaert. Der Verlag bewirbt das nirgends, schliesst es aber auch nirgends aus. Eine Anfrage unter +7 707 228-13-48 oder ueber das Kontaktformular kostet nichts und wuerde, falls sie Erfolg hat, fuer die vier Titel der Stufe 1 rund 780 Seiten Scanarbeit ersparen.

Einen zweiten digitalen Weg gibt es beim Zentralen Haus des Buchhalters: die [Bibliothek des Buchhalters](https://cdb.kz/sistema/biblioteka-bukhgaltera/books/) haelt Buchausgaben im Volltext gegen Abonnement bereit. Im sichtbaren Bestand stehen aber Kodexausgaben und eigene Leitfaeden, keiner der hier gelisteten Titel.

## Was der Normtext ersetzt

Geprueft am 2026-09-19. Mehrere Titel drucken im Kern einen Ministerialerlass nach und ordnen ihn didaktisch. Wo das zutrifft, ersetzt die Ernte den Kauf, denn der Erlass ist frei, amtlich, zweisprachig und maschinenlesbar. Geerntet mit `scripts/steuer-rechnungswesen-ernte.mjs` nach `korpus/rechnungswesen/`, 14 Dateien.

| Statt zu kaufen | gespart | liegt jetzt im Korpus als | Fundstelle |
|---|---|---|---|
| План счетов и типовые проводки (probuh) | 3.500 | `kontenplan-ru.md` / `-kk.md`, 551 Konten mit Beschreibung, darunter Unterabschnitt 1600 "Биологические активы" | Anordnung Nr. 185 vom 23.05.2007, `V070004771_` |
| Первичные документы (probuh) | 6.500 | `primaerbelege-ru.md` / `-kk.md`, die amtlichen Belegformulare КО-1 bis КО-5, Д-1, Д-2, Т-1 und weitere | Anordnung Nr. 562 vom 20.12.2012, `V1200008265` |
| Таможенный кодекс ЕАЭС (Abdruck) | 3.900 | noch nicht geerntet, aber frei bei der Eurasischen Kommission | [eec.eaeunion.org](https://eec.eaeunion.org/comission/department/dep_tamoj_zak/tk_eaes.php) |

**Zusammen 13.900 Tenge, die nicht mehr ausgegeben werden muessen.** Der Kontenplan ist fuer diesen Betrieb besonders einschlaegig: Unterabschnitt 1600 fuehrt die biologischen Vermoegenswerte, also genau die Kontengruppe, die eine Agrarsoftware braucht und die in keinem allgemeinen Kontenrahmen steht.

Mitgeerntet, weil sie denselben Regelungszusammenhang bilden und nirgends auf der Kaufliste standen:

| Akt | Warum er fehlt, wenn man ihn nicht hat |
|---|---|
| Gesetz ueber Buchfuehrung und Finanzberichterstattung (`Z070000234_`) | Traegernorm der gesamten Rechnungslegung |
| Regeln der Buchfuehrung (`V1500010954`) | Belegumlauf, Inventur, Korrekturen, Aufbewahrung |
| NSFO nebst Aenderung 2025 (`V1300008328`, `V2500036489`) | das vereinfachte Regime, also das fuer diesen Betrieb einschlaegige |
| Regeln der Steuerbuchfuehrung (`V2500037054`) | neu zum Kodex 214-VIII, Bindeglied zwischen Buchfuehrung und Erklaerung |

### Was der Normtext NICHT ersetzt

**Buchungssaetze.** Der Typenkontenplan listet die Konten und beschreibt sie, enthaelt aber keine einzige Korrespondenz. Zwei freie Kandidaten wurden geprueft und beide verworfen: die pro1c-Seite zum Kontenplan ist frei lesbar, gibt aber nur den Kontenplan wieder, den wir amtlich schon haben, und enthaelt null Treffer auf "Дт", "Кт" oder "корреспонденция"; das uchet.kz-Nachschlagewerk steht hinter einer Bezahlschranke.

Damit bleibt "Бухгалтерские проводки 2026" von Proskurina fuer 6.200 Tenge der einzige Weg zu dem Schritt, der im Gesetz nicht steht: von der Rechtsnorm zum Buchungssatz. Der Titel bleibt auf Stufe 1, und die Suche nach einem freien Ersatz ist erfolglos geblieben, nicht unversucht.

**Lohnabrechnung, Agrarmethodik und 1C.** Auch dafuer gibt es keinen Erlass, der das Buch ersetzt.

## Digitale Bezugswege, die es doch gibt

### Einzelkapitel beim Zentralen Haus des Buchhalters, 200 Tenge

Die [Bibliothek des Buchhalters](https://cdb.kz/sistema/biblioteka-bukhgaltera/articles/) auf cdb.kz zeigt jedes Kapitel anonym bis zum ersten Satz und bricht dann ab. Bemerkenswert ist nicht die Schranke, sondern der Preis dahinter: **200 Tenge je Kapitel, und das Dokument kommt nach der Zahlung per E-Mail**. Das ist der einzige gefundene Weg, kasachische Buchhaltungsfachliteratur ueberhaupt als Datei zu bekommen, ohne zu scannen.

Die Kapitelliste selbst steht hinter der Anmeldung, einzelne Kapitel sind aber ueber Suchmaschinen auffindbar, etwa "Глава 11. УЧЕТ ДОХОДОВ И РАСХОДОВ". Wer gezielt ein Thema braucht, zahlt 200 Tenge statt mehrerer Tausend fuer ein ganzes Buch und spart den Scan.

Nicht geprueft wurde, wie viele Kapitel es gibt und ob sie zusammen ein Buch ergeben. Das waere vor einer groesseren Bestellung zu klaeren.

### Anfrage beim Verlag

Bleibt der naheliegendste Weg und ist weiterhin offen. LEM bewirbt auf keiner der zehn geprueften Produktseiten eine elektronische Fassung, schliesst sie aber auch nirgends aus. Eine Anfrage unter +7 707 228-13-48 kostet nichts und wuerde fuer die vier Titel der Stufe 1 rund 780 Seiten Scanarbeit ersparen.

### Was geprueft wurde und nichts ergab

Wiederholbar mit `node scripts/buecher-verfuegbarkeit-pruefen.mjs`.

| Weg | Ergebnis |
|---|---|
| LEM-Produktseiten, alle zehn Titel | kein Dateiangebot, nur Leseproben |
| Internet Archive, verfassergebunden | kein Titel. Die fuenf Treffer auf "Юрченко" sind ein anderer Autor, Buecher ueber Marco Polo und das arabische Kalifat |
| Google Books | Tageskontingent ohne Schluessel erschoepft, nicht auswertbar |
| kazneb.kz, Nationale Elektronische Bibliothek | maschinell nicht abfragbar, Suche laeuft ueber ein Formular mit Sitzungskennung. Von Hand zu pruefen |
| rmebrk.kz, Republikanische Hochschulbibliothek | kein Treffer. **Achtung bei der Wiederholung:** die Seite spiegelt den Suchbegriff ins Eingabefeld zurueck, ein naiver Test meldet deshalb fuer jeden erfundenen Namen einen Treffer. Das Skript rechnet gegen eine Kontrollabfrage |

Keiner dieser Wege wurde ueber eine Bezahlschranke hinaus verfolgt.

## Hinweise zur Bestellung

**Zu jedem Titel gibt es doch eine eigene Produktseite.** Die frueher hier notierte Einschraenkung stimmt nicht. Bei der Pruefung am 2026-09-19 liess sich zu jedem Titel der Stufen 1 und 2 die Produktadresse bei LEM finden; sie stehen in den Tabellen im Abschnitt "Digitale Verfuegbarkeit". Die Kategorielinks in den Bestelltabellen oben bleiben als zweiter Einstieg stehen.

**Zweite Bezugsquelle pruefen.** Mehrere Titel sind auch ueber [flip.kz](https://www.flip.kz/) und [Kaspi.kz](https://kaspi.kz/shop/) gelistet, teils guenstiger und mit Lieferung innerhalb Kasachstans.

**Nach dem Kauf:** scannen, Texterkennung, dann als Datei unter `korpus/buecher/` mit Frontmatter nach `rag-ingest-spezifikation.md` ablegen. Wichtig ist `gueltig_ab` und bei allem vor 2026 `ist_ueberholt: true`, sonst verunreinigt ein Titel von 2015 die Auskunft zum geltenden Recht.
