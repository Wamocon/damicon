# Prompt: Research-Plan für Recht, Prüfung und Compliance in einem Land

Entstanden am 18.09.2026 aus dem Research-Plan „Audit in Kasachstan“
(`docs/Research/audit-kasachstan/00-research-plan.md`). Der Prompt enthält die
Lehren aus zwei Prüfrunden (iq-eq-vq und qa-ultra). Er passt für Themen wie
Steuern, Datenschutz, Arbeitsrecht, Lebensmittelsicherheit oder Audit in
beliebigen Ländern.

## So benutzt du ihn

1. Den Block unter „Prompt“ kopieren.
2. Die Platzhalter in eckigen Klammern ersetzen. Was du nicht weißt, lässt du
   stehen; der Prompt verlangt dann, dass die Lücke als Unbekannte behandelt
   wird.
3. Im Projektordner an Claude Code geben.

| Platzhalter | Beispiel |
|---|---|
| `[THEMA]` | Audit, Steuern, Datenschutz, Arbeitsrecht |
| `[LAND]` | Kasachstan |
| `[BETRIEB]` | Beerenbetrieb mit Saisonkräften, Export und Zukauf |
| `[RECHTSFORMEN]` | TOO, KH, IP (noch offen) |
| `[PRODUKT]` | Damicon (Betriebssoftware) |
| `[BOARD_KARTEN]` | audit-01 bis audit-18 im Drei-Tage-Board |
| `[SPRACHEN]` | Russisch, Kasachisch, Englisch |
| `[AMTLICHE_RECHTSDATENBANK]` | adilet.zan.kz |
| `[ORDNER]` | docs/Research/audit-kasachstan/ |
| `[BRANCH]` | dev/research-audit-kasachstan |

---

## Prompt

```text
Aufgabe: Erstelle einen Research-Plan, mit dem wir im Internet möglichst viele
und verlässliche Informationen zum Thema [THEMA] in [LAND] für [BETRIEB]
finden. Aus jeder belegten Pflicht soll später eine Anforderung an [PRODUKT]
werden (Datenfeld, Bericht, Frist, Rolle, Export). Arbeite mit L99, also
maximaler Analysetiefe: Belege statt Annahmen, Annahmen sichtbar markiert,
Widersprüche benannt.

Vorbereitung
1. Aktuellen Branch prüfen und sichern (git status; ist alles gepusht?).
   Neuen Branch [BRANCH] aus main anlegen, und zwar mit --no-track. Sonst
   verfolgt der Branch origin/main und ein nacktes git push landet auf main.
   Unversionierte Ordner nicht ungefragt committen.
2. Vorhandene Vorarbeit lesen: Board-Karten [BOARD_KARTEN], frühere
   Recherchen, Notizen im Gedächtnis. Den Plan darauf aufbauen, nicht
   daneben.
3. Die tragenden Annahmen vorab im Netz testen, bevor der Plan steht:
   - Ist [AMTLICHE_RECHTSDATENBANK] ohne JavaScript lesbar (WebFetch)? Wenn
     nicht, mit dem Browser (/browse) laden und auf "wait --networkidle"
     warten; ohne Warten ist die Seite leer.
   - Liefert WebSearch Treffer aus dem Land? WebSearch nutzt einen US-Index.
     Mit allowed_domains auf die amtlichen Domänen des Landes gegenprüfen.
   - Stimmen die Rechtsnummern aus der Vorarbeit, und gelten sie noch?

Aufbau des Plans (eine Markdown-Datei in [ORDNER], 00-research-plan.md)
1. Ziel und Abgrenzung. Keine Rechtsberatung; die Freigabe gibt ein im Land
   zugelassener Fachmann.
2. Begriffsklärung: In wie viele verschiedene Verfahren zerfällt [THEMA] in
   [LAND]? Je Verfahren ein Cluster mit Suchkern in der Landessprache,
   vermutetem Rechtsrahmen und zugehörigen Board-Karten. Ausdrücklich an die
   Ränder denken: Zoll und Export, staatliche Finanzkontrolle bei
   Fördermitteln, Zertifizierungen, Prüfpfad der Software.
3. Forschungsfragen als Tabelle: ID, Cluster, Frage, "erledigt, wenn"
   (prüfbares Abnahmekriterium). Keine Frage mit eingebauter Annahme stellen
   (nicht "ab welchen Schwellen", wenn noch offen ist, ob es Schwellen gibt).
   Ist die Rechtsform des Betriebs offen ([RECHTSFORMEN]), jede
   formabhängige Frage für alle Formen beantworten.
4. Quellen nach Rang:
   Rang 1 = amtlicher Gesetzestext, Behörden, Register, Entwurfsportal,
   Standardsetzer. Nur Rang 1 belegt geltendes Recht.
   Rang 2 = Länderberichte (IFAC, Weltbank, OECD), Berufsverbände, Big Four,
   Kanzleien, Fachportale mit Gesetzesspiegel. Spiegeltexte immer mit dem
   Fassungsstand der amtlichen Datenbank abgleichen.
   Rang 3 = Presse und Foren, nur zum Finden.
   Nach amtlichen Pflichtenverzeichnissen, Prüflisten und Risikokriterien der
   Behörden suchen; das sind oft die ergiebigsten Einzelquellen.
5. Suchstrategie: Sprachen [SPRACHEN], Suchbegriffe je Cluster in jeder
   Sprache, Domänen- und Dateityp-Filter, Anker der Rechtssprache
   (z. B. "по состоянию на", "утратил силу"), Schneeball über die
   Änderungshistorie der Rechtsdatenbank, eigene Suche der Rechtsdatenbank
   als zweite Suchmaschine. Nur Reiter und Funktionen nennen, die du auf der
   Seite tatsächlich gesehen hast.
6. Werkzeuge und ihre Grenzen:
   - WebSearch und WebFetch parallel in Agenten.
   - Der Browser (/browse) ist ein geteilter Dienst: nur einer zur Zeit, nie
     aus parallelen Agenten.
   - yandex, google, Bing und DuckDuckGo blockieren den automatisierten
     Browser mit Captchas. Nicht als Gegenmaßnahme einplanen.
   - Keine Logins, keine Bezahlschranken; was dahinter liegt, ist eine Lücke.
7. Ablauf in Phasen mit Stunden. Die Zeit selbst ausrechnen: Summe und
   Anteil, der nur nacheinander laufen kann. Engpass benennen (meist das
   Lesen der Primärtexte im Browser) und eine Reihenfolge nach Relevanz
   festlegen. Eine Textskizze des Ablaufs dazu.
8. Kennzahlen für "möglichst viel": Anteil beantworteter Fragen mit
   Primärbeleg, Anteil Primärbelege im Register, Zahl der Rang-1-Quellen je
   Cluster, Treffer, die nur die zweite Suchmaschine fand. Abbruch, wenn drei
   Suchrunden in zwei Sprachen nichts Neues auf Rang 1 bringen.
9. Ausgaben je Empfänger: Team (Belegregister, Steckbriefe),
   Geschäftsführung (eine Seite, jede Pflicht als Pflicht / Empfehlung /
   unklar mit Frist und Aufwand), Fachmann vor Ort (Fragen in der
   Landessprache mit Artikelverweis und unserer vorläufigen Lesart).
10. Belegregister als JSON: id, frage, aussage, quelle_url, rang, dokument,
    fundstelle, fassung_stand, wortlaut_original, uebersetzung, abgerufen_am,
    verifiziert (primaer | nur_sekundaer | widerspruch | offen), gegenquelle,
    board_karte, einstufung, rechtsform, produkt_folge.
    Regeln: nur Wortlaut aus Rang 1; vor jedem Eintrag prüfen, ob die Norm
    aufgehoben ist; bei Widerspruch zählt der jüngste Primärtext; keine
    Artikelnummer aus dem Gedächtnis eines Sprachmodells; Fassungsstand und
    Abrufdatum sind Pflicht.
11. Qualitätssicherung: zweiter Agent prüft Stichprobe am Primärtext,
    Gegenprobe in zweiter Sprache, Abgleich mit allen Board-Karten.
12. Risiken mit Gegenmaßnahme, dazu Ablage und Push-Regeln (keine
    Kundendaten, keine fremden Volltexte ins Repo).
13. Erste Belege aus den Vorabtests mit Datum.

Prüfung des Plans
1. /iq-eq-vq auf den Plan: IQ (Zeitrechnung, Annahmen, Messbarkeit), EQ
   (was brauchen Geschäftsführung und Fachmann vor Ort), VQ (ist die
   Zuordnung Frage → Cluster sichtbar, gibt es ein Ablaufbild). Befunde
   einarbeiten, Version hochzählen.
2. /qa-ultra auf die korrigierte Fassung, mit echten Stichproben statt
   Lesen: Quellen im Browser öffnen, Status jeder genannten Norm auf der
   Rechtsdatenbank prüfen, die geplanten Suchwege ausprobieren, fehlende
   Cluster suchen. Jeden Befund zweimal reproduzieren, dann Urteil
   BLOCK / CONDITIONAL / SHIP. Befunde einarbeiten.
3. Den Plan danach einmal vollständig lesen und nach Resten der alten
   Fassung suchen (Beispiele, Nummern, Reihenfolge, überholte Aussagen).

Ergebnis: Plan im Ordner, Prüfberichte als Zusammenfassung im Chat, nichts
committen oder pushen ohne Rückfrage.
```

---

## Was diese Fassung aus dem Kasachstan-Plan gelernt hat

| Lehre | Anlass |
|---|---|
| Neuen Branch mit `--no-track` anlegen | `git switch -c … origin/main` setzte main als Upstream; ein `git push` wäre auf main gegangen |
| Rechtsdatenbank im Browser nur mit `wait --networkidle` lesen | adilet lieferte ohne Warten 430 Zeichen statt über 80.000 |
| Keine Suchmaschinen im Browser einplanen | yandex, google, DuckDuckGo und Bing blockierten jeweils mit Captcha oder lieferten Unsinn |
| WebSearch mit `allowed_domains` | brachte allein für den Pflanzenschutz neun amtliche Prüflisten |
| Status jeder Norm prüfen | Die Depositariumsregel P1100001173 stand als geltend im Plan, war aber seit 2022 aufgehoben |
| Fragen ohne eingebaute Annahme | Die Vorarbeit nannte Art. 6 als Pflichtprüfung; tatsächlich Art. 5 Abs. 2, Art. 6 gestrichen |
| Ränder des Themas absuchen | Zollprüfungen und die Высшая аудиторская палата fehlten zunächst |
| Zeit ausrechnen, nicht schätzen | „Passt in Tag 1“ war falsch, es sind anderthalb Tage |
| Nach der Korrektur alles noch einmal lesen | Das Belegbeispiel nannte weiter den gestrichenen Art. 6 |
