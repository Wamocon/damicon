# Sprachmodus: Live-Gespräch mit Himbi

Stand 24.09.2026.

## Was es ist

Ein Knopf in der Kopfzeile (`AudioLines`-Symbol, neben „KI fragen“) öffnet ein
vollflächiges Overlay: der Hintergrund wird unscharf, in der Mitte schwebt eine
Kugel, die auf die eigene Stimme und auf die Stimme von Himbi reagiert. Es gibt
keinen sichtbaren Chat, nur das Gespräch. Springt Himbi zu einem Bereich der
Anwendung, um etwas zu zeigen, legt sich ein Lichtkegel um das Ziel und die
Kugel rückt klein an den freien Rand, damit sie nicht verdeckt, wovon Himbi
gerade spricht.

Grundlage der Gestaltung ist eine Recherche zu bestehenden Sprachmodi (ChatGPT
Voice, Gemini Live, Claude Voice Mode, Copilot Vision, Salesforce Agentforce
Voice, driver.js/Shepherd.js/react-joyride für Spotlights, Floating UI für
Platzierung) — Quellen und Einzelheiten in den Recherche-Berichten des PRs.

## Warum kein neuer Chat

Der Sprachmodus benutzt **denselben Chat** wie das Seitenpanel — nur
unsichtbar. Die Frage geht über `components/ki/sprachmodus-bus.ts` an den ganz
normalen `KiChat` (der bleibt im Hintergrund gemountet und aktiv), und der
Stand des Chats (arbeitet er, spricht er, was sagt er) geht denselben Weg
zurück. Nach dem Gespräch steht alles im Panel zum Nachlesen — es gibt nicht
zwei Wege, die sich auseinanderentwickeln könnten.

## Serverseitig: ein dritter Modus

Der Systemprompt kennt jetzt `"assistent" | "agent" | "sprache"`
(`src/app/api/ki-assistent/route.ts`, `src/lib/domain/antwort-anweisungen.ts`):

- **Werkzeuge:** wie der Agent-Modus navigiert und liest er die Seite
  (`oeffneBereich`, `seiteLesen`, `zeigeAuf`, `scrolleZu`), kann aber **nicht
  klicken oder ausfüllen** (`baueUiWerkzeuge("zeigen")`,
  `src/lib/ai/ui-werkzeuge.ts`) und **keine Aktionen** auslösen (`nurLesen:
  true`). Ohne sichtbaren Chat gäbe es keine Stelle, an der jemand eine
  Freigabekarte bestätigen könnte.
- **Format:** `sprachmodusFormatAnweisung()` ersetzt die Fachbericht-Regeln
  (kein Markdown, höchstens vier kurze Sätze, kein Fazit-Satz, keine
  Höflichkeitsfloskeln) — die Antwort wird vorgelesen, nicht gelesen.
- **Führung:** `SPRACHMODUS_FUEHRUNG` verlangt, vor jeder Erklärung mit
  `oeffneBereich` den passenden Bereich zu öffnen und mit `zeigeAuf` auf die
  besprochene Stelle zu deuten.

## Clientseitig

### Ablauf (Zustandsautomat, `src/lib/domain/sprachmodus.ts`)

Halbduplex: `hoert` → `versteht` → `denkt` → `spricht` → wieder `hoert`.
Während Himbi dran ist (`denkt`/`spricht`), pausiert die Aufnahme — sonst
hörte die Erkennung die eigene Stimme aus dem Lautsprecher. Ein Tipp auf die
Kugel unterbricht sofort, das ist robuster als eine automatische
Sprachunterbrechung (Barge-in), die in lauter Hofumgebung laut Recherche
überwiegend Fehlalarme produziert.

### Mikrofon (`src/components/ki/sprachmodus.tsx`)

Anders als beim Diktatknopf wird das Mikrofon **einmal geöffnet und bleibt für
die ganze Sitzung offen** — nur die Aufnahme wird pausiert/fortgesetzt.
Ständiges Öffnen/Schließen lässt auf iOS die Audiosession wechseln, und die
erste Antwort danach kommt dann leise über den Hörer statt den Lautsprecher.

Jede Äußerung läuft über eine eigene Live-Sitzung
(`components/ki/diktat-live.ts`, `zweck: "gespraech"`): schnellere, aber
weiter semantische Endpunkterkennung (`GESPRAECH_ENDPUNKT` in
`domain/diktat-live.ts`, Werte von Soniox selbst als Startpunkt genannt).

### Die Kugel (`src/components/ki/sprach-kugel.tsx`)

Reines Canvas 2D, keine neue Abhängigkeit (kein WebGL, kein Rive) — laut
Recherche wiegen three.js/Rive mehrere hundert KB für eine einzelne Kugel.
Der Pegel läuft **nie durch React**: eine eigene
`requestAnimationFrame`-Schleife liest Mikrofonpegel
(`lib/hoeren.ts`, bereits vorhanden) und Ausgabepegel (`lib/ausgabe-pegel.ts`,
neu — ein `AnalyserNode` zwischen `AudioBufferSourceNode` und
`ctx.destination` in `sprachausgabe-live.ts`) und zeichnet direkt.

### Hervorhebung und Blasen-Platzierung

- `components/ki/hervorhebung.ts`: welches Element gerade gezeigt wird — ein
  Modul mit einem Wert, wie `lib/hoeren.ts`. Gesetzt an genau zwei Stellen:
  `ki-pane-kontext.tsx` (`hebeHervor`, nach `oeffneBereich`) und
  `ui-steuerung.ts` (`zeigeAuf`).
- `components/ki/sprach-spotlight.tsx`: ein SVG-Pfad mit `fill-rule: evenodd`
  (Außenrechteck minus Zielausschnitt) — laut Recherche die robusteste
  Spotlight-Technik, unabhängig vom Stacking-Context des Ziels (anders als der
  ältere `box-shadow`/`z-index`-Trick).
- `besterPlatz()` in `domain/sprachmodus.ts`: wählt die Ecke oder Kante, die
  am weitesten vom Ziel entfernt ist und es nicht überlappt; bleibt bei
  unverändertem Ziel am selben Platz (kein Herumspringen).

## Voraussetzung zum Einschalten

Der Kopfzeilenknopf erscheint nur, wenn **beides** gilt
(`sprachmodusMoeglich` in `dashboard/layout.tsx`):

1. ein Anbieter mit Werkzeugen (`typ === "anthropic"`),
2. `KI_DIKTAT_LIVE=an` — ohne Live-Erkennung gäbe es kein brauchbares
   Gespräch, nur lange Wartezeiten über den Datei-Weg.

## Was noch nicht gemessen ist

Gegen den echten Soniox-Dienst und mit echten Sprecherinnen und Sprechern war
aus der Entwicklungsumgebung kein Test möglich. Vor dem Einschalten in
Produktion: selbst ein Gespräch führen (Chrome und iPhone, alle vier
Sprachen), prüfen, dass Unterbrechen zuverlässig funktioniert, und die
Endpunkt-Parameter (`GESPRAECH_ENDPUNKT`) je Sprache nachziehen.
