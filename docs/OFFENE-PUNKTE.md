# Offene Punkte

Stand: 14.10.2026, Branch `feat/restfunktionen-spur-a`. Diese Liste ersetzt keine Jira-Pakete. Sie sagt, was nach diesem Stand noch nicht fertig ist und woran es hängt, damit niemand raten muss, ob ein Punkt vergessen wurde oder bewusst offen ist.

Drei Spalten bestimmen, wie es weitergeht:

1. **Wartet auf Entscheidung**: Niemand muss bauen, jemand muss festlegen. Ohne Antwort würde Code eine fachliche Annahme als Tatsache einbauen.
2. **Braucht Entwicklungsarbeit**: Die Anforderung ist klar, die Umsetzung fehlt.
3. **Braucht Inhalte**: Das System kann es, die Daten oder Texte fehlen.

## Was dieser Branch liefert

| Jira | Inhalt | Stand |
|---|---|---|
| 1467 | Globale Datensuche (`search_everything`, Gruppe „Daten“ im Suchdialog) | fertig |
| 1469 | Nachweisregister: Gültigkeit, Verantwortliche, Ablaufstatus, Einspeisung in den Risiko-Radar | fertig |
| 1470 | Block-Risiko mit Gewichten aus der Tabelle `risiko_parameter` (aus den Betriebsregeln hergeleitet) | fertig, Abstimmung mit dem Betreiber offen |
| 1472 | Nachrichten je Vorbestellung, Lieferplan als Kalenderdatei | fertig |
| 1441 | Rollenzuweisung in der Oberfläche, letzter Administrator geschützt | fertig |
| 1519 | Kennzahlen im Cockpit auf 12 begrenzt | war schon umgesetzt, jetzt durch einen Test gesichert |
| 1440 | ЭСФ, Stufe 1: Belegregister, Entwurf, Statuslauf | fertig, Stufe 2 offen |
| 1447 | ЕСУТД, Stufe 1: Meldeprozess, Bestätigung, Beleg, CSV-Export | fertig, Stufe 2 offen |
| 1448 | Fördermittel: Checkliste je Dossier statt Portalanbindung | fertig |
| 1517 | Temperaturlogger: Import der CSV-Datei, Stufe 1 | fertig, Geräteanbindung offen |
| 1461 | Abgleich der Rechtematrix mit der Zeilensicherheit per Zugriffsprobe | fertig, vier Entscheidungen offen (unten) |
| 1473, 1460 | Browsertests gegen die lokale Instanz in der CI, Rechte je Rolle, Bildvergleich | fertig, Referenzbilder noch aus der CI zu holen |
| 1475 | Diese Liste, Handbuch um neun Anleitungen und zwei Schnittstellen erweitert | fertig |
| 2470 | Wirtschaftlichkeit: Posten, Annahmen, Plan-Ist, festgehaltene Stände mit eigenem Kurs, Dokument | Erfassung fertig, die Werte sind Sache der Geschäftsführung |
| 1577 | Abholrunden bei Nachbarbetrieben: Planen, Ablauf, 60-Minuten-Regel, Abholauftrag und Nachweis als Dokument | fertig, Fahrzeugkapazität und Zeitfenster offen |
| 1627, 2290 | Auslieferung der Integrations-Warteschlange als signierter Webhook, Registry mit Konfiguration, ЭСФ-Beleg reiht ein | Rahmen fertig, Partner und Zielformat offen |
| 1517 | Temperaturlogger: JSON-Import neben der CSV-Datei (Stufe 2, soweit ohne Gerät möglich) | fertig, Geräteanbindung offen |
| 1465 | Hypercare-Plan als Entwurf zur Abstimmung (Word, `docs/Hypercare-Plan-Damicon.docx`) | Entwurf, Entscheidungen offen |
| 1454, 2419 | Drehbuch für acht Kurzvideos auf Russisch und Kasachisch (Word, `docs/Schulungsvideos-Drehbuch-Damicon.docx`) | Drehbuch fertig, Produktion offen |
| 1436 | Wetter: Anbindung (Open-Meteo, Temperatursumme) war schon umgesetzt, die Jira-Beschreibung war veraltet | nur Jira nachgezogen |
| 3.5 | Fehler in der Tourenplanung der Auslieferung behoben: die Reihenfolge der Stopps aus dem Routendienst wurde in der falschen Richtung gelesen | behoben, Test hält es fest |

## 1. Wartet auf Entscheidung

| Punkt | Warum es hängt | Wer |
|---|---|---|
| Preislisten lesen (Matrix gegen Datenbank) | `preislisten_select_intern` lässt jede angemeldete Rolle lesen (WMCNL-2451). Ein Kunde kann damit per direktem Zugriff auch die Preislisten anderer Kundengruppen lesen. Entweder die Policy auf die eigene Gruppe einschränken oder bewusst so lassen. | Niko, Betreiber |
| Preislisten schreiben | Die Datenbank erlaubt dem ganzen Büro das Schreiben, also auch der Buchhaltung. Die Matrix gibt der Buchhaltung nur „sehen“. Matrix erweitern oder Policy einschränken. | Niko |
| Pflanzenschutz lesen | `pflanzenschutz_behandlungen_select_produktion` nennt Buchhaltung und Erzeuger. Ein Nachbarbetrieb liest damit alle Behandlungen des Betriebs. Gewollt oder zu weit? | Niko, Betreiber |
| Matrix gibt mehr, als die Datenbank liefert | `dokumente:view` für Erzeuger und Kunde, `b2b_portal:view` und `finanzen:view` für Erzeuger: Das Modul öffnet, zeigt aber nichts. Matrix kürzen oder Zugriff nachziehen. | Niko |
| Preisliste netto oder brutto | Der ЭСФ-Entwurf nimmt Nettopreise an und rechnet die MwSt obendrauf, wenn der Betrieb am Liefertag MwSt-registriert war. Die Buchhaltung muss das bestätigen. | Buchhaltung |
| Frist für die ЭСФ | Das Portal hinterlegt keine Frist und rechnet nur das Alter ab dem Liefertag. Welche Frist gilt, legt die Buchhaltung fest. | Buchhaltung |
| Rechtsgrundlage der ЕСУТД-Frist | Die Frist von fünf Werktagen ab Vertragsbeginn steht seit Oktober im System. Eine eindeutige Quelle ist in der Recherche nicht belegt. Für Änderung und Beendigung ist bewusst keine Frist hinterlegt. | Rechtsberatung |
| Risiko-Gewichte (1470) | Die Gewichte sind aus den Betriebsregeln hergeleitet und stehen mit Begründung in `risiko_parameter`. Ändern dürfen nur Administration und Geschäftsführung. Mit dem Betreiber abstimmen. | Betreiber |
| ЭСФ und ЕСУТД, Stufe 2 | Brauchen den Zugang der Behörde (Operator oder API, Signatur beim Betreiber). Private Schlüssel gehören nicht ins System. | Behörde, Betreiber |
| Abholrunden (1577), Ausbau | Gebaut ist der Ablauf einer Runde mit Strecke und 60-Minuten-Regel. Offen sind die Fahrzeugkapazität, Zeitfenster der Nachbarbetriebe und ob mehrere Fahrzeuge je Tag planbar sein sollen. | Betreiber |
| 1C-Konnektor (1627, 2290) | Der Rahmen steht (Warteschlange, Webhook, Signatur, Wiederholung). Welcher Partner angebunden wird und welches Format sein Ziel erwartet, steht aus. Das Zielformat des Umschlags ist festgelegt, ein Mapping auf den Partner fehlt. | Partner |
| Auslieferung einschalten | Eine Integration liefert nur aus, wenn die Administration sie aktiviert, die Adresse einträgt und die Umgebungsvariable mit dem Geheimnis auf dem Server gesetzt ist. Ohne Cron-Dienst (`CRON_SECRET`, Aufruf von `/api/integrationen/ausliefern`) liefert der Knopf aus. Das Einrichten der Plattform übernimmt der Betreiber. | Niko, Betreiber |
| ЕСУТД an einen Partner liefern | Die Meldungen tragen Namen und Ausweisnummern. Ob und auf welcher Rechtsgrundlage sie an ein Partnersystem gehen dürfen, ist nicht entschieden. Bis dahin reiht ЕСУТД bewusst nichts ein. | Rechtsberatung, Betreiber |
| Sprachpolitik (1518) | Wartet auf die Antwort des Betreibers. | Betreiber |
| Wirtschaftlichkeit (2470), Werte | Das Erfassen steht. Jahresnutzen, Kalkulationszins und vermarktete Menge sind „in Klärung“ (Jira-Kommentar vom 24.09.2026) und stehen als geschätzt, bis sie belegt sind. Die Seite zeigt „offen“, wo Angaben fehlen. | Geschäftsführung |
| Hypercare-Plan (1465) | Der Entwurf nennt Vorschläge. Go-Live-Datum, Dauer, Bereitschaftszeiten, Reaktionsziele, Meldekanal und die Namen der Rollen stehen im Abschnitt „Offene Entscheidungen“ des Plans. | Geschäftsführung, Betreiber |
| Plattform in Kasachstan | Umzug nach der Beauftragung und vor dem Produktivbetrieb (Entscheidung vom 13.10.2026). KI- und Sprachdienste werden zuerst analysiert. | Niko |
| Prüfung PR #156 (15.10.2026): Rechte der Buchhaltung | Die Policies der Abholrunden (planen, löschen) und der Nachrichten (schreiben) nennen `has_office_access()`, also auch die Buchhaltung. `rbac.ts` gibt ihr dort nur `b2b_portal:view` und kein `logistik`. Entweder die Matrix erweitern oder die Policies auf die Rollen der Matrix einengen. | Niko |
| Prüfung PR #156: Brigade ändert geplante Runden | Die Brigade darf Datum und Fahrzeug einer geplanten (nicht gestarteten) Runde ändern, ohne Spalten- oder Phasenbegrenzung der Policy. Gewollt, oder nur das Büro bis zum Start? | Betreiber |
| Prüfung PR #156: Herkunft "Messprotokoll" | Die Brigade darf Messungen als `logger` eintragen (die Datenbank unterscheidet Import und Handeingabe nicht). Die Kennzeichnung ist damit kein Fälschungsschutz. Wer sie als Nachweis nutzt, braucht einen Importweg über eine eigene Funktion oder Rolle. | Niko |
| Prüfung PR #156: Konto löschen | Ein Konto, das einen bestätigten ЭСФ-Beleg, einen Stand der Wirtschaftlichkeit oder eine abgeschlossene Runde angelegt hat, lässt sich nicht löschen (`on delete set null` stößt auf die Unveränderlichkeit). Konten sperren statt löschen, oder die Fremdschlüssel wie bei den Nachrichten weglassen. | Niko |
| Prüfung PR #156: Wiederöffnen eines ЕСУТД-Abschlusses | Das Wiederöffnen leert Bestätigung und Beleg, ohne Verlauf in der Datenbank. Gewollt (Korrektur) oder soll ein Verlauf bleiben? | Betreiber |
| Prüfung PR #156: Löschweg für Nachrichten | Nachrichten zu Vorbestellungen sind unveränderlich und tragen Klarnamen. Für Datenschutzfälle gibt es keinen Löschweg. | Datenschutz, Betreiber |

## 2. Braucht Entwicklungsarbeit

| Punkt | Hinweis |
|---|---|
| Abholrunden, Ausbau | Fahrzeugkapazität und Zeitfenster, sobald fachlich geklärt. Eine Karte je Runde gibt es, die Reihenfolge folgt nur der Strecke. |
| Wirtschaftlichkeit, Aufteilung des Nutzens | Der Nutzen steht als Summe und je Kategorie (Schwund, Handarbeit, Audit, Sonstiges). Eine Herleitung aus Betriebsdaten (zum Beispiel Schwund aus der Verlustquote) ist nicht gebaut. |
| Auslieferung, Bestätigung durch den Partner | Der Status „bestätigt“ ist vorgesehen, aber nichts setzt ihn. Er braucht einen Rückkanal des Partners. |
| Schulungsvideos im Portal | Das Portal hat die Tabelle `schulungsvideos`, aber keine Wiedergabe. Das Drehbuch ist fertig, die Produktion nicht. |
| Listen mit Filter und Blättern (2489, 2490, 2491) | Reklamationen als Liste mit Detailansicht, Neuanlage über der Liste in den übrigen Modulen, Grenze und Blättern für lange Listen. Eine Folge des Pilots aus WMCNL-2488, nicht bearbeitet: es berührt rund vierzehn Seiten und verlangt eine Sichtprüfung bei vier Breiten. |
| Benachrichtigungen, Stufe 2 (2486) | Jira nennt als Voraussetzung die Klärung der Anforderungen und einen zeitgesteuerten Dienst (pg_cron), den es nicht gibt. Nicht bearbeitet. |
| ЭСФ Stufe 2 | Übergabe über Operator oder API, Statusrückmeldung, Wiederholung. Die Tabelle `integration_outbox` ist die Grundlage. |
| ЕСУТД Stufe 2 | Anbindung, falls ein Zugang existiert. Der Risiko-Radar kennt heute nur die Frist des Abschlusses, offene Änderungen und Beendigungen erscheinen dort nicht. |
| Temperaturlogger, Geräteanbindung | Je Hersteller, braucht ein Gerät zum Testen. |
| Fördermittel, Datenabgleich | Nur, wenn das Portal eine Schnittstelle bietet. Antragsvorlagen je Programm sind bewusst nicht Teil. |
| Nachweisregister, Versionen | Mehrere Stände je Dokument. |
| Rollenverwaltung | Konten für Mitarbeitende anlegen und sperren. Heute entstehen Konten über Einladungen (Kunden) oder das Seed-Skript. |
| Handbuch | Anleitungen für Fördermittel-Checkliste, Datensuche und Block-Risiko fehlen noch. |
| ЕСУТД, Altbestand | `pfluecker.esutd` folgt den Meldungen nur für Personen mit mindestens einem Vertrag. Personen ohne erfassten Vertrag behalten ihren alten Wert. |
| Bildvergleich | Referenzbilder aus dem ersten CI-Lauf holen (Artefakt `visuelle-referenz`), prüfen, nach `e2e/visuell.spec.ts-snapshots/` kopieren, einchecken. Bis dahin erzeugt die Pipeline sie nur. |
| Browsertests | Geschäftsführung und Erzeuger sind nur im Zugriffstest abgedeckt, nicht in einem fachlichen Ablauf. |
| Prüfung PR #156: lange Funktionen | `WirtschaftlichkeitErfassung` (247 Zeilen), `baueWirtschaftlichkeitDokument` (173) und `baueModell` (146) gehören zerlegt. Erst ein Charakterisierungstest (Ausgabe vor dem Umbau festhalten), dann aufteilen. |
| Prüfung PR #156: Doppelungen in der Oberfläche | Tenge-Formatierer viermal (`esf-ansicht`, `wirtschaftlichkeit-erfassung`, `wirtschaftlichkeit-modell`, `dokument/kontext`), Tagesformatierer mit `T00:00:00Z` achtmal, Auswahllisten der Wirtschaftlichkeit doppelt, Überfälligkeitsregel der Förder-Checkliste dreifach, "kg" fest in ЭСФ und Vorbestellungen (ru, kk lateinisch). Gemeinsame Helfer, wenn die Bereiche das nächste Mal angefasst werden. |
| Prüfung PR #156: Doppelklick | `modellwerteUebernehmen` und `checklisteVorschlagUebernehmen` zählen erst und fügen dann ein. Unique-Index auf (monat, kategorie, waehrung) für die Ist-Werte, Pending-Schutz an den Knöpfen. |
| Prüfung PR #156: Abholrunde atomar | `abholrundeErstellen` legt Runde und Stopps in zwei Einfügungen an, die Rücknahme kann scheitern. Eine Funktion in der Datenbank oder eine Transaktion. |
| Prüfung PR #156: Geokodierung | `nachbarAdresseSetzen` verlangt nur `update`, die Brigade hat es, und die Adresse geht an Nominatim vor der Zeilensicherheit, ohne Ratenbegrenzung. Besser `create` und eine Grenze je Person. |
| Prüfung PR #156: Protokoll | `protokolliere` schluckt Fehler: Ein ЕСУТД-Export mit Namen und Ausweisnummern kann ohne Eintrag herausgehen. Für den Export den Fehler nicht verschlucken. |
| Prüfung PR #156: Auslieferung, Härtung | `geheimnis_name` auf ein festes Präfix (`DAMICON_HOOK_`) beschränken, sonst kann die Administration `CRON_SECRET` als Signaturschlüssel eintragen. Adressfilter um 192.0.0.0/24, 198.18.0.0/15, 224.0.0.0/4, 240.0.0.0/4, NAT64 und 6to4 ergänzen. |
| Prüfung PR #156: Datensuche | `ILIKE '%x%'` ohne Trigramm-Index: Bei wachsenden Tabellen sequenzielle Suche. `pg_trgm` und GIN-Index. |
| Prüfung PR #156: Block-Risiko | `risiko_parameter` ist für jede Rolle lesbar und ohne Plausibilität (Schwelle hoch kleiner als mittel). Für Erzeuger und Buchhaltung liefert die Sicht zu niedrige Werte, weil Rotationsplan und Kühlketten für sie unsichtbar sind. |
| Prüfung PR #156: Rundung | `esf.ts` rundet über Gleitkomma (1,005 ergibt 1,00), `wirtschaftlichkeit-formulare.tsx` rundet beim Vorbefüllen (6,125 % wird beim nächsten Speichern 6,13 %). |

## 3. Braucht Inhalte

| Punkt | Hinweis |
|---|---|
| Identifikationsnummern der Kunden | Der ЭСФ-Entwurf meldet „Identifikationsnummer fehlt“, solange IIN oder BIN beim Kunden fehlt (Stammdaten). |
| Preislisten | Je Sorte und Kundengruppe vollständig, sonst fehlt dem Entwurf der Preis. |
| Gültigkeitsdaten der Nachweise | Bestehende Dokumente stehen nach der Migration als „offen“, bis Zeitraum, Verantwortlicher und Rechtsgrundlage gepflegt sind. Das Portal erfindet keine Daten. |
| Videos (1454, 2419) | Das Drehbuch liegt vor (acht Videos, Russisch und Kasachisch). Es fehlen Sprecher, ein Drehtermin in der Erntezeit, Einwilligungen der Personen im Bild und die muttersprachliche Prüfung des kasachischen Textes. |
| Fragenliste an den Betreiber | 28 Fragen, deutsch und russisch, Antworten stehen aus. |

## Was mit dem Zusammenführen live geht

Die Migrationen `20261207000000` bis `20261208010000` laufen nach dem Merge automatisch auf der gemeinsamen Datenbank (`datenbank-migration.yml`). Im Pull Request laufen sie vorher auf `public_preview`.

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
| `20261207080000_esutd_meldeprozess` | Tabelle `esutd_ereignisse`, Spalten an `esutd_vertraege`, **ersetzt zwei Policies** von `esutd_vertraege` (Geschäftsführung ergänzt) |
| `20261207090000_wirtschaftlichkeit_erfassung` | Tabellen `wirtschaftlichkeit_annahmen` (eine Zeile mit den bisherigen Werten, Dateneinfügung), `wirtschaftlichkeit_posten`, `wirtschaftlichkeit_ist`, `wirtschaftlichkeit_staende` (unveränderlich), Sicht `v_vermarktete_menge` |
| `20261207100000_abholrunden` | Vier Spalten an `nachbarbetriebe`, Tabellen `abholrunden` und `abholstopps`, Sicht `v_abholstopps_kuehlkette`, **neue Lese-Policy** der Brigade auf `nachbarbetriebe` (nur Betriebe in einem Stopp) |
| `20261207110000_integration_auslieferung` | Spalten an `integrationen` (alle Integrationen bleiben aus) und `integration_outbox` (bestehende Zeilen bekommen den Standard für den nächsten Versuch), Funktion `integration_einreihen`, Trigger auf `esf_belege`, **nimmt Tabellenrechte zurück** (`update` auf `integrationen`, `insert`, `update`, `delete` auf `integration_outbox` für `authenticated`) und vergibt sie spaltenweise an die Administration, neue Update-Policies |
| `20261208000000_wissen_weitere_bereiche_pgvector` | Spalte `weitere_bereiche` an `wissen_chunks`, Wächter und Liste angepasst, **Datenänderung**: 13 Risiko-Dokumente (65 Abschnitte) gelten zusätzlich im Bereich `risiko`, idempotent, nur über die genannten `quelle_id` |
| `20261208010000_cleanup_pr156_schutz` | Nachbesserungen aus der Prüfung: **Policy der Brigade auf `nachbarbetriebe` entfällt** (Funktion `abholrunde_nachbarbetriebe()` ersetzt sie, ohne ИИН/БИН), ЕСУТД-Funktionen nicht mehr über `/rpc` aufrufbar, Löschschutz für Verträge mit erfassten Meldungen (DA017), Stopp-Regeln der Abholrunden (Beginn immer geplant, Zeiten nach der Abholung fest), neuer Idempotenzschlüssel der ЭСФ-Meldungen, Check auf `logger_kennung`. Keine Datenänderung |

Keine Migration außer `20261208000000` ändert oder löscht bestehende Zeilen (dort nur ein Eintrag in der neuen Spalte). Die Rechterücknahme in `20261207110000` ändert nichts an dem, was heute möglich ist: es gab dort keine Update-Policy, also auch kein wirksames Schreibrecht.
