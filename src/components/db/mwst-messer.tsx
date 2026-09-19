"use client";

import { useEffect, useRef } from "react";

// Umsatzmesser der MwSt-Registrierungsschwelle: eine horizontale Fuellung,
// die beim Laden von 0 auf den tatsaechlichen Anteil hochwaechst - dieselbe
// Grundidee wie CountUp (components/site/count-up.tsx), hier auf eine Breite
// statt eine Zahl angewandt. Der Server rendert von vornherein den
// tatsaechlichen Anteil (ohne JavaScript steht sofort der richtige Balken),
// das Mount-Effekt setzt ihn kurz auf 0 zurueck und dann - im naechsten Frame -
// wieder auf den Zielwert, damit die CSS-Transition (globals.css,
// .mwst-messer__fuellung) etwas zu animieren hat statt sofort fertig zu sein.
export function MwstMesser({ anteil }: { anteil: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const geklemmterAnteil = Math.max(0, Math.min(100, anteil));

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    element.style.setProperty("--anteil", "0%");
    const anforderung = requestAnimationFrame(() => {
      element.style.setProperty("--anteil", `${geklemmterAnteil}%`);
    });
    return () => cancelAnimationFrame(anforderung);
  }, [geklemmterAnteil]);

  const kritisch = geklemmterAnteil >= 100;
  const warnung = geklemmterAnteil >= 70;

  return (
    <div
      ref={ref}
      className="mwst-messer h-2 w-full overflow-hidden rounded-full bg-muted"
      style={{ "--anteil": `${geklemmterAnteil}%` } as React.CSSProperties}
      role="progressbar"
      aria-valuenow={Math.round(geklemmterAnteil)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`mwst-messer__fuellung h-full rounded-full ${
          kritisch ? "bg-danger" : warnung ? "bg-warning" : "bg-success"
        }`}
      />
    </div>
  );
}
