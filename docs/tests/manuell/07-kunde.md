# Testfaelle Rolle: B2B-Kunde

> **Zum Ausfuellen die Excel-Fassung benutzen:** `testfaelle-kunde.xlsx`
> oder das Blatt "Kunde" in `damicon-testfaelle.xlsx`.
> Diese Datei ist nur die lesbare Vorschau und hat keine Ergebnisspalten.

Anmeldung als: `entsteht in TF-K1, ersatzweise kunde@damicon.demo`

Einzige Rolle, die von aussen kommt und sich ueber eine Einladung selbst anlegt. TF-K1 braucht den Code aus TF-A2. Diese Rolle sieht ein Aussenstehender, Verstaendlichkeit zaehlt hier genauso wie Richtigkeit. TF-K7 laeuft ABGEMELDET.

| Nr | Was geprueft wird | Schritte | Testdaten (Eingabe) | Erwartetes Ergebnis |
|---|---|---|---|---|
| TF-K1 | Einladung einloesen und Konto anlegen | 1. /de/einladung oeffnen<br>2. Code aus TF-A2 VON HAND eintippen<br>3. Passwort vergeben, Konto anlegen, anmelden<br>4. Gegenprobe a: Code klein und ohne Bindestriche<br>5. Gegenprobe b: denselben Code ein zweites Mal einloesen | Code: aus TF-A2<br>E-Mail: test.kunde.20092026@example.com<br>Passwort: TestKunde2026! | Konto entsteht, Anmeldung gelingt. Gegenprobe a wird trotzdem angenommen (Schreibweise wird abgefangen). Gegenprobe b wird ABGELEHNT, der Code ist verbraucht.<br>Zusatz: der Code darf NICHT per ?code= in der Adresszeile vorbelegbar sein. Geht das: S2. |
| TF-K2 | Sortenkatalog ansehen | 1. Markt > Sortenkatalog<br>2. Sorte Tulameen oeffnen | keine Eingabe | Sortenname, Typ, Erntefenster und Schalengroesse sind sichtbar und verstaendlich. Keine internen Kennungen wie Datenbank-IDs. |
| TF-K3 | Vorbestellung aufgeben | 1. Markt > B2B-Portal<br>2. "Vorbestellung aufgeben"<br>3. Felder fuellen, absenden | Sorte: Tulameen<br>Menge: 45 kg<br>Wunschtermin: in 7 Tagen<br>Bemerkung: TEST Vorbestellung 20.09. | Die Vorbestellung erscheint mit Status "angefragt", nicht automatisch bestaetigt. Das Buero bestaetigt von Hand, das ist so gewollt. |
| TF-K4 | Eigene Lieferungen und Rechnungshistorie | 1. Markt > B2B-Portal<br>2. "Meine Lieferungen"<br>3. "Rechnungshistorie (Proforma)"<br>4. "Preisliste" | keine Eingabe | Sichtbar sind NUR die eigenen Lieferungen und Rechnungen, keine anderer Kunden. Die Preisliste zeigt die Preise der eigenen Kundengruppe.<br>Erscheint ein fremder Kundenname: S1. |
| TF-K5 | Reklamation melden | 1. Markt > Reklamationen<br>2. "Reklamation melden"<br>3. Felder fuellen, absenden | Grund: Ware bei Anlieferung zu warm<br>Betreff: TEST Reklamation 20.09.<br>Beschreibung: Kerntemperatur bei Anlieferung 11 Grad statt maximal 4 Grad.<br>Betroffene Menge: 12 kg<br>Charge: eine aus "Meine Lieferungen" | Der Vorgang wird angelegt und erscheint im eigenen Verlauf. Eine Frist wird gesetzt (automatisch 5 Tage, falls nichts eingetragen). Wird in TF-F6 weiterbearbeitet. |
| TF-K6 | Reklamation nicht selbst schliessen (NEGATIVTEST) | 1. Eigene Reklamation aus TF-K5 oeffnen<br>2. Nach "Annehmen", "Ablehnen" oder "Als erledigt abschliessen" suchen | keine Eingabe | Diese Schaltflaechen fehlen. Der Kunde meldet und verfolgt, entschieden wird im Buero.<br>Kann der Kunde die eigene Reklamation selbst schliessen: S2. |
| TF-K7 | Herkunft ohne Anmeldung, aber ohne Geheimnisse (ABGEMELDET) | 1. Abmelden, privates Fenster oeffnen<br>2. /de/herkunft/<Code> aufrufen<br>3. Seite vollstaendig durchlesen | Steigen- oder Liefercode aus TF-K4 | Sichtbar: WO gewachsen, WANN gepflueckt, ob die Kuehlkette gehalten hat.<br>NICHT sichtbar: Name des Pflueckers, Menge, Preis.<br>Erscheint eines dieser drei: S1. |

---

Erzeugt aus `scripts/testfaelle-xlsx-erzeugen.mjs`. Aenderungen dort vornehmen, nicht hier.
