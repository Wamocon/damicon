# Testfaelle Rolle: Admin

Anmeldung als `admin@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Der Admin ist die einzige Rolle mit Vollzugriff auf alle 28 Bereiche. Geprueft wird vor allem, ob die Rechteverwaltung selbst stimmt, denn jeder Fehler hier wirkt auf alle anderen Rollen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-A1 | Rechtematrix ist vollstaendig und stimmt mit der Rolle ueberein | 1. Büro > Rollen oeffnen<br>2. Rechtematrix aufklappen<br>3. Zeile "Lohn" suchen<br>4. Spalten Pflücker und Brigade vergleichen | keine Eingabe | Alle 7 Rollen sind gelistet. Pflücker hat bei Lohn nur "ansehen", Brigade hat bei Lohn gar kein Recht. Die Matrix ist keine feste Grafik, sondern zeigt die tatsaechliche Konfiguration. | | |
| TF-A2 | Kundenzugang ausstellen | 1. Büro > Rollen > Kundenzugänge<br>2. "Einladung ausstellen"<br>3. Felder fuellen<br>4. Absenden<br>5. Angezeigten Code notieren | B2B-Kunde: `Almaty Fresh Market`<br>Name: `TEST Aigul Sarsenowa`<br>E-Mail: `test.kunde.20092026@example.com` | Einladung wird angelegt, ein Code erscheint. Hinweis "gilt 14 Tage und nur fuer diese Adresse". Der Code wird fuer TF-K1 gebraucht, also notieren. | | |
| TF-A3 | "Ansicht als" wirkt auf die Anzeige | 1. Oben rechts Rollenumschalter<br>2. Auf "Pflücker" umstellen<br>3. Navigation ansehen<br>4. Zurueck auf Admin | Rolle: `Pflücker` | Die Navigation schrumpft sichtbar auf Dashboard, Lohn und Schulungen. Feld, Hof und Markt verschwinden. Nach dem Zuruecksetzen ist wieder alles da. | | |
| TF-A4 | KI-Anbieter verwalten (nur Admin) | 1. KI-Bereich oeffnen<br>2. Anbieterliste aufrufen<br>3. Pruefen, ob sich ein Anbieter anlegen oder aendern laesst | keine Aenderung speichern, nur pruefen ob die Verwaltung erreichbar ist | Die Anbieterverwaltung ist erreichbar und bedienbar. Kein Schluessel wird im Klartext angezeigt. | | |
| TF-A5 | Steuernummer mit falscher Pruefziffer wird abgelehnt (Negativtest) | 1. Büro > Stammdaten<br>2. Betrieb bearbeiten, Rechtsform `КХ/ФХ` (Feld heisst dann ИИН)<br>3. Ungueltigen Wert eintragen, speichern<br>4. Danach gueltigen Wert eintragen, speichern | 1. zu kurz: `78062130045`<br>2. Pruefziffer falsch: `780621300451`<br>3. gueltig: `780621300453` | Wert 1 wird abgelehnt mit Hinweis auf die Stellenzahl (zwoelf Ziffern erwartet). Wert 2 wird abgelehnt mit Hinweis auf die **Pruefziffer**, das ist eine andere Meldung als bei Wert 1. Wert 3 wird gespeichert. Wird Wert 1 oder 2 angenommen, ist das **S1**. | | |
| TF-A6 | Auditprotokoll und MFA-Status | 1. Büro > Compliance<br>2. Auditprotokoll oeffnen<br>3. Nach dem Eintrag aus TF-A2 suchen<br>4. MFA-Status ansehen | Suchzeitraum: heute | Die in TF-A2 ausgestellte Einladung taucht als Eintrag auf, mit Zeit und handelndem Benutzer. Der MFA-Status je Konto ist erkennbar. | | |
| TF-A7 | Admin sieht alle vier Zonen | 1. Navigation durchgehen<br>2. Je ein Modul aus Feld, Hof, Büro, Markt oeffnen | Feld: Reihenblöcke<br>Hof: Kühlkette<br>Büro: Finanzen<br>Markt: Preislisten | Alle vier Module oeffnen ohne Zugriffsmeldung und zeigen Inhalte. Kein "Kein Zugriff". | | |

---

## Abschluss Rolle Admin

OK: ____  NOK: ____  blockiert: ____

Datum / Tester: ______________________

**Freie Funde** (alles Auffaellige ausserhalb der Testfaelle):

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Kann ein Administrator mit dieser Oberflaeche Rollen und Zugaenge sicher verwalten?

<br><br>
