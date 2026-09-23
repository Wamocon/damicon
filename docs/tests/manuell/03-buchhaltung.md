# Testfaelle Rolle: Buchhaltung

Anmeldung als `buchhaltung@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Hier entstehen Zahlen, die auf Belegen landen. Jede Abweichung in einem Betrag ist mindestens **S2**, auch wenn sie klein wirkt.

**Voraussetzung:** TF-F2 braucht eine abgeschlossene Pflückaufgabe aus TF-L4.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-F1 | Lohnsatz anlegen | 1. Büro > Lohn<br>2. "Neuen Lohnsatz anlegen"<br>3. Felder fuellen<br>4. "Satz anlegen" | Gültig ab: `01.10.2026`<br>Stundenlohn: `900` ₸<br>kg-Satz: `850` ₸<br>Ziel-Ausschussquote: `5` %<br>Faktor min: `0,90`<br>Faktor max: `1,10` | Satz wird gespeichert und erscheint in der Historie. Ein zweiter Satz mit demselben "Gültig ab" muss **abgelehnt** werden, das ist die Eindeutigkeitsregel. Gegenprobe: denselben Satz noch einmal anlegen. | | |
| TF-F2 | Periode berechnen mit Qualitätsfaktor | 1. Büro > Lohn<br>2. "Periode berechnen"<br>3. Zeitraum waehlen<br>4. Berechnen<br>5. Abschnitt "Positionen je Pflückaufgabe" oeffnen | Zeitraum: laufender Monat<br>Brigade: `Brigade Nord` | Je Pflücker entsteht eine Abrechnung. In den Positionen ist der **Qualitätsfaktor** sichtbar und liegt zwischen 0,90 und 1,10. Bei genau 5 % Ausschuss muss er 1,00 sein. Fehlt der Faktor oder liegt er ausserhalb des Korridors: **S2**. | | |
| TF-F3 | Gesetzliche Abzüge Kasachstan rechnen korrekt | 1. Büro > Lohn > "Monatsabzüge berechnen"<br>2. Bruttowert eingeben<br>3. Berechnen<br>4. Werte mit der Spalte rechts vergleichen<br>5. Mit den beiden anderen Bruttowerten wiederholen | Fall A Brutto: `250000`<br>Fall B Brutto: `150000`<br>Fall C Brutto: `100000` | **A:** ОПВ 25.000,00 / ВОСМС 5.000,00 / ИПН-Grundlage 90.250,00 / ИПН 9.025,00 / **Netto 210.975,00** / ОПВР 8.750,00<br>**B:** ОПВ 15.000,00 / ВОСМС 3.000,00 / Grundlage 2.250,00 / ИПН 225,00 / **Netto 131.775,00**<br>**C:** ОПВ 10.000,00 / ВОСМС 2.000,00 / Grundlage **0,00** / ИПН **0,00** / **Netto 88.000,00**<br>Fall C ist der wichtige: der Freibetrag von 129.750 ₸ darf nicht ins Minus laufen. | | |
| TF-F4 | Freigabe und Ruecknahme der Freigabe | 1. Eine berechnete Abrechnung oeffnen<br>2. "Freigeben"<br>3. Versuchen, die Freigabe zurueckzunehmen<br>4. Danach "Als ausgezahlt markieren" | keine Eingabe | Nach der Freigabe wechselt der Status sichtbar. Die **Ruecknahme verlangt eine zweite, eigene Bestaetigung**, sie passiert nicht mit einem Klick. Laesst sich eine Freigabe versehentlich mit einem Klick rueckgaengig machen: **S2**. | | |
| TF-F5 | Steuernummer eines Kunden pflegen | 1. Büro > Stammdaten<br>2. Kunden `Almaty Fresh Market` waehlen<br>3. Rechtsform `ТОО` setzen (Feld heisst dann БИН)<br>4. Nummer eintragen, speichern | Rechtsform: `ТОО`<br>БИН gueltig: `190940001235`<br>Gegenprobe ungueltig: `190940001231` | Der gueltige Wert wird gespeichert. Der Gegenprobenwert wird mit Hinweis auf die **Pruefziffer** abgelehnt. Bei Rechtsform ТОО muss das Feld БИН heissen, nicht ИИН. | | |
| TF-F6 | Reklamation bearbeiten und schliessen | 1. Markt > Reklamationen<br>2. Vorgang aus TF-K5 oeffnen<br>3. "In Prüfung nehmen"<br>4. Nachricht hinzufuegen<br>5. "Annehmen", dann "Als erledigt abschließen" | Nachricht: `TEST Gutschrift geprueft, Ware war bei Anlieferung zu warm` | Der Status durchlaeuft die Stufen sichtbar. Die Rückverfolgung zeigt die **ursprüngliche Charge**. Der Verlauf enthaelt die eigene Nachricht mit Zeitstempel. | | |
| TF-F7 | Kein Eingriff in den Feldbetrieb (Negativtest) | 1. Navigation pruefen: erscheint Feld > Pflückaufgaben?<br>2. Adresse direkt aufrufen: `/de/dashboard/feld/pflanzenschutz`<br>3. Falls Pflückaufgaben lesbar sind: nach "Neue Pflückaufgabe" suchen | direkter Adressaufruf | Pflückaufgaben sind hoechstens **lesbar**, nicht anlegbar. Pflanzenschutz endet mit einer Zugriffsmeldung. Die Buchhaltung rechnet ab, sie plant keine Ernte. Laesst sich eine Aufgabe anlegen oder eine Behandlung erfassen: **S2**. | | |

---

## Abschluss Rolle Buchhaltung

OK: ____  NOK: ____  blockiert: ____

Datum / Tester: ______________________

**Freie Funde:**

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Wuerde eine Buchhalterin den hier gerechneten Zahlen ohne Nachrechnen vertrauen?

<br><br>
