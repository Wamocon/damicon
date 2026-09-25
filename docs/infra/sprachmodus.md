# Sprachmodus: Live-Gespräch mit Himbi

Stand 24.09.2026.

## Was es ist

Zwei Einstiege öffnen ein vollflächiges Overlay:

- im Chat der **Senden-Knopf, solange das Eingabefeld leer ist** (Wellensymbol,
  dort also, wo man spricht, auch auf dem Handy). Sobald etwas im Feld steht,
  ist er wieder Senden; das Mikrofon daneben bleibt das Diktat ins Textfeld.
- in der Kopfzeile der Knopf **„Gespräch“** neben „KI fragen“ (ab 1024 px
  beschriftet, darunter nur das Symbol, unter 768 px ausgeblendet).

Bis zum 24.09.2026 gab es nur den Kopfzeilenknopf, als Symbol ohne
Beschriftung, und er wurde nicht gefunden.

Zuhören, Pause und Fehler: eine große Kugel in der Mitte, die auf die eigene
Stimme und auf die Stimme von Himbi reagiert. Es gibt keinen sichtbaren Chat,
nur das Gespräch. Die Seite wird **nie abgedunkelt** (Stand 25.09.2026, nach
mehreren Rückmeldungen: jede Abdunkelung war im hellen Design entweder zu hell
oder zu dunkel).

Sobald Himbi denkt, spricht oder auf ein Element zeigt, wandert die Kugel als
**eine Einheit mit Zustandszeile und Schriftbild des Gesprochenen** nach links,
vertikal mittig über die Navigationsleiste (ab 768 px, wo es die Leiste gibt).
Wächst der Text, rückt die Einheit mittig nach und die Kugel damit nach oben,
sie bleibt im Rahmen der Leiste. Nur die Navigationsleiste wird dabei unscharf,
die **Mitte bleibt frei und scharf**. Zeigt Himbi auf ein Element, bekommt es
nur einen Rahmen. Bis zum 25.09.2026 rückte die Kugel dafür neben das Ziel und
zeigte dort keinen Text mehr.

Damit Gesprochenes und Angezeigtes zusammenpassen, verlangt
`SPRACHMODUS_FUEHRUNG`: nur über das sprechen, was gerade zu sehen ist, auf der
passenden Seite bleiben statt wegzuspringen, einen anderen Bereich nur vor der
Erklärung öffnen und ankündigen.

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

- **Werkzeuge:** seit dem 25.09.2026 **dieselben Rechte wie der sichtbare
  Chat** (Rückmeldung: „der Sprachmodus soll die gleichen Rechte haben wie der
  Chat“). Er navigiert, liest, zeigt, **klickt und füllt aus**
  (`baueUiWerkzeuge("steuern")`, `src/lib/ai/ui-werkzeuge.ts`) und löst die
  **Aktionen** aus (`aufgabeAnlegen` und weitere, kein `nurLesen` mehr). Bis
  dahin war beides gesperrt, weil es ohne sichtbaren Chat keine Stelle für die
  Freigabekarte gab. Die Sicherheitsstufen bleiben unverändert: gesperrt bleibt
  gesperrt (Abmelden, Passwortfelder), und was etwas absendet, ändert oder
  löscht, braucht weiter eine ausdrückliche Freigabe.
- **Freigabe per Sprache:** Der Chat (`ki-chat.tsx`) meldet die offene
  Freigabekarte (Klick oder Aktion) über `sprachmodus-bus.ts` an den
  Sprachmodus. Der zeigt sie **deutlich umrandet** (auch bei ausgeschalteten
  Untertiteln oder gerade gezeigter Stelle) mit dem Hinweis „Sagen Sie Ja oder
  Nein“. Die nächste **ganze Äußerung** zählt zuerst als Antwort darauf
  (`istZusageBefehl`/`istAbsageBefehl`, `src/lib/domain/sprachmodus.ts`), nicht
  als neue Frage. „Ja, aber was kostet das?“ ist keine Zusage und wird als Frage
  weitergereicht, Schweigen oder Unklares gibt **nie** eine Freigabe. „Stopp“
  lehnt bei offener Karte nur die Aktion ab, sonst beendet es den Sprachmodus.
  Die Karte im sichtbaren Chat bleibt ein zweiter Weg (Klick).
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
- **Führung:** `SPRACHMODUS_FUEHRUNG` verlangt, auf der passenden Seite zu
  bleiben, einen anderen Bereich nur mit `oeffneBereich` und angekündigt zu
  öffnen, danach `seiteLesen` und die Erklärung Stelle für Stelle mit
  Sprechmarken (siehe unten). Die Formatanweisung verbietet zusätzlich, Fragen zu
  Daten aus dem Gedächtnis oder aus früheren Antworten zu beantworten, und
  Füllsätze wie „Ich lese nun die Seite“.
- **Ziele von `oeffneBereich`** (`lib/ai/tools.ts`): Übersicht, Kontosicherheit,
  alle sichtbaren Module, seit 25.09.2026 auch die vier **Zonen** (`feld`, `hof`,
  `buero`, `markt`, nur mit mindestens einem sichtbaren Modul) und der volle
  **Prüfbericht** (`pruefbericht` → `/dashboard/compliance`, nur für Rollen mit
  `darfCeoBerichtLesen`). Mit `abschnitt` `audit`, `steuer`, `recht` oder `risiko`
  öffnet der Prüfbericht gefiltert (`?bereich=audit`, die Seite übernimmt den
  Filter). Vorher öffnete „Bereich Hof“ nur das Modul Kühlkette und „Prüfberichte“
  das Datenschutz-Cockpit. Das Blatt einer Bereichskachel auf der Übersicht ist
  bewusst kein Ziel: es liegt über dem Sprachmodus (z-index 100) und verdeckt
  Kugel und Freigabekarte.
- **Keine erzwungene Wissenssuche bei Zeige-Bitten:** Enthält eine Frage
  „Audit“, „Compliance“ oder „Steuern“, erzwingt `waehleSchritt()` sonst im ersten
  Schritt `wissenSuchen`. Im Sprachmodus nicht, wenn es eine Zeige-Bitte ist
  (`istNavigationsbitte`: „zeig“, „öffne“, „Bereich“, „Prüfbericht“ …).
- **Verlauf:** Im Sprachmodus geht nur das laufende Gespräch ans Modell (dazu die
  letzte Frage davor, `VOR_SPRACHMODUS` in `ki-chat.tsx`), beginnend mit einer
  Frage. Alte Fragen zu anderen Seiten ließen Himbi sonst früher gezeigte Bereiche
  wieder öffnen. Ein Prüfbezug aus dem Chat geht im Sprachmodus nicht mit.

## Clientseitig

### Ablauf (Zustandsautomat, `src/lib/domain/sprachmodus.ts`)

Halbduplex: `hoert` → `versteht` → `denkt` → `spricht` → wieder `hoert`.
Während Himbi dran ist, geht keine Frage an die Erkennung, sonst hörte sie die
eigene Stimme aus dem Lautsprecher.

**Stopp** geht auf drei Wegen: als Äußerung beim Zuhören, über den
**Stoppwort-Wächter**, solange Himbi denkt oder spricht, und über Kugel, Leiste
oder Escape. Der Wächter ist eine eigene Soniox-Live-Sitzung auf demselben
Mikrofon (mit Echounterdrückung). Er reagiert nur auf endgültig erkannten Text,
der ein reiner Stoppbefehl ist (`istStoppBefehl`: „Stopp“, „Stopp, stopp“,
„Himbi, stopp“, „Stopp die Führung“, „Hör auf“, „Abbrechen“, in den vier
Sprachen). Sagt Himbi das Wort gerade selbst, zählt es nicht. Bei offener
Freigabekarte lehnt „Stopp“ nur die Karte ab, der Wächter hört danach weiter.
Bis zum 25.09.2026 gab es den Wächter nicht: ein kurzes „Stopp“ erreichte die
400 ms des Lautstärke-Wächters nie, beim Nachdenken hörte gar nichts zu. Stopp
beendet die Stimme, die laufende Anfrage, wartende Handlungen, die
Führungs-Warteschlange und den Rahmen und schließt den Sprachmodus.

Einzelheiten des Wächters: Er wertet schon den vorläufigen Text aus, wenn er
350 ms lang ein reiner Stoppbefehl bleibt (`STOPP_STABIL_MS`), sonst erst den
endgültigen (im Test rund drei Sekunden später). Gezählt wird ein Stoppbefehl in
jedem Satz und am Ende unpunktierten Textes (`stoppBefehlAmEnde`). Als Echo gilt
nur ein Stoppwort, das im gerade klingenden oder im vorigen Satz steht. Bricht
seine Sitzung ab (Verbindung, Zeitgrenze einer Sitzung), startet er höchstens
dreimal je Antwort neu. Das Mikrofon hört damit während des ganzen Gesprächs mit,
auch während Himbi spricht; das Handbuch sagt das offen.

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
Ausgabepegel (`lib/ausgabe-pegel.ts`: ein gemeinsamer Ausgang je
AudioContext, `ausgangFuer()`, mit einem `AnalyserNode` davor; Strom und
Abschnitte spielen beide darüber) und zeichnet direkt. Seit 24.09.2026 meldet der Sprachmodus seinen Mikrofonstrom
auch wirklich bei `lib/hoeren.ts` an (`starteHoeren`). Vorher tat das nur der
Diktatknopf, und die Kugel reagierte nie auf die eigene Stimme.

### Hervorhebung

- `components/ki/hervorhebung.ts`: welches Element gerade gezeigt wird, ein
  Modul mit einem Wert wie `lib/hoeren.ts`. Gesetzt von `fokussiere`
  (`ki-pane-kontext.tsx`, nach `oeffneBereich`), `zeigeAuf` (`ui-steuerung.ts`)
  und den Sprechmarken (`sprach-mitlesen.ts`). Eine neue Frage und Stopp setzen
  ihn zurück.
- `components/ki/sprach-spotlight.tsx`: nur ein Rahmen um das Ziel, keine
  Abdunkelung.
- `fokussiere` wartet auf die neue Seite (Pfad und `#main h1`) und rahmt dann
  ihren Kopf, nicht die ganze Seite. Ein Suchlauf einer überholten Station setzt
  keinen Rahmen mehr (`stationsNr`). Steht die Zielseite schon da, wird sie nicht
  neu geladen (`stehtAuf`).

### Takt zwischen Stimme und Bildschirm (`src/components/ki/sprach-takt.ts`)

Der Text einer Antwort ist fertig, lange bevor die Stimme ihn gesprochen hat. Ein
Werkzeugaufruf direkt dahinter lief früher sofort, und das Gezeigte eilte dem
Gesprochenen voraus. Seit 25.09.2026 gilt:

- Jede sichtbare Handlung im Sprachmodus (Bereich öffnen, `zeigeAuf`, `klicke`,
  `fuelleFeld`, `scrolleZu`) wartet, bis die Stimme den Satz davor gesprochen hat.
  Der Sprecher meldet „alles gesagt“, sobald die Stimme 350 ms still ist, auch
  wenn der Strom für den nächsten Satz noch offen ist (`STILL_FERTIG_MS`). Vorher
  kam ein Seitenwechsel erst mit dem nächsten Satz. `seiteLesen` ändert das Bild
  nicht und wartet nur auf die Reihe.
- Während die neue Seite lädt, hält die Stimme an (`AudioContext.suspend` über
  `live.halte`, höchstens 3,5 s), damit sie nicht über die neue Seite spricht,
  während noch die alte zu sehen ist.
- Eine Handlung einer abgelösten Anfrage (neue Frage, Stopp) läuft nicht mehr nach
  (`vorAusfuehrung` liefert dann `false`).
- Nur `oeffneBereich` wechselt die Seite. Fachwerkzeuge mit einem Ziel
  (Compliance-Übersicht, Aufgaben ...) öffneten ihre Ansicht bisher sofort und rissen
  die Seite weg, während Himbi noch über die aktuelle sprach. Im Agent-Modus bleibt das
  Verhalten unverändert.
- Der Seitenwechsel und das, was danach die Seite liest, laufen in einer Reihe, und die
  Reihe wartet die neue Seite ab. Eine neue Frage oder Stopp lässt alles Wartende
  verfallen.
- Die Anweisung (`SPRACHMODUS_FUEHRUNG`) verlangt: Seitenwechsel nur mit
  `oeffneBereich`, nie fragen, ob ein Bereich geöffnet werden soll, in dem der Nutzer
  schon steht, keine Klickschleifen auf "Ansehen" und keine wiederholten Füllsätze.

**Sprechmarke.** Gewartet wird nur auf die Sätze VOR der Handlung, nicht auf alles,
was danach noch gesprochen wird: der Text hinter einem `oeffneBereich` geht sofort an
die Stimme, hinge der Seitenwechsel an "die Stimme ist still", käme er erst nach der
ganzen Antwort (gemeldet am 25.09.2026: "Ich öffne den Bereich Feld", die Feldkarte
wird beschrieben, die Seite wechselt nicht). Der Sprecher (`sprachausgabe-strom.ts`,
`stand()`) schätzt aus der gespielten Tondauer, welcher Satz gerade klingt. Die
Sprechgeschwindigkeit wird aus jedem fertigen Strom nachgemessen. Ohne Satzposition
(Vorlesen über einzelne Abschnitte) wartet ein Seitenwechsel höchstens 6 s.

### Sprechmarken und Mitlesen (`domain/sprechmarken.ts`, `sprach-mitlesen.ts`)

Der Rahmen in der Mitte folgt dem Satz, den die Stimme gerade spricht. Welche
Stelle ein Satz meint, sagt seit dem 25.09.2026 (zweite Fassung) eine
**Sprechmarke**: das Modell schreibt „[[a3]] Im Risiko-Radar stehen zwei
Fristen.“, und genau diese Stelle wird gezeigt, wenn die Stimme den Satz
erreicht. Die erste Fassung verglich Wörter des Satzes mit den Texten der Seite
und landete regelmäßig auf fremden Karten (ein Satz über Kühlkettenverstöße im
Prüfbericht traf die Zonenkarte „Hof“, gemessen im Ausgangslauf vom 25.09.2026).

Der Weg einer Marke:

1. **Referenzen:** `seiteLesen` liefert neben den Elementen (`e12`) auch die
   Abschnitte der Seite (`a3`: Karten, Kacheln, Aufklappbereiche, Anker). Beide
   bleiben je Seitenaufruf stabil, nie wieder neu ab `e1`. Jede Sprachmodus-Anfrage
   trägt die **Seitenkarte** der aktuellen Seite mit (`seitenKarte()`), damit das
   Modell ohne vorheriges `seiteLesen` Marken setzen kann. Der Server lässt nur das
   erwartete Format durch (eine Zeile „Seite:“, Zeilen „a3 Titel“, Titel höchstens
   60 Zeichen) und hängt sie als begrenzten Datenblock an die aktuelle Frage
   (`mitSeitenkarte`), nicht an den Systemprompt.
2. **Server:** `erzeugeMarkenFilter` nimmt jede Marke aus dem Text, auch über
   Stückgrenzen hinweg. Anzeige, gespeicherter Verlauf, Signatur und Rückfallweg
   sehen nur sauberen Text. Der Satzzerleger bekommt einen Platzhalter
   (`MARKEN_PLATZHALTER`), trennt dort immer den Satz und hängt das Ziel an genau
   diesen Satz (`data-satz.ziele`, unsigniert). Eine Marke am Ende eines Textteils
   gehört zum ersten Satz nach dem Werkzeug, die eigene Marke eines Satzes geht
   ihr aber vor. Referenzen, die das Modell nicht kennen kann, fallen samt
   Platzhalter weg (`erzeugeMarkenFilter(bekannt)`), sonst rückten alle folgenden
   Ziele einen Satz nach vorn. Filter und Bereinigung laufen nur im Sprachmodus:
   außerhalb davon kann „[[…]]“ gewöhnlicher Text sein.
3. **Browser:** Beim Eintreffen des Satzes wird das Ziel an sein Element gebunden
   (`bindeSprechZiel`), damit ein späteres `seiteLesen` nichts verschiebt. Der
   Sprecher führt es je Satz mit, `stand()` meldet den klingenden Satz samt Ziel,
   und der Sprachmodus zeigt die Stelle (`zeigeSprechStelle`).

Liegt die Stelle in einem **zugeklappten Element** (`details`, `aria-expanded`,
`data-offen`), wird es aufgeklappt (`klappeAuf`), nur was die Anwendung auch ohne
Rückfrage anklickt. Ein Satz ohne Marke lässt den Rahmen stehen. Nur wenn in der
ganzen Antwort keine Marke kam, zeigt eine wörtlich genannte, sichtbare
Überschrift die Stelle (`ueberschriftImSatz`), nie Wortähnlichkeit. Der
klingende Satz steht als `data-satz-jetzt` am Untertitel (für den Führungstest).

### Navigationsleiste

Beim Andocken setzt der Sprachmodus `data-sprach-links` am `<html>`; ein Filter
`blur` liegt direkt auf der Leiste (`data-seitenleiste`, `sidebar.tsx`). Der frühere
`backdrop-filter` auf einer Fläche darüber wirkte im echten Chrome nicht. Außerdem
scrollt `ui-steuerung.ts` nur noch, wenn ein Element nicht ganz im Bild ist
(`inSichtBringen`): `scrollIntoView` verschob sonst die `overflow-hidden`-Leiste selbst
nach oben.

## Voraussetzung zum Einschalten

Beide Einstiege erscheinen nur, wenn **beides** gilt
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

**Zustimmung zum KI-Hinweis.** Vor der ersten Nachricht muss im Chat dem
Hinweis zur KI-Nutzung zugestimmt sein. Bis zum 24.09.2026 setzte der
Sprachmodus diese Zustimmung selbst, ohne dass sie jemand sah, und die erste
gesprochene Frage ging verloren. Jetzt öffnet der Kopfzeilenknopf in diesem Fall
den Chat (dort steht der Hinweis), und der Knopf im Eingabefeld ist bis zur
Zustimmung gesperrt. Beide Einstiege unterbrechen eine laufende Antwort, bevor
der Sprachmodus beginnt; sonst spräche sie in das Zuhören hinein, und die erste
Frage ginge verloren.

**Die Stimme.** Der Sprachmodus spricht über denselben Weg wie das Vorlesen im
Chat, mit Soniox also über den Strom (`sprachausgabe-anbieter.md`, Abschnitt
„Vorlesen als Strom“): der kurze Vorab-Satz klingt, während das Werkzeug noch
läuft. Zwei Fehler, die ihn bis zum 24.09.2026 stumm gemacht oder abgeschnitten
hätten, sind behoben: die Regel „Panel zu heißt still“ griff auch im
Sprachmodus (dort ist das Panel immer zu), und jede Folgeanfrage nach einem
Werkzeug im Browser (zeigeAuf, oeffneBereich) schnitt die laufende Stimme ab.
Eine Runde ist jetzt eine Frage, nicht eine Serverantwort.

## Was noch nicht gemessen ist

Gegen den echten Soniox-Dienst und mit echten Sprecherinnen und Sprechern war
aus der Entwicklungsumgebung kein Test möglich. Vor dem Einschalten in
Produktion: selbst ein Gespräch führen (Chrome und iPhone, alle vier
Sprachen), prüfen, dass Dazwischenreden auslöst, das eigene Echo aber nicht
(Laptop-Lautsprecher, Telefon, Kopfhörer), und die Endpunkt-Parameter
(`GESPRAECH_ENDPUNKT`) sowie `UNTERBRECHEN_STANDARD` je Gerät nachziehen.
