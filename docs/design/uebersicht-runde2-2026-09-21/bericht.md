# Übersichtsseite, zweite Runde: Basis und fünf Weiterentwicklungen

Stand 21.09.2026, Branch `ui/uebersicht-entwuerfe`.

Die erste Runde ist entschieden: die Zonenkarte mit eigenen Kennzahlen (damals Variante 3) trägt die Übersichtsseite. Diese Runde räumt sie auf, gibt ihr eine Begrüßung und stellt fünf Weiterentwicklungen zum Vergleich.

**Zum Anschauen:** `/de/dashboard/entwurf/basis`, dann über die Leiste durchschalten. Der `ist`-Zustand bleibt als Bezugspunkt stehen.

**Wie die Bilder entstanden sind:** Rolle Betriebsleitung, Live-Daten, 1600 px und 390 px breit. Für Variante 5 zusätzlich mit `pfluecker@damicon.demo`, weil sie nur bei Rollen mit wenigen Rechten etwas bewirkt. Keine Konsolenfehler in beiden Rollen.

## Was an der Basis korrigiert ist

Bild: `basis.png`, `basis-handy.png`

Drei Mängel der ersten Fassung, alle drei in der Kennzahlbox:

- **Die Boxen waren unterschiedlich hoch.** Der Name brauchte mal eine, mal zwei Zeilen. Jetzt ist der Platz dafür fest (zwei Zeilen), die Box füllt ihre Rasterzelle, und das Raster setzt `auto-rows-fr` — damit sind auch Boxen in verschiedenen Zeilen gleich hoch.
- **Die Angaben standen auf wandernden Linien.** Jetzt beginnt der Wert in jeder Box auf derselben Höhe, und die Fußzeile mit Ziel und Zielstand hängt am unteren Rand. Vergleichen kann man damit waagerecht, ohne die Augen zu suchen.
- **Am Wert stand nicht, was er darstellt.** „71 %“ heißt in einer Box Pflückintervall und in der nächsten belegte Verkäufe. Der Name steht jetzt über dem Wert statt klein darunter, in einer Kurzform, die in zwei Zeilen passt (neuer Schlüssel `kpis.<key>.kurz`, 14 Kennzahlen in vier Sprachen). Das volle Label und der Rechenweg bleiben als Tooltip. Die Einheit steht kleiner neben der Zahl, nicht in derselben Größe.

Dazu eine Änderung, die beim Aufräumen nötig wurde:

- **Platzhalter bekommen keine Ampelfarbe mehr.** Sechs der vierzehn Kennzahlen sind unterschriebene Ausgangswerte, keine Messungen. Ihr rechnerischer Abstand zum Ziel sagt nichts. In der ersten Fassung leuchteten sie trotzdem rot. Jetzt steht in ihrer Fußzeile „Platzhalter“ statt eines Zielstands, der Punkt bleibt grau, und in der Sortierung stehen sie hinter allem Gemessenen.

## Die Begrüßung

- Die Seite beginnt mit dem Datum als Zeile darüber und „Guten Abend, Daniyar“ als Überschrift, darunter ein Satz, was auf der Seite steht.
- Der Name kommt aus dem Profil über `usePersona()`, es braucht keine zusätzliche Abfrage. Angesprochen wird mit dem Vornamen; ein abgekürzter Vorname bleibt zusammen mit dem Nachnamen stehen, „D. Sarsenbaj“ wird nicht zu „D.“.
- Ohne Namen im Profil wird ohne Namen gegrüßt. Die Mailadresse taugt nicht als Anrede.
- Die Tageszeit bestimmt der Server und reicht sie als Prop durch. Rechnete der Browser sie selbst, stünde im ausgelieferten HTML eine andere Begrüßung als nach der Hydration.
- Die Zeitzone steht fest auf `Asia/Almaty`, weil der Betrieb dort liegt. `src/i18n/request.ts` hat keine `timeZone` gesetzt; ohne die Angabe zählte die Zeitzone des Servers, und auf einem Vercel-Knoten in Europa stünde „Guten Morgen“ am frühen Nachmittag.
- Grenzen: bis 11 Uhr Morgen, bis 18 Uhr Tag, danach Abend. In der Erntesaison beginnt die Schicht vor Sonnenaufgang, deshalb reicht der Morgen bis 11.

Was dabei wegfällt: der bisherige Titel „Betriebsübersicht Damicon“ und der Text darunter, der den Bauzustand des Projekts beschrieb. Der Produktname steht in der Seitenleiste und in der Kopfzeile ohnehin.

## 1 Zielband

Bild: `w1.png`

- Jede Box bekommt ein Band: die gefüllte Länge ist der Istwert, der senkrechte Strich die Zielmarke, die Farbe der Zielstand
- Die Skala endet 15 Prozent hinter dem größeren der beiden Werte, damit ein knapp verfehltes Ziel nicht am Rand klebt
- Platzhalter bekommen kein Band, weil sie auch keinen Zielstand haben
- 1981 px, 42 px mehr als die Basis

Offen: Die Boxen ohne Band wirken neben denen mit Band unruhig. Ein leeres graues Band wäre ruhiger, ließe sich aber als Messwert null lesen.

## 2 Lage je Zone

Bild: `w2.png`

- Der Kopf jeder Zonenkarte trägt eine Pille mit der Zusammenfassung: „2 von 2 außerhalb“, „alle 2 im Ziel“, „noch keine Messung“
- Gezählt wird nur, was gemessen ist — ein Platzhalter hat keinen aussagekräftigen Abstand, eine Kennzahl ohne Zielwert lässt sich nicht einordnen
- Damit sieht man auf Kartenebene, wo es klemmt, ohne alle Zahlen zu lesen
- 1939 px, keine Veränderung gegenüber der Basis

Bei der Betriebsleitung steht damit an Feld und Büro je eine rote Pille. Für Rollen mit wenigen Kennzahlen steht meist „noch keine Messung“ — ehrlich, aber wenig hilfreich, solange die Erfassung fehlt.

## 3 Offene Vorgänge

Bild: `w3.png`

- Unter den Kennzahlen steht je Zone, was offen ist, jeder Posten ein Verweis in sein Modul
- Feld: nicht abgeschlossene Pflückaufgaben und Reihenblöcke in Wartezeit, mit dem Hinweis, wie viele davon zur Freigabe fällig sind. Hof: Chargen ohne Vorkühlung. Büro: abgelaufene Dokumente. Markt: Reklamationen offen oder in Prüfung
- Im Bild: 4 Aufgaben, 2 Blöcke (beide freigabefällig), 0 Chargen, 1 Dokument, 2 Reklamationen
- Rechtefilter wie in der Seitenleiste: wer ein Modul nicht öffnen darf, sieht auch seine Zahl nicht
- 2121 px, 182 px mehr als die Basis, und fünf zusätzliche Abfragen beim Seitenaufbau

Das ist die Idee aus Variante 2 der ersten Runde, aber in die Zonenkarte verteilt statt als eigener Block darüber. Damit steht die offene Arbeit neben der Kennzahl, die sie betrifft.

Die Karte kann dabei nicht mehr als Ganzes ein Verweis sein — verschachtelte `<a>` sind ungültiges HTML. Der Verweis auf die Zone sitzt deshalb auf dem Kopf der Karte. Dasselbe gilt für Variante 4.

## 4 Module als Wege

Bild: `w4.png`

- Die Modulnamen sind heute Text in einer Karte, die als Ganzes zur Zone führt. Wer in ein bestimmtes Modul will, klickt die Zone an und dort noch einmal
- Als Knöpfe werden sie zu Abkürzungen: ein Klick von der Startseite in jedes der 26 Module
- Nebenbei die kürzeste der Varianten: 1919 px, 20 px unter der Basis, weil die Namen in der Zeile fließen statt in einem Raster zu stehen
- Auf dem Telefon dagegen 151 px länger als die Basis, weil aus zwei Spalten eine fließende Reihe wird

## 5 Rollengerecht

Bilder: `w5.png` (Betriebsleitung), `w5-pfluecker.png`, dazu `basis-pfluecker.png` zum Vergleich

- Zonen, in denen die Rolle kein einziges Modul öffnen darf, fallen in eine Zeile zusammen statt als leere Karte zu stehen
- Für die Betriebsleitung ändert sich nichts, sie sieht alle vier Zonen
- Für den Pflücker verschwinden zwei leere Karten: 1350 px statt 1478 px, auf dem Telefon 2554 px statt 2876 px
- Die Reihenfolge der Zonen bleibt, wie sie ist. Sie folgt dem Weg der Ware, das ist kein Zufall und keine Sortierfrage

Die Seite bleibt für einen Pflücker trotzdem dünn: in beiden verbleibenden Zonen steht „Für diese Zone ist keine Kennzahl freigegeben“, darunter je ein Modul. Diese Variante räumt auf, sie füllt nicht.

## Die Zahlen nebeneinander

| Zustand | 1600 px | gegen Basis | 390 px | gegen Basis |
|---|---|---|---|---|
| Ist-Zustand (Runde 1) | 2026 px | +87 | 4665 px | +655 |
| Basis | 1939 px | — | 4010 px | — |
| 1 Zielband | 1981 px | +42 | 4074 px | +64 |
| 2 Lage je Zone | 1939 px | 0 | 4010 px | 0 |
| 3 Offene Vorgänge | 2121 px | +182 | 4403 px | +393 |
| 4 Module als Wege | 1919 px | −20 | 4161 px | +151 |
| 5 Rollengerecht | 1939 px | 0 | 4010 px | 0 |

Rolle Pflücker: Basis 1478 px / 2876 px, Variante 5 dort 1350 px / 2554 px.

Die Basis liegt 39 px über der ersten Fassung von Variante 3 (1900 px). Der feste Platz für zwei Namenszeilen kostet etwas Höhe; dafür stehen die Angaben auf einer Linie.

Alle Messungen enthalten die Wählerleiste der Vergleichsansicht, rund 190 px am Schreibtisch. Der Aufschlag ist in allen Zeilen gleich.

## Was sich kombinieren lässt

- 1 und 2 ergänzen sich: das Band erklärt die einzelne Zahl, die Pille im Kopf fasst die Zone zusammen. Kosten zusammen etwa 42 px.
- 3 und 4 berühren beide die untere Hälfte der Karte und machen sie länger. Zusammen stünden unter den Kennzahlen erst die offenen Vorgänge, dann die Modulknöpfe — beides Verweise, das liest sich als eine Einheit.
- 5 schlägt sich nur bei Randrollen nieder und schließt keine der anderen aus.
- Alle fünf zusammen: rechnerisch rund 2140 px am Schreibtisch. Gemessen ist das nicht.

## Was noch offen ist

- Der Meilensteinblock steht weiter unter jeder Variante. Ob er auf der Startseite bleibt, ist die offene Entscheidung aus Runde 1 (dortige Variante 4). Er ist mit rund 500 px der längste Einzelteil der Seite.
- Für die Rolle `picker` ist die Übersicht weiterhin fast leer. Sie hat laut `src/lib/rbac.ts:299` nur `dashboard`, `lohn` und `schulungen`. Weder Kennzahlen noch die Vorgänge aus Variante 3 erreichen sie. Eine Startseite, die für Pflücker etwas zeigt, braucht eigene Posten aus Lohn und Schulungen.
- Die Grenze zwischen „knapp daneben“ und „Ziel verfehlt“ steht unverändert auf 10 Prozent Abweichung, gegriffen.
- Das Zielfeld ist weiterhin eine Zeichenkette („< 6 %“), aus der ein Parser Operator und Zahl holt. Mit dem Schema aus Operator, Zahl und Einheit, das `src/lib/domain/kpis.ts` vorsieht, fällt er weg.
- Zone Hof hat mit „Chargen ohne Vorkühlung“ nur einen Posten in Variante 3, und der stand im Bild auf null. Ob das der richtige Posten ist, entscheidet sich am Betrieb.
- Die Vergleichsansicht unter `/dashboard/entwurf/…` ist Entwurfsmaterial und fällt mit der Entscheidung weg.
