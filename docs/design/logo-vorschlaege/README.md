# Damicon – drei Vorschläge für die Bildmarke

Stand 12.09.2026. Entwürfe, keine fertigen Marken: Die Formen sind aus Geometrie gerechnet und gehören vor einer Verwendung in einem Vektorprogramm nachgezogen (Kurvenzahl reduzieren, Strichstärken optisch ausgleichen, Winkel runden).

Aufgabe: kasachischer Bezug, dazu Qualität, Frische und Verlässlichkeit. Alle drei arbeiten mit den vorhandenen Markenfarben – Petrol `#00768f`, Himbeerrot `#b3123f` (hell `#ff5c7a`), Flaggengold `#f2c14b`, Nachtblau `#04161c` – und mit der Hausschrift Manrope.

Übersicht aller Varianten: [vorschau.png](vorschau.png)

## A · Schanyrak-Kranz

[a-schanyrak.svg](a-schanyrak.svg)

Ein Kranz aus zwölf Steinfrüchtchen, darin die Rosette des Schanyrak, in der Mitte das Licht in Gold.

Das Schanyrak ist der Dachkranz der Jurte: die Öffnung, durch die Licht und Rauch gehen, und im kasachischen Wappen das Zeichen für Herkunft und Zusammenhalt. Es steht hier für Verlässlichkeit – ein Haus, das trägt. Die zwölf Früchtchen sind die Beere selbst und tragen die Frische. Das Gold in der Mitte ist das Licht durch die Öffnung.

Zweite Lesart für das Produkt: Die vier Bögen der Rosette sind die vier Bereiche Feld, Hof, Büro und Markt, die in derselben Mitte zusammenlaufen.

Stärken: klar bis 16 Pixel, einfarbig tragfähig, eigenständig gegenüber den üblichen Beeren-Logos. Schwäche: der Kranz braucht Luft, in sehr engen Leisten wirkt er kleinteilig.

## B · Widderhorn

[b-widderhorn.svg](b-widderhorn.svg)

Zwei eingerollte Hörner aus einem Ansatz, dazwischen die Frucht, oben ein kleines Blatt in Gold.

Das Widderhorn – qoshqar müjiz – ist das häufigste Ornament der kasachischen Filz-, Holz- und Metallarbeit. Es steht für Herde, Wohlstand und Weitergabe. Hier tragen die Hörner die Frucht: das Handwerk hält die Qualität.

Offen gesagt der schwächste der drei. Bei 16 Pixeln wird er zum Fleck, und in großer Ansicht kann die Form als Gesicht gelesen werden. Er bleibt im Rennen, weil sein kultureller Bezug der deutlichste ist – er müsste für eine Verwendung strenger gezeichnet und vereinfacht werden.

## C · Sonnensiegel

[c-siegel.svg](c-siegel.svg)

Ein Siegelring, darin die Sonne über der Steppe: die Frucht als Sonnenscheibe, elf Strahlen in Gold, darunter der Horizont.

Die Sonne mit Strahlen und die Steppenlinie sind die beiden Motive der kasachischen Flagge. Das Siegel ist die Form, in der Prüfungen bestätigt werden – genau das, was die Seite verspricht: belegte Ware. Die Sonne am Morgen trägt die Frische, der Horizont die Herkunft.

Stärken: stark bei kleinen Größen, sofort als Siegel lesbar, passt zur Belegkette als Thema. Schwäche: Siegelformen sind verbreitet, die Marke lebt von der sauberen Zeichnung der Strahlen.

## Farbregeln

| Fläche | Ring und Linien | Frucht | Gold |
|---|---|---|---|
| hell (`#f6fafb`, weiß) | Petrol `#00768f` | `#b3123f` | `#f2c14b` |
| dunkel (`#04161c`) | Köktem-Blau `#3fd0e6` | `#ff5c7a` | `#f2c14b` |
| Kachel auf Petrol | Weiß | `#ff5c7a` | `#f2c14b` |
| einfarbig, Prägung, Fax | alles `#0b1e26` | | |

Auf der Petrol-Kachel bleibt die Frucht himbeerhell. In Weiß verliert die Marke ihren Fruchtbezug und liest sich nur noch als Zeichen.

## Größen

Geprüft bei 160, 48, 32, 24 und 16 Pixeln, hell und dunkel, einfarbig und als App-Kachel. Unter 24 Pixeln fällt bei A die Rosette, bei C die feine Steppenlinie optisch weg; beide bleiben erkennbar. Für ein Favicon gehört zu jeder Marke eine vereinfachte Fassung mit weniger Details.

## Entscheidung

Am 12.09.2026 fiel die Wahl auf **C · Sonnensiegel**. Eingebaut ist sie in `src/components/brand/damicon-logo.tsx` (Kopfzeile, Seitenleiste, Fußzeile, Anmeldung, Zweiter Faktor, Aushang), als Favicon in `src/app/icon.svg` und als Dokumentmarke in `scripts/dokumente/assets/damicon-logo.svg` samt PNG-Rückfall. In allen angewendeten Fassungen fehlt die feine Steppenlinie des Entwurfs: Sie verschwindet unter 24 Pixeln und macht das Zeichen dort nur unruhig. Das Favicon trägt neun statt elf Strahlen und kräftigere Striche.

## Nächste Schritte

1. Eine Marke wählen.
2. Die Form in einem Vektorprogramm nachziehen und die Wortmarke feinsetzen (Manrope 800, Laufweite leicht negativ).
3. Favicon-Satz, `DamiconLogo`-Komponente (`src/components/brand/damicon-logo.tsx`) und die Dokumentvorlage (`scripts/dokumente/assets/damicon-logo.svg`) austauschen.
