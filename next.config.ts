import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// Dateien, die PDF.js zur Laufzeit ueber berechnete Pfade nachlaedt (Linux/glibc ist die Plattform von Vercel).
const PDF_DATEIEN = [
  "./node_modules/@napi-rs/canvas/**/*",
  "./node_modules/@napi-rs/canvas-linux-x64-gnu/**/*",
  "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
];

const nextConfig: NextConfig = {
  // Datenbankschema (public oder public_preview) beim Build fuer Server, Proxy und Browser festlegen.
  // Quelle ist SUPABASE_DB_SCHEMA; NEXT_PUBLIC_DB_SCHEMA setzt der Deploy-Workflow als Ueberschreibung.
  env: {
    NEXT_PUBLIC_DB_SCHEMA: process.env.NEXT_PUBLIC_DB_SCHEMA || process.env.SUPABASE_DB_SCHEMA || "public",
  },
  images: {
    // AVIF zuerst, WebP als Rueckfall. Die Reihenfolge entscheidet: Next.js
    // nimmt das erste Format, das der Browser im Accept-Header anbietet.
    // AVIF ist bei Fotos mit feinen Strukturen (Steinfruechtchen, Haerchen,
    // Grauschimmel) spuerbar kleiner als WebP bei gleicher Qualitaet.
    formats: ["image/avif", "image/webp"],
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
    ],
  },
  // Der Wissens-Upload liest PDF mit pdf-parse (PDF.js). Das Paket laedt zur Laufzeit eine Worker-Datei und
  // optional natives Zeichnen (canvas); gebuendelt findet es sie nicht. Es bleibt deshalb ein externes Paket
  // aus node_modules (src/lib/wissen/hochladen.ts).
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    // Fotobelege kommen vom Telefon und sind groesser als das Standardlimit
    // von 1 MB fuer Server Actions.
    serverActions: { bodySizeLimit: "8mb" },
  },
  // Das Produkthandbuch liegt unter docs/ und damit ausserhalb von src/. Die
  // Route /[locale]/dashboard/handbuch liest es zur Laufzeit; ohne diesen
  // Eintrag findet die Ablaufverfolgung die Datei nicht und sie fehlt im
  // Deployment. Die eckigen Klammern des Routenschluessels sind escapt, weil
  // der Schluessel als Glob ausgewertet wird.
  outputFileTracingIncludes: {
    "/\\[locale\\]/dashboard/handbuch": ["./docs/manual/index*.html"],
    // Wissens-Upload (PDF): Die Server Action laeuft in der Funktion der Seite, auf der das Formular steht (das KI-Panel
    // haengt im Layout, also in jeder Dashboard-Route). Dort muessen @napi-rs/canvas samt Linux-Binaerdatei und der
    // PDF.js-Worker mitgeliefert werden: pdfjs-dist laedt sie ueber berechnete Pfade, die die Ablaufverfolgung allein
    // nicht findet (Vercel-Log: "Cannot find module '@napi-rs/canvas'", dann "DOMMatrix is not defined"). Zusaetzlich zum
    // festen Import von "pdf-parse/worker" in src/lib/wissen/hochladen.ts, der dasselbe nach sich zieht.
    // Pruefung nach dem Build: npm run pruefe:pdf-ablaufverfolgung.
    "/\\[locale\\]/dashboard": PDF_DATEIEN,
    "/\\[locale\\]/dashboard/**": PDF_DATEIEN,
  },
};

export default withNextIntl(nextConfig);
