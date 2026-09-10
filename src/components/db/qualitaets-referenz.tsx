"use client";

import { useTranslations } from "next-intl";
import { Beere, Schale, type BeerenVariante } from "@/components/site/beere-schale";

// Anforderung 2.9: Referenzbilder je Qualitätsklasse direkt am Ort des
// Fotobelegs, nicht nur ein generisches Platzhalterbild. Dieselbe
// SVG-Referenzbibliothek wie auf der öffentlichen Seite
// (components/site/quality-standard.tsx), hier mit mehr Merkmalen und im
// Feld-Kontext (kurze, handlungsorientierte Bezeichnungen statt der
// Marketing-Texte). Reine Inline-SVG-Komponenten ohne Bilddatei, damit
// automatisch offline verfügbar, sobald die Seite einmal geladen wurde -
// kein zusätzlicher Cache-Eintrag im Service Worker nötig, anders als ein
// echtes Foto unter /public.
const merkmale: ReadonlyArray<{ variante: BeerenVariante; key: string }> = [
  { variante: "ok", key: "gut" },
  { variante: "shape", key: "zerfallen" },
  { variante: "receptacle", key: "unreif" },
  { variante: "bruise", key: "druckstelle" },
  { variante: "mould", key: "schimmel" },
];

export function QualitaetsReferenz() {
  const t = useTranslations("qualitaetsReferenz");

  return (
    <details className="rounded-lg border border-border bg-muted/20 text-xs open:bg-muted/30">
      <summary className="cursor-pointer select-none px-2.5 py-1.5 font-semibold text-card-foreground">
        {t("aufklappen")}
      </summary>
      <div className="space-y-3 px-2.5 pb-2.5">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {merkmale.map(({ variante, key }) => (
            <div key={key} className="flex flex-col items-center gap-1 text-center">
              <div className="flex items-center justify-center rounded-lg bg-[#04161c] p-1.5">
                <Beere variante={variante} groesse={44} titel={t(key)} />
              </div>
              <span className="text-[10px] leading-tight text-muted-foreground">
                {t(key)}
              </span>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3 border-t border-border pt-2.5">
          <div className="flex items-center justify-center rounded-lg bg-[#04161c] p-1.5">
            <Schale variante="ok" groesse={70} titel={t("schaleGut")} />
          </div>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {t("schaleGut")}
          </span>
          <div className="flex items-center justify-center rounded-lg bg-[#04161c] p-1.5">
            <Schale variante="overfilled" groesse={70} titel={t("schaleUeberfuellt")} />
          </div>
          <span className="text-[10px] leading-tight text-muted-foreground">
            {t("schaleUeberfuellt")}
          </span>
        </div>
      </div>
    </details>
  );
}
