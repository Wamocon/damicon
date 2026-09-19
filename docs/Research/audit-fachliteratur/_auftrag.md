# Auftrag: Audit-Fachliteratur 2021–2026

Stand 19.09.2026. Ziel: die größte tatsächlich verifizierbare offene
Bibliografie zum Thema Audit (in all seinen Fachrichtungen) aus den letzten
fünf Jahren. Kein rechtliches Compliance-Projekt, keine Kasachstan-Bindung —
es geht um Audit als akademische und berufliche Disziplin weltweit.

## Was gesucht wird (pro Themenblock, je Dokumentart)

- **Bücher** (Fachbücher, Lehrbücher, Handbücher)
- **Dissertationen** (Doktorarbeiten)
- **Diplomarbeiten** — realistisch selten für 2021–2026, da dieser Abschluss
  in Wirtschaftswissenschaften seit ca. 2010 durch Bachelor/Master ersetzt
  ist. Leer lassen statt erzwingen, wenn nichts Echtes zu finden ist.
- **Bachelorarbeiten**
- **Masterarbeiten**
- **Forschungsarbeiten / Studien** (Zeitschriftenartikel, Working Papers)
- **Veröffentlichungen / Publikationen** (Berufsverbände, Prüfungsgesellschaften,
  Standardsetzer — White Paper, Positionspapiere, Studienreihen)
- **Präsentationen** (Konferenzvorträge, Foliensätze, Webinare)
- **Anwendungsfälle** (praktische Fallstudien, wie Audit in der Praxis
  angewendet wird — Software-Audit-Fälle, Branchenbeispiele)
- **Blocks/Frameworks** (Standard- oder Ausbildungsstrukturen — z. B.
  COSO-Komponenten, ISA-Nummernblöcke, CIA/CISA-Prüfungsdomänen,
  WP-Examen-Module). Eigene Deutung des Begriffs „Blocks"; wenn nichts
  Passendes existiert, ehrlich leer lassen.

## Sprachen und Zeitraum

Primär Deutsch und Englisch. Erscheinungsjahr 2021 bis 2026 (2026 nur bis
19.09.). Ältere Standardwerke nur erwähnen, wenn eine neue Auflage in diesem
Zeitraum erschien.

## Regel gegen erfundene Belege

**Kein Titel, kein Autor, keine Jahreszahl aus dem Gedächtnis.** Jeder
Eintrag beruht auf einer tatsächlich abgerufenen Seite (WebFetch oder
Suchtreffer mit sichtbarem Snippet), die Titel, Autor(en) und Jahr zeigt.
Lässt sich eine Angabe nicht auf einer echten Seite verifizieren, bleibt der
Eintrag weg oder wird als unsicher markiert. Qualität vor Quantität: lieber
40 geprüfte Einträge als 100 mit Zweifeln. Realistische Zielgröße 30 bis 70
Einträge je Themenblock, keine Pflichtzahl je Dokumentart.

## Wichtige Quellenfamilien

- **Bücher:** WorldCat.org, Google Books, Verlagsseiten (Springer Gabler,
  De Gruyter, Erich Schmidt Verlag, IDW Verlag, NWB, Routledge, Wiley)
- **Dissertationen:** DART-Europe (dart-europe.org), OATD.org, DNB
  (portal.dnb.de, Dissertationen-Datenbank), NDLTD, EThOS (UK)
- **Bachelor-/Master-/Diplomarbeiten:** GRIN.com (sehr ergiebig für
  deutschsprachige studentische Arbeiten zu Wirtschaftsprüfung/Revision),
  BASE (base-search.net), OPUS-Repositorien deutscher Hochschulen,
  Hochschulschriftenserver (z. B. hsu-hh, uni-bibliotheken)
- **Forschungsarbeiten/Studien:** Google Scholar (über WebSearch), SSRN.com,
  ResearchGate, Fachzeitschriften — „Auditing: A Journal of Practice &
  Theory" (AAA), „International Journal of Auditing" (Wiley), „Managerial
  Auditing Journal" (Emerald), „Accounting, Auditing & Accountability
  Journal", deutschsprachig „Die Wirtschaftsprüfung (WPg)" (IDW), „Zeitschrift
  Interne Revision (ZIR)"
- **Veröffentlichungen/Publikationen:** IIA (theiia.org), ISACA (isaca.org),
  IFAC/IAASB, AICPA, IDW (idw.de), ACCA, ICAEW, Big-Four-Publikationen
  (PwC, EY, KPMG, Deloitte — Suchbegriff „Audit Trends/Insights [Jahr]")
- **Präsentationen:** SlideShare, YouTube (Konferenzaufzeichnungen), Webinar-
  Archive der oben genannten Verbände, Konferenzseiten (EAA Annual Congress,
  AAA Auditing Section Midyear Meeting, VHB-Jahrestagung)

## Suchtechnik

- Je Suchbegriff einmal offen, einmal mit `allowed_domains` auf die
  passende Quellenfamilie.
- Jahreszahl im Suchbegriff mitführen („audit research 2024", "Interne
  Revision Masterarbeit 2023").
- Aktuelle Treiberthemen mitdenken: EU-KI-Verordnung (KI-Audit-Literatur
  explodiert seit 2024), CSRD/ESRS (Nachhaltigkeitsprüfung seit 2022/2023),
  Audit Data Analytics, Continuous Auditing.
- Nur WebSearch und WebFetch. Kein `/browse`.

## Ausgabeformat

Datei `docs/Research/audit-fachliteratur/rohfunde/<Kürzel>.json`, UTF-8,
gültiges JSON (mit Python geprüft):

```json
{
  "domain_kuerzel": "D1",
  "domain_name": "...",
  "suchrunden": [{"anfrage": "...", "sprache": "de", "filter": "offen | allowed_domains:...", "neue_treffer": 0}],
  "eintraege": [{
    "id": "D1-001", "typ": "buch | dissertation | diplomarbeit | bachelorarbeit | masterarbeit | forschungsarbeit_studie | veroeffentlichung_publikation | praesentation | anwendungsfall | block_framework",
    "titel": "...", "autoren": ["..."], "jahr": 2023, "sprache": "de",
    "herausgeber_verlag_institution": "...", "url": "https://...",
    "beleg_snippet": "wörtlicher Ausschnitt von der echten Seite", "zusammenfassung": "1-2 Sätze",
    "schwerpunkt": "...", "quelle_art": "worldcat | verlagsseite | repositorium | google_scholar | grin | ...",
    "open_access": true
  }],
  "beobachtungen": ["Trends, Häufungen, auffällige Lücken"],
  "grenzen": ["was nicht zugänglich war, z. B. Bezahlschranke, Diplomarbeiten praktisch ausgestorben"]
}
```

Antworte am Ende nur mit: Pfad, Zahl der Einträge je Dokumentart, die drei
bedeutendsten Funde, größte Lücke.
