"use client";

import { useFormatter, useTranslations } from "next-intl";
import { Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { reihenbloecke } from "@/lib/domain/reihenbloecke";

export function PflanzenschutzDemo() {
  const t = useTranslations("pflanzenschutzDemo");
  const format = useFormatter();
  const gesperrt = reihenbloecke.filter(
    (block) => block.status === "wartezeitgesperrt" && block.sperre,
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-destructive/25 bg-destructive/[0.06] p-4">
        <p className="text-sm font-black text-destructive">{t("ruleTitle")}</p>
        <p className="mt-1 text-sm leading-6 text-foreground">{t("ruleLead")}</p>
      </div>

      <Section title={t("activeTitle")} description={t("activeLead")}>
        <DataTable
          head={[
            t("col.block"),
            t("col.mittel"),
            t("col.behandelt"),
            t("col.wartezeit"),
            t("col.freigabe"),
            t("col.status"),
          ]}
        >
          {gesperrt.map((block) => (
            <tr key={block.id}>
              <td className="px-3 py-2.5 font-mono text-xs font-semibold">
                {block.id}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {block.sperre!.mittel}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {format.dateTime(new Date(block.sperre!.behandeltAm), { dateStyle: "medium" })}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {block.sperre!.wartezeitTage} {t("days")}
              </td>
              <td className="px-3 py-2.5 font-semibold text-foreground">
                {format.dateTime(new Date(block.sperre!.freigabeAm), { dateStyle: "medium" })}
              </td>
              <td className="px-3 py-2.5">
                <StatusPill tone="danger">{t("locked")}</StatusPill>
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
