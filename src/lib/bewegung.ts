import { useSyncExternalStore } from "react";

// Gemeinsame Bedingungen fuer alles, was sich auf der oeffentlichen Seite von
// selbst bewegt oder zusaetzlich Daten laedt: Hero-Video, Loop-Clips, die
// Bildsequenz der 60-Minuten-Szene, Frostkristalle, weiches Scrollen und der
// Zeiger-Folger. Frueher stand die Netzpruefung nur im Hero-Video; jetzt
// entscheiden alle Stellen nach denselben Regeln.
//
// Die Pruef-Funktionen lesen window/navigator und sind nur im Browser
// aufrufbar. In Komponenten deshalb ueber useBrowserBedingung, das beim
// serverseitigen Rendern immer "nein" liefert.

type NetzInfo = { saveData?: boolean; effectiveType?: string };

export function bewegungReduziert(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Datensparmodus oder langsames Netz: dann bleibt es beim Standbild. */
export function verbindungErlaubtVideo(): boolean {
  const c = (navigator as Navigator & { connection?: NetzInfo }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return c.effectiveType !== "slow-2g" && c.effectiveType !== "2g" && c.effectiveType !== "3g";
}

/** Maus oder Stift mit Hover. Touch-Geraete bekommen keine Zeiger-Effekte. */
export function feinerZeiger(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

/** Selbstlaufende Medien: keine reduzierte Bewegung und kein Sparnetz. */
export function medienErlaubt(): boolean {
  return !bewegungReduziert() && verbindungErlaubtVideo();
}

/** Zeiger-Effekte: feiner Zeiger und keine reduzierte Bewegung. */
export function zeigerEffekteErlaubt(): boolean {
  return feinerZeiger() && !bewegungReduziert();
}

// Muster wie ThemeScript in theme-toggle.tsx: Der Server-Snapshot ist immer
// false, der Client-Snapshot wird nach der Hydrierung einmal ermittelt. Kein
// Abonnement noetig, die Bedingungen aendern sich innerhalb eines Aufrufs
// praktisch nicht.
const nieAbonnieren = () => () => {};
const serverSnapshot = () => false;

export function useBrowserBedingung(pruefen: () => boolean): boolean {
  return useSyncExternalStore(nieAbonnieren, pruefen, serverSnapshot);
}
