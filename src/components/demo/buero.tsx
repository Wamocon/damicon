"use client";

import { useTranslations } from "next-intl";
import { Check, Minus } from "lucide-react";
import { Card, DataTable, Section, StatusPill } from "@/components/ui/kit";
import { hasPermission, roleDefinitions, type Resource } from "@/lib/rbac";
import { pfluecker, brigaden } from "@/lib/domain/betrieb-data";

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
                <StatusPill tone="neutral">1Çatı: {role.catiRole}</StatusPill>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {roleT(`descriptions.${role.key}`)}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("scope")}: {role.scope} · Level {role.level}
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

export function PersonalDemo() {
  const t = useTranslations("personalDemo");
  return (
    <div className="space-y-6">
      <Section title={t("brigadenTitle")} description={t("brigadenLead")}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {brigaden.map((b) => (
            <Card key={b.id} className="p-4">
              <p className="text-sm font-black text-card-foreground">{b.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {t("foreman")}: {b.vorarbeiter}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {b.staerke} {t("people")} · {b.plantage}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      <Section title={t("pflueckerTitle")} description={t("pflueckerLead")}>
        <DataTable
          head={[t("col.name"), t("col.brigade"), t("col.ausweis"), t("col.esutd"), t("col.leistung"), t("col.qfaktor")]}
        >
          {pfluecker.map((p) => (
            <tr key={p.id}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{p.name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{p.brigade}</td>
              <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{p.ausweis}</td>
              <td className="px-3 py-2.5">
                <StatusPill tone={p.esutd === "erfasst" ? "success" : "warning"}>
                  {t(`esutd.${p.esutd}`)}
                </StatusPill>
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{p.schnitt7dKg} kg / 7 {t("days")}</td>
              <td className="px-3 py-2.5 font-semibold text-foreground">{p.qualitaetsfaktor.toFixed(2)}</td>
            </tr>
          ))}
        </DataTable>
      </Section>
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}

// ComplianceDemo entfaellt (WMCNL-1446): das Modul "compliance" laeuft jetzt
// ueber die datenbankgestuetzte Ansicht in src/components/db/compliance-ansicht.tsx,
// analog zu dokumente/standort/pflueckaufgaben/reihenbloecke.
