# Testfaelle Rolle: Brigade

Anmeldung als `brigade@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Die Brigadeleitung arbeitet im Feld, am Telefon, oft ohne gutes Netz. **Mindestens TF-B1 bis TF-B3 auf einem Handy oder in einem Browserfenster von etwa 390 px Breite durchgehen.**

**Voraussetzung:** TF-B1 braucht die in TF-L1 angelegte Aufgabe.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-B1 | Aufgabe annehmen und starten | 1. Feld > Pflückaufgaben (vorgefiltert auf die eigene Brigade und Aufgaben ohne Zuordnung)<br>2. Aufgabe zu `T-N-A-01` im Status **offen** oeffnen, die Detailansicht ersetzt auf dem Telefon die Liste<br>3. Unter "Nächster Schritt": "Aufgabe annehmen"<br>4. "Pflücken starten" | keine Eingabe | Status wechselt **offen > angenommen > in Arbeit**. Jeder Schritt ist sofort sichtbar, ohne die Seite neu zu laden. Die Zurück-Geste fuehrt zurueck zur Liste. | | |
| TF-B2 | Menge melden | 1. Dieselbe Aufgabe oeffnen<br>2. Ist-Menge und Ausschuss eintragen<br>3. "Menge melden und zur Belegprüfung geben" | Ist-Menge in kg: `118,5`<br>Ausschuss in kg: `6`<br>Pflücker: `D. Sarsenbaj` | Status wechselt auf **Belegprüfung**. Die Mengen stehen wie eingegeben da, das Komma wurde nicht verschluckt (118,5 darf nicht zu 1185 werden). | | |
| TF-B3 | Fotobeleg hochladen (Pflicht) | 1. Aufgabe oeffnen, Reiter Fotobelege<br>2. Belegart waehlen<br>3. Bild waehlen, Hinweis eintragen<br>4. "Fotobeleg hochladen" | Belegart: `Steige`<br>Foto: ein beliebiges Bild vom Geraet<br>Hinweis: `TEST Verkaufsschale 125 g, geschlossene Fruchtdecke` | Das Bild erscheint als Beleg bei der Aufgabe. Vorher stand dort ein Platzhalter. Ohne Beleg darf die Betriebsleitung in TF-L4 nicht abschliessen koennen. | | |
| TF-B4 | Uebergabequittung erfassen | 1. Hof > Logistik<br>2. Eine geplante Lieferung oeffnen<br>3. Als zugestellt markieren, quittieren | Empfänger: `TEST Gastro-Distributor Almaty`<br>Zeitpunkt: jetzt | Die Lieferung gilt als zugestellt, die Quittung ist gespeichert und im Verlauf sichtbar. | | |
| TF-B5 | Neue Lieferung planen ist nicht erlaubt (Negativtest) | 1. Hof > Logistik<br>2. Nach "Neue Lieferung", "Tour anlegen" o. Ae. suchen | keine Eingabe | Es gibt **keine** Schaltflaeche zum Anlegen einer neuen Lieferung. Die Brigade quittiert nur, geplant wird im Buero. Laesst sich eine Lieferung anlegen: **S3**. | | |
| TF-B6 | Kein Zugriff auf Finanzen und Lohn (Negativtest) | 1. Navigation pruefen: erscheint Büro > Finanzen oder Lohn?<br>2. Adresse direkt aufrufen: `/de/dashboard/buero/finanzen` | direkter Adressaufruf | Die Module tauchen in der Navigation **nicht** auf. Der direkte Aufruf endet mit einer Zugriffsmeldung, nicht mit sichtbaren Zahlen. Werden Finanzdaten angezeigt: **S1**. | | |

---

## Abschluss Rolle Brigade

OK: ____  NOK: ____  blockiert: ____

Geprueft auf: ☐ Handy  ☐ schmales Browserfenster  ☐ nur Desktop

Datum / Tester: ______________________

**Freie Funde** (besonders: Schaltflaechen zu klein fuer Handschuhe? Text bei Sonne lesbar? Reaktion bei schlechtem Netz?):

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Kann eine Brigadeleiterin das im Feld am Telefon zuegig bedienen?

<br><br>
