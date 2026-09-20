import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

// Web-App-Manifest: macht das Portal auf dem Startbildschirm installierbar.
//
// Der Unterbau dafuer stand schon laenger - public/sw.js cacht die App-Shell,
// public/offline.html faengt den Ausfall ab, src/lib/offline/ haelt die
// Warteschlange fuer Erfassungen ohne Netz. Es fehlte nur diese Datei, und
// ohne sie oeffnet eine Brigade jeden Morgen den Browser und tippt die
// Adresse, waehrend die Offline-Faehigkeit dahinter fertig ist.
//
// start_url traegt das Sprachpraefix, weil jede Route es verlangt (i18n mit
// erzwungenem Praefix, siehe i18n/routing.ts). Die Standardsprache ist damit
// zugleich die Sprache der installierten Anwendung. Wer in einer anderen
// Sprache arbeitet, kann die Anwendung weiterhin umschalten - die Einstellung
// gilt dann fuer die Sitzung, nicht fuer das Startsymbol. Ein Manifest je
// Sprache waere die saubere Loesung, verlangt aber ein Manifest pro Route und
// einen Link im Kopf jeder Seite; das lohnt erst, wenn jemand das Portal
// tatsaechlich auf Kasachisch installiert.
//
// Symbole: bisher gibt es nur src/app/icon.svg. Android nimmt SVG an, iOS
// nicht - dort braucht es ein apple-touch-icon als PNG, sonst rendert Safari
// einen Ausschnitt der Seite als Symbol. Zwei PNG in 192 und 512 px sind
// nachzuliefern; bis dahin ist die Installation auf iPhone halbfertig.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Damicon - Betriebssteuerung Himbeerplantage",
    short_name: "Damicon",
    description:
      "Betriebssteuerung fuer die Himbeerplantage: Pflueckaufgaben, Kuehlkette, Nachweiskette und Belege.",
    start_url: `/${routing.defaultLocale}/dashboard`,
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    // Dieselben Farben wie der Viewport-Export in app/[locale]/layout.tsx:
    // Koek als Markenfarbe, das Nachtblau des Dark Mode als Grund.
    background_color: "#04161c",
    theme_color: "#00768f",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
