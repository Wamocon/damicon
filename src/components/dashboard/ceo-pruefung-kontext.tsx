"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { usePersona } from "@/components/dashboard/persona";
import { usePruefung, type PruefungStand } from "@/components/pruefung/use-pruefung";
import { darfCeoBericht } from "@/lib/pruefung/rollen";

// Haengt am Dashboard-Layout, nicht an der Startseite: der Live-Strom des
// automatischen CEO-Compliance-Laufs (usePruefung gegen /api/ki-pruefung/auto)
// uebersteht damit jeden Seitenwechsel INNERHALB des Dashboards, weil Next.js
// Layout-Komponenten bei einer clientseitigen Navigation zwischen Seiten
// desselben Layouts nicht neu montiert. Nur ein voller Reload oder das
// Verlassen des Dashboards (z. B. Abmelden) reisst die Verbindung wirklich ab.
// Startseite (ceo-auto-pruefung.tsx) und Kopfzeile (topbar.tsx, Hinweis
// waehrend eines laufenden Checks) lesen beide denselben Stand von hier,
// statt je einen eigenen Strom zu oeffnen.

const CeoPruefungContext = createContext<PruefungStand | null>(null);

export function CeoPruefungProvider({ children }: { children: ReactNode }) {
  const { echteRolle, demoModus } = usePersona();
  // Echte Profilrolle, nicht die clientseitig umschaltbare Vorschau-Rolle:
  // eine Admin-Vorschau "als ceo" soll nicht den echten automatischen Lauf
  // einer fremden Person ausloesen (dieselbe Abgrenzung wie zuvor auf der
  // Startseite). Umgekehrt soll eine Vorschau "als kunde" den echten Lauf des
  // Admins nicht abwuergen - auch dafuer ist echteRolle die richtige Frage.
  const aktiv = !demoModus && darfCeoBericht(echteRolle);
  const sprache = useLocale();
  const router = useRouter();
  const { stand, starten } = usePruefung("/api/ki-pruefung/auto");
  const gestartet = useRef(false);

  useEffect(() => {
    if (!aktiv || gestartet.current) return;
    gestartet.current = true;
    void starten([], sprache);
  }, [aktiv, sprache, starten]);

  useEffect(() => {
    if (aktiv && stand.phase === "fertig") router.refresh();
  }, [aktiv, stand.phase, router]);

  return <CeoPruefungContext.Provider value={aktiv ? stand : null}>{children}</CeoPruefungContext.Provider>;
}

/** null: weder ceo noch admin (oder Demo-Modus) - hier gibt es nichts zu zeigen. */
export function useCeoPruefung(): PruefungStand | null {
  return useContext(CeoPruefungContext);
}
