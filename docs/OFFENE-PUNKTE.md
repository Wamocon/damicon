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
| 1475 | Diese Liste, Handbuch um sechs Anleitungen und zwei Schnittstellen erweitert | fertig |

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
| Abholrunden (1577) | Fachliche Klärung steht aus, nicht gebaut. | Betreiber |
| 1C-Konnektor (1627, 2290) | Wartet auf die Entscheidung des Partners. | Partner |
| Sprachpolitik (1518) | Wartet auf die Antwort des Betreibers. | Betreiber |
| Wirtschaftlichkeit (2470) | Jahresnutzen, Kalkulationszins und vermarktete Menge sind „in Klärung“ (Jira-Kommentar vom 24.09.2026). Das Gerüst zum Erfassen lässt sich bauen, die Werte nicht erfinden. | Geschäftsführung |
| Plattform in Kasachstan | Umzug nach der Beauftragung und vor dem Produktivbetrieb (Entscheidung vom 13.10.2026). KI- und Sprachdienste werden zuerst analysiert. | Niko |

## 2. Braucht Entwicklungsarbeit

| Punkt | Hinweis |
|---|---|
| Wirtschaftlichkeit erfassen (2470, Etappen a, b, c) | Tabellen für Investitions-, Betriebs- und Nutzenposten, Stände mit Datum und Wechselkurs, Plan-Ist-Vergleich. Nicht begonnen. |
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

## 3. Braucht Inhalte

| Punkt | Hinweis |
|---|---|
| Identifikationsnummern der Kunden | Der ЭСФ-Entwurf meldet „Identifikationsnummer fehlt“, solange IIN oder BIN beim Kunden fehlt (Stammdaten). |
| Preislisten | Je Sorte und Kundengruppe vollständig, sonst fehlt dem Entwurf der Preis. |
| Gültigkeitsdaten der Nachweise | Bestehende Dokumente stehen nach der Migration als „offen“, bis Zeitraum, Verantwortlicher und Rechtsgrundlage gepflegt sind. Das Portal erfindet keine Daten. |
| Videos (1454, 2419) | Drehbuch für fünf bis acht Kurzvideos auf Russisch und Kasachisch. Produktionsarbeit, keine Entwicklung. |
| Fragenliste an den Betreiber | 28 Fragen, deutsch und russisch, Antworten stehen aus. |

## Was mit dem Zusammenführen live geht

Die Migrationen `20261207000000` bis `20261207080000` laufen nach dem Merge automatisch auf der gemeinsamen Datenbank (`datenbank-migration.yml`). Im Pull Request laufen sie vorher auf `public_preview`.

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

Keine Migration ändert oder löscht bestehende Zeilen.
