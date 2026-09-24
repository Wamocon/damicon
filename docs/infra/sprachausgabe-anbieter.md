# Sprachausgabe: Anbieter, Stimmen, Textaufbereitung

Stand 24.09.2026.

## Der Schalter

`KI_SPRACHAUSGABE_ANBIETER` entscheidet, wer die Antworten vorliest:

| Wert | Bedeutung |
|---|---|
| `sokrates` (Voreinstellung) | Unsere Stimmen auf der Sokrates-API (`/audio/speech`), eine je Sprache: `de-female`, `en-female`, `ru-female`, `kk-female`. Welche Engine dahintersteht, ist nicht dokumentiert. Messwerte (0,2 bis 0,7 s und 11 bis 34 kB MP3 je Satz) und der Vorgänger (Piper auf Caesar) sprechen für eine kleine Engine der Piper- oder VITS-Klasse. |
| `soniox` | Soniox TTS v2 (`tts-rt-v2`). **Eine** mehrsprachige Stimme für alle vier Sprachen, die Sprache geht als eigenes Feld mit. Kann de, en, ru und kk (Modellliste der Soniox-API). |

**Der Rückfall ist immer da.** Mit `soniox` wird zuerst Soniox gefragt.
Schlägt das fehl (Störung, Zeitüberschreitung, fehlender Schlüssel,
unbekannte Stimme), spricht Sokrates, und im Protokoll steht
`Sprachausgabe ueber soniox fehlgeschlagen: …`. Umschalten und Abschalten
geschehen über die Umgebung, ohne neuen Code:

```
KI_SPRACHAUSGABE_ANBIETER=soniox     # an
KI_SPRACHAUSGABE_ANBIETER=sokrates   # aus
```

Die Kette steht in `stimmenFuer()` (`src/lib/domain/sprachausgabe.ts`) und
`erzeugeSprachausgabeMitRueckfall()` (`src/lib/ai/sprachausgabe-client.ts`).
Beide Wege der Route `/api/ki-sprachausgabe` nutzen sie: die ganze Antwort
über die Nachrichten-ID und die signierten Abschnitte beim Live-Vorlesen.

## Vorlesen als Strom (seit 24.09.2026)

**Warum.** Rückmeldung nach dem ersten Test: die Zusammenfassung nach der Tour
begann erst etwa 5 Sekunden nach dem ersten geschriebenen Wort zu klingen, und
zwischen den Abschnitten lagen lange Pausen. Die Ursache stand in den
Protokollen der Vorschau: Soniox erzeugt Sprache **etwa in Echtzeit** (Soniox,
Leitfaden zu temporären Schlüsseln: „TTS streams audio at roughly real-time
pace“), gemessen 61 bis 72 ms je Zeichen. Der bisherige Weg holte jeden
Abschnitt als ganze Datei und spielte ihn erst danach. Er wartete also je
Abschnitt ungefähr so lange, wie der Abschnitt klingt, und der nächste war nie
rechtzeitig fertig.

**Wie.** Der Browser spricht direkt mit dem Soniox-TTS-WebSocket
(`wss://tts-rt.<region>.soniox.com/tts-websocket`):

- Zu Beginn jeder Antwort schickt der Chat-Stream einen signierten
  **Zug-Nachweis** (`data-nachweis`). Damit holt der Browser, noch während das
  Modell über den ersten Satz nachdenkt, einen kurzlebigen Schlüssel
  (`POST /api/ki-sprachausgabe/schluessel`, `usage_type: tts_rt`), dazu Stimme,
  Tempo, Format (PCM, 24 kHz) und Region je Sprache. Der echte Schlüssel
  verlässt den Server nie.
- Jeder Satz geht sofort in den Strom (der Zerleger läuft dafür satzweise, siehe
  unten), das Audio kommt als PCM zurück, während es entsteht, und wird im
  Browser lückenlos auf einer Zeitachse eingeplant
  (`src/components/ki/sprachausgabe-strom.ts`). Die Stimme spricht über
  Satzgrenzen hinweg mit einer Satzmelodie. Ein kleiner Vorlauf (0,25 s) fängt
  Schwankungen im Netz ab und verdoppelt sich nach jedem Aussetzer, bis 1 s.
- **Immer nur ein Strom.** Soniox erzeugt mehrere Ströme einer Verbindung
  gleichzeitig; ihr Ton käme verschränkt an. Text, den der laufende Strom nicht
  mehr nimmt, wartet, bis dieser fertig ist. Einen neuen Strom gibt es, wenn 4 s
  kein Text kam (ein Werkzeug läuft; Soniox beendet einen Strom ohne Text nach
  einigen Sekunden mit 408), wenn die Sprache wechselt oder die Zeichengrenze
  erreicht ist (1.300 Zeichen bei Tempo 1,1, weniger bei langsamerem Tempo:
  Soniox liefert höchstens 2 Minuten Audio je Strom).
- Die Verbindung bleibt über Fragen hinweg offen (Keepalive alle 5 s, nach 20 s
  ohne Strom zu). Ein Stopp bricht nur den Strom ab (`cancel`).
- Fehler: was noch nicht geklungen hat, wird aus der empfangenen Tondauer
  geschätzt. Bei abgelehnter Pausenkürzung, abgelaufenem Schlüssel, 408 oder
  413 geht dieser Rest in einen neuen Strom; bei allem anderen (Kontingent,
  Dienststörung, Verbindung weg) liest ihn der bisherige Weg über signierte
  Abschnitte. Kommt die Verbindung zweimal nicht zustande (Proxy blockt
  WebSockets), nimmt der Tab gleich den bisherigen Weg.
- Die reine Logik (Protokoll, Fehlerfolge, PCM, Zeitachse, Schätzung) steht in
  `src/lib/domain/sprachausgabe-strom.ts` und ist in
  `supabase/tests/ki-assistent.mjs` geprüft, der Sprecher selbst dort mit einem
  nachgebauten WebSocket und AudioContext (ein Strom zur Zeit, Zählung beim
  Aufgeben, Stopp, Verbindungsfehler).

**Sicherheitsmodell.** Anders als die signierten Abschnitte bindet ein
Schlüssel den Text nicht. Deshalb eng begrenzt (Prüfung vom 24.09.2026, die
erste Fassung war zu offen):

- nur mit **Nachweis**: die laufende Antwort (Zug-Nachweis, gleiche Signatur wie
  ein Abschnitt mit Nummer 0 und leerem Text; der Abschnitts-Weg lehnt leeren
  Text ab, eine Verwechslung ist ausgeschlossen) oder eine gespeicherte eigene
  Antwort (Nachrichten-ID, per RLS gelesen),
- **einmalig**: ein Schlüssel öffnet genau einen Strom, 60 s lang; ein Strom
  dauert höchstens 150 s,
- feste Obergrenze von **12 Schlüsseln je Person und Minute**, auch ohne
  Einstellung im Admin-Bereich, dazu die Grenze des Vorlesens,
- nur angemeldet und mit Recht am KI-Assistenten, pseudonyme Kennung bei Soniox.

Ein Missbrauch kostet also höchstens wenige Sprachminuten einer angemeldeten
Person mit einer echten Antwort und ist ihr über die Kennung zuzuordnen.

**Grenzen bei Soniox**, gegen die geplant ist: 3 gleichzeitige Ströme für die
**ganze Organisation** (erhöhbar), 100 Anfragen je Minute, 2 Minuten Audio je
Strom. Ein Nutzer belegt höchstens einen Strom. Sprechen mehr als drei Personen
gleichzeitig, bekommt die vierte einen Fehler und hört den Rückfall über
einzelne Abschnitte. Vor einem Einsatz mit vielen Nutzern das Limit bei Soniox
anheben lassen.

**Welcher Zerleger.** Der Chat meldet bei jeder Frage mit, welchen Weg der
Browser nimmt (`vorleseWeg`). Nur beim Strom schneidet der Server satzweise;
sonst längere Abschnitte, damit der Rückfall nicht in Einzelsätze zerfällt.

**Abschalten:** `KI_SPRACHAUSGABE_STROM=aus`. Dann liest wieder der bisherige
Weg (Abschnitte, ganze Antwort). Mit Sokrates gibt es keinen Strom.

## Stimme

Voreinstellung bei Soniox ist `Maya` (weiblich, wie die bisherigen Stimmen),
einstellbar über `SONIOX_TTS_STIMME` und seit 24.09.2026 je Sprache über
`SONIOX_TTS_STIMME_DE`, `_EN`, `_RU`, `_KK`. Soniox beschreibt Maya selbst als
bedächtig („measured delivery“); lebhafter beschrieben sind etwa Nina und
Claire. Dazu kommen **Tempo** (`KI_SPRACHAUSGABE_TEMPO`, Voreinstellung 1,1,
erlaubt 0,7 bis 1,3, je Sprache z. B. `de:1.15,ru:1.05`) und **kürzere Pausen
zwischen Wörtern** (`reduce_silence`, an, abschaltbar mit
`KI_SPRACHAUSGABE_STILLE_KUERZEN=aus`). Beides geht an den Strom und an die
bisherigen REST-Anfragen. Anders als Sokrates lehnt Soniox einen
unbekannten Namen ab. Ein Tippfehler fällt deshalb als Rückfall im Protokoll
auf, nicht als fremd klingende Antwort. Welche Stimme in allen vier Sprachen
am besten klingt, ist **nicht gemessen**. Vor dem Pilot mit Muttersprachlern
je Sprache blind gegen Sokrates vergleichen (Liste der Stimmen:
`GET /v1/tts-models` bei Soniox).

## Textaufbereitung

Was die Stimme bekommt, entsteht in drei Schritten:

1. `textFuerSprachausgabe()` entfernt das Markdown. Seit 24.09.2026
   (`VORLESETEXT_VERSION = 2`) zusätzlich: Belegmarken `[S1][S3]` fallen weg
   (sie wurden als „S eins S drei“ gesprochen), nackte Adressen fallen weg,
   nummerierte Listen verlieren ihre Nummer, Zeilen ohne Satzzeichen
   (Überschriften, Listenpunkte, Tabellenzeilen) bekommen einen Punkt,
   Pfeile werden eine Pause, Haken und Bildzeichen fallen weg, verwaiste
   Sternchen fallen weg, Unterstriche in Kennungen bleiben.
2. `sprechfassung()` greift, sobald die Sprache feststeht: `₸` und `KZT`
   werden „Tenge“, „тенге“ oder „теңге“, eindeutige Tausendertrennung
   („1.150.000“, „1 150 000“) wird eine Zahl. Zahlen, Prozent und Einheiten
   bleiben der Stimme überlassen. Im Russischen und Kasachischen richtet sich
   ihre Form nach dem Satz, eine feste Regel machte es schlechter.
3. Auf Deutsch kommen echte Umlaute dazu (`fuerSprache()` aus
   `src/lib/text/umlaute.ts`), dieselbe Korrektur, die die Anzeige schon hatte.

Seit `VORLESETEXT_VERSION = 3` (24.09.2026, Rückmeldung „zu lange Pausen“),
gemessen an echten Zusammenfassungen, in denen 14 von 34 Zeilen einen
künstlichen Punkt bekamen:

- Überschriften enden mit Doppelpunkt statt Punkt: sie leiten ein, statt als
  eigener Satz mit voller Pause dazustehen.
- Tabellen ohne Kopfzeile, jede Zeile als „Erste Zelle: der Rest“, leere und
  Strich-Zellen fallen weg.
- Lange Kennungen wie `CH-T-N-A-01-2609201616-40A7` werden nicht gelesen (die
  Stimme las sie Zeichen für Zeichen).
- Wörter ganz in Großbuchstaben ab fünf Buchstaben werden normal geschrieben
  (Soniox liest Großbuchstaben laut), Abkürzungen wie HACCP bleiben.
- Zeilenumbrüche gehen als Leerzeichen an die Stimme, „≈ 5“ wird „etwa 5“.
- „z. B.“, „u. U.“, „i. d. R.“ werden nicht mehr zerteilt, und an der
  Obergrenze endet der Text am Satzende statt mitten im Wort.

Die Version und das Tempo stecken im Ablagepfad des Zwischenspeichers
(`<nachricht>/<anbieter>-<stimme>-<sprache>-t110-v3.mp3`). Nach jeder
Verbesserung entsteht neues Audio, statt dass der Speicher das alte weiter
ausliefert.

## Live-Vorlesen: der Zerleger

`erzeugeSatzZerleger()` teilt die Antwort beim Schreiben in Abschnitte.
Gemessen am 24.09.2026, Wort für Wort gefüttert wie im echten Stream, lief
davor einiges schief. Alles davon ist behoben:

| Vorher | Jetzt |
|---|---|
| Jeder Satz war eine eigene Anfrage (das 250-Zeichen-Ziel griff nie), abgehackt, mit eigener Satzmelodie je Satz | Erster Abschnitt ist der erste ganze Satz, der zweite reicht bis etwa 120 Zeichen, danach etwa 250 Zeichen |
| Der erste Abschnitt wurde am ersten Komma geteilt | Nur ein langer erster Satz (über 90 Zeichen) wird am letzten Komma geteilt |
| Das fette Fazit (`**… erreicht.**`) verdeckte das erste Satzende | `*` und `_` hinter dem Punkt zählen als Platz |
| „15.“ und „März“ sowie „Mio.“ galten als Satzende | Eine Ordnungszahl vor einem Monat oder vor einem kleinen Wort ist kein Satzende; `Mio.`, `Mrd.`, `Tsd.` und weitere stehen in der Liste |
| Russisch und Kasachisch: „т. е.“, „ст.“, „п.“, „млн.“, „ж.“, „т.б.“ galten als Satzende, ein Satz zerfiel in bis zu sieben Stücke | Abkürzungen in allen vier Sprachen, kyrillische Initialen |
| Überschriften und Listen ohne Satzzeichen liefen ineinander | Ein Zeilenende ist eine Grenze |
| Agent-Modus: Textteile ohne Trenner („LohnabrechnungHier …“) | Ein Absatz bei jedem Ende eines Textteils |
| Ein Abschnitt, der an einem Zeilenende oder am Antwortende aufhörte, ging ohne Satzzeichen an die Stimme. Sie las das letzte Wort wie mitten im Satz und brach dort ab | Solche Abschnitte bekommen einen Punkt. Ein Schnitt am Komma mitten im Satz bleibt ohne |

Außerdem im Client (`ki-chat-sprache.ts`): Kamen für eine Antwort schon
Live-Abschnitte, wird sie nach dem Ende nicht noch einmal ganz vorgelesen
(vorher lief beides übereinander). Stopp, Mikrofon, Tippen, neue Frage und
Schließen des Panels halten jetzt **beide** Wiedergaben an. Der Vorlese-Knopf
schickt die Sprache der Antwort aus den Nachrichten-Metadaten mit, nicht mehr
die Oberflächensprache.

## Vorlese-Knopf ohne Soniox-Strom: der Ton als HTTP-Strom

Mit Soniox liest der Knopf über den WebSocket-Strom (oben). Dieser Abschnitt
beschreibt den Weg ohne ihn (Sokrates, `KI_SPRACHAUSGABE_STROM=aus`, oder wenn
der Strom scheitert). Mit Soniox gilt dort die 2-Minuten-Grenze je Anfrage:
eine sehr lange Antwort endet dann nach 2 Minuten.

Bis zum 24.09.2026 lief der Knopf an einer fertigen Antwort so: Route fragt
den Anbieter, wartet auf die **komplette** Datei, schickt sie, der Browser lädt
sie ganz und spielt erst dann. Bei einer langen Antwort vergingen so viele
Sekunden, bis der erste Ton kam, weil die Datei erst fertig ist, wenn auch der
letzte Satz erzeugt ist.

Jetzt gibt es `GET /api/ki-sprachausgabe?nachricht=<id>&sprache=<de>`. Die
Route reicht den Ton weiter, während der Anbieter ihn erzeugt (Soniox liefert
seine Antwort stückweise, siehe `generateStream` im offiziellen SDK), und das
`<audio>`-Element spielt MP3 schon während des Ladens. Dieselben Prüfungen wie
beim POST: Anmeldung, Berechtigung, Ratenbegrenzung, Lesen der Antwort über
RLS, nur Nachrichten-IDs, nie freier Text.

- Der Strom wird geteilt (`tee()`): ein Zweig geht an den Hörer, der andere
  nach der Antwort in den Zwischenspeicher. Reißt der Strom ab, wird nichts
  abgelegt.
- Der Browser behält den frischen Strom nicht (`no-store`). Beim nächsten Mal
  kommt die Datei fertig aus dem Speicher.
- Der Rückfall auf Sokrates greift nur, solange noch kein Ton geflossen ist.
- Scheitert der Strom im Browser (etwa ein 404 direkt nach dem Ende des Chat-
  Streams), nimmt der Knopf den bisherigen Datei-Weg per POST mit zweitem
  Versuch und genauer Meldung.
- `play()` steht vor jedem `await`. Auf dem iPhone gehört der Ton dadurch noch
  zur Geste und wird nicht verweigert.

## Datenstandort

Wie bei der Spracherkennung steht keine Region im Code. Die Adresse wird aus
`SONIOX_API_URL` abgeleitet (`api.eu.soniox.com` wird zu
`https://tts-rt.eu.soniox.com`) oder über `SONIOX_TTS_URL` gesetzt. Es gelten
dieselben Phasen wie in `spracherkennung-anbieter.md`: Demo frei, Pilot nur
mit EU-Region und AVV, beim Kunden die Datenlokalisierung in Kasachstan. Der
Text der Antworten geht an Soniox, das Audio liegt im Bucket
`ki-sprachausgabe` (Supabase). Für kasachische Mandanten ist zu klären, ob
dieser Zwischenspeicher im Land liegen muss.

## Variablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `KI_SPRACHAUSGABE_ANBIETER` | nein | `sokrates` (Voreinstellung) oder `soniox` |
| `SONIOX_API_KEY` | ja, wenn `soniox` | Derselbe Schlüssel wie für die Spracherkennung |
| `SONIOX_API_URL` | ja, wenn `soniox` (oder `SONIOX_TTS_URL`) | Region, z. B. `https://api.eu.soniox.com` |
| `SONIOX_TTS_URL` | nein | Nur, wenn sich die Adresse nicht ableiten lässt |
| `SONIOX_TTS_STIMME` | nein | Stimmname bei Soniox, Voreinstellung `Maya` |
| `KI_SOKRATES_API_SCHLUESSEL` | ja | Sokrates bleibt der Rückfall |
| `KI_SPRACHAUSGABE_STROM` | nein | Voreinstellung an, sobald Soniox spricht; `aus` schaltet auf einzelne Abschnitte zurück |
| `KI_SPRACHAUSGABE_TEMPO` | nein | Sprechtempo bei Soniox, Voreinstellung 1,1; eine Zahl oder je Sprache (`de:1.15,ru:1.05`, Punkt als Dezimalzeichen) |
| `KI_SPRACHAUSGABE_STILLE_KUERZEN` | nein | Kürzere Pausen zwischen Wörtern, Voreinstellung an; `aus` schaltet ab |
| `SONIOX_TTS_STIMME_DE` (`_EN`, `_RU`, `_KK`) | nein | Stimme je Sprache, vor `SONIOX_TTS_STIMME` |
| `SONIOX_TTS_WS_URL` | nein | Nur, wenn sich die WebSocket-Adresse nicht aus `SONIOX_API_URL` ableiten lässt |

**Achtung bei Vorschau-Umgebungen:** In Vercel können Variablen für einen
einzelnen Branch gesetzt sein. Am 24.09.2026 standen `KI_DIKTAT_LIVE`,
`KI_SPRACHAUSGABE_LIVE`, `KI_SPRACHAUSGABE_ANBIETER` und
`KI_SPRACHAUSGABE_SIGNATUR` nur für `feat/ki-sprache-live-diktat`. Die Vorschau
des davon abgeleiteten Branches `feat/ki-sprachmodus` lief deshalb mit der
alten Kette: Vorlesen erst nach der fertigen Antwort, Sokrates-Stimme, kein
Live-Diktat und damit auch kein Sprachmodus. Für jeden neuen Branch, der die
Sprachfunktionen zeigen soll, und vor dem Merge für Production sind alle vier
zu setzen (`vercel env ls` zeigt, für welchen Branch sie gelten).
