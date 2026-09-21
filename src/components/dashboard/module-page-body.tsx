"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, PageHeader } from "@/components/ui/kit";
import { ModulStatusPille } from "@/components/dashboard/module-meta";
import { ModuleView } from "@/components/demo/registry";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import type { ModuleDef } from "@/lib/modules";

// Der Kopf sitzt wie auf der Uebersicht und den Bereichsseiten in einer Box.
// Was darunter steht, kommt aus der jeweiligen Modulansicht und folgt dem
// Boxensystem noch nicht - die Abschnitte dort bauen auf <Section>, und die
// traegt bis heute keinen Rahmen (siehe docs/design/boxensystem-audit-
// 2026-09-21.md, Punkt 1).
export function ModulePageBody({
  module,
  children,
}: {
  module: ModuleDef;
  /**
   * Serverseitig gerenderte Ansicht des Moduls (Meilenstein B, datenbank-
   * gestuetzt). Fehlt sie, greift die Client-Demo-Ansicht aus der Registry.
   */
  children?: ReactNode;
}) {
  const { role } = usePersona();
  const t = useTranslations("modules");
  const roleT = useTranslations("roles");
  const denied = useTranslations("accessDenied");

  const allowed = hasPermission(role, module.resource, "view");

  return (
    <div className="space-y-6">
      <Card ton="box" className="p-5 sm:p-6">
        <PageHeader
          title={t(`${module.key}.title`)}
          description={t(`${module.key}.description`)}
        >
          {module.reifegrad === "in-entwicklung" ? <ModulStatusPille /> : null}
        </PageHeader>
      </Card>

      {allowed ? (
        (children ?? <ModuleView module={module} />)
      ) : (
        // Vorher eine von Hand gebaute Flaeche mit denselben Werten wie
        // <Card>. Jetzt der Baustein selbst - eine Aenderung an der Karte
        // muss nicht an zwei Stellen nachgezogen werden.
        <Card ton="box" className="p-8 text-center">
          <Lock className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 text-sm font-semibold text-foreground">
            {denied("title", { role: roleT(role) })}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{denied("hint")}</p>
          <Link
            href="/dashboard"
            className="mt-4 inline-flex h-9 items-center rounded-full border border-border px-4 text-xs font-semibold text-foreground"
          >
            {denied("back")}
          </Link>
        </Card>
      )}
    </div>
  );
}
