"use client";

import { useEffect, useRef } from "react";

// Leseanzeige am oberen Rand: wie weit die Seite gelesen ist. Kein Rechnen je
// Scroll-Ereignis, sondern höchstens ein Frame je Bildwiederholung
// (requestAnimationFrame), und geändert wird nur eine Transformation - Layout
// und Anstrich bleiben unberührt.
//
// Ohne JavaScript und bei reduzierter Bewegung ist der Balken schlicht nicht
// da: globals.css blendet ihn in dem Fall aus, statt eine Linie stehen zu
// lassen, die sich nie bewegt.
export function Fortschrittsbalken() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let angefordert = false;

    const zeichnen = () => {
      angefordert = false;
      const strecke = document.documentElement.scrollHeight - window.innerHeight;
      const anteil = strecke > 0 ? Math.min(1, Math.max(0, window.scrollY / strecke)) : 0;
      element.style.transform = `scaleX(${anteil.toFixed(4)})`;
    };

    const anfordern = () => {
      if (angefordert) return;
      angefordert = true;
      requestAnimationFrame(zeichnen);
    };

    zeichnen();
    window.addEventListener("scroll", anfordern, { passive: true });
    window.addEventListener("resize", anfordern, { passive: true });
    return () => {
      window.removeEventListener("scroll", anfordern);
      window.removeEventListener("resize", anfordern);
    };
  }, []);

  return <div ref={ref} aria-hidden className="fortschrittsbalken" />;
}
