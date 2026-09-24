# UX-Audit Damicon-Portal

Stand 20.09.2026. Durchsicht des Dashboards aus der Sicht eines ERP-Systems: Code gelesen und die laufende Anwendung im Browser bedient (Chromium über `next-browser`), in Hell und Dunkel, bei 1600 px und bei 390 px Fensterbreite.

Jeder Punkt nennt seine Fundstelle. Wo eine Zahl steht, ist sie gemessen und nicht geschätzt.

**Nicht geprüft:** alle 26 Module einzeln, ein Durchlauf mit echtem Screenreader, Lastverhalten mit Saisondatenmengen. Punkt 3 ist aus dem Code abgeleitet, nicht unter Last gemessen.

## Überblick

| # | Punkt | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| 1 | Globale Suche ist eine Attrappe | sehr hoch | mittel | teilweise |
| 2 | Tabellen ohne Sortieren, Filtern, Blättern | sehr hoch | hoch | offen |
| 3 | Abfragen ohne Zeilenbegrenzung | sehr hoch | hoch | offen |
| 4 | Öffentliche Routen ohne Fehlergrenze | hoch | niedrig | offen |
| 5 | Tastaturbedienung ist unsichtbar | hoch | niedrig | **erledigt** |
| 6 | Löschen ohne Rückfrage | hoch | niedrig | offen |
| 7 | Kein Datenexport | hoch | mittel | offen |
| 8 | Glocke ist eine Attrappe | mittel | niedrig–hoch | offen |
| 9 | Kein Ladezustand beim Modulwechsel | mittel | niedrig | **erledigt** |
| 10 | Breite Tabellen ohne fixierte Kopfzeile | mittel | niedrig | teilweise |
| 11 | Zu kleine Berührungsflächen | mittel | niedrig | teilweise |
| 12 | Keine Brotkrumen | mittel | niedrig | **erledigt** |
| 13 | Sitzungsablauf ohne Vorwarnung | mittel | mittel | offen |
| 14 | Keine Sammelaktionen | mittel | mittel | offen |
| 15 | Keine Tastaturkürzel | mittel | mittel | teilweise |
| 16 | „Ansicht als" auf dem Tablet unerreichbar | mittel | sehr niedrig | teilweise |
| 17 | Unerklärtes Fachkürzel „1Çatı" | mittel | sehr niedrig | **erledigt** |
| 18 | Keine gespeicherten Ansichten | niedrig–mittel | mittel | offen |
| 19 | Keine Dichte-Umschaltung | niedrig | niedrig | offen |
| 20 | KI-Assistent endet in einer Sackgasse | niedrig | sehr niedrig | offen |

---

## Hoher Nutzen

### 1. Die globale Suche ist eine Attrappe

**Teilweise erledigt am 24.09.2026** (Branch `feat/globale-suche`, WMCNL-2484). Stufe 1 der Suche findet Übersicht, Bereiche, Module, Sicherheit, Compliance-Bericht und Handbuch, gefiltert nach der Rolle, dazu unter „Erwähnt in“ Module, deren Seitentext den Begriff nennt. Sie ist auf jeder Breite als Knopf links neben der Glocke erreichbar, auch auf dem Handy, und das Suchfenster geht immer oben in der Mitte des Bildschirms auf. Der Platzhalter sagt jetzt „Seite oder Modul suchen …“. Offen bleibt die Datensatzsuche über Reihenblöcke, Chargen, Pflücker und Dokumente, die der alte Platzhalter versprach: WMCNL-1467. Der Befund unten beschreibt den Stand vor dem Umbau.

In `src/components/dashboard/topbar.tsx:106-109` steht ein `<span>` in einem `<div>`. Kein `<input>`, kein Fokus, keine Funktion. Mit Rahmen, Lupensymbol und dem Platzhalter „Reihenblock, Charge, Pflücker, Dokument suchen …" sieht das Element exakt wie ein Suchfeld aus.

In einem ERP ist die Suche der meistbenutzte Weg zu einem Datensatz. Hier führt sie ins Nichts und ist dabei aktiv irreführend: Nutzer klicken hinein und tippen, bevor sie merken, dass nichts passiert.

*Nutzen: sehr hoch · Aufwand: mittel*

### 2. Tabellen können nichts

`DataTable` nimmt `head: string[]` entgegen (`src/components/ui/kit.tsx:167`). Keine Sortierung, keine Filter, keine Seitenaufteilung, keine Spaltenwahl, keine Zeilenauswahl.

Sortieren nach Datum, Menge oder Status ist für Buchhaltung und Betriebsleitung die Grundoperation. Sie fehlt im gesamten System.

*Nutzen: sehr hoch · Aufwand: hoch*

### 3. Abfragen ohne Zeilenbegrenzung

Von 164 `.select()`-Aufrufen tragen 21 ein `.limit()`. Bei den heutigen Demodaten fällt das nicht auf. Eine echte Saison bringt Tausende Steigen, Chargen und Pflückaufgaben; dann lädt die Seite alles und die Oberfläche steht.

Hängt unmittelbar an Punkt 2: ohne Blättern in der Oberfläche gibt es auch keinen Anlass, serverseitig zu begrenzen. Beides gehört in denselben Umbau.

*Nutzen: sehr hoch · Aufwand: hoch*

### 4. Öffentliche Routen ohne Fehlergrenze

Das Dashboard ist abgesichert (`src/app/[locale]/dashboard/error.tsx`). Darüber liegt keine: weder `src/app/[locale]/error.tsx` noch ein `global-error.tsx`.

Ungeschützt sind damit Landingpage, Login, Einladung und vor allem `/herkunft/[code]` — die Seite, die ein Kunde oder ein Prüfer vom QR-Etikett aus aufruft. Ausgerechnet dort führt ein Fehler zur Absturzseite von Next.js.

> Korrektur zur ersten Fassung dieses Audits: dort stand, es gebe gar keine Fehlergrenze. Das war falsch, die Dashboard-Grenze existiert. Der Befund ist auf die öffentlichen Routen eingegrenzt.

*Nutzen: hoch · Aufwand: niedrig*

### 5. Tastaturbedienung ist unsichtbar

**Erledigt am 20.09.2026** (Branch `redesign-mobile`). Eine Regel in `globals.css` setzt `:focus-visible` global auf `--ring`, ausgenommen sind Himbi und das KI-Panel, die ihren Fokus selbst zeichnen. Global und nicht an den Bausteinen, weil die Regel sonst an jedem neuen Element nachgezogen werden muss — und genau das ist lange nicht passiert.

In der Fach-Oberfläche gibt es **null** `focus-visible:`-Stile bei 238 interaktiven Elementen. `focus-visible` kommt nur im Himbi-Maskottchen (`haustier.css`) und im KI-Panel (`ki-pane.css`) vor.

`DESIGN.md` dokumentiert `--ring` mit ausführlicher Begründung, warum der Wert auf 3:1 nach WCAG 1.4.11 getrimmt ist. Benutzt wird das Token in der Fach-Oberfläche nirgends. Wer im Büro den Tag über Daten erfasst, arbeitet mit Tab und Enter und sieht dabei nicht, wo er steht.

*Nutzen: hoch · Aufwand: niedrig*

### 6. Löschen ohne Rückfrage

In `src/components/db/kanaele-formulare.tsx:41-50` ist „Löschen" ein nackter Submit-Knopf. Keine Rückfrage, keine Rücknahme. Im ganzen Projekt gibt es genau ein `window.confirm`, und das steht im KI-Assistenten.

*Nutzen: hoch · Aufwand: niedrig*

### 7. Kein Datenexport

Einen CSV-Import gibt es (`src/lib/import/zukauf-parser.ts`), einen Export nirgends. Buchhaltung und Betriebsleitung arbeiten mit Excel weiter. Ohne Export bauen sie die Zahlen von Hand nach, oder das System wird umgangen.

*Nutzen: hoch · Aufwand: mittel*

---

## Mittlerer Nutzen

### 8. Die Glocke ist ebenfalls eine Attrappe

`src/components/dashboard/topbar.tsx:117-124`: ein `<button>` ohne `onClick`, mit einem fest eingebauten Punkt, der dauerhaft ungelesene Meldungen suggeriert.

Eine Benachrichtigung, die immer leuchtet und nie etwas zeigt, trainiert Nutzer darauf, Warnungen zu übersehen. Das ist heikel in einem System, dessen Kern Wartezeitsperren und Kühlketten-Alarme sind.

*Nutzen: mittel · Aufwand: niedrig (ausblenden) bis hoch (echt bauen)*

### 9. Kein Ladezustand beim Modulwechsel — erledigt

Es gab nur `dashboard/loading.tsx`. Diese Datei greift ausschließlich beim Eintritt in das Dashboard-Segment, nicht beim Wechsel darunter. Im Browser nachgemessen: beim Klick von „Standorte" auf „Reihenblöcke" erschien kein einziger Knoten mit `aria-busy`.

Behoben durch je ein `loading.tsx` auf Bereichs- und auf Modulebene. Dieselbe Messung danach: Ladezustand erscheint. Alle Skelette hängen jetzt an `prefers-reduced-motion`.

### 10. Breite Tabellen ohne fixierte Kopfzeile und erste Spalte

**Teilweise am 20.09.2026.** Unter `md` wird jede Tabellenzeile zu einer Karte, dort stellt sich die Frage nicht mehr. Die Rechtematrix behält die Tabellenform, scrollt waagerecht und hält die erste Spalte fest. Offen bleibt die fixierte **Kopfzeile** bei langen Tabellen am Schreibtisch; sie gehört in denselben Umbau wie Punkt 2.

Die Rechtematrix ist 845 px breit, gemessen bei 390 px Fensterbreite. Man scrollt waagerecht und verliert dabei die Spalte „Ressource" — danach weiß man nicht mehr, welche Zeile man liest.

*Nutzen: mittel · Aufwand: niedrig*

### 11. Zu kleine Berührungsflächen

**Teilweise am 20.09.2026.** Unter `md` sind 18 Bedienelemente auf 44 px gebracht, Eingabefelder zusätzlich auf 16 px gegen den iOS-Zoom. Am Schreibtisch bleibt es bei 36 px, und das ist eine Entscheidung: die dichte Erfassungsmaske ist dort richtig. `DESIGN.md` führt beide Maße getrennt.

19 Bedienelemente liegen auf dem Handy unter 44 × 44 px. Bei Handschuhen im Kühlhaus und im Feld ist das der Unterschied zwischen Treffen und Danebentippen.

*Nutzen: mittel · Aufwand: niedrig*

### 12. Keine Brotkrumen — erledigt

Die Zonenzeile über dem Seitentitel war reiner Text und bot keinen Weg zurück. Ersetzt durch `src/components/dashboard/brotkrumen.tsx`: „Übersicht › Feld › Pflückaufgaben", die Vorfahren als Links, die aktuelle Seite mit `aria-current="page"`.

Die letzte Station trägt den Kurznamen aus dem Menü, die Überschrift darunter den vollen Titel — so steht nichts wortgleich doppelt da. `PageHeader.eyebrow` nimmt dafür jetzt einen `ReactNode` statt eines `string`; der Träger ist ein `<div>`, weil ein `<nav>` nicht in einem `<p>` liegen darf.

### 13. Sitzungsablauf ohne Vorwarnung

Das ist mir während der Arbeit zweimal selbst passiert: ein Klick, und man steht auf der Anmeldeseite. Das Rückkehrziel bleibt erhalten (`src/proxy.ts:71` setzt `?weiter=`), aber ungespeicherte Formulareingaben sind weg und es gibt keinen Hinweis vorher.

*Nutzen: mittel · Aufwand: mittel*

### 14. Keine Sammelaktionen

Zehn Pflückaufgaben freigeben heißt zehnmal klicken. Mehrfachauswahl mit einer Aktion darauf ist in der Erfassung der eigentliche Zeitgewinn. Setzt Punkt 2 voraus.

*Nutzen: mittel · Aufwand: mittel*

### 15. Keine Tastaturkürzel

**Teilweise erledigt am 24.09.2026** (Branch `feat/globale-suche`, WMCNL-2484). `/` und Strg+K bzw. ⌘K öffnen die Suche, dieselben Kürzel wie im Handbuch; Strg+K geht auch auf russischer und kasachischer Belegung. Offen bleiben Befehlsfeld und „neuer Datensatz“.

Kein Sprung zur Suche, kein Befehlsfeld, kein „neuer Datensatz". Tastaturereignisse werden im ganzen Projekt nur vom Maskottchen behandelt. Vielnutzer im Büro gewinnen dadurch mehr als durch jede optische Verbesserung.

*Nutzen: mittel · Aufwand: mittel*

### 16. „Ansicht als" ist auf dem Tablet unerreichbar

**Teilweise am 20.09.2026 — und der Titel stimmt jetzt wörtlich.** Auf dem Telefon steht der Rollenumschalter im Konto-Blatt der unteren Leiste. Zwischen 768 und 1024 px ist er weiterhin nirgends: die untere Leiste gibt es dort nicht mehr (`md:hidden`), und in der Kopfzeile trägt er unverändert `hidden lg:inline-flex`. Genau die Tablet-Lücke, die dieser Punkt meint, besteht also fort.

Der `PersonaSwitcher` trägt `hidden lg:inline-flex`. Unter 1024 px fehlt er. Gerade die Administration prüft Rollen aber gern am Gerät des Nutzers.

*Nutzen: mittel · Aufwand: sehr niedrig*

### 17. Unerklärtes Fachkürzel auf der Rollen-Seite

**Erledigt am 20.09.2026.** Die Entsprechung steht jetzt am Fuß der Rollenkarte, mit übersetzter Beschriftung („Vorsystem 1Çatı") und ohne Versalien. Der Wert bleibt der Bezeichner aus dem Altsystem — etwas anderes wäre erfunden.

In `src/components/demo/buero.tsx:36` steht `1Çatı:` fest im JSX, also in allen fünf Sprachen unübersetzt. Die Werte daneben sind rohe Schlüssel („admin", „manager"). Dass damit die entsprechende Rolle im Vorgängersystem gemeint ist, steht nur im Quelltextkommentar von `rbac.ts`.

Für einen Prüfer vor Ort ist das eine offene Frage. (Der Name selbst ist korrekt, kein Zeichensatzfehler — das Vorgängersystem heißt so.)

*Nutzen: mittel · Aufwand: sehr niedrig*

---

## Kleinerer Nutzen

### 18. Keine gespeicherten Ansichten

Wer jeden Morgen dieselbe Auswahl trifft, stellt sie jeden Morgen neu ein. Setzt Punkt 2 voraus.

*Nutzen: niedrig bis mittel · Aufwand: mittel*

### 19. Keine Dichte-Umschaltung

Der Schreibtisch will viele Zeilen, das Tablet im Kühlhaus große Flächen. Aktuell gilt eine Größe für beides.

*Nutzen: niedrig · Aufwand: niedrig*

### 20. Der KI-Assistent endet in einer Sackgasse

„Der KI-Assistent ist derzeit nicht eingerichtet. Bitte wenden Sie sich an unser Büro." Daneben steht ein Eingabefeld, das weiter zum Tippen einlädt. Entweder das Feld sperren oder sagen, was konkret fehlt.

*Nutzen: niedrig · Aufwand: sehr niedrig*

---

## Reihenfolge der Umsetzung

Die Punkte 4, 5, 6, 16, 17 und 20 sind zusammen etwa ein Tag Arbeit und beseitigen die Mehrzahl der sichtbaren Kanten.

Die Punkte 1, 2 und 3 gehören zusammen und sind das eigentliche Projekt: eine Tabellen- und Suchschicht, auf der alle Module aufsetzen. Punkte 14 und 18 fallen danach fast von selbst ab. Solange diese Schicht fehlt, vergrößert jedes neue Modul die Lücke.
