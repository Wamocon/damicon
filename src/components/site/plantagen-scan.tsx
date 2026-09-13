import { useTranslations } from "next-intl";
import { PlantagenScanViewer } from "@/components/site/plantagen-scan-viewer";
import { Reveal } from "@/components/site/reveal";
import { plantagenScan } from "@/lib/site-medien";

// 3D-Rundgang durch die Anlage als Gaussian Splat. Der Abschnitt erscheint
// erst, wenn in lib/site-medien.ts eine Scan-Datei eingetragen ist - bis dahin
// gibt es ihn nicht, statt einer leeren Huelle mit "demnaechst".
// Aufnahme und Export: docs/aufnahmeplan.md.
export function PlantagenScanAbschnitt() {
  const t = useTranslations("erlebnis.scan");
  if (!plantagenScan) return null;

  return (
    <section className="border-b border-border py-16 md:py-24">
      <div className="container">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {t("eyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{t("lead")}</p>
        </Reveal>
        <PlantagenScanViewer scan={plantagenScan} />
      </div>
    </section>
  );
}
