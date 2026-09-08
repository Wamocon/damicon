"use client";

import { useEffect } from "react";

// Anforderung 2.5, Phase 7: registriert public/sw.js. Die Versionskennung
// haengt als Query-Parameter an der Skript-URL - der Service Worker selbst
// liest sie aus self.location.search und baut daraus seinen Cache-Namen
// (siehe Kommentar in sw.js). Ohne diese Versionierung wuerde ein neues
// Deployment (neue, inhaltsadressierte /_next/static/-Dateinamen) eine alte,
// gecachte Seite mit Verweisen auf nicht mehr existierende Assets
// hinterlassen koennen.
//
// Kein Registrierungsversuch, wenn der Browser Service Worker gar nicht
// unterstuetzt (aeltere Browser, manche eingebetteten WebViews) - kein
// Fehler, die Seite funktioniert dann einfach ohne dieses zusaetzliche
// Offline-Netz weiter.
export function ServiceWorkerRegistrierung({ version }: { version: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(version)}`)
      .catch((error: unknown) => {
        console.error("[damicon] Service Worker nicht registriert:", error);
      });
  }, [version]);

  return null;
}
