import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
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
  },
};

export default withNextIntl(nextConfig);
