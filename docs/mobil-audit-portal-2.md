# Mobil-Audit Damicon-Portal, zweiter Durchgang

Stand 20.09.2026, Branch `redesign-mobile` bei `84fbd6a`. Der erste Durchgang (`mobil-audit-portal.md`) prüfte einen Stand, in dem das Dashboard auf dem Handy nur eine seitliche Schublade hatte. Seitdem sind untere Leiste, Menü- und Konto-Blatt, das KI-Blatt und Himbi im Knopf dazugekommen, und `main` ist eingeflossen. Dieser Durchgang fragt: was steht jetzt da, und was daran trägt noch nicht.

**Methode:** Quelltext gelesen, Maße aus den Tailwind-Klassen und den CSS-Dateien gerechnet, für 390 × 844 px. Zahlen sind gezählt oder gerechnet, nicht geschätzt.

**Nicht geprüft:** ein Durchlauf auf einem Gerät. Das gilt inzwischen auch für alles, was in diesem Branch gebaut wurde — der Messbrowser läuft auf diesem Rechner nicht, und das Dashboard verlangt eine Anmeldung. Die Punkte 13 bis 16 sind Befunde am eigenen Werk, die ein Gerätetest bestätigen oder entkräften muss. Ebenfalls offen: Querformat, Systemschriftgröße über 100 %, Bedienung mit Arbeitshandschuhen, Verhalten der Offline-Warteschlange bei Netzabbruch.

## Was inzwischen trägt

Der Vollständigkeit halber, weil eine reine Mängelliste den Stand falsch darstellt: Die Navigation ist erreichbar, ohne in die obere linke Ecke zu zielen. Die Kopfzeile trägt auf dem Handy höchstens zwei Bedienelemente statt sechs. Das KI-Blatt kommt von unten, sein Eingabefeld löst keinen Zoom mehr aus, und die Tastatur verdeckt es nicht. Die untere Bildschirmkante hat eine Stapelregel, mit der drei Elemente rechnen. Himbi steht im Knopf statt über dem Inhalt. Rollenumschalter, Sprache und Farbschema sind auf dem Handy überhaupt erst erreichbar.

Das betrifft die Hülle. Die Module darin sind unverändert für den Schreibtisch gebaut, und dort liegt der größere Teil der folgenden Liste.

## Überblick

| # | Punkt | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| 1 | Tabellen zwingen weiter zum Querscrollen | sehr hoch | mittel | **erledigt** |
| 2 | Eingabefelder in den Modulen lösen den iOS-Zoom aus | sehr hoch | niedrig | **erledigt** |
| 3 | Kein Web-App-Manifest, obwohl der Service Worker steht | hoch | niedrig | **erledigt** |
| 4 | Die Fach-Oberfläche ist auf 11 px gebaut | hoch | mittel | **teilweise** |
| 5 | 50 Bedienelemente unter 44 px | hoch | mittel | **erledigt** |
| 6 | Scan-Ansicht im Querformat, Knöpfe 27 px | hoch | niedrig | **erledigt** |
| 7 | Kein Fokus sichtbar, nirgends in der Fach-Oberfläche | hoch | niedrig | **erledigt** |
| 8 | Kamera-Aufnahme nur bei einem von drei Uploads | mittel | sehr niedrig | offen |
| 9 | Sync-Panel als Desktop-Popover | mittel | niedrig | offen |
| 10 | Karte fängt das Seitenscrollen ab | mittel | niedrig | offen |
| 11 | `body` mit `min-h-screen` statt `min-h-svh` | mittel | sehr niedrig | **erledigt** |
| 12 | Sieben Raster ohne Breakpoint | mittel | niedrig | **erledigt** |
| 13 | Zwei Bauweisen für dasselbe Blatt | mittel | mittel | **erledigt** |
| 14 | Die Blätter sind keine echten Dialoge | mittel | niedrig | **erledigt** |
| 15 | Keine Zurück-Geste für Blätter und Panel | mittel | mittel | entschieden |
| 16 | Der Modultipp ist mobil ersatzlos entfallen | niedrig–mittel | niedrig | offen |
| 17 | Die Glocke belegt einen von zwei Plätzen | niedrig | sehr niedrig | entschieden |
| 18 | Querformat ist nirgends bedacht | niedrig | niedrig | offen |
| 19 | Kein Breakpoint unter 640 px | niedrig | niedrig | offen |
| 20 | Zwei fast gleiche 56-px-Zeilen | niedrig | sehr niedrig | offen |

---

## Sehr hoher Nutzen

### 1. Tabellen zwingen weiter zum Querscrollen — erledigt

`DataTable` setzt unverändert `min-w-[640px]` (`src/components/ui/kit.tsx:179`), der Baustein steht an 29 Stellen. Bei 390 px Fensterbreite sind nach dem Innenabstand der Hauptspalte 358 px sichtbar, 282 px jeder Tabelle liegen außerhalb. Beim Querscrollen verliert man die erste Spalte und weiß nicht mehr, welche Zeile man liest.

Das ist der größte verbliebene Einzelposten. Alles, was dieser Branch bisher gebaut hat, betrifft den Weg zu einem Modul; was man dort vorfindet, ist unverändert.

*Dafür:* Eine Kartendarstellung unter `md` wirkt an 29 Stellen auf einmal, weil sie in einem Baustein liegt. Sie macht Listen auf dem Handy erstmals lesbar, ohne dass ein einziges Modul angefasst wird.

*Dagegen:* Der Baustein bekommt die Zellen heute als freies `children` und kennt nur die Spaltenköpfe als `string[]`. Für die Paarung Kopf/Wert braucht er eine Zeilen-Komponente, und die müssen alle 29 Aufrufstellen verwenden. Das ist kein Umbau an einer Stelle, sondern an 30. Dazu kommt, dass Karten je Zeile viel Höhe brauchen: eine Liste mit 40 Chargen wird zu einer sehr langen Seite, solange Punkt 2 des UX-Audits (Blättern, Filtern) fehlt.

**Gebaut am 20.09.2026.** Unter `md` wird jede Zeile zu einer Karte: Beschriftung links, Wert rechts. Die Beschriftung hängt der Baustein selbst an jede Zelle (`data-kopf`), die Zuordnung läuft über die Reihenfolge — keine der 29 Aufrufstellen wurde angefasst. Das befürchtete Gegenargument bleibt bestehen: lange Listen werden sehr lang, solange Blättern und Filtern fehlen. Die Zuordnung ist die einzige Stelle, an der stillschweigend etwas schiefgehen könnte, deshalb prüft sie `npm run test:kit` in sechzehn Fällen, darunter Leerzeilen mit `colSpan`, mehr Zellen als Köpfe und Spalten, die nur unter einer Bedingung stehen.

*Nutzen: sehr hoch · Aufwand: mittel*

### 2. Eingabefelder in den Modulen lösen den iOS-Zoom aus — erledigt

Im KI-Blatt ist das behoben, in der Fach-Oberfläche nicht. `feldKlassen` in `src/components/db/formular-kit.tsx:14-15` setzt weiterhin `text-xs`, also 12 px, ebenso die beiden Scan-Felder (`steige-scan-feld.tsx:204`, `ausweis-scan-feld.tsx:196`). Safari auf iOS zoomt beim Fokus hinein und bleibt vergrößert; man scrollt sich aus dem Formular heraus.

Das trifft jede Erfassung im Feld, also genau den Vorgang, für den das Telefon da ist. Dass ausgerechnet der Chat es richtig macht und das Mengenformular nicht, ist die falsche Reihenfolge.

*Dafür:* Eine Konstante in `formular-kit.tsx` deckt rund fünfzehn Formulare ab. `h-11 text-base md:h-9 md:text-xs` löst Zoom und Touchgröße in einem Zug.

*Dagegen:* 16-px-Text in dichten Formularen kostet Höhe; am Schreibtisch will die Buchhaltung die dichte Maske behalten. Deshalb die Breakpoint-Fassung statt einer globalen Änderung — die wiederum bedeutet, dass zwei Größen gepflegt werden. Die Scan-Felder tragen ihre Klassen einzeln und müssen von Hand nachgezogen werden.

**Gebaut am 20.09.2026.** `h-11 text-base md:h-9 md:text-xs` in `formular-kit.tsx` deckt rund fünfzehn Formulare ab; die beiden Scan-Felder und das Reihenblock-Formular tragen ihre Klassen einzeln und wurden nachgezogen. Am Schreibtisch bleibt die dichte Maske unverändert.

*Nutzen: sehr hoch · Aufwand: niedrig*

---

## Hoher Nutzen

### 3. Kein Web-App-Manifest, obwohl der Service Worker steht — erledigt

Unverändert seit dem ersten Durchgang: `public/sw.js` cacht die App-Shell, `public/offline.html` fängt den Ausfall ab, `src/lib/offline/` hält eine IndexedDB-Warteschlange — ein `manifest.json` oder `app/manifest.ts` gibt es nicht.

*Dafür:* Der Unterbau ist fertig. Eine Datei macht das Portal installierbar, mit Startsymbol, Vollbild und ohne Adressleiste. Für eine Brigade, die es täglich öffnet, ist das der sichtbarste Unterschied pro Aufwand in dieser ganzen Liste.

*Dagegen:* Für ein brauchbares Ergebnis fehlen Icons in 192 und 512 px als PNG; vorhanden ist nur `src/app/icon.svg`. Ohne sie bleibt die Installation auf iOS halbfertig. Dazu kommt die Frage nach der Startadresse — `/de/dashboard` legt die Sprache fest, und das Portal hat fünf.

**Gebaut am 20.09.2026.** `src/app/manifest.ts`, ausgeliefert unter `/manifest.webmanifest` (geprüft: HTTP 200, der Proxy lässt Pfade mit Punkt durch). `start_url` ist `/de/dashboard`, weil jede Route ein Sprachpräfix verlangt. Offen bleibt, was im Dagegen stand: die PNG-Symbole in 192 und 512 px fehlen weiterhin, bis dahin ist die Installation auf iPhone halbfertig.

*Nutzen: hoch · Aufwand: niedrig*

### 4. Die Fach-Oberfläche ist auf 11 px gebaut — teilweise

Gezählt: 191 Mal `text-[11px]`, 28 Mal `text-[10px]`, dazu `text-xs` als Grundmaß in den Modulen. Beschriftungen, Statustexte, Tabellenköpfe und Hilfszeilen liegen fast durchgehend bei 11 oder 12 px.

Auf 15 Zoll ist das eine dichte, gut lesbare Erfassungsmaske. In der Hand, bei Sonne auf dem Feld, ist es die Größe, bei der man das Telefon näher ans Gesicht hält.

*Dafür:* Zwei, drei Textgrößen als Tokens mit `clamp()` lösen das an einer Stelle, wenn die Bausteine in `kit.tsx` und `formular-kit.tsx` sie verwenden. Die Module erben es.

*Dagegen:* Die 219 gezählten Stellen tragen ihre Größe direkt, nicht über einen Baustein. Ein Token hilft erst, wenn sie ersetzt sind, und das ist Fleißarbeit mit Prüfaufwand in fünf Sprachen. Größer heißt außerdem: weniger Zeilen pro Bildschirm, auch am Schreibtisch, wenn man es nicht am Breakpoint trennt.

**Gebaut am 20.09.2026, Schritt 1 und 2 von 3.**

Schritt 1: zwei Tokens in `globals.css`, `text-label` für Beschriftungen und `text-dense` für dichten Fließtext daneben. Auf dem Handy eine Stufe größer, 11 → 13 px und 12 → 14 px. Nicht 16 px — das ist die Grenze für Eingabefelder wegen des Zooms, für eine Beschriftung wäre es zu viel und würde die Module auseinanderziehen. Der Sprung hängt an derselben Media Query wie alles andere in diesem Branch; ein `clamp()` hätte die Größe stufenlos an die Fensterbreite gekoppelt und wäre der einzige Ort im Projekt mit einer eigenen Grenze gewesen.

Schritt 2: die Bausteine tragen die Tokens — Statuspille, Kennzahl-Label, Kennzahl-Hilfstext, Abschnittsbeschreibung und Tabellenkopf in `kit.tsx`, Feldbeschriftung, Rückmeldung und Formularkarte in `formular-kit.tsx`. Die Module erben es, ohne dass eine ihrer Dateien angefasst wurde. Die Beschriftung in den Tabellenkarten liest dieselbe Variable.

Nachgeprüft im ausgelieferten Stylesheet: die Utilities `text-label` und `text-dense` entstehen und hängen an den Variablen, die Media Query setzt sie von `.6875rem` auf `.8125rem`.

**Schritt 3 steht aus:** 212 Stellen tragen ihre Größe weiterhin direkt, davon 164 in den Modulen (`components/db/`), 19 im Dashboard-Rahmen und 10 auf der Marketingseite. Sie einzeln umzustellen ist Fleißarbeit mit Prüfblick auf Kasachisch und Russisch, wo dieselbe Beschriftung deutlich länger ausfällt. Das gehört modulweise gemacht und nicht in einem Zug — und es ist der Punkt, an dem sich zeigt, ob 13 px in einer Tabellenzeile noch trägt oder ob die Zeile dann umbricht. Die Marketingseite bleibt außen vor, sie ist nicht auf Dichte gebaut.

*Nutzen: hoch · Aufwand: mittel*

### 5. 50 Bedienelemente unter 44 px — erledigt

41 Mal `h-9` (36 px), 9 Mal `h-8` (32 px). Im KI-Blatt und in der unteren Leiste ist das behoben, überall sonst nicht. Der kleinste Fund bleibt der Löschknopf in der Sync-Warteschlange mit `h-5 w-5`, also 20 px (`sync-status.tsx:197`), ausgerechnet in der Ansicht, die nur die Brigade sieht.

`DESIGN.md:229` schreibt weiterhin „Buttons ab `h-9`, Primäraktionen `h-10`" fest. Solange die Regel dort steht, baut jedes neue Modul den Fehler nach.

*Dafür:* Erst die Regel ändern, dann die Bausteine, dann die Einzelfunde — in dieser Reihenfolge wirkt es dauerhaft. Mit Handschuhen im Kühlhaus ist 44 px der Unterschied zwischen Treffen und Danebentippen.

*Dagegen:* 44 px in einer dichten Tabellenzeile verändert das Bild der Fach-Oberfläche deutlich. Wer am Schreibtisch damit arbeitet, verliert Zeilen. Das spricht wieder für eine Trennung am Breakpoint, also für zwei gepflegte Maße statt einem.

**Gebaut am 20.09.2026.** 18 Stellen auf `h-11` unter `md`, darunter der 20-px-Löschknopf der Synchronisationsliste, die Knöpfe der Feldformulare, Einladungen, KI-Anbieter und der Drucken-Knopf. `DESIGN.md` schreibt jetzt „ab `md` `h-9`, darunter mindestens `h-11`" fest, damit das nächste Modul es nicht wieder anders macht.

*Nutzen: hoch · Aufwand: mittel*

### 6. Scan-Ansicht im Querformat, Knöpfe 27 px — erledigt

Beide Scan-Felder zeigen das Kamerabild mit `aspect-video` (`steige-scan-feld.tsx:174`, `ausweis-scan-feld.tsx:172`): bei 358 px Breite ein Bild von 358 × 201 px, quer, während das Telefon hochkant gehalten wird und der QR-Code auf einer Steige vor einem steht. Die Knöpfe daneben tragen `px-3 py-1.5 text-xs`, sind also rund 27 px hoch.

*Dafür:* Hochformat und 44-px-Knöpfe sind zwei Klassenänderungen je Datei. Das ist die Interaktion, die am häufigsten mit Handschuhen stattfindet, und der Scan ist der Kern von Anforderung 2.7/2.8.

*Dagegen:* Ein hochkantes Kamerabild nimmt viel Platz, und darunter stehen noch Trefferanzeige, Umschalter und der Weg „Code eintippen". Es kann sein, dass die Ansicht dadurch scrollt, wo sie heute auf einen Blick passt. Ohne Gerätetest ist das nicht zu entscheiden.

**Gebaut am 20.09.2026.** `aspect-[3/4] md:aspect-video` in beiden Scan-Feldern, Knöpfe auf 44 px. Das Gegenargument steht noch: ein hochkantes Kamerabild nimmt viel Platz, und ob die Ansicht dadurch scrollt, zeigt erst das Gerät.

*Nutzen: hoch · Aufwand: niedrig*

### 7. Kein Fokus sichtbar, nirgends in der Fach-Oberfläche — erledigt

`focus-visible:` kommt in `components/db/`, `components/ui/` und `components/dashboard/` kein einziges Mal vor. Der Befund stammt aus dem UX-Audit (Punkt 5) und steht hier, weil er mobil nicht kleiner wird: Die untere Leiste, die Blätter und das KI-Blatt sind neue Bedienelemente, und auch sie zeigen keinen Fokus.

`DESIGN.md` dokumentiert `--ring` mit ausführlicher Begründung, warum der Wert auf 3:1 nach WCAG 1.4.11 getrimmt ist. Benutzt wird das Token in der Fach-Oberfläche nirgends.

*Dafür:* Eine Regel in `globals.css`, die `:focus-visible` global auf `--ring` setzt, deckt alles ab, was heute existiert und morgen dazukommt. Aufwand: eine Stunde.

*Dagegen:* Auf dem Handy ist der Nutzen gering — dort tippt man. Er zahlt auf den Schreibtisch und auf die Barrierefreiheit ein, nicht auf diesen Branch. Wer strikt mobil priorisiert, schiebt es zu Recht.

**Gebaut am 20.09.2026.** Eine Regel in `globals.css` setzt `:focus-visible` global auf `--ring`, ausgenommen sind Himbi und das KI-Panel, die ihren Fokus selbst zeichnen. Damit gilt sie auch für alles, was künftig dazukommt.

*Nutzen: hoch, aber nicht mobil · Aufwand: niedrig*

---

## Mittlerer Nutzen

### 8. Kamera-Aufnahme nur bei einem von drei Uploads

`pflueckaufgaben-formulare.tsx:210` setzt `capture="environment"` und öffnet direkt die Rückkamera. Die beiden anderen Datei-Felder haben das nicht: der Fotobeleg der Lieferung (`lieferungen-formulare.tsx:105`, nimmt ohnehin nur Bilder) und der Dokumenten-Upload (`dokumente-formular.tsx:77`, nimmt auch PDF).

*Dafür:* Ein Attribut. Der Lieferbeleg entsteht am Hof, nicht am Schreibtisch.

*Dagegen:* Beim Dokumenten-Upload wäre es falsch — dort wählt man vorhandene PDF aus, und `capture` würde die Auswahl auf die Kamera verengen. Der Punkt betrifft also genau eine Datei, nicht drei.

*Nutzen: mittel · Aufwand: sehr niedrig*

### 9. Sync-Panel als Desktop-Popover

`sync-status.tsx:143` öffnet ein `absolute right-0 top-11 w-80`: 320 px breit, absolut an einen 36-px-Knopf gehängt, Einträge in 11 und 10 px, Löschknopf 20 px. Für die Brigade ist das die wichtigste Anzeige des Systems — was ist noch nicht übertragen, wo gibt es einen Konflikt — und die am kleinsten gebaute Fläche der ganzen Oberfläche.

*Dafür:* Mit `ui/sheet.tsx` ist der Baustein da. Der Zustand bleibt, nur die Darstellung wechselt unter `md`.

*Dagegen:* Ein Blatt für eine Anzeige, die man im Vorbeigehen prüft, ist schwerer als ein Popover: es deckt die Seite ab und will geschlossen werden. Denkbar wäre auch, es breiter und größer zu machen und als Popover zu belassen — weniger Arbeit, weniger Bruch.

*Nutzen: mittel · Aufwand: niedrig*

### 10. Karte fängt das Seitenscrollen ab

`tour-karte-inner.tsx:44` setzt die Karte auf feste `height: 320px`, `scrollWheelZoom` ist aus. Am Mausrad stimmt damit alles. Auf dem Touchgerät greift `scrollWheelZoom` nicht: dort zieht der Finger die Karte, und wer über sie hinwegscrollen will, verschiebt den Kartenausschnitt.

*Dafür:* Leaflet kennt `dragging: false` bis zum ersten Antippen, und `50svh` statt 320 px gibt der Tour mehr Raum. Beides sind Zeilen, keine Umbauten.

*Dagegen:* „Erst antippen, dann ziehen" ist ein zusätzlicher Schritt, den niemand erklärt bekommt, solange kein Hinweis dasteht. Die Alternative — Karte immer ziehbar, Seite scrollt daneben — verlangt genug Rand neben der Karte, und den gibt es bei 358 px nicht.

*Nutzen: mittel · Aufwand: niedrig*

### 11. `body` mit `min-h-screen` statt `min-h-svh` — erledigt

`[locale]/layout.tsx` setzt am `body` weiterhin `min-h-screen`, ebenso `not-found.tsx:9`. Das ist `100vh`, also die Höhe ohne eingeblendete Adressleiste; die Seite ist damit beim Laden höher als das Sichtfeld und springt beim Scrollen. Die Dashboard-Hülle, Login und die feste Spalte machen es bereits richtig.

*Dafür:* Zwei Wörter, keine Nebenwirkung.

*Dagegen:* Nichts, was ich sehe. Der Punkt steht nur deshalb noch offen, weil er zu klein war, um für sich allein angefasst zu werden.

**Gebaut am 20.09.2026.** Zwei Stellen, wie angekündigt ohne Nebenwirkung.

*Nutzen: mittel · Aufwand: sehr niedrig*

### 12. Sieben Raster ohne Breakpoint — erledigt

Unverändert sieben Stellen mit `grid-cols-2` oder `grid-cols-3` ohne Breakpoint, darunter `herkunft/[code]/page.tsx:173`. Bei 358 px verfügbarer Breite ergibt das Wertespalten von 170 px, dreispaltig 110 px — für kyrillische Beschriftungen zu wenig.

Die öffentliche Herkunftsauskunft wiegt dabei schwerer als der Rest: Sie ist die Seite, die ein Kunde oder Prüfer vom QR-Etikett aus aufruft, also fast ausschließlich mobil, und zugleich das Aushängeschild des Betriebs.

*Dafür:* `sm:grid-cols-2` statt `grid-cols-2`, sieben Mal. Kleiner geht ein Befund kaum.

*Dagegen:* Einspaltig wird die Herkunftsseite länger, und gerade dort ist die Kürze Teil der Wirkung. Die Stelle braucht einen Blick, keine pauschale Ersetzung.

**Gebaut am 20.09.2026.** Sechs Stellen auf `grid-cols-1 sm:grid-cols-2` beziehungsweise `sm:grid-cols-3`, darunter die öffentliche Herkunftsauskunft. Die siebte (`beere-bento.tsx`) gehört zur Marketingseite und bleibt, wie sie ist — dort ist die Dreierreihe Teil der Bildkomposition, nicht eine Wertetabelle.

*Nutzen: mittel · Aufwand: niedrig*

---

## Befunde am eigenen Werk

Die folgenden vier Punkte betreffen, was in diesem Branch gebaut wurde. Sie stehen hier, weil ein Audit, der die eigene Arbeit auslässt, keiner ist.

### 13. Zwei Bauweisen für dasselbe Blatt — angeglichen

Menü und Konto verwenden `ui/sheet.tsx` (React-Komponente, hängt beim Schließen aus). Das KI-Blatt verwendet `.ki-pane-huelle` in `ki-pane.css` (bleibt gemountet, fährt per `transform` heraus). Beide sehen gleich aus und öffnen von unten, verhalten sich aber verschieden: Das Blatt kennt Esc und sperrt das Scrollen dahinter, das KI-Blatt kennt beides nicht.

Der Grund für die zweite Bauweise ist gut: Das Panel muss gemountet bleiben, sonst reißt eine laufende Antwort ab. Der Preis ist, dass „Blatt von unten" jetzt an zwei Stellen definiert ist, und sie laufen bereits auseinander.

*Dafür:* Eine gemeinsame Grundlage — etwa `ui/sheet.tsx` mit einer Option, den Inhalt gemountet zu lassen — beseitigt den Unterschied, bevor ein dritter Fall dazukommt. Punkt 9 wäre einer.

*Dagegen:* Das würde das KI-Panel umbauen, das gerade erst angefasst wurde und dessen Hülle gleichzeitig drei Erscheinungsformen trägt: Spalte, Schublade, Blatt. Das Risiko, dabei den Desktop-Fall zu beschädigen, ist real. Der kleinere Schritt wäre, dem KI-Blatt Esc und Scroll-Sperre nachzurüsten und die Bauweisen getrennt zu lassen.

**Angeglichen am 20.09.2026, nicht vereinheitlicht.** Das KI-Blatt kennt jetzt ebenfalls Esc und sperrt das Scrollen dahinter, beides nur unter `md`. Damit verhalten sich die drei Blätter gleich. Die Bauweisen bleiben getrennt, aus dem Grund, der oben im Dagegen steht: `ui/sheet.tsx` hängt beim Schließen aus, das KI-Panel muss gemountet bleiben, sonst reißt eine laufende Antwort ab. Eine gemeinsame Grundlage hätte ein Panel umgebaut, das drei Erscheinungsformen trägt — das Risiko steht in keinem Verhältnis zum Gewinn, solange die Zahl der Blätter nicht wächst.

*Nutzen: mittel · Aufwand: mittel*

### 14. Die Blätter sind keine echten Dialoge — erledigt

`ui/sheet.tsx:71-72` setzt `role="dialog"` und `aria-modal="true"`, legt den Fokus in die Fläche und fängt Esc ab. Es fehlt beides, was `aria-modal` verspricht: eine Fokusfalle und ein `inert` auf dem, was dahinter liegt. Mit der Tabulatortaste läuft man aus dem offenen Menü heraus in die Seite darunter, ohne dass sich sichtbar etwas ändert.

Für einen Screenreader ist die Lage schlechter als für einen Sehenden: `aria-modal="true"` sagt zu, dass es hinter dem Blatt nichts gibt, und diese Zusage stimmt nicht.

*Dafür:* Entweder die Zusage einlösen (Fokusfalle plus `inert` am Geschwisterelement) oder sie zurücknehmen (`aria-modal` entfernen). Ersteres sind rund 20 Zeilen, letzteres eine.

*Dagegen:* Auf dem Handy tippt man, die Tabulatortaste kommt selten vor — der praktische Schaden ist gering. Das ändert nichts daran, dass die Auszeichnung derzeit etwas Falsches behauptet.

**Gebaut am 20.09.2026.** `ui/sheet.tsx` hält den Fokus jetzt in der Fläche, vorwärts wie rückwärts. Kein `inert` am Hintergrund: die Fläche liegt fixiert über der ganzen Seite, der einzige gemeinsame Vorfahr wäre das `body` — und das trägt auch das Blatt selbst. Die Fokusfalle leistet dasselbe mit weniger Eingriff.

*Nutzen: mittel · Aufwand: niedrig*

### 15. Keine Zurück-Geste für Blätter und Panel — entschieden

Menü-Blatt, Konto-Blatt und KI-Blatt legen keinen Verlaufseintrag an. Auf Android schließt die Zurück-Geste sie deshalb nicht, sondern verlässt die Seite — im schlechtesten Fall das Dashboard. Das ist die am tiefsten sitzende Gewohnheit auf dem Gerät.

*Dafür:* Ein Muster für alle drei Flächen, und der Punkt wäre für die ganze Anwendung erledigt.

*Dagegen:* Es greift in die Verlaufsverwaltung des App-Routers ein: `pushState` beim Öffnen, `popstate` beim Schließen, und beides muss sich mit `next/navigation` vertragen. Ohne Gerätetest lässt sich nicht prüfen, ob dabei die Navigation Schaden nimmt. Genau deshalb wurde es bisher nicht gebaut. Der Punkt ist weniger eine Frage des Aufwands als eine der Prüfbarkeit.

**Entschieden am 20.09.2026: wird nicht gebaut.** Begründung des Auftraggebers: Zurücknavigation ist über die Wischgeste des Browsers und über die Brotkrumen möglich. Damit entfällt der Grund, in die Verlaufsverwaltung des App-Routers einzugreifen — was ohne Gerätetest ohnehin nicht zu verantworten war.

*Nutzen: mittel · Aufwand: mittel*

### 16. Der Modultipp ist mobil ersatzlos entfallen

Seit Himbi im Knopf steht, gibt es unter `md` keine Sprechblasen mehr. Willkommensgruß und „Antwort ist fertig" sind verschmerzbar, weil ein Tipp auf Himbi dorthin führt, wohin ihre Knöpfe führten. Der Modultipp — „Soll ich dir den Bereich erklären?", einmal je Modul und Sitzung — ist dagegen ersatzlos weg.

Er ist die einzige Stelle, an der das System von sich aus Hilfe anbietet. Gerade auf dem Handy, wo die Modulseiten enger und die Nutzer weniger geübt sind, wiegt das Fehlen schwerer als am Schreibtisch.

*Dafür:* Ein schmales Band über der Leiste, das die Frage stellt und zwei Knöpfe trägt, ist eine überschaubare Komponente. Es steht dort, wo es niemanden stört, und hat Platz für fünf Sprachen.

*Dagegen:* Noch ein Element an der unteren Kante, das mit `--untere-leiste-raum` rechnen muss, und ein weiterer Zustand, der mit Himbi, Blättern und Panel koordiniert sein will. Die Alternative — der Tipp entfällt mobil dauerhaft — ist vertretbar, sollte dann aber eine Entscheidung sein und kein Nebeneffekt.

*Nutzen: niedrig bis mittel · Aufwand: niedrig*

---

## Kleinerer Nutzen

### 17. Die Glocke belegt einen von zwei Plätzen — entschieden

Auf dem Handy trägt die Kopfzeile rechts nur noch Sync-Anzeige und Glocke. Die Glocke ist ein `<button>` ohne `onClick`, mit einem fest eingebauten Punkt, der dauerhaft ungelesene Meldungen suggeriert (UX-Audit, Punkt 8). Von zwei verbliebenen Plätzen belegt damit einer eine Attrappe.

*Dafür:* Ausblenden ist eine Klasse. Auf einem Schirm mit zwei Plätzen zählt jeder.

*Dagegen:* Wenn Benachrichtigungen ohnehin gebaut werden sollen, spart das Ausblenden nichts und kostet den Platzhalter, an dem man sie später erwartet. Die Frage ist nicht das Ausblenden, sondern ob es die Funktion geben soll.

**Entschieden am 24.09.2026: die Glocke bleibt, und sie bekommt ein Ziel.** Benachrichtigungen werden in zwei Stufen gebaut. Seit Stufe 1 (WMCNL-2485) öffnet die Glocke ein Panel mit dem Stand „keine neuen Benachrichtigungen“, und der Punkt verschwindet nach dem ersten Öffnen. Für Kunden und Pflücker ist die Glocke ausgeblendet, dort ist der Platz frei. Echte Einträge folgen mit Stufe 2 (WMCNL-2486).

*Nutzen: niedrig · Aufwand: sehr niedrig*

### 18. Querformat ist nirgends bedacht

Im ganzen Projekt gibt es keine einzige Regel für `orientation`. Im Querformat bei 844 × 390 px ist das KI-Blatt mit `92dvh` noch 359 px hoch; abzüglich Kopf und Composer bleiben für das Gespräch rund 180 px, mit eingeblendeter Tastatur praktisch nichts. Die untere Leiste und ihr Freiraum kosten dieselben 80 px wie im Hochformat, nur von einer halb so hohen Fläche.

*Dafür:* Eine Handvoll Regeln — flacheres Blatt, niedrigere Leiste — würde den Fall brauchbar machen.

*Dagegen:* Es ist unklar, ob jemand das Dashboard quer hält. Auf dem Feld hält man das Telefon hochkant, und die Fälle, in denen quer sinnvoll wäre (Karte, breite Tabelle), sind genau die, die ohnehin überarbeitet werden. Ohne Beleg, dass der Fall vorkommt, ist das Arbeit auf Verdacht.

*Nutzen: niedrig · Aufwand: niedrig*

### 19. Kein Breakpoint unter 640 px

`globals.css` definiert keine eigenen Breakpoints; es gilt die Tailwind-Vorgabe, und der erste Haltepunkt ist `sm` bei 640 px. Zwischen 320 und 639 px gilt überall dasselbe Basis-Layout — ein iPhone SE mit 375 px bekommt dieselben Maße wie ein 639 px breites Fenster.

*Dafür:* Ein `xs` bei etwa 480 px gäbe den Stellen Luft, an denen es zwischen schmalem und großem Telefon auseinandergeht.

*Dagegen:* Bisher ist keine Stelle aufgefallen, die ihn braucht — die neuen Flächen rechnen mit Anteilen statt mit festen Breiten. Ein Haltepunkt, den niemand benutzt, kostet nur Aufmerksamkeit beim Lesen. Der Punkt gehört nachgezogen, wenn eine konkrete Stelle ihn verlangt.

*Nutzen: niedrig · Aufwand: niedrig*

### 20. Zwei fast gleiche 56-px-Zeilen

`untere-leiste.tsx:131` (Bereich im Menü-Blatt) und `ki-pane.tsx:138` (Eintrag in der Mehr-Ansicht) sind dieselbe Zeile: 56 px hoch, Symbolkachel links, Text, Rahmen, `hover:bg-muted`. Die eine ist ein `Link` mit Chevron und aktivem Zustand, die andere ein `button` ohne beides.

*Dafür:* Ein Listenzeilen-Baustein in `ui/` deckte beide Fälle, und mit Punkt 9 gäbe es einen dritten Ort dafür.

*Dagegen:* Zwei Vorkommen sind noch kein Muster. Eine Komponente mit Varianten für Link und Schalter kann mehr kosten, als sie spart. Das ist ein Fund für den nächsten Aufräumdurchgang, kein Auftrag für heute.

*Nutzen: niedrig · Aufwand: sehr niedrig*

---

## Reihenfolge

**Zuerst, weil klein und ohne Abhängigkeit (2, 3, 8, 11).** Feldgröße gegen den iOS-Zoom, Manifest, das fehlende `capture`, `svh`. Zusammen etwa ein halber Tag, kein Umbau an bestehenden Ansichten. Danach ist das Portal installierbar und im Feld ohne Zoom-Sprünge bedienbar.

**Dann die Maße (4, 5, 12).** Zuerst `DESIGN.md:229` ändern, dann die Bausteine, dann die Einzelfunde. Andernfalls weicht die Umsetzung erneut von der dokumentierten Regel ab.

**Dann die Feldarbeit (6, 9, 10).** Scan-Ansicht, Sync-Anzeige und Karte sind unabhängig voneinander und können einzeln gehen.

**Der große Posten bleibt Punkt 1.** Die Tabellenschicht gehört mit Punkt 2 des UX-Audits — Sortieren, Filtern, Blättern — in dasselbe Vorhaben, sonst wird aus jeder langen Tabelle eine sehr lange Kartenliste.

**Die eigenen Befunde (13 bis 16)** sollten vor dem nächsten Ausbau entschieden werden, nicht danach: Punkt 13 wird teurer, sobald es eine dritte Blattfläche gibt, und Punkt 16 ist eine Produktentscheidung, keine technische.

**Punkt 7** zahlt nicht auf mobil ein und gehört in den Schreibtisch-Zweig. **18 und 19** warten auf einen Beleg, dass der Fall vorkommt.

## Was dieser Durchgang nicht geprüft hat

Ein Durchlauf auf einem Gerät, und damit auch die Frage, ob das im Branch Gebaute tatsächlich so aussieht und sich so anfühlt, wie es gedacht ist. Offen sind insbesondere: ob `92dvh` mit eingeblendeter Tastatur genug Platz lässt, ob Himbi bei 28 px im Knopf erkennbar bleibt, ob der Wechsel zwischen Blatt und Schublade beim Drehen sauber ist, und ob die Bereichsliste im Menü-Blatt als Navigationsweg ausreicht oder ob der Sprung ins Modul zu weit geworden ist.

Ebenfalls nicht geprüft: die Compliance-Prüfung (`pruefung/`), die seit dem Merge im Panel hängt. Sie bringt Container-Queries und eine eigene 640-px-Regel mit, ist also nicht unbedacht — aber ihre Bühne mit den Mini-Himbis ist für breite Schirme entworfen, und im Blatt auf 390 px hat sie niemand gesehen.
