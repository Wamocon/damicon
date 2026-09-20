# Testfaelle Rolle: Erzeuger (Nachbarbetrieb)

Anmeldung als `erzeuger@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Ein Nachbarbetrieb, der seine Ware in den Aggregator verkauft. Er sieht die eigenen Lieferungen und die eigene Abrechnung, nicht den Betrieb der anderen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-E1 | Eigene Lieferungen im Dashboard | 1. Anmelden<br>2. Dashboard ansehen<br>3. Navigation durchsehen | keine Eingabe | Sichtbar sind Dashboard, Reihenblöcke, Pflückaufgaben, Finanzen, Dokumente, Aggregator, B2B-Portal und Schulungen. Kein Lohn, kein Personal, keine Rollen. | | |
| TF-E2 | Nachbarbetrieb aufnehmen | 1. Markt > Aggregator<br>2. "Nachbarbetrieb aufnehmen"<br>3. Felder fuellen, absenden | Name: `TEST Nachbarbetrieb Talgar`<br>Ort: `Talgar`<br>Ansprechperson: `R. Baitulin` | Der Betrieb erscheint in der Liste und steht danach beim Import in TF-E3 zur Auswahl. | | |
| TF-E3 | Zukauf per CSV importieren | 1. Markt > Aggregator<br>2. "Zukauf importieren"<br>3. CSV-Daten in das Feld einfuegen<br>4. "Prüfen und importieren" | Drei Zeilen, Sorte und Menge realistisch:<br>`Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20`<br>`Nachbarbetrieb Uzynagash;Polka;88,0;2026-09-20`<br>`Nachbarbetrieb Kaskelen;Polana;61,25;2026-09-20`<br>(Trennzeichen und Spaltenfolge an die Vorlage der Seite anpassen) | Es erscheint zuerst eine **Pruefung**, erst danach wird importiert. Summe 289,75 kg auf drei Chargen. Bei einem Fehler in einer Zeile darf **keine** Zeile importiert werden, der Vorgang ist entweder ganz oder gar nicht. | | |
| TF-E4 | Fehlerhafte CSV wird abgewiesen (Negativtest) | 1. Wie TF-E3, aber mit fehlerhafter Zeile<br>2. "Prüfen und importieren" | `Nachbarbetrieb Kaskelen;Tulameen;140,5;2026-09-20`<br>`Unbekannter Betrieb XYZ;Polka;abc;2026-09-20` | Der Import wird **abgelehnt** mit Hinweis auf die fehlerhafte Zeile (unbekannter Betrieb, Menge keine Zahl). Die erste, korrekte Zeile darf **nicht** importiert worden sein. Gegenprobe: Liste pruefen. Wurde sie importiert: **S2**. | | |
| TF-E5 | Kein Zugriff auf Lohn und Personal (Negativtest) | 1. Adresse direkt aufrufen: `/de/dashboard/buero/lohn`<br>2. Adresse direkt aufrufen: `/de/dashboard/buero/personal` | direkte Adressaufrufe | Beide enden mit einer Zugriffsmeldung. Ein Nachbarbetrieb darf weder Loehne noch Personal des Hauptbetriebs sehen. Werden Inhalte angezeigt: **S1**. | | |

---

## Abschluss Rolle Erzeuger

OK: ____  NOK: ____  blockiert: ____

Datum / Tester: ______________________

**Freie Funde:**

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Wuerde ein Nachbarbetrieb seine Ware ueber dieses Portal liefern wollen?

<br><br>
