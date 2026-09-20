# Testfaelle Rolle: Pfluecker

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-pfluecker.xlsx`
> oder das Blatt "Pfluecker" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `pfluecker@damicon.demo`

Schmalste Rolle: nur die EIGENE Leistung, der eigene Lohn, die eigene Einarbeitung. TF-P3 ist der wichtigste Test der ganzen Reihe, weil dort Lohndaten anderer Menschen im Spiel sind. Auf dem Handy pruefen, diese Rolle benutzt nie einen Schreibtischrechner.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-P1 | Nur drei Bereiche sichtbar | 1. Anmelden<br>2. Navigation vollstaendig durchsehen | keine Eingabe | Sichtbar sind ausschliesslich Dashboard, Lohn und Schulungen. Keine Zone Feld, Hof oder Markt. Jeder zusaetzliche Eintrag ist ein Fund. |
| TF-P2 | Eigene Abrechnung einsehen | 1. Lohn oeffnen<br>2. Eigene Abrechnung oeffnen<br>3. Positionen je Pflueckaufgabe ansehen | keine Eingabe | Die eigene Abrechnung ist sichtbar, mit Positionen, Qualitaetsfaktor und Nettobetrag. Die Zahlen sind nachvollziehbar dargestellt, nicht nur eine Endsumme. |
| TF-P3 | Fremde Abrechnungen sind unsichtbar (NEGATIVTEST, wichtigster Fall) | 1. Lohn oeffnen<br>2. Liste zaehlen: wie viele Personen erscheinen?<br>3. Nach fremden Namen suchen<br>4. Falls Filter/Suche existiert, damit nach anderen Namen suchen | Suchbegriff: Tulegenowa<br>zweiter Versuch: Qojschybaj | Es erscheint AUSSCHLIESSLICH die eigene Person. Kein zweiter Name, auch nicht ueber Suche oder Filter.<br>Erscheint ein fremder Name mit Betrag: S1, sofort melden und NICHT weitertesten. |
| TF-P4 | Kurzeinarbeitung abhaken | 1. Schulungen oeffnen<br>2. Kurzeinarbeitung oeffnen<br>3. Einen offenen Punkt abhaken<br>4. Seite neu laden | Punkt: Hygiene und Handschuhe | Der Haken bleibt nach dem Neuladen gesetzt, der Fortschritt steigt sichtbar. Zusatz: laesst sich die Einarbeitung auf Russisch oder Kasachisch umstellen? |
| TF-P5 | Kein Zugriff auf Pflueckaufgaben und Personal (NEGATIVTEST) | 1. Adresse aufrufen: /de/dashboard/feld/pflueckaufgaben<br>2. Adresse aufrufen: /de/dashboard/buero/personal | direkte Adressaufrufe | Beide enden mit einer Zugriffsmeldung. Kein Blick auf Aufgaben anderer Brigaden, keine Personalliste.<br>Werden Inhalte angezeigt: S1. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
