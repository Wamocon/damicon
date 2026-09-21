"use client";

import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { Card, kachelVerweis, PageHeader, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import {
  KlassifikationBadge,
  ReifegradBadge,
} from "@/components/dashboard/module-meta";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import { moduleHref, modulesForZone, type ZoneKey } from "@/lib/modules";

// Dasselbe Boxensystem wie die Uebersichtsseite: jeder Abschnitt sitzt in
// einer Card, was darin als eigene Einheit steht, traegt den gedaempften
// Grund und keinen Schatten. Zwei Karten mit Schatten uebereinander sehen
// aus wie ein Fehler.
export function ZonePageBody({ zone }: { zone: ZoneKey }) {
  const { role } = usePersona();
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard");

  const items = modulesForZone(zone).filter((module) =>
    hasPermission(role, module.resource, "view"),
  );

  return (
    <div className="space-y-6">
      <Card className="p-5 sm:p-6">
        <PageHeader
          title={zoneT(`${zone}.name`)}
          description={zoneT(`${zone}.description`)}
        />
      </Card>

      <Card className="p-5 sm:p-6">
        <div>
          <h2 className="text-sm font-bold text-card-foreground">
            {t("home.moduleTitel")}
          </h2>
          <p className="mt-0.5 schrift-dense text-muted-foreground">
            {t("zoneModuleLead")}
          </p>
        </div>

        {items.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("zoneEmpty")}
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {items.map((module) => (
              <Link
                key={module.key}
                href={moduleHref(module)}
                // bg-muted/20 und shadow-none ueber cn(): die Kachel steht
                // jetzt in einer Karte und darf nicht dieselbe Flaeche
                // tragen wie ihr Traeger. tailwind-merge ersetzt bg-card und
                // shadow-sm aus kachelVerweis, deshalb genuegt der Zusatz
                // und es braucht keine zweite Klassenkette.
                className={cn(kachelVerweis, "bg-muted/20 p-5 shadow-none")}
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

        {/* Der Rollenhinweis stand frei unter der Seite und gehoerte optisch
            zu nichts. Er erklaert, warum diese Liste so aussieht, wie sie
            aussieht - also steht er in derselben Box. */}
        <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
          <StatusPill tone="neutral">{t("rbacHintLabel")}</StatusPill>{" "}
          {t("rbacHint")}
        </p>
      </Card>
    </div>
  );
}
