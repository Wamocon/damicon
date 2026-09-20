# Manueller Test Damicon: Gesamtanleitung

Stand 20.09.2026. Checklistenbasierter explorativer Test aus Anwendersicht, eine Datei je Rolle.

| Datei | Rolle | Testfaelle |
|---|---|---|
| `01-admin.md` | Admin | 7 |
| `02-betriebsleitung.md` | Betriebsleitung | 6 |
| `03-buchhaltung.md` | Buchhaltung | 7 |
| `04-brigade.md` | Brigade | 6 |
| `05-picker.md` | Pflücker | 5 |
| `06-erzeuger.md` | Erzeuger (Nachbarbetrieb) | 5 |
| `07-kunde.md` | B2B-Kunde | 7 (davon 1 ohne Anmeldung) |

Zusammen 43 Testfaelle. Reine Durchsicht ohne Fehler dauert erfahrungsgemaess 3 bis 4 Stunden.

**Die elf Negativtests sind die wichtigsten.** Sie stehen in jeder Datei und sind mit "(Negativtest)" gekennzeichnet. Sie pruefen, was eine Rolle **nicht** koennen darf. Ein System, das zu viel erlaubt, faellt im normalen Durchklicken nie auf.

---

## 1. Vorbereitung

**Umgebung:** https://damicon.vercel.app/de/dashboard

**Diese Instanz verlangt eine Anmeldung.** Es gibt keine freie Demo-Ansicht. Vor dem Test muss geklaert sein, ob je Rolle ein Zugang existiert.

Im Projekt sind sieben Demo-Konten vorgesehen (`supabase/seed-auth.mjs`):

| Rolle | E-Mail |
|---|---|
| Admin | admin@damicon.demo |
| Betriebsleitung | leitung@damicon.demo |
| Buchhaltung | buchhaltung@damicon.demo |
| Brigade | brigade@damicon.demo |
| Pflücker | pfluecker@damicon.demo |
| Erzeuger | erzeuger@damicon.demo |
| Kunde | kunde@damicon.demo |

Das Passwort steht im selben Skript. **Ob diese Konten auf der Vercel-Instanz wirklich angelegt sind, ist nicht geprueft** und haengt davon ab, ob `npm run db:seed-auth` gegen dieses Supabase-Projekt gelaufen ist. Das ist vor Testbeginn zu klaeren. Fehlen die Konten, gibt es zwei Wege:

1. Admin legt die Konten an, oder
2. der Test laeuft lokal im Demo-Modus (`npm run dev` ohne Supabase-Umgebung). Dort ist keine Anmeldung noetig und die Rolle laesst sich oben rechts frei umschalten. **Achtung:** im Demo-Modus sind alle Daten Beispieldaten, Schreibvorgaenge werden nicht wirklich gespeichert und die Rechtepruefung der Datenbank wird nicht mitgetestet. Fuer die Negativtests (Zeilen mit "darf nicht") ist der Demo-Modus deshalb **nicht** aussagekraeftig.

**Als Admin gibt es "Ansicht als".** Damit laesst sich die Darstellung anderer Rollen pruefen, ohne sich neu anzumelden. Das wirkt nur auf die Anzeige; serverseitig gilt weiter die echte Rolle. Fuer die Negativtests also ebenfalls ungeeignet, dort muss man sich wirklich mit dem jeweiligen Konto anmelden.

**Browser:** ein aktueller Chrome, Edge oder Firefox. Je Rolle ein eigenes privates Fenster, sonst ueberlagern sich die Anmeldungen.

**Auch mobil pruefen:** die Feldrollen Brigade und Pflücker arbeiten am Telefon. Mindestens je einen Testfall dieser beiden Rollen auf einem Handy oder im schmalen Browserfenster (Breite etwa 390 px) durchgehen.

---

## 2. Empfohlene Reihenfolge

Mehrere Testfaelle bauen aufeinander auf. In dieser Reihenfolge entstehen die Daten, die der jeweils naechste Schritt braucht:

1. **Admin** TF-A2 (Kunden einladen) legt den Zugang an, den **Kunde** TF-K1 einloest.
2. **Betriebsleitung** TF-L1 (Pflückaufgabe anlegen) erzeugt die Aufgabe, die **Brigade** TF-B1 bis TF-B3 bearbeitet.
3. **Betriebsleitung** TF-L4 (Beleg pruefen) schliesst diese Aufgabe ab und macht sie fuer **Buchhaltung** TF-F2 (Periode berechnen) abrechenbar.
4. **Kunde** TF-K5 (Reklamation melden) erzeugt den Vorgang, den **Buchhaltung** TF-F6 schliesst.

Die uebrigen Testfaelle sind unabhaengig und in beliebiger Reihenfolge moeglich.

---

## 3. So wird ausgefuellt

Jede Zeile ist ein Testfall. Die drei letzten Spalten sind leer und werden beim Testen gefuellt:

- **Ergebnis:** `OK`, `NOK` oder `blockiert` (nicht pruefbar, weil eine Voraussetzung fehlt)
- **Beobachtung:** nur bei NOK oder blockiert. Was war anders als erwartet? Genau das, was am Bildschirm stand, nicht die Deutung.
- **Datum / Tester:** Kuerzel genuegt.

Bei NOK zusaetzlich:

- Bildschirmfoto machen, Dateiname `TF-<Nr>.png`
- Genaue Uhrzeit notieren (fuer die Suche im Protokoll)
- Notieren, ob sich der Fehler beim zweiten Versuch wiederholt

**Explorativ heisst:** die Schritte sind die Pflicht, nicht die Grenze. Wer unterwegs etwas Auffaelliges sieht, notiert es unten unter "Freie Funde", auch wenn es nicht zum Testfall gehoert.

---

## 4. Fehlerklassen

| Klasse | Bedeutung | Beispiel |
|---|---|---|
| S1 | Datenverlust, falsche Zahl in einem Beleg, jemand sieht Fremddaten | Pflücker sieht die Lohnabrechnung eines anderen |
| S2 | Kernfunktion nicht nutzbar, kein Umweg | Pflückaufgabe laesst sich nicht abschliessen |
| S3 | Funktion nutzbar, aber fehlerhaft oder umstaendlich | Falsche Sortierung, Feld haelt Fokus nicht |
| S4 | Schoenheitsfehler | Tippfehler, Abstand, Farbe |

Alles mit falschen Zahlen in Lohn, Rechnung oder Steuer ist mindestens S2, auch wenn es harmlos aussieht.

---

## 5. Was kein Fehler ist

Nicht melden, das ist bekannt und gewollt:

- **Lieferschein-ЭСФ** und **Integrationen** sind Platzhalter. Die Tabellen existieren, es liest und schreibt sie noch nichts.
- **Wetter** zeigt die Temperatursumme an, trifft aber bewusst noch keine Vorhersage und keine Entscheidung.
- **Vorbestellungen** werden vom Buero von Hand bestaetigt, es gibt keine automatische Bestaetigung.
- **QR-Steigen** kann nur anzeigen und drucken. Steigen entstehen ueber die Pflückaufgabe, nicht in diesem Modul.
- **Kanäle** sind reine Anzeige, keine echte Anbindung an WhatsApp oder Kaspi.
- Ein Modul mit dem Hinweis **"Beispieldaten"** zeigt Demo-Inhalte, weil keine Datenbank hinterlegt ist. Das ist eine Meldung der Umgebung, kein Fehler der Anwendung.

Ein Modul, das **"Fehler"** statt "Beispieldaten" anzeigt, ist dagegen sehr wohl zu melden: dann ist eine Datenbank hinterlegt, aber die Abfrage fehlgeschlagen.

---

## 6. Testdaten-Hygiene

Die Tests schreiben echte Daten. Damit der naechste Durchlauf sauber startet:

- Alles selbst Angelegte mit dem Zusatz **"TEST"** im Namen oder Betreff versehen, Beispiel `Vorbestellung TEST 20.09.`
- Nichts loeschen, was vorher schon da war. Auch dann nicht, wenn es falsch aussieht.
- Freigegebene Lohnabrechnungen und ausgestellte Einladungen bleiben bewusst stehen, sie sind nachweispflichtig.

---

## 7. Abschluss

Nach dem Durchlauf je Rolle unten in der Datei ausfuellen:

- Wie viele OK, NOK, blockiert
- Freie Funde
- Gesamteindruck in zwei Saetzen aus Sicht dieser Rolle: Koennte diese Person damit arbeiten?

Die ausgefuellten Dateien und die Bildschirmfotos zurueck an das Projektteam.
