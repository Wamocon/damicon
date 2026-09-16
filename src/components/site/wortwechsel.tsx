"use client";

import { useEffect, useRef } from "react";

// Ein Wort im Titelbereich wechselt: belegbar bis zum Reihenblock, bis zur
// Kühlminute, bis zur Person. Drei Angaben, die der Untertitel ohnehin nennt -
// hier laufen sie einmal durch und bleiben beim letzten stehen. Keine
// Dauerschleife: Der Titelbereich trägt schon ein laufendes Video.
//
// Wie bei Reveal und dem Orbit steht der Endzustand im Markup. Ohne
// JavaScript und bei reduzierter Bewegung steht das letzte Wort da, und die
// Zeile hat von Anfang an ihre Breite (die Wörter liegen gestapelt im
// Raster, globals.css).
export function Wortwechsel({ woerter }: { woerter: readonly string[] }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const teile = Array.from(element.querySelectorAll<HTMLElement>("[data-wort]"));
    if (teile.length < 2) return;

    teile.forEach((teil, i) => {
      teil.dataset.zustand = i === 0 ? "da" : "wartet";
    });

    const uhren: number[] = [];
    for (let i = 1; i < teile.length; i += 1) {
      uhren.push(
        window.setTimeout(() => {
          teile[i - 1]!.dataset.zustand = "weg";
          teile[i]!.dataset.zustand = "da";
        }, 1500 * i),
      );
    }

    return () => {
      for (const uhr of uhren) window.clearTimeout(uhr);
    };
  }, [woerter]);

  return (
    <span ref={ref} className="wortwechsel">
      {woerter.map((wort, i) => (
        <span key={wort} data-wort data-zustand={i === woerter.length - 1 ? "da" : "wartet"}>
          {wort}
        </span>
      ))}
    </span>
  );
}
