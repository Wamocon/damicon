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

## Stimme

Voreinstellung bei Soniox ist `Maya` (weiblich, wie die bisherigen Stimmen),
einstellbar über `SONIOX_TTS_STIMME`. Anders als Sokrates lehnt Soniox einen
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

Die Version steckt im Ablagepfad des Zwischenspeichers
(`<nachricht>/<anbieter>-<stimme>-<sprache>-v2.mp3`). Nach jeder
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

Außerdem im Client (`ki-chat-sprache.ts`): Kamen für eine Antwort schon
Live-Abschnitte, wird sie nach dem Ende nicht noch einmal ganz vorgelesen
(vorher lief beides übereinander). Stopp, Mikrofon, Tippen, neue Frage und
Schließen des Panels halten jetzt **beide** Wiedergaben an. Der Vorlese-Knopf
schickt die Sprache der Antwort aus den Nachrichten-Metadaten mit, nicht mehr
die Oberflächensprache.

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
