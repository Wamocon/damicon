"use client";

import { useEffect } from "react";

// Loest den Hintergrundlauf einmal je Seitenaufruf aus (app/api/ki-pruefung/
// auto), nicht bei jedem Render: das Ergebnis interessiert diese Komponente
// nicht, die Uebersicht selbst zeigt beim naechsten Laden den neuen Bericht.
// Nur fuer die Rolle ceo eingebunden (siehe home.tsx).
export function CeoAutoTrigger() {
  useEffect(() => {
    fetch("/api/ki-pruefung/auto", { method: "POST" }).catch(() => {
      /* bestenfalls: naechster Login versucht es erneut */
    });
  }, []);
  return null;
}
