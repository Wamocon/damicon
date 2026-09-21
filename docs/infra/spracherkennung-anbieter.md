# Spracherkennung: Anbieter und Datenstandort

Stand 21.09.2026.

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

## Warum kein Sprachhinweis an Soniox

Am 21.09.2026 gegen unsere Aufnahmen geprüft, jede Datei einmal mit und einmal
ohne `language_hints`: das Ergebnis war Zeichen für Zeichen identisch, auf
Kasachisch, Russisch und Deutsch. Ohne Hinweis kann ein falscher Hinweis auch
keinen Schaden anrichten — bei Whisper war genau das die Ursache dafür, dass
kasachisch Gesprochenes als deutscher Unsinn ankam.

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
| `SONIOX_ZEITLIMIT_MS` | nein | Voreinstellung 20000, deutlich unter Vercels 60 s |
