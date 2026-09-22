# E2E-Durchlauf: von der Vorbestellung bis zum Deckungsbeitrag

Acht Phasen, sechs Rollen, rund fünfzehn Module. Der rote Faden ist der
Qualitätsfaktor: Die Brigade meldet die Menge, darf sie aber nicht bewerten.
Die Leitung setzt den Faktor nach Sichtung des Fotobelegs. Drei Phasen später
bestimmt dieselbe Zahl die Lohnabrechnung — ohne Export, ohne zweite Tabelle.

Diese Datei ersetzt die in der Prozessgrafik erwähnte `DEMO.md`, die im
Projekt nie angelegt wurde.

## Vorbereitung

```powershell
npm run dev                                                    # eigenes Fenster
npm run db:seed-auth                                           # einmalig
node --env-file=.env.local supabase/testdaten.mjs --sockel     # einmalig
node --env-file=.env.local supabase/testdaten.mjs --lauf=1     # je Durchlauf
```

Der Sockel schafft drei Voraussetzungen, ohne die der Ablauf stolpert: eine
aktive Preisliste (sonst sieht der Kunde keine Preise), ein Kontingent für den
Demo-Kunden (sonst reserviert Phase 2 stillschweigend nichts) und eine frische
Wartezeitsperre (sonst zeigt der Negativtest in Phase 2 nichts).

Je Rolle ein eigenes privates Fenster, sonst überlagern sich die Anmeldungen.
Passwort für alle Konten: `DamiconDemo2026!`

### Startwerte je Durchlauf

| | Lauf 1 | Lauf 2 | Lauf 3 |
|---|---|---|---|
| Reihenblock | `T-N-A-05` | `T-N-A-06` | `T-N-A-07` |
| Vorbestellung | 90 kg Polka | 75 kg Polka | 120 kg Polka |
| Liefertermin | heute +3 | heute +4 | heute +5 |
| Lohnperiode | laufende Woche | Vorwoche | Vorvorwoche |

Immer **nur einen Lauf gleichzeitig** einspielen. Liegen mehrere an, sieht der
Kunde mehrere offene Vorbestellungen, und in Phase 1 ist nicht mehr klar,
welche gemeint ist.

Nach dem Durchlauf abräumen, dann steht derselbe Startzustand wieder bereit:

```powershell
node --env-file=.env.local supabase/testdaten.mjs --lauf=1 --entfernen
node --env-file=.env.local supabase/testdaten.mjs --lauf=1
```

---

## Phase 1 — Auftrag

**Rolle: B2B-Kunde** (`kunde@damicon.demo`), Markt › B2B-Portal

Vorbestellung aufgeben: Sorte **Polka**, Menge **90 kg**, Wunschtermin in drei
Tagen.

Sie erscheint mit Status **angefragt**, nicht bestätigt. Das Büro bestätigt von
Hand — das ist so gewollt. Der Preis von 2100 ₸/kg stammt aus der Preisliste.

## Phase 2 — Planung

**Rolle: Betriebsleitung** (`leitung@damicon.demo`)

1. Markt › B2B-Portal: die Vorbestellung **bestätigen**. Das Kontingent für
   Polka sinkt um 90 kg — `vorbestellung_kontingent_abgleichen()` schreibt
   `reserviert_kg` fort, kein Formular tut das.
2. Feld › Reihenblöcke: **T-N-A-05** suchen, Status von *bepflanzt* auf
   **erntereif** setzen. (Feld › Rotationsplan zeigt dazu den nächsten Termin
   im Rhythmus von zwei bis drei Tagen.)
3. Feld › Pflückaufgaben: neue Aufgabe auf **T-N-A-05**, Brigade Nord,
   Zielmenge 90 kg. Mit der Aufgabe entsteht automatisch eine **Charge** —
   `charge_zur_aufgabe_anlegen()`, nicht die Oberfläche.

**Negativtest.** Denselben Statuswechsel an **T-N-A-04** versuchen. Die
Datenbank weist ihn ab: *„Reihenblock T-N-A-04 ist bis <Datum>
wartezeitgesperrt."* In der Auswahlliste für eine neue Pflückaufgabe erscheint
er gar nicht erst. Lässt er sich freigeben oder bepflücken, ist das **S1** —
Ernte trotz gesetzlicher Wartezeit.

Die Regel liegt im Trigger `reihenblock_sperre_pruefen()`, nicht im Formular.
Sie greift auch, wenn jemand die Anwendung umgeht.

## Phase 3 — Ernte

**Rolle: Brigade** (`brigade@damicon.demo`), am besten am Telefon

1. Feld › Pflückaufgaben: Aufgabe **annehmen**, dann **Pflücken starten**.
   Der Status geht *offen → angenommen → in Arbeit*.
2. Hof › QR-Steigen: eine Steige erfassen. Hof › Kühlkette: Messung **3,5 °C**.
   Die 60-Minuten-Regel urteilt in der Datenbank — `kuehlkette_bewerten()`
   rechnet `minuten_seit_pfluecken` und das Ergebnis selbst.
3. Menge melden: **41,2 kg**, Ausschuss 2 kg. Status wechselt auf
   **Belegprüfung**.

Die Brigade kann hier nicht weiter. Sie hat kein Freigaberecht — vier Augen.

## Phase 4 — Freigabe

**Rolle: Betriebsleitung**

Feld › Pflückaufgaben: Fotobeleg prüfen, **Qualitätsfaktor 1,06** setzen,
Aufgabe abschließen.

Ab hier ist kein Rückweg. Menge, Ausschuss und Faktor sind unveränderlich, für
jede Rolle, auch für die Administration. Ohne Fotobeleg darf der Abschluss
nicht möglich sein.

## Phase 5 — Auslieferung

**Rolle: Betriebsleitung**

1. Hof › Logistik: Lieferung anlegen, Transportmessung **2,9 °C**,
   Übergabequittung erfassen.
2. Hof › QR-Steigen: QR-Etikett je Steige drucken.

## Phase 6 — Nachweis

1. **Rolle: B2B-Kunde** — Markt › B2B-Portal: die Lieferung erscheint,
   Proforma aus der Preisliste.
2. **Ohne Anmeldung**, privates Fenster: `/de/herkunft/<Code>` mit dem
   Steigencode aufrufen.

   Sichtbar: wo gewachsen, wann gepflückt, ob die Kühlkette hielt. **Nicht**
   sichtbar: Name des Pflückers, Menge, Preis. Erscheint eines davon, ist das
   **S1**. `herkunftsauskunft()` gibt diese Felder gar nicht erst heraus.

## Phase 7 — Abrechnung

**Rolle: Buchhaltung** (`buchhaltung@damicon.demo`), Büro › Lohn

1. **Periode berechnen** für die laufende Woche. Je Pflücker entsteht eine
   Abrechnung. In den Positionen steht der **Qualitätsfaktor 1,06** — dieselbe
   Zahl, die die Leitung in Phase 4 gesetzt hat, drei Phasen und zwei Rollen
   entfernt.
2. Büro › Finanzen: Kostenträger und Buchung erzeugen, Deckungsbeitrag ansehen.

Das Finanzjournal ist append-only. Eine Korrektur ist eine Gegenbuchung, kein
Überschreiben — auch nicht für die Administration.

## Phase 8 — Kontrolle

**Rolle: Pflücker** (`pfluecker@damicon.demo`), Büro › Lohn

Die eigene Abrechnung öffnen. Sichtbar ist **genau eine Zeile**: die eigene.
Kein zweiter Name, auch nicht über Suche oder Filter. Erscheint ein fremder
Name mit Betrag, ist das **S1** — sofort melden und nicht weitertesten.

Die Filterung macht RLS über `profiles.pfluecker_id`, nicht die Oberfläche.

---

---

## Die Scanner getrennt üben

Beide Kamera-Scanner sitzen in der Nachweiskette einer Pflückaufgabe
(Feld › Pflückaufgaben, eine Aufgabe öffnen). Im Durchlauf entstehen die
Steigen erst in Phase 3 — vorher gibt es nichts zu scannen. Wer die Kamera
vorab prüfen will, legt das Übungspaket an:

```powershell
node --env-file=.env.local supabase/testdaten.mjs --scanner
node --env-file=.env.local supabase/testdaten.mjs --scanner --entfernen
```

Es entsteht die Pflückaufgabe **PA-SCAN-UEBUNG** auf Block T-N-B-09 mit sechs
Steigen, dazu Pflückzeitpunkt, Vorkühlung nach 38 Minuten und eine Messung von
3,5 °C. Die Aufgabe bleibt auf **in Arbeit** — nach dem Abschluss wären die
Steigen fest und eine Stichprobenkontrolle nicht mehr möglich.

Das Paket ist vom Durchlauf unabhängig und lässt sich jederzeit anlegen und
abräumen, ohne Lauf 1 zu berühren.

### Was womit gescannt wird

| Scanner | QR-Inhalt | Wo |
|---|---|---|
| **Ausweis** | der rohe Code, z. B. `MAL-0417` | Nachweiskette, beim Erfassen von Steige und Arbeitszeit |
| **Steige** | Herkunfts-URL mit `?steige=<Code>` | Nachweiskette, zum Finden und Kontrollieren einer Steige |

Die Etiketten zum Vorhalten stehen unter **Hof › QR-Steigen** — dort werden die
vierzig neuesten Steigen als QR angezeigt und lassen sich drucken. Die sechs
aus dem Übungspaket stehen ganz oben.

Ein QR dient zwei Zwecken: Die Kamera-App eines Kunden landet auf der
öffentlichen Herkunftsseite, die den Parameter ignoriert; der Scan im
Dashboard liest die Steigenkennung heraus.

### Was die Herkunftsseite zeigt — und was nicht

Der öffentliche Code des Übungspakets steht in der Ausgabe des Skripts. Die
Seite zeigt Reihenblock, Sorte, Erntedatum, Vorkühlung nach 38 Minuten und
"Kühlkette eingehalten".

Nicht sichtbar: **Name des Pflückers, Menge, Preis.** `herkunftsauskunft()`
gibt diese Felder gar nicht erst heraus — die Sperre liegt in der Funktion,
nicht in der Seite. Erscheint eines davon, ist das **S1**.

---

## Zwölf Monate Historie

Für Kennzahlen, Auswertungen und Trends reicht der Startzustand eines
Durchlaufs nicht — sie brauchen Vergangenheit. Das Jahrespaket legt sie an:

```powershell
node --env-file=.env.local supabase/testdaten.mjs --jahr
node --env-file=.env.local supabase/testdaten.mjs --jahr --entfernen
```

Es deckt den Zeitraum bis kurz vor den Seed-Bestand ab. Der Seed beginnt am
20.08.2026, deshalb endet das Paket am 14.08.2026 und reicht dreizehn Monate
zurück. Zusammen ergibt das eine lückenlose Historie ohne eine einzige
Seed-Zeile anzufassen.

### Die Saison ist echt, nicht gleichverteilt

Himbeeren tragen in Almaty nicht das ganze Jahr. Das Paket folgt den
Erntefenstern der vier Sorten aus `seed.sql`:

| Zeitraum | Was passiert |
|---|---|
| Juni–Juli | Tulameen, sommertragend |
| August–Oktober | Polka, Polana, Kweli — remontierend, Hauptsaison |
| November–April | keine Ernte. Rückschnitt, Schulungen, Pflanzenschutz |
| Mai | Anlauf, erste Durchgänge |

Ein gleichmäßig gefülltes Jahr wäre fachlich falsch und würde jedem
Fachkundigen in der Vorführung auffallen.

### Was entsteht

Rund 4800 Zeilen über alle Bereiche: etwa 117 Pflückaufgaben mit Chargen,
2400 Steigen, 350 Arbeitszeiten, 117 Kühlmessungen, 40 Touren mit Lieferungen
und Transporttemperaturen, 35 Lohnabrechnungen, 117 Kostenträger mit 350
Buchungen, 1580 Wettermessungen, Vorbestellungen, Zukauf, Reklamationen,
Schulungsteilnahmen und Einarbeitungsfortschritt.

`npm run db:bestand` zeigt am Ende, über welchen Zeitraum sich jeder Bereich
erstreckt. Alle liegen zwischen 13 und 14 Monaten.

### Zahlen, die zueinander passen

Drei Größen sind bewusst gekoppelt, weil sonst Kennzahlen entstehen, die kein
Betrieb kennt:

- **Arbeitszeit folgt der Erntemenge.** Die Kennzahl „Pflückleistung" rechnet
  kg je Stunde über genau diese beiden Größen. Das Paket zielt auf 5,6 bis 7,0
  kg/h und trifft im Mittel 6,2 — die Baseline des Projekts liegt bei 6,1.
- **Der Qualitätsfaktor folgt der Ausschussquote.** Unter dem Ziel von fünf
  Prozent steigt er, darüber fällt er, immer im Korridor 0,90 bis 1,10.
- **Steigengewichte summieren auf die Istmenge.** Dieselbe Regel wie im Seed.

Nicht alles ist grün: etwa jede siebzehnte Charge reißt die
60-Minuten-Regel bei der Vorkühlung. Eine Historie ohne einen einzigen Verstoß
macht die Kennzahl „Kühlkette eingehalten" bedeutungslos.

### Was beim Entfernen stehen bleibt

`--jahr --entfernen` räumt alles vor dem Stichtag ab — bis auf die
**Finanzbuchungen und ihre Kostenträger**. `finance_ledger_entries` hängt an
`block_ledger_mutation()`, und die kennt keine Ausnahme für den
service_role-Weg. Das Skript benennt sie am Ende, statt sie stillschweigend zu
übergehen.

Deshalb legt das Paket seine Buchungen **ohne Chargenbezug** an: Ein
`charge_id` in einer Buchung macht die Charge dauerhaft unlöschbar, weil das
`ON DELETE SET NULL` ein UPDATE auf eine append-only-Tabelle wäre. Der
Deckungsbeitrag je Kostenträger trägt trotzdem; nur die Sicht
`deckungsbeitrag_je_charge` bleibt für das Jahr leer.

Ein zweiter Lauf legt nichts doppelt an. Jeder Teilschritt prüft selbst, ob er
nötig ist — so lässt sich ein halb angelegtes Paket vervollständigen, statt es
vorher abräumen zu müssen.
## Was am Ende stehen bleibt

Ein abgeräumter Lauf hinterlässt drei Dinge, die sich nicht löschen lassen:

- die **Finanzbuchungen** aus Phase 7 (`finance_ledger_entries`)
- die Einträge im **Auditprotokoll** (`audit_events`)
- der **Verlauf** einer Reklamation, falls eine bearbeitet wurde

Alle drei hängen an `block_ledger_mutation()`, und die kennt keine Ausnahme,
auch nicht für den service_role-Schlüssel. Das ist Absicht: Es sind Belege,
keine Sachstände.

Alles andere — Pflückaufgabe, Charge, Steigen, Kühlmessungen, Lieferung,
Transportmessungen, Lohnabrechnung — räumt `--entfernen` restlos ab.
