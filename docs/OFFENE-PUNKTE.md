# Offene Punkte

Stand: 16.10.2026, Branch `feat/restfunktionen-spur-a`. Diese Liste ersetzt keine Jira-Pakete. Sie sagt, was nach diesem Stand noch nicht fertig ist und woran es hängt, damit niemand raten muss, ob ein Punkt vergessen wurde oder bewusst offen ist.

Seit dem 15.10.2026 steht in der Liste nichts mehr, was nur auf eine Festlegung wartet. Alle fachlichen Entscheidungen sind getroffen, begründet (`docs/ENTSCHEIDUNGSGRUNDLAGEN.md`) und umgesetzt. Werte, die sich ändern können (Fristen, Kapazitäten, Richtwerte, Gewichte), stehen unter Büro → Einstellungen und lassen sich dort ohne Programmänderung anpassen. Offen bleibt, was von Dritten abhängt oder dafür ein Gerät, einen Zugang oder eine Sichtprüfung braucht.

Drei Spalten bestimmen, wie es weitergeht:

1. **Wartet auf Dritte**: Der Code ist bereit oder wird erst mit dem Zugang möglich. Die Entscheidung liegt nicht mehr bei uns.
2. **Braucht Entwicklungsarbeit**: Die Anforderung ist klar, die Umsetzung fehlt.
3. **Braucht Inhalte**: Das System kann es, die Daten oder Texte fehlen.

## Was dieser Branch liefert

| Jira | Inhalt | Stand |
|---|---|---|
| 1467 | Globale Datensuche (`search_everything`), jetzt mit Trigramm-Indizes für große Tabellen | fertig |
| 1469 | Nachweisregister: Gültigkeit, Verantwortliche, Ablaufstatus, Risiko-Radar, mehrere Versionen je Nachweis (eine ersetzte Version schlägt nicht mehr Alarm) | fertig |
| 1470 | Block-Risiko mit Gewichten aus `risiko_parameter`, Grenzen und Verlauf, Pflege durch Administration und Geschäftsführung unter Büro → Einstellungen | fertig |
| 1472 | Nachrichten je Vorbestellung, Lieferplan als Kalenderdatei, Anonymisieren auf Anweisung der Administration | fertig |
| 1441 | Rollenzuweisung, Konten für Mitarbeitende anlegen, Konten sperren statt löschen, Passwort ändern, letzter aktiver Administrator geschützt | fertig |
| 1519 | Kennzahlen im Cockpit auf 12 begrenzt | durch einen Test gesichert |
| 1440 | ЭСФ, Stufe 1: Belegregister, Entwurf (netto oder brutto je Preisliste), Statuslauf, Frist aus den Einstellungen | fertig, Stufe 2 wartet auf die Behörde |
| 1447 | ЕСУТД, Stufe 1: Meldeprozess, Fristen für Abschluss, Änderung und Beendigung aus den Einstellungen, Verlauf beim Wiederöffnen, Hinweis bei Altbestand | fertig, Stufe 2 wartet auf die Behörde |
| 1448 | Fördermittel: Checkliste je Dossier statt Portalanbindung | fertig |
| 1517 | Temperaturlogger: CSV und JSON, Kodierungen (UTF-8, UTF-16, Windows-1251, 1252), Zeitzone wählbar, Kelvin und Fahrenheit, elproCLOUD-Modell | fertig, Geräteanbindung wartet auf ein Gerät |
| 1461 | Abgleich der Rechtematrix mit der Zeilensicherheit per Zugriffsprobe, Rechte der Preislisten, des Pflanzenschutzes, der Abholrunden und der Nachrichten an die Matrix angeglichen | fertig |
| 1473, 1460 | Browsertests gegen die lokale Instanz, Rechte je Rolle, Bildvergleich, Geschäftsführung und Erzeuger im fachlichen Ablauf | fertig, Referenzbilder noch aus der CI zu holen |
| 1475 | Diese Liste, Handbuch um sieben Anleitungen erweitert, die älteren berichtigt, in vier Sprachen | fertig |
| 2470 | Wirtschaftlichkeit: Posten, Annahmen, Plan-Ist, Stände, Dokument, Zins-Check, Herleitung des Schwund-Nutzens aus Verlustquote, Jahresmenge und Vollkosten | fertig, die Werte sind Sache der Geschäftsführung |
| 1577 | Abholrunden: Planen, Ablauf, 60-Minuten-Regel, Fahrzeugkapazität, Abholfenster, geschätzte Ankunft | fertig |
| 1627, 2290 | Auslieferung der Integrations-Warteschlange: signierter Webhook, Basic-Authentifizierung, Vorlage für das Zielformat, Rückmeldung des Partners, regelmäßiger Aufruf | Rahmen fertig, der Partner steht aus |
| 1465 | Hypercare-Plan, festgelegt am 15.10.2026 (`docs/Hypercare-Plan-Damicon.docx`) | festgelegt |
| 1454, 2419 | Drehbuch für acht Kurzvideos, Wiedergabe im Portal je Sprache, Hochladen für Administration und Betriebsleitung | Portal fertig, Produktion der Videos offen |
| 2486 | Benachrichtigungen, Stufe 2: Hinweise je Person in der Glocke (Nachweise, ЭСФ, ЕСУТД, Block-Risiko), stündlich erzeugt | fertig, der Zeitplan ist eingerichtet und greift mit dem Merge |
| 2489, 2491 | Reklamationen und Vorbestellungen seitenweise statt alle Zeilen, Ratsche gegen neue unbegrenzte Abfragen | teilweise, siehe Kapitel 2 |
| 1436 | Wetter: Anbindung war schon umgesetzt | nur Jira nachgezogen |
| 3.5 | Fehler in der Tourenplanung der Auslieferung behoben | behoben |
| 1518 | Sprachpolitik: Standardsprache Russisch, Kasachisch gleichrangig, Verbrauchernahes auf Kasachisch und Russisch | festgelegt (`docs/ENTSCHEIDUNGSGRUNDLAGEN.md`, Kapitel 6) |

## Entschieden am 15.10.2026

Jede Zeile war ein offener Punkt dieser Liste. Die Begründung steht in `docs/ENTSCHEIDUNGSGRUNDLAGEN.md`, die Umsetzung in der genannten Migration.

| Punkt | Entscheidung | Umsetzung |
|---|---|---|
| Preislisten lesen | Büro alle, ein Kunde nur die Listen der eigenen Kundengruppe und die gruppenlosen | Migration `20261208020000` |
| Preislisten schreiben | Administration, Geschäftsführung, Betriebsleitung, wie in der Matrix. Die Buchhaltung liest | Migration `20261208020000` |
| Pflanzenschutz lesen | Behandlungen und Mittel für Administration, Geschäftsführung, Betriebsleitung, Brigade. Buchhaltung und Erzeuger sehen nur die Sperre | Migration `20261208020000`, Sicht `v_block_sperre` |
| Matrix gegen Datenbank | Die Matrix wurde gekürzt, wo das Modul nichts zeigt; der Abgleichstest hält beides gleich | `src/lib/rbac.ts`, `test:rbac-rls` |
| Preisliste netto oder brutto | Vorgabe netto, je Preisliste mit Schalter „inkl. MwSt“, die ЭСФ rechnet immer netto plus Satz | Migration `20261208070000` |
| Frist für die ЭСФ | 15 Kalendertage nach dem Liefertag (Steuerkodex Art. 493), als Einstellung | Migration `20261208030000` |
| ЕСУТД-Fristen | Abschluss 5 Arbeitstage nach der Unterschrift, Änderung 15 Kalendertage, Beendigung 3 Arbeitstage (Erlass Nr. 353), als Einstellungen | Migration `20261208040000` |
| Risiko-Gewichte | Aus den Betriebsregeln hergeleitet, mit Grenzen und Verlauf in der Oberfläche änderbar | Migration `20261208100000` |
| Abholrunden, Ausbau | Fahrzeugkapazität (warnt, sperrt nicht), Abholfenster je Nachbarbetrieb, geschätzte Ankunft, mehrere Fahrzeuge je Tag | Migration `20261208060000` |
| 1C-Konnektor | Zielformat als Vorlage in der Oberfläche, Basic-Authentifizierung, Rückmeldung des Partners | Migration `20261208080000` |
| Wirtschaftlichkeit, Werte | Kalkulationszins 20 Prozent mit Vergleichszinsen 16 und 24 Prozent, Schwund aus der Verlustquote hergeleitet | Einstellungen, Migration `20261208140000` |
| Hypercare-Plan | Festgelegt, Abschnitt 12 des Plans | `docs/Hypercare-Plan-Damicon.docx` |
| Plattform in Kasachstan | Umzug nach der Beauftragung und vor dem Produktivbetrieb, Analyse der Dienste liegt vor | `docs/Plattform-Kasachstan-Analyse.docx` |
| Rechte der Buchhaltung bei Abholrunden und Nachrichten | Die Policies folgen der Matrix: planen nur das Büro ohne Buchhaltung, Nachrichten schreiben Kunde und Büro ohne Buchhaltung | Migration `20261208020000` |
| Brigade ändert geplante Runden | Nein. Die Brigade fährt die Runde (Start, Abholung, Abschluss), ändert aber Datum, Fahrzeug und Strecke nicht | Migration `20261208020000` (DA015) |
| Herkunft „Messprotokoll“ | Die Herkunft `logger` setzt nur die Importfunktion, ein Direktinsert wird abgelehnt | Migration `20261208020000` (DA018) |
| Konto löschen | Konten werden gesperrt statt gelöscht, die Fremdschlüssel der Urheber an unveränderlichen Zeilen entfallen | Migrationen `20261208020000` und `20261208090000` |
| Wiederöffnen eines ЕСУТД-Abschlusses | Gewollt als Korrektur, aber mit unveränderlichem Verlauf der geleerten Angaben | Migration `20261208020000` |
| Löschweg für Nachrichten | „Anonymisieren“ auf Anweisung der Administration: Text und Name entfallen, der Verlauf bleibt, Grund Pflicht | Migration `20261208020000` |

## 1. Wartet auf Dritte

| Punkt | Worauf es wartet | Wer |
|---|---|---|
| ЭСФ, Stufe 2 | Zugang der Behörde (Operator oder API, Signatur beim Betreiber). Private Schlüssel gehören nicht ins System. Die Tabelle `integration_outbox` und die Auslieferung sind die Grundlage. | Behörde, Betreiber |
| ЕСУТД, Stufe 2 | Zugang der Behörde. Die Meldungen tragen Namen und Ausweisnummern: Ob und auf welcher Rechtsgrundlage sie an ein Partnersystem gehen dürfen, ist nicht entschieden, bis dahin reiht ЕСУТД bewusst nichts in die Warteschlange ein. | Behörde, Rechtsberatung |
| 1C-Konnektor, Partner | Welcher Partner angebunden wird. Das Mapping auf sein Format ist eine Vorlage in der Oberfläche, sie lässt sich anlegen, sobald `$metadata` der Basis vorliegt. | Partner |
| Temperaturlogger, Geräteanbindung | Ein Gerät zum Testen (Cloud-Schnittstellen von Testo und elproCLOUD sind recherchiert). Der Dateiimport läuft. | Betreiber |
| Fördermittel, Datenabgleich | Eine Schnittstelle des Förderportals. Antragsvorlagen je Programm sind bewusst nicht Teil. | Förderstelle |
| Einstellungen, Quelle der Werte | Die Startwerte tragen Quelle und Stand (15.10.2026). Die Geschäftsführung kann jeden Wert ersetzen. Rechtsberatung ersetzt die Zusammenstellung nicht. | Geschäftsführung, Rechtsberatung |
| Plattform in Kasachstan | Beauftragung, danach Umzug. KI- und Sprachdienste werden zuerst analysiert. | Niko |

### Betreiber-Punkte, am 15.10.2026 erledigt

| Punkt | Stand |
|---|---|
| Zeitpläne einrichten | Das Repository trägt die Geheimnisse `DAMICON_APP_URL` (`https://damicon.vercel.app`) und `CRON_SECRET`, die Vercel-Produktion trägt denselben `CRON_SECRET` als verborgene Variable. Die Workflows `integrationen-ausliefern` (alle fünf Minuten) und `benachrichtigungen-erzeugen` (stündlich) laufen erst, wenn sie auf `main` liegen, also mit dem Merge dieses Pull Requests. Danach ist ein Lauf von Hand auszulösen (`gh workflow run benachrichtigungen-erzeugen.yml`) und auf HTTP 200 zu prüfen. |
| Speicher für Videos | Die globale Dateigrenze des Supabase-Projekts steht in der Cloud auf 1 GiB, gemessen mit `supabase config diff`. Mehr als die verlangten 500 MB, es war nichts zu ändern. |

## 2. Braucht Entwicklungsarbeit

| Punkt | Hinweis |
|---|---|
| Listen mit Detailansicht, Neuanlage über der Liste (2489, 2490) | Der Umbau der Reklamationen auf die Liste mit Schublade und das Verschieben der Neuanlage über die Liste in den übrigen Modulen berühren rund vierzehn Seiten. Er ist eine Gestaltungsarbeit mit Sichtprüfung bei vier Breiten und gehört in einen eigenen Pull Request. Das Muster steht im Piloten der Pflückaufgaben. |
| Seitenweise Listen, übrige Module (2491) | Vorbestellungen und Reklamationen blättern seit diesem Stand. Die Ratsche `npm run test:grenzen` hält fest, dass keine neue Abfrage ohne Zeilengrenze dazukommt; die vorhandenen stehen in `scripts/qualitaet/grenzen-basis.json` (99 Abfragen, überwiegend kleine Stammdaten). Wächst eine Liste über 500 Zeilen, bekommt sie Seiten. |
| ЕСУТД, weitere Vorgänge | Verlängerung eines befristeten Vertrags (15 Arbeitstage), Fehlerkorrektur (30), Wiedereinstellung (10) sind recherchiert, aber keine Meldeart im System. Einen Feiertagskalender gibt es nicht. |
| Bildvergleich | Referenzbilder aus dem ersten CI-Lauf holen (Artefakt `visuelle-referenz`), prüfen, nach `e2e/visuell.spec.ts-snapshots/` kopieren, einchecken. Bis dahin erzeugt die Pipeline sie nur. |
| Tenge-Formatierer | Vier Fassungen in `esf-ansicht`, `wirtschaftlichkeit-erfassung`, `wirtschaftlichkeit-modell` und `dokument/kontext`, mit unterschiedlicher Rundung (kompakt, ganz, mit Rubel). Eine gemeinsame Fassung braucht eine Entscheidung über die Rundung je Ort. Kalendertag, Monat und Kilogramm sind seit diesem Stand gemeinsam (`src/lib/format/`). |
| Kasachische Texte | Die kasachischen Texte dieses Standes (Einstellungen, Glocke, Videos, Konten, Handbuch) sind erstellt, aber noch nicht von einer Muttersprachlerin oder einem Muttersprachler geprüft. |

## 3. Braucht Inhalte

| Punkt | Hinweis |
|---|---|
| Identifikationsnummern der Kunden | Der ЭСФ-Entwurf meldet „Identifikationsnummer fehlt“, solange IIN oder BIN beim Kunden fehlt (Stammdaten). Die Testdaten tragen erfundene Nummern mit gültiger Prüfziffer, vor dem Produktivbetrieb sind sie durch die echten zu ersetzen. |
| Preislisten | Je Sorte und Kundengruppe vollständig, sonst fehlt dem Entwurf der Preis. Die Winterpreise ab 01.11.2026 und ihre Staffeln sind Testdaten und von der Geschäftsführung festzulegen. |
| Gültigkeitsdaten der Nachweise | Bestehende Dokumente stehen nach der Migration als „offen“, bis Zeitraum, Verantwortlicher und Rechtsgrundlage gepflegt sind. Das Portal erfindet keine Daten. Die Testdaten tragen angenommene Zeiträume, die Dateien selbst fehlen weiterhin. |
| Dateien und Fotos | Nachweise, Fotobelege der Pflückaufgaben und Videos brauchen echte Dateien im Speicher. Eine Migration kann sie nicht anlegen, die Testdaten stehen deshalb ohne Datei („keine Datei“, „noch kein Beleg“). |
| Vier Kennzahlen ohne Berechnung | „Vermarktungsfähig“, „Bis zum Kunden“, „Belegte Verkäufe“ und „Website-Anfragen“ zeigen auf dem Dashboard „Platzhalter“: `kpi_aktuell()` rechnet sie nicht, sie tragen nur den Ausgangswert. Mit Testdaten ändert sich das nicht. Für „Bis zum Kunden“ (Lieferungen) und „Belegte Verkäufe“ (ЭСФ-Belege) liegen die Daten jetzt vor, die Berechnung wäre eine kleine Funktionsänderung. |
| Videos (1454, 2419) | Das Drehbuch liegt vor (acht Videos, Russisch und Kasachisch). Es fehlen Sprecher, ein Drehtermin in der Erntezeit, Einwilligungen der Personen im Bild und die muttersprachliche Prüfung des kasachischen Textes. Hochladen lassen sich die Dateien im Portal, sobald sie existieren. |
| ЕСУТД, Altbestand | Personen, die als „erfasst“ geführt werden, aber keinen Vertrag im Meldeprozess haben, zeigt die Personalansicht mit einem Hinweis. Die Verträge sind nachzutragen. |
| Baseline der Verlustquote | Die Herleitung des Schwund-Nutzens liest die Verlustquote aus der Baseline (8,4 Prozent). Ändert die Geschäftsführung sie, steht sie unter den Kennzahlen der Baseline. |
| Fragenliste an den Betreiber | 28 Fragen, deutsch und russisch, Antworten stehen aus. |

## Testdaten (16.10.2026)

Neun Migrationen `20261209*` füllen die neuen Funktionen mit realitätsnahen, in sich stimmigen Daten. Sie laufen wie jede Datenänderung: beim Push in den Pull Request auf `public_preview`, nach dem Merge auf `public`. Damit stehen beide Umgebungen gleich da.

| Datei | Inhalt |
|---|---|
| `…010000_testdaten_wirtschaftlichkeit` | Investitionsrechnung der Geschäftsführung vom 23.09.2026 als 13 Posten (154.000 EUR, 25.000 EUR je Jahr, 200.000 EUR Nutzen), drei Ist-Werte für September, zwei festgehaltene Stände (mit dem Code der Anwendung gerechnet), Echtbetrieb ab 01.09.2026, Jahresmenge 350 t |
| `…015000_testdaten_pfluecker` | Zehn Saisonkräfte in den Brigaden Nord, Süd und Ost samt Einarbeitung |
| `…020000_testdaten_saison_fortsetzung` | Ernte vom 25.09. bis 15.10.2026: 16 Pflückaufgaben mit Charge, Steigen, Arbeitszeiten und Vorkühlung (zwei Verstöße), 20 Lieferungen mit Tour, Vorbestellung und Transporttemperatur, Zukauf, zwei Reklamationen mit Verlauf, Wetter bis zum ersten Frost am 14.10. |
| `…030000_testdaten_finanzen` | Kostenträger und 88 Buchungen zu diesen Chargen (Deckungsbeitrag je Charge, 590 bis 890 Tenge je kg), Stand der MwSt-Schwellenprüfung |
| `…040000_testdaten_stammdaten` | Rechtsform und BIN oder IIN (mit gültiger Prüfziffer), Anschriften und Abholfenster der Nachbarbetriebe, Werte der Kontaktkanäle |
| `…050000_testdaten_behoerden_nachweise` | ЭСФ-Belege zu allen Lieferungen nach Alter gestaffelt, 15 ЕСУТД-Verträge mit Änderung und Beendigung, Fördercheckpunkte, Gültigkeit der Nachweise, zehn neue Nachweise (einer davon ist die neue Version einer Rückstandsanalyse) |
| `…060000_testdaten_planung` | Rotationsplan mit Brigaden, drei Abholrunden mit Straßengeometrie und eine geplante, zwei offene Pflückaufgaben, vier Vorbestellungen mit Nachrichten, Winterpreislisten mit Staffeln |
| `…070000_testdaten_benachrichtigungen` | einmaliger Lauf der Erzeugung, danach übernimmt der stündliche Workflow |
| `…080000_testdaten_kennzahlen_nachrechnen` | Kennzahlenverlauf vom 25.09.2026 bis heute aus dem jetzigen Stand |

**Schutz.** Jede Migration greift nur, wo Betriebsdaten da sind. Eine leere Datenbank (CI, lokaler Stack vor dem Seed) bleibt unverändert. Jede Tabelle wird nur gefüllt, wenn sie leer ist oder die Zeile fehlt; was jemand von Hand erfasst hat, wird nie ergänzt oder verdoppelt. Ein zweiter Lauf ändert nichts.

**Erkennen.** Alle neuen Zeilen tragen die Kennung `7e57da7a-0000-4000-8000-…` (Testdaten). Die Chargen entstehen per Trigger und hängen über `pflueckaufgabe_id` an dieser Kennung.

**Lokal.** Nach `supabase db reset --local` und `npm run db:seed-auth` holt `npm run db:testdaten-lokal` die Testdaten nach.

**Zurücknehmen.** `supabase/testdaten-entfernen.sql` löscht genau diese Zeilen und gibt Reservierungen, Rotationstermine und Preislisten-Gültigkeit zurück. Auf die Cloud gehört es nur als Migration. Mehrere Journale sind unveränderlich (Buchungen, Kühl- und Transportmessungen, Meldeverlauf, Nachrichten, Stände), das Skript schaltet ihre Sperrtrigger nur für die Dauer des Löschens ab. Nicht zurückgedreht werden Ergänzungen an bestehenden Stammdaten, Brigaden-Zuweisungen im Rotationsplan, Benachrichtigungen und Kennzahlpunkte.

**Bewusst nicht gefüllt.** Lohn (die Cloud trägt September-Abrechnungen aus QA-Läufen, eine Neuberechnung würde sie verändern), Integrationen und ihre Warteschlange (alle abgeschaltet, ein Ereignis entsteht nur bei einem aktiven Webhook), Videos, Fotos und Dokumentdateien (brauchen Dateien).

## Was mit dem Zusammenführen live geht

Die Migrationen `20261207000000` bis `20261208150000` laufen nach dem Merge automatisch auf der gemeinsamen Datenbank (`datenbank-migration.yml`). Im Pull Request laufen sie vorher auf `public_preview`. Alle 28 Dateien haben auf einer echten Postgres-17-Datenbank (lokaler Stack) gelaufen.

| Datei | Wirkung |
|---|---|
| `20261207000000_globale_datensuche` | Funktion `search_everything` |
| `20261207010000_nachweisregister` | Neue Spalten an `dokumente`, Sicht `v_dokumente`, Funktion `nachweis_status` |
| `20261207020000_block_risiko` | Tabelle `risiko_parameter` mit 14 Startwerten (Dateneinfügung), Sicht `v_block_risiko` |
| `20261207030000_rollenzuweisung` | Trigger `profil_letzter_admin_schuetzen` auf `profiles` |
| `20261207040000_vorbestellung_nachrichten` | Tabelle `vorbestellung_nachrichten` (unveränderlich) |
| `20261207050000_transport_logger_quelle` | Zwei Spalten an `transport_temperatur_messungen` |
| `20261207060000_foerder_checkliste` | Tabelle `foerder_checkpunkte` |
| `20261207070000_esf_belege` | Tabelle `esf_belege`, Sicht `v_esf_offen` |
| `20261207080000_esutd_meldeprozess` | Tabelle `esutd_ereignisse`, Spalten an `esutd_vertraege`, **ersetzt zwei Policies** von `esutd_vertraege` |
| `20261207090000_wirtschaftlichkeit_erfassung` | Tabellen `wirtschaftlichkeit_annahmen` (eine Zeile mit den bisherigen Werten, Dateneinfügung), `wirtschaftlichkeit_posten`, `wirtschaftlichkeit_ist`, `wirtschaftlichkeit_staende` (unveränderlich), Sicht `v_vermarktete_menge` |
| `20261207100000_abholrunden` | Vier Spalten an `nachbarbetriebe`, Tabellen `abholrunden` und `abholstopps`, Sicht `v_abholstopps_kuehlkette` |
| `20261207110000_integration_auslieferung` | Spalten an `integrationen` (alle bleiben aus) und `integration_outbox`, Funktion `integration_einreihen`, Trigger auf `esf_belege`, **nimmt Tabellenrechte zurück** und vergibt sie spaltenweise an die Administration |
| `20261208000000_wissen_weitere_bereiche_pgvector` | Spalte `weitere_bereiche` an `wissen_chunks`, **Datenänderung**: 13 Risiko-Dokumente (65 Abschnitte) gelten zusätzlich im Bereich `risiko`, idempotent, nur über die genannten `quelle_id` |
| `20261208010000_cleanup_pr156_schutz` | Nachbesserungen aus der Prüfung: Funktion `abholrunde_nachbarbetriebe()` statt Policy der Brigade auf `nachbarbetriebe`, Löschschutz für Verträge mit erfassten Meldungen (DA017), Stopp-Regeln. Keine Datenänderung |
| `20261208020000_rechte_und_schutz` | **Ersetzt Policies** der Preislisten, des Pflanzenschutzes, der Abholrunden und der Nachrichten, Sicht `v_block_sperre`, Anonymisieren von Nachrichten, Herkunft `logger` nur über die Importfunktion, Fremdschlüssel der Urheber entfallen, Tabelle `esutd_meldeverlauf`. Keine Datenänderung |
| `20261208030000_betriebs_einstellungen` | Tabellen `betriebs_einstellungen` mit 11 Startwerten (**Dateneinfügung**, jeder mit Quelle und Stand) und `betriebs_einstellungen_verlauf` (unveränderlich), Funktion `einstellung_setzen` |
| `20261208040000_esutd_fristen_einstellungen` | Spalte `unterzeichnet_am`, Fristen aus den Einstellungen, Sichten erweitert. Keine Datenänderung |
| `20261208050000_haertung` | Eindeutiger Index auf die Ist-Werte (entfernt doppelte Ist-Werte der neuen Tabelle), Funktionen für Doppelklick und atomare Abholrunde, Grenze der Adresssuche, Präfix `DAMICON_HOOK_`, Plausibilität der Risiko-Parameter, Sicht `v_block_risiko` nur für Rollen mit allen Eingaben |
| `20261208060000_abholrunden_ausbau` | Kapazität an Runden, Abholfenster an Nachbarbetrieben, geschätzte Ankunft. Keine Datenänderung |
| `20261208070000_preise_netto_brutto` | Schalter netto oder brutto an der Preisliste. Alle vorhandenen Listen bleiben netto |
| `20261208080000_integration_ausbau` | Zugang per Basic, Vorlage, Rückmeldung des Partners. Alle Integrationen bleiben aus |
| `20261208090000_konten_sperren` | Drei Spalten an `profiles`, Funktion `konto_sperren`, `current_app_role()` und Verwandte liefern für gesperrte Konten nichts. Alle Konten bleiben aktiv |
| `20261208100000_risiko_parameter_pflege` | Spalte `standard_wert` an `risiko_parameter` (**füllt die neue Spalte** mit den Startwerten, ändert keinen Wert), Grenzen, Verlauf, Funktion `risiko_parameter_setzen` |
| `20261208110000_datensuche_trigramm` | Erweiterung `pg_trgm` und neun Indizes. Ohne die Erweiterung bleibt die Migration wirkungslos |
| `20261208120000_nachweis_versionen` | Spalte `ersetzt_id` an `dokumente`, Sicht erweitert. Bestehende Dokumente gelten als aktuell |
| `20261208130000_schulungsvideos_dateien` | Tabelle `schulungsvideo_dateien`, privater Bucket `schulungsvideos`, Policies auf `storage.objects` |
| `20261208140000_schwund_herleitung` | Funktion `schwund_herleitung`. Keine Datenänderung |
| `20261208150000_benachrichtigungen` | Tabelle `benachrichtigungen`, Funktion `benachrichtigungen_erzeugen` (nur für den Dienstschlüssel) |

Datenänderungen im engeren Sinn sind die Startwerte (`risiko_parameter`, `wirtschaftlichkeit_annahmen`, `betriebs_einstellungen`), die Spalte `standard_wert`, der Eintrag in `weitere_bereiche` und das Entfernen doppelter Ist-Werte in einer Tabelle, die es erst mit diesem Pull Request gibt. Keine Migration ändert oder löscht sonst bestehende Zeilen.

Die Rechterücknahme in `20261207110000` ändert nichts an dem, was heute möglich ist: es gab dort keine Update-Policy, also auch kein wirksames Schreibrecht. Die Policies, die `20261208020000` ersetzt, waren weiter als die Rechtematrix: Wer heute über die Datenbank direkt Preislisten, Behandlungen oder Abholrunden liest oder schreibt, ohne dass die Matrix es vorsieht, verliert dieses Recht (die Oberfläche zeigte es ihm nie).
