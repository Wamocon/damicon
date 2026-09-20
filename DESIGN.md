# Damicon – Design-System

Stand 19.09.2026. Beschreibt, was im Code steht, nicht einen Wunschzustand. Quellen: `src/app/globals.css` (Tokens), `src/components/ui/kit.tsx` (Bausteine), `src/components/dashboard/`, `src/components/brand/damicon-logo.tsx`, `src/components/ki/ki-pane.css`. Bei Abweichungen gilt der Code; diese Datei wird nachgezogen.

## 1. Charakter

Damicon ist die Betriebssteuerung eines Himbeerbetriebs bei Almaty. Die Oberfläche hat zwei Gesichter:

- **Dashboard** (`/[locale]/dashboard`): sachlich, dicht, tabellenlastig. Bedient wird am Schreibtisch, auf dem Tablet im Kühlhaus und auf dem Handy auf dem Feld.
- **Marketingseite** (`/[locale]`): größere Schrift, Bewegung beim Scrollen, Video und Illustration.

Beide teilen dieselben Tokens. Leitgedanken:

- **Landesfarben statt Fruchtfarben.** Die Marke trägt das Himmelblau (Kök) und das Gold (Altyn) der kasachischen Flagge. Himbeerrot steht nur dort, wo es um die Frucht selbst geht.
- **Beleg vor Behauptung.** Status, Herkunft und Prüfung sind sichtbar und tragen Text, nie nur Farbe.
- **Mehrsprachig von Anfang an.** Deutsch, Englisch, Türkisch, Kasachisch, Russisch. Layouts müssen längere Wörter und kyrillische Sonderbuchstaben (Ә Ғ Қ Ң Ө Ұ Ү Һ І) vertragen.
- **Ruhig.** Bewegung ist Zugabe und immer abschaltbar (`prefers-reduced-motion`).

## 2. Farben

Tokens als CSS-Variablen in `:root` (hell) und `.dark`; Tailwind-Namen über `@theme inline` (`bg-primary`, `text-muted-foreground` usw.). Der Dark Mode wird über die Klasse `.dark` am `<html>` geschaltet (`ThemeToggle`, `ThemeScript`).

### Kern

| Token | Hell | Dunkel | Verwendung |
|---|---|---|---|
| `--background` | `#f6fafb` | `#04161c` | Seitengrund (Dunkel: Nachthimmel, kein Schwarz) |
| `--foreground` | `#0b1e26` | `#e6f4f8` | Fließtext, Überschriften |
| `--card` | `#ffffff` | `rgba(9,33,41,.74)` | Karten, Panels |
| `--primary` | `#00768f` | `#3fd0e6` | Kök: Buttons, Links, aktive Navigation |
| `--primary-foreground` | `#ffffff` | `#01222b` | Text auf Primary |
| `--secondary` | `#e3f2f6` | `rgba(13,47,58,.72)` | ruhige Flächen |
| `--muted` | `#eaf2f4` | `rgba(12,41,51,.58)` | Tabellenkopf, Platzhalter |
| `--muted-foreground` | `#5a7078` | `#9ab8c1` | Hilfstexte, Beschriftungen |
| `--accent` | `#8c6209` | `#f2c14b` | Altyn als **Text**: Steppengold |
| `--border` | `#dbe8ec` | `rgba(255,255,255,.09)` | Linien |
| `--input` | `#cfe0e6` | `rgba(255,255,255,.13)` | Feldrahmen |
| `--ring` | `#0095ac` | `#5fdcef` | Fokusindikator |

### Status

| Token | Hell | Dunkel | Bedeutung |
|---|---|---|---|
| `--success` | `#297956` | `#5ecfa0` | freigegeben, bestanden, im Soll |
| `--warning` | `#945d0c` | `#e8b34a` | fällig, knapp, prüfen |
| `--destructive` | `#c23b4e` | `#fb7185` | überfällig, Sperre, Fehler |

### Marke und Frucht

| Token | Wert | Verwendung |
|---|---|---|
| `--brand-altyn` | `#f2c14b` (beide Schemata) | Gold in Bildmarke und auf dunklen Kacheln; nie als Text auf Hell |
| `--himbeere` | `#b3123f` hell, `#ff5c7a` dunkel (OKLCH-Fassung mit P3-Aufschlag) | Textfarbe für alles, was die Frucht meint |
| `--himbeere-leuchtend` | `#ff5c7a` | auf immer dunklen Flächen (Nachtblau-Kacheln, Szenen) |

### Diagramme und Zonen

| Token | Hell | Dunkel | Ton |
|---|---|---|---|
| `--chart-1` | `#00768f` | `#3fd0e6` | Kök tief |
| `--chart-2` | `#d8a507` | `#f2c14b` | Gold |
| `--chart-3` | `#297956` | `#5ecfa0` | Steppengrün |
| `--chart-4` | `#00afca` | `#8fd6e8` | reines Flaggenblau |
| `--chart-5` | `#b65c33` | `#e08a5f` | Terrakotta (Teppiche, Jurtenbänder) |

Die vier Bereiche haben je eine Akzentfarbe (`src/lib/modules.ts`): **Feld** `--accent`, **Hof** `--chart-5`, **Büro** `--primary`, **Markt** `--warning`.

Die Sidebar hat eigene Tokens (`--sidebar`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`), aktuell mit denselben Werten wie die Kernpalette.

### Kontrastregeln (geprüft, nicht verändern ohne Nachrechnen)

- Reines `#00afca` trägt auf Weiß nur 2,6:1 und ist als Text- oder Buttonfarbe unzulässig. Deshalb `--primary` = `#00768f` (5,5:1); das reine Blau nur als Diagrammfläche (`--chart-4`).
- `--ring` liegt bewusst bei `#0095ac`: WCAG 1.4.11 verlangt 3:1 gegen jede Fläche, auf der ein Fokus liegen kann, auch gegen `--secondary` und `--muted`.
- Statuspillen setzen Text auf einen Grund aus derselben Farbe zu 10–12 %, bei 11 px halbfett. Dort gilt 4,5:1; `--success` (4,64:1) und `--warning` (4,65:1) sind darauf abgedunkelt.
- Gold als Text nur als `--accent` (hell `#8c6209`, 5,1:1). Auf `--primary` sitzt Gold als `--brand-altyn`.
- Status wird nie allein über Farbe vermittelt: immer Text oder Icon dazu.

## 3. Typografie

| Rolle | Schrift | Einbindung |
|---|---|---|
| Überschriften `h1`–`h6` | **Manrope** (`--font-display`, Tailwind `font-heading`) | `next/font`, Gewichte bis 800 |
| Fließtext, Tabellen, Formulare | **Inter** (`--font-sans`) | `next/font` |
| Fallback | Segoe UI, `system-ui`, `sans-serif` | in der `var()`-Kette, damit die 404-Seite im Root-Layout nicht auf Serif fällt |

Beide Familien laden `latin`, `latin-ext`, `cyrillic`, `cyrillic-ext`. Das ist Pflicht: Fehlt ein Subset, zieht der Browser einzelne Zeichen aus einer anderen Schrift, im Kasachischen fällt das sofort auf. Die Schriften werden zur Bauzeit geladen und aus `/_next/static/` ausgeliefert, damit der Service Worker sie offline hat.

Größen im Dashboard (aus `kit.tsx`):

| Element | Klassen |
|---|---|
| Seitentitel | `text-2xl font-black`, ab `md` `text-3xl` |
| Eyebrow über dem Titel | `text-xs font-black uppercase tracking-[0.14em] text-primary` |
| Abschnittstitel | `text-sm font-bold` |
| Beschreibung | `text-sm leading-6 text-muted-foreground` (Seite), `text-xs` (Abschnitt) |
| Kennzahl | `text-2xl font-black` |
| Kennzahl-Label, Tabellenkopf | `text-[11px] font-semibold uppercase tracking-wide text-muted-foreground` |
| Statuspille | `text-[11px] font-semibold leading-4` |
| Tabellentext | `text-sm` |

`font-black` fällt bei Manrope auf 800 zurück; das ist gewollt und braucht keine Korrektur.

## 4. Form, Abstand, Tiefe

**Radien** (`--radius: 0.625rem` als Basis): `sm` 0,6×, `md` 0,8×, `lg` 1×, `xl` 1,4×, `2xl` 1,8×, `3xl` 2,2×.
Karten `rounded-2xl`, Tabellen und Panels `rounded-xl`, Buttons `rounded-lg` bis `rounded-xl`, Statuspillen `rounded-md`, Fortschrittsbalken und Punkte `rounded-full`. Auf den 404-Seiten sind Buttons pillenförmig (`rounded-full`).

**Abstand:** Tailwind-Skala. Kartenpolster `p-5`, Kennzahlkacheln `p-4`, Abschnitte `space-y-3`. Container: `max-width: 80rem`, seitlich `1rem`.

**Tiefe:** flach. Karten bekommen `shadow-sm shadow-black/[0.03]`, die aktive Navigation `shadow-lg shadow-primary/20`. Hover hebt Karten um `-translate-y-0.5` und färbt den Rand in `primary/40`. Keine schweren Schlagschatten.

**Glas:** `.glass` (Karte zu 78 % mit 14 px Weichzeichner) für schwebende Leisten, im Dark Mode 62 %.

**Dashboard-Grund:** `.dashboard-shell` legt über `--background` ein Raster aus 96-px-Linien und einen leichten Verlauf nach Kök. Beim Drucken entfällt er.

## 5. Bausteine (`src/components/ui/kit.tsx`)

| Baustein | Zweck | Kern |
|---|---|---|
| `Card` | Grundfläche | `rounded-2xl border bg-card p-5`, optional `id` als Sprungziel |
| `Section` | Abschnitt mit Titel, Beschreibung, Aktion | `scroll-mt-20` bei gesetztem `id`, damit die fixierte Kopfzeile nichts verdeckt |
| `PageHeader` | Eyebrow, Titel, Beschreibung, Aktionen rechts | untereinander mobil, nebeneinander ab `md` |
| `Stat` | Kennzahlkachel | Label, Wert (auch `CountUp`), Hilfstext, Ton |
| `StatusPill` | Zustand als Kurzlabel | Töne `success`, `info`, `neutral`, `warning`, `danger` |
| `DataTable` | Tabelle | `overflow-x-auto`, `min-w-[640px]`, Kopf auf `muted/40`, Trennlinien `divide-border` |

Ton-Zuordnung der Statuspille: Hintergrund 10–12 %, Text und Rand in der Statusfarbe (Rand 25 %). `info` nutzt `primary`.

**Buttons:** Primär `bg-primary text-primary-foreground`, Höhe `h-10`, `font-bold`, Hover `brightness-110`. Sekundär `border bg-card` mit `hover:bg-muted`. Symbolknöpfe in der Kopfzeile `h-9 w-9 rounded-lg border bg-card`.

**Icons:** `lucide-react`, Standardgröße `h-4 w-4`, `shrink-0`. Bereiche haben feste Symbole: Feld `sprout`, Hof `snowflake`, Büro `briefcase`, Markt `store`.

## 6. Layout

**Dashboard** (`dashboard/layout.tsx`): Flex-Zeile über die volle Höhe (`min-h-svh`) auf `.dashboard-shell`.

1. **Seitenleiste** links (`w-76`, 304 px): Bildmarke und Wortmarke, Kachel mit aktiver Rolle bzw. Persona, Link „Übersicht“, danach die Module in vier auf- und zuklappbaren Bereichsgruppen. Sichtbar ist nur, was die Rolle sehen darf (`hasPermission(role, resource, "view")`). Aktiver Eintrag: `bg-primary text-primary-foreground`. Mobil als Schublade (Menüknopf in der Kopfzeile). Im Einzelnen:

   - **Gruppe statt Einrückung.** Jede Gruppe ist eine eigene Fläche: `rounded-xl`, Rahmen in `--sidebar-border`, kein Grund. Eingerückt wird nicht – die Beschriftungen brauchen die Breite.
   - **Keine Bereichsfarben im Menü.** Rahmen, Symbole und Beschriftungen sind durchgehend neutral. Die einzige Farbe in der Seitenleiste ist die der aktiven Seite (`bg-primary`); auch der Punkt am zugeklappten Bereichskopf trägt sie, weil er genau das meint. Die Bereichsfarben aus `modules.ts` bleiben bestehen und tragen weiterhin Startseite und Bereichs-Orbit – im Menü hätten vier getönte Flächen übereinander nur Unruhe gestiftet.
   - **Eine Spur.** „Übersicht“, Bereichsköpfe und Moduleinträge setzen ihr Symbol in dieselbe 24 px breite Spur: Symbolkante bei 29 px, Textkante bei 63 px, gemessen ab der Kante der Seitenleiste. Der Bereichskopf trägt darin eine gefüllte 24 × 24-Kachel, die Einträge ein blankes 16-px-Symbol in einem `h-4 w-6`-Kasten – nur die Breite wird übernommen, sonst wären Kopf- und Eintragszeile gleich hoch und die Abstufung dahin (Kopf 40 px, Eintrag 36 px).
   - **„Übersicht“ ist ein fünftes Feld.** Sie steht auf derselben Ebene wie die vier Bereiche und bekommt deshalb dieselbe Fläche und dieselbe 24-px-Spur. Ohne diese Fläche hing die Zeile sichtbar lose über vier Karten. Als aktive Seite füllt sie wie jeder aktive Eintrag `bg-primary`.
   - **Zustand.** Zugeklappt zeigt der Kopf die Zahl seiner Einträge, oder einen Punkt in der Bereichsfarbe, wenn die offene Seite in ihm liegt. Gespeichert werden die **offenen** Bereiche in `localStorage` (`damicon-sidebar-bereiche`); Standard ist „keiner offen“, aufgeklappt wird dann nur der Bereich der geöffneten Seite. Das ist eine Höhenfrage: bei 1000 px Fensterhöhe bleiben dem Menü rund 810 px, vier offene Gruppen brauchen gut 1200 px – „alles offen“ hieße also immer Scrollbalken. Mit einer offenen Gruppe passt auch die größte (Büro, neun Einträge) ohne Scrollen, zwei liegen knapp darüber. Der Store liegt auf Modulebene, weil feste Spalte und Schublade gleichzeitig im Baum hängen. Der Bereich der geöffneten Seite klappt auf – nur beim Wechsel des Bereichs, sonst ließe sich der Bereich, in dem man steht, nie zuklappen.
   - **Kurznamen.** Die Einträge tragen `modules.<key>.navTitle`, nicht `title`. Der volle Titel steht im Hover-Text und als Seitentitel. Grund: verfügbar sind 201 px, der längste ausgeschriebene Titel braucht 229 px auf Deutsch und 326 px auf Kasachisch – keine vertretbare Spaltenbreite deckt alle fünf Sprachen ab.
   - **Einklappbar zur Symbolleiste.** Ab `md` lässt sich die Spalte auf 64 px (`w-16`) einklappen; der Zustand liegt in `localStorage` (`damicon-sidebar-schmal`). Eingeklappt zeigt `SidebarRail` nur Bildmarke, Ausklapp-Knopf und fünf Symbole: „Übersicht“ und die vier Bereiche, jedes als Link auf die Bereichsseite, die die Module ohnehin als Kacheln auflistet – deshalb braucht die Leiste kein Ausklapp-Fenster, um brauchbar zu sein. Ohne sichtbare Beschriftung trägt jedes Ziel `aria-label` und `title`. Die Breite wechselt über `transition-[width]`, abgeschaltet unter `motion-reduce`. Die Schublade auf dem Handy klappt nicht ein; sie ist ohnehin nur so lange da, wie man sie braucht.
   - **Markierung in der Symbolleiste.** Der Bereich gilt als aktiv, sobald die geöffnete Seite in ihm liegt, nicht erst auf der Bereichsseite selbst – sonst zeigte die eingeklappte Leiste gar nicht, wo man steht. Für `aria-current` wird dagegen der **genaue** Pfad verglichen: `"page"` nur auf der Bereichsseite, sonst `"true"` für den laufenden Bereich. `useIsActive` taugt dafür nicht, es vergleicht mit Präfix.
   - **Bewegung und Tastatur.** Das Panel läuft über `grid-template-rows` von `0fr` auf `1fr`, abgeschaltet unter `motion-reduce`. Zugeklappte Panels tragen `inert`, sonst blieben ihre Links in Tabreihenfolge und Vorlesereihenfolge. Die Köpfe sind Schaltflächen mit `aria-expanded`/`aria-controls`, der aktive Eintrag trägt `aria-current="page"`.
2. **Hauptspalte:** Kopfzeile (`DashboardTopbar`) mit Sprachumschalter, Theme-Umschalter, Benutzerbereich, Sicherheit, Abmelden und „KI fragen“, dazu die Synchronisationsanzeige. Darunter der Seiteninhalt.
3. **KI-Seitenpanel** rechts, andockbar (siehe 8).

Jede angebundene Ansicht zeigt oben rechts ihre Datenquelle: „Live-Daten“ oder „Beispieldaten“. Im Demo-Modus (keine Supabase-Variablen) ist die Rolle frei umschaltbar.

**Marketingseite:** Navigationsleiste oben, Hero mit Video, Kapitel mit Kamerafahrt-Bildern, Bento „Warum die Himbeere anders ist“, Bereichs-Orbit, 60-Minuten-Szene, Belegkette, häufige Fragen, Fußzeile mit Kontaktkanälen.

**Breiten:** Das KI-Panel hat eigene Grenzen: ab 1280 px `27rem`, darunter `23rem`, auf schmalen Schirmen als Schublade über der Seite. Horizontales Scrollen der Seite ist ausgeschlossen (`overflow-x: clip` auf `html` und `body`); nur Tabellen scrollen in ihrem Behälter.

## 7. Marke

**Bildmarke:** Sonnensiegel (Wahl vom 12.09.2026, Entwurf `docs/design/logo-vorschlaege/c-siegel.svg`). Eine Sonnenscheibe in Himbeerrot über der Steppe in einem Siegelring, elf goldene Strahlen. Umgesetzt als Code-SVG in `damicon-logo.tsx`, damit die Farben aus den Tokens kommen. Die feine Steppenlinie des Entwurfs fehlt bewusst (unter 24 px nur Unruhe). Favicon `src/app/icon.svg`: neun Strahlen, kräftigere Striche.

| Untergrund | Ring und Linien | Frucht | Gold |
|---|---|---|---|
| hell | `#00768f` | `#b3123f` | `#f2c14b` |
| dunkel `#04161c` | `#3fd0e6` | `#ff5c7a` | `#f2c14b` |
| Kachel auf Petrol | Weiß | `#ff5c7a` | `#f2c14b` |
| einfarbig (Prägung, Fax) | alles `#0b1e26` | | |

**Wortmarke:** „Damicon“ in Manrope 800, Laufweite leicht negativ, in der Seitenleiste mit der Zeile der Plattform darunter (`text-[11px] font-semibold`).

**Illustrationen** (`beere-schale.tsx`, `public/belege/*.svg`) behalten ihre Objektfarben: Himbeerrot der Frucht, Blattgrün, Bodenton der Reihen. Sie sind Abbildungen, keine Markenzeichen.

**Browserleiste:** `themeColor` `#00768f` hell, `#04161c` dunkel.

## 8. KI-Seitenpanel

Dateien in `src/components/ki/`. Andockbar rechts, `sticky`, Breite wird animiert (0 auf `--ki-pane-breite`, 0,5 s), die Hauptspalte schrumpft daneben. Der Inhalt hat feste Breite und wird nur aufgedeckt, nicht umbrochen. Karte mit linker Randlinie, `backdrop-filter: blur(18px)`.

Zwei Modi: Assistent (antwortet) und Agent (bedient die Oberfläche; `ki-fuehrung.tsx` zeigt im Hauptfenster, was er tut). Werkzeugaufrufe erscheinen als gestaffelt einblendende Chips (`.werkzeug-chip`), der laufende Zustand als schmaler wandernder Balken (`.ki-agent-status__balken`) statt springender Punkte. Maskottchen: die Himbeere (`himbeere.tsx`).

## 9. Bewegung

| Muster | Umsetzung |
|---|---|
| Einblenden beim Scrollen | `[data-reveal]`; Ausgangszustand hängt am Attribut, ohne JavaScript steht der Inhalt sofort da |
| Gestaffelte Raster | `[data-staffel]`, bis zu 7 Stufen à 70 ms |
| Überschriften aufdecken | `data-art="wisch"`, Maske auf den Kindern (ein beschnittenes Element meldet dem IntersectionObserver in Chrome keine Sichtbarkeit) |
| Kurven | `cubic-bezier(0.22, 1, 0.36, 1)` für Einblenden und Balken, `0.16, 1, 0.3, 1` für das KI-Panel |
| Dauern | 0,25–0,6 s für Übergänge, bis 1,1 s für wachsende Balken |
| Weiches Scrollen | Lenis (`weiches-scrollen.tsx`) |
| Kamerafahrt | scrollgetriebene CSS-Animation, Firefox zeigt das Bild ruhig |

Unter `prefers-reduced-motion: reduce` sind alle Animationen und Übergänge auf 0,01 ms gesetzt, `[data-reveal]` steht sofort sichtbar, View Transitions entfallen, die Leseanzeige wird ausgeblendet.

## 10. Barrierefreiheit

- Skip-Link (`.skip-link`) springt zum Inhalt.
- Fokus über `--ring`, sichtbar auf allen Flächen (3:1).
- Text mindestens 4,5:1, Grafik und Bedienelemente mindestens 3:1.
- Touch-Ziele: Buttons ab `h-9`, Primäraktionen `h-10`.
- `aria-label` und `title` auf reinen Symbolknöpfen.
- `<details>` für häufige Fragen: Die Bedienung kommt vom Browser, nur Zeichen und Einblenden sind gestaltet.
- Texte stehen nicht in Bildern, damit sie übersetzt und vorgelesen werden können.

## 11. Drucken

Etiketten, Pflücker-Ausweise und der Aushang sind für Papier gedacht. Unter `@media print` gilt ein festes Papier-Theme (Weiß, Schwarz, Rand `#999`), unabhängig vom Farbschema, `@page` A4 mit 12 mm Rand. Navigation und Bedienelemente tragen `print:hidden`, das Rasterbild des Dashboards entfällt.

## 12. Regeln für neue Oberflächen

1. Farben nur über Tokens (`bg-primary`, `text-muted-foreground`, `var(--chart-3)`), keine Hex-Werte im Bauteil. Ausnahme: Illustrationen und Bildmarke.
2. Für Karten, Abschnitte, Kennzahlen, Pillen und Tabellen die Bausteine aus `kit.tsx` verwenden statt neue zu bauen.
3. Beide Farbschemata prüfen, dazu die Druckansicht, wenn die Seite gedruckt wird.
4. Jede neue Farbkombination für Text nachrechnen (4,5:1) und im Kommentar bei `globals.css` festhalten, wie beim Bestand.
5. Alle fünf Sprachen durchsehen, vor allem Kasachisch und Russisch bei Tabellenköpfen und Buttons.
6. Bewegung nur mit Rückfall für `prefers-reduced-motion` und ohne JavaScript sichtbar.
7. Keine Farbe als einziger Bedeutungsträger.
8. Kein Schwarz als Grund im Dark Mode: `--background` ist `#04161c`.

## 13. Bekannte Unstimmigkeiten

- **`--himbeere` ist doppelt definiert.** `globals.css` setzt `#b3123f` (hell) bzw. `#ff5c7a` (dunkel) mit OKLCH-Fassung. `ki-pane.css` setzt im `:root` zusätzlich `#d81b60` und wird nur im Dashboard geladen. Dort gilt daher der zweite Wert, in beiden Farbschemata gleich. Im Dashboard sieht das Himbeerrot also anders aus als auf der Marketingseite. Zu klären: umbenennen (`--ki-himbeere`) oder auf den globalen Token umstellen.
- **Sidebar-Tokens** duplizieren die Kernpalette. Wer die Palette ändert, muss beide Blöcke anfassen.
- **Buttons haben kein gemeinsames Bauteil.** Höhe, Radius (`rounded-lg`, `rounded-xl`, `rounded-full`) und Hover sind an den Verwendungsstellen einzeln geschrieben. Ein `Button` in `kit.tsx` würde das vereinheitlichen.
- **Logo-README:** Der Abschnitt „Nächste Schritte“ in `docs/design/logo-vorschlaege/README.md` nennt noch offene Punkte, die mit der Wahl von C teils erledigt sind. Die Form ist außerdem noch nicht im Vektorprogramm nachgezogen.
