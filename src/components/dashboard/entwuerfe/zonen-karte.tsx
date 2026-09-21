"use client";

// Die Zonenkarte der gewaehlten Richtung: Zone, ihre Kennzahlen, ihre Module.
//
// Aus Runde 2 uebernommen und fest verdrahtet: das Zielband in jeder
// Kennzahlbox (dort Variante 1) und die Module als Knoepfe statt als Text
// (dort Variante 4). Offen ist nur noch, wie die Zonen im Abschnitt sitzen -
// als eigene Karten oder flach, durch Linien getrennt.
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { Card, StatusPill } from "@/components/ui/kit";
import { hasPermission, type Role } from "@/lib/rbac";
import { modulesForZone, zones, type ModuleDef, type ZoneDef } from "@/lib/modules";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { KennzahlBox } from "./kennzahl-box";
import { nachDringlichkeit } from "./zielstand";

function ModulKnoepfe({
  zone,
  module,
}: {
  zone: ZoneDef;
  module: ModuleDef[];
}) {
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard.entwurf");
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {t("module.titel")}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {module.map((eintrag) => (
          <Link
            key={eintrag.key}
            href={`/dashboard/${zone.key}/${eintrag.slug}`}
            className="max-w-full truncate rounded-md border border-border bg-muted/40 px-2 py-1 text-[11px] font-medium leading-4 text-muted-foreground transition hover:border-primary/40 hover:text-foreground"
          >
            {moduleT(`${eintrag.key}.navTitle`)}
          </Link>
        ))}
      </div>
    </div>
  );
}

function ReifegradPillen({ module }: { module: ModuleDef[] }) {
  const t = useTranslations("dashboard");
  const angebunden = module.filter((m) => m.reifegrad === "angebunden").length;
  const demo = module.filter((m) => m.reifegrad === "demo").length;
  const wip = module.filter((m) => m.reifegrad === "in-entwicklung").length;
  return (
    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
      {angebunden > 0 ? (
        <StatusPill tone="success">
          {t("home.dbCount", { count: angebunden })}
        </StatusPill>
      ) : null}
      {demo > 0 ? (
        <StatusPill tone="info">{t("home.demoCount", { count: demo })}</StatusPill>
      ) : null}
      {wip > 0 ? (
        <StatusPill tone="warning">{t("home.wipCount", { count: wip })}</StatusPill>
      ) : null}
    </div>
  );
}

function ZonenInhalt({
  zone,
  role,
  kpis,
}: {
  zone: ZoneDef;
  role: Role;
  kpis: Kpi[];
}) {
  const t = useTranslations("dashboard");
  const entwurfT = useTranslations("dashboard.entwurf");
  const zoneT = useTranslations("zones");

  const sichtbareModule = modulesForZone(zone.key).filter((m) =>
    hasPermission(role, m.resource, "view"),
  );
  const zonenKpis = nachDringlichkeit(kpis.filter((kpi) => kpi.zone === zone.key));

  return (
    <>
      {/* Die Karte enthaelt Verweise auf die Module und kann deshalb nicht
          selbst einer sein - verschachtelte <a> sind ungueltiges HTML. Den
          Weg in die Zone traegt der Kopf. */}
      <Link
        href={`/dashboard/${zone.key}`}
        title={entwurfT("module.zoneOeffnen")}
        className="group rounded-lg outline-offset-4"
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon name={zone.icon} className="h-5 w-5" />
          </span>
          <h3 className="min-w-0 flex-1 truncate text-base font-black text-card-foreground">
            {zoneT(`${zone.key}.name`)}
          </h3>
          <span className="sr-only">{t("home.openZone")}</span>
          <ArrowRight
            aria-hidden
            className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5"
          />
        </div>
      </Link>

      <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
        {zoneT(`${zone.key}.tagline`)}
      </p>

      {zonenKpis.length > 0 ? (
        // auto-rows-fr: auch Boxen in verschiedenen Zeilen werden gleich hoch.
        <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2 @md:grid-cols-3 @xl:grid-cols-4">
          {zonenKpis.map((kpi) => (
            <KennzahlBox key={kpi.key} kpi={kpi} zielband />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-[11px] leading-4 text-muted-foreground">
          {entwurfT("zoneOhneKennzahl")}
        </p>
      )}

      {sichtbareModule.length > 0 ? (
        <ModulKnoepfe zone={zone} module={sichtbareModule} />
      ) : null}

      <ReifegradPillen module={sichtbareModule} />
    </>
  );
}

export function ZonenBox({
  role,
  kpis,
  quelle,
  flach = false,
  kopf,
}: {
  role: Role;
  /** Alle fuer die Rolle sichtbaren Kennzahlen, Kern und erweitert. */
  kpis: Kpi[];
  quelle: Datenquelle;
  /**
   * Variante B: die Zonen liegen ohne eigenen Rahmen in der Box, getrennt
   * durch Linien. Sie stehen dann untereinander ueber die volle Breite - eine
   * Zone wird dadurch flacher, weil ihre Kennzahlen in eine Reihe passen.
   */
  flach?: boolean;
  /** Variante C: die Begruessung sitzt im Kopf derselben Box. */
  kopf?: ReactNode;
}) {
  const t = useTranslations("dashboard.entwurf");
  const quelleT = useTranslations("dashboard.dataSource");

  return (
    <Card className="p-5 sm:p-6">
      {kopf ? (
        <div className="mb-6 border-b border-border pb-6">{kopf}</div>
      ) : null}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-sm font-bold text-card-foreground">
            {t("zonenTitel")}
          </h2>
          <p className="mt-0.5 schrift-dense text-muted-foreground">
            {t("zonenBeschreibung")}
          </p>
        </div>
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      </div>

      {flach ? (
        <div className="mt-4 divide-y divide-border">
          {zones.map((zone) => (
            <div key={zone.key} className="@container flex flex-col py-5 first:pt-0 last:pb-0">
              <ZonenInhalt zone={zone} role={role} kpis={kpis} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {zones.map((zone) => (
            <div
              key={zone.key}
              className="@container flex flex-col rounded-2xl border border-border bg-muted/20 p-4"
            >
              <ZonenInhalt zone={zone} role={role} kpis={kpis} />
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
