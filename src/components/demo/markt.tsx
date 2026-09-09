"use client";

import { useFormatter, useTranslations } from "next-intl";
import { PlayCircle } from "lucide-react";
import { Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { schulungsvideos, sorten } from "@/lib/domain/betrieb-data";

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

export function SchulungenDemo() {
  const t = useTranslations("schulungenDemo");

  return (
    <div className="space-y-6">
      <Section title={t("libraryTitle")} description={t("libraryLead")}>
        <DataTable
          head={[t("col.titel"), t("col.thema"), t("col.dauer"), t("col.sprachen")]}
        >
          {schulungsvideos.map((video) => (
            <tr key={video.id}>
              <td className="px-3 py-2.5">
                <span className="inline-flex items-center gap-2 font-semibold text-foreground">
                  <PlayCircle className="h-4 w-4 text-primary" />
                  {t(`video.${video.id}`)}
                </span>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {t(`thema.${video.thema}`)}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{video.dauer}</td>
              <td className="px-3 py-2.5">
                <span className="flex flex-wrap gap-1">
                  {video.sprachen.map((lang) => (
                    <StatusPill key={lang} tone="neutral">
                      {lang.toUpperCase()}
                    </StatusPill>
                  ))}
                </span>
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </Card>
    </div>
  );
}
