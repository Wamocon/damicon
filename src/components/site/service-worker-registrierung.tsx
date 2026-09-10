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
//
// In der Entwicklung wird bewusst NICHT registriert. Die Versionskennung ist
// dort konstant "dev" (lib/pwa-version.ts, kein VERCEL_GIT_COMMIT_SHA), der
// Cache heisst also ueber alle Neubauten hinweg gleich - und /_next/static/
// wird Cache-First bedient. In der Entwicklung tragen Turbopack-Chunks
// wiederkehrende Dateinamen bei geaendertem Inhalt; die Kombination liefert
// dann beliebig alte Skripte und Stile aus, und Codeaenderungen erscheinen
// nicht mehr im Browser, egal wie oft neu gebaut wird. Nicht zu registrieren
// reicht dafuer nicht: Ein einmal installierter Worker bleibt aktiv, bis er
// abgemeldet wird. Deshalb wird hier aufgeraeumt statt nur uebersprungen.
export function ServiceWorkerRegistrierung({ version }: { version: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      void aufraeumen();
      return;
    }

    navigator.serviceWorker
      .register(`/sw.js?v=${encodeURIComponent(version)}`)
      .catch((error: unknown) => {
        console.error("[damicon] Service Worker nicht registriert:", error);
      });
  }, [version]);

  return null;
}

async function aufraeumen() {
  const registrierungen = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrierungen.map((eintrag) => eintrag.unregister()));

  if ("caches" in window) {
    const namen = await caches.keys();
    await Promise.all(
      namen
        .filter((name) => name.startsWith("damicon-shell-"))
        .map((name) => caches.delete(name)),
    );
  }

  // Die gerade sichtbare Seite haengt weiterhin am alten Worker, bis sie neu
  // geladen wird - sie kann also immer noch aus dem eben geloeschten Bestand
  // stammen. Deshalb einmal neu laden, damit der bereinigte Zustand sofort
  // sichtbar ist. Die Markierung im sessionStorage verhindert eine
  // Dauerschleife, falls das Aufraeumen einmal nicht durchgeht.
  const bereitsBereinigt = sessionStorage.getItem("damicon-sw-bereinigt");
  if (navigator.serviceWorker.controller && !bereitsBereinigt) {
    sessionStorage.setItem("damicon-sw-bereinigt", "1");
    window.location.reload();
  }
}
