"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { sorten } from "@/lib/domain/betrieb-data";

export function SortenkatalogDemo() {
  const t = useTranslations("sortenkatalogDemo");
  const format = useFormatter();

  return (
    <div className="space-y-6">
      <Section title={t("catalogTitle")} description={t("catalogLead")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {sorten.map((sorte) => {
            const auslastung =
              sorte.kontingentKg > 0
                ? Math.round((sorte.reserviertKg / sorte.kontingentKg) * 100)
                : 0;
            return (
              <Card key={sorte.id}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-card-foreground">
                    {sorte.name}
                  </p>
                  <StatusPill
                    tone={sorte.typ === "remontierend" ? "info" : "neutral"}
                  >
                    {t(`typ.${sorte.typ}`)}
                  </StatusPill>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {t("window")}: {t(`fenster.${sorte.id}`)}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {t("shale")}: {sorte.schaleG} g · {format.number(sorte.preisTengeKg)} ₸/kg
                </p>
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-muted-foreground">
                    <span>{t("contingent")}</span>
                    <span>
                      {sorte.reserviertKg} / {sorte.kontingentKg} kg
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${auslastung}%` }}
                    />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </Card>
    </div>
  );
}

// SchulungenDemo entfaellt (WMC-Vibecode-Cleanup): das Modul "schulungen"
// laeuft jetzt ueber die datenbankgestuetzten Ansichten EinarbeitungAnsicht/
// PflichtschulungenAnsicht (server-module-views.tsx), dieser Registry-
// Eintrag wurde nie mehr erreicht.
