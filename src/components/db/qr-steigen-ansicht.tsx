import { getLocale, getTranslations } from "next-intl/server";
import { ExternalLink } from "lucide-react";
import { Card, Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { PrintButton } from "@/components/ui/print-button";
import { Link } from "@/i18n/navigation";
import { ladePfleuckerAusweise, ladeSteigenEtiketten } from "@/lib/data/qr-steigen";
import { absoluteUrl, qrSvg } from "@/lib/qr";
import { moduleHref, modules } from "@/lib/modules";

// QR-Steigenkennung (WMCNL-1439): QR-Etiketten fuer Steigen und
// Pfluecker-Ausweise, beide serverseitig als SVG erzeugt (src/lib/qr.ts).
// Reine Anzeige-/Druckansicht - kein Schreibpfad, siehe Kommentar an
// src/lib/modules.ts. Das dritte Bauelement, das anmeldungsfreie
// Aushang-Poster, liegt bewusst ausserhalb des Dashboards unter
// /herkunft/aushang (siehe dortige page.tsx) und wird hier nur verlinkt.
const pflueckaufgabenModul = modules.find((m) => m.key === "pflueckaufgaben");

export async function QrSteigenAnsicht() {
  const [etikettenListe, ausweisListe, locale, t] = await Promise.all([
    ladeSteigenEtiketten(),
    ladePfleuckerAusweise(),
    getLocale(),
    getTranslations("qrSteigenAnsicht"),
  ]);

  // Der Etiketten-QR verlinkt auf die oeffentliche Herkunftsauskunft dieser
  // Charge (chargen.oeffentlicher_code, siehe
  // supabase/migrations/20260908150000_oeffentliche_herkunft.sql) - genau die
  // volle URL, nicht der nackte Code, damit eine Kamera-App direkt navigieren
  // kann.
  const etiketten = await Promise.all(
    etikettenListe.etiketten.map(async (e) => ({
      ...e,
      svg: await qrSvg(absoluteUrl(locale, `/herkunft/${e.oeffentlicherCode}`), "etikett"),
    })),
  );

  // Der Ausweis-QR verlinkt auf die interne, anmeldungspflichtige
  // Pflueckaufgaben-Ansicht - ausdruecklich NICHT auf die oeffentliche
  // Herkunftsseite. Alle Ausweise zeigen denselben Zielpfad: eine
  // personenscharfe Vorauswahl ist in der Pflueckaufgaben-Ansicht heute nicht
  // vorgesehen und wuerde hier eine Filterung vortaeuschen, die es nicht gibt.
  const ausweisZiel = pflueckaufgabenModul
    ? absoluteUrl(locale, moduleHref(pflueckaufgabenModul))
    : absoluteUrl(locale, "/dashboard");
  const ausweisSvg = await qrSvg(ausweisZiel, "ausweis");
  const ausweise = ausweisListe.ausweise.map((p) => ({ ...p, svg: ausweisSvg }));

  return (
    <div className="space-y-8 print:space-y-6">
      <div className="flex justify-end print:hidden">
        <PrintButton label={t("drucken")} />
      </div>

      <Section
        title={t("etiketten.title")}
        description={t("etiketten.lead")}
        action={<DatenquelleBadge quelle={etikettenListe.quelle} />}
      >
        {etiketten.length === 0 ? (
          <Card className="text-xs text-muted-foreground">{t("etiketten.empty")}</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
            {etiketten.map((etikett) => (
              <div
                key={etikett.id}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-3 text-center print:break-inside-avoid print:border-black print:bg-white"
              >
                <div
                  className="rounded-lg bg-white p-1.5"
                  dangerouslySetInnerHTML={{ __html: etikett.svg }}
                />
                <div>
                  <p className="font-mono text-xs font-bold text-foreground print:text-black">
                    {etikett.code}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground print:text-black/70">
                    {t("etiketten.scanHinweis")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title={t("ausweise.title")}
        description={t("ausweise.lead")}
        action={<DatenquelleBadge quelle={ausweisListe.quelle} />}
      >
        {ausweise.length === 0 ? (
          <Card className="text-xs text-muted-foreground">{t("ausweise.empty")}</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 print:grid-cols-3 print:gap-2">
            {ausweise.map((pfluecker) => (
              <div
                key={pfluecker.id}
                className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-4 text-center print:break-inside-avoid print:border-black print:bg-white"
              >
                <div className="flex w-full items-center justify-between text-[10px] font-black uppercase tracking-wide text-primary print:text-black">
                  <span>Malina</span>
                  <span>{t("ausweise.rolle")}</span>
                </div>
                <div
                  className="rounded-lg bg-white p-1.5"
                  dangerouslySetInnerHTML={{ __html: pfluecker.svg }}
                />
                <p className="text-sm font-bold text-foreground print:text-black">
                  {pfluecker.name}
                </p>
                <p className="font-mono text-[10px] text-muted-foreground print:text-black/70">
                  {pfluecker.ausweis}
                </p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Card className="flex flex-wrap items-center justify-between gap-3 bg-muted/30 text-xs leading-5 text-muted-foreground print:hidden">
        <p className="max-w-2xl">{t("aushang.hinweis")}</p>
        <Link
          href="/herkunft/aushang"
          target="_blank"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-semibold text-foreground transition hover:bg-muted"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          {t("aushang.oeffnen")}
        </Link>
      </Card>
    </div>
  );
}
