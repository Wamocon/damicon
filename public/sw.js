// Anforderung 2.5, Phase 7: minimaler, von Hand geschriebener Service Worker
// fuer App-Shell-Caching - bewusst kein next-pwa/Workbox (ein separates
// Anliegen von der eigentlichen Offline-Synchronisierung in
// src/lib/offline/, die bereits ohne Service Worker auskommt). Zweck: eine
// Brigade, die eine bereits besuchte Seite offline erneut aufruft oder neu
// laedt, soll den letzten Stand sehen statt eines Browser-Fehlers -
// Formulare bleiben ohnehin ueber die IndexedDB-Warteschlange offline
// bedienbar, dafuer muss die Seite selbst aber erst einmal laden.
//
// Versionierung: die Registrierung (siehe
// src/components/site/service-worker-registrierung.tsx) haengt die
// aktuelle App-Version als Query-Parameter an die Skript-URL
// ("/sw.js?v=..."). Das allein reicht nicht als Cache-Schluessel, da
// dieselbe statische Datei fuer jede Version ausgeliefert wird - deshalb
// liest dieser Service Worker seine eigene Registrierungs-URL
// (self.location.search) aus und baut den Cache-Namen selbst daraus. Bei
// jedem neuen Deployment (neue Version) entsteht so ein neuer Cache-Name,
// activate() raeumt alle aelteren auf - keine Gefahr, veraltete
// HTML-Seiten mit Verweisen auf nicht mehr existierende, inhaltsadressierte
// /_next/static/-Dateien einer vorherigen Version auszuliefern.

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const CACHE_NAME = `damicon-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll([OFFLINE_URL]))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((namen) =>
        Promise.all(
          namen
            .filter((name) => name.startsWith("damicon-shell-") && name !== CACHE_NAME)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Nur GET wird ueberhaupt betrachtet - Server Actions, /api/sync und jeder
  // andere schreibende Aufruf laeuft unveraendert direkt gegen das Netz, ein
  // Service Worker darf sich hier niemals dazwischenschalten.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Next.js-Static-Assets sind inhaltsadressiert (Dateiname enthaelt einen
  // Build-Hash) - unveraenderlich, Cache-First ist hier immer sicher.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const gecached = await cache.match(request);
        if (gecached) return gecached;
        const antwort = await fetch(request);
        if (antwort.ok) cache.put(request, antwort.clone());
        return antwort;
      }),
    );
    return;
  }

  // Seitenaufrufe (Navigation): Network-First, damit RLS-gepruefte Live-Daten
  // im Normalfall immer aktuell sind. Ein erfolgreich geladenes Dokument wird
  // zusaetzlich zwischengespeichert, damit ein erneuter Aufruf derselben
  // Seite offline zumindest den letzten bekannten Stand zeigt statt
  // vollstaendig zu scheitern. Erst wenn auch das fehlt (z. B. beim
  // allerersten Aufruf ohne jede Vorab-Verbindung), greift die statische
  // Offline-Seite.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((antwort) => {
          if (antwort.ok) {
            const kopie = antwort.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, kopie));
          }
          return antwort;
        })
        .catch(async () => {
          const cache = await caches.open(CACHE_NAME);
          const gecached = await cache.match(request);
          return gecached || cache.match(OFFLINE_URL);
        }),
    );
    return;
  }

  // Alles andere (API-/RSC-Datenanfragen, Bilder, Fonts, ...) unveraendert
  // durchreichen - kein Caching, keine Sonderbehandlung.
});
