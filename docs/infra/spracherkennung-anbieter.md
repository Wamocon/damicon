# Spracherkennung: Anbieter und Datenstandort

Stand 24.09.2026 (Live-Diktat ergänzt; Stand davor 21.09.2026).

## Der Schalter

`KI_SPRACHERKENNUNG_ANBIETER` entscheidet, wer Sprache in Text verwandelt:

| Wert | Bedeutung |
|---|---|
| `whisper` (Voreinstellung) | Unser eigenes Modell auf Caesar. Gemessen 6,6–7 s je Aufnahme. |
| `soniox` | Der externe Dienst. Gemessen 2,3–3,1 s, kasachisch fehlerfrei. |

**Der Rückfall ist immer da.** Schlägt Soniox fehl — Störung, Zeitüberschreitung,
fehlender Schlüssel, fehlende Adresse —, übernimmt Whisper still. Wer diktiert,
merkt von einem Ausfall beim Dienstleister nichts. Umschalten und Abschalten
geschehen über die Umgebung, ohne neuen Code:

```
KI_SPRACHERKENNUNG_ANBIETER=soniox    # an
KI_SPRACHERKENNUNG_ANBIETER=whisper   # aus
```

## Live-Diktat (seit 24.09.2026)

Der zweite Schalter `KI_DIKTAT_LIVE` entscheidet, **wie** diktiert wird:

| Wert | Bedeutung |
|---|---|
| `aus` (Voreinstellung) | Datei-Weg: aufnehmen bis Stille, dann die ganze Datei hochladen (Soniox asynchron bzw. Whisper, siehe oben). |
| `an` | Live-Weg: der Browser streamt direkt zu Soniox `stt-rt-v5` (WebSocket). Der Text erscheint **während** des Sprechens im Eingabefeld, das Ende der Äußerung erkennt das Modell selbst. |

So läuft es (`src/lib/domain/diktat-live.ts`, `src/components/ki/diktat-live.ts`):

1. Klick aufs Mikrofon. Sofort, noch während der Browser nach der
   Mikrofon-Erlaubnis fragt, holt er über `POST /api/ki-spracherkennung`
   einen **kurzlebigen Schlüssel**: nur für Spracherkennung, nur einmal,
   60 s zum Verbinden, höchstens 120 s Sitzung. Der echte `SONIOX_API_KEY`
   verlässt den Server nie. Die Route prüft Anmeldung, Recht am
   KI-Assistenten, den Schalter und die Ratenbegrenzung (`stt:`).
2. MediaRecorder liefert alle 100 ms ein Stück (webm/opus, auf dem iPhone
   mp4). Was vor dem Verbindungsaufbau aufgenommen wird, wird gepuffert;
   die ersten Worte gehen nicht verloren.
3. Soniox schickt vorläufige und endgültige Wörter zurück, beide stehen
   sofort im Feld. Das Modell meldet das Ende der Äußerung (Endpunkt,
   höchstens 1,5 s nach dem letzten Wort, semantisch: ein erkennbar
   unfertiger Satz bekommt mehr Zeit). Die alte Lautstärkeregel bleibt nur
   als Gurt (Höchstdauer 60 s, „leer“ nur, wenn auch das Modell nichts
   gehört hat).
4. **Rückfall:** Sagt die Route ab, kommt keine Verbindung zustande, reißt sie
   ab oder meldet Soniox einen Fehler, geht **dieselbe Aufnahme** als Datei
   über den bisherigen Weg. Wer diktiert, verliert nie etwas.
5. Ins Protokoll (`audit_events`, `ki_chat.diktat`) meldet der Browser danach
   Zahl der Zeichen und gehörte Sprachen mit `dienst: soniox-live`, nie den
   Text.

Was sich außerdem geändert hat, für beide Wege:

- **Anhängen statt Ersetzen.** Das Diktat ersetzte bis dahin den Inhalt des
  Eingabefelds. Wer nach einer Denkpause weiterdiktierte, verlor den ersten
  Teil samt allem Getippten.
- **Fachwörter.** Soniox bekommt `context` (Domäne und rund 40 Fachwörter in
  de/ru/kk: Himbi, Reihenblock, Pflückaufgabe, ЕСУТД, НК РК, таңқурай und
  weitere).
- **Sprachhinweise kk und ru.** Auf kasachischer Oberfläche gehen `kk` und
  `ru` mit, auf russischer `ru` und `kk`, weil in Kasachstan zwischen beiden
  gewechselt wird. Hinweise gewichten nur, sie beschränken nicht.
- **„Nichts gehört“ ist kein Ausfall.** Liefert Soniox leeren Text, läuft
  Whisper nicht mehr auf derselben Aufnahme los. Whisper erfindet auf
  Stille Sätze („Untertitel der Amara.org-Gemeinschaft“, „Продолжение
  следует…“), und die gewannen bisher als erster Text. Solche Sätze filtert
  der Whisper-Client zusätzlich heraus. Die Meldung sagt jetzt „Nichts
  verstanden“ statt „Spracherkennung nicht möglich“.
- **Mikrofon mit festen Vorgaben** (`AUFNAHME_VORGABEN` in
  `src/lib/domain/diktat.ts`): Rauschunterdrückung und Echofilter aus, wie
  im offiziellen Soniox-SDK, weil sie auf menschliche Ohren abgestimmt sind
  und Silbenanfänge wegschneiden. Pegelregelung an, mono.
- **Vorlesen verstummt beim Mikrofon-Klick**, und zwar beide Wege, nicht nur
  die Live-Abschnitte. Vorher konnte die Stimme des Assistenten ins Diktat
  laufen.
- Das Aufräumen bei Soniox (Datei-Weg) läuft nach der Antwort (`after()`),
  gelöscht wird trotzdem.

**Nicht gemessen:** Gegen den echten Dienst war aus der Entwicklungsumgebung
kein Zugriff möglich. Vor dem Einschalten in Produktion einmal selbst
diktieren (Chrome, Safari auf dem iPhone, je eine Sprache) und prüfen, dass
in `audit_events` `dienst = soniox-live` steht.

## Datenstandort — was wann gilt

**Im Code steht keine Region.** `SONIOX_API_URL` muss gesetzt sein, sonst läuft
der Soniox-Weg gar nicht erst an. Das ist Absicht: wo Stimmen verarbeitet
werden, entscheidet der Betrieb, nicht der Programmierer — und es wandert.

### Jetzt: Demophase — Soniox erlaubt

Durch das System laufen ausschließlich Demodaten und unsere eigenen
Testaufnahmen. Keine echten Stimmen von Mitarbeitenden. Deshalb braucht es in
dieser Phase weder die EU-Region noch einen Auftragsverarbeitungsvertrag, und
Soniox darf unmittelbar nach dem Merge scharf geschaltet werden.

### Sobald Menschen des Kunden selbst sprechen (Pilot)

Dann sind es **echte personenbezogene Daten** — Stimmaufnahmen identifizierbarer
Personen. **Vorher** muss beides stehen:

1. Die Region auf die EU umgestellt (`SONIOX_API_URL=https://api.eu.soniox.com`).
   Das setzt ein EU-Projekt bei Soniox mit eigenem Schlüssel voraus, zu
   beantragen über support@soniox.com.
2. Ein Auftragsverarbeitungsvertrag geschlossen. Laut Soniox ist er Business-
   und Enterprise-Kunden vorbehalten, ebenfalls über support@soniox.com.

Dazu gehören ein eigener Verarbeitungszweck und Einwilligungen im
Compliance-Modul (`verarbeitungszwecke`, `einwilligungen`).

### Sobald der Kunde kauft: Kasachstan

Dann greift die Datenlokalisierung: die Daten müssen auf Servern in Kasachstan
liegen. Soniox betreibt zurzeit **US, EU und Japan** und bietet weitere Regionen
auf Anfrage an ([Data residency](https://soniox.com/docs/data-residency)).
Umgestellt wird wieder über `SONIOX_API_URL`.

**Geht Kasachstan bei Soniox nicht**, ist der Rückfall unser eigenes
Whisper-Modell auf eigenen Servern in Kasachstan. Dann wird die GPU-Arbeit
wieder wichtig: Whisper läuft dort heute auf der CPU und braucht deshalb rund
7 Sekunden statt Bruchteilen einer Sekunde (siehe
`caesar-spracherkennung.md`).

## Sprachhinweis an Soniox

Die Oberflaechensprache geht als `language_hints` mit. Bei Soniox ist das
ungefaehrlich: der Hinweis **beschraenkt nicht, er gewichtet nur** ([Language
hints](https://soniox.com/docs/stt/concepts/language-hints)) — wer auf einer
kasachischen Seite deutsch spricht, bekommt trotzdem Deutsch zurueck. Bei
Whisper war ein falscher Hinweis dagegen die Ursache dafuer, dass kasachisch
Gesprochenes als deutscher Unsinn ankam.

Am 21.09.2026 an sauberen TTS-Aufnahmen gemessen machte er keinen Unterschied —
solches Material ist aber der guenstigste Fall. Gegen echte Sprecheraufnahmen
wird er im Durchgang S1 (ohne) gegen S2 (mit) gemessen.

## Zwei Dienste im Wettlauf

Bis zum 22.09.2026 liefen die beiden nacheinander: erst Soniox mit 8 Sekunden,
bei Misserfolg Whisper mit 12. An echten Aufnahmen von rund zehn Sekunden lief
das reihenweise in beide Grenzen — **20,3 Sekunden Wartezeit und am Ende kein
Text**. Nacheinander addieren sich die schlechten Fälle, und wer diktiert hat,
bezahlt die Summe.

Jetzt überlappen sie sich (`src/lib/domain/spracherkennung.ts`):

| Zeit | Was passiert |
|---|---|
| 0 s | Soniox startet, Zeitlimit 20 s |
| 6 s | läuft Soniox noch, startet Whisper **parallel** mit, Zeitlimit 20 s |
| — | der erste brauchbare Text gewinnt, der Verlierer wird abgebrochen |
| 40 s | Gesamtdeckel, danach eine übersetzte Meldung |

Sagt Soniox schnell ab (kein Schlüssel, 401, Dienst weg), wird **nicht** bis
6 Sekunden gewartet — auf einen Dienst zu warten, der schon abgesagt hat, ist
reine Wartezeit. Der schlimmste Fall ist damit 6 + 20 = 26 Sekunden statt einer
Summe, und der Deckel von 40 Sekunden lässt 20 bis zu Vercels `maxDuration`.

Der abgebrochene Soniox-Lauf räumt seinen Auftrag trotzdem auf — sonst läge die
Aufnahme 30 Tage beim Dienstleister.

## Aufräumen beim Dienstleister

Nach jeder Erkennung löscht der Client **Auftrag und hochgeladene Datei** wieder
— auch dann, wenn zwischendrin etwas schiefging. Ohne das behält Soniox
hochgeladene Dateien 30 Tage.

## Variablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `KI_SPRACHERKENNUNG_ANBIETER` | nein | `whisper` (Voreinstellung) oder `soniox` |
| `SONIOX_API_URL` | ja, wenn `soniox` | Regionale Adresse, z. B. `https://api.soniox.com` |
| `SONIOX_API_KEY` | ja, wenn `soniox` | Nur aus der Umgebung. Nie in Code, Protokollen oder einem PR |
| `SONIOX_ZEITLIMIT_MS` | nein | Voreinstellung 20000, Obergrenze 20000. Siehe *Zwei Dienste im Wettlauf* |
| `KI_DIKTAT_LIVE` | nein | `aus` (Voreinstellung) oder `an`. Siehe *Live-Diktat* |
| `SONIOX_STT_WS_URL` | nein | Nur, wenn sich die WebSocket-Adresse nicht aus `SONIOX_API_URL` ableiten lässt (`api.eu.soniox.com` wird zu `wss://stt-rt.eu.soniox.com/transcribe-websocket`) |

Beim Live-Diktat geht die Stimme **vom Browser direkt** an Soniox, nicht über
Vercel. Für den Datenstandort gilt dieselbe Region (`SONIOX_API_URL` bzw.
`SONIOX_STT_WS_URL`), und für AVV und Einwilligungen gelten dieselben Regeln
wie oben. Der Unterschied: Der Server sieht die Aufnahme gar nicht mehr.
