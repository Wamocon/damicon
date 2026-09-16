"use client";

import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { hasPermission, roleDefinitions, type Resource } from "@/lib/rbac";

export function RollenDemo() {
  const t = useTranslations("rollenDemo");
  const roleT = useTranslations("roles");
  const resT = useTranslations("resourceLabels");
  const shown: Resource[] = [
    "dashboard",
    "reihenbloecke",
    "pflueckaufgaben",
    "pflanzenschutz",
    "kuehlkette",
    "lohn",
    "finanzen",
    "dokumente",
    "compliance",
    "b2b_portal",
  ];

  return (
    <div className="space-y-6">
      <Section title={t("rolesTitle")} description={t("rolesLead")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roleDefinitions.map((role) => (
            <Card key={role.key}>
              <div className="flex items-center justify-between">
                <p className="text-sm font-black text-card-foreground">
                  {roleT(role.key)}
                </p>
                <StatusPill tone="neutral">
                  1Çatı: {role.catiRole ?? t("catiRole.keine")}
                </StatusPill>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {roleT(`descriptions.${role.key}`)}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("scope")}: {t(`scopeWert.${role.scope}`)} · {t("level")} {role.level}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("matrixTitle")} description={t("matrixLead")}>
        <DataTable head={[t("resource"), ...roleDefinitions.map((r) => roleT(r.key))]}>
          {shown.map((resource) => (
            <tr key={resource}>
              <td className="px-3 py-2.5 font-semibold text-foreground">
                {resT(resource)}
              </td>
              {roleDefinitions.map((role) => (
                <td key={role.key} className="px-3 py-2.5">
                  {hasPermission(role.key, resource, "view") ? (
                    <Check className="h-4 w-4 text-success" />
                  ) : (
                    <Minus className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </td>
              ))}
            </tr>
          ))}
        </DataTable>
        <p className="text-xs text-muted-foreground">{t("matrixNote")}</p>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
        {t("note")}
      </Card>
    </div>
  );
}


// ComplianceDemo entfaellt (WMCNL-1446): das Modul "compliance" laeuft jetzt
// ueber die datenbankgestuetzte Ansicht in src/components/db/compliance-ansicht.tsx,
// analog zu dokumente/standort/pflueckaufgaben/reihenbloecke.
