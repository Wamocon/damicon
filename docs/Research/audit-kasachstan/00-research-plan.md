# Research-Plan: Audit in Kasachstan

Stand 18.09.2026 · Branch `dev/research-audit-kasachstan` · Version 0.3 (nach iq-eq-vq und qa-ultra)

## 1. Worum es geht

Wir wollen im Netz möglichst vollständig herausfinden, welche Prüfungen ein
Beerenbetrieb in Kasachstan durchlaufen muss oder freiwillig durchläuft, wer
prüft, auf welcher Rechtsgrundlage und mit welchen Unterlagen. Aus jeder
belegten Pflicht wird später eine Anforderung an Damicon (Datenfeld, Bericht,
Frist, Rolle, Export).

Die Research liefert die Grundlage für die Board-Karten `audit-01` bis
`audit-05` (Tag 1) und speist `audit-06` bis `audit-13` (Tag 2). Rechtsberatung
ersetzt sie nicht. Die fachliche Freigabe bleibt bei einem in Kasachstan
zugelassenen Prüfer oder Anwalt (`audit-17`).

## 2. Was „Audit“ in Kasachstan bedeutet

Das Wort deckt dort mindestens acht verschiedene Verfahren ab. Wer nur
„аудит Казахстан“ sucht, findet fast nur die Abschlussprüfung. Die Suche
läuft deshalb getrennt nach diesen Clustern:

| Nr. | Cluster | Russischer Suchkern | Rechtsrahmen (zu verifizieren) | Board |
|---|---|---|---|---|
| C1 | Abschlussprüfung (Pflicht und freiwillig) | обязательный аудит, аудиторская организация | Gesetz 304-I Art. 5 Abs. 2 (am 18.09.2026 gelesen; Änderungen durch 256-VIII, sechs Monate nach Veröffentlichung) | audit-01, audit-02 |
| C2 | Rechnungslegung, Aufbewahrung, Depositarium | срок хранения первичных документов, депозитарий финансовой отчетности | Gesetz 234-III (Art. 19 Abs. 7), Regeln V2200026686; P1100001173 ist seit 16.02.2022 aufgehoben | audit-06 |
| C3 | Steuerprüfung und Standard-Prüfdatei | налоговая проверка, стандартный файл проверки | Steuerkodex 214-VIII, Erlass Nr. 567 vom 03.10.2025 | audit-03, audit-10 |
| C4 | Staatliche Kontrolle (Lebensmittel, Sanepid, Phyto, Arbeit, Umwelt) | проверочный лист, критерии оценки степени риска, профилактический контроль | Unternehmerkodex, Risikokriterien je Behörde (z. B. V2200030964) | audit-03, audit-05, audit-11 |
| C5 | Staatliche Finanzkontrolle bei Fördermitteln | государственный аудит, субсидии АПК проверка, Высшая аудиторская палата, встречные обязательства | Gesetz 392-V, Förderregeln des Agrarministeriums, Kontrolle durch die Akimate | audit-03 (Förderstelle) |
| C6 | Zertifizierungsaudits | GLOBALG.A.P. Казахстан, ХАССП, ISO 22000 | IFA v6, TR TS 021/2011 Art. 10 | audit-04, audit-05, audit-13 |
| C7 | Interne Revision und Prüfpfad der Software | внутренний аудит, электронный документ, исправление первичных документов | Musterordnung V1500012544, Buchführungsregeln V1500010954 (Erlass 241, geändert 30.03.2026), Digitaler Kodex 255-VIII | audit-07, audit-10, audit-12, audit-15 |
| C8 | Zollprüfung bei Export und Zukauf aus dem Ausland | таможенная проверка после выпуска товаров, уполномоченный экономический оператор | Zollkodex der EAWU Kap. 45, Kodex 123-VI Kap. 47 (Art. 416) | audit-03, tax-06 |

Jede Rechtsgrundlage in der Tabelle gilt als Hypothese, bis sie am Primärtext
bestätigt ist.

## 3. Forschungsfragen

Die Rechtsform des Kundenbetriebs (TOO, KH oder IP) ist noch offen und wird
erst mit `tax-01` geklärt. Bis dahin beantwortet die Research jede
formabhängige Frage (F1, F2, F3, F6) für alle drei Formen.

Jede Frage hat eine Kennung, ein Cluster und ein Abnahmekriterium. Eine Frage
gilt erst als beantwortet, wenn das Kriterium erfüllt ist.

| ID | Cluster | Frage | Erledigt, wenn |
|---|---|---|---|
| F1 | C1 | Ab welchen Schwellen (Rechtsform, Beschäftigte, Einkommen in MRP, Gesellschafter) ist eine Abschlussprüfung Pflicht, und fällt ein Beerenbetrieb (TOO, KH oder IP) darunter? | Artikel und Wortlaut aus 304-I in der Fassung vom 28.03.2026 oder später, dazu die Größenklassen aus dem Unternehmerkodex |
| F2 | C2 | Ist der Betrieb eine Organisation öffentlichen Interesses und muss damit beim Depositarium einreichen? | Kriterien für „организация публичного интереса“ aus 234-III gelesen und für TOO, KH und IP beantwortet. Vorbefund: Nach Art. 19 Abs. 7 gilt die Pflicht nur für solche Organisationen; die Lesart „alle Organisationen“ stammt aus der aufgehobenen Verordnung P1100001173 |
| F3 | C2 | Welche Aufbewahrungsfristen gelten für Primärbelege, Lohnunterlagen, Steuerbelege und elektronische Dokumente? | Je Belegart Frist, Artikel und Beginn der Frist |
| F4 | C3 | Wie läuft eine Steuerprüfung ab 2026 (Arten, Auslöser, Fristen, Standard-Prüfdatei), und welche Daten verlangt die KGD in welchem Format? | Erlass 567 gelesen, Pflicht oder freiwillig geklärt, Datenfelder der Prüfdatei als Liste |
| F5 | C4 | Welche Behörden prüfen einen Beerenbetrieb, nach welchen Risikokriterien und mit welchen Prüflisten? Wie steht es 2026 um das Prüfungsmoratorium? | Für jede Behörde: Rechtsgrundlage der Prüfliste (adilet-Nummer), Prüfpunkte, Bußgeldrahmen |
| F6 | C5 | Welche Prüfungen gibt es für die Empfänger von Agrarsubventionen? | Prüfende Stelle, Rechtsgrundlage, verlangte Nachweise |
| F7 | C6 | Welche Aufzeichnungen verlangen GLOBALG.A.P. IFA v6 und eine eventuelle HACCP-Pflicht? Gibt es zertifizierte Beerenerzeuger in Kasachstan und Zertifizierungsstellen vor Ort? | Pflichtenliste mit Kontrollpunkt-Nummern und eine Liste der Zertifizierungsstellen |
| F8 | C7 | Wie werden elektronische Primärbelege rechtssicher korrigiert, signiert (EDS) und aufbewahrt? | Erlass 241 und Digitaler Kodex, betroffene Artikel im Wortlaut |
| F9 | C7 | Was erwarten Prüfer in Kasachstan vom Prüfpfad einer Software (Unveränderlichkeit, Protokoll, Export)? | Mindestens eine Primärquelle oder die Stellungnahme eines Berufsverbands, sonst als Lücke für `audit-17` markiert |
| F10 | alle | Welche Änderungen sind 2026/2027 in Arbeit (Gesetzentwürfe, neue Prüflisten)? | Suche auf legalacts.egov.kz zu jedem Cluster, Fundstellen mit Status |
| F11 | C8 | Welche Zollprüfungen drohen beim Export der Beeren und beim Zukauf aus dem Ausland, und welche Unterlagen verlangt die KGD dafür? | Kapitel 47 des Kodex 123-VI gelesen, Prüfarten, Fristen und Unterlagen als Liste |

## 4. Quellen nach Rang

Eine Aussage über geltendes Recht stützt sich immer auf Rang 1. Die übrigen
Ränge helfen beim Finden, Einordnen und Gegenprüfen.

**Rang 1: Primärquellen**
- adilet.zan.kz (amtliche Rechtsdatenbank, Justizministerium). Nur mit
  JavaScript lesbar, WebFetch liefert eine leere Seite (am 18.09.2026 geprüft).
- Die kasachische Fassung auf adilet (`/kaz/docs/…`) ist rechtlich
  gleichrangig und wird bei Übersetzungszweifeln gelesen. Die englischen
  Fassungen (`/eng/docs/…`) sind nicht verbindlich und dienen nur als
  Lesehilfe.
- legalacts.egov.kz (Entwürfe und öffentliche Anhörung) für F10.
- Behördenseiten: kgd.gov.kz (Steuerprüfungen, Standard-Prüfdatei, Formulare
  2026), minfin.gov.kz (Aufsicht über Prüfer, Lizenzregister),
  gov.kz-Seiten der Komitees für Lebensmittelsicherheit, Sanepid und
  Arbeitsinspektion.
- Prüfungsregister: rsp.gov.kz/ru/plan und egov.kz („Списки и графики проверок
  бизнеса“). Auf rsp.gov.kz liegt außerdem das „Реестр обязательных требований в
  сфере предпринимательства“, ein amtliches Verzeichnis der Pflichten für
  Unternehmen. Es ist die beste Einzelquelle für F5 und wird in Phase 1
  zuerst ausgewertet.
- Die Prüfkarte ERSOP (infopublic.pravstat.kz/ersop) war am 18.09.2026 zweimal
  nicht erreichbar. Sie bleibt ein Versuch in Phase 3, der Plan hängt nicht an
  ihr.
- Die eigene Suche von adilet (adilet.zan.kz/search) findet Rechtsakte nach
  Titel, Nummer und Stichwort. Sie ist die zweite Suchmaschine neben
  WebSearch.
- Standardsetzer: globalgap.org (IFA v6, Datenbank zertifizierter Erzeuger),
  EAWU-Seite eec.eaeunion.org (TR TS 021/2011, 022/2011).

**Rang 2: Fachliche Auswertung**
- Internationale Länderberichte: IFAC-Mitgliedsprofil Kasachstan, Weltbank
  CFRR-Bericht zur Prüferaufsicht (2020), ICAEW-Länderseite.
- Berufsverbände: Палата аудиторов РК (IFAC-Mitglied), Палата
  профессиональных бухгалтеров.
- Mandantenbriefe von Big Four (PwC, KPMG Caspian, EY, Deloitte Kazakhstan)
  und Kanzleien (GRATA, Dentons, Kinstellar, Unicase).
- Fachportale mit Gesetzesspiegel: uchet.kz und zakon.uchet.kz, mybuh.kz und
  zakon.mybuh.kz, cdb.kz, online.zakon.kz und prg.kz (Параграф, teils
  kostenpflichtig).

**Rang 3: Presse und Foren**
- inform.kz, zakon.kz, kapital.kz, kursiv.media, tengrinews.kz.
- Frage-Antwort-Bereiche auf uchet.kz und buh.mcfr.kz. Nur zum Finden von
  Themen und Suchwörtern, nie als Beleg.

Spiegelseiten (Rang 2) sind oft schneller lesbar als adilet, können aber eine
ältere Fassung zeigen. Jeder Wortlaut aus einem Spiegel wird deshalb mit dem
Fassungsstand auf adilet verglichen, bevor er in das Belegregister geht.

## 5. Suchstrategie

**Sprachen.** Russisch zuerst (Rechtssprache und Fachpresse), Kasachisch für
Gesetzestitel und amtliche Seiten, Englisch für internationale Berichte und
Kanzleibriefe. Suchbegriffe je Cluster in allen drei Sprachen, zum Beispiel:

| Cluster | Russisch | Kasachisch | Englisch |
|---|---|---|---|
| C1 | обязательный аудит субъекты среднего предпринимательства | міндетті аудит | Kazakhstan mandatory audit threshold |
| C3 | стандартный файл проверки 2026 | салықтық тексеру | Kazakhstan tax audit SAF-T 2026 |
| C4 | проверочный лист сельхозпроизводитель | тексеру парағы | Kazakhstan inspection checklist agriculture |
| C6 | GLOBALG.A.P. сертификация ягоды Казахстан | – | GLOBALG.A.P. certified producers Kazakhstan |

Die vollständige Wortliste entsteht in Phase 1 und liegt als
`01-suchbegriffe.md` im selben Ordner.

**Suchtechnik.**
- Domänenfilter: `site:adilet.zan.kz`, `site:kgd.gov.kz`, `site:gov.kz`,
  `site:legalacts.egov.kz`.
- Dateityp: `filetype:pdf` für Berichte, Präsentationen und Prüflisten.
- Stolperwörter der Rechtssprache als Anker: „с изменениями и дополнениями по
  состоянию на“, „вводится в действие“, „утратил силу“. Damit findet man die
  aktuelle Fassung und aufgehobene Texte.
- Schneeball: Auf adilet die Reiter „Информация“ und „История изменений“
  auswerten (einen Reiter „Связи документа“ gibt es nicht, am 18.09.2026 geprüft). Jeder Verweis auf eine Verordnung oder Prüfliste
  wird zu einer neuen Suche.
- Rückwärtssuche: Aus Fachartikeln (Rang 2) nur die zitierten Artikelnummern
  und adilet-Kennungen übernehmen, dann am Primärtext lesen.

**Werkzeuge.**
- WebSearch für die Breite. Läuft parallel in mehreren Agenten. Achtung:
  WebSearch nutzt nur einen US-Suchindex. Gegenmittel ist der Domänenfilter
  (`allowed_domains`): Je Cluster laufen die Suchbegriffe einmal offen und
  einmal beschränkt auf adilet.zan.kz, gov.kz, kgd.gov.kz, egov.kz und
  legalacts.egov.kz. Im Test am 18.09.2026 lieferte der Filter allein für den
  Pflanzenschutz neun passende Prüflisten und Risikokriterien. Dazu kommt die
  Suche von adilet.
- yandex.kz, google.kz, Bing und DuckDuckGo sind im automatisierten Browser
  nicht nutzbar (am 18.09.2026 geprüft: Captcha bei yandex und google, jeweils
  zweimal; Bot-Abfrage bei DuckDuckGo; Bing lieferte fremde Ergebnisse).
- WebFetch für Seiten ohne JavaScript (Spiegelseiten, kgd.gov.kz, PDFs).
- gstack `/browse` für adilet und andere JavaScript-Seiten. Nur einer zur
  Zeit, weil der Browser ein geteilter Dienst ist; parallele Agenten nutzen ihn
  nicht.
- Keine Logins, keine kostenpflichtigen Zugänge, keine Umgehung von
  Bezahlschranken. Was nur hinter Paragraph oder Continent liegt, wird als
  Lücke vermerkt.

## 6. Ablauf

| Phase | Inhalt | Ergebnis | Zeitrahmen |
|---|---|---|---|
| 0 | Plan prüfen (iq-eq-vq, qa-ultra), Fragen schärfen | Plan Version 1.0 | 1 h |
| 1 | Suchbegriffe und Quellenkarte je Cluster, erste Breitensuche | `01-suchbegriffe.md`, `02-quellenkarte.md` | 2 h |
| 2 | Tiefensuche je Cluster, parallel in bis zu vier Agenten (nur WebSearch und WebFetch) | Rohfunde je Cluster mit URL und Fundzitat | 4 h |
| 3 | Primärtexte auf adilet lesen, nacheinander mit `/browse` (nach dem Laden auf `wait --networkidle` warten, sonst ist die Seite leer); Reihenfolge nach Board-Relevanz (F1, F4, F5, F11 zuerst); dazu Suchen über adilet.zan.kz/search | Wortlaut und Fassungsstand für jede Rechtsaussage | 4 h |
| 4 | Belegregister zusammenführen, Widersprüche auflösen, Lücken markieren | `03-belegregister.json`, `04-luecken-und-fragen.md` | 2 h |
| 5 | Ergebnis je Board-Karte, Gegenprüfung durch einen zweiten Agenten | Steckbriefe für audit-01 bis audit-05, Fragenliste für audit-17 | 2 h |

Zusammen 15 Stunden, davon 11 Stunden nacheinander (Phasen 0, 1, 3, 4, 5).
Das sind anderthalb Arbeitstage und passt nicht in Tag 1 allein. Tag 1 schafft
die Phasen 0 bis 2 und den Anfang von 3 (F1, F2, F4). Der Rest läuft am
Vormittag von Tag 2 und damit vor den Konzeptkarten `audit-06` ff.

Engpass ist Phase 3: geschätzt 25 bis 35 Primärtexte zu je etwa 6 Minuten.
Reicht die Zeit nicht, werden die Texte mit der geringsten Board-Relevanz als
Lücke vermerkt statt überflogen.

```
Phase 1–2  Breite, parallel        [C1+C2][C3+C8][C4+C5][C6+C7]
                                          \        |        |        /
Phase 3    adilet lesen + adilet-Suche, nacheinander ──►  ein Browser, eine Liste
                                                     |
Phase 4–5  Register, Widersprüche, Gegenprüfung ──►  Steckbriefe · Fragen an den Prüfer
```

**Kennzahlen für „möglichst viel“.** Am Ende steht im Register:
- Abdeckung: Anteil der Fragen F1 bis F11 mit mindestens einem `primaer`-Beleg
  (Ziel: mindestens 9 von 11, der Rest als begründete Lücke).
- Belegqualität: Anteil `primaer` an allen Einträgen (Ziel: mindestens 70 %).
- Breite: Zahl der Rang-1-Quellen je Cluster (Ziel: mindestens 3, bei C4
  mindestens eine Prüfliste je prüfender Behörde).
- Suchquellen-Abgleich: Zahl der Rang-1-Quellen, die nur die adilet-Suche
  fand und WebSearch nicht. Ist sie größer als null, wird der Cluster mit
  weiteren Begriffen nachgesucht.

**Wann eine Suche beendet ist.** Ein Cluster gilt als gesättigt, wenn drei
aufeinanderfolgende Suchrunden in zwei Sprachen keine neue Rang-1-Quelle und
keine neue Pflicht ergeben. Jede Frage aus Abschnitt 3 ist dann entweder
belegt oder ausdrücklich als Lücke mit Grund vermerkt.

## 7. Ausgaben je Empfänger

| Empfänger | Braucht | Form |
|---|---|---|
| Team und Board | nachprüfbare Belege | `03-belegregister.json`, Steckbriefe je Karte |
| Geschäftsführung des Kunden | Was muss ich, bis wann, was kostet es | Jede Pflicht eingestuft als **Pflicht**, **Empfehlung** oder **unklar**, mit Frist und Aufwand; eine Seite |
| Prüfer oder Anwalt vor Ort (`audit-17`) | präzise, schnell beantwortbare Fragen | `05-fragen-pruefer.ru.md` auf Russisch, je Frage Artikelverweis und unsere vorläufige Lesart |

## 8. Belegregister

Jede Aussage kommt als eigener Eintrag in `03-belegregister.json`:

```json
{
  "id": "B-C1-004",
  "frage": "F1",
  "aussage": "Kurz und prüfbar formuliert, auf Deutsch",
  "quelle_url": "https://adilet.zan.kz/rus/docs/Z980000304_",
  "rang": 1,
  "dokument": "Закон РК 304-I Об аудиторской деятельности",
  "fundstelle": "Art. 5 Abs. 2",
  "fassung_stand": "2026-03-28",
  "wortlaut_original": "wörtliches Zitat auf Russisch",
  "uebersetzung": "deutsche Arbeitsübersetzung",
  "abgerufen_am": "2026-09-18",
  "verifiziert": "primaer | nur_sekundaer | widerspruch | offen",
  "gegenquelle": "URL einer zweiten Quelle, falls vorhanden",
  "board_karte": "audit-02",
  "einstufung": "pflicht | empfehlung | unklar",
  "rechtsform": "alle | TOO | KH | IP",
  "damicon_folge": "Welches Feld, welcher Bericht, welche Frist"
}
```

**Regeln.**
1. Artikelnummern und Fristen stehen nur mit Wortlaut aus Rang 1 im Register.
   Ohne Wortlaut bleibt der Eintrag auf `nur_sekundaer`.
2. Vor jedem Eintrag wird geprüft, ob die Norm noch gilt (Hinweis „Утратил
   силу“ auf adilet). Aufgehobene Normen stehen nur als Vermerk im Register.
3. Widersprechen sich zwei Quellen, zählt der Primärtext in der jüngsten
   Fassung. Der Widerspruch bleibt als Vermerk stehen.
4. Keine Artikelnummer aus dem Gedächtnis eines Sprachmodells. Frühere
   Recherchen haben hier falsche Nummern erzeugt.
5. Abrufdatum und Fassungsstand sind Pflichtfelder, weil sich viele Normen
   2026 geändert haben (Steuerkodex, Digitaler Kodex, 304-I).

## 9. Qualitätssicherung

- Stichprobe: Ein zweiter Agent prüft 20 % der Einträge mit `primaer`
  unabhängig am Primärtext, mindestens aber alle Einträge zu F1, F2 und F4.
- Gegenprobe in einer zweiten Sprache für jede Pflicht, die für Damicon ein
  Datenfeld oder eine Frist auslöst.
- Vollständigkeitsprüfung gegen die Board-Karten `audit-01` bis `audit-18`:
  Jede Karte hat mindestens einen Registereintrag oder eine begründete Lücke.
- Abschluss mit `/qa-ultra` auf das Register, bevor Ergebnisse auf die Karten
  gehen.

## 10. Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Suchindex von WebSearch nur US, kasachische Quellen fehlen | Domänenfilter und adilet-Suche (Abschnitt 5), Kennzahl Suchquellen-Abgleich; yandex und google sind im Browser gesperrt |
| Rechtsform des Betriebs unbekannt | alle drei Formen beantworten, Feld `rechtsform` im Register |
| Zitierte Norm ist aufgehoben (Beispiel P1100001173) | Status auf adilet („Утратил силу“) vor jedem Registereintrag prüfen |
| adilet nur mit JavaScript lesbar, zeitweise langsam oder gesperrt | Spiegelseiten nutzen, Fassungsstand dort gegenprüfen, adilet-Lesen bündeln |
| Veraltete Fassungen auf Spiegelseiten | Fassungsstand ist Pflichtfeld, Abgleich mit adilet |
| Frei erfundene oder falsche Artikelnummern | Regel 4 in Abschnitt 8, Stichprobe durch zweiten Agenten |
| Parallele Agenten blockieren den Browser | `/browse` nur in Phase 3 und nur nacheinander |
| Wichtiges nur hinter Bezahlschranke | als Lücke vermerken, Frage an den Prüfer vor Ort |
| Recht ändert sich während des Sprints | legalacts.egov.kz in Phase 4 erneut prüfen |
| Kundendaten in der Research | Die Research nutzt nur öffentliche Quellen; der Kundensteckbrief zu `audit-02` bleibt lokal in `Damicon-Sensible-Daten` |

## 11. Ablage

Alles liegt in `docs/Research/audit-kasachstan/` auf diesem Branch. Vor einem
Push wird geprüft, dass keine Kundendaten und keine fremden Volltexte (PDFs
von Normen und Standards) im Commit sind.

## 12. Erste Belege aus der Planung (18.09.2026)

Aus der qa-ultra-Prüfung, am Primärtext gelesen:
- 304-I Art. 5 Abs. 2: Eine TOO ist prüfpflichtig, wenn beide Bedingungen
  zutreffen: Gesellschafter mit weniger als 10 % Anteil **und** mehr als 250
  Beschäftigte im Jahresmittel und/oder mehr als 3 Mio. MRP Jahreseinkommen.
  Bei einer TOO des Mittelstands kann ein solcher Gesellschafter die Prüfung
  verlangen. Art. 6 ist seit 2023 gestrichen. Die kasachische und die
  englische Fassung liegen auf adilet vor.
- 234-III Art. 19 Abs. 7: Depositarium nur für Organisationen öffentlichen
  Interesses. P1100001173 ist seit 16.02.2022 aufgehoben.
- V1500010954 (Buchführungsregeln) wurde am 30.03.2026 geändert (Erlass 206),
  V2200030964 (Sanepid-Prüflisten) am 24.04.2026.

Aus der Planung:

- adilet liefert ohne JavaScript keinen Text; WebFetch auf
  `adilet.zan.kz/rus/docs/Z980000304_` ergab nur den Seitenkopf.
- 304-I: Fassung „по состоянию на 28.03.2026“ bei prg.kz; Gesetz 256-VIII vom
  09.01.2026; laut Fußnote im Primärtext tritt es sechs Monate nach
  Veröffentlichung in Kraft (11.07.2026 laut Suchergebnis).
- Standard-Prüfdatei: Erlass Nr. 567 vom 03.10.2025, ab 01.01.2026 freiwillig,
  Formate xml und xlsx (uchet.kz, zakon.mybuh.kz). Die Board-Karte `audit-10`
  nennt „10 Kalendertage“; das ist noch nicht belegt.
- Depositarium: Sekundärquellen widersprachen sich. Am Primärtext aufgelöst,
  siehe oben und F2.
- Prüfungsregister auf rsp.gov.kz/ru/plan erreichbar; die Prüfkarte ERSOP
  (infopublic.pravstat.kz/ersop) war zweimal nicht erreichbar.
- Risikokriterien und Prüflisten liegen als eigene Erlasse auf adilet, etwa
  V2200030964 (Sanepid, geändert im April 2026).
