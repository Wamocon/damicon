# Testfaelle Rolle: Erzeuger (Nachbarbetrieb)

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-erzeuger.xlsx`
> oder das Blatt "Erzeuger" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `erzeuger@damicon.demo`

Ein Nachbarbetrieb, der seine Ware in den Aggregator verkauft. Er sieht die eigenen Lieferungen und die eigene Abrechnung, nicht den Betrieb der anderen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-E1 | Eigene Lieferungen im Dashboard | 1. Anmelden<br>2. Dashboard ansehen<br>3. Navigation durchsehen | keine Eingabe | Sichtbar sind Dashboard, Reihenbloecke, Pflueckaufgaben, Finanzen, Dokumente, Aggregator, B2B-Portal und Schulungen. Kein Lohn, kein Personal, keine Rollen. |
| TF-E2 | Nachbarbetrieb aufnehmen | 1. Markt > Aggregator<br>2. "Nachbarbetrieb aufnehmen"<br>3. Felder fuellen, absenden | Name: TEST Nachbarbetrieb Talgar<br>Ort: Talgar<br>Ansprechperson: R. Baitulin | Der Betrieb erscheint in der Liste und steht danach beim Import in TF-E3 zur Auswahl. |
| TF-E3 | Zukauf per CSV importieren | 1. Markt > Aggregator<br>2. "Zukauf importieren"<br>3. CSV-Daten einfuegen<br>4. "Pruefen und importieren" | Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20<br>Nachbarbetrieb Uzynagash;Polka;88,0;2026-09-20<br>Nachbarbetrieb Kaskelen;Polana;61,25;2026-09-20<br>(Trennzeichen und Spaltenfolge an die Vorlage der Seite anpassen) | Es erscheint zuerst eine PRUEFUNG, erst danach wird importiert. Summe 289,75 kg auf drei Chargen. |
| TF-E4 | Fehlerhafte CSV wird abgewiesen (NEGATIVTEST) | 1. Wie TF-E3, aber mit fehlerhafter Zeile<br>2. "Pruefen und importieren"<br>3. Danach Liste pruefen: wurde die erste Zeile importiert? | Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20<br>Unbekannter Betrieb XYZ;Polka;abc;2026-09-20 | Der Import wird ABGELEHNT mit Hinweis auf die fehlerhafte Zeile (unbekannter Betrieb, Menge keine Zahl). Die erste, korrekte Zeile darf NICHT importiert worden sein, der Vorgang ist ganz oder gar nicht.<br>Wurde sie importiert: S2. |
| TF-E5 | Kein Zugriff auf Lohn und Personal (NEGATIVTEST) | 1. Adresse aufrufen: /de/dashboard/buero/lohn<br>2. Adresse aufrufen: /de/dashboard/buero/personal | direkte Adressaufrufe | Beide enden mit einer Zugriffsmeldung. Ein Nachbarbetrieb darf weder Loehne noch Personal des Hauptbetriebs sehen.<br>Werden Inhalte angezeigt: S1. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
