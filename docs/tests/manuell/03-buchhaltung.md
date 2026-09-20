# Testfaelle Rolle: Buchhaltung

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-buchhaltung.xlsx`
> oder das Blatt "Buchhaltung" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `buchhaltung@damicon.demo`

Hier entstehen Zahlen, die auf Belegen landen. Jede Abweichung in einem Betrag ist mindestens S2, auch wenn sie klein wirkt. TF-F2 braucht eine abgeschlossene Pflueckaufgabe aus TF-L4.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-F1 | Lohnsatz anlegen | 1. Buero > Lohn<br>2. "Neuen Lohnsatz anlegen"<br>3. Felder fuellen<br>4. "Satz anlegen"<br>5. Gegenprobe: denselben Satz noch einmal anlegen | Gueltig ab: 01.10.2026<br>Stundenlohn: 900 Tenge<br>kg-Satz: 850 Tenge<br>Ziel-Ausschussquote: 5 %<br>Faktor min: 0,90<br>Faktor max: 1,10 | Satz wird gespeichert und erscheint in der Historie. Ein zweiter Satz mit demselben "Gueltig ab" muss ABGELEHNT werden, das ist die Eindeutigkeitsregel. |
| TF-F2 | Periode berechnen mit Qualitaetsfaktor | 1. Buero > Lohn<br>2. "Periode berechnen"<br>3. Zeitraum waehlen<br>4. Berechnen<br>5. "Positionen je Pflueckaufgabe" oeffnen | Zeitraum: laufender Monat<br>Brigade: Brigade Nord | Je Pfluecker entsteht eine Abrechnung. Der Qualitaetsfaktor ist sichtbar und liegt zwischen 0,90 und 1,10. Bei genau 5 % Ausschuss muss er 1,00 sein.<br>Fehlt der Faktor oder liegt er ausserhalb: S2. |
| TF-F3 | Gesetzliche Abzuege Kasachstan rechnen korrekt | 1. Buero > Lohn > "Monatsabzuege berechnen"<br>2. Fall A eingeben, berechnen, vergleichen<br>3. Mit Fall B wiederholen<br>4. Mit Fall C wiederholen | Fall A Brutto: 250000<br>Fall B Brutto: 150000<br>Fall C Brutto: 100000 | A: OPV 25.000,00 \| VOSMS 5.000,00 \| IPN-Grundlage 90.250,00 \| IPN 9.025,00 \| NETTO 210.975,00 \| OPVR 8.750,00<br>B: OPV 15.000,00 \| VOSMS 3.000,00 \| Grundlage 2.250,00 \| IPN 225,00 \| NETTO 131.775,00<br>C: OPV 10.000,00 \| VOSMS 2.000,00 \| Grundlage 0,00 \| IPN 0,00 \| NETTO 88.000,00<br>Fall C ist der wichtige: der Freibetrag von 129.750 Tenge darf nicht ins Minus laufen. |
| TF-F4 | Freigabe und Ruecknahme der Freigabe | 1. Eine berechnete Abrechnung oeffnen<br>2. "Freigeben"<br>3. Ruecknahme der Freigabe versuchen<br>4. "Als ausgezahlt markieren" | keine Eingabe | Nach der Freigabe wechselt der Status sichtbar. Die Ruecknahme verlangt eine ZWEITE, eigene Bestaetigung, sie passiert nicht mit einem Klick.<br>Laesst sich eine Freigabe mit einem Klick rueckgaengig machen: S2. |
| TF-F5 | Steuernummer eines Kunden pflegen | 1. Buero > Stammdaten<br>2. Kunden Almaty Fresh Market waehlen<br>3. Rechtsform TOO setzen (Feld heisst dann BIN)<br>4. Nummer eintragen, speichern<br>5. Gegenprobe mit ungueltigem Wert | Rechtsform: TOO<br>BIN gueltig: 190940001235<br>Gegenprobe ungueltig: 190940001231 | Der gueltige Wert wird gespeichert. Der Gegenprobenwert wird mit Hinweis auf die PRUEFZIFFER abgelehnt. Bei Rechtsform TOO muss das Feld BIN heissen, nicht IIN. |
| TF-F6 | Reklamation bearbeiten und schliessen | 1. Markt > Reklamationen<br>2. Vorgang aus TF-K5 oeffnen<br>3. "In Pruefung nehmen"<br>4. Nachricht hinzufuegen<br>5. "Annehmen", dann "Als erledigt abschliessen" | Nachricht: TEST Gutschrift geprueft, Ware war bei Anlieferung zu warm | Der Status durchlaeuft die Stufen sichtbar. Die Rueckverfolgung zeigt die urspruengliche Charge. Der Verlauf enthaelt die eigene Nachricht mit Zeitstempel. |
| TF-F7 | Kein Eingriff in den Feldbetrieb (NEGATIVTEST) | 1. Navigation pruefen: erscheint Feld > Pflueckaufgaben?<br>2. Adresse aufrufen: /de/dashboard/feld/pflanzenschutz<br>3. Falls Pflueckaufgaben lesbar: nach "Neue Pflueckaufgabe" suchen | direkter Adressaufruf | Pflueckaufgaben sind hoechstens LESBAR, nicht anlegbar. Pflanzenschutz endet mit einer Zugriffsmeldung. Die Buchhaltung rechnet ab, sie plant keine Ernte.<br>Laesst sich eine Aufgabe anlegen oder eine Behandlung erfassen: S2. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
