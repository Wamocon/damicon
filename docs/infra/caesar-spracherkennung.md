# Spracherkennung auf Caesar — Messung, Ursache, Stand

Stand 20.09.2026. Gemessen, nicht geschätzt; jede Zahl unten ist nachgefahren.

## Wo die Zeit hingeht

Gemeldet war: 7–10 s für einen kurzen Satz. Gemessen an derselben Datei
(5 s Deutsch, webm/opus):

| Weg | Median |
|---|---|
| Über die Sokrates-API (der Weg der Anwendung) | 8,26 s |
| Direkt an Caesar im LAN, Port 8787 | 8,79 s (8,50–17,86, unruhig) |
| Caesars eigenes Log: `faster_whisper:transcribe` bis Antwort | 7,72 / 7,72 / 7,81 s |

**Die Erkennung selbst ist rund 93 % der Zeit.** Für Upload, HTTP, API-Schicht
und Rückweg bleiben ~0,5 s.

Die Zwischenschicht (Cloudflare, Open WebUI) kostet damit **nichts** — der Weg
über Sokrates ist sogar etwas schneller und deutlich gleichmäßiger als der
direkte Weg ins LAN.

Die Länge der Aufnahme ändert fast nichts:

| Aufnahme | über Sokrates |
|---|---|
| 2 s | 7,33 s |
| 5 s | 8,26 s |
| 10 s | 8,29 s |

Rund 7 s sind ein **fester Boden**. Whispers Encoder rechnet immer über ein
30-Sekunden-Fenster, ein kurzer Satz kostet deshalb fast so viel wie ein
langer.

## Die Ursache: die GPU wird nicht benutzt

```
ctranslate2.get_cuda_device_count()        -> 0
ctranslate2.get_supported_compute_types('cuda')
    -> This CTranslate2 package was not compiled with CUDA support
```

Belegt durch Messung statt durch die Konfiguration:

- GPU-Auslastung während einer Anfrage: **0 %** über die volle Dauer
- CPU des Containers gleichzeitig: **160–456 %** (von 20 Kernen)
- `WHISPER__DEVICE=cuda` **ist gesetzt**, die GPU **ist** im Container sichtbar
  (`NVIDIA GB10`) — sie wird trotzdem nicht benutzt

Das Image `fedirz/faster-whisper-server:latest-cuda` bringt auf **aarch64** ein
CTranslate2 ohne CUDA mit. `WHISPER__DEVICE=cuda` läuft ins Leere.

Erschwerend: GB10 hat **compute capability 12.1** (sm_121, Blackwell). Das
CUDA 12.2 im Container kann dafür gar keinen Code erzeugen — dafür braucht es
mindestens CUDA 12.8, realistisch 13.x — und CTranslate2 4.4.0 ist älter als
Blackwell. Ein bloßes Neuübersetzen des Vorhandenen genügt also nicht.

Nebenbefund derselben Ursache: das ISSAI-Kasachisch-Modell
(`stukenov/issai-…-fp16`) antwortet mit HTTP 500 — die CPU kann kein fp16.
Auf der GPU wäre es einen neuen Versuch wert.

**Das Modell wird nicht je Anfrage geladen.** `WHISPER__TTL=-1`, und das Log
sagt bei jeder Anfrage „Model … is idle, not unloading". Diese Vermutung ist
damit erledigt.

## Was hier geändert wurde (ohne GPU)

### 1. Das kasachische Verschlucken des ersten Lautes

„Салқын" kam als „ын" an. Das ist **kein** Aufnahmeproblem: die Testdatei ist
maschinell gesprochen und enthält den Laut nachweislich — andere Modelle geben
ihn korrekt zurück. Es lag an den Dekodier-Einstellungen. Einzeln gemessen an
vier kasachischen Aufnahmen, Modell `kzmaker/faster-whisper-kk`:

| Einstellung | erstes Wort vollständig |
|---|---|
| bisher (beam_size=5, VAD aus, condition an) | 1 von 4 |
| nur `vad_filter=True` | **1 von 4** — allein nutzlos |
| nur `beam_size=1` | 3 von 4 |
| nur `condition_on_previous_text=False` | 1 von 4 |
| alle drei zusammen | **4 von 4** |

`vad_filter` allein hätte genügt, wenn es gereicht hätte — es reicht nicht.
`beam_size` ist der wirksame Wert, und genau den reicht
`faster-whisper-server` nicht durch: sein `transcribe()`-Aufruf ist fest
verdrahtet. Deshalb der Patch unten.

### 2. Modellwahl je Sprache

Der `speech-router` (Port 8790) wählt das Modell — **nicht die Anwendung**. Ein
`model`-Feld aus der Anfrage wird dort überschrieben; wer es mitschickt, merkt
nichts davon (nachgewiesen: zwei verschiedene Modellnamen, byte-gleiche
Antwort). Die Sprachangabe der Anwendung ist der Schlüssel, auf den er routet.

- **de/en/ru → `deepdml/faster-whisper-large-v3-turbo-ct2`.** Sauberes A/B
  (abwechselnd, vier Durchläufe, Mediane): de 6,94 → **6,04 s**, en 6,23 →
  **5,77 s**, ru 6,72 → **6,08 s**. Text unverändert richtig.
- **kk bleibt auf `kzmaker/faster-whisper-kk`.** `beketkz/whisper-kaz-rus-ct2`
  war ebenfalls korrekt, schreibt aber Zahlen aus („қырық жеті" statt 47) und
  liefert keine Satzzeichen. Mit `beam_size=1` ist kzmaker korrekt **und**
  behält Ziffern und Interpunktion.

## Ergebnis

Warm gemessen, über die Sokrates-API, also den Weg der Anwendung:

| Sprache | vorher | nachher |
|---|---|---|
| Deutsch | 8,26 s | **6,99 s** |
| Englisch | ~8 s | **6,56 s** |
| Russisch | ~8 s | **6,63 s** |
| Kasachisch | ~8–9 s, erstes Wort verschluckt | **6,83–7,37 s, vollständig** |

Rund 15–20 % schneller, und das kasachische Problem ist weg. Der 7-Sekunden-
Boden bleibt — der geht erst mit der GPU.

## Geänderte Dateien auf Caesar

Alles unter `/home/wamocon/lokal-ai-stack`. Sicherungen der Vorzustände liegen
in `sicherung/` mit Zeitstempel.

**`patches/stt.py`** — Kopie von
`faster_whisper_server/routers/stt.py` aus dem Image, im
`transcribe()`-Aufruf ergänzt:

```python
vad_filter=True,              # war: vad_filter (Standard False)
beam_size=1,                  # neu, Standard wäre 5
condition_on_previous_text=False,   # neu, Standard wäre True
without_timestamps=True,      # neu, Standard wäre False
```

**`docker-compose.dgx.yml`**, Dienst `whisper`:

```yaml
- WHISPER__MODEL=deepdml/faster-whisper-large-v3-turbo-ct2
- PRELOAD_MODELS=["deepdml/faster-whisper-large-v3-turbo-ct2","kzmaker/faster-whisper-kk"]
volumes:
  - ./patches/stt.py:/root/faster-whisper-server/faster_whisper_server/routers/stt.py:ro
```

Watchtower ist für diesen Dienst ohnehin abgeschaltet
(`com.centurylinklabs.watchtower.enable=false`), der Mount überlebt also auch
ein Image-Update von Hand. Ändert sich `stt.py` stromaufwärts, muss der Patch
nachgezogen werden — er ist als Kopie, nicht als Diff abgelegt.

**`speech-router`, `/app/app.py`**: `STT_DEFAULT` auf turbo, `kk` unverändert,
`data["vad_filter"] = "true"` wird mitgeschickt.

### Zurücknehmen

```bash
cd /home/wamocon/lokal-ai-stack
cp sicherung/docker-compose.dgx.yml.vor-stt-<Zeitstempel> docker-compose.dgx.yml
docker compose -f docker-compose.dgx.yml up -d whisper
docker cp sicherung/speech-router-app.py.vor-stt-<Zeitstempel> speech-router:/app/app.py
docker restart speech-router
```

## Offen

- **GPU.** Der einzige Hebel, der aus 7 s Bruchteile einer Sekunde macht. Weg
  über NGC-Container (PyTorch/NeMo, gebaut für aarch64 + Blackwell + CUDA 13)
  statt CTranslate2 neu zu übersetzen.
- **Modelle in HF-Format.** Für de/en/ru unkritisch (`openai/whisper-large-v3`
  und `-turbo` sind die Originale). Für Kasachisch heikel: `kzmaker` nennt
  **kein** Quellmodell, es gibt also keine gesicherte HF-Entsprechung. Bester
  HF-Kandidat wäre `shyngys879/kazakh-whisper-large-v3-turbo` (≈39 000
  Downloads) — an unseren Aufnahmen noch ungeprüft.
- **ollama teilt sich die GPU.** `qwen3.8:27b` liegt mit 21,3 GiB fest im
  GPU-Speicher. Auf 121 GB ist das kein Platzproblem, aber während es rechnet,
  konkurriert es um dieselbe GPU.
- **Streaming** lohnt erst, wenn ein Fenster unter einer Sekunde kostet.
