# Testfaelle Rolle: Pflücker

Anmeldung als `pfluecker@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Die schmalste Rolle im System: nur die **eigene** Leistung, der eigene Lohn, die eigene Einarbeitung. Kein Schreibrecht auf gebuchte Mengen. Die beiden Negativtests TF-P3 und TF-P5 sind die wichtigsten der ganzen Testreihe, weil hier Lohndaten anderer Menschen im Spiel sind.

**Auf dem Handy pruefen.** Diese Rolle benutzt nie einen Schreibtischrechner.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-P1 | Nur drei Bereiche sichtbar | 1. Anmelden<br>2. Navigation vollstaendig durchsehen | keine Eingabe | Sichtbar sind ausschliesslich **Dashboard**, **Lohn** und **Schulungen**. Keine Zone Feld, Hof oder Markt. Jeder zusaetzliche Eintrag ist ein Fund. | | |
| TF-P2 | Eigene Abrechnung einsehen | 1. Lohn oeffnen<br>2. Eigene Abrechnung oeffnen<br>3. Positionen je Pflückaufgabe ansehen | keine Eingabe | Die eigene Abrechnung ist sichtbar, mit Positionen, Qualitätsfaktor und Nettobetrag. Die Zahlen sind nachvollziehbar dargestellt, nicht nur eine Endsumme. | | |
| TF-P3 | Fremde Abrechnungen sind unsichtbar (Negativtest, wichtigster Fall) | 1. Lohn oeffnen<br>2. Liste zaehlen: wie viele Personen erscheinen?<br>3. Nach Namen wie `A. Tulegenowa` oder `M. Qojschybaj` suchen<br>4. Falls eine Filter- oder Suchfunktion existiert, damit nach anderen Namen suchen | Suchbegriff: `Tulegenowa` | Es erscheint **ausschliesslich die eigene Person**. Kein zweiter Name, auch nicht ueber Suche oder Filter. Erscheint ein fremder Name mit Betrag: **S1**, sofort melden und nicht weitertesten. | | |
| TF-P4 | Kurzeinarbeitung abhaken | 1. Schulungen oeffnen<br>2. Kurzeinarbeitung oeffnen<br>3. Einen offenen Punkt abhaken<br>4. Seite neu laden | Punkt: `Hygiene und Handschuhe` | Der Haken bleibt nach dem Neuladen gesetzt, der Fortschritt steigt sichtbar. Sprache pruefen: laesst sich die Einarbeitung auf Russisch oder Kasachisch umstellen? | | |
| TF-P5 | Kein Zugriff auf Pflückaufgaben und Personal (Negativtest) | 1. Adresse direkt aufrufen: `/de/dashboard/feld/pflueckaufgaben`<br>2. Adresse direkt aufrufen: `/de/dashboard/buero/personal` | direkte Adressaufrufe | Beide enden mit einer Zugriffsmeldung. Kein Blick auf Aufgaben anderer Brigaden, keine Personalliste. Werden Inhalte angezeigt: **S1**. | | |

---

## Abschluss Rolle Pflücker

OK: ____  NOK: ____  blockiert: ____

Geprueft auf: ☐ Handy  ☐ schmales Browserfenster  ☐ nur Desktop

Datum / Tester: ______________________

**Freie Funde:**

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Versteht ein Pflücker ohne Bueroerfahrung, was er hier sieht und was sein Lohn bedeutet?

<br><br>
