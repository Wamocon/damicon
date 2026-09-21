"use client";

// Variante 3: die Kennzahl steht dort, wo sie hingehoert.
//
// Heute stehen zwoelf Kennzahlen oben und die vier Zonen darunter, ohne dass
// eine Linie zwischen ihnen sichtbar waere - obwohl jede Kennzahl im
// Datenmodell bereits eine Zone traegt (Kpi.zone). Wer wissen will, woher
// "8,4 % Verlustquote" kommt, muss selbst darauf kommen, dass das die Zone
// Hof ist, und dort nachsehen.
//
// Diese Variante loest den oberen Block auf und gibt jeder Zonenkarte ihre
// eigenen Kennzahlen. Aus zwei Abschnitten wird einer, die Seite wird um die
// Hoehe des Kennzahlenrasters kuerzer.
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { kachelVerweis, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { hasPermission, type Role } from "@/lib/rbac";
import { modulesForZone, zones } from "@/lib/modules";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { TrendPfeil, useAnzeigewert } from "./gemeinsam";
import { nachDringlichkeit, zielAuswerten, type Zielstand } from "./zielstand";

const punkt: Record<Zielstand, string> = {
  verfehlt: "bg-destructive",
  knapp: "bg-warning",
  erfuellt: "bg-success",
  offen: "bg-muted-foreground/50",
};

function ZonenKennzahl({ kpi }: { kpi: Kpi }) {
  const kpiT = useTranslations("kpis");
  const t = useTranslations("dashboard");
  const anzeigewert = useAnzeigewert();
  const { stand } = zielAuswerten(kpi);

  return (
    <div className="min-w-0 rounded-xl bg-muted/40 p-2.5">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={cn("h-1.5 w-1.5 shrink-0 rounded-full", punkt[stand])}
        />
        <p className="min-w-0 flex-1 truncate text-base font-black text-foreground">
          {anzeigewert(kpi)}
        </p>
        <TrendPfeil kpi={kpi} className="h-3.5 w-3.5" />
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">
        {kpiT(`${kpi.key}.label`)}
      </p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("home.target")}: {kpi.ziel}
      </p>
    </div>
  );
}

export function ZonenMitKennzahlen({
  role,
  kpis,
  quelle,
}: {
  role: Role;
  /** Alle fuer die Rolle sichtbaren Kennzahlen, Kern und erweitert. */
  kpis: Kpi[];
  quelle: Datenquelle;
}) {
  const t = useTranslations("dashboard");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const quelleT = useTranslations("dashboard.dataSource");

  return (
    <Section
      title={t("entwurf.zonenTitel")}
      description={t("entwurf.zonenBeschreibung")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      }
    >
      {/* Zwei Spalten statt vier: die Karte traegt jetzt Kennzahlen und muss
          dafuer breiter sein. Auf 1600 px bleiben je Karte rund 640 px. */}
      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((zone) => {
          const visible = modulesForZone(zone.key).filter((m) =>
            hasPermission(role, m.resource, "view"),
          );
          const zonenKpis = nachDringlichkeit(
            kpis.filter((kpi) => kpi.zone === zone.key),
          );
          const angebunden = visible.filter(
            (m) => m.reifegrad === "angebunden",
          ).length;
          const demo = visible.filter((m) => m.reifegrad === "demo").length;
          const wip = visible.filter(
            (m) => m.reifegrad === "in-entwicklung",
          ).length;

          return (
            <Link
              key={zone.key}
              href={`/dashboard/${zone.key}`}
              className={cn(kachelVerweis, "@container p-5")}
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
              <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
                {zoneT(`${zone.key}.tagline`)}
              </p>

              {zonenKpis.length > 0 ? (
                <div className="mt-3 grid grid-cols-2 gap-2 @sm:grid-cols-3 @2xl:grid-cols-4">
                  {zonenKpis.map((kpi) => (
                    <ZonenKennzahl key={kpi.key} kpi={kpi} />
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-[11px] leading-4 text-muted-foreground">
                  {t("entwurf.zoneOhneKennzahl")}
                </p>
              )}

              {visible.length > 0 ? (
                <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground @xl:grid-cols-3">
                  {visible.map((module) => (
                    <li
                      key={module.key}
                      className="flex min-w-0 items-center gap-1.5"
                    >
                      <span
                        aria-hidden
                        className="h-1 w-1 shrink-0 rounded-full bg-primary/50"
                      />
                      <span className="truncate">
                        {moduleT(`${module.key}.navTitle`)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
                {angebunden > 0 ? (
                  <StatusPill tone="success">
                    {t("home.dbCount", { count: angebunden })}
                  </StatusPill>
                ) : null}
                {demo > 0 ? (
                  <StatusPill tone="info">
                    {t("home.demoCount", { count: demo })}
                  </StatusPill>
                ) : null}
                {wip > 0 ? (
                  <StatusPill tone="warning">
                    {t("home.wipCount", { count: wip })}
                  </StatusPill>
                ) : null}
              </div>
            </Link>
          );
        })}
      </div>
    </Section>
  );
}
