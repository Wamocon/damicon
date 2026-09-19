# Auftrag Widerlegungsrunde (19.09.2026)

Du bist ein **Gegenprüfer**. Deine Aufgabe ist, die unten zugewiesenen Aussagen
aus der ersten Research-Runde zu **widerlegen**. Gelingt das nicht, gilt die
Aussage als bestätigt. Zusätzlich suchst du nach Fakten, die die erste Runde
übersehen hat.

Grundlage der ersten Runde (lesen, bevor du startest):
- `docs/Research/audit-kasachstan/03-belegregister.json` (156 Belege)
- `docs/Research/audit-kasachstan/bericht/inhalt.json` (Kernaussagen, Abschnitt `blick`)

## Andere Quellen als in Runde 1

Runde 1 stützte sich vor allem auf adilet-Spiegel (zakon.uchet.kz, mybuh,
prg.kz) und amtliche Texte. Du nutzt bewusst **andere Quellenfamilien**, damit
eine unabhängige Gegenprobe entsteht:

1. **Big Four und Länderleitfäden:** PwC Worldwide Tax Summaries Kazakhstan,
   KPMG Caspian, EY Kazakhstan, Deloitte Kazakhstan, BDO, Grant Thornton,
   „Doing Business in Kazakhstan“-Leitfäden.
2. **Kanzleien:** GRATA International, Dentons Almaty, Unicase, Kinstellar,
   Aequitas, Signum, Baker McKenzie, Lexology- und Chambers-Beiträge.
3. **Behörden-FAQ und Erläuterungen:** kgd.gov.kz („Вопрос-ответ“,
   Pressemitteilungen der Regionaldepartements), gov.kz-Seiten der Ministerien,
   egov.kz-Leitfäden, Минсельхоз, Минтруда, МЧС.
4. **Unternehmerverband:** НПП «Атамекен» (atameken.kz), Leitfäden zu
   Prüfungen und Rechten der Unternehmer.
5. **Fachpresse für Buchhalter:** buh.kz, pro1c.kz (Hotline-Antworten der KGD),
   uchet.kz-Fragen, mybuh.kz-Konsultationen, kapital.kz, kursiv.media, zakon.kz.
6. **Kasachische Sprache** (адилет /kaz/, kk-Seiten der Behörden) und
   **Englisch** (Kanzleien, Weltbank, OECD, FAO, USDA GAIN Reports für
   Kasachstan).

Mindestens vier der sechs Familien pro Aussage versuchen. Werkzeuge: nur
WebSearch (offen und mit `allowed_domains`) und WebFetch. **Kein** `/browse`.

## Bewertung je Aussage

- `bestaetigt`: Eine unabhängige Quelle aus einer anderen Familie stützt die
  Aussage, und keine glaubwürdige Quelle widerspricht.
- `eingeschraenkt`: Die Aussage stimmt im Kern, braucht aber eine
  Einschränkung oder Ergänzung (genau benennen).
- `widerlegt`: Eine Quelle zeigt, dass die Aussage falsch oder veraltet ist.
  Nur mit Zitat und möglichst mit adilet-Kennung und Fundstelle.
- `unentschieden`: Quellen widersprechen sich, ohne dass eine klar gewinnt.

Regeln: Keine Behauptung aus dem Gedächtnis. Jede Bewertung mit Zitat im
Original und URL. Achte besonders auf Änderungen 2025/2026 (neuer Steuerkodex
214-VIII, Digitaler Kodex 255-VIII, Gesetze 256-VIII, 326-VIII, 352-VIII).
Ältere Leitfäden (vor 2026) können veraltet sein; das ist kein Gegenbeweis,
sondern ein Hinweis.

## Ausgabe

Eine Datei `docs/Research/audit-kasachstan/widerlegung/<kuerzel>.json`,
UTF-8, gültiges JSON (mit python prüfen):

```json
{
  "agent": "W1",
  "quellenfamilien_genutzt": {"big4": 0, "kanzlei": 0, "behoerde_faq": 0, "atameken": 0, "fachpresse": 0, "kk_en": 0},
  "suchrunden": 0,
  "pruefungen": [{
    "aussage_id": "blick:Abschlussprüfung oder B-C1-003",
    "aussage": "…",
    "urteil": "bestaetigt | eingeschraenkt | widerlegt | unentschieden",
    "begruendung": "…",
    "belege": [{"url": "…", "familie": "big4", "titel": "…", "zitat": "…", "datum_quelle": "…", "adilet_id": "…"}],
    "korrektur": "nur bei eingeschraenkt/widerlegt: neue Formulierung"
  }],
  "neue_fakten": [{
    "id": "N-W1-001", "thema": "…", "aussage": "…", "einstufung": "pflicht | empfehlung | unklar",
    "rechtsgrundlage": "…", "adilet_id": "…", "zitat": "…", "url": "…", "familie": "…",
    "damicon_folge": "…"
  }]
}
```

Antworte am Ende nur mit: Pfad, Zahl der Prüfungen je Urteil, Zahl neuer
Fakten, die drei wichtigsten Widerlegungen oder Einschränkungen.
