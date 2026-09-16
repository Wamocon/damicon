import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Inter, Manrope } from "next/font/google";
import { NextIntlClientProvider, hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { ThemeScript } from "@/components/theme-toggle";
import { ServiceWorkerRegistrierung } from "@/components/site/service-worker-registrierung";
import { appVersion } from "@/lib/pwa-version";
import "../globals.css";

// Schriften der Oberflaeche. Entscheidend fuer Damicon ist nicht der Look
// allein, sondern die Zeichenabdeckung: `kk` und `ru` brauchen Kyrillisch
// inklusive der neun kasachischen Sonderbuchstaben (Ә Ғ Қ Ң Ө Ұ Ү Һ І, davon
// liegen acht in `cyrillic-ext`), `tr` das erweiterte Latein (ğ ş ı İ).
// Fehlt ein Subset, ersetzt der Browser einzelne Zeichen aus einer anderen
// Schrift - im Kasachischen faellt genau das sofort auf.
//
// next/font laedt beide Familien zur Bauzeit herunter und liefert sie aus
// /_next/static/ aus. Das ist auch fuer den Offline-Betrieb richtig: der
// Service Worker cacht diesen Pfad bereits (public/sw.js), waehrend ein
// Google-Fonts-Link ohne Netz ins Leere liefe. Der Build braucht dafuer
// einmalig Internetzugang.
const inter = Inter({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-inter",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "latin-ext", "cyrillic", "cyrillic-ext"],
  variable: "--font-manrope",
  display: "swap",
});

// Faerbt die Browserleiste auf Mobilgeraeten - bisher blieb sie grau, waehrend
// die Seite darunter die Landesfarben traegt. Zwei Werte, damit sie dem
// Farbschema folgt: Koek im hellen, das Nachtblau des Dark Mode im dunklen.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#00768f" },
    { media: "(prefers-color-scheme: dark)", color: "#04161c" },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

// Basis fuer alle absoluten Adressen in den Metadaten, allen voran das
// Vorschaubild: Ein Netzwerk laedt og:image nur ueber eine vollstaendige URL,
// ein relativer Pfad bleibt wirkungslos. Auf Vercel steht die Produktionsadresse
// in der Umgebung, lokal faellt sie auf den Entwicklungsserver zurueck. Eine
// eigene Domain wird spaeter ueber NEXT_PUBLIC_SITE_URL gesetzt.
const produktionsUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const seitenUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  (produktionsUrl ? `https://${produktionsUrl}` : "http://localhost:3000");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "meta" });

  // Das Vorschaubild liegt als opengraph-image.jpg neben dieser Datei; Next
  // traegt es selbst ein, samt Groesse und Alternativtext aus der zugehoerigen
  // .alt.txt. Ohne den openGraph-Block daneben stuende in der Vorschau zwar das
  // Bild, aber der Titel der Seite nur als HTML-<title> - und genau den liest
  // WhatsApp, Telegram oder LinkedIn nicht zuverlaessig aus.
  return {
    metadataBase: new URL(seitenUrl),
    title: t("title"),
    description: t("description"),
    openGraph: {
      type: "website",
      siteName: "Damicon",
      locale,
      title: t("title"),
      description: t("description"),
    },
    twitter: {
      card: "summary_large_image",
      title: t("title"),
      description: t("description"),
    },
  };
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "common" });

  return (
    <html
      lang={locale}
      data-scroll-behavior="smooth"
      className={`${inter.variable} ${manrope.variable}`}
      suppressHydrationWarning
    >
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <ThemeScript />
        <ServiceWorkerRegistrierung version={appVersion()} />
        <NextIntlClientProvider>
          <a href="#main" className="skip-link">
            {t("skipToContent")}
          </a>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
