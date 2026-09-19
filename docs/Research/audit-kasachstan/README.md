# Research: Audit in Kasachstan

Stand 18.09.2026. Ergebnis des Research-Plans v0.3 für die Board-Karten
`audit-01` bis `audit-18`. Keine Rechtsberatung; die Freigabe durch einen in
Kasachstan zugelassenen Prüfer oder Anwalt (`audit-17`) steht aus.

**Finales Dokument (19.09.2026):** [final/audit-kasachstan-final.html](final/audit-kasachstan-final.html)
bzw. [final/audit-kasachstan-final.pdf](final/audit-kasachstan-final.pdf), alle Daten in
[final/audit-kasachstan-daten.json](final/audit-kasachstan-daten.json).
Es enthält Runde 1, die Gegenprobe (33 Aussagen: 1 widerlegt, 22 eingeschränkt,
10 bestätigt) und 70 neue Fakten aus Runde 2.

Bericht Runde 1: [bericht/audit-kasachstan-bericht.html](bericht/audit-kasachstan-bericht.html)

## Ordner

| Pfad | Inhalt |
|---|---|
| `00-research-plan.md` | Plan v0.3, geprüft mit iq-eq-vq und qa-ultra |
| `01-suchbegriffe.md` | Suchbegriffe je Agent in Russisch, Kasachisch, Englisch |
| `02-quellenkarte.md` | Alle genutzten Quellen nach Rang 1 bis 3 |
| `03-belegregister.json` | **Hauptergebnis:** 156 Belege mit Aussage, Fundstelle, Originalzitat, Prüfstatus, Einstufung und Folge für Damicon |
| `04-luecken-und-fragen.md` | Lücken, nicht bestätigte Belege, laufende Änderungen |
| `05-fragen-pruefer.ru.md` | Fragen an den Prüfer vor Ort, auf Russisch mit deutscher Fassung |
| `bericht/` | HTML-Bericht und `inhalt.json` (Kernaussagen, von Hand geschrieben) |
| `rohfunde/` | Ungeprüfte Ergebnisse der vier Rechercheagenten und ihr gemeinsamer Auftrag |
| `pruefung/` | Geprüfte Fassungen der Rohfunde, adilet-Statusliste, Phase-5-Protokoll, Kennzahlen, Pflichtenverzeichnis rsp.gov.kz für OKED 01250 |
| `pruefung/adilet-cache/` | Amtliche Volltexte von adilet (ca. 25 MB), **nicht im Repo** (`.gitignore`) |
| `werkzeuge/` | Skripte für Prüfung, Zusammenführung und Bericht |
| `widerlegung/` | Runde 2: Auftrag, Ergebnisse der fünf Gegenprüfer (W1–W5), `geprueft/` mit adilet-Abgleich |
| `final/` | Finales Dokument (HTML, PDF), Gesamtdaten, `inhalt-final.json` (Kernaussagen) |

Runde 2 neu erzeugen: `python werkzeuge/widerlegung_pruefen.py`, dann
`python werkzeuge/final_erzeugen.py`; PDF über den gstack-Browser
(`browse pdf … --format a4 --print-background --page-numbers`).

## Ergebnis in Zahlen

| Kennzahl | Ziel | Erreicht |
|---|---|---|
| Fragen mit Primärbeleg | 9 von 11 | 11 von 11 |
| Anteil Primärbelege | 70 % | 74 % (116 von 156) |
| Rang-1-Quellen je Cluster | 3 | 3 bis 9 |
| Aufgehobene Normen erkannt | – | 7 |

## Prüfstatus im Register

- `primaer`: Zitat steht Zeichen für Zeichen im amtlichen Text auf adilet
  (bzw. im GLOBALG.A.P.-Original-PDF).
- `nur_sekundaer`: Wortlaut nur von einer Spiegelseite oder Presse.
- `widerspruch`: Quellen widersprechen sich; beide Lesarten im Register.
- `aufgehoben`: Die zitierte Norm gilt nicht mehr.
- `offen`: Wortlaut nicht vollständig lesbar.

## Neu erzeugen

```bash
cd docs/Research/audit-kasachstan/werkzeuge
python adilet_pruefen.py      # Phase 3: adilet im gstack-Browser laden, Zitate prüfen (braucht /browse)
python zusammenfuehren.py     # Phase 4: Register, Quellenkarte, Lücken, Fragen, Kennzahlen
python bericht_erzeugen.py    # Bericht aus Register und bericht/inhalt.json
python rsp_register.py        # Pflichtenverzeichnis rsp.gov.kz neu abrufen (optional)
```

`adilet_pruefen.py` überschreibt `pruefung/*.geprueft.json` aus `rohfunde/`.
Die Korrekturen aus Phase 5 gingen danach von Hand in `pruefung/` ein
(`phase5-protokoll.json`). Wer neu prüft, muss sie erneut anwenden.
