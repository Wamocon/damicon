"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { PageHeader, StatusPill } from "@/components/ui/kit";
import {
  KlassifikationBadge,
  ReifegradBadge,
} from "@/components/dashboard/module-meta";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import { moduleHref, modulesForZone, type ZoneKey } from "@/lib/modules";

export function ZonePageBody({ zone }: { zone: ZoneKey }) {
  const { role } = usePersona();
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard");

  const items = modulesForZone(zone).filter((module) =>
    hasPermission(role, module.resource, "view"),
  );

  return (
    <div className="space-y-8">
      <PageHeader
        title={zoneT(`${zone}.name`)}
        description={zoneT(`${zone}.description`)}
      />

      {items.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
          {t("zoneEmpty")}
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {items.map((module) => (
            <Link
              key={module.key}
              href={moduleHref(module)}
              className="group flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
            >
              {/* Dieselbe Kartensprache wie die Zonenkarten der Uebersicht:
                  Symbol und Titel in einer Zeile statt untereinander. Die
                  Reifegrad-Pille bleibt rechts oben, wo sie sich ueber die
                  Spalte hinweg vergleichen laesst. min-w-32 am Titel sorgt
                  dafuer, dass sie auf schmalen Karten umbricht, statt den
                  Titel auf zwei Woerter zu stauchen. */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={module.icon} className="h-5 w-5" />
                </span>
                <h3 className="min-w-32 flex-1 text-base font-black text-card-foreground">
                  {moduleT(`${module.key}.title`)}
                </h3>
                <span className="ml-auto shrink-0">
                  <ReifegradBadge value={module.reifegrad} />
                </span>
              </div>
              <p className="mt-2.5 flex-1 text-sm leading-6 text-muted-foreground">
                {moduleT(`${module.key}.summary`)}
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border pt-3">
                <KlassifikationBadge value={module.klassifikation} />
                <span className="inline-flex items-center gap-1 text-xs font-bold text-primary">
                  {t("open")}
                  <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        <StatusPill tone="neutral">{t("rbacHintLabel")}</StatusPill>{" "}
        {t("rbacHint")}
      </p>
    </div>
  );
}
