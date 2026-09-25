"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";

// Ladezustand der Liste mit Detailansicht (DESIGN.md Abschnitt 14, WMCNL-2488).
//
// Ein Klick auf einen Eintrag, einen Reiter oder einen Filter wartet auf den
// Server. Bei Suchparametern greift kein loading.tsx - Next.js behaelt die
// alte Ansicht, bis die neue da ist (layout-router.js ignoriert die Query im
// Schluessel des Segments). Ohne Rueckmeldung wirkt der Klick wirkungslos.
//
// Der Link weiss, dass er laedt (useLinkStatus), die Flaeche, die sich
// aendern wird, weiss es nicht. Dazwischen steht dieser kleine Speicher: je
// Bereich ein Zaehler, den Melder hoch- und herunterzaehlen. Einer je Seite -
// die Bausteine gehen von einer Liste mit Detailansicht je Seite aus.

type Bereich = "liste" | "detailpanel";

const laufend: Record<Bereich, number> = { liste: 0, detailpanel: 0 };
const hoerer = new Set<() => void>();

function melde(bereich: Bereich, schritt: 1 | -1) {
  laufend[bereich] = Math.max(0, laufend[bereich] + schritt);
  hoerer.forEach((hoeren) => hoeren());
}

function abonniere(hoeren: () => void) {
  hoerer.add(hoeren);
  return () => {
    hoerer.delete(hoeren);
  };
}

function useLaedt(bereich: Bereich): boolean {
  return useSyncExternalStore(
    abonniere,
    () => laufend[bereich] > 0,
    () => false,
  );
}

/** Meldet einen laufenden Wechsel, der nicht ueber einen Link geht (Filterformular). */
export function useLadeMeldung(bereich: Bereich, laeuft: boolean) {
  useEffect(() => {
    if (!laeuft) return;
    melde(bereich, 1);
    return () => melde(bereich, -1);
  }, [bereich, laeuft]);
}

// Erst nach 150 ms sichtbar, damit schnelle Antworten nicht flackern.
const EINBLENDEN = "animate-[lade-einblenden_200ms_ease_150ms_forwards]";

/**
 * Steht in einem Link und zeigt, dass er laedt: ein Punkt. Feste Groesse, nur
 * die Deckkraft wechselt - so springt nichts.
 */
export function LadeMelder({
  bereich,
  className,
}: {
  bereich: Bereich;
  className?: string;
}) {
  const { pending } = useLinkStatus();
  useLadeMeldung(bereich, pending);
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute right-2 top-2 h-2 w-2 rounded-full bg-primary opacity-0",
        pending && EINBLENDEN,
        className,
      )}
    />
  );
}

/** Schmaler Balken unter dem Kopf der Detailansicht, solange sie laedt. */
export function PanelLadebalken() {
  const laedt = useLaedt("detailpanel");
  return (
    <span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary opacity-0",
        laedt && EINBLENDEN,
      )}
    />
  );
}

/** Inhalt der Detailansicht: blasser, solange die naechste Aufgabe laedt. */
export function PanelInhalt({ children }: { children: ReactNode }) {
  const laedt = useLaedt("detailpanel");
  return (
    <div
      aria-busy={laedt || undefined}
      className={cn(
        "min-h-0 flex-1 p-4 transition-opacity duration-knapp",
        "panel-angedockt:overflow-y-auto panel-angedockt:overscroll-contain",
        "panel-schublade:overflow-y-auto panel-schublade:overscroll-contain",
        laedt && "opacity-60",
      )}
    >
      {children}
    </div>
  );
}

/** Eintraege der Liste: blasser, solange ein Filter oder eine Seite laedt. */
export function ListenInhalt({ children }: { children: ReactNode }) {
  const laedt = useLaedt("liste");
  return (
    <div
      aria-busy={laedt || undefined}
      className={cn("space-y-3 transition-opacity duration-knapp", laedt && "opacity-60")}
    >
      {children}
    </div>
  );
}
