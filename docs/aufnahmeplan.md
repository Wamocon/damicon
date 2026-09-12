# Aufnahmeplan: Makro-Shooting und 3D-Scan

Termin vor Ort: in zwei Wochen, also etwa ab dem 24.09.2026. Die remontierenden Sorten tragen bis zum ersten Frost, danach gibt es bis August 2027 keine Frucht am Strauch mehr.

Die Landingpage läuft bis dahin mit Zwischenmaterial. Jede Aufnahme unten ersetzt genau eine Stelle. Getauscht wird in `src/lib/site-medien.ts`, die Komponenten müssen dafür nicht angefasst werden.

## Allgemeine Vorgaben

- Fotos in voller Auflösung, Export als sRGB, 8 Bit. Das Verkleinern auf WebP übernimmt das Projekt.
- Videos mindestens 1920 × 1080, 25 fps, Stativ, Belichtung und Weißabgleich fixiert.
- Loops: Anfang und Ende müssen zueinander passen (gleiche Position der Hand, der Frucht, des Lichts).
- Keine Personen erkennbar, außer mit schriftlicher Einwilligung.
- Echte Ware aus dem Betrieb. Nichts nachstellen, was es im Ablauf nicht gibt.

## Aufnahmen

| Nr. | Motiv | Vorgaben | Ersetzt auf der Seite | Ablage und Eintrag |
|---|---|---|---|---|
| 1 | Nahaufnahme-Loop: reife Früchte am Strauch | 6 bis 8 s, Makro, ruhige Einstellung, leichter Wind erlaubt | Große Kachel „Keine schützende Haut“ im Bento | `public/clips/nahaufnahme.mp4` plus Standbild, Eintrag `beerenNahaufnahme` (`fokus.zoom` auf 1 setzen) |
| 2 | Loop: Pflücken direkt in die Verkaufsschale | 4 bis 6 s, Hand und Schale formatfüllend | Neue Kachel im Bento („Pflücken in die Verkaufsschale“) | `public/clips/pfluecken.mp4` |
| 3 | Loop: Steige abgeben, Scan am Telefon | 4 bis 6 s, Display lesbar oder bewusst unscharf | Belegkette, Glied „Pflücker“ | `public/clips/scan.mp4` |
| 4 | Loop: Kühlraum, Thermometer bei 0 bis 1 °C | 4 bis 6 s, Anzeige lesbar | 60-Minuten-Szene, Schritt „Vorkühlung“ | `public/clips/kuehlraum.mp4` |
| 5 | Loop: Code auf der Schale scannen | 4 bis 6 s | Belegkette, Glied „Schale scannen“ | `public/clips/schale-scan.mp4` |
| 6 | Drehsequenz Einzelbeere (Scroll-Sequenz) | Drehteller, 72 Bilder im Abstand von 5°, feste Kamera, Makro, gleiches Licht, dunkler Grund | Hintergrund der 60-Minuten-Szene (heute: Frames aus dem Hero-Video) | `public/sequenz/drehung/00.webp` bis `71.webp` (1600 × 900, WebP), Eintrag `sechzigMinutenSequenz` auf `{ ordner: "/sequenz/drehung", anzahl: 72 }` |
| 7 | Panorama der Anlage | mindestens 2560 px breit, Standort wie `anlage-weit.webp` | Kapitelbild über „Echte Aufnahmen statt Stockfotos“ | `public/betrieb/anlage-weit.webp` ersetzen |
| 8 | Makro Druckstelle und auslaufende Beere | wie die vorhandenen Qualitätsfotos (gleicher Grund, gleiches Licht) | Kachel „Eine Beere entwertet die Schale“ | `public/qualitaet/` |
| 9 | Feldton | 60 s Umgebung, ohne Stimmen, Musik und Motoren, Stereo, 48 kHz | Tonschalter unten rechts | `public/ton/feld.m4a` (AAC), Eintrag `feldTon` |
| 10 | 3D-Scan eines Reihenblocks | siehe unten | Abschnitt „3D-Rundgang“, erscheint erst mit dieser Datei | `public/scan/reihenblock.splat`, Eintrag `plantagenScan` |

## 3D-Scan (Gaussian Splatting)

1. Einen Reihenblock mit Wegen auswählen, bei bedecktem Himmel und möglichst ohne Wind aufnehmen. Harte Schatten und bewegte Blätter erzeugen Unschärfe im Scan.
2. Den Block langsam umrunden und einmal durch den Weg gehen: 200 bis 400 Fotos mit viel Überlappung oder 2 bis 3 Minuten Video.
3. Mit einer Software verarbeiten, die Gaussian Splats erzeugt, und als `.splat` (bevorzugt) oder `.ply` exportieren.
4. Zielgröße höchstens 30 MB. Die Größe steht auf dem Ladeknopf und wird in `plantagenScan.megabyte` eingetragen.
5. Eintrag in `src/lib/site-medien.ts`:

```ts
export const plantagenScan = {
  quelle: "/scan/reihenblock.splat",
  format: "splat",
  megabyte: 28,
} as PlantagenScan | null;
```

## Offene Punkte vor der Veröffentlichung

- Die Tonspur des Hero-Videos (`public/hero-himbeere.mp4`) ist zurzeit der Feldton. Sie stammt aus dem Parallelprojekt. Vor dem Livegang einmal anhören und klären, ob Musik darin liegt und wer die Rechte hat. Bis dahin ist der Tonschalter die einzige Stelle, die sie abspielt.
- KI-generierte Bilder (Punkt 13 der Entscheidungstabelle) sind noch nicht erzeugt. Dafür fehlt ein Schlüssel für einen Bildgenerator oder die Freigabe des Higgsfield-Connectors. Falls sie kommen, dann nur als sichtbar gekennzeichnete Platzhalter bis zum Shooting und nie für die Qualitätsfotos, die einen Maßstab belegen.
