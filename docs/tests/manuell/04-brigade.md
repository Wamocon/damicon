# Testfaelle Rolle: Brigade

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-brigade.xlsx`
> oder das Blatt "Brigade" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `brigade@damicon.demo`

Arbeitet im Feld, am Telefon, oft ohne gutes Netz. MINDESTENS TF-B1 bis TF-B3 auf einem Handy oder in einem Browserfenster von etwa 390 px Breite durchgehen. TF-B1 braucht die Aufgabe aus TF-L1.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-B1 | Aufgabe annehmen und starten | 1. Feld > Pflueckaufgaben<br>2. Aufgabe zu T-N-A-01 im Status "offen" oeffnen<br>3. "Aufgabe annehmen"<br>4. "Pfluecken starten" | keine Eingabe | Status wechselt offen > angenommen > in Arbeit. Jeder Schritt ist sofort sichtbar, ohne die Seite neu zu laden. |
| TF-B2 | Menge melden | 1. Dieselbe Aufgabe oeffnen<br>2. Ist-Menge und Ausschuss eintragen<br>3. "Menge melden und zur Belegpruefung geben" | Ist-Menge in kg: 118,5<br>Ausschuss in kg: 6<br>Pfluecker: D. Sarsenbaj | Status wechselt auf "Belegpruefung". Die Mengen stehen wie eingegeben da, das Komma wurde nicht verschluckt (118,5 darf nicht zu 1185 werden). |
| TF-B3 | Fotobeleg hochladen (Pflicht) | 1. Aufgabe oeffnen<br>2. Belegart waehlen<br>3. Bild waehlen, Hinweis eintragen<br>4. "Fotobeleg hochladen" | Belegart: Steige<br>Foto: beliebiges Bild vom Geraet<br>Hinweis: TEST Verkaufsschale 125 g, geschlossene Fruchtdecke | Das Bild erscheint als Beleg bei der Aufgabe, vorher stand dort ein Platzhalter. Ohne Beleg darf die Betriebsleitung in TF-L4 nicht abschliessen koennen. |
| TF-B4 | Uebergabequittung erfassen | 1. Hof > Logistik<br>2. Eine geplante Lieferung oeffnen<br>3. Als zugestellt markieren, quittieren | Empfaenger: TEST Gastro-Distributor Almaty<br>Zeitpunkt: jetzt | Die Lieferung gilt als zugestellt, die Quittung ist gespeichert und im Verlauf sichtbar. |
| TF-B5 | Neue Lieferung planen ist nicht erlaubt (NEGATIVTEST) | 1. Hof > Logistik<br>2. Nach "Neue Lieferung", "Tour anlegen" o. Ae. suchen | keine Eingabe | Es gibt KEINE Schaltflaeche zum Anlegen einer neuen Lieferung. Die Brigade quittiert nur, geplant wird im Buero.<br>Laesst sich eine Lieferung anlegen: S3. |
| TF-B6 | Kein Zugriff auf Finanzen und Lohn (NEGATIVTEST) | 1. Navigation pruefen: erscheint Buero > Finanzen oder Lohn?<br>2. Adresse aufrufen: /de/dashboard/buero/finanzen | direkter Adressaufruf | Die Module tauchen in der Navigation NICHT auf. Der direkte Aufruf endet mit einer Zugriffsmeldung, nicht mit sichtbaren Zahlen.<br>Werden Finanzdaten angezeigt: S1. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
