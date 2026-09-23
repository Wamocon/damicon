# Werbefilm auf der Seite und im Portal

Stand 23.09.2026. Beschreibt, wie `Damicon_Werbevideo_Final_RU.mp4` eingebunden
ist, warum er das Hero-Video nicht ersetzt und was noch offen ist.

## Warum der Film das Hero-Video nicht ersetzt

Die naheliegende Lesart der Aufgabe war, die Datei hinter `hero-video.tsx` gegen
den Werbefilm zu tauschen. Das führt zu nichts, und zwar aus fünf Gründen, die
alle im bestehenden Code nachzulesen sind:

1. Das Hero-Video ist Hintergrund, kein Bild. Über ihm liegt der Verlauf aus
   `hero.tsx`, der die Textzone mit bis zu 88 % abdeckt. Ein Film, dessen
   Aussage im Bild steht, wäre dort nicht zu sehen.
2. Hintergrundmaterial läuft stumm und in Schleife (`autoPlay muted loop`). Der
   Werbefilm hat Anfang, Ende, Tonspur und ein Schlussbild. Stumm in
   Endlosschleife bleibt davon nichts übrig.
3. `medienErlaubt()` in `lib/bewegung.ts` schaltet das Hero-Video bei
   `prefers-reduced-motion` und im Sparnetz ganz ab. Für Hintergrundbewegung ist
   das richtig. Ein Film, den jemand ausdrücklich sehen will, darf daran nicht
   scheitern.
4. Die Datei ist rund 18 MB gegenüber 2,5 MB beim Hero-Video. Als Hintergrund
   liefe dieser Download bei jedem Seitenaufruf ungefragt mit.
5. Der Film trägt seine Einblendungen fest im Bild, unten mittig auf Russisch.
   Hinter der deutschen Überschrift des Heros stünde damit russischer Text.

Der Film steht deshalb als eigener Abschnitt direkt hinter dem Hero. Das
Hero-Video bleibt unverändert.

## Was eingebaut ist

Drei Dateien unter `src/components/werbefilm/`:

- `spieler.tsx` ist die gemeinsame Fläche für beide Orte. Sie startet nie von
  selbst, lädt bis zum Klick nur das Standbild (`preload="none"`, 64 KB) und
  spielt dann mit Ton. Die eigene Deckfläche verschwindet beim Start, damit sie
  den fest eingebrannten Einblendungen des Films nicht im Weg steht; danach
  bedienen die Bordmittel des Browsers.
- `abschnitt.tsx` ist der Abschnitt der öffentlichen Seite, eingehängt in
  `app/[locale]/page.tsx` zwischen `Hero` und `BeereBento`. Der Abschnitt bleibt
  hell, obwohl der Hero darüber nachtblau ist: zwei dunkle Blöcke hintereinander
  lesen sich als einer.
- `dashboard-hinweis.tsx` ist die Zeile in der Portal-Übersicht, eingehängt in
  `dashboard/home.tsx` hinter der Begrüßung. Sie ist 70 px hoch statt der rund
  360 px, die ein eingebetteter Spieler in dieser Spalte bräuchte. Angesehen
  wird der Film im `Sheet` (`position="mitte"`), das Fokusfalle, Esc und
  abgedunkelten Hintergrund schon mitbringt. Beim Schließen verschwindet das
  Videoelement, der Ton kann also nicht weiterlaufen.

Dazu `zustand.ts` für das Wegklicken der Portal-Zeile. Massgeblich ist eine
Klasse am `<html>`, die ein kurzes Skript vor dem ersten Paint setzt - gleiches
Muster wie `sidebar-zustand.ts`. Über React allein stünde die Zeile im
ausgelieferten HTML, verschwände nach der Hydration wieder und zöge dabei die
halbe Übersicht nach oben.

Die Medienangaben stehen in `lib/site-medien.ts` unter `werbefilm`, die Texte in
`src/messages/*.json` unter `werbefilm` in allen vier Sprachen.

## Der Film, technisch

40,0 s, 1280 × 720, H.264 (avc1) mit AAC-Tonspur bei 48 kHz, 24 Bilder/s,
18,8 MB, also rund 3,7 Mbit/s. Der `moov`-Atom steht vor `mdat`, der Film läuft
also beim Laden an und muss nicht erst vollständig übertragen werden.

Die Fläche der Seite ist nie breiter als 1248 px (Container 80 rem abzüglich
Innenabstand). Das Material wird damit an keiner Stelle hochskaliert.

Inhalt: Luftbild der Anlage vor dem Tienschan, Pflücken von Hand, das Büro mit
Papierbelegen, ein Pflücker mit dem Gerät im Feld, die 60-Minuten-Uhr in der
Anwendung, eine Kundin im Laden, Schlussbild „DAMICON — от куста до чека".

## Standbild

`public/werbefilm-standbild.webp` ist Sekunde 0,6 des Films, 1280 × 720, 64 KB.
Kein zweites Motiv, sondern der Film selbst.

Gezogen wurde es mit Chromium über Playwright: Video über einen lokalen Server
mit Range-Unterstützung ausliefern, `currentTime` setzen, auf
`requestVideoFrameCallback` warten, auf ein Canvas zeichnen, als WebP ausgeben.
Ohne Range-Unterstützung bleibt `seekable` leer und jeder Sprung landet wieder
bei Sekunde 0. Das mitgelieferte ffmpeg von Playwright taugt dafür nicht, es ist
mit `--disable-everything` gebaut und hat keinen H.264-Decoder.

## Was geprüft wurde

Gegen den Produktionsbuild auf Port 3123, mit Chromium:

- Vor dem Klick geht keine Anfrage auf die MP4-Datei hinaus, weder auf der Seite
  noch im Portal. Nur das Standbild wird geladen.
- Nach dem Klick läuft der Film mit Ton (`muted` false, `volume` 1).
- Der Abspielknopf ist per Tabulator erreichbar, Enter startet, und der Fokus
  ist als nachtblauer Ring in der weißen Abspielscheibe zu sehen.
- Esc und ein Klick neben das Blatt beenden die Wiedergabe im Portal; danach
  steht kein Videoelement mehr im Dokument.
- Auf 390 px Breite entsteht kein waagerechter Überlauf.
- In der russischen Fassung fehlen Sprachchip und Sprachhinweis, dort sind sie
  gegenstandslos.
- Der Hinweis im Portal bleibt nach dem Wegklicken auch über einen Neustart
  weg, ohne beim Laden aufzublitzen.
- Hell und dunkel: der Sprachhinweis trägt im Dunkelmodus rund 9:1.

## Offen

- **Untertitel.** Der Film ist auf Russisch vertont. Für Deutsch, Englisch und
  Kasachisch gibt es weder Untertitel noch eine eigene Tonfassung; die Seite
  sagt das vor dem Klick, mehr kann sie nicht tun. `werbefilm.untertitel` in
  `lib/site-medien.ts` ist vorbereitet: liegt eine VTT-Datei vor, trägt der
  Spieler sie als `<track>` nach, ohne dass eine Komponente anzufassen wäre. Die
  Tonspur wurde nicht transkribiert - die Angabe „Russisch" stützt sich auf den
  Dateinamen und die Einblendungen im Bild.
- **Die fest eingebrannten Einblendungen** lassen sich nicht abschalten. Sie
  erscheinen in jeder Sprachfassung. Nur eine neue Fassung des Films ohne
  eingebrannten Text würde das lösen.
- **Dateigröße.** 18,8 MB liegen als Datei im Repository, wie schon
  `hero-himbeere.mp4`. Bei 720p wären 2 bis 2,5 Mbit/s üblich, das wären rund
  10 bis 12 MB statt 18,8. Eine Neukodierung braucht ein vollständiges ffmpeg,
  das hier nicht zur Verfügung stand. Alternativ ließe sich die Datei nach
  Supabase Storage auslagern; dann ändert sich nur `werbefilm.quelle`.
