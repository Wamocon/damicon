"use client";

import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import type { PruefungStand } from "@/components/pruefung/use-pruefung";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Welcher Bericht gilt gerade? Seit dem Reiter-Umbau fragen zwei Stellen danach: der Kopf
// oberhalb der Reiterleiste (tages-kopf.tsx) und der Reiter "Lage" (tages-lage.tsx). Vorher
// stand beides in einer Komponente, die Auswahl also nur einmal.
//
// Zwei Quellen, und beide koennen die juengere sein:
//   - der geteilte Live-Strom aus ceo-pruefung-kontext.tsx (kann ein aelterer automatischer
//     Lauf sein, der Provider haengt am Layout und ueberdauert Seitenwechsel)
//   - der serverseitig geladene Stand (kann durch den manuellen Knopf frischer sein, ohne
//     dass der geteilte Strom je davon erfahren haette)
//
// Entschieden wird schlicht nach erstelltAm, unabhaengig davon, welcher Weg es geliefert hat.
export interface AktuellerBericht {
  bericht: Bericht | null;
  aenderungen: BefundAenderung[];
  /** Der geteilte Stand des Live-Laufs. null heisst: keine ceo/admin-Sitzung (oder Demo-Modus). */
  stand: PruefungStand | null;
}

export function useAktuellerBericht(
  initialBericht: Bericht | null,
  initialAenderungen: BefundAenderung[],
): AktuellerBericht {
  const stand = useCeoPruefung();

  const kandidaten = [
    stand?.bericht ? { bericht: stand.bericht, aenderungen: stand.aenderungen ?? [] } : null,
    initialBericht ? { bericht: initialBericht, aenderungen: initialAenderungen } : null,
  ].filter((k): k is { bericht: Bericht; aenderungen: BefundAenderung[] } => k !== null);

  const aktuell =
    kandidaten.length === 0
      ? null
      : kandidaten.reduce((a, b) => (new Date(b.bericht.erstelltAm) > new Date(a.bericht.erstelltAm) ? b : a));

  return {
    bericht: aktuell?.bericht ?? null,
    aenderungen: aktuell?.aenderungen ?? [],
    stand,
  };
}
