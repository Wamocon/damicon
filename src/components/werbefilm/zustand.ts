"use client";

// Ob der Hinweis auf den Werbefilm im Portal noch steht. Wer ihn einmal
// weggeklickt hat, soll ihn nicht bei jedem Anmelden wiedersehen - ein
// Hinweis, der sich nicht abstellen laesst, ist Werbung und keine Hilfe.
//
// Gleiches Muster wie sidebar-zustand.ts: massgeblich ist eine Klasse am
// <html>, die ein kurzes Skript vor dem ersten Paint setzt; localStorage
// daneben haelt die Wahl nur fuer den naechsten Aufruf fest. Ohne das Skript
// stuende der Hinweis im ausgelieferten HTML, verschwaende nach der Hydration
// wieder und schoebe dabei die halbe Uebersicht nach oben.

const SPEICHER = "damicon-werbefilm-weg";

/** Die Klasse am <html>, an der die Sichtbarkeit haengt (globals.css). */
const KLASSE = "werbefilm-weg";

export const werbefilmInitScript = `(function(){try{if(localStorage.getItem('${SPEICHER}')==='1'){document.documentElement.classList.add('${KLASSE}');}}catch(e){}})();`;

/** Merkt sich die Entscheidung und blendet den Hinweis sofort aus. */
export function werbefilmHinweisAusblenden() {
  try {
    localStorage.setItem(SPEICHER, "1");
  } catch {
    // Privater Modus oder gesperrter Speicher: dann gilt die Wahl eben nur
    // fuer diese Sitzung. Die Klasse unten wirkt trotzdem.
  }
  document.documentElement.classList.add(KLASSE);
}
