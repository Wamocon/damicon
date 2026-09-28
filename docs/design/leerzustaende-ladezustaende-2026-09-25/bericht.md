# Leer- und Ladezustände im Damicon-Portal — 25.09.2026

## Anlass

Bestandsaufnahme aller Empty States und Loading Screens im Portal, als Grundlage für eine
künftige Gestaltungsrunde zu diesem Thema.

## Methode

Durchsucht wurden `src/app`, `src/components` und `src/messages/de.json` nach den
Next.js-Ladeseiten (`loading.tsx`), nach Skeleton- und Spinner-Verwendung sowie nach
deutschen Leertexten ("noch keine", "keine", "nichts", "leer"). Nicht aufgeführt sind reine
Fehlermeldungen (`fehlerseite`, `ladefehler`) und Hinweistexte ohne Leerzustand, etwa
Rollenbeschreibungen wie "Keine Nutzerverwaltung".

## Ladezustände

### Eigene Ladeseiten (`loading.tsx`)

Vier Next.js-Ladeseiten lösen automatisch aus, solange die jeweilige Route auf Daten wartet.

| Ebene | Datei | Anzeige | Text |
|---|---|---|---|
| Öffentliche Seiten (Marketing, Impressum, Herkunftsauskunft, Login) | `src/app/[locale]/loading.tsx` | `LkwLader`: fahrender Kühl-LKW, reines SVG mit CSS-Animation | „Die Seite wird geladen" (`common.laedt`) |
| Dashboard-Einstieg, einmal je Sitzung nach der Anmeldung | `src/app/[locale]/dashboard/loading.tsx` | `FeldLader`: Begleitfigur läuft über einen Feldweg, SVG/CSS | „Daten werden geladen" (`dashboard.loading`), über `FeldLader`-Prop |
| Bereichsseite, beim Wechsel zwischen Zonen | `src/app/[locale]/dashboard/[zone]/loading.tsx` | Skelett: Brotkrumen, Titel, Beschreibung, vier Modulkacheln in zwei Spalten (`Skeleton`/`SkeletonCard`) | sr-only „Daten werden geladen" |
| Modulseite, beim Wechsel zwischen Modulen | `src/app/[locale]/dashboard/[zone]/[module]/loading.tsx` | Skelett folgt dem Aufbau der Modulseite: Brotkrumen, Titel, Beschreibung, zwei Abzeichen, zwei Kartenblöcke | sr-only „Daten werden geladen" |

Die beiden Skelett-Ladeseiten wurden laut Kommentar in `kit.tsx` eingeführt, weil der
Modulwechsel zuvor gar keine Rückmeldung zeigte — die alte Seite blieb stehen, bis die
Datenbank geantwortet hatte.

### Ladeanzeigen innerhalb von Komponenten

Kein eigener Screen, sondern ein Spinner (`Loader2` aus lucide-react) an der jeweiligen
Stelle im Layout.

| Komponente | Datei | Anlass |
|---|---|---|
| Knopf (Button) | `src/components/ui/kit.tsx` | `laedt`-Prop deckt die Beschriftung ab und zeigt den Spinner — gilt für jeden ladenden Knopf im Portal |
| Kopfzeile | `src/components/dashboard/topbar.tsx` | Hinweis „läuft im Hintergrund" mit Spinner-Icon für laufende Hintergrundjobs |
| KI-Chat, einzelner Schritt | `src/components/ki/ki-chat.tsx` | Spinner je Schritt, solange `zustand === "laeuft"` |
| KI-Chat, Aktionskarte | `src/components/ki/ki-chat-aktionskarte.tsx` | Spinner bei `zustand === "laeuft"` oder `"vorbereiten"` |
| Mikrofon | `src/components/ki/mikrofon.tsx` | Spinner beim Öffnen des Mikrofons und beim Verarbeiten der Aufnahme |
| Sprachausgabe | `src/components/ki/sprachausgabe.tsx` | Spinner, solange die Vorlesefunktion vorbereitet wird |
| 3D-Plantagenrundgang | `src/components/site/plantagen-scan-viewer.tsx` | Eigener Fortschrittstext „Wird geladen … {prozent} %" (`erlebnis.scan.laedt`); davor ein Startknopf mit Dateigröße in MB (`erlebnis.scan.laden`), da der Rundgang erst auf Knopfdruck lädt |

## Leerzustände

Rund 60 Stellen zeigen statt einer Tabelle oder Liste einen Text, wenn (noch) keine Daten
vorhanden sind. Bis auf eine Ausnahme (`pflueckaufgaben-liste.tsx`, siehe unten) ist jeder
dieser Texte für sich in seiner Komponente geschrieben, nicht über eine gemeinsame
Komponente.

### Navigation und Suche

| Ort | Datei | Text |
|---|---|---|
| Suchfeld vor Eingabe | `src/components/suche/such-liste.tsx` | „Namen eines Bereichs, Moduls oder einer Seite eingeben." |
| Suche ohne Treffer | `src/components/suche/such-liste.tsx` | „Keine Seite und kein Modul zu „{begriff}"." |

### Dashboard und Kennzahlen

| Ort | Datei | Text |
|---|---|---|
| Bereichsseite, keine Module für die Rolle | `src/components/dashboard/zone-page-body.tsx` | „Für die aktive Rolle ist in dieser Zone kein Modul freigegeben." |
| Bereichsseite, keine Kennzahl freigegeben | `src/components/dashboard/zone-page-body.tsx` | „Für diese Zone ist keine Kennzahl freigegeben." |
| Zonenkarte, keine Kennzahl freigegeben | `src/components/dashboard/bereiche-box.tsx` | „Für diesen Bereich ist keine Kennzahl freigegeben." |
| Kennzahl-Kachel ohne Messung | `src/components/dashboard/kennzahl-box.tsx` | „Noch keine Messung." / „Das Datenmodell hat dafür noch keinen Platz." |
| Startkarte Brigade, keine offene Aufgabe | `src/components/dashboard/startkarte-brigade.tsx` | „Nichts offen." |
| CEO-Tagesübersicht, noch kein Bericht | `src/components/dashboard/tages-kopf.tsx` | „Noch kein automatischer Bericht vorhanden. Der erste Lauf startet im Hintergrund nach diesem Login, laden Sie die Seite in ein paar Minuten neu." |
| CEO-Tagesübersicht, keine Änderung | `src/components/dashboard/tages-kopf.tsx` | „Keine Änderungen seit dem letzten Bericht." |
| CEO-Tagesübersicht, keine offenen Maßnahmen | `src/components/dashboard/tages-kacheln.tsx` | „Keine offenen Maßnahmen." |
| CEO-Tagesübersicht, keine offenen Punkte | `src/components/dashboard/tages-kacheln.tsx` | „Keine offenen Punkte aus dem letzten Bericht." |
| CEO-Tagesübersicht, ohne aktuelle Daten | `src/components/dashboard/tages-kacheln.tsx` | „Keine aktuellen Daten" |

### Benachrichtigungen und Synchronisierung

| Ort | Datei | Text |
|---|---|---|
| Glocke ohne neue Benachrichtigung | `src/components/dashboard/glocke.tsx` | „Keine neuen Benachrichtigungen." / „Alarme und Fristen sehen Sie weiterhin direkt in den Modulen." |
| Offline-Warteschlange leer | `src/components/dashboard/sync-status.tsx` | „Keine wartenden Einträge." |

### Standort

| Ort | Datei | Text |
|---|---|---|
| Keine Feldparzelle angelegt | `src/components/db/standort-ansicht.tsx` | „Noch keine Feldparzelle angelegt." |
| Keine Reihengruppe angelegt | `src/components/db/standort-ansicht.tsx` | „Noch keine Reihengruppe angelegt." |

### Pflückaufgaben

| Ort | Datei | Text |
|---|---|---|
| Liste ohne Pflückaufgaben | `src/components/db/pflueckaufgaben-liste.tsx` | „Noch keine Pflückaufgaben" / „Sobald Pflückaufgaben angelegt sind, stehen sie hier." — über die gemeinsame Komponente `LeererZustand` (`src/components/ui/liste.tsx`) |
| Liste, Filter ohne Treffer | `src/components/db/pflueckaufgaben-liste.tsx` | „Keine Treffer" / „Für diese Auswahl gibt es keine Pflückaufgaben." — ebenfalls über `LeererZustand` |
| Fotobeleg fehlt, Platzhalterbild | `src/components/db/pflueckaufgabe-detail.tsx` | „Platzhalterbild – noch kein Foto hochgeladen" |
| Fotobeleg fehlt, Freigabeschritt | `src/components/db/pflueckaufgabe-detail.tsx` | „Noch kein Fotobeleg. Ohne Beleg ist keine Freigabe möglich." |

### Kühlkette und Wetter

| Ort | Datei | Text |
|---|---|---|
| Keine Charge wartet auf Vorkühlung | `src/components/db/kuehlkette-ansicht.tsx` | „Aktuell wartet keine Charge auf die Vorkühlung." |
| Keine Kühlmessung erfasst | `src/components/db/kuehlkette-ansicht.tsx` | „Noch keine Kühlmessung erfasst." |
| Keine Wetterdaten erfasst | `src/components/db/wetter-ansicht.tsx` | „Noch keine Wetterdaten erfasst." |

### Finanzen und Lohn

| Ort | Datei | Text |
|---|---|---|
| Keine Buchung erfasst | `src/components/db/finanzen-ansicht.tsx` | „Noch keine Buchung erfasst." |
| Keine Charge mit Buchung im Zeitraum | `src/components/db/finanzen-ansicht.tsx` | „Keine Charge mit eigener Buchung in diesem Zeitraum." |
| Finanzvorschau, Monat noch nicht gebucht | `src/components/dashboard/startkarte-finanzen.tsx` | „Im {monat} wurde noch nichts gebucht." |
| Finanzvorschau, kein Vormonat zum Vergleich | `src/components/dashboard/startkarte-finanzen.tsx` | „Im Vormonat wurde nichts gebucht, es gibt nichts zu vergleichen." |
| Kein Lohnsatz hinterlegt | `src/components/db/lohn-ansicht.tsx` | „Noch kein Lohnsatz hinterlegt – ohne ihn lässt sich keine Periode berechnen." |
| Keine Abrechnung berechnet | `src/components/db/lohn-ansicht.tsx` | „Noch keine Abrechnung berechnet." |
| Keine Position berechnet | `src/components/db/lohn-ansicht.tsx` | „Noch keine Position berechnet." |
| Keine Monatsabzüge berechnet | `src/components/db/lohn-ansicht.tsx` | „Noch keine Monatsabzüge berechnet." |

### Zukauf und Abrechnung Nachbarbetriebe

| Ort | Datei | Text |
|---|---|---|
| Keine Zukaufposition erfasst | `src/components/db/zukauf-ansicht.tsx` | „Noch keine Zukaufposition erfasst." |
| Import ohne verwertbare Zeilen | `src/components/db/zukauf-ansicht.tsx` | „Die Eingabe enthält keine Zeilen." / „Keine verwertbare Datenzeile gefunden." |
| Keine Zukaufposition mit Preis | `src/components/db/zukauf-ansicht.tsx` | „Noch keine Zukaufposition mit eingetragenem Preis, aus der sich eine Abrechnung errechnen ließe." |

### Logistik: Touren, Lieferungen, B2B-Portal

| Ort | Datei | Text |
|---|---|---|
| Keine Tour geplant | `src/components/db/logistik-ansicht.tsx` | „Noch keine Tour geplant." |
| Keine Lieferung angelegt | `src/components/db/logistik-ansicht.tsx` | „Noch keine Lieferung angelegt." |
| Keine Lieferung erfasst (B2B-Portal) | `src/components/db/b2b-portal-ansicht.tsx` | „Noch keine Lieferung erfasst." |
| Keine Proforma-Rechnung möglich | `src/components/db/b2b-portal-ansicht.tsx` | „Noch keine zugestellte Lieferung, aus der sich eine Proforma errechnen ließe." |
| Keine gültige Preisliste hinterlegt | `src/components/db/b2b-portal-ansicht.tsx` | „Derzeit keine gültige Preisliste hinterlegt." |
| Keine Vorbestellung aufgegeben | `src/components/db/b2b-portal-ansicht.tsx` | „Noch keine Vorbestellung aufgegeben." |

### Preislisten und Sortenkatalog

| Ort | Datei | Text |
|---|---|---|
| Keine Preisliste angelegt | `src/components/db/preislisten-ansicht.tsx` | „Noch keine Preisliste angelegt." |
| Keine Position in der Preisliste | `src/components/db/preislisten-ansicht.tsx` | „Noch keine Position in dieser Preisliste." |
| Keine Sorte angelegt | `src/components/db/sortenkatalog-ansicht.tsx` | „Noch keine Sorte angelegt." |

### Personal und Einladungen

| Ort | Datei | Text |
|---|---|---|
| Keine geplanten Erntetage | `src/components/db/personal-ansicht.tsx` | „Keine geplanten Erntetage in den kommenden Tagen." |
| Keine Einsätze geplant | `src/components/db/personal-ansicht.tsx` | „Keine Einsätze in den kommenden Tagen geplant." |
| Keine Einladung ausgestellt | `src/components/db/einladungen-ansicht.tsx` | „Noch keine Einladung ausgestellt." |

### Reklamationen und Nachweiskette

| Ort | Datei | Text |
|---|---|---|
| Keine Reklamation erfasst | `src/components/db/reklamationen-ansicht.tsx` | „Noch keine Reklamation erfasst." |
| Detailbereich ohne Auswahl | `src/components/db/reklamationen-ansicht.tsx` | „Reklamation auswählen, um Details und Verlauf zu sehen." |
| Kein Eintrag im Verlauf | `src/components/db/reklamationen-ansicht.tsx` | „Noch kein Eintrag im Verlauf." |
| Aufgabe ohne Charge | `src/components/db/nachweiskette-ansicht.tsx` | „Zu dieser Aufgabe gehört noch keine Charge. Sie entsteht beim Anlegen der Pflückaufgabe." |

### QR-Ausweise und Pflichtschulungen

| Ort | Datei | Text |
|---|---|---|
| Keine Steige mit verknüpfter Charge | `src/components/db/qr-steigen-ansicht.tsx` | „Noch keine Steige mit verknüpfter Charge vorhanden." |
| Kein Pflücker erfasst | `src/components/db/qr-steigen-ansicht.tsx` | „Noch kein Pflücker erfasst." |
| Keine Pflichtschulung hinterlegt | `src/components/db/pflichtschulungen-ansicht.tsx` | „Keine Pflichtschulung hinterlegt." |

### Compliance und Prüfung

| Ort | Datei | Text | Hinweis |
|---|---|---|---|
| Keine offene Frist | `src/components/db/risiko-radar.tsx` | „Keine offene Frist – Steuer-, Arbeits- und Datenschutzrecht sind aktuell im Plan." | Erfolgszustand, nicht fehlende Daten |
| Kein protokollierter Vorgang | `src/components/db/compliance-ansicht.tsx` | „Noch kein protokollierter Vorgang." | |
| Prüfung ohne offene Punkte | `src/components/pruefung/pruefung-nachbereitung.tsx` | „Keine offenen Punkte: Die Prüfung hat weder Verstöße noch Lücken oder Hinweise ergeben." | Erfolgszustand, nicht fehlende Daten |

### Dokumente

| Ort | Datei | Text |
|---|---|---|
| Keine Datei hochgeladen | `src/components/db/dokumente-ansicht.tsx` | „keine Datei" |

### KI-Assistent

| Ort | Datei | Text |
|---|---|---|
| Chat ohne Verlauf | `src/components/db/ki-assistent-formulare.tsx` | „Noch keine Nachricht. Stellen Sie unten Ihre erste Frage." |
| Chat-Begrüßung | `src/components/ki/ki-chat.tsx` | „Wobei kann ich helfen?" |
| Diktat ohne Aufnahme | `src/components/ki/mikrofon.tsx` | „Nichts aufgenommen." |

### Öffentliche Herkunftsauskunft

| Ort | Datei | Text |
|---|---|---|
| Code ohne Auskunft | `src/app/[locale]/herkunft/[code]/page.tsx` | „Zu diesem Code gibt es keine Auskunft. Bitte die Schreibweise prüfen." |
| Auskunft ohne genannte Personen | `src/app/[locale]/herkunft/[code]/page.tsx` | „Diese Auskunft nennt keine Personen." |

## Randbefund: geteilte Komponente kaum genutzt

`src/components/ui/liste.tsx` enthält mit `LeererZustand` bereits eine fertige,
generische Empty-State-Komponente (gestrichelter Rahmen, Titel, optionaler Text, optionale
Aktion). Verwendet wird sie bislang nur in `pflueckaufgaben-liste.tsx`. Alle anderen rund 60
Leerzustände oben sind einzeln in ihrer jeweiligen Ansicht geschrieben, meist als einfacher
`<p>`-Text ohne den Rahmen von `LeererZustand`.

## Entscheidungen vom 28.09.2026

Getroffen von Erwin Moretz anhand des Canvas „Leerzustand-Vorschläge“ (A, B, C) und des One Pagers „Damicon Bewegungsmuster“.

| Frage | Entscheidung |
|---|---|
| Form, wo sich etwas anlegen lässt | C: Symbol des Moduls, Titel, Hinweis, Knopf zum Anlegen |
| Form der übrigen | B (Symbol, kein Knopf) bei berechneten Werten, Filtern und Daten von außen. A (nur Text) bei „alles erledigt“, fehlender Freigabe, KI-Begrüßung und Fehlermeldungen |
| Symbol | Eigenes Symbol je Modul aus `modules.ts`, in der Farbe des Bereichs |
| Bewegung | Atmen (2,6 s) und Wiegen (3,2 s), nur bei C |
| Übersetzungen | Claude legt alle vier Sprachen an, neue kasachische und russische Texte werden geprüft |
| Ladeanimationen | L2 Lichtstreif, L4 Drei Beeren, L6 laufender Ladebalken |
| Klickanimationen | K2 Welle, K3 Speichern mit Häkchen, K4 Zähler springt, K6 Klickdruck auf Karten |
| Haptik | Nur bei Ereignissen (Tippen, Erfolg, Ende eines langen Vorgangs, Fehler), kein Dauervibrieren. Android über die Vibration API, iPhone über den Schalter-Umweg mit einem Tick beim Tippen. Kein Schalter zum Abschalten. Kommt zusammen mit den Lade- und Klickanimationen |
| Reihenfolge | Standort zuerst, danach die übrigen 14 mit Knopf, dann die 47 ohne |
| Repo | Eigener Branch, Pull Request, WMC-Vibecode-Cleanup vor dem Merge |

## Einteilung der 62 Leerzustände

Grundlage ist, ob es an der Stelle eine Anlege-Aktion gibt (`src/lib/actions/*.ts`, `*-formulare.tsx`).

### C · mit Anlegen-Knopf (15)

| Stelle | Datei | Knopf |
|---|---|---|
| Standort, Feldparzelle | `standort-ansicht.tsx` | „Feldparzelle anlegen“ |
| Standort, Reihengruppe | `standort-ansicht.tsx` | „Reihengruppe anlegen“ |
| Pflückaufgaben | `pflueckaufgaben-liste.tsx` | „Pflückaufgabe anlegen“ |
| Finanzen, Buchung | `finanzen-ansicht.tsx` | „Buchung erfassen“ |
| Lohn, Lohnsatz | `lohn-ansicht.tsx` | „Lohnsatz hinterlegen“ |
| Zukauf | `zukauf-ansicht.tsx` | „Zukaufposition erfassen“ |
| Tourenplanung | `logistik-ansicht.tsx` | „Tour planen“ |
| Lieferungen | `logistik-ansicht.tsx` | „Lieferung anlegen“ |
| B2B-Portal, Vorbestellung | `b2b-portal-ansicht.tsx` | „Vorbestellung aufgeben“ |
| Preislisten | `preislisten-ansicht.tsx` | „Preisliste anlegen“ |
| Preisliste, Position | `preislisten-ansicht.tsx` | „Position hinzufügen“ |
| Sortenkatalog | `sortenkatalog-ansicht.tsx` | „Sorte anlegen“ |
| Einladungen | `einladungen-ansicht.tsx` | „Einladung ausstellen“ |
| Reklamationen | `reklamationen-ansicht.tsx` | „Reklamation erfassen“ |
| Dokumente | `dokumente-ansicht.tsx` | „Datei hochladen“ |

### B · Symbol ohne Knopf (27)

- Berechnete oder abgeleitete Werte (22): Kennzahl ohne Messung; CEO-Tagesübersicht ohne Bericht und ohne aktuelle Daten; Kühlkette ohne wartende Charge und ohne Messung; Finanzvorschau ohne Buchung und ohne Vormonat; Lohn ohne Abrechnung, ohne Position und ohne Monatsabzüge; Abrechnung Nachbarbetriebe; B2B-Portal ohne Lieferung und ohne Proforma; Personal ohne Bedarf und ohne Einsatzplan; Reklamation ohne Verlauf; Nachweiskette ohne Charge; QR-Etiketten; QR-Ausweise; Pflichtschulungen; Audit-Protokoll; Herkunftsauskunft ohne Personen.
- Filter und Auswahl (4): Suche ohne Treffer; Pflückaufgaben mit Filter ohne Treffer; Finanzen ohne Charge im Zeitraum; Reklamation nicht ausgewählt.
- Daten von außen (1): Wetter.

### A · nur Text (17)

- Alles erledigt (8): Startkarte Brigade; CEO ohne Änderung, ohne Maßnahmen, ohne offene Punkte; Benachrichtigungen; Synchronisierung; Risiko-Radar; Prüfung ohne offene Punkte.
- Fehlende Freigabe oder Konfiguration (4): Zone ohne Modul, Zone ohne Kennzahl, Bereich ohne Kennzahl, B2B ohne gültige Preisliste.
- KI-Begrüßung und Diktat (3): Chat ohne Verlauf, Chat-Begrüßung, Diktat ohne Aufnahme.
- Fehlermeldungen (2): Zukauf-Import ohne Zeilen, Herkunftscode ohne Auskunft.

### Bleibt wie heute (3)

Suchfeld vor der Eingabe, Platzhalterbild und fehlender Fotobeleg in der Pflückaufgabe. Das sind keine Listen-Leerzustände.

## Umsetzung Standort (Branch `feat/leerzustand-aktion`)

Im Katalog standen für den Standort zwei Hinweise: „Noch keine Feldparzelle angelegt.“ und „Noch keine Reihengruppe angelegt.“. Im Code sind das Zeilen im Standortbaum, eine je Plantage oder Parzelle. Eine große Karte mit Knopf in jeder Plantage wäre zu schwer, deshalb bekommen beide einen Textlink zum passenden Formular unten auf der Seite.

Die Form C steht dort, wo der ganze Baum leer ist. Gab es noch keine Plantage, zeigte der Standortbaum bisher nichts. Dafür gibt es jetzt „Noch keine Plantage angelegt.“ mit dem Kartensymbol des Moduls und dem Knopf „Plantage anlegen“. Knopf und Links springen zum jeweiligen Formular, das als Sprungziel markiert ist. Ohne Anlegerecht fehlen Knopf und Links, und das Abzeichen steht still.

Vorschau in Hell und Dunkel: `standort-vorschau.png` (mit Tailwind aus `globals.css` erzeugt, Schriften nicht aus `next/font`).

Neue Texte zur Prüfung in `kk.json` und `ru.json`: `standortVerwaltung.leer.plantagen`, `plantagenText`, `plantageAnlegen`, `parzelleAnlegen`, `reihengruppeAnlegen`.

## Umsetzung der übrigen Stellen mit Knopf

Elf weitere Leerzustände zeigen jetzt Vorschlag C: Pflückaufgaben, Finanzen (Buchungen), Lohn (Lohnsatz), Zukauf, Lieferungen, Touren, B2B-Portal (Vorbestellungen), Preislisten, Sortenkatalog, Einladungen und Reklamationen. Der Knopf trägt den Titel des Formulars, zu dem er führt, etwa „Lieferung anlegen“ oder „Reklamation melden“. Diese Texte gibt es schon in allen vier Sprachen, neue Übersetzungen waren nicht nötig. Nur der Lohn-Hinweis ist jetzt in Titel und Satz geteilt, gebildet aus den vorhandenen Übersetzungen.

Zwei Stellen aus der Liste mit Knopf bleiben Text:

- Preisliste ohne Position: Der Hinweis steht innerhalb einer Preisliste direkt über deren Formular zum Hinzufügen. Ein Knopf dorthin wäre ein Sprung um eine Zeile.
- Dokumente, „keine Datei“: Das ist eine Tabellenzelle, kein Leerzustand. Die Dokumentenliste hat bisher gar keinen Leerzustand. Das wäre ein eigener Punkt.

Technik: Der Knopf ist `ZumFormular` (`src/components/ui/zum-formular.tsx`), ein Anker auf die Formularkarte mit der id aus `src/lib/formular-ziele.ts`. Mit JavaScript klappt er einen Aufklapper auf (Pflückaufgaben, Finanzen) und setzt den Fokus ins erste Feld. Symbol und Farbe kommen über `modulSymbol()` aus `src/lib/modules.ts`.

Vorschau aller elf in Hell und Dunkel: `anlegen-vorschau.png`.

Beobachtung zur Farbe: Der Bereich Markt hat als Farbe `--warning`. Im Leerzustand von Preislisten, Sortenkatalog, B2B-Portal, Reklamationen und Zukauf steht das Symbol deshalb in Warnfarbe. Im Menü fällt das weniger auf als hier, wo nur das eine Symbol auf der Fläche steht.

## Offene Punkte

- Standortbaum: Erwin Moretz hält eine bessere Gestaltung des Baums für später fest (28.09.2026).
- Die 47 Leerzustände ohne Knopf (Formen A und B) folgen als nächste Stufe.
- Lade- und Klickanimationen mit Haptik folgen danach.
