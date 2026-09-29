// Haptische Rueckmeldung (DESIGN.md Abschnitt 9, Entscheidung vom 28.09.2026).
//
// Nur bei Ereignissen, nicht bei jedem Tippen: gespeichert, abgelehnt,
// gezaehlt. Einen Schalter zum Abstellen gibt es bewusst nicht - wer das
// Vibrieren nicht will, stellt es am Geraet ab, und das gilt dann auch hier.
//
// Zwei Wege, weil die Browser zwei Welten sind:
//
//   Android (Chrome, Edge, Samsung Internet) kennt navigator.vibrate und
//   darf auch nach dem Speichern noch vibrieren, solange die Seite schon
//   einmal eine echte Beruehrung hatte (sticky activation). Dort gibt es
//   deshalb je Ereignis ein eigenes Muster.
//
//   iPhone (Safari und jeder andere iOS-Browser, alle auf WebKit) kennt
//   navigator.vibrate nicht. Seit iOS 18 tickt aber ein Schalter
//   (<input type="checkbox" switch>) beim Umschalten - und nur, wenn das
//   unmittelbar in einer echten Beruehrung passiert. Ein Tick nach dem
//   Speichern ist dort also nicht moeglich, nur einer beim Tippen selbst.
//   haptikTipp() gehoert deshalb in den Klick-Handler des Knopfes, der das
//   Ereignis ausloest, nicht in den Effekt danach.
//
// Firefox hat navigator.vibrate mit Version 129 entfernt; dort bleibt es
// still. Desktop-Browser ohne Vibrationsmotor ignorieren den Aufruf.

type Ereignis = "erfolg" | "fehler";

const MUSTER: Record<Ereignis, number[]> = {
  // Kurz, Pause, etwas laenger: "erledigt".
  erfolg: [14, 70, 22],
  // Drei gleiche Stoesse: deutlich anders als Erfolg, auch ohne hinzusehen.
  fehler: [36, 60, 36, 60, 36],
};

function kannVibrieren(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

/** Android: Muster zum Ereignis. Auf dem iPhone ohne Wirkung. */
export function haptikEreignis(ereignis: Ereignis): void {
  if (!kannVibrieren()) return;
  // Ohne fruehere Beruehrung verweigert Chrome das Vibrieren und schreibt
  // eine Warnung in die Konsole. Das passiert etwa, wenn ein Formular nach
  // dem Neuladen schon mit einem Ergebnis erscheint.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  navigator.vibrate(MUSTER[ereignis]);
}

/**
 * iPhone: ein Tick, direkt aus dem Klick-Handler aufgerufen. Auf Android
 * ohne Wirkung - dort meldet sich haptikEreignis(), sobald das Ergebnis da
 * ist, und ein zusaetzlicher Stoss beim Tippen waere doppelt.
 */
export function haptikTipp(): void {
  if (typeof window === "undefined" || kannVibrieren()) return;
  if (!window.matchMedia("(pointer: coarse)").matches) return;
  // Unsichtbar und ausserhalb jedes Formulars: der Schalter darf weder
  // Fokus nehmen noch in einem FormData auftauchen.
  const beschriftung = document.createElement("label");
  beschriftung.ariaHidden = "true";
  beschriftung.style.display = "none";
  const schalter = document.createElement("input");
  schalter.type = "checkbox";
  schalter.setAttribute("switch", "");
  beschriftung.append(schalter);
  document.head.append(beschriftung);
  beschriftung.click();
  beschriftung.remove();
}
