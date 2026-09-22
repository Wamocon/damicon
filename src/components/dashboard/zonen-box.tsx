"use client";

// Die Zonenkarte der gewaehlten Richtung: Zone, ihre Kennzahlen, ihre Module.
//
// Aus Runde 2 uebernommen und fest verdrahtet: das Zielband in jeder
// Kennzahlbox (dort Variante 1) und die Module als Knoepfe statt als Text
// (dort Variante 4). Offen ist nur noch, wie die Zonen im Abschnitt sitzen -
// als eigene Karten oder flach, durch Linien getrennt.
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { Section, StatusPill } from "@/components/ui/kit";
import { hasPermission, type Role } from "@/lib/rbac";
import {
  modulesForZone,
  zones,
  type ModuleDef,
  type ZoneDef,
} from "@/lib/modules";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { KennzahlBox } from "@/components/dashboard/kennzahl-box";
import { nachDringlichkeit } from "@/lib/domain/zielstand";

function ModulKnoepfe({
  zone,
  module,
}: {
  zone: ZoneDef;
  module: ModuleDef[];
}) {
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard.home");
  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
        {t("moduleTitel")}
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

// Nur noch, was nicht selbstverstaendlich ist. "6 angebunden" stand ueber
// einer Liste, die dieselben Module gerade einzeln aufgezaehlt hat, und galt
// fuer 24 von 26 Modulen - eine Zahl, die nichts unterscheidet. Die Zaehlung
// der Demo-Module war ohnehin immer null.
function OffenePillen({ module }: { module: ModuleDef[] }) {
  const t = useTranslations("dashboard");
  const wip = module.filter((m) => m.reifegrad === "in-entwicklung").length;
  if (wip === 0) return null;
  return (
    <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
      <StatusPill tone="warning">{t("home.wipCount", { count: wip })}</StatusPill>
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
  const zoneT = useTranslations("zones");

  const sichtbareModule = modulesForZone(zone.key).filter((m) =>
    hasPermission(role, m.resource, "view"),
  );
  const zonenKpis = nachDringlichkeit(
    kpis.filter((kpi) => kpi.zone === zone.key),
  );

  return (
    <>
      {/* Die Karte enthaelt Verweise auf die Module und kann deshalb nicht
          selbst einer sein - verschachtelte <a> sind ungueltiges HTML. Den
          Weg in die Zone traegt der Kopf. */}
      <Link
        href={`/dashboard/${zone.key}`}
        title={t("home.openZone")}
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
            // Schmaler Platz: bei drei Spalten ist eine Box rund 145 px
            // breit. kachelform() gibt hier deshalb keinen Punktstreifen und
            // keine Heldenzahl aus, beides faellt auf das Meter zurueck.
            <KennzahlBox key={kpi.key} kpi={kpi} platz="schmal" />
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-[11px] leading-4 text-muted-foreground">
          {t("home.zoneOhneKennzahl")}
        </p>
      )}

      {sichtbareModule.length > 0 ? (
        <ModulKnoepfe zone={zone} module={sichtbareModule} />
      ) : null}

      <OffenePillen module={sichtbareModule} />
    </>
  );
}

export function ZonenBox({
  role,
  kpis,
  quelle,
  flach = false,
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
}) {
  const t = useTranslations("dashboard.home");
  const quelleT = useTranslations("dashboard.dataSource");

  return (
    <Section
      title={t("zonesTitle")}
      description={t("zonesDescription")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      }
    >
      {flach ? (
        <div className="divide-y divide-border">
          {zones.map((zone) => (
            <div
              key={zone.key}
              data-zone={zone.key}
              className="@container flex flex-col py-5 first:pt-0 last:pb-0"
            >
              <ZonenInhalt zone={zone} role={role} kpis={kpis} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {zones.map((zone) => (
            <div
              key={zone.key}
              data-zone={zone.key}
              className="@container flex flex-col rounded-2xl border border-border bg-muted/20 p-4"
            >
              <ZonenInhalt zone={zone} role={role} kpis={kpis} />
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
