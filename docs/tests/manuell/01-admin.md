# Testfaelle Rolle: Admin

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-admin.xlsx`
> oder das Blatt "Admin" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `admin@damicon.demo`

Einzige Rolle mit Vollzugriff. Geprueft wird vor allem, ob die Rechteverwaltung selbst stimmt, denn jeder Fehler hier wirkt auf alle anderen Rollen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-A1 | Rechtematrix ist vollstaendig und stimmt | 1. Buero > Rollen oeffnen<br>2. Rechtematrix aufklappen<br>3. Zeile "Lohn" suchen<br>4. Spalten Pfluecker und Brigade vergleichen | keine Eingabe | Alle 7 Rollen sind gelistet. Pfluecker hat bei Lohn nur "ansehen", Brigade hat bei Lohn gar kein Recht. Die Matrix zeigt die tatsaechliche Konfiguration, keine feste Grafik. |
| TF-A2 | Kundenzugang ausstellen | 1. Buero > Rollen > Kundenzugaenge<br>2. "Einladung ausstellen"<br>3. Felder fuellen<br>4. Absenden<br>5. Angezeigten Code notieren | B2B-Kunde: Almaty Fresh Market<br>Name: TEST Aigul Sarsenowa<br>E-Mail: test.kunde.20092026@example.com | Einladung wird angelegt, ein Code erscheint. Hinweis "gilt 14 Tage und nur fuer diese Adresse".<br>CODE HIER NOTIEREN, wird in TF-K1 gebraucht. |
| TF-A3 | "Ansicht als" wirkt auf die Anzeige | 1. Oben rechts Rollenumschalter<br>2. Auf "Pfluecker" umstellen<br>3. Navigation ansehen<br>4. Zurueck auf Admin | Rolle: Pfluecker | Die Navigation schrumpft sichtbar auf Dashboard, Lohn und Schulungen. Feld, Hof und Markt verschwinden. Nach dem Zuruecksetzen ist wieder alles da. |
| TF-A4 | KI-Anbieter verwalten (nur Admin) | 1. KI-Bereich oeffnen<br>2. Anbieterliste aufrufen<br>3. Pruefen, ob Anbieter anlegbar/aenderbar sind | nichts speichern, nur pruefen ob erreichbar | Die Anbieterverwaltung ist erreichbar und bedienbar. Kein Schluessel wird im Klartext angezeigt. |
| TF-A5 | Steuernummer mit falscher Pruefziffer wird abgelehnt (NEGATIVTEST) | 1. Buero > Stammdaten<br>2. Betrieb bearbeiten, Rechtsform KH/FH (Feld heisst dann IIN)<br>3. Wert 1 eintragen, speichern<br>4. Wert 2 eintragen, speichern<br>5. Wert 3 eintragen, speichern | 1. zu kurz: 78062130045<br>2. Pruefziffer falsch: 780621300451<br>3. gueltig: 780621300453 | Wert 1 abgelehnt mit Hinweis auf die Stellenzahl. Wert 2 abgelehnt mit Hinweis auf die PRUEFZIFFER, das ist eine andere Meldung als bei Wert 1. Wert 3 wird gespeichert.<br>Wird Wert 1 oder 2 angenommen: S1. |
| TF-A6 | Auditprotokoll und MFA-Status | 1. Buero > Compliance<br>2. Auditprotokoll oeffnen<br>3. Nach dem Eintrag aus TF-A2 suchen<br>4. MFA-Status ansehen | Suchzeitraum: heute | Die in TF-A2 ausgestellte Einladung taucht als Eintrag auf, mit Zeit und handelndem Benutzer. Der MFA-Status je Konto ist erkennbar. |
| TF-A7 | Admin sieht alle vier Zonen | 1. Navigation durchgehen<br>2. Je ein Modul aus Feld, Hof, Buero, Markt oeffnen | Feld: Reihenbloecke<br>Hof: Kuehlkette<br>Buero: Finanzen<br>Markt: Preislisten | Alle vier Module oeffnen ohne Zugriffsmeldung und zeigen Inhalte. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
