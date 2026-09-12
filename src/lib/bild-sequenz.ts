// Scroll-Sequenz: Einzelbilder laden und formatfuellend auf ein Canvas
// zeichnen. Ein <video>, dessen currentTime man beim Scrollen setzt, waere
// sparsamer, springt aber nur so fein, wie die Datei Schluesselbilder hat -
// beim Scrubben ruckelt es dann sichtbar. Einzelbilder sind das Verfahren der
// grossen Produktseiten und brauchen keine Bibliothek.

/** Pfade 00.webp, 01.webp ... Bei `schritt` 2 nur jedes zweite Bild (schmale Viewports). */
export function sequenzPfade(ordner: string, anzahl: number, schritt = 1): string[] {
  const pfade: string[] = [];
  for (let i = 0; i < anzahl; i += schritt) {
    pfade.push(`${ordner}/${String(i).padStart(2, "0")}.webp`);
  }
  return pfade;
}

/** Startet das Laden. `geladen` meldet jedes Bild, sobald es da ist. */
export function ladeSequenz(
  pfade: readonly string[],
  geladen: (index: number) => void,
): HTMLImageElement[] {
  return pfade.map((pfad, index) => {
    const bild = new Image();
    bild.decoding = "async";
    bild.onload = () => geladen(index);
    bild.src = pfad;
    return bild;
  });
}

/** Das naechstgelegene fertige Bild. Beim schnellen Scrollen sind noch nicht alle da. */
export function naechstesGeladenes(
  bilder: readonly HTMLImageElement[],
  index: number,
): HTMLImageElement | null {
  for (let abstand = 0; abstand < bilder.length; abstand++) {
    for (const i of [index - abstand, index + abstand]) {
      const bild = bilder[i];
      if (bild?.complete && bild.naturalWidth > 0) return bild;
    }
  }
  return null;
}

/**
 * Zeichnet wie object-fit: cover. `fokusX` (0 bis 1) bestimmt, welcher Teil
 * stehen bleibt, wenn seitlich beschnitten wird - die Fruechte liegen im
 * Material rechts, auf dem Hochformat-Telefon soll nicht die leere Mitte
 * uebrig bleiben.
 */
export function zeichneFormatfuellend(
  ctx: CanvasRenderingContext2D,
  bild: HTMLImageElement,
  breite: number,
  hoehe: number,
  fokusX = 0.5,
) {
  const massstab = Math.max(breite / bild.naturalWidth, hoehe / bild.naturalHeight);
  const w = bild.naturalWidth * massstab;
  const h = bild.naturalHeight * massstab;
  ctx.drawImage(bild, (breite - w) * fokusX, (hoehe - h) / 2, w, h);
}
