# Recherche Steuern und Handel Kasachstan

Quellenregister und Kernwissen zum kasachischen Steuer- und Handelsrecht, aufbereitet fuer die Aufnahme in die Vektordatenbank des Systems.

Stand: 2026-09-18. Zweig `dev/dmoretz_steuer-handel-recherche`, bewusst nicht nach `main` zusammengefuehrt.

## Warum es diese Sammlung gibt

Damicon kennt heute genau eine steuerliche Tatsache: die Rechtsform eines Beteiligten und seine ИИН oder БИН, geprueft ueber die Pruefziffer in `supabase/migrations/20261021000000_stammdaten_rechtsform.sql` und `src/lib/domain/rechtsform.ts`. Alles darueber hinaus fehlt. Die Angabe "Mehrwertsteuer 16 Prozent" auf der Startseite ist ein Textbaustein in `src/messages/de.json` und keine Rechnung. Die Lohnabrechnung zahlt brutto ohne jeden Abzug. Das Hauptbuch hat keine Steuerspalte.

Gleichzeitig hat Kasachstan sein Steuerrecht zum 1. Januar 2026 vollstaendig ersetzt, Kodex Nr. 214-VIII vom 18. Juli 2025. Nahezu alles, was vor 2026 veroeffentlicht wurde, ist inhaltlich ueberholt. Das gilt auch fuer das Trainingswissen von Sprachmodellen.

Diese Sammlung traegt Quellen zusammen und haelt deren Kern fest. **Sie ist keine Steuerberatung.** Jede Zahl ist eine belegte Behauptung mit Datum.

## Aufbau

| Pfad | Inhalt |
|---|---|
| `overview-en.md` | Englische Zusammenfassung der Befunde, fuer Leser ohne Deutsch |
| `quellenregister-schema.yaml` | Verbindliches Satzformat fuer jeden Quelleneintrag |
| `rag-ingest-spezifikation.md` | Vertrag fuer die Aufnahme in die Vektordatenbank |
| `konfliktregister.md` | Widersprueche zwischen Quellen, mit Aufloesungsstand |
| `quellen/` | Das Register selbst, eine Datei je Rechercheperspektive |
| `kernwissen/` | Der inhaltliche Befund je Thema, mit woertlichen Zitaten |
| `preise-rohbefund.md` | Was welche Quelle kostet |
| `buecherliste.md` | Ausfuehrliche Einordnung je Titel |
| `buecher-kaufliste.md` | Bestellhilfe mit Direktlinks, nach Kaufempfehlung sortiert |
| `erfassungsplan.md` | Wie aus dem Register ein Korpus wird, mit Arbeitsteilung |
| `korpus/` | Der geerntete Text selbst, je Abschnitt eine Datei mit Frontmatter |
| `korpus/korpus-index.yaml` | Auszaehlung des Korpus nach Stufe, Sprache und Bereich |

## Zwei Regeln, die nicht verhandelbar sind

**Zeitliche Kennzeichnung.** Jeder Abschnitt traegt `gueltig_ab`. Material von vor 2026 wird als ueberholt markiert und aus der Standardsuche ausgeschlossen. Ohne diese Sperre antwortet der Assistent ueberzeugt mit dem alten Mehrwertsteuersatz, gut belegt und falsch.

**Rangfolge der Quellen.** Primaerrecht auf adilet.zan.kz schlaegt amtliche Erlaeuterung, diese schlaegt Fachkommentar, dieser schlaegt Presse. Ein gut formulierter Beitrag eines Praxisportals verdraengt keinen Gesetzesartikel, auch wenn er die Frage besser trifft.

## Sprachen

Die Recherche laeuft ueberwiegend auf Russisch, mit kasachischer Gegenpruefung und englischer Einordnung. Der Grund ist nicht Vollstaendigkeit, sondern Befund: russische und kasachische Suchen liefern zu denselben Fragen **unterschiedliche Tatsachen**. Beide Sprachfassungen des Kodex sind amtlich, siehe `konfliktregister.md`, Eintrag K-02.

Die Dokumente hier sind auf Deutsch verfasst, passend zum uebrigen Projekt. Fachbegriffe tragen ihre russische und kasachische Entsprechung, damit die Uebersetzungen in `src/messages/` und ein kasachischer Buchhalter denselben Gegenstand meinen.

## Was diese Sammlung nicht ist

Sie entwirft kein Datenmodell, schreibt keine Migration, baut keine Anbindung an die ИС ЭСФ und aendert keine Anwendung. Sie sammelt Quellen und haelt deren Kern fest. Ob und wie daraus Software wird, ist eine spaetere und eigene Entscheidung.
