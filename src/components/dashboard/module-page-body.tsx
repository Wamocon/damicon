"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Lock } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { PageHeader } from "@/components/ui/kit";
import { Brotkrumen } from "@/components/dashboard/brotkrumen";
import {
  KlassifikationBadge,
  ReifegradBadge,
} from "@/components/dashboard/module-meta";
import { ModuleView } from "@/components/demo/registry";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import type { ModuleDef } from "@/lib/modules";

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
    <div className="space-y-8">
      <PageHeader
        eyebrow={<Brotkrumen zone={module.zone} modulKey={module.key} />}
        title={t(`${module.key}.title`)}
        description={t(`${module.key}.description`)}
      >
        <ReifegradBadge value={module.reifegrad} />
        <KlassifikationBadge value={module.klassifikation} />
      </PageHeader>

      {allowed ? (
        (children ?? <ModuleView module={module} />)
      ) : (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
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
        </div>
      )}
    </div>
  );
}
