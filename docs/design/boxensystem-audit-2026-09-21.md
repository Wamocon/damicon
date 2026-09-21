# Boxensystem: was die Übersichtsseite vorgibt und wo es noch fehlt

Stand 21.09.2026, nach der Umstellung der Übersichtsseite auf Variante A.

## Was die Übersichtsseite jetzt vorgibt

Drei Ebenen, die vorher nicht unterschieden wurden:

1. **Abschnittsbox.** Jeder Abschnitt der Seite sitzt in einer `Card`: Rahmen, Kartengrund, Schatten, `p-5 sm:p-6`. Darin oben eine Überschrift (`h2`, `text-sm font-bold`) mit einer Zeile Beschreibung, rechts optional eine Statuspille. Auf der Startseite sind das drei: Begrüßung, Zonen, Meilensteine.
2. **Inhaltskarte.** Was innerhalb einer Abschnittsbox als eigene Einheit steht — eine Zonenkarte, ein Meilenstein —, trägt einen gedämpften Grund (`bg-muted/20`), denselben Rahmen und **keinen** Schatten. So bleibt die äußere Box die Box und die innere wird nicht zur zweiten.
3. **Datenbox.** Die kleinste Einheit, hier die Kennzahlbox: voller Kartengrund (`bg-card`), fester Platz für zwei Namenszeilen, Wert auf fester Linie, Fußzeile an `mt-auto`. Im Raster mit `auto-rows-fr`, damit alle gleich hoch sind.

Die Regel dahinter: **Grund und Schatten nehmen nach innen ab, der Rahmen bleibt.** Zwei Karten mit Schatten übereinander sehen aus wie ein Fehler.

## Wo das noch nicht gilt

### 1. Der zentrale Hebel: `Section` in `src/components/ui/kit.tsx`

- `Section` rendert heute nur Überschrift, Beschreibung und Inhalt — **ohne Rahmen, ohne Grund**. Sie ist im Projekt 64-mal im Einsatz, davon 60-mal in den Modulansichten unter `src/components/db/`.
- Die Startseite benutzt sie nach dem Umbau nicht mehr; sie baut ihre Abschnittsboxen von Hand. Das ist der eigentliche Bruch: es gibt jetzt zwei Muster für dasselbe.
- Wird `Section` zur Abschnittsbox, zieht der größte Teil des Portals in einem Schritt nach. Das ist der Hebel — und zugleich der Punkt, an dem die Entscheidung fällt, weil alles darin dann eine Ebene tiefer rutscht.

**Was dabei zu klären ist:**

- `DataTable` bringt schon `rounded-xl border border-border bg-card` mit. In einer Abschnittsbox stünde damit Karte auf Karte. Sie müsste auf den Stand einer Inhaltskarte (gedämpft, ohne eigenen Grund) oder ganz ohne Rahmen laufen.
- `Card` und `Stat` werden in den Ansichten direkt in `Section` gesetzt. Beide tragen heute vollen Kartengrund und Schatten und müssten zur Inhaltskarte werden.
- `Section` trägt an einigen Stellen ein `id` als Sprungziel samt `scroll-mt-20` (Risiko-Radar). Beim Umbau muss der Anker an der äußeren Box bleiben, sonst springt der Verweis in den Rahmen statt davor.

### 2. Bereichsseiten — 4 Seiten — **erledigt am 21.09.2026**

`src/components/dashboard/zone-page-body.tsx`

- Der Kopf sitzt jetzt in einer Abschnittsbox, die Module in einer zweiten mit eigener Überschrift.
- Die Modulkacheln sind Inhaltskarten geworden: `cn(kachelVerweis, "bg-muted/20 p-5 shadow-none")`. tailwind-merge ersetzt `bg-card` und `shadow-sm` aus der Klassenkette, es braucht also keine zweite Variante von `kachelVerweis`.
- Der Rollenhinweis stand frei unter der Seite und gehörte optisch zu nichts. Er erklärt, warum die Liste so aussieht, wie sie aussieht, und steht deshalb jetzt in derselben Box.

### 3. Modulseiten — 26 Seiten — **Kopf erledigt am 21.09.2026**

`src/components/dashboard/module-page-body.tsx`

- Der Kopf sitzt in einer Abschnittsbox, der Kasten für „kein Zugriff“ ist jetzt eine `Card` statt einer von Hand gebauten Fläche mit denselben Werten.
- **Was darunter steht, folgt dem System noch nicht.** Der Inhalt kommt aus den Modulansichten, und die bauen auf `Section` — Punkt 1 dieser Liste. Bis der umgestellt ist, trägt die Modulseite einen gerahmten Kopf über rahmenlosen Abschnitten. Das ist sichtbar und wird erst mit `Section` rund.

### 4. Modulansichten — 25 Dateien, 60 Abschnitte

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

- Sie alle erben, was an `Section` entschieden wird. Einzeln anzufassen wären sie nur dort, wo `Card`, `Stat` oder `DataTable` direkt darin stehen und eine Ebene tiefer müssen.
- `nachweiskette-ansicht.tsx` fällt aus dem Muster und braucht eine eigene Durchsicht.

### 5. Demo-Ansichten — 2 Dateien

`src/components/demo/buero.tsx`, `src/components/demo/markt.tsx`

- Zwei weitere `Section`-Nutzer. Sie zeigen Module, die noch nicht an der Datenbank hängen, stehen aber im selben Rahmen wie die echten.

### 6. Sicherheitsseite — 1 Seite

`src/app/[locale]/dashboard/sicherheit/page.tsx` und `src/components/auth/mfa-verwaltung.tsx`

- `PageHeader` frei, darunter `Card` direkt auf dem Hintergrund — also Datenbox ohne Abschnittsbox darum.

### 7. Öffentliche Seiten — außerhalb des Portals

`src/app/[locale]/herkunft/page.tsx`, `.../herkunft/[code]/page.tsx`, `src/components/site/landing.tsx`

- Die Herkunftsseiten nutzen `PageHeader`, die Landingpage `kachelVerweis`.
- Sie liegen außerhalb des angemeldeten Portals und haben einen eigenen Auftritt. Ob das Boxensystem dort überhaupt gelten soll, ist eine eigene Frage — die Landingpage ist Werbung, kein Arbeitsgerät.

## Reihenfolge, wenn es weitergehen soll

1. ~~Bereichs- und Modulseiten~~ — am 21.09.2026 umgestellt, 30 Seiten über zwei Dateien.
2. `Section` zur Abschnittsbox machen und dabei `DataTable`, `Card` und `Stat` auf die innere Ebene setzen. Damit sind 60 von 64 Abschnitten erledigt — und die Modulseiten sind fertig, die heute noch einen gerahmten Kopf über rahmenlosem Inhalt tragen.
3. Sicherheitsseite und `nachweiskette-ansicht.tsx` einzeln nachziehen.
4. Öffentliche Seiten getrennt entscheiden.

## Nicht geprüft

- Der Dunkelmodus. Alle Bilder dieser und der vorangegangenen Runden sind im hellen Modus entstanden.
- Ob die gedämpften Inhaltskarten (`bg-muted/20`) auf allen vier Zonenfarben genug Kontrast haben.
