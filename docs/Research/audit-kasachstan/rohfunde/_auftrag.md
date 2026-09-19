# Gemeinsamer Auftrag für die Rechercheagenten (Phase 1 und 2)

Grundlage: `docs/Research/audit-kasachstan/00-research-plan.md` (v0.3). Lies ihn
vollständig, bevor du suchst. Diese Datei fasst nur die Arbeitsregeln zusammen.

## Ziel

Für deine Cluster und Fragen möglichst viele verlässliche Belege finden: Welche
Prüfungen trifft einen Beerenbetrieb in Kasachstan (Rechtsform TOO, KH oder IP
noch offen; Saisonkräfte, Kühllager, Zukauf von Nachbarbetrieben, Export,
Agrarsubventionen), wer prüft, auf welcher Rechtsgrundlage, mit welchen
Unterlagen, und was folgt daraus für die Betriebssoftware Damicon?

## Werkzeuge

- Nur WebSearch und WebFetch. **Nicht** `/browse` und kein anderer Browser: Der
  Browser ist ein geteilter Dienst, parallele Nutzung stört die anderen Agenten.
- WebSearch nutzt einen US-Index. Jede Suche deshalb zweimal: offen und mit
  `allowed_domains` auf amtliche Domänen (adilet.zan.kz, gov.kz, kgd.gov.kz,
  egov.kz, legalacts.egov.kz, rsp.gov.kz) bzw. auf Gesetzesspiegel
  (zakon.uchet.kz, zakon.mybuh.kz, cdb.kz, online.zakon.kz).
- adilet.zan.kz ist per WebFetch nicht lesbar (leere Seite). Den Wortlaut
  holst du von Spiegelseiten mit derselben Kennung, z. B.
  `https://zakon.uchet.kz/rus/docs/V1500012725` oder
  `https://zakon.mybuh.kz/rus/docs/<kennung>/`. Notiere immer die
  adilet-Kennung (z. B. `Z980000304_`, `V2200030964`), damit die
  Hauptsitzung den Wortlaut danach auf adilet gegenprüfen kann.
- Keine Logins, keine Bezahlschranken. Was nur dahinter liegt, ist eine Lücke.

## Regeln für Belege

1. Keine Artikelnummer, Frist, Schwelle oder Norm aus deinem Gedächtnis. Nur
   was du in einer Quelle gelesen hast, und mit wörtlichem Zitat.
2. Wortlaut von einer Spiegelseite: `rang: 2`, `verifiziert: "nur_sekundaer"`,
   Feld `adilet_id` ausfüllen. Die Hauptsitzung hebt ihn nach dem Abgleich auf
   `primaer`.
3. Prüfe bei jeder Norm, ob der Spiegel „Утратил силу“ oder „утратил силу“
   zeigt. Aufgehobene Normen nur als Vermerk (`verifiziert: "aufgehoben"`).
4. Fassungsstand notieren, wenn angegeben („по состоянию на …“ oder das Datum
   der letzten Änderung in der Fußnote).
5. Widersprechen sich Quellen, beide eintragen und `verifiziert: "widerspruch"`.
6. Kunde und Rechtsform: Beantworte formabhängige Fragen für TOO, KH und IP
   getrennt (Feld `rechtsform`).
7. Jede Aussage kurz, prüfbar, auf Deutsch. Zitat im Original.

## Sättigung

Arbeite in Suchrunden. Protokolliere jede Runde (Suchbegriff, Sprache, Filter,
Zahl neuer Rang-1-Quellen). Höre bei einem Cluster auf, wenn drei Runden in
zwei Sprachen keine neue Rang-1-Quelle und keine neue Pflicht bringen, oder
nach höchstens 45 Suchanfragen insgesamt.

## Ausgabe

Genau eine Datei `docs/Research/audit-kasachstan/rohfunde/<dein-kuerzel>.json`,
UTF-8, gültiges JSON (nach dem Schreiben mit python parsen):

```json
{
  "agent": "A-C1-C2",
  "fragen": ["F1", "F2", "F3"],
  "suchbegriffe": {"ru": [], "kk": [], "en": []},
  "suchrunden": [{"nr": 1, "anfrage": "...", "sprache": "ru", "filter": "offen | allowed_domains:...", "neue_rang1": 0}],
  "quellen": [{"url": "...", "rang": 1, "titel": "...", "adilet_id": "...", "status": "gilt | aufgehoben | unklar", "fassung_stand": "YYYY-MM-DD"}],
  "belege": [{
    "id": "B-C1-001", "frage": "F1", "aussage": "...",
    "quelle_url": "...", "rang": 2, "dokument": "...", "adilet_id": "...",
    "fundstelle": "Art. 5 Abs. 2", "fassung_stand": "...",
    "wortlaut_original": "...", "uebersetzung": "...",
    "abgerufen_am": "2026-09-18",
    "verifiziert": "nur_sekundaer | widerspruch | aufgehoben | offen",
    "gegenquelle": "...", "board_karte": "audit-02",
    "einstufung": "pflicht | empfehlung | unklar",
    "rechtsform": "alle | TOO | KH | IP",
    "damicon_folge": "Welches Feld, welcher Bericht, welche Frist"
  }],
  "luecken": [{"frage": "F9", "grund": "..."}],
  "fragen_pruefer": [{"frage_ru": "...", "frage_de": "...", "bezug": "F1 / Artikel"}],
  "aenderungen_in_arbeit": [{"titel": "...", "url": "...", "status": "..."}]
}
```

Antworte am Ende nur mit: Dateipfad, Zahl der Belege, Zahl der Rang-1-Quellen,
beantwortete Fragen, offene Lücken in je einem Satz.
