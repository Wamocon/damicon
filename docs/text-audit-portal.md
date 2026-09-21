# Textprüfung Damicon-Portal

Stand 21.09.2026.

**Prüffrage:** Sagen die Texte im Portal etwas über den Betrieb, oder sagen sie etwas über das Projekt, das das Portal baut?

**Methode:**

- `src/messages/de.json` vollständig gelesen: 2385 Textbausteine
- Jede Fundstelle im Code nachverfolgt, um gerenderten von totem Text zu trennen
- Laufendes Portal unter `localhost:3000` in zwei Rollen bedient: Betriebsleitung und Pflücker
- Gegenprobe in `en.json`, `ru.json`, `kk.json`: jeder hier genannte Text steht in allen vier Sprachen

**Kurzbefund:**

- Die operativen Texte sind gut. Fehlermeldungen, Formularhilfen, Spaltenköpfe und die rechtlichen Hinweise im Lohn- und Stammdaten-Modul sind aus dem Betrieb heraus geschrieben.
- Darüber liegt eine zweite Textschicht, die den Bauzustand des Projekts beschreibt: Meilensteine mit Fälligkeitsdaten, Reifegrade, eine Migrations-Einstufung je Modul, Anforderungsnummern und eine Jira-Kennung.
- Umfang dieser Schicht: rund 59 Textbausteine je Sprache, also etwa 236 übersetzte Zeichenketten.
- Sie steht nicht am Rand, sondern auf der Startseite, auf jeder Bereichsseite und im Kopf jeder Modulseite.

**Nicht geprüft:**

- Die öffentliche Website im Detail (dort sind Prototyp-Hinweise gewollt, siehe Punkt 16)
- Die Texte des KI-Assistenten im Gesprächsverlauf
- Die PDF-Ausgabe der Prüfung
- Rechtschreibung und Grammatik über den einen unter Punkt 15 genannten Fall hinaus

## Überblick

| # | Punkt | Wer sieht es | Gewicht |
|---|---|---|---|
| 1 | Der Portalstart endet in einem Projektplan | alle Rollen | sehr hoch |
| 2 | Die Kennzahlen-Sektion erklärt den Bauzustand statt den Betrieb | alle Rollen | sehr hoch |
| 3 | „Übernehmen / Anpassen / Neu bauen“ auf jeder Modulkarte | alle Rollen | hoch |
| 4 | Widerspruch zwischen Modulbeschreibung und Statuspille | alle Rollen | hoch |
| 5 | Drei Modulseiten widersprechen sich über die Wetteranbindung | Feld, Büro | hoch |
| 6 | Anforderungsnummern und eine Jira-Kennung im sichtbaren Text | alle Rollen | hoch |
| 7 | Die Seiten der zwei unfertigen Module sind Projektsteckbriefe | alle Rollen | mittel |
| 8 | „Meilenstein B“ ist seit dem 19.09. überfällig | alle Rollen | mittel |
| 9 | „Datenbank angebunden“ steht auf 24 von 26 Karten | alle Rollen | mittel |
| 10 | Konzeptsätze als Modulbeschreibung | alle Rollen | mittel |
| 11 | Technik statt Sache in Hinweisen und Fehlermeldungen | alle Rollen | mittel |
| 12 | Beschreibung und „Geplanter Umfang“ sagen dasselbe | Büro, Markt | niedrig |
| 13 | Der Begleiter bietet Hilfe auf leeren Seiten an | alle Rollen | niedrig |
| 14 | 136 übersetzte Zeichenketten werden nie gerendert | niemand | niedrig |
| 15 | „Qualitaetssortierung“ ohne Umlaut | Büro | niedrig |
| 16 | Die öffentliche Seite meldet „0 als bedienbare Demo“ | Besucher | niedrig |

## 1. Der Portalstart endet in einem Projektplan

- **Fundstelle:** `src/components/dashboard/home.tsx:311-354`, Texte in `src/messages/de.json:339-360`
- **Gewicht:** sehr hoch
- **Beleg:** `docs/design/text-audit-2026-09-21/portalstart-pfluecker.png`

**Was dort steht:**

- Unter den Kennzahlen und den vier Zonen folgt auf `/dashboard` ein Abschnitt „Meilensteine der internen Vorbereitung“ mit zwei Karten.
- Meilenstein A („Prototyp mit Optik und Funktionsumfang“, grüne Pille „bis 06.09.2026“) listet unter anderem „Design-Token-Umstellung auf die Palette ‚Kök & Altyn‘“ und „Landingpage mit Platzhaltertexten und -bildern“.
- Meilenstein B („spätestens 19.09.2026“) listet sieben Arbeitspakete.
- Schlusssatz: „Alle Hauptfunktionen sind an die Datenbank angebunden: Anmeldung, Rollenrechte über Row Level Security, …“

**Wer es sieht:**

- Alle Rollen. Der Abschnitt ist an keine Berechtigung gebunden.
- Ein Pflücker bekommt ihn auf dem Telefon genauso wie die Administration.

**Warum es stört:**

- „Row Level Security“ und „Design-Token“ sind keine Begriffe aus dem Himbeeranbau.
- Der Fortschritt eines Softwareprojekts ist keine Information, mit der sich eine Schicht planen lässt.
- „Landingpage mit Platzhaltertexten und -bildern“ sagt dem Kunden im eigenen Produkt, dass die Website mit Platzhaltern gefüllt ist.
- „Meilensteine der internen Vorbereitung“ macht den Leser zum Außenstehenden eines Projekts, das er bezahlt.

**Empfehlung:**

- Abschnitt aus dem Portal entfernen.
- Entweder in einen Bereich verschieben, den nur `admin` sieht, oder auf die öffentliche Seite, wo die Prototyp-Sprache ohnehin steht.
- Ersparnis: 18 Textbausteine je Sprache, 72 insgesamt.

## 2. Die Kennzahlen-Sektion erklärt den Bauzustand statt den Betrieb

- **Fundstelle:** `src/components/dashboard/home.tsx:166-199`, Texte in `src/messages/de.json:329-331, 361-364, 1995-1998`
- **Gewicht:** sehr hoch

**Was dort steht:**

- Überschrift „14 Baseline-Kennzahlen“, darunter „Werden am 01.10.2026 mit dem Kunden als Baseline unterschrieben.“
- Zählzeile für die Betriebsleitung: „8 aus echten Daten gerechnet · 6 warten auf die Funktion dahinter“.
- Zählzeile für den Pflücker: „0 heute messbar · 0 Erfassung fehlt · 0 Funktion fehlt · 0 rechtlich ungeklärt“, gefolgt von der Überschrift „14 Baseline-Kennzahlen“ ohne eine einzige Kachel darunter.
- Rechts zwei Pillen nebeneinander: „Live-Daten“ und „Platzhalterwerte“.
- Am Fuß jeder Kachel ein Bauzustand statt eines Datenstands: „Funktion fehlt“, „Erfassung fehlt“, „heute messbar“.
- Im Tooltip jeder Kachel steht, was dafür noch gebaut werden muss (`kpis.*.braucht`).

**Warum es stört:**

- Der Leser ist der Kunde. Das Portal spricht über ihn in der dritten Person.
- „Platzhalterwerte“ ist fest verdrahtet (`home.tsx:186`) und erscheint auch dann, wenn acht Kennzahlen aus echten Datensätzen gerechnet sind. Die beiden Pillen widersprechen sich.
- Beim Pflücker verspricht die Überschrift 14 Kennzahlen und liefert keine.
- Der Tooltip ist Backlog an der Stelle, an der ein Nutzer fragt: Ist diese Zahl von heute?

**Empfehlung:**

- Fußzeile der Kacheln umstellen: nicht „Funktion fehlt“, sondern „noch keine Daten“ oder „Stand: heute, 14:20“.
- Die Badge „Platzhalterwerte“ an den Einzelwert koppeln statt an die Sektion.
- Die Zählzeile über den Bauzustand streichen.

## 3. „Übernehmen / Anpassen / Neu bauen“ auf jeder Modulkarte

- **Fundstelle:** `src/components/dashboard/module-meta.tsx:15-18`, Texte in `src/messages/de.json:397-399`
- **Gewicht:** hoch
- **Beleg:** `docs/design/text-audit-2026-09-21/bereichsseite-hof.png`

**Was dort steht:**

- Jede Modulkarte auf einer Bereichsseite und jeder Modulseitenkopf trägt eine Pille mit einem dieser drei Wörter.
- Verteilung: 13-mal „Anpassen“, 9-mal „Neu bauen“, 4-mal „Übernehmen“.

**Warum es stört:**

- Die Wörter stammen aus der Migrationsanalyse und beantworten, ob eine Funktion vom Altsystem übernommen, angepasst oder neu gebaut werden sollte. Für den Betrieb ist das folgenlos.
- Auf der Bereichsseite steht die Pille unten links, direkt gegenüber dem Link „Öffnen →“. Zwei Verben nebeneinander, eines davon ausführbar.
- „Neu bauen“ und „Anpassen“ lesen sich dort als Schaltflächen. Wer darauf klickt, landet im Modul, weil die ganze Karte ein Link ist, und wird den Zusammenhang nicht verstehen.

**Empfehlung:**

- Pille ersatzlos entfernen.

## 4. Widerspruch zwischen Modulbeschreibung und Statuspille

- **Fundstelle:** `src/messages/de.json:622` und `671`, Pillen aus `src/lib/modules.ts:162-176`
- **Gewicht:** hoch
- **Art:** sachlicher Fehler

**Was dort steht:**

- Modulseite „Elektronischer Lieferschein (ЭСФ)“: Beschreibung „Angebunden an das staatliche ЭСФ-System, keine eigene Buchhaltung“, daneben die Pille „In Entwicklung“, darunter als geplanter Umfang „Anbindung an das ИС ЭСФ“.
- Modulseite „Staatliche Integrationen“: „Konnektoren zu ЭСФ, virtuellem Lagerbestand, ЕСУТД und den Förderportalen gosagro.kz und qoldau.kz“ im Präsens, daneben „In Entwicklung“.

**Warum es stört:**

- Drei Aussagen auf einem Bildschirm: angebunden, in Entwicklung, Anbindung geplant.
- Das sind die beiden einzigen Module mit der Pille „In Entwicklung“. Beide widersprechen ihrer eigenen Beschreibung.

**Empfehlung:**

- Beide Beschreibungen in eine Absichtsform setzen, solange die Anbindung nicht steht.
- Unabhängig von allen anderen Punkten korrigieren, weil es ein Fehler ist und keine Geschmacksfrage.

## 5. Drei Modulseiten widersprechen sich über die Wetteranbindung

- **Fundstelle:** `src/messages/de.json:479` (Rotationsplan), `2813` (Pflückerstamm), `594` (Wetter), `2986` (Pflanzenschutzprotokoll)
- **Gewicht:** hoch
- **Art:** sachlicher Fehler

**Der tatsächliche Stand:**

- Das Wetter-Modul ist angebunden (`src/lib/modules.ts:107`).
- Es zeigt eine Temperatursumme über 5 °C Basistemperatur und holt die Daten von Open-Meteo.
- Verifiziert unter `/de/dashboard/feld/wetter`.

**Was das Portal trotzdem behauptet:**

- Am Fuß des Rotationsplans: „die Wetteranbindung (Temperatursummenrechnung) ist selbst noch nicht gebaut“. Falsch, wird live gerendert.
- Am Fuß des Pflückerstamms: „die Wetteranbindung (Anforderung 2.13) ist zurückgestellt“. Falsch, wird live gerendert.
- Im Kopf der Wetterseite: „Bewusst kein maschinelles Lernen in Phase 1 – eine erklärbare Heuristik reicht.“ Eine Entwurfsentscheidung, an einen Gutachter gerichtet.
- Im Pflanzenschutzprotokoll, gleiche Kategorie: „Der Protokoll-Upload ist noch nicht gebaut: die Spalte für das Protokolldokument bleibt vorerst leer.“

**Empfehlung:**

- Die zwei falschen Wetter-Hinweise streichen oder umschreiben.
- „Phase 1“ und „bewusst kein maschinelles Lernen“ aus dem Seitenkopf nehmen.
- Unabhängig von allen anderen Punkten korrigieren.

## 6. Anforderungsnummern und eine Jira-Kennung im sichtbaren Text

- **Fundstelle:** `src/messages/de.json:547, 293, 308, 610, 679, 2813`
- **Gewicht:** hoch

**Die Jira-Kennung:**

- Tooltip der Kennzahl „Abdeckung der Saisonkräfte in ЕСУТД“: „rechtliche Bestätigung der ЕСУТД-Pflicht über enbek.kz (siehe WMCNL-1447) – Anbindungspunkt benannt, Rechtsprüfung der Pflicht selbst steht noch aus“.
- Die Kennung steht so auch in `en.json`, `ru.json` und `kk.json`.
- Ein Nutzer in Almaty kann dieses Ticket nicht öffnen.

**Die Anforderungsnummern, sichtbar:**

- Sicherheitsseite: „Mehrfaktor-Authentifizierung (Anforderung 4.9)“
- Sicherheitsseite: „ist Pflicht für Anforderung 4.9, ihre Durchsetzung je Rolle ist ein späterer Ausbauschritt“
- Fördermittel: „Fristenmonitor und Nachweisdokumente je Dossier sind angebunden (Anforderung 4.12)“
- Pflückerstamm: „die Wetteranbindung (Anforderung 2.13) ist zurückgestellt“

**Die Anforderungsnummer, derzeit nicht sichtbar:**

- Abholrunden: „Tourenliste je Fahrzeug und Zeitfenster (Anforderung 3.5 Teil 1) fehlen noch“ (`modules.logistik.todo`, wird nicht gerendert, siehe Punkt 14)

**Warum es stört:**

- Die Nummern sind ohne das Analysedokument bedeutungslos.
- Wer das Dokument hat, braucht sie nicht in der Oberfläche.

**Empfehlung:**

- Ersatzlos streichen. Die Aussage dahinter bleibt jeweils verständlich, wenn man die Klammer entfernt.

## 7. Die Seiten der zwei unfertigen Module sind Projektsteckbriefe

- **Fundstelle:** `src/components/dashboard/module-meta.tsx:43-93`, Texte in `src/messages/de.json:407-411`
- **Gewicht:** mittel
- **Beleg:** `docs/design/text-audit-2026-09-21/modulseite-lieferschein-esf.png`

**Was dort steht:**

- Wer `/dashboard/hof/lieferschein-esf` oder `/dashboard/buero/integrationen` öffnet, bekommt eine Karte mit der Überschrift „Unterfunktion – in Entwicklung“.
- Darunter drei Felder: „Geplanter Umfang“, „Einstufung“, „Meilenstein“.

**Warum es stört:**

- „Unterfunktion“ ist ein Begriff aus der Projektgliederung. Für den Nutzer ist es ein Menüpunkt wie jeder andere, und er wurde nicht als untergeordnet angekündigt.
- „Einstufung“ wiederholt nur die Pille aus Punkt 3.
- „Meilenstein“ trägt auf beiden Seiten denselben fest verdrahteten Text und hängt an keinem Modul.

**Empfehlung:**

- Karte auf einen Satz reduzieren: was das Modul können wird, und dass es noch nicht verfügbar ist.
- Die drei Felder entfallen.

## 8. „Meilenstein B“ ist seit dem 19.09. überfällig

- **Fundstelle:** `src/messages/de.json:411` und `350`
- **Gewicht:** mittel

**Was dort steht:**

- Auf beiden Platzhalterseiten unter „Meilenstein“: „Meilenstein B und folgende Ausbaustufen“.
- Auf der Startseite das Fälligkeitsdatum dieses Meilensteins: „spätestens 19.09.2026“, in grüner Pille, als sei er erreicht.

**Warum es stört:**

- Heute ist der 21.09.2026. Das Portal verspricht zwei Funktionen für einen Termin, der zwei Tage zurückliegt.
- Jedes datumsgebundene Versprechen in der Oberfläche altert so, und niemand wird es pflegen.

**Empfehlung:**

- Datumsangaben aus der Oberfläche nehmen, nicht aktualisieren.

## 9. „Datenbank angebunden“ steht auf 24 von 26 Karten

- **Fundstelle:** `src/components/dashboard/module-meta.tsx:20-39`, Texte in `src/messages/de.json:402-404`
- **Gewicht:** mittel

**Verteilung der drei Werte:**

- „angebunden“: 24 Module
- „in-entwicklung“: 2 Module
- „demo“: kommt in `src/lib/modules.ts` überhaupt nicht mehr vor

**Warum es stört:**

- Eine Pille, die auf 92 % der Karten dasselbe sagt, ist Dekoration. Sie kostet auf jeder Karte Platz und lenkt den Blick vom Modulnamen weg.
- Dasselbe gilt für die Zählpillen auf den Zonenkarten der Startseite („6 angebunden“, „3 angebunden“). Sie zählen fast immer die Module der Zone, die darüber schon einzeln aufgelistet sind.
- Der Wert „Demo bedienbar“ (`:403`) ist in vier Sprachen übersetzt und wird nie angezeigt. Ebenso der Text „{count} Demo“ auf der Startseite (`:336`).

**Empfehlung:**

- Pille nur an den zwei nicht verfügbaren Modulen zeigen, sonst weglassen.
- Den Wert „demo“ aus Typ und Katalog entfernen.

## 10. Konzeptsätze als Modulbeschreibung

- **Fundstelle:** `src/messages/de.json:567, 588, 602, 630`
- **Gewicht:** mittel

**Wo der Text erscheint:**

- Der `summary`-Text eines Moduls steht auf der Bereichsseite als Kartentext, also dort, wo ein Nutzer liest, was ihn hinter dem Link erwartet.

**Was dort stattdessen steht:**

- Kühlkette: „Der Baustein, an dem der gesamte Preisspread hängt.“
- Rotationsplan: „Die erste Funktion, die gebaut wird. Das Planungsproblem ist nicht die Prognose, sondern die Rotation über sechs Wochen.“
- Reihenblöcke: „Zustandsautomat je Reihenblock.“
- Rollen und Rechte: „Rollen als klare Datenstruktur über Ressourcen mal Aktionen. Neue Rollen ohne Eingriff in die Logik.“

**Dieselbe Herkunft, am Fuß der Modulseiten:**

- „Der wartezeitgesperrte Block ist der am einfachsten prüfbare Nutzen des Systems“ (`:764`, gerendert in `src/components/db/reihenbloecke-ansicht.tsx:223`)
- „Die Feldkarte … ist die Basis für Rotationsplan, Ernteerfassung und Deckungsbeitrag“ (`:1098`, gerendert in `src/components/db/standort-ansicht.tsx:158`)

**Warum es stört:**

- „Baustein“, „die erste Funktion, die gebaut wird“ und „Datenstruktur“ beschreiben die Software, nicht die Arbeit.
- „Zustandsautomat“ ist ein Begriff aus der Informatik.
- Die Sätze stammen erkennbar aus dem Pitch und dem Analysedokument, wo sie am richtigen Platz waren. Sie erklären den Wert des Systems, nicht die Ansicht vor dem Leser.

**Empfehlung:**

- Etwa zwölf Stellen einzeln durchgehen, jeweils mit der Frage: Beantwortet der Satz, was ich auf dieser Seite tun kann?
- Wenn nicht, gehört er ins Handbuch.

## 11. Technik statt Sache in Hinweisen und Fehlermeldungen

- **Fundstelle:** `src/messages/de.json:893, 318, 1071, 1177, 890, 615`
- **Gewicht:** mittel

**Die Fehlermeldung mit dem größten Schaden:**

- „Vorgang fehlgeschlagen. Details stehen im Server-Log.“ (`:893`)
- Der Nutzer hat keinen Zugang zum Server-Log. Der Satz sagt ihm nur, dass die Auskunft woanders liegt.

**Weitere Stellen, an denen die Umsetzung statt der Sache erklärt wird:**

- „Angebunden an die Supabase-Datenbank, gelesen unter den RLS-Rechten Ihrer Rolle.“ (`:318`)
- „Die Sperre wird von einem Datenbank-Trigger gesetzt und lässt sich nicht per Statuswechsel umgehen.“ (`:1071`)
- „Buchungen sind unveränderlich; die Datenbank verweigert UPDATE und DELETE auf dem Finanzjournal unabhängig von der Oberfläche.“ (`:1177`)
- „Der gewählte Bezugsdatensatz existiert nicht.“ (`:890`)
- „alle serverseitig als SVG erzeugt und über die Browser-Druckfunktion druckfertig“ (`:615`)

**Einordnung:**

- Die Absicht ist gut. Diese Sätze sollen zeigen, dass eine Regel hart ist und nicht nur in der Maske sitzt.
- Das lässt sich ohne Produktnamen und SQL-Schlüsselwörter sagen.
- Vorbild steht zwei Zeilen weiter oben im selben Modul: „Eine gebuchte Zeile lässt sich nicht mehr ändern, nur durch eine Gegenbuchung korrigieren.“

**Empfehlung:**

- Die sechs Sätze umschreiben, die Aussage behalten.
- Bei `:893` zusätzlich eine Handlungsanweisung ergänzen, etwa den Hinweis auf einen erneuten Versuch.

## 12. Beschreibung und „Geplanter Umfang“ sagen dasselbe

- **Fundstelle:** `src/messages/de.json:657/659` (Dokumente), `699/701` (Preislisten), `707/708` (Aggregator)
- **Gewicht:** niedrig

**Die Dubletten:**

- Dokumente: beschrieben als „verknüpft mit Reihenblock und Charge“, offen laut `todo`: „Verknüpfung mit Reihenblock und Charge“
- Preislisten: beschrieben als „Versionierte Preislisten mit Staffelpreisen je Kundengruppe und Gültigkeitszeitraum“, offen: „Versionierte Preislisten, Staffelpreise, Gültigkeitszeiträume, Kundenzuordnung“
- Aggregator: `summary` und `todo` unterscheiden sich in zwei Wörtern

**Einordnung:**

- Sichtbar wird das derzeit nicht, weil `todo` nur auf den zwei Platzhalterseiten gerendert wird.
- Es zeigt aber, dass die drei Textfelder je Modul (`description`, `summary`, `todo`) nicht mehr auseinandergehalten werden.

**Empfehlung:**

- Zusammen mit Punkt 14 lösen: `todo` entweder streichen oder auf die zwei Module begrenzen, die es brauchen.

## 13. Der Begleiter bietet Hilfe auf leeren Seiten an

- **Fundstelle:** `src/messages/de.json:1634`
- **Gewicht:** niedrig
- **Beleg:** `docs/design/text-audit-2026-09-21/modulseite-lieferschein-esf.png`

**Was passiert:**

- DamiAI fragt beim Öffnen eines Moduls: „Du bist bei ‚{bereich}‘. Soll ich dir zeigen, was du hier tun kannst?“
- Auf `/dashboard/hof/lieferschein-esf` erscheint diese Frage über einer Seite, auf der man nichts tun kann.
- Im Screenshot stehen beide gleichzeitig im Bild.

**Empfehlung:**

- Die Frage an den Modulstatus koppeln und auf Platzhalterseiten unterdrücken.

## 14. 136 übersetzte Zeichenketten werden nie gerendert

- **Gewicht:** niedrig

**Namensräume ohne Fundstelle im Code:**

- `personalDemo`: 16 Bausteine
- `pflanzenschutzDemo`: 13 Bausteine
- `qrSteigenMock`: 4 Bausteine
- `pflueckaufgabenDemo.addProof` mit dem Text „Beleg aufnehmen (Mock)“ (`:774`): 1 Baustein

**Rechnung:**

- 34 Bausteine je Sprache, also 136 übersetzte Zeichenketten, die niemand sieht.

**Dazu kommt:**

- 24 der 26 `modules.*.todo`-Texte. Gerendert werden nur die der beiden Platzhaltermodule.
- Wer künftig ein Modul auf „in Entwicklung“ setzt, bekommt einen Text angezeigt, den seit Monaten niemand gegengelesen hat.

**Empfehlung:**

- Die drei toten Namensräume aus allen vier Katalogen löschen.
- Für `todo` entscheiden, ob das Feld bleibt; wenn ja, die 24 ungenutzten Texte einmal gegenlesen.

## 15. „Qualitaetssortierung“ ohne Umlaut

- **Fundstelle:** `src/messages/de.json:497`
- **Gewicht:** niedrig

**Was dort steht:**

- Tooltip der Kennzahl „Anteil vermarktungsfähiger Schalen“: „Qualitaetssortierung je Schale“.

**Einordnung:**

- Einziger Fall dieser Art im deutschen Katalog.
- `npm run test:umlaute` greift ihn nicht ab.

**Empfehlung:**

- Wort korrigieren, Prüfung im Umlaut-Test ergänzen.

## 16. Die öffentliche Seite meldet „0 als bedienbare Demo“

- **Fundstelle:** `src/components/site/fragen.tsx:19-26`, Text in `src/messages/de.json:218`
- **Gewicht:** niedrig

**Was dort steht:**

- Die FAQ-Antwort auf „Was ist heute schon gebaut?“ wird aus der Modulliste gerechnet.
- Sie lautet derzeit: „26 Module in vier Bereichen: 24 an der Datenbank mit echten Schreibvorgängen, 0 als bedienbare Demo, 2 als sichtbare Menüpunkte in Entwicklung.“

**Warum es stört:**

- Die Null im Fließtext ist die Folge davon, dass der Reifegrad „demo“ nicht mehr vergeben wird (Punkt 9).
- Der Kommentar über der Funktion zeigt, dass diese Zahlen schon einmal auseinandergelaufen sind und deshalb berechnet statt geschrieben werden. Die Rechnung deckt aber den Fall nicht ab, dass ein Wert gar nicht mehr vorkommt.

**Was auf der öffentlichen Seite richtig ist und bleiben soll:**

- „Interner Proof-of-Concept. Kein vertraglich zugesicherter Leistungsumfang“ im Seitenfuß
- Der Hinweis auf Platzhalterbilder
- Der Haftungsvorbehalt in `legal.prototypeDisclaimer`
- Begründung: Das ist ein Vorbehalt gegenüber einem Besucher und gehört dorthin. Im Portal, hinter der Anmeldung, arbeitet dagegen jemand.

**Empfehlung:**

- Zählwerte mit 0 in der Antwort auslassen.

## Was trägt

Der größere Teil des Katalogs ist sachlich und am Betrieb ausgerichtet.

**Fehlermeldungen (`aktionen.fehler.*`) nennen Ursache und nächsten Schritt in der Sprache des Betriebs:**

- „Reihenblock {wert} ist wartezeitgesperrt – keine Pflückaufgabe möglich“
- „Die Prüfziffer stimmt nicht. Meist steckt ein Zahlendreher in der Nummer“
- „Wer eine Steige erfasst hat, kontrolliert sie nicht selbst“
- „Die Geräteuhr weicht zu stark von der Serverzeit ab“
- Bis auf die zwei unter Punkt 11 genannten Ausnahmen durchgehend gut

**Rechtliche Hinweise grenzen sorgfältig ab, statt Sicherheit zu behaupten:**

- Näherungsvorbehalt bei ОПВ/ВОСМС/ИПН im Lohn-Modul
- Abgrenzung der beiden Qualitätsfaktoren
- Hinweis, dass die Anmeldung zum horizontalen Monitoring ein eigener Antrag bei der Steuerbehörde ist
- Vorbehalt zu Koordinaten und Basistemperatur im Wetter-Modul

**Weitere Stärken:**

- Formularhilfen, Spaltenköpfe und Statuswerte sind knapp und eindeutig.
- Die Rollentrennung im Text ist sauber gelöst: im Demo-Betrieb „Demo-Rolle wechseln“, im angemeldeten Betrieb „Ansicht als Rolle – ändert nur die Darstellung, die Schreibrechte richten sich weiter nach Ihrem Profil“.
- Die Demo-Zugänge auf der Anmeldeseite sind über `NODE_ENV` und ein Flag abgesichert (`src/app/[locale]/login/page.tsx:23-28`).

## Stand der Umsetzung

Stand 21.09.2026, Branch `ui/portal-texte-bereinigen`, Ticket WMCNL-2398.

**Die Zeilenangaben oben stimmen nicht mehr.** Der Bericht entstand auf `ui/karten-und-feinschliff` über main `bda9cb7`. Seither hat der Umbau der Übersicht die Startseite in `begruessung.tsx`, `zonen-box.tsx` und `kennzahl-box.tsx` zerlegt, und in `de.json` verschieben sich die Zeilen ab etwa 390 um +33 bis +50. Wer einen Befund nachschlägt, sucht über den Textinhalt, nicht über die Zeile.

**Punkt 2 war beim Nacharbeiten schon zur Hälfte erledigt.** Die Kennzahlkachel zeigt Zielwert und Zielstand statt „Funktion fehlt“, die Überschrift „14 Baseline-Kennzahlen“ und die Zählzeile werden nicht mehr gerendert, und die Badge „Platzhalterwerte“ hängt am Einzelwert statt an der Sektion. Übrig war nur, die toten Schlüssel zu entfernen.

**Zwei Aussagen des Berichts waren falsch:**

- `modules.*.todo` ist nicht tot. `src/lib/ai/tools.ts` reicht den Text als `nochOffen` an DamiAI durch, alle 26 erreichen also Nutzer. Damit war auch „Anforderung 3.5 Teil 1“ sichtbar, nicht nur latent.
- Der Reifegrad „demo“ wurde angezeigt: `src/components/site/modul-reiter.tsx` führte ihn in der Legende der öffentlichen Seite, weil `REIFE_TON` als `Record<string, string>` getippt war und der fehlende Wert deshalb weder dem Compiler noch einem Test auffiel.

**Was der Bericht nicht hat und mitgegangen ist:**

- Zwei weitere Anforderungsnummern im sichtbaren Text: `rollenDemo.catiRole.keine` (7.1) und `finanzenAnsicht.uebersichtLead` (4.1).
- Zwei weitere Umlautfälle, gefunden mit dem neuen Katalogscan in `supabase/tests/umlaute.ts`: „befuellen“ und „heisst“.
- Ein sechster toter Namensraum, `schulungenDemo`, dazu `kpiHerkunft` und die 14 `kpis.*.braucht`.
- Fünf `todo`-Texte widersprachen dem Funktionsstand, und `modules.schulungen.summary` versprach Videos, wo eine bebilderte Kurzeinarbeitung steht.

**Offen geblieben:** `landing.kpiEyebrow` nennt weiter „Baseline 01.10.2026“. Das steht vor der Anmeldung und richtet sich an einen Besucher, fällt also unter Punkt 16 und bleibt bis auf Widerruf.

## Vorschlag

**Das Grundproblem:**

- Die Trennlinie liegt nicht zwischen guten und schlechten Texten, sondern zwischen zwei Lesern.
- Der eine entscheidet über das Projekt und will wissen, was gebaut ist.
- Der andere arbeitet mit dem Ergebnis und will wissen, was heute zu tun ist.
- Zurzeit bekommen beide denselben Text.

**Reihenfolge der Umsetzung:**

1. Zuerst die Fehler (Punkte 4 und 5): die zwei falschen Wetter-Hinweise, die beiden Modulbeschreibungen im Präsens für unfertige Module. Unabhängig von allem anderen, weil es keine Geschmacksfrage ist.
2. Dann streichen (Punkte 1, 6, 8): Meilenstein-Abschnitt, Anforderungsnummern, Jira-Kennung, Datumsangaben. Ersatzloses Entfernen, kein Ersatztext nötig.
3. Dann die Meta-Angaben je Modul reduzieren (Punkte 3, 7, 9): von drei Pillen auf eine. Für den Betrieb zählt allein, ob ein Menüpunkt schon etwas tut. Eine Pille „noch nicht verfügbar“ an den zwei betroffenen Modulen reicht.
4. Dann umschreiben (Punkte 2, 10, 11): Kennzahlen-Fußzeilen, Konzeptsätze, technische Hinweise. Hier braucht jede Stelle eine eigene Entscheidung.
5. Zuletzt aufräumen (Punkte 12, 13, 14, 15, 16): toter Text, Umlaut, Null im FAQ, Begleiter auf Platzhalterseiten.

**Nebeneffekt:**

- Bei jeder Streichung fällt dreifach Übersetzungsarbeit weg.
- Die 236 Zeichenketten der Projektschicht sind vollständig ins Englische, Russische und Kasachische übersetzt, einschließlich der Jira-Kennung und der Palette „Kök & Altyn“.
