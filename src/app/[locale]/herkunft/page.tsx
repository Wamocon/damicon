import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { SiteNavbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { Button, Card, PageHeader } from "@/components/ui/kit";
import { herkunftSuchen } from "./actions";

// Eingangsseite zur oeffentlichen Herkunftsauskunft (WMCNL-1456). Ohne sie
// waere die Auskunft nur ueber einen direkt verlinkten oder gedruckten
// QR-Code erreichbar - wer den Code von Hand abtippen will, braucht ein Feld
// dafuer. Rein statisch: die eigentliche Pruefung passiert erst auf der
// Zielseite /herkunft/[code].

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "oeffentlicheHerkunft" });
  return {
    title: t("suche.title"),
    description: t("suche.lead"),
    robots: { index: false, follow: false },
  };
}

export default async function HerkunftSuchePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("oeffentlicheHerkunft");

  return (
    <>
      <SiteNavbar />
      <main id="main" className="container pt-28 pb-20">
        <div className="mx-auto max-w-md">
          <PageHeader title={t("suche.title")} description={t("suche.lead")} />

          <Card ton="box" className="mt-6">
            <form action={herkunftSuchen} className="space-y-4">
              <input type="hidden" name="locale" value={locale} />
              <div className="space-y-1.5">
                <label
                  htmlFor="code"
                  className="text-xs font-semibold text-card-foreground"
                >
                  {t("suche.label")}
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  required
                  pattern="[Hh][Kk]_[0-9a-fA-F]{16}"
                  autoComplete="off"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder={t("suche.placeholder")}
                  className="h-11 w-full rounded-xl border border-border bg-background px-3 font-mono text-sm text-foreground outline-none transition focus:border-primary"
                />
              </div>
              <Button type="submit" breit>
                {t("suche.submit")}
              </Button>
            </form>
          </Card>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
