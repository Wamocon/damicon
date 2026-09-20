# Testfaelle Rolle: Betriebsleitung

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-betriebsleitung.xlsx`
> oder das Blatt "Betriebsleitung" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `leitung@damicon.demo`

Wichtigster Test ist die Wartezeitsperre: nach einer Pflanzenschutzbehandlung darf auf dem Block gesetzlich nicht geerntet werden, und das System muss das von sich aus verhindern. TF-L2 sperrt, TF-L3 prueft die Wirkung, beide gehoeren zusammen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-L1 | Pflueckaufgabe anlegen und zuweisen | 1. Feld > Pflueckaufgaben<br>2. "Neue Pflueckaufgabe"<br>3. Felder fuellen<br>4. "Aufgabe anlegen" | Reihenblock: T-N-A-01<br>Brigade: Brigade Nord<br>Zielmenge in kg: 120 | Aufgabe erscheint mit Status "offen" und Brigade Nord. Wird in TF-B1 gebraucht. |
| TF-L2 | Behandlung erfassen sperrt den Block automatisch | 1. Feld > Pflanzenschutz<br>2. "Behandlung erfassen"<br>3. Felder fuellen, speichern<br>4. Feld > Reihenbloecke oeffnen, Block T-N-A-03 suchen | Reihenblock: T-N-A-03<br>Mittel: Signum<br>Behandelt am: heute<br>Aufwandmenge: 1,5<br>Einheit: kg/ha<br>Durchgefuehrt von: TEST Betriebsleitung | Block T-N-A-03 steht danach auf Status "wartezeitgesperrt" und zeigt ein "Frei ab"-Datum in der Zukunft. Niemand musste den Status von Hand setzen. |
| TF-L3 | Gesperrter Block laesst sich nicht bepfluecken (NEGATIVTEST) | 1. Feld > Pflueckaufgaben<br>2. "Neue Pflueckaufgabe"<br>3. Auswahlliste Reihenblock oeffnen<br>4. Nach T-N-A-03 suchen | Reihenblock T-N-A-03 versuchen | Der gesperrte Block erscheint GAR NICHT in der Auswahl.<br>Laesst sich eine Aufgabe darauf anlegen: S1 (Ernte trotz gesetzlicher Wartezeit). |
| TF-L4 | Fotobeleg pruefen und Aufgabe abschliessen | 1. Feld > Pflueckaufgaben<br>2. Aufgabe im Status "Belegpruefung" oeffnen (entsteht in TF-B3)<br>3. Fotobeleg ansehen<br>4. Aufgabe abschliessen | keine Eingabe, nur Freigabe | Status wechselt auf "abgeschlossen". Erst jetzt ist die Aufgabe fuer die Lohnabrechnung (TF-F2) verwertbar. Ohne Foto darf kein Abschluss moeglich sein. |
| TF-L5 | Rotationsplan zeigt den naechsten Pfluecktermin | 1. Feld > Rotationsplan<br>2. Plantage waehlen<br>3. Eintrag zu T-N-A-03 suchen | Plantage: Plantage Talgar | Der Plan zeigt je Reihenblock den naechsten Termin im Rhythmus von 2 bis 3 Tagen. Der in TF-L2 gesperrte Block ist als gesperrt gekennzeichnet oder ausgenommen, nicht normal eingeplant. |
| TF-L6 | Lohn ist nur lesbar, nicht aenderbar (NEGATIVTEST) | 1. Buero > Lohn oeffnen<br>2. Nach "Freigeben", "Satz anlegen" oder "Periode berechnen" suchen | keine Eingabe | Abrechnungen sind sichtbar, aber es gibt keine Schaltflaeche zum Anlegen, Berechnen oder Freigeben. Lohn gehoert der Buchhaltung.<br>Erscheint eine solche Schaltflaeche und funktioniert sie: S1. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
