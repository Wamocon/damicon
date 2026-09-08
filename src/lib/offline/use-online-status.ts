"use client";

import { useSyncExternalStore } from "react";

// navigator.onLine ist ein grober, aber fuer den Feldeinsatz ausreichender
// Indikator - ein echter Konnektivitaetstest (Ping gegen den eigenen Server)
// waere praeziser, kostet aber Netzwerk-Overhead genau dann, wenn das Geraet
// ohnehin schon im Zweifel ist. useSyncExternalStore statt useEffect+setState:
// das ist die von React fuer genau diesen Fall (Abonnement auf einen externen
// Browser-Wert) vorgesehene API, ohne den sonst noetigen Zwischenschritt
// "erst falscher Startwert, dann Korrektur nach der Hydration".
function abonnieren(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

function schnappschuss() {
  return navigator.onLine;
}

function serverSchnappschuss() {
  // Waehrend SSR/vor der Hydration gibt es kein navigator.onLine - "online"
  // ist die sichere Annahme, ein echter Offline-Fall korrigiert sich sofort
  // nach der Hydration ueber schnappschuss().
  return true;
}

export function useOnlineStatus(): boolean {
  return useSyncExternalStore(abonnieren, schnappschuss, serverSchnappschuss);
}
