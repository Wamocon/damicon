# Videointegration: Ausgangslage im Branch

Stand 23.09.2026, Branch `feat/videointegration`, abgezweigt von `origin/main` (1f94ae4).
Diese Notiz hält fest, was an bewegten Medien schon im Code steht, welche Stellen für ein
Erklär- oder Pitchvideo in Frage kommen und was vor der Umsetzung entschieden werden muss.
Sie beschreibt noch keine Umsetzung.

## Was schon vorhanden ist

Die öffentliche Seite spielt bereits Video ab, allerdings nur als Hintergrundmaterial ohne
Bedienelemente:

- `src/components/site/hero-video.tsx` legt `public/hero-himbeere.mp4` als stumme
  Endlosschleife hinter den Hero. Standbild ist `public/hero-standbild.webp`.
- `src/components/site/loop-clip.tsx` spielt kurze Loops als Bildfläche. Der
  `IntersectionObserver` hält sie an, sobald sie aus dem Sichtbereich laufen, damit nicht
  mehrere Dekoder gleichzeitig arbeiten.
- `src/lib/bewegung.ts` entscheidet zentral, ob bewegte Medien überhaupt laufen:
  `medienErlaubt()` liefert false bei `prefers-reduced-motion` und bei Sparnetz oder
  langsamer Verbindung (`saveData`, `slow-2g` bis `3g`). Jedes neue Video sollte dieselbe
  Prüfung verwenden, nicht eine eigene.
- `src/lib/site-medien.ts` hält alle Medienpfade der öffentlichen Seite samt Textschlüssel.
  Neue Quellen gehören dorthin, nicht ins Markup.
- `src/components/site/ton-schalter.tsx` zeigt, wie Ton in diesem Projekt behandelt wird:
  standardmäßig aus, per Knopf mit `aria-pressed` zuschaltbar, weiche Blende, Pause bei
  Tabwechsel. Die Tonspur kommt aus derselben MP4-Datei (`feldTon`).

Ein `<video>`-Element mit Bedienleiste, Untertiteln oder einer Abspielstatistik gibt es
bisher nirgends. Die beiden weiteren Treffer im Portal (`ausweis-scan-feld.tsx`,
`steige-scan-feld.tsx`) sind Kamerabilder für den QR- und Ausweisscan, keine Wiedergabe.

## Mögliche Stellen für ein Erklärvideo

Die Reihenfolge der Landingpage steht in `src/app/[locale]/page.tsx`. Drei Stellen bieten
sich an, je nach Zweck:

1. Direkt unter dem Hero, vor `BeereBento`: das Video als erste Erklärung der Plattform.
2. Vor oder in `ZonesOverview`, wo die Seite ohnehin vom Portal erzählt.
3. Im Schlussblock `LandingCta` neben dem Handlungsaufruf, als Pitch-Abschluss.

Für das Portal selbst wäre eine vierte Stelle denkbar: ein kurzes Hilfevideo je Modul
oder eine einmalige Einführung auf `src/app/[locale]/dashboard/page.tsx`. Das ist eine
andere Anforderung als das Marketingvideo und sollte nicht im selben Schritt entstehen.

## Offene Entscheidungen

- Welches Video? Die Prozessdokumentation `docs/demo/WAMOCON_Videoerstellung_Prozessdokumentation.docx`
  (nicht versioniert, liegt lokal im Arbeitsbaum) beschreibt einen Ablauf mit Playwright und
  HeyGen für ein 60–90 Sekunden langes Video aus drei Szenen. Ob dieses Video die Vorlage ist
  oder ein anderes, ist noch offen.
- Hosting: Datei unter `public/` wie `hero-himbeere.mp4`, Supabase Storage oder eine externe
  Plattform. Eine Datei im Repository kostet Bandbreite bei jedem Deploy, ein eingebetteter
  Fremdanbieter bringt Einwilligungspflicht nach DSGVO mit sich.
- Sprachen: Die Seite läuft in fünf Sprachen (`src/messages/`). Untertitelspuren je Sprache,
  eine Tonspur je Sprache oder nur deutsch mit Untertiteln?
- Barrierefreiheit: Untertitel und Transkript sind für ein Video mit Sprache Pflicht, nicht
  Beiwerk. Automatische Wiedergabe mit Ton scheidet aus, siehe `ton-schalter.tsx`.

## Prüfstand des Branches

`npm install`, `npm run typecheck` und `npm run lint` laufen auf diesem Branch fehlerfrei
(23.09.2026). Damit ist klar, dass spätere Fehler aus der eigenen Änderung kommen.
