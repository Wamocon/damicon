# Analyse des Bestands der Wissensbasis (09.10.2026)

Grundlage: alle 320 Dokumente (5.655 Abschnitte) im Schema `public_preview`, rein lesend ausgewertet. Die Auswertung stützt sich auf Link, Autoritätsstufe, Konfidenz, Pfad, Länge und Textanfang. Sie ist eine **Empfehlung**, es wurde nichts verändert oder gelöscht. Die Bestandsdokumente stammen vom Einlese-Skript und lassen sich in der Oberfläche nicht löschen, ein Entfernen wäre eine Migration in einem eigenen PR.

## Ergebnis

| Urteil | Dokumente | Abschnitte |
| --- | --- | --- |
| Behalten | 277 | 5356 |
| Erst prüfen | 22 | 132 |
| Entfernen | 21 | 167 |

## Wichtigste Befunde

- **Arbeitsdokumente der Recherche (18 Dokumente)** stehen als Fachwissen in der Wissensbasis: Aufträge an die Rechercheagenten, Indexdateien, READMEs, Research-Plan, Suchbegriffe, Quellenkarte, Fragenliste. Sie enthalten kein Fachwissen, sondern Arbeitsanweisungen, und der Assistent könnte daraus zitieren. Empfehlung: entfernen.
- **Drei Einzelfälle zum Entfernen:** eine Dublette (Landgesetzbuch Art. 24 steht zweimal mit gleichem Textanfang) und zwei Dokumente, die die Recherche selbst als nicht verifizierbar einstuft.
- **Konfidenz.** Alle 85 Dokumente der Bereiche `amtlich` (23) und `fachquellen` (62) tragen die Sammelmarke "unbestätigt". Das ist ein Zustand des Imports und kein Urteil über das einzelne Dokument, deshalb ist es hier nur ein Hinweis. Elf Dokumente haben laut Recherche niedrige oder unsichere Konfidenz und sind unter "Erst prüfen".
- **Spiegelportale.** 25 Dokumente mit Stufe 1 (Gesetzestext) stammen von Spiegelportalen (`kodeksy-kz.com` 24 Dokumente insgesamt, `mybuh.kz`, `prg.kz`, `zakon.kz`, `pavlodar.com` und weiteren), nicht von der amtlichen Seite. Inhaltlich sind es Rechtsnormen, der Stand ist aber nicht amtlich bestätigt. Empfehlung: als Rechtsnorm einordnen, der Link bleibt der Nachweis.
- **Linkfelder.** 51 Dokumente haben im Linkfeld keine saubere Internetadresse (Freitext wie "Kazakhstan Law Review", Listen mehrerer Quellen oder nur ein Rechnername). Mindestens elf davon enthalten gar keine Adresse, die Herkunft ist nicht prüfbar. Die Liste zeigt solche Felder jetzt nicht mehr als kaputten Link an.
- **Ohne Autoritätsstufe: 22 Dokumente.** Es sind Normen und Berichte der Handelsketten- und Lieferantenaudits (IFS Food, SQF, FSSC 22000, GFSI, Tesco, Costco) und Leitlinien (ISSAI, OECD). Sie sind fachlich brauchbar. Empfehlung: als Standard einordnen (Stufe 3) beziehungsweise Praxisbeitrag, Cluster Internet.
- **Ungesicherte Internetquellen (6 Dokumente im Bereich Recht):** G2-Bewertungen, Habr-Beiträge, ein Wikipedia-Artikel. Bleiben, gelten als Notbehelf und werden dem Nutzer ausdrücklich als ungesichert gekennzeichnet.
- **Zum Behalten gehört der Rest:** 277 Dokumente, davon 100 im Bereich Recht, 91 im Bereich Audit, 62 `fachquellen`, 23 `amtlich`. Für die Quellenart schlägt die Oberfläche in "Bestand einordnen" Fachliteratur (193), Rechtsnorm (46), Behördeninformation (43), Internetquelle (9), Standard (6) und Forum (1) vor.

## Entfernen (Empfehlung)

| Bereich | Titel | Abschnitte | Grund |
| --- | --- | --- | --- |
| audit | Lücken und offene Fragen | 23 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Вопросы к аудитору / юристу в Республике Казахстан | 10 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Quellenkarte | 16 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| legal | Index: WAMOCON Legal Grundlagenwissen (laenderunabhaengig, KEIN kasachisches Recht) | 4 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| legal | Index: WAMOCON Legal Wissensdatenbank Kasachstan (kasachstanspezifisch) | 17 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Suchbegriffe je Agent und Sprache | 4 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Auftrag: Audit-Fachliteratur 2021–2026 | 6 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Index: damicon-audit-kb-kasachstan | 21 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Auftrag Widerlegungsrunde (19.09.2026) | 4 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Research-Plan: Audit in Kasachstan | 19 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| legal | WAMOCON Legal Grundlagenwissen (länderunabhängig) | 2 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Angebliche jaehrliche IT-Audit-Pflicht nach Regierungsbeschluss Nr. 832/2016: NICHT VERIFIZIERBAR | 2 | Die Recherche selbst stuft die Quelle als nicht verifizierbar oder niedrig ein (NIEDRIG, in Zweitpruefung NICHT VERIFIZIERBAR, mit Plausibilitaetszweifel); Linkfeld ist keine saubere Adresse (Liste od |
| legal | Zemelny Kodeks (Land-Gesetzbuch) der Republik Kasachstan, Artikel 24: Eigentum an landwirtschaftlichen Flächen | 6 | Dublette: gleicher Textanfang wie ein anderes Dokument; Gesetzestext von einem Spiegelportal, nicht von der amtlichen Seite: Stand nicht amtlich bestätigt |
| audit | README: Wissensdatenbank Kasachstan-spezifisches Audit-Material | 4 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Index: damicon-audit-kb-grundlagen | 5 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Research: Audit in Kasachstan | 4 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| legal | WAMOCON Legal Wissensdatenbank Kasachstan | 5 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Gemeinsamer Auftrag für die Rechercheagenten (Phase 1 und 2) | 5 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | Audit-Fachliteratur 2021–2026 | 7 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen |
| audit | README: Wissensdatenbank laenderunabhaengiges Audit-Grundlagenwissen | 2 | Arbeitsdokument der Recherche (Auftrag, Index, Suchbegriffe, Plan), kein Fachwissen; Keine Autoritätsstufe: wird bei der Einordnung gesetzt |
| audit | Finanzmarktaufsicht ARDFM: Erreichbarkeit und Registerfrage ungeklaert | 1 | Die Recherche selbst stuft die Quelle als nicht verifizierbar oder niedrig ein (nicht bewertbar, offener Punkt); Linkfeld ist keine saubere Adresse (Liste oder Rechnername): bereinigen |

## Erst prüfen

| Bereich | Titel | Abschnitte | Grund |
| --- | --- | --- | --- |
| kernwissen | Handel und Aussenhandel - Rohbefund (P12 bis P15) | 47 | Rohbefund der Recherche, ungeprüft und unaufbereitet; Kein Link zur Quelle |
| kernwissen | Das КХ/ФХ-Regime - Rohbefund (P5, Sektoral/Agrar) | 36 | Rohbefund der Recherche, ungeprüft und unaufbereitet; Kein Link zur Quelle |
| audit | Datenschutz bei KI-Nutzung: Einwilligung, Anonymisierung, grenzueberschreitende Uebermittlung | 2 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Bankengesetz Nr. 258-VIII und Risikomanagementanforderungen der Nationalbank | 2 | Schwache Konfidenz laut Recherche (niedrig bis mittel fuer die Verordnung, nicht direkt kasachisch bestaetigt); Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Erklaerbare KI (XAI) im Audit: akademische Literatur zu Transparenz und Haftung | 3 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Kasachische wissenschaftliche Literatur zu KI im Staatsaudit und Rechnungswesen | 3 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| kernwissen | Sanktionen-Rohbefund: Steuer- und Nebenpflichtverstoesse Kasachstan | 15 | Rohbefund der Recherche, ungeprüft und unaufbereitet; Kein Link zur Quelle |
| legal | Erfahrungsbericht aus dem Expat.com-Forum: Schwierigkeiten mit Visum und Arbeitserlaubnis in Kasachstan | 3 | Schwache Konfidenz laut Recherche (unsicher) |
| audit | OECD/G20 BEPS Action 13: Verrechnungspreisdokumentation | 1 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar; Sehr kurz |
| audit | Fruehere Rechnungshofkritik an der Baiterek-Reorganisation (2020) | 1 | Schwache Konfidenz laut Recherche (niedrig, Einzelquelle, nicht gegengeprueft); Linkfeld ist keine saubere Adresse (Liste oder Rechnername): bereinigen |
| audit | Vergleich COSO ERM und ISO 31000 (Fachartikel) | 1 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Vorlaeuferprogramme: Konzept AIC 2021-2030 und Programm 2017-2021 | 2 | Schwache Konfidenz laut Recherche (niedrig bis mittel, nur Titel/Existenz bestaetigt, Volltext wegen JS-Sperre nich); Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Informatisierungsgesetz Nr. 418-V und Regeln fuer das Audit von Informationssystemen | 3 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Blockchain- und IoT-Rueckverfolgbarkeit in landwirtschaftlichen Lieferketten | 3 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Digitaler Kodex Nr. 255-VIII: Rahmen fuer Datenverarbeitung | 1 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| legal | Erfahrungsbericht eines kasachischen Gründers: Devisenkontrolle und internationale Zahlungen contra ТОО | 1 | Schwache Konfidenz laut Recherche (unsicher); Ungesicherte Internetquelle: bleibt als Notbehelf nutzbar |
| audit | KPMG Clara und KPMG Audit Chat: generative KI in der Pruefungsplattform (2024) | 1 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Datenschutzgesetz Nr. 94-V: staatliche Aufsicht, keine eindeutige Audit-Pflicht fuer Private | 3 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Russischsprachiger Fachueberblick zum kasachischen Nationalkodex (nccg.ru) | 1 | Schwache Konfidenz laut Recherche (niedrig bis mittel, russische, nicht kasachische Quelle); Linkfeld ist keine saubere Adresse (Liste oder Rechnername): bereinigen |
| audit | MindBridge: KI-gestuetzte kontinuierliche Anomalieerkennung | 1 | Schwache Konfidenz laut Recherche (niedrig, Herstellermarketing, nicht unabhaengig verifiziert); Linkfeld ist keine saubere Adresse (Liste oder Rechnername): bereinigen; Sehr kurz |
| audit | Tax-Compliance-Managementsystem als Referenzmodell (Deutschland) | 1 | Linkfeld ist Freitext ohne Internetadresse: Herkunft nicht prüfbar |
| audit | Agrarkreditkorporation: aufgedeckte Betrugsschemata bei Kreditnehmern | 1 | Schwache Konfidenz laut Recherche (niedrig, Details nicht extrahierbar); Linkfeld ist keine saubere Adresse (Liste oder Rechnername): bereinigen |

