# Testfaelle Rolle: B2B-Kunde

Gesamtanleitung siehe `00-anleitung.md`.

Der Kunde ist die einzige Rolle, die von aussen kommt und sich ueber eine Einladung selbst anlegt. TF-K1 braucht den Code aus **TF-A2**. Fehlt der Code, kann ersatzweise `kunde@damicon.demo` genutzt werden, dann entfaellt TF-K1.

Diese Rolle sieht ein Aussenstehender. Verstaendlichkeit zaehlt hier genauso wie Richtigkeit.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-K1 | Einladung einloesen und Konto anlegen | 1. `/de/einladung` oeffnen<br>2. Code aus TF-A2 **von Hand eintippen**<br>3. Passwort vergeben, Konto anlegen, anmelden<br>4. Gegenprobe a: Code mit Kleinbuchstaben und ohne Bindestriche eingeben<br>5. Gegenprobe b: denselben Code ein zweites Mal einloesen | Code: aus TF-A2<br>E-Mail: `test.kunde.20092026@example.com`<br>Passwort: `TestKunde2026!` | Das Konto entsteht, die Anmeldung gelingt. Gegenprobe a wird trotzdem angenommen, Schreibweise und fehlende Bindestriche werden abgefangen. Gegenprobe b wird **abgelehnt**, der Code ist verbraucht. Funktioniert er mehrfach: **S2**.<br>Zusatzpruefung: der Code darf **nicht** per `?code=` in der Adresszeile vorbelegbar sein, er gehoert nicht in den Browserverlauf. Laesst er sich per Adresse vorbelegen: **S2**. | | |
| TF-K2 | Sortenkatalog ansehen | 1. Markt > Sortenkatalog<br>2. Sorte `Tulameen` oeffnen | keine Eingabe | Sortenname, Typ, Erntefenster und Schalengroesse sind sichtbar und verstaendlich. Keine internen Kennungen wie Datenbank-IDs. | | |
| TF-K3 | Vorbestellung aufgeben | 1. Markt > B2B-Portal<br>2. "Vorbestellung aufgeben"<br>3. Felder fuellen, absenden | Sorte: `Tulameen`<br>Menge: `45` kg<br>Wunschtermin: in 7 Tagen<br>Bemerkung: `TEST Vorbestellung 20.09.` | Die Vorbestellung erscheint mit Status **angefragt**, nicht automatisch bestaetigt. Das Buero bestaetigt von Hand, das ist so gewollt. | | |
| TF-K4 | Eigene Lieferungen und Rechnungshistorie | 1. Markt > B2B-Portal<br>2. "Meine Lieferungen"<br>3. "Rechnungshistorie (Proforma)"<br>4. "Preisliste" | keine Eingabe | Sichtbar sind **nur die eigenen** Lieferungen und Rechnungen, keine anderer Kunden. Die Preisliste zeigt die Preise der eigenen Kundengruppe. Erscheint ein fremder Kundenname: **S1**. | | |
| TF-K5 | Reklamation melden | 1. Markt > Reklamationen<br>2. "Reklamation melden"<br>3. Felder fuellen, absenden | Grund: `Ware bei Anlieferung zu warm`<br>Betreff: `TEST Reklamation 20.09.`<br>Beschreibung: `Kerntemperatur bei Anlieferung 11 Grad statt maximal 4 Grad.`<br>Betroffene Menge: `12` kg<br>Charge: eine aus "Meine Lieferungen" | Der Vorgang wird angelegt und erscheint im eigenen Verlauf. Eine Frist wird gesetzt (automatisch 5 Tage, falls nichts eingetragen). Der Vorgang wird in TF-F6 weiterbearbeitet. | | |
| TF-K6 | Reklamation nicht selbst schliessen (Negativtest) | 1. Eigene Reklamation aus TF-K5 oeffnen<br>2. Nach "Annehmen", "Ablehnen" oder "Als erledigt abschließen" suchen | keine Eingabe | Diese Schaltflaechen fehlen. Der Kunde meldet und verfolgt, entschieden wird im Buero. Kann der Kunde die eigene Reklamation selbst als erledigt schliessen: **S2**. | | |

---

## Zusatz ohne Anmeldung: oeffentliche Herkunftsseite

Dieser Test laeuft **abgemeldet**, in einem privaten Fenster. Er gehoert zur Kundensicht, weil ihn am Ende der Endverbraucher sieht.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis | Ergebnis | Beobachtung |
|---|---|---|---|---|---|---|
| TF-K7 | Herkunft ohne Anmeldung, aber ohne Geheimnisse | 1. Abmelden, privates Fenster<br>2. `/de/herkunft/<Code>` aufrufen mit einem Steigencode aus "Meine Lieferungen"<br>3. Seite vollstaendig durchlesen | Steigen- oder Liefercode aus TF-K4 | Sichtbar: **wo** gewachsen, **wann** gepflückt, ob die **Kühlkette** gehalten hat. Nicht sichtbar: Name des Pflückers, Menge, Preis. Erscheint eines dieser drei: **S1**. | | |

---

## Abschluss Rolle B2B-Kunde

OK: ____  NOK: ____  blockiert: ____

Datum / Tester: ______________________

**Freie Funde:**

<br><br><br>

**Gesamteindruck in zwei Saetzen:** Wuerde ein Einkaeufer einer Handelskette hier ohne Schulung zurechtkommen?

<br><br>
