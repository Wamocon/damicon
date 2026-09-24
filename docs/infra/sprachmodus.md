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
Platzierung). Quellen und Einzelheiten stehen in den Recherche-Berichten des PRs.

## Warum kein neuer Chat

Der Sprachmodus benutzt **denselben Chat** wie das Seitenpanel, nur
unsichtbar. Die Frage geht über `components/ki/sprachmodus-bus.ts` an den ganz
normalen `KiChat` (der bleibt im Hintergrund gemountet und aktiv), und der
Stand des Chats (arbeitet er, spricht er, was sagt er) geht denselben Weg
zurück. Nach dem Gespräch steht alles im Panel zum Nachlesen. Es gibt also nicht
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
  Höflichkeitsfloskeln). Die Antwort wird vorgelesen, nicht gelesen.
- **Vorab-Satz statt Stille:** Jede Antwort auf eine neue Frage beginnt mit
  einem kurzen Satz (höchstens acht Wörter), was Himbi sich gerade ansieht.
  Dieser Satz wird sofort vorgelesen, während im selben Schritt das Werkzeug
  läuft. Bis zum 24.09.2026 erzwang `waehleSchritt()` im ersten Schritt ein
  Werkzeug (`toolChoice: "required"`). Bei Anthropic darf das Modell dann vor
  dem Werkzeug keinen Satz schreiben, und im Gespräch war es still, bis die
  Daten geladen waren. Der Agent-Modus erzwingt das Werkzeug weiterhin, eine
  Rechtsfrage erzwingt auch im Sprachmodus die Wissenssuche.
- **Führung:** `SPRACHMODUS_FUEHRUNG` verlangt, vor jeder Erklärung mit
  `oeffneBereich` den passenden Bereich zu öffnen und mit `zeigeAuf` auf die
  besprochene Stelle zu deuten. Die Formatanweisung verbietet zusätzlich,
  Fragen zu Daten aus dem Gedächtnis oder aus früheren Antworten zu beantworten.

## Clientseitig

### Ablauf (Zustandsautomat, `src/lib/domain/sprachmodus.ts`)

Halbduplex: `hoert` → `versteht` → `denkt` → `spricht` → wieder `hoert`.
Während Himbi dran ist, geht nichts an die Erkennung, sonst hörte sie die
eigene Stimme aus dem Lautsprecher.

**Unterbrechen** geht auf zwei Wegen:

1. **Dazwischenreden**, wie in einem Gespräch (`erzeugeUnterbrechungsWaechter`).
   Während Himbi spricht, vergleicht eine Bildschleife die Lautstärke am
   Mikrofon (RMS, `leseLautstaerke()` in `lib/hoeren.ts`) mit der eigenen
   Ausgabe (`lib/ausgabe-pegel.ts`). Drei Schranken halten das Echo ab: ein
   Mindestpegel, das Grundrauschen (gemessen in den Ausgabepausen, wie beim
   Diktat) und das Echo selbst (das Mikrofon muss lauter sein als die Hälfte der
   nachhallenden Ausgabe). Erst durchgehende Sprache von 400 ms unterbricht.
   Sobald es nach Sprache klingt, läuft schon eine Aufnahme mit, damit der
   Anfang des Satzes nicht verloren geht. Verklingt es wieder, oder endet die
   Antwort auf anderem Weg, wird diese Aufnahme verworfen, sonst hörte Himbi
   das Echo der eigenen letzten Worte als Frage.
2. **Tipp auf die Kugel** oder die Leertaste: der sichere Weg in lauter
   Umgebung (Hof, Halle).

Die Werte der Schranken (`UNTERBRECHEN_STANDARD`) sind Ausgangswerte auf
derselben Skala wie die Stilleerkennung des Diktats und am echten Gerät
nachzuziehen.

### Mikrofon (`src/components/ki/sprachmodus.tsx`)

Der **Mikrofonstrom** wird einmal geöffnet und bleibt für die ganze Sitzung
offen. Ständiges Öffnen und Schließen lässt auf iOS die Audiosession wechseln,
und die erste Antwort danach kommt dann leise über den Hörer statt den
Lautsprecher. Geöffnet wird er mit Echounterdrückung
(`GESPRAECH_AUFNAHME`), anders als beim Diktat: hier spricht Himbi, während
das Mikrofon offen ist.

Die **Aufnahme** (MediaRecorder) ist dagegen je Äußerung neu. Bis zum
24.09.2026 lief ein einziger Recorder für den ganzen Sprachmodus, pausiert und
fortgesetzt. Nur sein allererstes Stück trägt aber den Dateikopf (webm/mp4),
jede weitere Äußerung begann für Soniox mitten in einer Datei ohne Kopf: die
erste Frage ging, die zweite nicht mehr. Ein neuer Recorder auf demselben
Strom berührt die Audiosession nicht.

Jede Äußerung läuft über eine eigene Live-Sitzung
(`components/ki/diktat-live.ts`, `zweck: "gespraech"`): schnellere, aber
weiter semantische Endpunkterkennung (`GESPRAECH_ENDPUNKT` in
`domain/diktat-live.ts`, Werte von Soniox selbst als Startpunkt genannt). Am
Ende der Äußerung wird zuerst die Aufnahme geschlossen, damit ihr letztes Stück
noch vor dem Ende-Zeichen bei Soniox ankommt.

**Scheitert eine Sitzung** (neu: `beiScheitern` in `diktat-live.ts`),
entscheidet `nachSitzungsAbbruch()`:

| Lage | Folge |
| --- | --- |
| Schlüssel-Route sagt 401, 403 oder 404 (Live-Diktat aus, keine Berechtigung) | Meldung, kein Neuversuch |
| Schneller Verbindungs- oder Dienstfehler | nach 500 ms neu verbinden, höchstens zweimal, dann Meldung mit „Erneut versuchen“ |
| Sitzung lief lange (Zeitgrenze 120 s) und hat nichts gehört | Mikrofon stumm schalten, statt minutenlang Stille an Soniox zu schicken |
| Sitzung lief lange und hat etwas gehört | neu verbinden, Zähler von vorn |

Bis zum 24.09.2026 gab es diesen Weg nicht: kam kein Endpunkt, hörte die Kugel
endlos zu. Ein Tipp auf die Kugel oder den Mikrofonknopf versucht es nach einer
Meldung erneut.

### Die Kugel (`src/components/ki/sprach-kugel.tsx`)

Reines Canvas 2D, keine neue Abhängigkeit (kein WebGL, kein Rive). Laut
Recherche wiegen three.js und Rive mehrere hundert KB für eine einzelne Kugel.
Der Pegel läuft **nie durch React**: eine eigene
`requestAnimationFrame`-Schleife liest Mikrofonpegel (`lib/hoeren.ts`) und
Ausgabepegel (`lib/ausgabe-pegel.ts`: ein `AnalyserNode` zwischen
`AudioBufferSourceNode` und `ctx.destination` in `sprachausgabe-live.ts`) und
zeichnet direkt. Seit 24.09.2026 meldet der Sprachmodus seinen Mikrofonstrom
auch wirklich bei `lib/hoeren.ts` an (`starteHoeren`). Vorher tat das nur der
Diktatknopf, und die Kugel reagierte nie auf die eigene Stimme.

### Hervorhebung und Blasen-Platzierung

- `components/ki/hervorhebung.ts`: welches Element gerade gezeigt wird, ein
  Modul mit einem Wert wie `lib/hoeren.ts`. Gesetzt an genau zwei Stellen:
  `ki-pane-kontext.tsx` (`hebeHervor`, nach `oeffneBereich`) und
  `ui-steuerung.ts` (`zeigeAuf`).
- `components/ki/sprach-spotlight.tsx`: ein SVG-Pfad mit `fill-rule: evenodd`
  (Außenrechteck minus Zielausschnitt). Laut Recherche die robusteste
  Spotlight-Technik, unabhängig vom Stacking-Context des Ziels (anders als der
  ältere `box-shadow`/`z-index`-Trick).
- `besterPlatz()` in `domain/sprachmodus.ts`: wählt die Ecke oder Kante, die
  am weitesten vom Ziel entfernt ist und es nicht überlappt; bleibt bei
  unverändertem Ziel am selben Platz (kein Herumspringen).

## Voraussetzung zum Einschalten

Der Kopfzeilenknopf erscheint nur, wenn **beides** gilt
(`sprachmodusMoeglich` in `dashboard/layout.tsx`):

1. ein Anbieter mit Werkzeugen (`typ === "anthropic"`),
2. `KI_DIKTAT_LIVE=an`. Ohne Live-Erkennung gäbe es kein brauchbares Gespräch,
   nur lange Wartezeiten über den Datei-Weg.

Damit Himbi schon während des Schreibens spricht, braucht es außerdem
`KI_SPRACHAUSGABE_LIVE=an` mit `KI_SPRACHAUSGABE_SIGNATUR`, und für die
bessere Stimme `KI_SPRACHAUSGABE_ANBIETER=soniox`. In Vercel können diese
Variablen je Branch gesetzt sein: am 24.09.2026 fehlten sie für die Vorschau
von `feat/ki-sprachmodus`, der Knopf fehlte dort deshalb, und Vorlesen lief
über die alte Kette (siehe `sprachausgabe-anbieter.md`, Abschnitt Variablen).

## Was noch nicht gemessen ist

Gegen den echten Soniox-Dienst und mit echten Sprecherinnen und Sprechern war
aus der Entwicklungsumgebung kein Test möglich. Vor dem Einschalten in
Produktion: selbst ein Gespräch führen (Chrome und iPhone, alle vier
Sprachen), prüfen, dass Dazwischenreden auslöst, das eigene Echo aber nicht
(Laptop-Lautsprecher, Telefon, Kopfhörer), und die Endpunkt-Parameter
(`GESPRAECH_ENDPUNKT`) sowie `UNTERBRECHEN_STANDARD` je Gerät nachziehen.
