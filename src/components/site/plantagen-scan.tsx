import { useTranslations } from "next-intl";
import { PlantagenScanViewer } from "@/components/site/plantagen-scan-viewer";
import { Reveal } from "@/components/site/reveal";
import { plantagenScan } from "@/lib/site-medien";
import { AbschnittKopf } from "@/components/site/abschnitt-kopf";

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
          <AbschnittKopf ueberzeile={t("eyebrow")} titel={t("title")} einleitung={t("lead")} />
        </Reveal>
        <PlantagenScanViewer scan={plantagenScan} />
      </div>
    </section>
  );
}
