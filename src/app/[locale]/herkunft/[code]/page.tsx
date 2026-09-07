import type { Metadata } from "next";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { CheckCircle2, ShieldAlert, Snowflake } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { SiteNavbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { Card, PageHeader, StatusPill, type Tone } from "@/components/ui/kit";
import { ladeOeffentlicheHerkunft } from "@/lib/data/herkunft";

/**
 * Oeffentliche Herkunftsauskunft (WMCNL-1456).
 *
 * Ohne Anmeldung erreichbar - wer den Code von der Steige oder dem
 * Lieferschein hat, bekommt genau diese eine Charge zu sehen. Der Zugriff
 * laeuft ausschliesslich ueber die SECURITY-DEFINER-Funktion
 * public.herkunftsauskunft (siehe
 * supabase/migrations/20260908150000_oeffentliche_herkunft.sql), die weder
 * eine Chargen-ID noch Pfluecker-, Mengen- oder Preisangaben herausgibt.
 * Deshalb ganz bewusst kein requirePermission()/DashboardShell hier - diese
 * Seite ist fuer den Besucher ohne Konto gedacht.
 */

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}): Promise<Metadata> {
  const { locale, code } = await params;
  const t = await getTranslations({ locale, namespace: "oeffentlicheHerkunft" });
  return {
    title: `${t("title")} · ${code}`,
    description: t("lead"),
    // Eine einzelne Chargenauskunft gehoert nicht in einen Suchindex - sie ist
    // fuer den gedacht, der den Code in der Hand haelt, nicht fuer eine
    // Suche ueber Liefermengen.
    robots: { index: false, follow: false },
  };
}

export default async function HerkunftCodePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("oeffentlicheHerkunft");
  const format = await getFormatter();

  const auskunft = await ladeOeffentlicheHerkunft(code);

  const datum = (iso: string | null) =>
    iso
      ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" })
      : "-";

  if (!auskunft) {
    return (
      <>
        <SiteNavbar />
        <main id="main" className="container pt-28 pb-20">
          <div className="mx-auto max-w-2xl">
            <PageHeader title={t("title")} description={t("lead")} />
            <Card className="mt-6">
              <p className="text-sm font-black text-foreground">
                {t("notFoundTitle")}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {t("notFound")}
              </p>
              <Link
                href="/herkunft"
                className="mt-4 inline-flex text-xs font-semibold text-primary hover:underline"
              >
                {t("backToSearch")}
              </Link>
            </Card>
          </div>
        </main>
        <SiteFooter />
      </>
    );
  }

  // null = Vorkühlung steht noch aus, es gibt also noch kein Urteil - dann
  // weder "gehalten" noch "gerissen" behaupten.
  const kuehlTon: Tone =
    auskunft.kuehlketteEingehalten === false
      ? "danger"
      : auskunft.kuehlketteEingehalten === true
        ? "success"
        : "warning";
  const kuehlKarte =
    kuehlTon === "danger"
      ? "border-destructive/25 bg-destructive/[0.06]"
      : kuehlTon === "success"
        ? "border-success/25 bg-success/[0.06]"
        : "border-warning/25 bg-warning/[0.06]";
  const kuehlIcon =
    kuehlTon === "danger" ? "text-destructive" : kuehlTon === "success" ? "text-success" : "text-warning";

  return (
    <>
      <SiteNavbar />
      <main id="main" className="container pt-28 pb-20">
        <div className="mx-auto max-w-2xl">
          <PageHeader eyebrow={code} title={t("title")} description={t("lead")} />

          <div className="mt-6 space-y-4">
            {/* Die Wartezeit zuerst: die einzige Angabe mit
                lebensmittelrechtlicher Folge. Alles andere ist Qualitaet,
                das hier ist Zulaessigkeit. */}
            <Card
              className={
                auskunft.wartezeitEingehalten
                  ? "border-success/25 bg-success/[0.06]"
                  : "border-destructive/25 bg-destructive/[0.06]"
              }
            >
              <div className="flex items-center gap-2">
                {auskunft.wartezeitEingehalten ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                ) : (
                  <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                )}
                <p className="text-sm font-black text-foreground">
                  {auskunft.wartezeitEingehalten
                    ? t("wartezeit.eingehalten")
                    : t("wartezeit.verletzt")}
                </p>
              </div>
            </Card>

            <Card className={kuehlKarte}>
              <div className="flex flex-wrap items-center gap-2">
                <Snowflake className={`h-4 w-4 shrink-0 ${kuehlIcon}`} />
                <p className="text-xs font-black text-foreground">
                  {auskunft.minutenBisVorkuehlung !== null
                    ? t("kuehlung.minuten", { minuten: auskunft.minutenBisVorkuehlung })
                    : t("kuehlung.offen")}
                </p>
                {auskunft.kuehlketteEingehalten !== null ? (
                  <StatusPill tone={kuehlTon}>
                    {auskunft.kuehlketteEingehalten
                      ? t("kuehlung.gehalten")
                      : t("kuehlung.gerissen")}
                  </StatusPill>
                ) : null}
              </div>
            </Card>

            <Card>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("fields.reihenblock")}
                  </dt>
                  <dd className="mt-0.5 font-mono font-semibold text-foreground">
                    {auskunft.reihenblockCode ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("fields.sorte")}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {auskunft.sorteName ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("fields.ernteDatum")}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {auskunft.ernteDatum
                      ? format.dateTime(new Date(auskunft.ernteDatum), { dateStyle: "medium" })
                      : "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("fields.gepflueckt")}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {datum(auskunft.pflueckZeitpunkt)}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t("fields.vorgekuehlt")}
                  </dt>
                  <dd className="mt-0.5 font-semibold text-foreground">
                    {datum(auskunft.vorkuehlungZeitpunkt)}
                  </dd>
                </div>
              </dl>
            </Card>

            <p className="text-center text-[11px] text-muted-foreground">
              {t("keinePersonen")}
            </p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
