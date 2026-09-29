"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

// Zaehler springt (K4, docs/design/leerzustaende-ladezustaende-2026-09-25).
//
// Steigt der Wert - etwa nach "Steige erfassen", wenn die Seite neu vom
// Server kommt -, springt die Zahl kurz, faerbt sich himbeerrot, und darueber
// steigt "+1" auf. Beim ersten Anzeigen und beim Sinken bleibt sie ruhig: ein
// Sprung soll heissen "gerade dazugekommen".
//
// Keine eigene Haptik: gezaehlt wird, was ein Knopf ausgeloest hat, und der
// meldet sich schon selbst (SubmitKnopf). Kaeme die Zahl von jemand anderem,
// waere ein Vibrieren ohnehin falsch.
export function Zaehler({ wert }: { wert: number }) {
  // Vergleich mit dem letzten Wert waehrend des Renderns (React-Doku,
  // "Storing information from previous renders"). Die Nummer im Schluessel
  // startet die Animation bei jedem Sprung neu.
  const [gesehen, setGesehen] = useState(wert);
  const [sprung, setSprung] = useState<{ nummer: number; plus: number } | null>(null);
  if (wert !== gesehen) {
    setGesehen(wert);
    if (wert > gesehen) setSprung({ nummer: (sprung?.nummer ?? 0) + 1, plus: wert - gesehen });
  }

  return (
    <span className="relative inline-block tabular-nums">
      <span
        key={sprung?.nummer ?? 0}
        className={cn(
          "inline-block",
          sprung && "motion-safe:animate-[zaehler-sprung_360ms_var(--ease-schwung)]",
        )}
      >
        {wert}
      </span>
      {sprung ? (
        <span
          key={`plus-${sprung.nummer}`}
          aria-hidden="true"
          className="pointer-events-none absolute left-full top-0 ml-1 text-xs font-bold text-himbeere opacity-0 motion-safe:animate-[zaehler-plus_650ms_var(--ease-weich)]"
        >
          +{sprung.plus}
        </span>
      ) : null}
    </span>
  );
}
