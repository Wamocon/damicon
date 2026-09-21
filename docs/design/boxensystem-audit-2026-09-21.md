# Boxensystem: was die Übersichtsseite vorgibt und wo es gilt

Stand 21.09.2026, nach der Umstellung der Übersichtsseite auf Variante A.

## Was die Übersichtsseite jetzt vorgibt

Drei Ebenen, die vorher nicht unterschieden wurden:

1. **Abschnittsbox.** Jeder Abschnitt der Seite sitzt in einer `Card`: Rahmen, Kartengrund, Schatten, `p-5 sm:p-6`. Darin oben eine Überschrift (`h2`, `text-sm font-bold`) mit einer Zeile Beschreibung, rechts optional eine Statuspille. Auf der Startseite sind das drei: Begrüßung, Zonen, Meilensteine.
2. **Inhaltskarte.** Was innerhalb einer Abschnittsbox als eigene Einheit steht — eine Zonenkarte, ein Meilenstein —, trägt einen gedämpften Grund (`bg-muted/20`), denselben Rahmen und **keinen** Schatten. So bleibt die äußere Box die Box und die innere wird nicht zur zweiten.
3. **Datenbox.** Die kleinste Einheit, hier die Kennzahlbox: voller Kartengrund (`bg-card`), fester Platz für zwei Namenszeilen, Wert auf fester Linie, Fußzeile an `mt-auto`. Im Raster mit `auto-rows-fr`, damit alle gleich hoch sind.

Die Regel dahinter: **Grund und Schatten nehmen nach innen ab, der Rahmen bleibt.** Zwei Karten mit Schatten übereinander sehen aus wie ein Fehler.

## Die Seiten im Einzelnen

### 1. Der zentrale Hebel: `Section` in `src/components/ui/kit.tsx` — **erledigt am 21.09.2026**

`Section` ist jetzt selbst die Abschnittsbox: Rahmen, Kartengrund, Schatten, `p-5 sm:p-6`. Damit ziehen 60 Abschnitte in 25 Modulansichten in einem Schritt nach, ohne dass eine davon angefasst werden musste.

Die drei offenen Fragen sind so entschieden:

- **`DataTable`** behält seinen Rahmen, verliert aber den Kartengrund (`bg-muted/20`). Der Rahmen grenzt die Tabelle nach außen ab, die Fläche wiederholt nicht mehr die ihres Trägers.
- **`Card`** hat jetzt drei Töne (`box`, `innen`, `daten`) und steht voreingestellt auf `innen`. Das trifft die Mehrheit: fast jede Karte im Portal sitzt in einer Abschnittsbox. Die wenigen Karten, die selbst die äußerste Fläche sind — Seitenköpfe, die Sicherheitsseite, die Herkunftsseiten — tragen `ton="box"`. **`Stat`** erbt die Voreinstellung.
- **Der Anker** sitzt an der äußeren Box, ein Verweis hält also vor dem Rahmen statt darin.

Gegenprobe vorab: keine der 28 Dateien verschachtelt `Section` in `Section`. Der Umbau konnte also keine Box in eine Box setzen.

### 2. Bereichsseiten — 4 Seiten — **erledigt am 21.09.2026**

`src/components/dashboard/zone-page-body.tsx`

- Der Kopf sitzt jetzt in einer Abschnittsbox, die Module in einer zweiten mit eigener Überschrift.
- Die Modulkacheln sind Inhaltskarten geworden: `cn(kachelVerweis, "bg-muted/20 p-5 shadow-none")`. tailwind-merge ersetzt `bg-card` und `shadow-sm` aus der Klassenkette, es braucht also keine zweite Variante von `kachelVerweis`.
- Der Rollenhinweis stand frei unter der Seite und gehörte optisch zu nichts. Er erklärt, warum die Liste so aussieht, wie sie aussieht, und steht deshalb jetzt in derselben Box.

### 3. Modulseiten — 26 Seiten — **erledigt am 21.09.2026**

`src/components/dashboard/module-page-body.tsx`

- Der Kopf sitzt in einer Abschnittsbox, der Kasten für „kein Zugriff“ ist jetzt eine `Card` statt einer von Hand gebauten Fläche mit denselben Werten.
- Der Inhalt darunter kommt aus den Modulansichten und ist mit dem `Section`-Umbau nachgezogen. Eine Modulseite trägt jetzt durchgehend Boxen.

### 4. Modulansichten — 25 Dateien, 60 Abschnitte — **mitgezogen am 21.09.2026**

`src/components/db/*-ansicht.tsx`

Die eigentliche Masse. Verteilung der Abschnitte je Datei:

| Abschnitte | Dateien |
|---|---|
| 7 | compliance |
| 6 | personal |
| 5 | b2b-portal |
| 4 | lohn, finanzen |
| 3 | zukauf, standort, sortenkatalog |
| 2 | wetter, stammdaten, rotationsplan, reihenbloecke, qr-steigen, preislisten, logistik, kuehlkette |
| 1 | reklamationen, pflueckaufgaben, pflichtschulungen, pflanzenschutz, kanaele, foerdermittel, einladungen, einarbeitung, dokumente |
| 0 | nachweiskette (baut ohne `Section`) |

- Keine dieser Dateien musste angefasst werden: sie erben alles über `Section`, `Card`, `Stat` und `DataTable`.
- `nachweiskette-ansicht.tsx` fällt aus dem Muster, weil sie ohne `Section` baut, und ist deshalb als Einzige nicht mitgezogen.

### 5. Demo-Ansichten — 2 Dateien — **mitgezogen am 21.09.2026**

`src/components/demo/buero.tsx`, `src/components/demo/markt.tsx`

- Zwei weitere `Section`-Nutzer. Sie zeigen Module, die noch nicht an der Datenbank hängen, stehen aber im selben Rahmen wie die echten.

### 6. Sicherheitsseite — 1 Seite — offen

`src/app/[locale]/dashboard/sicherheit/page.tsx` und `src/components/auth/mfa-verwaltung.tsx`

- `PageHeader` steht weiter frei, die Karte darunter trägt `ton="box"` und steht damit wie vorher. Ein eigener Schritt.

### 7. Öffentliche Seiten — außerhalb des Portals

`src/app/[locale]/herkunft/page.tsx`, `.../herkunft/[code]/page.tsx`, `src/components/site/landing.tsx`

- Die Herkunftsseiten nutzen `PageHeader`, die Landingpage `kachelVerweis`.
- Sie liegen außerhalb des angemeldeten Portals und haben einen eigenen Auftritt. Ob das Boxensystem dort überhaupt gelten soll, ist eine eigene Frage — die Landingpage ist Werbung, kein Arbeitsgerät.

## Reihenfolge, wenn es weitergehen soll

1. ~~Bereichs- und Modulseiten~~ — am 21.09.2026 umgestellt, 30 Seiten über zwei Dateien.
2. ~~`Section` zur Abschnittsbox~~ — am 21.09.2026 umgestellt, siehe Punkt 1.
3. Offen: `nachweiskette-ansicht.tsx` baut ohne `Section` und ist deshalb nicht mitgezogen.
4. Offen: die öffentlichen Seiten. Ihre Karten tragen jetzt `ton="box"`, stehen also wie vorher — ob dort überhaupt ein Boxensystem gelten soll, ist nicht entschieden.
5. Offen: der Dunkelmodus, in keiner Runde geprüft.

## Nicht geprüft

- Der Dunkelmodus. Alle Bilder dieser und der vorangegangenen Runden sind im hellen Modus entstanden.
- Ob die gedämpften Inhaltskarten (`bg-muted/20`) auf allen vier Zonenfarben genug Kontrast haben.
