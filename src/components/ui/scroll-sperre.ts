"use client";

import { useEffect } from "react";

// Solange eine Ebene ueber der Seite liegt - ein Blatt, die KI-Buehne, das
// KI-Panel auf dem Handy, ein Abzeichen -, scrollt die Seite dahinter nicht
// mit. Eine Stelle fuer alle, vorher waren es vier Kopien.
//
// Gesperrt wird am <html>, nicht am <body>. Das <html> traegt
// overflow-x: clip, und damit reicht der Browser ein overflow des <body>
// nicht mehr an das Fenster weiter: der <body> wurde selbst zum
// Scrollcontainer, die klebende Kopfzeile klebte an ihm statt am Fenster
// und verschwand bei gescrollter Seite nach oben - die Seitenleiste mit ihr.
// Dass die Scrollleiste dabei verschwindet, faengt scrollbar-gutter am
// <html> ab (globals.css), sonst sprang das Layout um ihre Breite.
//
// Ein Zaehler statt einer Kopie des alten Werts je Ebene: liegen zwei Ebenen
// uebereinander, gibt erst die letzte die Seite wieder frei, gleich in
// welcher Reihenfolge sie schliessen.

let sperren = 0;
let vorher = "";

export function useScrollSperre(aktiv: boolean) {
  useEffect(() => {
    if (!aktiv) return;
    const wurzel = document.documentElement;
    if (sperren === 0) {
      vorher = wurzel.style.overflow;
      wurzel.style.overflow = "hidden";
    }
    sperren += 1;
    return () => {
      sperren -= 1;
      if (sperren === 0) wurzel.style.overflow = vorher;
    };
  }, [aktiv]);
}

/** Liegt gerade eine Ebene ueber der Seite? Tastenkuerzel schweigen dann. */
export function seiteGesperrt(): boolean {
  return sperren > 0;
}
