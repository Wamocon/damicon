"use client";

// Welches Element der Assistent gerade hervorhebt.
//
// Zwei Stellen heben hervor: die Navigation (fokussiere in ki-pane-kontext.tsx,
// nach oeffneBereich oder einem Quellenverweis) und das Zeigen auf ein Element
// (zeigeAuf in ui-steuerung.ts). Beide setzen seit jeher nur eine Klasse, die
// kurz aufleuchtet. Der Sprachmodus braucht mehr: er legt einen Rahmen um das
// Ziel, solange der Assistent darueber spricht, und Himbi sieht zu ihm hin. Dafuer
// muss er wissen, WELCHES Element es ist - das steht hier.
//
// Ein Modul mit einem einzigen Zustand, wie lib/hoeren.ts: es gibt genau ein
// hervorgehobenes Ziel, und wer es braucht, liest es ueber useSyncExternalStore.

let ziel: Element | null = null;
const hoerer = new Set<() => void>();

function melde(): void {
  for (const h of hoerer) h();
}

/** Setzt das hervorgehobene Element (oder null: nichts hervorgehoben). */
export function setzeHervorhebung(element: Element | null): void {
  if (ziel === element) return;
  ziel = element;
  melde();
}

export function leseHervorhebung(): Element | null {
  return ziel;
}

export function abonniereHervorhebung(h: () => void): () => void {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

/** Server rendert nie eine Hervorhebung. */
export function hervorhebungServer(): Element | null {
  return null;
}
