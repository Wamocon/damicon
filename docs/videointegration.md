# Werbefilm im Hero und im Portal

Stand 23.09.2026. Beschreibt, wo `Damicon_Werbevideo_Final_RU.mp4` läuft, was
der Wechsel gekostet hat und was offen bleibt.

## Entscheidung

Der Werbefilm ist seit dem 23.09.2026 das Bild des Heros und hat das
Rundgangsmaterial der Plantage (`hero-himbeere.mp4`) dort abgelöst. Ein erster
Entwurf hatte den Film stattdessen in einen eigenen Abschnitt unter dem Hero
gestellt, weil ein Stück mit Anfang, Ende und Tonspur andere Eigenschaften hat
als eine Bildtapete. Die Projektleitung hat anders entschieden: der Film gehört
nach oben. Diese Seite hält fest, was daraus folgt, damit die Punkte später
nicht neu gesucht werden müssen.

Einen eigenen Abschnitt für den Film gibt es nicht mehr. Derselbe Film zweimal
auf derselben Seite wäre eine Wiederholung, keine zweite Aussage.

## Wie er im Hero läuft

`src/components/site/hero-video.tsx`:

- **Stumm beim Start, in Schleife.** Stumm ist keine Wahl, sondern Vorgabe
  jedes Browsers: von selbst darf eine Seite keinen Ton machen. Der Film
  beginnt und endet mit derselben Luftaufnahme, die Nahtstelle der Schleife
  fällt deshalb kaum auf.
- **Pause und Ton oben rechts**, zwei Knöpfe zu 44 × 44 px unter der Kopfzeile.
  Nicht unten rechts: dort stehen schon der Tonschalter der Seite und das
  Maskottchen mit seiner Sprechblase. Beide Knöpfe sind mit dem Tabulator
  erreichbar, der Tonknopf trägt `aria-pressed`.
- **Weich eingeblendet.** Das Standbild steht sofort, der Film legt sich
  darüber, sobald wirklich Bilder kommen (`playing`, nicht `canplay`), in einer
  Sekunde Überblendung. Bei reduzierter Bewegung neutralisiert die globale
  Regel in `globals.css` den Übergang, dann steht der Film sofort.
- **`medienErlaubt()` gilt weiter.** Bei reduzierter Bewegung oder im Sparnetz
  fängt nichts von allein an, und `preload` bleibt auf `none`. Anders als
  früher bleibt es dann aber nicht beim Standbild: der Abspielknopf steht da.
- Die Steuerung ist ein Geschwister des Videos, kein Kind. Das Video liegt auf
  `-z-10` hinter der Schrift; ein Knopf darin wäre nicht anzuklicken.

## Was der Wechsel gekostet hat

**Der Verlauf musste nach.** Die Deckung über der Textzone war auf das alte
Rundgangsmaterial abgestimmt, das durchgehend dunkel ist. Der Werbefilm hat
helle Luftaufnahmen. Gemessen wurde Bild für Bild über alle 40 Sekunden: die
Pixel des Videos im Bereich der Überschrift, mit dem Verlauf verrechnet, gegen
Weiß.

| | Mittel | schwächste Stelle | Fläche unter 3:1 |
|---|---|---|---|
| alte Stufen | 8,6 – 15,6:1 | 1,71:1 (Sek. 33,5) | bis 16,3 % |
| neue Stufen | 10,0 – 15,6:1 | 2,56:1 (Sek. 33,5) | bis 8,8 % |

Angehoben wurden die mittleren Stufen des seitlichen Verlaufs: 0,78 statt 0,72
bei 34 %, 0,52 statt 0,34 bei 56 %, 0,20 statt 0,08 bei 76 %. Der Wert bei 0 %
bleibt bei 0,88, die rechte Bildhälfte bleibt frei.

Die 8,8 % beziehen sich auf den vollen Textkasten einschließlich des leeren
rechten Rands; die Schrift selbst endet bei etwa 61 % der Breite, wo die
Deckung bei 0,44 liegt. Die Messung ist also konservativ. Weiter abdunkeln
ginge, kostet dann aber sichtbar Bild.

Der Verlauf für schmale Viewports bleibt unverändert. Dort läuft der Text über
die volle Breite, und 0,66 in der Mitte trägt auch über einem reinweißen Bild
noch 6,2:1.

**Die Startseite lädt jetzt 19 MB.** Gemessen über zwölf Sekunden nach dem
Aufruf: 19,2 MB insgesamt, davon 18,0 MB Video. Vorher waren es 2,5 MB für das
Rundgangsvideo. Der Film läuft in Schleife, die Datei wird also vollständig
geholt. Wer im Sparnetz unterwegs ist oder reduzierte Bewegung eingestellt hat,
lädt weiterhin nur das Standbild (50 KB).

## Im Portal

`src/components/werbefilm/dashboard-hinweis.tsx`: eine 70 px hohe Zeile in der
Übersicht, hinter der Begrüßung. Der Film geht im vorhandenen `Sheet`
(`position="mitte"`) auf, das Fokusfalle, Esc und abgedunkelten Hintergrund
schon mitbringt, und läuft dort mit Ton - der Klick auf die Zeile ist die
Eingabe, die das erlaubt. Beim Schließen verschwindet das Videoelement, der Ton
kann also nicht weiterlaufen. Die Zeile lässt sich wegklicken; gemerkt wird das
über eine Klasse am `<html>`, gleiches Muster wie `sidebar-zustand.ts`.

## Standbild

`public/werbefilm-standbild.webp` ist Sekunde 25,5 des Films: die Kundin mit der
Himbeerschale im Laden, 1280 × 720, 50 KB. Sie steht rechts im Bild, dort, wo
die Schrift des Heros ohnehin nicht hinreicht.

Gezogen mit Chromium über Playwright: Video über einen lokalen Server mit
Range-Unterstützung ausliefern, `currentTime` setzen, auf
`requestVideoFrameCallback` warten, auf ein Canvas zeichnen, als WebP ausgeben.
Ohne Range-Unterstützung bleibt `seekable` leer und jeder Sprung landet wieder
bei Sekunde 0. Das mitgelieferte ffmpeg von Playwright taugt nicht dafür, es
ist mit `--disable-everything` gebaut und hat keinen H.264-Decoder.

Das frühere `hero-standbild.webp` ist damit unbenutzt und entfernt.
`hero-himbeere.mp4` bleibt: seine Tonspur ist weiterhin der Feldton des
Tonschalters.

## Der Film, technisch

40,0 s, 1280 × 720, H.264 (avc1) mit AAC-Tonspur bei 48 kHz, 24 Bilder/s,
18,8 MB, also rund 3,7 Mbit/s. Der `moov`-Atom steht vor `mdat`, der Film läuft
also beim Laden an.

Inhalt: Luftbild der Anlage vor dem Tienschan, Pflücken von Hand, das Büro mit
Papierbelegen, ein Pflücker mit dem Gerät im Feld, die 60-Minuten-Uhr in der
Anwendung, die Kundin im Laden, ein Händler am Rechner, Schlussbild
„DAMICON — от куста до чека".

## Offen und bewusst so

- **Der Film bleibt einsprachig russisch.** Untertitel sind nicht vorgesehen,
  der Hinweis auf die Sprache ist auf Wunsch entfallen. Im Hero läuft er stumm,
  die Sprache fällt also erst auf, wenn jemand den Ton zuschaltet.
- **Die Einblendungen sind fest im Bild** und erscheinen in jeder Sprachfassung.
  Sie sitzen unten mittig; die Schrift des Heros steht oben links, die
  Stat-Karten links unten. Eine Überschneidung ist damit möglich, aber nicht
  die Regel.
- **Dateigröße.** 18,8 MB liegen als Datei im Repository. Bei 720p wären 2 bis
  2,5 Mbit/s üblich, also rund 10 bis 12 MB. Eine Neukodierung braucht ein
  vollständiges ffmpeg, das hier nicht zur Verfügung stand. Alternativ nach
  Supabase Storage auslagern; dann ändert sich nur `werbefilm.quelle`.
- **Zwei Tonschalter auf der Startseite.** Der Knopf im Hero schaltet den Ton
  des Films, der schwebende Knopf unten rechts die Feldgeräusche aus
  `hero-himbeere.mp4`. Beide gleichzeitig an ergibt zwei Tonspuren
  übereinander. Ob der Feldton bleiben soll, ist noch zu entscheiden.
- **Dateiname.** `Damicon_Werbevideo_Final_RU.mp4` bleibt, wie geliefert. Er
  passt nicht zur Kleinschreibung der übrigen Dateien unter `public/`; ein
  Umbenennen wäre eine Zeile in `site-medien.ts`.
