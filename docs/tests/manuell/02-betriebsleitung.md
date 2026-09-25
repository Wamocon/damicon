# Testfaelle Rolle: Betriebsleitung

Anmeldung als `leitung@damicon.demo`. Gesamtanleitung siehe `00-anleitung.md`.

Die Betriebsleitung plant und gibt frei. Der wichtigste Test ist die Wartezeitsperre: nach einer Pflanzenschutzbehandlung darf auf dem Block gesetzlich nicht geerntet werden, und das System muss das von sich aus verhindern.

**Reihenfolge beachten:** TF-L2 sperrt einen Block, TF-L3 prueft die Wirkung. Beide gehoeren zusammen.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-L1 | Pflückaufgabe anlegen und einer Brigade zuweisen | 1. Feld > Pflückaufgaben<br>2. "Neue Pflückaufgabe" ueber der Liste aufklappen<br>3. Felder fuellen<br>4. "Aufgabe anlegen" | Reihenblock: `T-N-A-01`<br>Brigade: `Brigade Nord`<br>Fälligkeit: morgen, `18:00`<br>Zielmenge in kg: `120` | Das Formular klappt zu, die neue Aufgabe oeffnet rechts in der Detailansicht (auf dem Telefon an Stelle der Liste) mit Status **offen** und der Brigade Nord. Ohne Fälligkeit laesst sie sich nicht anlegen. Sie wird in TF-B1 gebraucht. | | |
| TF-L2 | Behandlung erfassen sperrt den Block automatisch | 1. Feld > Pflanzenschutz<br>2. "Behandlung erfassen"<br>3. Felder fuellen, speichern<br>4. Danach Feld > Reihenblöcke oeffnen, Block `T-N-A-03` suchen | Reihenblock: `T-N-A-03`<br>Pflanzenschutzmittel: `Signum`<br>Behandelt am: heutiges Datum<br>Aufwandmenge: `1,5`<br>Einheit: `kg/ha`<br>Durchgeführt von: `TEST Betriebsleitung` | Block `T-N-A-03` steht danach auf Status **wartezeitgesperrt** und zeigt ein "Frei ab"-Datum in der Zukunft. Niemand musste den Status von Hand setzen. | | |
| TF-L3 | Gesperrter Block laesst sich nicht bepflücken (Negativtest) | 1. Feld > Pflückaufgaben<br>2. "Neue Pflückaufgabe" ueber der Liste aufklappen<br>3. Auswahlliste Reihenblock oeffnen<br>4. Nach `T-N-A-03` suchen | Reihenblock: `T-N-A-03` versuchen | Der gesperrte Block **erscheint gar nicht erst** in der Auswahl. Laesst er sich auswaehlen und eine Aufgabe anlegen, ist das **S1** (Ernte trotz gesetzlicher Wartezeit). | | |
| TF-L4 | Fotobeleg pruefen und Aufgabe abschliessen | 1. Feld > Pflückaufgaben<br>2. Pille "Belegprüfung" waehlen und die Aufgabe oeffnen (entsteht in TF-B3)<br>3. Im Reiter Übersicht unter "Nächster Schritt" die Vorschaubilder ansehen, ein Tipp darauf oeffnet den Reiter Fotobelege<br>4. Qualitätsfaktor eintragen, "Freigeben" | Qualitätsfaktor: `1,00` | Status wechselt auf **abgeschlossen**. Erst jetzt ist die Aufgabe fuer die Lohnabrechnung (TF-F2) verwertbar. Ohne Foto darf ein Abschluss nicht moeglich sein. | | |
| TF-L5 | Rotationsplan zeigt den naechsten Pflücktermin | 1. Feld > Rotationsplan<br>2. Plantage `Plantage Talgar` waehlen<br>3. Eintrag zu `T-N-A-03` suchen | Plantage: `Plantage Talgar` | Der Plan zeigt je Reihenblock den naechsten Termin im Rhythmus von 2 bis 3 Tagen. Der in TF-L2 gesperrte Block ist als gesperrt gekennzeichnet oder ausgenommen, nicht normal eingeplant. | | |
| TF-L6 | Lohn ist nur lesbar, nicht aenderbar (Negativtest) | 1. Büro > Lohn oeffnen<br>2. Nach "Freigeben", "Satz anlegen" oder "Periode berechnen" suchen | keine Eingabe | Die Abrechnungen sind **sichtbar**, aber es gibt keine Schaltflaeche zum Anlegen, Berechnen oder Freigeben. Lohn gehoert der Buchhaltung. Erscheint eine solche Schaltflaeche und funktioniert sie, ist das **S1**. | | |

---

## Abschluss Rolle Betriebsleitung

OK: ____  NOK: ____  blockiert: ____

Datum / Tester: ______________________

**Freie Funde:**

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Kann eine Betriebsleiterin damit den Pflückbetrieb planen und die Wartezeiten sicher einhalten?

<br><br>
