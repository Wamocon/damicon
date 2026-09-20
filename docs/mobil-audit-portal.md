# Mobil-Audit Damicon-Portal

Stand 20.09.2026, Branch `redesign-mobile`. Durchsicht des Dashboards auf die Frage, was auf einem Smartphone passiert. Ergänzt `ux-audit-portal.md`, das dieselbe Oberfläche am Schreibtisch prüft; die dort schon erfassten Punkte 10, 11, 16 und 19 werden hier nicht wiederholt, sondern aufgegriffen.

**Methode:** Quelltext gelesen, Maße aus den Tailwind-Klassen gerechnet (`h-9` = 36 px, `text-xs` = 12 px, `w-76` = 304 px) für einen Viewport von 390 × 844 px, also iPhone 14/15 im Hochformat. Wo eine Breite steht, ist sie gerechnet und nicht geschätzt; die zwei Stellen mit geschätzten Textlängen sind als solche gekennzeichnet.

**Nicht geprüft:** ein Durchlauf auf echtem Gerät. Der Messbrowser aus dem gstack-Werkzeug startet auf diesem Rechner nicht (`bun` fehlt), der Entwicklungsserver läuft. Alles unten ist aus dem Code abgeleitet und muss am Gerät gegengeprüft werden, bevor umgebaut wird. Ebenfalls offen: Android-Chrome mit Gestennavigation, Verhalten bei Systemschriftgröße über 100 %, Bedienung mit Arbeitshandschuhen.

## Wer arbeitet am Telefon

Das ist keine Randfrage der Oberfläche, sondern entscheidet, welche Module zuerst umgebaut werden.

`src/lib/rbac.ts:9-19` kennt sieben Rollen. Drei davon arbeiten überwiegend oder ausschließlich mobil:

- **brigade** — auf dem Feld und am Sammelpunkt. Sie bedient Pflückaufgaben, Steigen-Scan, Ausweis-Scan, Fotobeleg und hängt an der Offline-Warteschlange. Nur für sie zeigt die Kopfzeile überhaupt den Sync-Indikator (`topbar.tsx:89`).
- **picker** — Pflücker, wenn er eigene Zahlen sieht.
- **kunde** und **erzeuger** — rufen die Herkunftsauskunft per QR vom Etikett auf, also fast immer mit dem Telefon in der Hand.

`DESIGN.md:9` sagt es schon: bedient wird „am Schreibtisch, auf dem Tablet im Kühlhaus und auf dem Handy auf dem Feld". Gebaut ist die Fach-Oberfläche bisher für den ersten Fall.

## Überblick

| # | Punkt | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| 1 | Tabellen zwingen zum Querscrollen | sehr hoch | mittel | offen |
| 2 | Kein Weg zwischen den Modulen ohne Schublade | sehr hoch | mittel | **erledigt** |
| 3 | Eingabefelder lösen auf iOS Zoom aus | sehr hoch | niedrig | offen |
| 4 | Kein Web-App-Manifest, obwohl der Service Worker steht | hoch | niedrig | offen |
| 5 | Keine Safe-Area, keine Regel für die Daumenzone | hoch | niedrig | teilweise |
| 6 | Die Kopfzeile ist bei 390 px voll | hoch | niedrig | **erledigt** |
| 7 | Die Fach-Oberfläche ist auf 11 px gebaut | hoch | mittel | offen |
| 8 | Berührungsflächen unter 44 px, im Design-System festgeschrieben | hoch | mittel | offen |
| 9 | Scan-Ansicht im falschen Seitenverhältnis | hoch | niedrig | offen |
| 10 | Kamera-Aufnahme nur bei einem von drei Uploads | mittel | sehr niedrig | offen |
| 11 | Sync-Panel als Desktop-Popover | mittel | niedrig | offen |
| 12 | Karte fängt das Seitenscrollen ab | mittel | niedrig | offen |
| 13 | `body` mit `min-h-screen` statt `min-h-svh` | mittel | sehr niedrig | offen |
| 14 | Kein Breakpoint unter 640 px | mittel | niedrig | offen |
| 15 | Formularraster springt von 1 auf 2 Spalten bei 640 px | niedrig | niedrig | offen |
| 16 | KI-Panel ist am Schreibtisch entworfen | hoch | mittel | **zur Entscheidung** |

---

## Sehr hoher Nutzen

### 1. Tabellen zwingen zum Querscrollen

`DataTable` setzt `min-w-[640px]` auf die Tabelle und fängt den Überlauf mit `overflow-x-auto` ab (`src/components/ui/kit.tsx:178-179`). Der Baustein steht an 29 Stellen in 18 Dateien.

Bei 390 px Fensterbreite bleiben nach dem Innenabstand der Hauptspalte (`p-4` in `dashboard/layout.tsx:67`) genau 358 px sichtbar. 282 px jeder Tabelle liegen also außerhalb des Bildschirms, dauerhaft, in jedem Modul. Dazu kommt der Befund aus Punkt 10 des UX-Audits: beim Querscrollen verliert man die erste Spalte und weiß nicht mehr, welche Zeile man liest.

*Vorschlag:* `DataTable` bekommt eine zweite Darstellung. Unter `md` wird aus jeder Zeile eine Karte mit Beschriftung und Wert untereinander, ab `md` bleibt die Tabelle. Dafür muss der Baustein die Spaltenköpfe kennen — er bekommt sie schon als `head: string[]`, die Zellen aber als freies `children`. Der Umbau läuft also über eine Zeilen-Komponente, die Kopf und Zelle paart. Eine Stelle, 29 Wirkungsorte. Fällt mit Punkt 2 des UX-Audits (Sortieren, Filtern, Blättern) in denselben Umbau.

*Nutzen: sehr hoch · Aufwand: mittel*

### 2. Kein Weg zwischen den Modulen ohne Schublade — erledigt

Unter `md` gibt es nur den Hamburger-Knopf oben links (`sidebar.tsx:484`, `fixed left-4 top-4`, 40 × 40 px). Jeder Modulwechsel heißt: oben links treffen, Schublade lesen, Bereich aufklappen, Modul wählen. Bei 26 Modulen in vier Bereichen ist das der häufigste Vorgang überhaupt.

Zwei Dinge kommen zusammen. Erstens liegt das einzige Navigationsziel in der Ecke, die man einhändig am schlechtesten erreicht. Zweitens zeigt die Schublade dieselbe `SidebarBody`, die für die 304 px breite Spalte gebaut ist: Modulnamen sind auf den Kurznamen gekürzt und zusätzlich `truncate` (`sidebar.tsx:406`, `432`), der vollständige Titel steht in `title` — ein Hover-Text, den ein Touchgerät nicht anzeigt. Die Schublade ist `w-76`, also 304 px, obwohl `max-w-[calc(100vw-2rem)]` 358 px erlauben würde.

*Vorschlag:* Eine feste untere Leiste mit fünf Zielen (Übersicht und die vier Bereiche), nur unter `md`, gespiegelt aus `SidebarRail`, das diese fünf Ziele bereits definiert (`sidebar.tsx:148-215`). Die Bereichsseite listet die Module ohnehin als Kacheln, der Weg funktioniert also ohne Ausklapp-Fenster. Die Schublade bleibt für den direkten Sprung ins Modul, bekommt aber die volle Breite und zeigt die vollen Titel statt der Kurznamen: der Platz dafür ist da. Der Hamburger wandert in die Kopfzeile, womit `pl-16` entfällt (siehe Punkt 6).

**Gebaut am 20.09.2026, erste Fassung:** eine schwebende Leiste mit den fünf Zielen der eingeklappten Seitenleiste, nur Symbole, ohne Beschriftung. Die Zielliste dafür ist aus `SidebarRail` herausgelöst und steht in `src/components/dashboard/nav-ziele.ts`.

**Verworfen und ersetzt, noch am selben Tag.** Die fünf Sprungziele waren bedienbar, aber nicht vollständig: die Module erreichte man nur über den Umweg Bereichsseite, und alles, was nicht Navigation ist — KI, angemeldete Person, Sprache, Farbschema, Abmelden — hing weiter am oberen Rand oder an der Schublade. Die Leiste trägt jetzt drei Knöpfe, die je eine Fläche von unten heraufführen (`src/components/ui/sheet.tsx`):

- **Menü** zeigt `MenueBaum` aus `sidebar.tsx`, also denselben Baum wie die Seitenleiste samt Rechten und aufgeklappten Gruppen. Der Baum ist dafür aus `SidebarBody` herausgelöst, damit im Blatt weder Bildmarke noch Benutzerfuß doppelt stehen.
- **KI-Assistent** schaltet dasselbe Panel wie der Knopf in der Kopfzeile am Schreibtisch. Fehlt das Recht oder die Datenbank, trägt die Leiste zwei Knöpfe statt drei.
- **Konto** (`konto-blatt.tsx`) zeigt Person, „Ansicht als“, Sprache, Farbschema, Sicherheit und Abmelden.

Damit sind Menüknopf und seitliche Schublade aus `sidebar.tsx` entfallen; `DashboardSidebar` ist jetzt nur noch die feste Spalte ab `md`.

Nebenbei erledigt: Punkt 16 des UX-Audits. Der Rollenumschalter trug `hidden lg:inline-flex` und fehlte unter 1024 px vollständig — im Konto-Blatt ist er erreichbar.

*Nutzen: sehr hoch · Aufwand: mittel*

### 3. Eingabefelder lösen auf iOS Zoom aus

`feldKlassen` in `src/components/db/formular-kit.tsx:14-15` setzt `text-xs`, also 12 px. Dieselbe Klasse tragen die beiden Scan-Felder (`steige-scan-feld.tsx:204`, `ausweis-scan-feld.tsx:196`).

Safari auf iOS zoomt beim Fokus in jedes Eingabefeld unter 16 px hinein. Die Seite bleibt danach vergrößert, und der Nutzer scrollt sich aus dem Formular heraus. Das betrifft jede Erfassung im Feld, also genau den Vorgang, für den das Telefon da ist.

*Vorschlag:* Eingabefelder auf mindestens 16 px, entweder generell oder unter `md`. Nicht über `user-scalable=no` lösen — das nimmt die Vergrößerung auch dort weg, wo sie gebraucht wird, und verstößt gegen WCAG 1.4.4.

*Nutzen: sehr hoch · Aufwand: niedrig*

---

## Hoher Nutzen

### 4. Kein Web-App-Manifest, obwohl der Service Worker steht

`public/sw.js` cacht die App-Shell, `public/offline.html` fängt den Ausfall ab, `src/lib/offline/` hält eine IndexedDB-Warteschlange, `ServiceWorkerRegistrierung` hängt im Layout. Ein `manifest.json` oder `app/manifest.ts` gibt es nicht; unter `src/app` liegt nur `icon.svg`.

Ohne Manifest lässt sich das Portal nicht auf den Startbildschirm legen, läuft nicht im Vollbild, hat kein Startsymbol und keinen Splash. Die Brigade öffnet also jedes Mal den Browser und tippt oder sucht die Adresse, während die Offline-Fähigkeit dahinter schon fertig ist. Das ist der größte Nutzen für den geringsten Aufwand in dieser Liste.

*Vorschlag:* `src/app/manifest.ts` mit Name, Kurzname, `start_url` auf `/de/dashboard` (bzw. locale-abhängig), `display: "standalone"`, den Farben aus dem bestehenden `viewport.themeColor` (`[locale]/layout.tsx:40-45`) und Icons in 192 und 512 px. Danach prüfen, ob `sw.js` die Start-URL mitcacht.

*Nutzen: hoch · Aufwand: niedrig*

### 5. Keine Safe-Area, keine Regel für die Daumenzone — teilweise

`env(safe-area-inset-*)` und `viewport-fit=cover` kommen im ganzen Projekt nicht vor. Gleichzeitig sitzen zwei Elemente unten fest: Himbi mit `position: fixed; bottom: 20px` (`haustier.css:8-11`, im hohen Zustand 84 px) und das KI-Panel, das unter 1100 px zum Vollbild-Overlay wird (`ki-pane.css:122-145`).

Auf einem iPhone mit Home-Indicator und auf Android mit Gestennavigation liegt alles, was näher als etwa 34 px am unteren Rand klebt, unter der Systemleiste. Das Maskottchen wird zum Wischziel des Betriebssystems statt zum Bedienelement. Und sobald die untere Navigation aus Punkt 2 kommt, konkurrieren drei Dinge um dieselben 100 px.

*Vorschlag:* Erstens `viewport-fit: cover` setzen und die unteren Fixpunkte auf `calc(X + env(safe-area-inset-bottom))` umstellen. Zweitens eine Stapelregel festlegen und in `DESIGN.md` schreiben: untere Navigation ganz unten, Himbi darüber versetzt, KI-Panel als Vollbild darüber. Ohne diese Regel schiebt jeder neue Overlay den nächsten weg.

**Gebaut am 20.09.2026:** `viewportFit: "cover"` steht im Viewport-Export (`[locale]/layout.tsx`), erst damit liefert `env(safe-area-inset-bottom)` überhaupt einen Wert. Den Platz unten hält jetzt eine gemeinsame Variable `--untere-leiste-raum` (`globals.css`), die den Systemabstand einrechnet. Drei Stellen lesen sie: die untere Leiste, der untere Innenabstand der Hauptspalte und Himbi samt Versteck (`haustier.css`) — das Maskottchen sitzt unter `md` jetzt über der Leiste statt darauf.

Die Stapelregel steht jetzt in `DESIGN.md`, Abschnitt 6: von unten nach oben Leiste, Himbi, KI-Panel, Schublade, dazu die Vorgabe, dass jedes neue feste Element unten mit `--untere-leiste-raum` rechnet.

**Noch offen an diesem Punkt:** das KI-Panel rechnet nicht mit der Variable. Es liegt als Vollbild-Overlay darüber (`z-index: 70` gegen `z-50` der Leiste), deshalb kollidiert derzeit nichts; sein eigener unterer Rand steht aber weiterhin ohne Systemabstand.

*Nutzen: hoch · Aufwand: niedrig*

### 6. Die Kopfzeile ist bei 390 px voll — erledigt

`topbar.tsx:92` setzt `px-4 pl-16` — die 64 px links sind der Freiraum für den fixierten Hamburger. Bei 390 px Fensterbreite bleiben damit 310 px für den Inhalt.

Was dort steht, wenn eine Brigade angemeldet ist: Sprachumschalter (`w-[64px]`), Thema (36 px), Sync (36 px), Glocke (36 px) — zusammen 172 px, dazu vier Abstände à 8 px. Für den Knopf „KI fragen" bleiben 106 px, von denen Innenabstand, Himbeersymbol und Lücke schon 49 px belegen. Für die Beschriftung bleiben rund 57 px. „KI fragen" braucht bei 14 px halbfett mehr (geschätzt, nicht gemessen), das russische „Спросить ИИ" deutlich mehr. Die Kopfzeile ist also bereits auf Deutsch randvoll und läuft in mindestens einer der fünf Sprachen über.

Die Suche ist unter 640 px ausgeblendet (`topbar.tsx:94`), was die Lage entspannt, aber nach Punkt 1 des UX-Audits ohnehin eine Attrappe ist.

*Vorschlag:* Mit Punkt 2 zusammen lösen. Der Hamburger wandert als normales Element in die Kopfzeile, `pl-16` entfällt und bringt 48 px zurück. Der KI-Knopf zeigt unter `sm` nur das Himbeersymbol mit `aria-label`. Glocke und Sprachumschalter wandern in die Schublade oder hinter ein Mehr-Menü. Sichtbar bleibt, was im Feld zählt: Sync-Stand und KI.

**Gebaut am 20.09.2026, anders als vorgeschlagen.** Der Hamburger ist nicht in die Kopfzeile gewandert, sondern ganz entfallen: das Menü hängt jetzt an der unteren Leiste. Damit ist `pl-16` weg, und an seine Stelle treten unter `md` Bildmarke und Name des Systems — die Seitenleiste, die beides sonst zeigt, gibt es dort nicht.

Rechts bleibt unter `md` nur, was beim Arbeiten sichtbar bleiben muss: Synchronisierung und Meldungen. „KI fragen“, Rollenumschalter, Sprache und Farbschema stehen erst ab `md` wieder in der Kopfzeile; darunter sind sie über die untere Leiste und das Konto-Blatt erreichbar. Die enge Rechnung oben gilt damit nicht mehr: die Kopfzeile trägt auf dem Handy höchstens zwei Knöpfe.

*Nutzen: hoch · Aufwand: niedrig*

### 7. Die Fach-Oberfläche ist auf 11 px gebaut

Gezählt über `src/`: 262 Mal `text-xs` (12 px), 190 Mal `text-[11px]`, 28 Mal `text-[10px]`, 134 Mal `text-sm` (14 px). Beschriftungen in Formularen, Statustexte, Tabellenköpfe und Hilfszeilen liegen fast durchgehend bei 11 px.

Auf 15 Zoll Bildschirm ist das dichte, gut lesbare Erfassungsmaske. In der Hand, bei Sonne auf dem Feld, ist es die Größe, bei der man das Telefon näher ans Gesicht hält. Für Punkt 19 des UX-Audits (Dichte-Umschaltung) ist das der eigentliche Hebel: nicht eine Einstellung für Nutzer, sondern eine Stufe weniger Dichte unterhalb von `md`.

*Vorschlag:* Nicht 480 Klassen einzeln anfassen. Stattdessen zwei, drei Textgrößen als Tokens im `@theme`-Block definieren (etwa `--text-label`, `--text-body-dense`) mit einem `clamp()`, das unter 640 px eine Stufe größer wird, und die Bausteine in `kit.tsx` und `formular-kit.tsx` darauf umstellen. Die Module erben es, weil sie diese Bausteine benutzen. Danach die verbliebenen direkten `text-[10px]` suchen und ersetzen.

*Nutzen: hoch · Aufwand: mittel*

### 8. Berührungsflächen unter 44 px, im Design-System festgeschrieben

Das UX-Audit zählt 19 Bedienelemente unter 44 × 44 px. Die Ursache steht in `DESIGN.md:201`: „Touch-Ziele: Buttons ab `h-9`, Primäraktionen `h-10`" — also 36 px und 40 px. Gezählt: 39 Mal `h-9`, 9 Mal `h-8` (32 px), 8 Mal `h-10`. Der kleinste Fund ist der Löschknopf in der Sync-Warteschlange mit `h-5 w-5`, also 20 px (`sync-status.tsx:197`), ausgerechnet in der Ansicht, die nur die Brigade sieht.

WCAG 2.2 verlangt in 2.5.8 mindestens 24 px (Stufe AA) und empfiehlt in 2.5.5 44 px (Stufe AAA). Mit Handschuhen im Kühlhaus ist 44 px keine Empfehlung mehr, sondern die Grenze zwischen Treffen und Danebentippen.

Solange die Regel in `DESIGN.md` bei 36 px steht, baut jedes neue Modul den Fehler nach. Deshalb steht der Punkt hier und nicht nur im UX-Audit.

*Vorschlag:* Regel ändern auf „ab `md` mindestens 36 px, darunter mindestens 44 px", die Bausteine in `kit.tsx`, `formular-kit.tsx` und `benutzer-fuss.tsx` entsprechend anpassen, `sync-status.tsx:197` auf ein vernünftiges Maß bringen. Wo eine Fläche optisch klein bleiben muss, hilft ein unsichtbarer Klickbereich per `::after`.

*Nutzen: hoch · Aufwand: mittel*

### 9. Scan-Ansicht im falschen Seitenverhältnis

Beide Scan-Felder zeigen das Kamerabild mit `aspect-video w-full object-cover` (`steige-scan-feld.tsx:174`, `ausweis-scan-feld.tsx:172`). Bei 358 px verfügbarer Breite ergibt 16:9 ein Bild von 358 × 201 px — quer, während das Telefon hochkant gehalten wird und der QR-Code auf einer Steige vor einem steht.

Die Knöpfe daneben („Scan starten", „Code eintippen", „Neu scannen") tragen `px-3 py-1.5 text-xs`, sind also rund 27 px hoch. Das ist die Interaktion, die am häufigsten mit Handschuhen stattfindet.

*Vorschlag:* Unter `md` das Kamerabild hochkant (`aspect-[3/4]` oder `aspect-square`) und über die volle Breite. Knöpfe nach der Regel aus Punkt 8. Dazu prüfen, ob `qr-scanner` das Taschenlampen-Schalten des Geräts anbietet — am Sammelpunkt in der Dämmerung ist das der Unterschied zwischen funktioniert und funktioniert nicht.

*Nutzen: hoch · Aufwand: niedrig*

---

## Mittlerer Nutzen

### 10. Kamera-Aufnahme nur bei einem von drei Uploads

`pflueckaufgaben-formulare.tsx:210` setzt `capture="environment"` und öffnet damit direkt die Rückkamera. Der Kommentar darüber erklärt auch, warum. Die beiden anderen Datei-Felder haben das nicht: der Fotobeleg der Lieferung (`lieferungen-formulare.tsx:105`, `accept="image/…"`) und der Dokumenten-Upload (`dokumente-formular.tsx:77`, der auch PDF annimmt).

Beim Lieferungs-Beleg ist das eine reine Auslassung — er nimmt ohnehin nur Bilder an und entsteht am Hof, nicht am Schreibtisch.

*Vorschlag:* `capture="environment"` in `lieferungen-formulare.tsx` ergänzen. Beim Dokumenten-Upload bewusst weglassen, weil dort auch vorhandene PDF ausgewählt werden.

*Nutzen: mittel · Aufwand: sehr niedrig*

### 11. Sync-Panel als Desktop-Popover

`sync-status.tsx:143` öffnet ein `absolute right-0 top-11 w-80` — 320 px breit, absolut an einen 36-px-Knopf gehängt. Bei 390 px Fensterbreite passt das knapp und klebt am rechten Rand. Die Einträge darin sind 11 und 10 px groß, der Löschknopf misst 20 px.

Für die Brigade ist das die wichtigste Anzeige des Systems: Was ist noch nicht übertragen, wo gibt es einen Konflikt. Sie ist derzeit die am kleinsten gebaute Fläche der ganzen Oberfläche.

*Vorschlag:* Unter `md` als Sheet von unten über die volle Breite statt als Popover. Der Zustand ist schon da, nur die Darstellung wechselt.

*Nutzen: mittel · Aufwand: niedrig*

### 12. Karte fängt das Seitenscrollen ab

`tour-karte-inner.tsx:44` setzt die Karte auf feste `height: 320px`, `scrollWheelZoom` ist aus. Am Mausrad ist damit alles richtig. Auf dem Touchgerät greift `scrollWheelZoom` nicht: dort zieht der Finger die Karte, und wer über die Karte hinweg weiterscrollen will, verschiebt stattdessen den Kartenausschnitt.

*Vorschlag:* Leaflet mit `dragging: false` starten, solange die Karte nicht angetippt wurde, oder `tap`-Handhabung über einen Zwei-Finger-Hinweis. Die feste Höhe von 320 px unter `md` auf etwas Bildschirmbezogenes umstellen (`50svh`), sonst bleibt von der Tour wenig erkennbar.

*Nutzen: mittel · Aufwand: niedrig*

### 13. `body` mit `min-h-screen` statt `min-h-svh`

`[locale]/layout.tsx:114` setzt `min-h-screen`, also `100vh`. Das ist auf mobilen Browsern die Höhe *ohne* eingeblendete Adressleiste; die Seite ist damit beim Laden höher als das Sichtfeld und springt beim Scrollen.

Die Dashboard-Hülle macht es bereits richtig (`dashboard/layout.tsx:62`, `min-h-svh`), ebenso Login und die feste Seitenspalte. Es ist genau eine Stelle, die noch fehlt, plus `not-found.tsx:9`.

*Vorschlag:* Beide auf `min-h-svh`.

*Nutzen: mittel · Aufwand: sehr niedrig*

### 14. Kein Breakpoint unter 640 px

`globals.css` enthält keine eigenen Breakpoints; der `@theme inline`-Block (Zeile 40) definiert Farben und Schriften, keine Bildschirmbreiten. Es gilt also die Tailwind-Vorgabe, und der erste Haltepunkt ist `sm` bei 640 px. Media Queries im Stylesheet gibt es nur für `prefers-reduced-motion`, `color-gamut` und Druck.

Zwischen 320 px und 639 px gilt damit überall dasselbe Basis-Layout. Ein iPhone SE mit 375 px und ein großes Android-Gerät mit 430 px bekommen dieselben Maße wie ein 639 px breites Fenster.

*Vorschlag:* Einen `xs`-Breakpoint bei etwa 480 px einführen und dort die Stellen bedienen, an denen es zwischen „ein schmales Telefon" und „ein großes Telefon" wirklich auseinandergeht. Sparsam einsetzen — ein zusätzlicher Haltepunkt, den niemand benutzt, kostet nur Aufmerksamkeit beim Lesen.

*Nutzen: mittel · Aufwand: niedrig*

### 15. Formularraster springt von 1 auf 2 Spalten bei 640 px

Die Verwaltungsformulare folgen durchgehend dem Muster `grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4` (etwa `lohn-formulare.tsx:33`, `finanzen-formulare.tsx:96` mit bis zu sechs Spalten). Unter 640 px stehen alle Felder untereinander, was richtig ist.

Sieben Stellen brechen aus dem Muster aus und setzen `grid-cols-2` oder `grid-cols-3` ohne Breakpoint, gelten also auch auf dem schmalsten Gerät: `logistik-ansicht.tsx:95`, `nachweiskette-ansicht.tsx:142`, `pflueckaufgaben-formulare.tsx:109`, `reklamationen-ansicht.tsx:161`, `sortenkatalog-ansicht.tsx:69`, `herkunft/[code]/page.tsx:173` und `beere-bento.tsx:365`. Bei 358 px verfügbarer Breite ergibt das Wertespalten von 170 px, bei dreispaltig 110 px — für kyrillische Beschriftungen zu wenig.

`herkunft/[code]/page.tsx:173` wiegt schwerer als der Rest: das ist die öffentliche Herkunftsauskunft, die ein Kunde vom QR-Etikett aus aufruft, also fast ausschließlich mobil.

*Vorschlag:* Die sieben Stellen auf `sm:grid-cols-2` umstellen und je Stelle prüfen, ob der Inhalt einspaltig lesbar bleibt.

*Nutzen: niedrig · Aufwand: niedrig*

---

### 16. Das KI-Panel ist am Schreibtisch entworfen — drei Vorschläge

Das Panel ist als **andockbare Spalte neben** dem Hauptfenster gebaut. Der Kommentar in `ki-pane.tsx:16-19` sagt auch warum: der Nutzer soll im Agent-Modus sehen, „wie die Ansicht nebenan mitwandert". Unter 1100 px legt es sich stattdessen als Schublade über die Seite (`ki-pane.css:122-145`). Damit fällt auf dem Handy genau das weg, wofür die Anordnung gedacht war — es gibt kein „nebenan" mehr, die geführte Ansicht liegt vollständig hinter dem Panel.

Dazu kommen fünf Maße, die am Schreibtisch stimmen und in der Hand nicht:

- **Die Breite ist ein Rechenergebnis, kein Entwurf.** `width: min(var(--ki-pane-breite), 100vw)` ergibt bei 390 px Fensterbreite 368 px. Übrig bleibt ein 22 px breiter Streifen der Seite dahinter — zu schmal, um etwas zu zeigen, breit genug, um unruhig zu wirken.
- **Das Eingabefeld löst den iOS-Zoom aus.** `font-size: 0.85rem` (`ki-pane.css:784`), also 13,6 px. Es ist das Bedienelement, das im Chat am häufigsten angetippt wird, siehe Punkt 3.
- **Die Tastatur verdeckt das Eingabefeld.** Das Panel hängt an `inset: 0`, also am Layout-Viewport. Auf iOS schiebt die eingeblendete Tastatur nichts mit, das Feld liegt darunter. Weder `dvh` noch `interactive-widget=resizes-content` sind gesetzt.
- **Der Composer steht im Home-Indicator.** `padding: 0.65rem max(1rem, …) 1rem` (`ki-pane.css:748`), ohne `env(safe-area-inset-bottom)`.
- **Die Kopfknöpfe sind 32 px** (`ki-pane.css:199-200`), drei davon nebeneinander mit 0,15 rem Abstand. Einstellungen, Hilfe und Schließen liegen damit enger beieinander als eine Fingerkuppe breit ist.

Dazu fehlt die Schließgeste, die auf Android erwartet wird: Zurück schließt das Panel nicht, weil es keinen Verlaufseintrag anlegt.

Die fünf Maße sind in jeder der drei Varianten dieselbe Arbeit. Unterschiedlich ist nur, **was das Panel auf dem Handy sein soll**.

#### Variante A: viertes Blatt von unten

Das Panel wird unter `md` ein Blatt wie Menü und Konto: kommt von unten, volle Breite, Höhe `92svh`, Griff oben, Schließen per Klick daneben und per Esc. `ui/sheet.tsx` steht dafür schon.

Der Agent-Modus wird unter `md` stillgelegt — der Schalter verschwindet, der Assistent antwortet, führt aber nicht. Wer führen lassen will, nimmt das Tablet.

*Dafür:* der kleinste Eingriff, und die drei Knöpfe der unteren Leiste verhalten sich alle gleich. Ein Muster statt zweier.

*Dagegen:* eine Funktion weniger auf dem Gerät, auf dem die Brigade arbeitet. Wenn der Agent gerade dort führen soll, wo niemand einen zweiten Bildschirm hat, ist das die falsche Richtung.

#### Variante B: halbes Blatt mit zwei Rastpunkten

Das Blatt öffnet auf halber Höhe (etwa 55 %) und lässt die Seite darüber sichtbar. Ein Zug am Griff schaltet auf Vollbild und zurück; beim Fokus ins Eingabefeld geht es selbst auf Vollbild, weil die Tastatur den Platz ohnehin nimmt.

Damit bleibt der Agent-Modus mobil sinnvoll: die Führungsanzeige aus `ki-fuehrung.tsx` und die wandernde Ansicht liegen in der oberen Hälfte.

*Dafür:* erhält die Kernidee des Panels. Auf dem Telefon der Brigade ist „zeig mir, wo das steht" plausibler als am Schreibtisch, wo man den Weg ohnehin kennt.

*Dagegen:* die aufwendigste Variante. Ziehgeste, zwei Rastpunkte, Zusammenspiel mit der Tastatur und mit der unteren Leiste, die bei halber Höhe sichtbar bleibt und nicht verdeckt werden darf.

#### Variante C: eigene Seite statt Overlay

Unter `md` öffnet der KI-Knopf keine Fläche, sondern führt auf `/dashboard/ki`. Eine gewöhnliche Seite: Zurück schließt sie, die Adresse ist teilbar, die Tastatur verhält sich wie in jedem anderen Formular, und es gibt keine Fokusfalle zu bauen.

*Dafür:* technisch die ruhigste Lösung, die wenigsten Sonderfälle. Ein Gespräch mit dem Assistenten ist auf dem Handy ohnehin eine eigene Tätigkeit und kein Nebenfenster.

*Dagegen:* der Chat existiert dann in zwei Darstellungen (Panel am Schreibtisch, Seite auf dem Handy), die auseinanderlaufen können. Der Agent-Modus müsste die Seite verlassen, um zu führen — technisch machbar über die bestehende Führungsanzeige, aber erklärungsbedürftig.

**Empfehlung:** A, wenn der Agent-Modus auf dem Handy verzichtbar ist; B, wenn er dort gebraucht wird. C ist die sauberste Lösung, kostet aber eine zweite Darstellung desselben Chats — das lohnt sich erst, wenn der Chat auf dem Handy mehr wird als eine Nebenfunktion.

*Nutzen: hoch · Aufwand: A niedrig, B hoch, C mittel*

---

## Reihenfolge der Umsetzung

**Erste Etappe, Fundament (Punkte 3, 4, 5, 13, 10).** Manifest, Safe-Area, `svh`, Feldgröße gegen den iOS-Zoom, das fehlende `capture`. Zusammen ein knapper Tag, kein Umbau an bestehenden Ansichten, und danach ist das Portal auf dem Startbildschirm installierbar und im Feld ohne Zoom-Sprünge bedienbar.

**Zweite Etappe, Navigation und Kopfzeile (Punkte 2, 6) — erledigt am 20.09.2026.** Untere Leiste mit Menü, KI und Konto; Menüknopf und seitliche Schublade entfallen, die Kopfzeile trägt unter `md` Bildmarke und Namen. Offen geblieben ist daraus Punkt 16: das KI-Panel hängt jetzt am neuen Knopf, ist aber noch die alte Schublade von rechts.

**Dritte Etappe, Maße (Punkte 7, 8, 15).** Textgrößen als Tokens, Berührungsflächen, die sieben festen Raster. Zuerst `DESIGN.md:201` ändern, dann die Bausteine, dann die Einzelfunde — in dieser Reihenfolge, sonst weicht die Umsetzung wieder von der dokumentierten Regel ab.

**Vierte Etappe, Feldarbeit (Punkte 1, 9, 11, 12).** Der Tabellen-Umbau ist der größte Brocken und gehört mit Punkt 2 des UX-Audits in dasselbe Vorhaben: eine Tabellen- und Suchschicht, die Sortieren, Blättern und die Kartendarstellung unter `md` gemeinsam trägt. Scan-Ansicht, Sync-Sheet und Karte sind unabhängig davon und können jederzeit vorgezogen werden.

**Fünfte Etappe, KI auf dem Handy (Punkt 16).** Wartet auf die Entscheidung zwischen den drei Varianten. Die fünf Maße daraus — Breite, Schriftgröße im Eingabefeld, Tastatur, Safe-Area, Knopfgrößen — sind in jeder Variante dieselbe Arbeit und können vorgezogen werden.

Punkt 14 fällt an, sobald eine Etappe einen Haltepunkt unter 640 px braucht, und nicht vorher.

## Was dieser Branch nicht anfasst

Die Marketingseite ist mobil bereits gebaut: `navbar.tsx:74-110` hat eine eigene Schublade mit 44-px-Zielen und 16-px-Text, die Anmeldeseite nutzt `min-h-svh` und `h-11`-Knöpfe. Der Handlungsbedarf liegt im Dashboard, nicht davor.

Ebenfalls außen vor bleibt die Frage, ob einzelne Module auf dem Telefon überhaupt gebraucht werden. Lohnabrechnung, Fördermittel und Mehrwertsteuer sind Büroarbeit. Sie müssen bedienbar sein, wenn jemand sie aufruft, aber sie rechtfertigen keinen eigenen mobilen Entwurf.
