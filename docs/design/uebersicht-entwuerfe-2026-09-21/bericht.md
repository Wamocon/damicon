# Fünf Entwürfe für die Übersichtsseite

Stand 21.09.2026, Branch `ui/uebersicht-entwuerfe`.

**Frage:** Was müsste sich an `/dashboard` ändern, damit die Seite einem Betrieb beim Arbeiten hilft und nicht nur Zahlen ablegt?

**Wie die Bilder entstanden sind:**

- Rolle Betriebsleitung (`leitung@damicon.demo`), die Rolle mit den meisten sichtbaren Kennzahlen
- Live-Daten aus Supabase, 8 der 14 Kennzahlen aus echten Datensätzen gerechnet
- Zwei Profile: 1600 px breit und 390 px breit, jeweils die ganze Seite
- Jede Variante ändert genau einen Abschnitt, alles andere bleibt Zeile für Zeile die heutige Seite

**Zum Anschauen im Browser:** `/de/dashboard/entwurf/ist`, dann über die Leiste oben durchschalten. Die Route liegt unter `/dashboard`, trägt also Kopfzeile, Seitenleiste und Rollenwahl wie die echte Seite.

## Was heute auf der Seite steht

Bild: `ist.png`, `ist-handy.png`

- Zwölf Kennzahlkacheln, darunter zwei weitere in einem eigenen Abschnitt, alle gleich groß und gleich gewichtet
- Vier Zonenkarten mit Modulliste und Reifegrad-Pillen
- Zwei Karten „Meilensteine der internen Vorbereitung“ mit Design-Token, Landingpage und Row Level Security
- Seitenhöhe: 2026 px am Schreibtisch, 4665 px auf dem Telefon

Drei Dinge fallen beim Lesen auf:

- Ist und Ziel stehen untereinander, verglichen wird im Kopf des Lesers. „7,7 %“ über „Ziel: < 6 %“ sieht genauso aus wie „100 %“ über „Ziel: 100 %“ — einmal verfehlt, einmal erreicht, gleiche Optik.
- Die Fußzeile jeder Kachel meldet den Bauzustand der Software („Funktion fehlt“), nicht den Stand der Daten. Oben rechts widersprechen sich zwei Pillen: „Live-Daten“ neben „Platzhalterwerte“.
- Die Seite beantwortet keine Frage, die sich morgens stellt. Sie zeigt Zustände, keine offenen Vorgänge.

Die ersten beiden Punkte deckt der Textbericht vom selben Tag ausführlich ab (`docs/text-audit-portal.md`, Punkte 1 und 2). Die Entwürfe 1, 4 und 5 setzen dort an.

## 1 Zielampel

Bild: `v1.png`, `v1-handy.png`

- Jede Kachel färbt ihre linke Kante nach dem Abstand zum Zielwert: rot verfehlt, gelb knapp, grün im Ziel
- Die Kacheln stehen nach Dringlichkeit sortiert, das am weitesten Entfernte oben links
- Statt der widersprüchlichen Pillen steht in der Kopfzeile die Zählung: 6 verfehlt, 2 knapp, 4 im Ziel
- Der Platzhalter-Vorbehalt hängt an der einzelnen Kachel, nicht mehr an der Sektion
- Seitenhöhe 2078 px, also 52 px mehr als heute

Was die Variante braucht: einen Soll-Ist-Vergleich. Das Feld `ziel` ist heute eine fertige Zeichenkette („< 6 %“, „> 700 ₸/kg“, „Ausgangswert“), der Entwurf holt Operator und Zahl per Parser heraus (`zielstand.ts`). Der Kommentar über `kpis` in `src/lib/domain/kpis.ts` beschreibt bereits, was stattdessen hingehört: ein Schema aus Operator, Zahl und Einheit. Wird die Variante übernommen, fällt der Parser mit diesem Schema wieder weg.

Offen ist die Grenze zwischen „knapp“ und „verfehlt“. Im Entwurf stehen 10 Prozent Abweichung, gegriffen. Das gehört mit dem Kunden festgelegt, zusammen mit den Zielwerten am 01.10.

## 2 Tageslage

Bild: `v2.png`, `v2-handy.png`

- Über den Kennzahlen stehen vier Zahlen des laufenden Tages, jede ein Verweis in das Modul dahinter
- Gezählt wird aus denselben Tabellen, aus denen die Module lesen: offene Pflückaufgaben, Reihenblöcke in Wartezeit (mit dem Hinweis, wie viele davon zur Freigabe fällig sind), Reklamationen offen oder in Prüfung, abgelaufene Dokumente
- Rechtefilter wie in der Seitenleiste: wer ein Modul nicht öffnen darf, sieht auch seine Zahl nicht
- Im Bild: 4 Aufgaben, 2 Blöcke gesperrt und beide freigabefällig, 2 Reklamationen, 1 abgelaufenes Dokument
- Seitenhöhe 2248 px, 222 px mehr als heute

Das ist die einzige Variante, die der Seite etwas hinzufügt, statt etwas umzustellen. Sie kostet vier zusätzliche Abfragen beim Aufbau der Seite. Für die Rollen ohne betriebsweite Kennzahlen (Pflücker, Erzeuger, Kunde) wäre sie der erste Inhalt überhaupt auf der Startseite — heute sehen die eine Überschrift, die 14 Kennzahlen verspricht, und kein einziges Feld darunter.

## 3 Zahlen bei der Zone

Bild: `v3.png`, `v3-handy.png`

- Der obere Kennzahlenblock entfällt, jede Zonenkarte trägt ihre eigenen Kennzahlen
- Die Zuordnung steht längst im Datenmodell (`Kpi.zone`), sichtbar war sie nicht
- Zwei Rasterspalten statt vier, damit die Karte Platz für die Zahlen hat
- Seitenhöhe 1900 px, 126 px weniger als heute; auf dem Telefon 3870 px statt 4665 px, also 17 Prozent kürzer

Der Preis: Aus zwölf Kacheln in zwei Reihen werden vier Gruppen zu drei bis vier Zahlen. Wer alle Kennzahlen nebeneinander vergleichen will, kann das hier nicht mehr. Dafür steht jede Zahl neben dem Weg zu den Daten, aus denen sie stammt.

Auf dem Telefon ist das die klarste der fünf Varianten: eine Zone, ihre Zahlen, ihre Module, nächste Zone.

## 4 Datenstand statt Projektplan

Bild: `v4.png`, `v4-handy.png`

- Die beiden Meilensteinkarten verschwinden aus der Betriebsübersicht
- An ihre Stelle tritt eine Zeile „Stand der Daten“: Quelle, wie viele Kennzahlen aus wie vielen Datensätzen gerechnet sind, Zeitpunkt des Abrufs
- Die Fußzeile der Kacheln nennt nicht mehr den Bauzustand, sondern den Datenstand: „aus 10 Datensätzen“ statt „Funktion fehlt“, „Platzhalter, noch nicht gemessen“ statt „Erfassung fehlt“
- Die Pille „Platzhalterwerte“ ist weg, ihr Vorbehalt steht jetzt an den einzelnen Kacheln, die ihn betreffen
- Seitenhöhe 1707 px, 319 px weniger als heute; auf dem Telefon 788 px kürzer

Das ist die Variante mit dem größten Platzgewinn und dem kleinsten Eingriff in die Struktur. Sie setzt Punkt 1 und Punkt 2 des Textberichts um. Wohin der Projektstand wandert, ist offen — der Entwurf blendet für Administratoren einen Satz dazu ein, ein Zielort ist nicht gebaut. Die Seite `/dashboard/sicherheit` gibt es bereits und wäre ein Kandidat.

## 5 Liste statt Kacheln

Bild: `v5.png`, `v5-handy.png`

- Alle vierzehn Kennzahlen stehen als Zeilen in einer Tabelle, mit eigenen Spalten für Zone, Ist, Ziel und Zielstand
- Sortiert nach Abstand zum Ziel, die zwei erweiterten Kennzahlen hängen hinten dran und sind als solche gekennzeichnet
- Der zweite Abschnitt „Weitere Kennzahlen“ entfällt damit
- Gebaut mit `DataTable` aus dem Kit, kein neuer Baustein
- Seitenhöhe 2082 px, praktisch wie heute — aber mit allen vierzehn Zahlen in einem Block und zwei Spalten mehr Information je Zahl

Am Schreibtisch ist das die dichteste Darstellung: vierzehn Zeilen lassen sich von oben nach unten vergleichen, was zwischen Kacheln nie gelingt.

Auf dem Telefon kippt das. `DataTable` macht unter `md` aus jeder Zeile eine Karte mit fünf beschrifteten Feldern, die Seite wächst auf 6793 px — 46 Prozent länger als heute und mehr als anderthalbmal so lang wie Variante 3. Wer diese Variante will, braucht für schmale Geräte eine eigene Darstellung.

## Die Zahlen nebeneinander

| Variante | 1600 px | gegen heute | 390 px | gegen heute |
|---|---|---|---|---|
| Ist-Zustand | 2026 px | — | 4665 px | — |
| 1 Zielampel | 2078 px | +52 | 4784 px | +119 |
| 2 Tageslage | 2248 px | +222 | 5358 px | +693 |
| 3 Zahlen bei der Zone | 1900 px | −126 | 3870 px | −795 |
| 4 Datenstand | 1707 px | −319 | 3877 px | −788 |
| 5 Liste | 2082 px | +56 | 6793 px | +2128 |

Alle sechs Messungen enthalten die Wählerleiste der Vergleichsansicht, rund 190 px am Schreibtisch. Der Aufschlag ist in allen Zeilen gleich, der Vergleich untereinander also belastbar.

## Was sich kombinieren lässt

- 1 und 4 greifen beide in die Kachel, aber an verschiedenen Stellen: die Ampel färbt Kante und Zielzeile, der Datenstand ersetzt die Fußzeile. Zusammen ergibt das eine Kachel, die Ziel und Datenstand trennt.
- 2 und 4 berühren sich nicht. Die Tageslage kommt oben dazu, der Projektplan geht unten weg — zusammen bleibt die Seite ungefähr so lang wie heute und trägt statt Meilensteinen offene Vorgänge.
- 3 und 5 schließen sich aus, beide bestimmen, wo die Kennzahlen stehen.
- 3 und 4 zusammen wären die kürzeste mögliche Seite: rechnerisch rund 1580 px am Schreibtisch und etwas über 3080 px auf dem Telefon. Gemessen ist diese Kombination nicht.

## Was noch offen ist

- Die Grenze zwischen „knapp“ und „verfehlt“ (Variante 1) ist gegriffen und gehört mit dem Kunden festgelegt.
- Der Zielort für den Projektstand (Variante 4) ist nicht gebaut.
- Variante 5 braucht für schmale Geräte eine eigene Darstellung, sonst verschlechtert sie das Telefon deutlich.
- Der Kopftext der Seite („Aggregator Umland Almaty. Die Hauptfunktionen laufen gegen die Datenbank …“) spricht in allen sechs Bildern weiter über das Projekt statt über den Betrieb. Keine der Varianten fasst ihn an, er steht im Textbericht.
- Die Vergleichsansicht unter `/dashboard/entwurf/…` samt `src/components/dashboard/entwuerfe/` und den Texten unter `dashboard.entwurf` ist Entwurfsmaterial. Sie fällt weg, sobald entschieden ist, was in die Übersicht wandert.
