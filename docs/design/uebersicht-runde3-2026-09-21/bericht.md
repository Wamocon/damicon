# Übersichtsseite, dritte Runde: drei Box-Zuschnitte

Stand 21.09.2026, Branch `ui/uebersicht-entwuerfe`.

Aus Runde 2 sind Zielband (dort Variante 1) und Modulknöpfe (dort Variante 4) gewählt. Beides steckt fest in allen drei Zuständen dieser Runde. Offen ist nur noch, wie die Abschnitte der Seite in Boxen sitzen.

**Zum Anschauen:** `/de/dashboard/entwurf/m1`, dann über die Leiste durchschalten. Der `ist`-Zustand bleibt als Bezugspunkt.

## Was in allen drei steckt

- **Zielband in jeder Kennzahlbox:** gefüllte Länge ist der Istwert, der senkrechte Strich die Zielmarke, die Farbe der Zielstand. Platzhalter bekommen kein Band, weil sie keinen Zielstand haben.
- **Module als Knöpfe:** ein Klick von der Startseite in jedes Modul statt zwei.
- **Beschreibung am Schreibtisch:** unter dem Kurznamen steht das volle Label der Kennzahl, sobald die Karte breit genug ist. Gemessen wird die Karte, nicht das Fenster — am Schreibtisch hat eine Zonenkarte rund 600 px, auf dem Telefon 350 px. Dort bleibt es beim Kurznamen und dem Tooltip.
- **Wechselnder Satz in der Begrüßung:** acht Sätze, die auf die Arbeit zeigen statt auf den Leser. Der Satz wechselt dreimal am Tag, zu den Grenzen der Tageszeit, und bleibt dazwischen stehen. Bestimmt wird er serverseitig aus Datum und Tageszeit — gewürfelt im Browser wäre er nach der Hydration ein anderer als im ausgelieferten HTML, und bei jedem Aufruf ein neuer Satz wäre auf einer Seite, die jemand zwanzigmal am Tag öffnet, bloße Unruhe.
- **Boxen:** Begrüßung, Zonen und Meilensteine sitzen jeweils in einer Box statt frei auf dem Hintergrund.

Nebenbei behoben: In einer 145 px breiten Box stand „Ziel > 700 T…“ — der Zielwert wurde abgeschnitten. Die Fußzeile bricht jetzt um, statt zu kürzen.

## A Drei Boxen

Bild: `m1.png`, `m1-handy.png`

- Begrüßung, Zonen und Meilensteine je eine Box, die vier Zonenkarten liegen als eigene Karten in der Zonenbox
- Zwei Zonen nebeneinander, je drei Kennzahlen pro Reihe
- 2313 px am Schreibtisch, 4620 px auf dem Telefon

Die klassische Schachtelung: Box in Box. Gibt der Seite klare Blöcke, kostet aber zwei Rahmen übereinander.

## B Flach innen

Bild: `m2.png`, `m2-handy.png`

- Dieselben drei Boxen, die Zonen darin aber ohne eigenen Rahmen, getrennt durch Linien
- Die Zonen stehen untereinander über die volle Breite. Dadurch passen alle vier Kennzahlen einer Zone in eine Reihe und die Module in eine Zeile
- 2800 px am Schreibtisch — die längste der drei. Auf dem Telefon mit 4463 px die kürzeste

Am Schreibtisch die ruhigste Darstellung: weniger Rahmen, breitere Kennzahlboxen, kein Abschneiden. Der Preis sind 487 px mehr Höhe, weil vier Zonen untereinander stehen statt zwei mal zwei.

## C Zwei Boxen

Bild: `m3.png`, `m3-handy.png`

- Begrüßung und Zonen wachsen zu einer Box zusammen, getrennt durch eine Linie
- Neben der Anrede steht die Lage des Betriebs: „5 außerhalb des Ziels“, „alle im Ziel“ oder „noch keine Messung“. Gezählt wird nur Gemessenes
- Darunter die Zonen wie in A, dann die Meilensteinbox
- 2288 px am Schreibtisch, 4628 px auf dem Telefon — die kürzeste am Schreibtisch

Die Lage neben der Anrede beantwortet beim ersten Blick, ob der Tag ruhig wird. Sie ist die Idee aus Runde 2, Variante 2, aber betriebsweit statt je Zone.

## Die Zahlen nebeneinander

| Zustand | 1600 px | 390 px |
|---|---|---|
| Ist-Zustand | 2026 px | 4665 px |
| Basis aus Runde 2 | 1939 px | 4010 px |
| A Drei Boxen | 2313 px | 4620 px |
| B Flach innen | 2800 px | 4463 px |
| C Zwei Boxen | 2288 px | 4628 px |

Alle drei sind länger als die Basis aus Runde 2. Das kostet die Runde bewusst: die Beschreibung in jeder Box braucht zwei Zeilen, die Zielbänder eine weitere, und jeder Abschnitt trägt jetzt einen Rahmen mit Innenabstand. Gegenüber dem heutigen Ist-Zustand liegen A und C rund 280 px darüber, B rund 770 px.

Alle Messungen enthalten die Wählerleiste der Vergleichsansicht, rund 190 px am Schreibtisch.

## Was noch offen ist

- Der Meilensteinblock steht weiter unter jeder Variante, jetzt in einer eigenen Box. Ob er auf der Startseite bleibt, ist seit Runde 1 offen. Er ist mit rund 520 px der längste Einzelteil.
- Die acht Sätze sind ein erster Satz. Sie stehen unter `dashboard.begruessung.spruch` in vier Sprachen und lassen sich ohne Codeänderung austauschen oder erweitern; nur `spruchAnzahl` in `tageszeit.ts` muss zur Anzahl passen.
- Der Wechsel dreimal täglich ist eine Setzung. Auf einen Wechsel je Aufruf umzustellen, wäre eine Zeile in `spruchIndex()`.
- Für die Rolle `picker` ist die Seite weiterhin fast leer: keine Kennzahlen, zwei Zonen ohne Module. Das Zusammenfalten leerer Zonen aus Runde 2 ist in dieser Runde nicht enthalten.
- Der Dunkelmodus ist in keiner Runde geprüft worden. Alle Bilder sind im hellen Modus entstanden.
- Die Vergleichsansicht unter `/dashboard/entwurf/…` ist Entwurfsmaterial und fällt mit der Entscheidung weg.
