# Audit-Fachliteratur 2021–2026

Stand 19.09.2026. Eine offene Bibliografie zum Thema Audit als Fachdisziplin
(nicht Kasachstan-spezifisch, nicht an das Damicon-Projekt gebunden) — Bücher,
Dissertationen, Diplom-/Bachelor-/Masterarbeiten, Forschungsarbeiten und
Studien, Veröffentlichungen und Publikationen, Präsentationen, Anwendungsfälle
und Blocks/Frameworks, primär auf Deutsch und Englisch.

**Entstanden aus einer Kritik am Vorgehen:** Die vorangegangene Recherche
„Audit in Kasachstan" (`../audit-kasachstan/`) beantwortete eine enge Frage —
welche Prüfungen treffen einen bestimmten Betrieb — nicht die Frage, was es
zum Thema Audit an Fachliteratur gibt. Diese Recherche schließt genau diese
Lücke.

## Ergebnis in Zahlen

| Dokumentart | Zahl |
|---|---|
| Forschungsarbeiten und Studien | 76 |
| Blocks und Frameworks | 37 |
| Bücher | 35 |
| Veröffentlichungen und Publikationen | 42 |
| Anwendungsfälle | 20 |
| Masterarbeiten | 17 |
| Präsentationen | 14 |
| Dissertationen | 10 |
| Bachelorarbeiten | 9 |
| Diplomarbeiten | **0** |
| **Gesamt** | **260** |

URL-Stichprobe (85 von 260 Links geprüft): 72 lebendig, **0 tot**, 13
unklar (durchweg reguläre DOI-/Verlagsadressen wie Wiley, SSRN, MDPI, die
automatisierte Kopfabfragen routinemäßig blockieren — kein Hinweis auf
Fälschung).

## Warum „alle" nicht erreichbar war

„Alle" Bücher, Dissertationen und Studien weltweit zu finden ist mit
Websuche nicht möglich. Drei konkrete, von mehreren Agenten unabhängig
bestätigte Gründe kamen dazu:

1. **DART-Europe, die im Auftrag genannte Hauptquelle für Dissertationen,
   ist abgeschaltet.** Die Seite leitet auf einen Hinweis der UCL-Bibliothek
   um: „DART-Europe e-theses portal has closed down."
2. **OATD, BASE, EconStor und das DNB-Portal blockierten automatisierten
   Zugriff** durchgehend mit Bot-Schutz (u. a. „Anubis") oder HTTP 403/405.
   Zwei Agenten (D5, D6) fanden einen Weg über die offenen Programmierzugänge
   von Crossref (`api.crossref.org`) und der DNB (`services.dnb.de/sru/dnb`)
   und lieferten dadurch mehr Dissertationen als die anderen vier.
3. **Das WebSearch-Kontingent der Sitzung lag bei 200 Anfragen, geteilt
   über alle sechs parallelen Agenten.** Jeder Agent stieß nach 24 bis 43
   eigenen Anfragen an die gemeinsame Grenze und musste danach auf WebFetch
   umsteigen (direkte Seitenabrufe statt Suche). D6 lief zuletzt an und
   bekam dadurch am wenigsten vom gemeinsamen Kontingent ab — das erklärt,
   warum sein Themenblock mit 28 Einträgen deutlich dünner ist als die
   anderen fünf (44 bis 49).

**Folge für die Kategorie Diplomarbeiten:** Sie blieb in allen sechs
Themenblöcken bei null. Das ist kein Rechercheversagen, sondern ein realer
Befund — dieser Studienabschluss ist in den Wirtschaftswissenschaften seit
etwa 2010 durch Bachelor/Master ersetzt. Alle Fundstellen, die bei der Suche
nach „Diplomarbeit Audit" auftauchten, datierten auf 2005 bis 2020 und wurden
bewusst nicht als aktuelle Literatur aufgenommen.

## Ordner

| Datei | Themenblock |
|---|---|
| [01-finanz-abschluss-und-steuerpruefung.md](01-finanz-abschluss-und-steuerpruefung.md) | Abschlussprüfung, Wirtschaftsprüferberuf, Betriebsprüfung — 45 Einträge |
| [02-interne-revision-und-oeffentlicher-sektor.md](02-interne-revision-und-oeffentlicher-sektor.md) | Interne Revision, IIA-Standards, Rechnungshöfe/INTOSAI — 47 Einträge |
| [03-it-cybersecurity-und-ki-audit.md](03-it-cybersecurity-und-ki-audit.md) | IT-Audit, Cybersecurity-Audit, KI-/Algorithmen-Audit — 49 Einträge |
| [04-esg-nachhaltigkeit-und-qualitaetsaudit.md](04-esg-nachhaltigkeit-und-qualitaetsaudit.md) | ESG-Assurance, CSRD/ISSA 5000, Qualitäts- und Zertifizierungsaudits — 44 Einträge |
| [05-forensik-betrug-und-compliance-audit.md](05-forensik-betrug-und-compliance-audit.md) | Forensische Prüfung, Betrugserkennung, Compliance, Whistleblowing — 47 Einträge |
| [06-digitalisierung-ausbildung-und-frameworks.md](06-digitalisierung-ausbildung-und-frameworks.md) | Audit Data Analytics, Ausbildung, Standard-Frameworks — 28 Einträge |
| [literatur-datenbank.json](literatur-datenbank.json) | Alle 260 Einträge maschinenlesbar, inklusive URL-Prüfstatus |
| [_auftrag.md](_auftrag.md) | Gemeinsamer Rechercheauftrag an alle sechs Agenten |
| `rohfunde/` | Ungeprüfte Originalausgaben der sechs Agenten |
| `werkzeuge/pruefen_und_kompilieren.py` | Erzeugt diese Dateien neu aus `rohfunde/` |

## Die zehn bedeutendsten Funde über alle Blöcke

1. **IDW PS 861 (03.2023)** — weltweit erster Prüfungsstandard eines
   Standardsetzers speziell für die Prüfung von KI-Systemen.
2. **IIA Global Internal Audit Standards 2024** („Redbook") — löst zum
   09.01.2025 das bisherige IPPF ab: 5 Domänen, 15 Prinzipien, 52 Standards.
3. **ISSA 5000 (IAASB, einstimmig verabschiedet 20.09.2024)** — erster
   globaler Standard für Nachhaltigkeitsprüfungen, wirksam ab 15.12.2026.
4. **NIST AI RMF, ISO/IEC 42001:2023 + 42006:2025, EU-KI-Verordnung Art. 43**
   — ein seit 2023–2025 zusammengewachsenes KI-Audit-Rahmenwerk-Ökosystem.
5. **ISACA „Advanced in AI Audit"-Zertifizierung (Mai 2025)** — die erste
   audit-spezifische KI-Zertifizierung überhaupt.
6. **Reale Drittanbieter-KI-Audits:** ORCAA prüfte Ubers KI-Governance
   (12/2024), ein Bias-Audit erfasste einen niederländischen
   Behördenalgorithmus bei über 250.000 Studierenden.
7. **FISG/BaFin-Reform (2021)** — die Wirecard-Folgegesetzgebung zur Reform
   der Bilanzkontrolle und Abschlussprüferaufsicht in Deutschland.
8. **Wirecard als dominanter Anwendungsfall der Forensik-Literatur** —
   inzwischen mit eigenem Springer-Buch (Löw/Heyd 2024), Fallstudie bei
   Emerald (Miller/Mintz 2023) und dem Bundestags-Schlussbericht (2021).
9. **Vier deutsche Rechtsdissertationen zu Whistleblowing (2024–2026)** als
   direkte akademische Folge von HinSchG (2023) und EU-Richtlinie 2019/1937.
10. **COSO „Achieving Effective Internal Control Over Generative AI" (2026)**
    plus zwei neue IDW-Prüfungshinweise zu GenAI (2024) — Standardsetzer
    übertragen das Internal-Control-Framework in Echtzeit auf generative KI.

## Methode

Sechs parallele Rechercheagenten, je ein Themenblock, alle zehn
Dokumentarten, Erscheinungsjahr 2021–2026, primär Deutsch/Englisch. Jeder
Eintrag beruht auf einer tatsächlich abgerufenen Seite mit sichtbarem
Titel/Autor/Jahr — keine Angabe aus dem Gedächtnis eines Sprachmodells.
Anschließend automatische Zusammenführung und eine HTTP-Stichprobe (85 von
260 Links).

**Was diese Bibliografie nicht ist:** kein Volltextzugriff auf die
gelisteten Werke (Bücher und die meisten Zeitschriftenartikel bleiben
kostenpflichtig), keine Garantie auf Vollständigkeit (kein Zugriff auf Web
of Science, Scopus, ProQuest oder JSTOR-Volltexte), keine Rechtsberatung
oder wissenschaftliche Bewertung der einzelnen Werke.

## Neu erzeugen

```bash
cd docs/Research/audit-fachliteratur/werkzeuge
python pruefen_und_kompilieren.py
```

Liest `rohfunde/D*.json`, prüft eine URL-Stichprobe, schreibt die sechs
Themendateien und `literatur-datenbank.json` neu.
