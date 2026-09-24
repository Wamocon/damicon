# Spracheingabe und Sprachausgabe: Analyse und Entscheidung

Stand 24.09.2026. Anlass: Diktat und Vorlesen des KI-Assistenten galten „in
allen Sprachen als sehr schlecht“. Die Fragen dazu: Würde HeyGen besser
funktionieren, welche Möglichkeiten gibt es, lohnt ein Umbau?

Vorgehen: Der Code von Eingabe, Ausgabe und Chat-Einbindung wurde vollständig
gelesen. Dazu kamen Recherchen zu HeyGen, Spracherkennung, Sprachausgabe,
Architektur und Datenstandort, und jede Recherche wurde in einem zweiten
Durchgang gegengeprüft. Viele Herstellerseiten waren aus der Arbeitsumgebung
gesperrt. Belegt ist deshalb vor allem, was sich aus offiziellen SDKs,
Doku-Repositories und der npm-Registry ablesen ließ. Preise stammen aus
Sekundärlisten vom August 2026 und sind vor Vertragsabschluss auf der
Preisseite zu bestätigen.

## Kurzantwort

1. **HeyGen: nein.** HeyGen ist eine Video-Avatar-Plattform, kein
   Sprachdienst, und hat keine eigene Spracherkennungs-API. Der Avatar
   (LiveAvatar, Nachfolger des abgekündigten Interactive Avatar) nutzt
   fremde Dienste: Deepgram oder AssemblyAI für die Erkennung, ElevenLabs
   Flash v2.5 für die Stimme, und die kann kein Kasachisch. Die eigene
   TTS-API (Starfish) liefert nur fertige Dateien und ist auf Chinesisch,
   Japanisch und Koreanisch ausgerichtet. Die Daten liegen nur in den USA.
   Eine Sitzungsminute kostet rund 0,19 bis 0,25 USD (FULL), bei einem
   Sprachdienst sind es Cent-Beträge. HeyGen lohnt nur, wenn ein sichtbarer
   Avatar ein eigenes Ziel wird, und dann im LITE-Modus über der eigenen
   Sprachkette.
2. **Das Hauptproblem lag nicht beim Anbieter, sondern im eigenen Code.**
   Soniox ist für Kasachisch nachweislich stark, wurde aber als reiner
   Datei-Upload benutzt, und Standard war Whisper auf einer CPU. Beim
   Vorlesen wurde jeder Satz einzeln synthetisiert, Belegmarken und
   Sternchen wurden mitgesprochen, und russische Abkürzungen galten als
   Satzende.
3. **Umgesetzt** (dieser Stand, alles hinter Schaltern, Voreinstellung wie
   vorher): Live-Diktat mit Soniox `stt-rt-v5` direkt aus dem Browser,
   Soniox TTS v2 als Stimme mit Sokrates als Rückfall, und eine Reihe von
   Fehlerkorrekturen, die sofort wirken. Details stehen in
   `spracherkennung-anbieter.md` und `sprachausgabe-anbieter.md`.

## Was konkret schlecht war

### Spracheingabe

| Befund | Wirkung |
|---|---|
| Nur Datei-Weg: aufnehmen bis Stille, hochladen, Auftrag anlegen, alle 250 ms abfragen, Text holen, zweimal löschen, alles nacheinander | Kein Text während des Sprechens, danach 2 bis 5 s Warten (mit Whisper 7 bis 9 s) |
| Standard `KI_SPRACHERKENNUNG_ANBIETER=whisper` (CPU auf Caesar, 7 s Mindestdauer) | Standard-Whisper liegt auf Kasachisch laut Studien bei 33 bis 77 % Wortfehlerrate |
| Das Diktat **ersetzte** den Inhalt des Eingabefelds | Nach einer Denkpause war der erste Teil weg: „die Erkennung vergisst die Hälfte“ |
| Ein leeres Soniox-Ergebnis startete Whisper auf derselben Aufnahme | Whisper erfindet auf Stille Sätze („Untertitel der Amara.org-Gemeinschaft“), und die gewannen |
| Keine Fachwörter (`context`), nur ein Sprachhinweis | Eigennamen und Fachbegriffe wurden verhört, der Wechsel zwischen ru und kk lief schlecht |
| `getUserMedia` ohne Vorgaben, also mit der Rauschunterdrückung für Telefonate | Silbenanfänge und leise Laute wurden beschnitten |
| Feste Pegelschwelle 0,02 | Leise Sprechende wurden nach 4 s als „nichts aufgenommen“ verworfen, Denkpausen ab 1,2 s abgeschnitten |
| Das Vorlesen lief beim Mikrofon-Klick weiter | Die Stimme des Assistenten landete im Diktat |

### Sprachausgabe

| Befund | Wirkung |
|---|---|
| Der Zerleger gab jeden Satz einzeln heraus (das Ziel von 250 Zeichen griff nie) | Abgehackt, eigene Satzmelodie und Pause je Satz |
| Der erste Abschnitt endete am ersten Komma, das fette Fazit verdeckte das Satzende | Ein Bruch mitten im ersten Satz jeder Antwort |
| Keine russischen und kasachischen Abkürzungen | „Итого 5 млн. тг., т. е. …, см. п. 3 ст. 82 НК РК.“ zerfiel in sieben Stücke, „е.“ und „п.“ wurden allein gesprochen |
| Belegmarken `[S1]`, Adressen, Sternchen und Symbole gingen an die Stimme | „S eins S drei“, Adressen Zeichen für Zeichen |
| „Antworten vorlesen“ und Live-Vorlesen liefen beide | Doppelte, überlappende Wiedergabe; Stopp hielt nur einen Weg an |
| Stimmen `de/en/ru/kk-female` auf Sokrates, vermutlich Piper- oder VITS-Klasse | Obergrenze der Natürlichkeit, die kein Code-Fix hebt |

## Anbieter im Vergleich (Auszug)

### Spracherkennung für de, en, ru und kk

| Anbieter | Kasachisch | Echtzeit aus dem Browser | EU | Einordnung |
|---|---|---|---|---|
| **Soniox `stt-rt-v5`** | ja; Herstellermessung 9 % WER (OpenAI 34 %) | ja, kurzlebige Schlüssel | ja (`eu.soniox.com`) | **gewählt**: stärkstes belegtes Kasachisch, günstig (etwa 0,12 USD je Stunde), Vertrag besteht |
| ElevenLabs Scribe v2 Realtime | ja („High Accuracy“) | ja (nur PCM, höchstens 50 Begriffe) | nur Enterprise | Zweitkandidat für einen Vergleich |
| Azure AI Speech | ja (kk-KZ) | SDK | ja | reif; **Container für den Betrieb in Kasachstan** |
| OpenAI gpt-transcribe | gelistet, ungemessen | ja | Freigabe nötig | offen |
| Deepgram, AssemblyAI, Speechmatics | kk fehlt oder unbelegt | | | ausgeschieden |

### Sprachausgabe für de, en, ru und kk

| Anbieter | Kasachisch | EU | Einordnung |
|---|---|---|---|
| **Soniox TTS v2 (`tts-rt-v2`)** | ja (Modellliste) | ja | **gewählt**: ein Anbieter, ein AVV, eine Stimme für alle vier Sprachen; Qualitätsrang ungeprüft, deshalb Blindtest |
| ElevenLabs Eleven v3 | ja | nur Enterprise | vermutlich die natürlichste kasachische Stimme, teuer, v3 ohne WebSocket |
| Azure Neural und HD | ja (Aigul, Daulet, mehrsprachige HD-Stimmen) | ja | Rückfallebene, Container für Kasachstan |
| Cartesia Sonic 3.6 | nein | | beste Stimme für de, en und ru, scheidet für kk aus |
| ElevenLabs Flash v2.5, Deepgram Aura-2 | nein | | ausgeschieden |

### Speech-to-Speech (OpenAI Realtime, Gemini Live)

Das kommt nicht als Hauptweg in Frage. Die Antworten müssen aus dem eigenen
Claude-Agenten mit Supabase-Werkzeugen und RLS kommen. Ein Sprachmodell mit
eigener Logik hieße, diese Werkzeuge doppelt zu bauen. Die gestreamte Kette
Erkennung, Agent, Stimme bleibt richtig.

## Was noch offen ist

1. **Einschalten und hören.** Aus der Entwicklungsumgebung war kein Zugriff
   auf Soniox oder Sokrates möglich, nichts davon ist gegen den echten Dienst
   gemessen. Reihenfolge: `KI_SPRACHERKENNUNG_ANBIETER=soniox`,
   `KI_DIKTAT_LIVE=an`, `KI_SPRACHAUSGABE_ANBIETER=soniox` in einer
   Vorschau-Umgebung setzen, dann je Sprache selbst diktieren und vorlesen
   lassen (Chrome und iPhone). Zurückgenommen wird jeweils über denselben
   Schalter.
2. **Blindtest mit Muttersprachlern**, vor allem für kk und ru: je 20 bis 30
   echte Diktate mit Fachwörtern und Hofgeräusch (Wortfehlerrate, Zeit bis
   zum Text) und je 20 bis 30 vorgelesene Antworten (Soniox gegen Sokrates,
   optional ElevenLabs v3 und Azure). Erst danach die Voreinstellungen
   ändern.
3. **Pilot mit echten Stimmen:** Soniox-EU-Projekt mit eigenem Schlüssel,
   AVV, Verarbeitungszweck und Einwilligung im Compliance-Modul, wie in
   `spracherkennung-anbieter.md` beschrieben, jetzt für beide Richtungen.
   Der Einwilligungstext nennt bisher nur die Frage an den KI-Anbieter, nicht
   die Stimme.
4. **Kasachstan:** Kein Cloud-Anbieter hat eine Region im Land. Der stärkste
   Weg für die Lokalisierung sind Azure-Speech-Container (kk-KZ für Erkennung
   und Stimme) auf eigenen Servern in Kasachstan, alternativ ein kasachisch
   feinjustiertes Whisper-Turbo auf GPU (zum GPU-Problem von Caesar siehe
   `caesar-spracherkennung.md`). Die Anbieterschalter sind so gebaut, dass
   das Konfiguration bleibt. Ob die reine Durchleitung ins Ausland mit
   Einwilligung genügt (Gesetz 94-V, Art. 12 und 16), muss ein kasachischer
   Anwalt bestätigen. Auch der Audio-Zwischenspeicher im Supabase-Bucket
   gehört in diese Prüfung.
5. **Nächste technische Stufe (optional):** Live-Vorlesen direkt aus dem
   Browser per Soniox-TTS-WebSocket mit den LLM-Tokens als Eingabe, statt
   signierter Abschnitte über Vercel. Das bringt noch weniger Latenz und eine
   durchgehende Satzmelodie und lohnt erst, wenn der Blindtest Soniox als
   Stimme bestätigt.

## Quellen (Auswahl, alle abgerufen am 24.09.2026)

- Soniox SDK (Protokoll, Modelle, Schlüssel, Regionen): github.com/soniox/soniox-js
  (`packages/core/src/realtime/stt.ts`, `tts-rest.ts`, `connection.ts`,
  `packages/node/src/async/auth.ts`, Version 2.3.0 vom 11.08.2026)
- Soniox API-Spezifikation (Sprachen der Modelle, Stimmen): github.com/soniox/soniox-python,
  `tests/data/openapi.json`; Beispiel „Update stt to v5“ (16.06.2026):
  github.com/soniox/soniox_examples
- HeyGen: npm `@heygen/streaming-avatar` (abgekündigt), `@heygen/liveavatar-web-sdk` 0.0.19
  (16.09.2026), github.com/heygen-com/liveavatar-agent-skills, github.com/heygen-com/heygen-cli
- ElevenLabs: npm `@elevenlabs/elevenlabs-js` 2.68.0, github.com/elevenlabs/skills
- Azure: github.com/MicrosoftDocs/azure-ai-docs (Sprachunterstützung, Regionen),
  mcr.microsoft.com (Speech-Container kk-KZ)
- Kasachisch-Whisper: MDPI-Studien vom Oktober 2025 und Juli 2026 (WER von
  Standard-Whisper im Vergleich zu feinjustierten Modellen)
