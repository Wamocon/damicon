"use client";

// Die Bausteine der heutigen Uebersichtsseite, unveraendert aus
// src/components/dashboard/home.tsx herausgeloest. Jede Variante unter
// entwuerfe/ ersetzt genau einen davon und laesst die uebrigen stehen - nur so
// zeigt ein Vergleichsbild den Unterschied und nicht das Rauschen daneben.
//
// Diese Datei ist Entwurfsmaterial. Sie verschwindet mit der Entwurfsroute,
// sobald eine Variante steht.
import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import {
  Card,
  kachelVerweis,
  PageHeader,
  Section,
  StatusPill,
} from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { hasPermission, type Role } from "@/lib/rbac";
import { modulesForZone, zones } from "@/lib/modules";
import {
  herkunftZaehlen,
  type Datenherkunft,
  type Kpi,
  type KpiTrend,
} from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";

export const trendIcon: Record<KpiTrend, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

export const herkunftFarbe: Record<Datenherkunft, string> = {
  berechenbar: "text-success",
  "erfassung-fehlt": "text-warning",
  "tabelle-fehlt": "text-muted-foreground",
  "rechtlich-ungeklaert": "text-warning",
};

export const herkunftPunkt: Record<Datenherkunft, string> = {
  berechenbar: "bg-success",
  "erfassung-fehlt": "bg-warning",
  "tabelle-fehlt": "bg-muted-foreground/50",
  "rechtlich-ungeklaert": "bg-warning",
};

/** Der Trendpfeil der Kachel, samt Faerbung nach gutRichtung. */
export function TrendPfeil({ kpi, className }: { kpi: Kpi; className?: string }) {
  const Cmp = trendIcon[kpi.trend];
  const positive =
    (kpi.trend === "up" && kpi.gutRichtung === "up") ||
    (kpi.trend === "down" && kpi.gutRichtung === "down");
  return (
    <Cmp
      className={cn(
        "h-4 w-4 shrink-0",
        kpi.trend === "flat"
          ? "text-muted-foreground"
          : positive
            ? "text-success"
            : "text-destructive",
        className,
      )}
    />
  );
}

/** Formatierter Anzeigewert: gerechneter Istwert, sonst Platzhalter. */
export function useAnzeigewert() {
  const format = useFormatter();
  return (kpi: Kpi) =>
    kpi.gerechnet
      ? `${format.number(kpi.gerechnet.zahl, { maximumFractionDigits: 1 })} ${kpi.gerechnet.einheit}`.trim()
      : kpi.wert;
}

export function KpiKachel({ kpi }: { kpi: Kpi }) {
  const t = useTranslations("dashboard");
  const kpiT = useTranslations("kpis");
  const herkunftT = useTranslations("kpiHerkunft");
  const anzeigewert = useAnzeigewert();
  const rechtlichUngeklaert = kpi.datenherkunft === "rechtlich-ungeklaert";
  const basisText = kpiT.has(`${kpi.key}.basis`)
    ? kpiT(`${kpi.key}.basis`)
    : (kpi.gerechnet?.basis ?? "");
  const gruen = !rechtlichUngeklaert && kpi.gerechnet;

  return (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-1">
        <p className="text-lg font-black text-foreground">{anzeigewert(kpi)}</p>
        <TrendPfeil kpi={kpi} />
      </div>
      <p className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground">
        {kpiT(`${kpi.key}.label`)}
      </p>
      <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {t("home.target")}: {kpi.ziel}
      </p>
      <p
        title={
          rechtlichUngeklaert || !kpi.gerechnet
            ? kpiT(`${kpi.key}.braucht`)
            : basisText
        }
        className={cn(
          "mt-2 flex items-start gap-1 border-t border-border pt-1.5 text-[10px] leading-3",
          gruen ? "text-success" : herkunftFarbe[kpi.datenherkunft],
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full",
            gruen ? "bg-success" : herkunftPunkt[kpi.datenherkunft],
          )}
        />
        {rechtlichUngeklaert
          ? kpi.gerechnet
            ? t("home.kpiGerechnetUngeklaert", {
                anzahl: kpi.gerechnet.datensaetze,
              })
            : herkunftT(kpi.datenherkunft)
          : kpi.gerechnet
            ? t("home.kpiGerechnet", { anzahl: kpi.gerechnet.datensaetze })
            : herkunftT(kpi.datenherkunft)}
      </p>
    </Card>
  );
}

export function KopfBereich({ role }: { role: Role }) {
  const t = useTranslations("dashboard");
  const roleT = useTranslations("roles");
  return (
    <PageHeader
      eyebrow={t("home.eyebrow")}
      title={t("home.title")}
      description={t("home.description")}
    >
      <StatusPill tone="info">{roleT(role)}</StatusPill>
    </PageHeader>
  );
}

/** Ueberschrift, Zaehlzeile und Pillen der Kennzahlen-Sektion. */
export function useKpiSektionstexte(kpis: Kpi[], quelle: Datenquelle) {
  const t = useTranslations("dashboard");
  const quelleT = useTranslations("dashboard.dataSource");
  const herkunft = herkunftZaehlen(kpis);
  const gerechnet = kpis.filter((kpi) => kpi.gerechnet).length;
  const beschreibung = `${t("home.kpiDescription")} ${
    gerechnet > 0
      ? t("home.kpiSummaryLive", {
          gerechnet,
          offen: kpis.length - gerechnet,
        })
      : t("home.kpiSummary", {
          berechenbar: herkunft.berechenbar,
          erfassung: herkunft["erfassung-fehlt"],
          tabelle: herkunft["tabelle-fehlt"],
          ungeklaert: herkunft["rechtlich-ungeklaert"],
        })
  }`;
  const pillen = (
    <div className="flex flex-wrap items-center gap-1.5">
      <StatusPill tone={quelle === "db" ? "success" : "warning"}>
        {quelleT(quelle === "db" ? "db" : "demo")}
      </StatusPill>
      <StatusPill tone="warning">{t("home.placeholderBadge")}</StatusPill>
    </div>
  );
  return { titel: t("home.kpiTitle"), beschreibung, pillen };
}

export function KpiAbschnitt({
  kern,
  erweitert,
  alle,
  quelle,
}: {
  kern: Kpi[];
  erweitert: Kpi[];
  alle: Kpi[];
  quelle: Datenquelle;
}) {
  const t = useTranslations("dashboard");
  const { titel, beschreibung, pillen } = useKpiSektionstexte(alle, quelle);
  return (
    <>
      <Section title={titel} description={beschreibung} action={pillen}>
        {kern.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {kern.map((kpi) => (
              <KpiKachel key={kpi.key} kpi={kpi} />
            ))}
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
            {t("home.kpiNoneForRole")}
          </p>
        )}
      </Section>
      {erweitert.length > 0 ? (
        <Section
          title={t("home.kpiExtendedTitle")}
          description={t("home.kpiExtendedDescription")}
        >
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {erweitert.map((kpi) => (
              <KpiKachel key={kpi.key} kpi={kpi} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

export function ZonenAbschnitt({ role }: { role: Role }) {
  const t = useTranslations("dashboard");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  return (
    <Section
      title={t("home.zonesTitle")}
      description={t("home.zonesDescription")}
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((zone) => {
          const visible = modulesForZone(zone.key).filter((m) =>
            hasPermission(role, m.resource, "view"),
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
              {visible.length > 0 ? (
                <ul className="mt-3 grid grid-cols-1 gap-x-3 gap-y-1 border-t border-border pt-3 text-[11px] leading-4 text-muted-foreground @2xs:grid-cols-2">
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

export function MeilensteinAbschnitt() {
  const t = useTranslations("dashboard");
  return (
    <Section
      title={t("home.milestoneTitle")}
      description={t("home.milestoneDescription")}
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-card-foreground">
              {t("home.milestoneAName")}
            </p>
            <StatusPill tone="success">{t("home.milestoneADue")}</StatusPill>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {["tokens", "landing", "zones", "workflows"].map((k) => (
              <li key={k} className="flex gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                {t(`home.milestoneAItems.${k}`)}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <p className="text-sm font-black text-card-foreground">
              {t("home.milestoneBName")}
            </p>
            <StatusPill tone="success">{t("home.milestoneBDue")}</StatusPill>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {["rbac", "hierarchy", "status", "tasks", "docs", "i18n", "kpi"].map(
              (k) => (
                <li key={k} className="flex gap-2">
                  <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                  {t(`home.milestoneBItems.${k}`)}
                </li>
              ),
            )}
          </ul>
          <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            {t("home.milestoneBNote")}
          </p>
        </Card>
      </div>
    </Section>
  );
}
