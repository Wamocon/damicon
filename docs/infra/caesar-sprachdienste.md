# Caesar: Sprachdienste (Spracheingabe und Sprachausgabe) - Betriebsnotiz

Caesar ist der GPU-Rechner im Büro-LAN (`192.168.178.64`, Hostname `spark-414b`,
NVIDIA GB10 / DGX Spark, Ubuntu 24.04, arm64). Er stellt für Damicon zwei
Sprachdienste bereit, beide selbst gehostet statt als Cloud-Dienst:

| Dienst | Container | Port | Endpunkt | App-Variable |
|---|---|---|---|---|
| Spracheingabe (Speech-to-Text, Whisper) | `whisper` | 8787 | `POST /v1/audio/transcriptions` | `KI_TRANSKRIPTION_URL` |
| Sprachausgabe (Text-to-Speech, Piper) | `damicon-tts` | 8789 | `POST /v1/audio/speech` | `KI_SPRACHAUSGABE_URL` |

Zugang per SSH: Nutzer `wamocon`, Schlüssel über NVIDIA Sync. Unter Windows nur mit
dem Windows-OpenSSH (`C:\Windows\System32\OpenSSH\ssh.exe`) - das `ssh` aus Git Bash
liest die NVIDIA-Sync-Konfiguration nicht und scheitert mit "Permission denied".

Auf Caesar laufen zahlreiche weitere Team-Dienste (Ollama, LiteLLM, n8n, Firecrawl,
openedai-speech, Monitoring ...). Alle Änderungen unten betreffen ausschließlich
`whisper` und `damicon-tts`.

## 1. Whisper (Spracheingabe) - Änderung vom 19.09.2026

Compose-Projekt `lokal-ai-stack`, Datei `/home/wamocon/lokal-ai-stack/docker-compose.dgx.yml`,
nur der Block `whisper`:

| Einstellung | vorher | nachher | Warum |
|---|---|---|---|
| `WHISPER__TTL` | nicht gesetzt (Standard 300 s) | `-1` | Modell wird nie entladen |
| `PRELOAD_MODELS` | nicht gesetzt | `["Systran/faster-whisper-large-v3"]` | Modell lädt beim Containerstart, nicht erst bei der ersten Anfrage |
| Speichergrenze | `4G` | `12G` | das Modell braucht ~7 GB; mit 4G lagen ~3 GB im Swap |
| Label `com.centurylinklabs.watchtower.enable` | - | `false` | Watchtower startet den Container sonst bei jedem Image-Update neu (= Modell neu laden) |

**Warum:** Cloudflare bricht Anfragen durch den Tunnel nach 100 s ohne Antwort ab (HTTP 524).
Ein kalter Start von Whisper dauerte 62 s bis 221 s.

**Gemessen (19.09.2026, ~5 s Sprache):**

| | vorher | nachher |
|---|---|---|
| Modell bereit nach Neustart | erst bei der ersten Anfrage, 62 s | automatisch nach 16 s |
| erste / weitere Transkription | 62 s / 7,7 s | 13,6 s / 7,2 s |
| Speicher / Swap | 3.765 von 4.096 MiB, 3.098 MiB Swap | 7.182 von 12.288 MiB, 0 Swap |

**Zurücksetzen:** die Originaldatei liegt daneben als
`docker-compose.dgx.yml.bak-20260919-vor-damicon-whisper`. Zurückkopieren, dann
`docker compose -f docker-compose.dgx.yml up -d --no-deps --pull never whisper`
(`--no-deps`: kein anderer Dienst wird angefasst).

**Updates:** Watchtower ist für `whisper` bewusst aus. Ein Update also von Hand:
Image ziehen, `up -d --no-deps whisper`, danach ~16 s bis das Modell geladen ist.

## 2. damicon-tts (Sprachausgabe) - neu seit 19.09.2026

Eigenes Compose-Projekt, getrennt von `lokal-ai-stack`: `/home/wamocon/damicon-tts/compose.yml`.

- Image: `ghcr.io/speaches-ai/speaches:0.8.3-cpu`, per Digest festgelegt
  (`sha256:21e3df06...`). speaches ist der Nachfolger von faster-whisper-server (MIT).
  CPU-Image: Piper läuft auf der CPU und konkurriert nicht mit Whisper um die GPU.
- `WHISPER__TTL=-1`: speaches nimmt die Haltezeit der Piper-Stimmen aus dieser
  Variable (im Quelltext als "HACK" markiert) - `-1` = Stimmen bleiben geladen.
- `ENABLE_UI=false`: eingebaute Web-Oberfläche aus.
- Speichergrenze 4G, Watchtower aus, Port 8789.
- Antwortzeit: 0,1-1,4 s je Satz, kein Kaltstart-Problem.

**Stimmen verwalten** (auf Caesar):

```bash
curl -X POST   http://localhost:8789/v1/models/speaches-ai/piper-de_DE-mls-medium   # laden
curl -X DELETE http://localhost:8789/v1/models/speaches-ai/piper-de_DE-mls-medium   # entfernen
curl http://localhost:8789/v1/models                                                # installiert
```

Die Zuordnung Sprache -> Stimme steht im Code: `src/lib/domain/sprachausgabe.ts` (`STIMMEN`).
Eine Stimme, die dort nicht steht, wird nie benutzt, auch wenn sie installiert ist.

**Entfernen:** `cd /home/wamocon/damicon-tts && docker compose down -v` (`-v` löscht die
heruntergeladenen Stimmen mit).

## 3. Stimmen und Lizenzen

Die Anwendung ist kommerziell. Maßgeblich ist deshalb nicht nur die Lizenz der
Trainingsdaten einer Stimme, sondern auch, **wovon sie abgeleitet ist**: sehr viele
Piper-Stimmen sind vom US-englischen `lessac`-Modell aus feinjustiert, und dessen
Daten stehen unter der Blizzard-2013-Lizenz - nur Forschung, ausdrücklich keine
kommerziellen Sprachsyntheseprodukte.

| Sprache | Stimme | Trainiert | Lizenz | Status |
|---|---|---|---|---|
| de | `mls` (medium) | von Grund auf | CC BY 4.0 (Multilingual LibriSpeech) | **im Einsatz**, Namensnennung im Impressum |
| en | `cori` (high) | von Grund auf, ~24 h LibriVox | gemeinfrei (Bryce Beattie) | **im Einsatz** |
| kk | `issai` (high) | von Grund auf | CC BY 4.0 (KazakhTTS, ISSAI) | **im Einsatz**, Namensnennung im Impressum |
| ru | - | - | - | **keine Stimme** (siehe unten) |
| tr | - | - | - | **keine Stimme**: einzige offizielle Stimme `dfki` ist CC BY-NC-SA |

`cori`: LibriVox erklärt seine Aufnahmen für gemeinfrei "definitely in the USA",
außerhalb der USA "not necessarily" - der Vorbehalt betrifft den Urheberschutz der
vorgelesenen Buchtexte, nicht den Klang der Stimme.

Zuvor verworfen, weil von `lessac` abgeleitet: `thorsten` (de), `alba` (en) und die
russischen Stimmen unten.

### Russisch: alle vier Piper-Stimmen verworfen

| Stimme | Grund |
|---|---|
| `denis` | von `lessac` feinjustiert |
| `dmitri` | von `lessac` feinjustiert |
| `irina` | von `lessac` feinjustiert, zusätzlich Datensatz-Lizenz "Unknown" |
| `ruslan` | Name und Daten entsprechen dem RUSLAN-Korpus, dessen Quelle CC BY-NC-SA ist (nicht kommerziell) |

Kostenlose Alternativen gibt es ebenfalls nicht: Silero ist in der freien Fassung
nicht kommerziell, Coqui XTTS ebenfalls (die Firma existiert nicht mehr).

Die Route `api/ki-sprachausgabe` antwortet für russische Antworten mit `422 keine-stimme`,
genau wie für türkische; im Seitenpanel erscheint ein Hinweis statt Audio.

### Backlog (blockiert nichts): eigene russische Stimme

Empfohlene spätere Lösung: eine russische Piper-Stimme **von Grund auf** (nicht von
`lessac` feinjustiert) auf Caesars GPU trainieren, mit Daten, die kommerzielle Nutzung
erlauben:

- **Mozilla Common Voice (Russisch)** - CC0.
- **M-AILABS Speech Dataset** - eigene Lizenz, **vor Verwendung prüfen**; nicht CC0.

Aufwand grob: Datenauswahl eines einzelnen, sauber sprechenden Sprechers, dann einige
Tage GPU-Training. Danach Stimme in `damicon-tts` laden und in `STIMMEN` eintragen.

## 4. Offene Punkte

- **Cloudflare Tunnel** vor Caesar (Transkription und Sprachausgabe hinter demselben
  Access-Token, nur die beiden Pfade oben erreichbar, alles andere 404): vorbereitet,
  wartet auf Cloudflare-Anmeldung und API-Token. Danach in Vercel:
  `KI_TRANSKRIPTION_URL`, `KI_SPRACHAUSGABE_URL`, `KI_TRANSKRIPTION_ACCESS_ID`,
  `KI_TRANSKRIPTION_ACCESS_SECRET`.
- **Kasachisch** ist in beiden Richtungen die schwächste Sprache (Whisper erkennt die
  Sprache, verhört aber einzelne Wörter) - brauchbar, nicht zuverlässig.
