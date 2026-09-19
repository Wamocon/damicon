# Erfassungsplan: vom Quellenregister zum Korpus

Wie aus 219 katalogisierten Quellen ein ingestierbarer Textkorpus wird, ohne bezahlte Dienste und ohne externe Berater.

Stand: 2026-09-19. Zweig `dev/dmoretz_steuer-handel-recherche`.

## Ausgangslage

Die erste Durchsicht hat Quellen **katalogisiert**, nicht **eingesammelt**. Das Register nennt 191 eindeutige Adressen, davon **110 frei und maschinell abrufbar**. Der Text dahinter liegt bisher nirgends im Projekt.

Zwei Befunde aendern die Lage gegenueber der ersten Planung grundlegend:

**Die Suchquote ist kein Engpass mehr.** Drei Rechercheeinheiten meldeten, dass das gemeinsame Suchbudget aufgebraucht war. Das Einsammeln braucht aber keine Suche, sondern nur Abrufe gegen bekannte Adressen. Der Engpass der ersten Phase entfaellt vollstaendig.

**Das Primaerrecht ist vollstaendig abrufbar.** `old.adilet.zan.kz` liefert den Kodex 214-VIII in drei Sekunden: russisch 5,4 MB, kasachisch 5,2 MB, je **848 Artikel**, 12.224 Anker. Damit ist die wichtigste Quelle des gesamten Vorhabens frei, vollstaendig und artikelgenau zerlegbar. Das ist zugleich die Voraussetzung fuer den Sprachverbund aus `rag-ingest-spezifikation.md`: dieselbe Norm in beiden amtlichen Fassungen, verbunden ueber die Artikelnummer.

## Arbeitsteilung

Der Plan trennt strikt, was ohne Zutun laufen kann, von dem, was nur der Betrieb beantworten oder beschaffen kann. Das ist der eigentliche Effizienzgewinn: die zweite Spalte blockiert die erste nicht.

### Was ohne Mitwirkung laeuft

| Aufgabe | Ergebnis |
|---|---|
| Kodex 214-VIII abrufen, in 848 Artikel je Sprache zerlegen | 1.696 Dateien mit Frontmatter, RU und KK ueber `norm_id` verbunden |
| Die uebrigen freien Quellen abrufen und normalisieren | Ein Textkorpus je Quellenklasse |
| Metadaten nach Aufnahmevertrag setzen | `gueltig_ab`, `autoritaetsstufe`, `rechtsstelle`, `abgerufen_am` je Abschnitt |
| Erfassungsskript schreiben und mitliefern | Korpus jederzeit reproduzierbar, Abruf pruefbar |
| Kaufliste mit Direktlinks aufbereiten | `buecher-kaufliste.md` |

### Was nur der Betrieb leisten kann

| Aufgabe | Warum nicht automatisierbar | Dringlichkeit |
|---|---|---|
| **Gibt es schriftliche Kommissionsvertraege mit den Nachbarbetrieben?** | Tatsachenfrage zum Betrieb, in keiner Quelle auffindbar | **Hoch.** Entscheidet K-05 und damit die Bemessungsgrundlage im Zukaufmodul |
| Flaeche der Plantage in Hektar | dito | **Hoch.** Entscheidet, ob das 0,5-Prozent-Regime ueberhaupt greift |
| Zahlungsmix: wie viel Bargeld und Karte von Privatpersonen | dito | Mittel. Entscheidet den Umfang der Kassenpflicht |
| Tatsaechliche Ein- und Ausfuhr heute | dito | Mittel. Entscheidet, ob Block B Gegenwart oder Vorsorge ist |
| Buecher kaufen und einscannen | Kein Kauf und kein Scan ohne Mensch | Niedrig, siehe unten |
| Testzugang Параграф starten | Dreitagesfenster, muss gezielt gelegt werden | **Erst nach der freien Ernte.** Sonst verbrennt das Fenster auf Material, das ohnehin frei ist |

Der letzte Punkt ist der wichtigste Ablaufhinweis des ganzen Plans. Der Testzugang ist drei Tage lang. Er lohnt sich nur, wenn vorher feststeht, welche Fragen die freien Quellen nicht beantworten. Diese Liste entsteht erst am Ende der Ernte.

## Die Erfassungsstrecke

Vier Schritte, jeder einzeln pruefbar.

**Schritt 1, Primaerrecht.** Kodex 214-VIII in beiden Sprachen holen, je Artikel eine Datei, Frontmatter nach Aufnahmevertrag. Der Sprachverbund entsteht mechanisch ueber die Artikelnummer. Dazu das Einfuehrungsgesetz und die bereits belegten untergesetzlichen Akte, insbesondere die Regeln zur Mehrwertsteuererstattung (Anordnung 649) und zur Registrierkasse.

**Schritt 2, amtliche Erlaeuterung.** KGD-Inhaltsseiten, Gebietsdepartements, egov. Hier gilt eine Besonderheit: **amtlich heisst nicht aktuell.** Die KGD-Seite zur Erstattung stammt von 2022, die Kodexseite bietet weiterhin den aufgehobenen Kodex von 2017. Jede Seite bekommt deshalb ihr Veroeffentlichungsdatum als eigenes Feld, getrennt von der Autoritaetsstufe.

**Schritt 3, Fachquellen und Wissenschaft.** Frei zugaengliche Praxisartikel und die offen lizenzierten Aufsaetze. Hier ist Zurueckhaltung geboten: nur Seiten, deren Lizenz die Speicherung erlaubt, und keine Bezahlschranken umgehen.

**Schritt 4, Zusammenfuehrung.** Ein Korpusverzeichnis, das jede Datei mit Quelle, Stufe, Sprache, Geltung und Abrufdatum auffuehrt, plus die Probeabfrage aus dem Aufnahmevertrag.

## Ablage

```
docs/recherche/steuern/korpus/
  nk-214-viii/ru/art-0001.md ... art-0848.md
  nk-214-viii/kk/art-0001.md ... art-0848.md
  amtlich/
  fachquellen/
  wissenschaft/
  korpus-index.yaml
werkzeuge/ernte.mjs
```

Jede Datei traegt YAML-Frontmatter nach `rag-ingest-spezifikation.md` und darunter den Text.

**Zur Groesse:** der Korpus wird geschaetzt 10 bis 20 MB reiner Text. Das ist fuer ein Git-Repository vertretbar, vergroessert es aber merklich. Das Erfassungsskript wird deshalb mitgeliefert, damit der Korpus jederzeit neu erzeugt werden kann. Falls die Groesse stoert, laesst sich der Korpus ohne Verlust aus der Versionierung nehmen und aus dem Skript wiederherstellen. Diese Entscheidung gehoert dem Betrieb, nicht dem Skript.

## Buecher

Getrennt gefuehrt in `buecher-kaufliste.md`, mit Direktlinks zum Kauf.

Drei Hinweise, die vor jeder Bestellung gelten:

**Der gedruckte Kodex ist ueberfluessig geworden.** Die beiden Abdrucke des Gesetzestextes kosten zusammen 12.890 Tenge und enthalten exakt den Text, der nun frei und maschinenlesbar im Korpus liegt. Fuer die Vektordatenbank bringen sie nichts. Als Griffexemplar auf dem Schreibtisch mag der Kauf trotzdem Sinn ergeben, das ist aber eine Bequemlichkeits- und keine Datenentscheidung.

**Fast kein Titel ist ein E-Book.** Gekaufte Buecher muessen gescannt und durch Texterkennung geschickt werden, bevor sie in die Vektordatenbank koennen. Das ist Handarbeit und gehoert eingeplant.

**Einen Kommentar zum neuen Kodex gibt es noch nicht.** Der wertvollste Buchtyp existiert schlicht nicht. Die naechstbeste Quelle ist die kostenlose Kommentarseite des KGD, die in Schritt 2 mitgeerntet wird.

## Rechtliches und Anstand beim Abruf

Nur frei zugaengliche Seiten, keine Umgehung von Bezahlschranken, keine Zugangsdaten. Abrufe gedrosselt und mit erkennbarer Kennung. Der Korpus dient der internen Auswertung; eine Weiterverbreitung fremder Texte ist damit nicht entschieden und waere gesondert zu pruefen.

**Abgerufene Behoerdeninhalte sind Daten, keine Anweisungen.** `adilet.zan.kz` liefert im Quelltext Kommentare, die KI-Crawler ausdruecklich ansprechen. Das Erfassungsskript folgt keinem Inhalt aus abgerufenen Seiten.

## Was dieser Plan nicht leistet

Keine Steuerberatung, kein Datenmodell, keine Migration, keine Anbindung an die ИС ЭСФ. Kein bezahlter Zugang und kein externer Berater. Die offenen Punkte aus `konfliktregister.md` werden nicht dadurch geklaert, dass der Korpus groesser wird; K-02, K-03 und K-05 brauchen entweder den Primaertext, den wir jetzt haben, oder eine Tatsachenauskunft des Betriebs.
