# Pruefbericht: Wird eine Angabe im Korpus durch eine andere Quelle im Korpus ueberholt?

Stand: 2026-09-19. Geprueft wurde der gesamte Korpus (5.347 Dateien) gegen sich selbst, dazu die eigenen Auswertungsdokumente und die Buchlisten.

**Pruefregel, dieselbe wie im Konfliktregister:** entschieden wird nur durch einen Artikel des Steuerkodex 214-VIII oder eine amtliche KGD-Veroeffentlichung. Zwei uebereinstimmende Sekundaerquellen entscheiden nichts.

**Warum dieser Bericht ueberhaupt etwas findet:** die Auswertungsdokumente in `kernwissen/` entstanden am 2026-09-18. Der Steuerkodex wurde erst am 2026-09-19 artikelweise geerntet. Alles, was am 18. nur ueber Spiegelportale und Praktikerseiten erschlossen werden konnte, laesst sich jetzt am Primaertext nachlesen. Genau dort liegen die Treffer.

---

## Teil 1: Der schwerwiegendste Befund

### 1.1 Der zusaetzliche USt-Vorsteuerabzug betraegt 80 Prozent, nicht 70, und das Bauernhaus ist ausdruecklich beguenstigt

`kernwissen/khfh-regime-rohbefund.md` Abschnitt 5.1 sagt drei Dinge, die der Primaertext alle drei widerlegt:

| Behauptung im eigenen Dokument | Primaertext | Fundstelle |
|---|---|---|
| "Gefundener Satz: 70 %, NICHT 80 %" | 80 Prozent | Art. 490 п.4: `НДСдз = (НДСобл – НДСрз – НДСпр) х 80%` |
| "richtet sich an VERARBEITER, nicht an Roherzeuger" | Erzeuger ausdruecklich eingeschlossen | Art. 490 п.1 пп.1: "производители сельскохозяйственной продукции [...] **включая крестьянские или фермерские хозяйства**" |
| "Status: OFFEN, mit begruendetem Verdacht auf Verwechslung" | kein Verdachtsfall, die Zahl stimmt | ebenda |

**Das ist kein Randbefund.** Der Zusatzabzug ist eine Verguenstigung des Betriebs selbst, fuer den dieses System gebaut wird, und sie wurde in der eigenen Auswertung sowohl der Hoehe nach zu niedrig als auch dem Kreis nach zu eng beschrieben.

**Ich habe hier zweimal danebengelegen und korrigiere beides.** Die Vorrecherche nannte 80 Prozent. Ich habe das spaeter als unbelegt verworfen und "70 Prozent, nur Verarbeiter" dagegengesetzt. Der Kodextext gibt der Vorrecherche recht.

### 1.2 Veraltete Artikelnummer: ст. 411

Der 70-Prozent-Satz war auf "статья 411 НК РК (п.1 пп.2)" gestuetzt. Das ist die Nummer aus dem **aufgehobenen Kodex von 2017**. Im Kodex 214-VIII ist Art. 411 "Определение облагаемого дохода физического лица" und hat mit Mehrwertsteuer nichts zu tun. Die Nachfolgevorschrift ist **Art. 490**.

Von 19 in den Auswertungsdokumenten zitierten Artikelnummern ist dies die einzige falsche. Alle uebrigen wurden gegen den Artikeltitel im Korpus geprueft und stimmen: 134, 357, 363, 372, 455, 456, 467, 479, 480, 484, 495, 503, 518, 531, 588, 728, 729, 730.

---

## Teil 2: Korpusdateien mit ueberholten Angaben ohne Kennzeichnung

Drei Dateien tragen den Mehrwertsteuersatz von 12 Prozent und sind nicht als ueberholt markiert.

| Datei | Stelle | Widerlegt durch |
|---|---|---|
| `fachquellen/dentons-global-tax-guide-kasachstan.md` | "The standard rate of VAT is 12%", dazu Digital VAT zweimal mit 12 Prozent | Art. 503 п.1: 16 Prozent |
| `fachquellen/calculators-kz-rechner.md` | "Выделение или начисление НДС 12%" | ebenda |
| `presse/alaics-kz-zollbroker-preise-rus.md` | Rechenbeispiel "НДС (12%) - 12 000 USD" | Art. 503 п.1, Einfuhr-USt gleicher Satz |

Der Dentons-Fall ist der gefaehrlichste: `gueltig_ab` steht auf 2025-12-12, also drei Wochen vor Inkrafttreten, und die Datei liest sich wie ein aktueller Laenderueberblick.

Der Rechner-Fall ist besonders zu beachten, weil der Rechercheplan die freien Rechner als **Testorakel** fuer die eigene Berechnung vorsieht, also als ausfuehrbare Gegenprobe. Fuer die Lohnabrechnung bleiben sie dafuer brauchbar, fuer die Mehrwertsteuer nicht. In `erfassungsplan.md` steht dieser Verwendungszweck bisher nicht, er kommt aus dem Plan.

Bei `alaics` ist nicht die Seite veraltet, sondern das Rechenbeispiel darin. Die Zollbroker-Preise daneben bleiben gueltig.

**Geprueft und entlastet:** PwC ("increased from 12% to 16%") und Kursiv ("повышена с 12% до 16%") nennen 12 Prozent korrekt als historischen Vorwert. Bei `unicaselaw` bezieht sich 12 Prozent auf Usbekistan. Die Treffer auf die alte Schwelle von 20.000 МРП stammen aus Art. 665 (Gerichtsgebuehren, unveraendert) oder aus bereits gekennzeichneten Dateien.

---

## Teil 3: Offene Konflikte, die der Primaertext jetzt entscheidet

### 3.1 K-03 Einkommensteuerstufen ist aufloesbar

Das Konfliktregister fuehrt drei angeblich widerspruechliche Angaben. Art. 363 zeigt, dass alle drei zutreffen und verschiedene Sachverhalte beschreiben. Der Artikel liegt jetzt vollstaendig im Korpus.

| пп. | Gegenstand | Schwelle | Satz |
|---|---|---|---|
| 1) | alle Einkuenfte ausser 2) bis 4), also auch Arbeitslohn | 8.500 МРП | 10 / 15 Prozent |
| 2) | private Praxis | -- | 9 Prozent |
| 3) | Dividenden | 230.000 МРП | 5 / 15 Prozent |
| 4) | ИП sowie **КХ/ФХ** im allgemeinen Regime | 230.000 МРП | 10 / 15 Prozent |

Dazu Art. 403: Grundfreibetrag 30 МРП.

Damit ist die Vermutung im Register bestaetigt: Fassung A ist пп.1, Fassung B ist пп.4, Fassung C beschreibt den Normalfall unterhalb der Schwelle. Das Register verlangte "eine Quelle, die Fassung A ausdruecklich als Lohnsteuer benennt". Der Kodex leistet das auf andere Art, naemlich als Auffangtatbestand: пп.1 gilt fuer alles, was nicht unter пп.2 bis 4 faellt, und Arbeitslohn faellt unter keine davon.

**Nebenbefund, der nirgends steht:** Art. 363 letzter Absatz gibt einem КХ/ФХ im allgemeinen Regime eine **Minderung der Einkommensteuer um 70 Prozent** auf Einkuenfte aus Erzeugung und Verarbeitung eigener Agrarprodukte. Bei 10 Prozent Tarif bleibt damit effektiv 3 Prozent.

### 3.2 K-01 und K-05: die Vorbehalte sind entfallen

Das Register vermerkt zu K-01, keine der beiden Artikelnummern sei "wegen technischer Abrufprobleme bei adilet.zan.kz direkt gegengelesen" worden. Zu K-05 fehlte als Luecke (a) die "direkte Verifikation der Artikel 455/456/495 auf adilet.zan.kz selbst".

Beides ist erledigt. Art. 728, 729, 730, 731 sowie 455, 456, 495 liegen im Wortlaut vom amtlichen Server vor, ebenso ГК РК Art. 865, 867, 871. Die Aussagen halten der Gegenlesung stand.

Luecke (b) von K-05 bleibt offen: Art. 456 nimmt den Kommissionsverkauf nur **aus dem Umsatz des Kommissionaers heraus**. Eine Vorschrift, die die Verguetung ausdruecklich als dessen Bemessungsgrundlage benennt, gibt es weiterhin nicht. Der Umkehrschluss bleibt ein Umkehrschluss.

---

## Teil 4: Was der Kodex sagt und noch kein Dokument festhaelt

### 4.1 Im Sonderregime entfaellt die Mehrwertsteuerpflicht ganz

Art. 731 п.1 пп.6: ein КХ/ФХ im Sonderregime ist **nicht Zahler der Mehrwertsteuer**, ausgenommen Einfuhr-USt und USt fuer Nichtresidenten. Ebenso entfallen Boden-, Fahrzeug-, Vermoegens- und Sozialsteuer sowie das Umweltentgelt.

`glossar-basis.md` stellt den Produkttextbaustein "Registrierungsschwelle 43,25 Mio. Tenge" als durch die Recherche gestuetzt dar. Rechnerisch stimmt das (10.000 МРП bei 4.325 Tenge). Fuer den Betrieb selbst ist die Schwelle aber **gegenstandslos**, solange er im Sonderregime bleibt. Sie greift erst fuer Geschaeftsteile ausserhalb des Regimes, also genau fuer das Zukaufmodul. `kernwissen/khfh-regime-rohbefund.md` hat das bereits richtig, der Glossartext nicht.

Die beiden Ausnahmen sind keine Formalie: **Einfuhr-USt und USt fuer Nichtresidenten bleiben bestehen**. Damit trifft die Reverse-Charge-Pflicht auf auslaendische Software auch einen Betrieb, der sonst von der Mehrwertsteuer befreit ist.

### 4.2 Sozialsteuer ist fuer ein КХ/ФХ kein Prozentsatz

Die allgemeine Darstellung nennt 6 Prozent Sozialsteuer. Art. 557 kennt fuer diesen Betriebstyp etwas anderes:

- п.2: 1,8 Prozent fuer Erzeugung und Verarbeitung eigener Agrarprodukte
- п.4: fuer **КХ/ФХ** ein fester МРП-Vielfachbetrag statt eines Prozentsatzes, naemlich 0,6 МРП fuer den Betriebsinhaber und 0,3 МРП je Beschaeftigtem

Bei einem МРП von 4.325 Tenge sind das 2.595 Tenge und 1.297,50 Tenge im Monat. Im Sonderregime entfaellt auch das noch (Art. 731 п.1 пп.4). Sechs Prozent trifft auf diesen Betrieb in keinem der beiden Regime zu.

### 4.3 Eine angekuendigte, aber nicht vollzogene Aenderung

`fachquellen/iris-kz-art484-status-rus.md` vom 2026-06-19 meldet, das Projektbuero unter dem stellvertretenden Premierminister habe beschlossen, die 80-Prozent-Kuerzung des Vorsteuerabzugs fuer Agrarexporteure zu streichen und die volle Erstattung wiederherzustellen.

Im am 2026-09-18 vom amtlichen Server geernteten Text steht die Norm **weiterhin**: Art. 484 п.5 letzter Absatz, Kuerzung um 80 Prozent fuer Agrarprodukte, die in nullbesteuertem Umsatz verwendet werden.

Angekuendigt ist nicht in Kraft. Der Fall gehoert als solcher gekennzeichnet, sonst antwortet der Assistent mit einer Pressemitteilung statt mit dem Gesetz.

**Verwechslungsgefahr:** es gibt zwei 80-Prozent-Regeln mit entgegengesetzter Richtung. Art. 490 gewaehrt 80 Prozent zusaetzlichen Vorsteuerabzug im Inlandsgeschaeft. Art. 484 п.5 kuerzt den Vorsteuerabzug um 80 Prozent im Exportgeschaeft.

---

## Teil 5: Buecher

### 5.1 Ein Titel steht auf der Kaufliste, den der Korpus entwertet

`buecher-kaufliste.md` empfiehlt in Stufe 1 "Налоговый учет ИП и СНР" von Proskurina fuer 3.100 Tenge mit der Begruendung "Sonderregime, also das Thema des Betriebs".

`buecherliste.md` sagt zum selben Titel: "**VOR 2026-KODEX**, Sonderregime-Regeln vermutlich stark veraendert - zwingend gegenpruefen". Die Kaufliste uebernimmt diese Warnung nicht.

Der Korpus zeigt jetzt, dass "stark veraendert" untertrieben ist. Das Sonderregime wurde nicht geaendert, sondern **ersetzt**: der einheitliche Bodensteuer ist abgeschafft, an seine Stelle treten Art. 728 bis 733 mit neuem Steuergegenstand (Art. 729), neuem Satz (Art. 730, 0,5 Prozent), neuer Befreiungsliste (Art. 731) und neuen Flaechenzonen (Art. 728 п.2: 5.000 / 3.500 / 1.500 / 500 ha). Ein Buch von vor 2026 beschreibt ein Regime, das es nicht mehr gibt.

**Empfehlung:** aus Stufe 1 herausnehmen, es sei denn, der Verlag weist eine Auflage von 2026 aus.

### 5.2 Beim Lohnbuch laesst sich die Veraltung jetzt beziffern

"Особенности начисления и удержания заработной платы" von Zagretdinova steht mit "VOR 2026-KODEX vermutet" auf der Kaufliste. Der Korpus sagt genau, was daran nicht mehr stimmt:

| Groesse | Vor 2026 | Ab 2026 | Fundstelle |
|---|---|---|---|
| Einkommensteuertarif | linear 10 Prozent | progressiv ab 8.500 МРП | Art. 363 пп.1 |
| Grundfreibetrag | 14 МЗП | 30 МРП | Art. 403 |
| ОПВР | 2,5 Prozent | 3,5 Prozent | ENPF, amtlich |
| Sozialsteuer minus Sozialabgaben | zulaessig | abgeschafft | Art. 558 |
| Sozialsteuer КХ/ФХ | 6 Prozent | 0,6 / 0,3 МРП | Art. 557 п.4 |

Damit ist **jede Zahl** in einem Lohnbuch von vor 2026 hinfaellig. Die Methode bleibt, das Zahlenwerk nicht. Der Titel ist trotzdem der einzige zur Lohnabrechnung, und die Lohnabrechnung ist die groesste Luecke im System. Kaufen, aber ausschliesslich als Verfahrensbeschreibung, nie als Satzquelle.

### 5.3 Unveraendert richtig

- Beide gedruckten Kodexausgaben bleiben ueberfluessig. Der Korpus haelt 848 Artikel je Sprachfassung vom amtlichen Server.
- Der Atameken-Kommentar von 2020 bleibt zu Recht auf "nicht kaufen". Er kommentiert den aufgehobenen Kodex.
- Die 1C-Titel: Kartamysova ist von 2016, bei Skoblikova ist das Jahr unbekannt. Die Steuerkonfiguration von 1C hat sich zum 2026-01-01 vollstaendig geaendert, und genau das kann kein Titel von vor 2026 enthalten.
- Nazhikbaeva 2015 zur Agrarbuchhaltung ist korrekt als einziger Agrartitel am Markt und als vor 2026 gekennzeichnet.
- Der Zollkodex der EAWU von 2026 ist **kein** Parallelfall zum Steuerkodex. Die 2026 ist ein Druckjahr, der Kodex gilt seit 2018 unveraendert fort. Anders als beim Steuerkodex liegt sein Volltext bei uns **nicht** im Korpus, der Kauf ist also nicht redundant.

---

## Teil 6: Was zu tun ist

| # | Massnahme | Datei |
|---|---|---|
| 1 | Abschnitt 5.1 berichtigen: 80 Prozent, Art. 490, КХ/ФХ eingeschlossen | `kernwissen/khfh-regime-rohbefund.md` |
| 2 | `ist_ueberholt: true` setzen | drei Korpusdateien aus Teil 2 |
| 3 | K-03 auf GEKLAERT, Vorbehalte bei K-01 und K-05 (a) streichen | `konfliktregister.md` |
| 4 | Hinweis, dass die Schwelle im Sonderregime gegenstandslos ist | `glossar-basis.md` |
| 5 | Proskurina-Titel aus Stufe 1 nehmen, Lohnbuch mit Tabelle 5.2 versehen | `buecher-kaufliste.md` |
| 6 | Art. 484 als angekuendigt-aber-geltend kennzeichnen | neuer Eintrag K-06 |
| 7 | Rechner nicht als USt-Orakel verwenden, sobald die Gegenprobe gebaut wird | offen, kein Dokument betroffen |

Die Punkte 1 bis 6 sind mit diesem Bericht ausgefuehrt. Punkt 7 ist ein Hinweis fuer spaeter, keine Textaenderung.

---

## Was dieser Bericht nicht leistet

Geprueft wurde auf **Widersprueche innerhalb des Korpus**. Eine Angabe, die alle unsere Quellen gleich falsch wiedergeben, faellt dabei nicht auf. Die 5.244 Primaerrechtsdateien wurden nicht Artikel fuer Artikel gelesen, sondern gezielt an den Stellen, an denen eine Sekundaerquelle oder ein eigenes Dokument eine Behauptung aufstellt.

Kein Befund dieses Berichts ist eine steuerliche Auskunft. Jede Zahl ist eine belegte Behauptung mit Fundstelle und Datum.
