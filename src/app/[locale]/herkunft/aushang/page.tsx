import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteNavbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { PrintButton } from "@/components/ui/print-button";
import { MalinaLogo } from "@/components/brand/malina-logo";
import { absoluteUrl, qrSvg } from "@/lib/qr";

/**
 * Anmeldungsfreies A4-Aushang-Poster fuer den Betrieb (WMCNL-1439).
 *
 * Der QR-Code zeigt auf die generische Codeeingabe /herkunft, nicht auf eine
 * einzelne Charge: ein Aushang haengt wochenlang am Kuehlraum oder Verkaufs-
 * stand, eine Schale steht nur Stunden - Muster aus der
 * D-H-Referenzimplementierung, hier uebernommen. Ausserhalb des Dashboards,
 * ohne Anmeldung, ohne RBAC-Pruefung: genau wie /herkunft/[code] ist das
 * gewollt (siehe dortige page.tsx), nicht vergessen.
 *
 * "force-static": der Inhalt haengt nur von der Locale ab, nicht vom
 * Request - die Locale-Liste kommt bereits aus generateStaticParams() in
 * src/app/[locale]/layout.tsx, eine eigene Deklaration hier ist nicht noetig.
 */
export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "aushangPoster" });
  return {
    title: t("title"),
    description: t("lead"),
    // Der Aushang ist fuer die Wand gedacht, nicht fuer eine Suchmaschine.
    robots: { index: false, follow: false },
  };
}

export default async function AushangPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("aushangPoster");

  const ziel = absoluteUrl(locale, "/herkunft");
  const svg = await qrSvg(ziel, "aushang");

  return (
    <>
      <SiteNavbar />
      <main id="main" className="container flex justify-center pt-28 pb-20 print:p-0">
        <div
          className="flex aspect-[1/1.414] w-full max-w-2xl flex-col items-center justify-between gap-8 rounded-3xl border border-border bg-card p-10 text-center shadow-sm shadow-black/[0.04]
                     print:aspect-auto print:min-h-[96vh] print:w-full print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-6 print:shadow-none"
        >
          <div className="flex items-center gap-2.5">
            <MalinaLogo />
            <span className="text-lg font-black text-foreground print:text-black">Malina</span>
          </div>

          <div className="space-y-4">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
              {t("eyebrow")}
            </p>
            <h1 className="text-3xl font-black text-foreground print:text-black md:text-4xl">
              {t("title")}
            </h1>
            <p className="mx-auto max-w-md text-sm leading-6 text-muted-foreground print:text-black">
              {t("lead")}
            </p>
          </div>

          <div
            className="rounded-2xl bg-white p-4 shadow-sm print:shadow-none"
            dangerouslySetInnerHTML={{ __html: svg }}
          />

          <div className="space-y-1">
            <p className="font-mono text-sm text-foreground print:text-black">{ziel}</p>
            <p className="text-xs text-muted-foreground print:text-black">
              {t("fallbackHinweis")}
            </p>
          </div>

          <PrintButton label={t("drucken")} />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
