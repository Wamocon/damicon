# Übersichtsseite in Reitern — 23.09.2026

Vierte Runde zur Startseite, nach den drei Runden vom 21.09.
(`uebersicht-entwuerfe-2026-09-21`, `uebersicht-runde2-2026-09-21`,
`uebersicht-runde3-2026-09-21`).

## Anlass

Erwin Moretz: „Aktuell gehen einige Informationen hier unter." Genannt vor allem der Weg in
die Module.

Die Seite trug vier Informationsfamilien in einem einzigen Strang untereinander —
Zusammenfassung und Compliance, Finanzen, vierzehn Kennzahlen, sechsundzwanzig Modulwege.
Was zuletzt im Strang steht, geht unter, und das waren ausgerechnet die Modulknöpfe.

Der Grund dafür steht in Runde 2: Variante 4 „Module als Wege" hatte die Modulnamen zu
Knöpfen gemacht, um einen Klick zu sparen. Die Maßnahme gegen „zu weit weg" hatte „zu viel
auf einmal" hergestellt.

Dazu kommt, dass die Seite seit dem 21.09. zwei Blöcke bekommen hat, die in keiner der drei
Runden vorkamen: die Finanz-Vorschau und die CEO-Tagesübersicht. Sie ist seitdem nie wieder
als Ganzes vermessen worden.

## Was entschieden wurde

| Frage | Entscheidung |
|---|---|
| Zweck | Rollenabhängig, entworfen zuerst für CEO und Admin |
| Aufbau | Drei Reiter: **CEO-Compliance \| Finanzen \| Bereiche** |
| Immer sichtbar | Begrüßung und „Das Wichtigste heute", oberhalb der Reiterleiste |
| Modulwege | **Entfallen ersatzlos.** „Dafür ist das Menü da. Es reichen die Bereiche." |
| Kennzahlen | Bei ihrem Bereich, nicht in einem eigenen Reiter. Vier je Bereich, Auffälliges zuerst |
| Leere Reiter | Entfallen. Bleibt einer, entfällt die Reiterleiste |
| Voller Prüfbericht | Geparkt, vorerst zugeklappt im Reiter CEO-Compliance |
| Animationen | Erst messen, dann entscheiden — siehe unten |

Zwei frühere Entscheidungen werden damit zurückgenommen:

- **Runde 2 / Variante 4 „Module als Wege".** Die sechsundzwanzig Modulknöpfe entfallen.
- **Die Finanz-Vorschau als Kachel.** Sie war eine von fünf Kacheln mit kompakt geschriebenen
  Beträgen auf rund 200 px. Mit eigenem Reiter stehen die Beträge wieder ausgeschrieben, dazu
  der Vergleich mit dem Vormonat und die Jahreszahl.

**Runde 1 / Variante 3 bleibt dagegen gültig** und war der Grund, den eigenen Kennzahlen-Reiter
wieder fallen zu lassen: „Wer wissen wollte, woher ‚8,4 % Verlustquote' kommt, musste selbst
darauf kommen, dass das die Zone Hof ist." Die Kennzahlen stehen deshalb im Reiter Bereiche
in ihrer Zonenkarte.

## Messwerte

Gemessen wurde wie in den Vorrunden ausschließlich die Seitenhöhe in Pixeln
(`document.documentElement.scrollHeight`), Rolle `ceo`, lokale Supabase mit einem festen
Bericht in `compliance_ceo_berichte`.

### Startzustand, vorher gegen nachher

| Breite | vorher | nachher | Differenz |
|---|---|---|---|
| 1600 px | 2421 px | **1531 px** | −37 % |
| 1440 px | 2478 px | **1531 px** | −38 % |
| 1024 px | 3246 px | **1912 px** | −41 % |
| 390 px | 5185 px (6,1 Bildschirme) | **2754 px (3,3)** | −47 % |

Am Handy ist die Seite damit knapp halb so lang. Gegen den Stand vom 21.09. (4010 px bei
390 px Breite) sind es −31 % — die Seite ist also kürzer als vor den beiden Blöcken, die
seitdem dazugekommen sind.

### Die einzelnen Reiter

| Reiter | 1440 px | 390 px |
|---|---|---|
| CEO-Compliance (Standard) | 1531 px | 2754 px |
| Finanzen | 1274 px | 2176 px |
| Bereiche | 1902 px | 3551 px |

Bereiche ist der längste — vier Zonenkarten mit je bis zu vier Kennzahlen. Er belastet die
Startseite aber nicht mehr, weil er hinter einem Reiter liegt.

### Einschränkungen dieser Messung

- Die Werte der Vorrunden enthalten rund 190 px Wählerleiste der Vergleichsansicht. Beim
  Vergleich mit dem 21.09. ist das abzuziehen; die Differenz fiele dann noch etwas größer aus.
- Runde 3 maß bei 1600 px, der Auftrag für diese Runde nannte 1440 px. Beide sind deshalb
  hier aufgeführt.
- **Der laufende Prüflauf ist nicht aufgenommen.** Dieser Zustand entsteht nur mit einem
  echten Modellaufruf; die vier dafür vorgesehenen Aufnahmen fehlen. Das Bewegungsinventar
  unten ist aus dem Quelltext erhoben, nicht aus Bildern.

## Ein behobener Fehler

`.pr-kacheln` bricht die Spalten über `@container kacheln` um. Den benannten Container macht
nur `.pr-kacheln-bereich` auf — eine Klasse, die ausschließlich in der Datei stand, die beim
Merge von `main` gelöscht wurde. Ohne sie blieb das Raster einspaltig, bis eine Fensterbreite
von 1280 px griff: **zwischen 768 und 1279 px standen die Kacheln untereinander über die
volle Breite.**

Die Kontrollaufnahme bei 1024 px belegt die Reparatur — dort stehen sie jetzt zweispaltig.
Die im Auftrag genannten Breiten 1440 und 390 px liegen beide außerhalb des Fehlerbands und
hätten ihn nie gezeigt.

## Bewegungsinventar (nur erhoben, nichts geändert)

Beim ersten Login laufen für CEO und Admin **sechs Bewegungen gleichzeitig**:

1. der animierte Prüfablauf im Seiteninhalt, Neuzeichnung alle 500 ms
2. ein Spinner in der Kopfzeile (`topbar.tsx`)
3. Himbi rechts unten, dauerhaft animiert (`haustier.css`, `infinite`)
4. ihre Sprechblase mit dem Live-Hinweis, 14 Sekunden
5. ein blinkender Fokusrahmen um den Live-Block, 2,6 Sekunden
6. ein selbsttätiger Scroll, der die Seite unter den Händen verschiebt

Drei davon (Himbi, Fokusrahmen, Scroll) zeigen von außen auf den Block, der ohnehin der
auffälligste auf der Seite ist. Im Ruhezustand sind **einundzwanzig Elemente** farbig
hervorgehoben.

Nebenbefund, nicht behoben: `.pr-aufklappbar__koerper` und `.pr-aufklappbar__pfeil`
(`pruefung.css`) haben **keinen** `prefers-reduced-motion`-Rückfall. Das verstößt gegen
DESIGN.md Abschnitt 12, Regel 6, und kam mit dem Merge aus `main` herein. Gehört in die
Animationsentscheidung, nicht davor.

## Offen

- **Die Entscheidung über die Animationen.** Grundlage ist dieser Bericht.
- **Der volle Prüfbericht.** Ob er zugeklappt auf der Übersicht bleibt oder auf
  `/dashboard/compliance` wandert, entscheidet die Geschäftsführung. Beide Wege sind offen,
  der Wechsel kostet eine Zeile.
- **Die 10-Prozent-Grenze** zwischen „knapp" und „verfehlt" ist seit Runde 1 geraten. Mit der
  Auffüllregel „vier je Bereich" entscheidet sie nur noch über die Reihenfolge.
- **Die leeren Rollen.** `picker`, `erzeuger` und `kunde` sehen keine einzige Kennzahl. Seit
  Runde 1 offen, eigenes Ticket.

## Wie die Aufnahmen entstanden sind

Wie in den Vorrunden ist das Aufnahmeskript nicht eingecheckt. Der Ablauf:

1. Lokale Supabase läuft (`.env.local` zeigt auf `127.0.0.1:54321`), `npm run db:seed-auth`
   legt `ceo@damicon.demo` an, Passwort `DamiconDemo2026!`.
2. Eine feste Zeile in `compliance_ceo_berichte` — sonst zeigen die Kacheln „nicht geprüft".
   Der Bericht trägt alle vier Bereiche, zwei Verstöße, eine Lücke, eine Sofortmaßnahme, zwei
   Hinweise, fünf Änderungen und einen Bereich, für den alle Prüfpunkte ohne Betriebsdaten
   blieben.
3. `npm run dev`, dann ein Playwright-Skript: anmelden, warten bis `#compliance-live-lauf`
   verschwunden ist, 1,2 s für den Ringaufbau, `screenshot({ fullPage: true })`.
   Dunkelmodus über `localStorage.setItem("damicon-theme", "dark")`.
4. Breiten 1600×900, 1440×900, 1024×900 und 390×844, `deviceScaleFactor: 1`, Animationen
   **nicht** abgeschaltet.

Die gemessenen Höhen stehen als `hoehen.json` neben den Bildern.
