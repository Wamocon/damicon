"use client";

import { useFormatter, useTranslations } from "next-intl";
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { usePersona } from "@/components/dashboard/persona";
import { Card, PageHeader, Section, StatusPill } from "@/components/ui/kit";
import { hasPermission } from "@/lib/rbac";
import { modulesForZone, zones } from "@/lib/modules";
import {
  herkunftZaehlen,
  kpisFuerRolle,
  type Datenherkunft,
  type Kpi,
  type KpiTrend,
} from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";

const trendIcon: Record<KpiTrend, typeof ArrowUpRight> = {
  up: ArrowUpRight,
  down: ArrowDownRight,
  flat: Minus,
};

// Messbarkeit der Kennzahl - entscheidend fuer die Baseline-Unterschrift am
// 01.10.2026: was heute nicht erhoben wird, laesst sich auch nicht zusagen.
const herkunftFarbe: Record<Datenherkunft, string> = {
  berechenbar: "text-success",
  "erfassung-fehlt": "text-warning",
  "tabelle-fehlt": "text-muted-foreground",
  "rechtlich-ungeklaert": "text-warning",
};

const herkunftPunkt: Record<Datenherkunft, string> = {
  berechenbar: "bg-success",
  "erfassung-fehlt": "bg-warning",
  "tabelle-fehlt": "bg-muted-foreground/50",
  "rechtlich-ungeklaert": "bg-warning",
};

export function DashboardHome({
  kpis,
  quelle,
}: {
  kpis: Kpi[];
  quelle: Datenquelle;
}) {
  const { role } = usePersona();
  const t = useTranslations("dashboard");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const kpiT = useTranslations("kpis");
  const roleT = useTranslations("roles");
  const quelleT = useTranslations("dashboard.dataSource");
  const herkunftT = useTranslations("kpiHerkunft");
  const format = useFormatter();
  const herkunft = herkunftZaehlen(kpis);
  const gerechnet = kpis.filter((kpi) => kpi.gerechnet).length;
  // Anforderung 4.11: Cockpit auf hoechstens zwoelf Kennzahlen begrenzt
  // ("kern"), zusaetzlich nach Rolle gefiltert - eine betriebsweite Kennzahl
  // ist keine persoenliche Leistungszahl, siehe kpisFuerRolle().
  const { kern, erweitert } = kpisFuerRolle(role, kpis);

  // Der Rechenweg kommt als deutscher Text aus kpi_aktuell() und waere damit
  // in jeder Sprache deutsch. Der Schluessel der Kennzahl ist aber eindeutig,
  // also uebersetzen wir darueber. Liefert die Datenbank eine Kennzahl, fuer
  // die es noch keinen Schluessel gibt, bleibt der SQL-Text sichtbar - besser
  // ein deutscher Rechenweg als gar keiner.
  const basisText = (kpi: Kpi) =>
    kpiT.has(`${kpi.key}.basis`)
      ? kpiT(`${kpi.key}.basis`)
      : (kpi.gerechnet?.basis ?? "");

  const kpiKachel = (kpi: Kpi) => {
    const TrendCmp = trendIcon[kpi.trend];
    const positive =
      (kpi.trend === "up" && kpi.gutRichtung === "up") ||
      (kpi.trend === "down" && kpi.gutRichtung === "down");
    // Gerechnete Kennzahlen zeigen den Istwert aus der Datenbank, die
    // uebrigen weiter den unterschriebenen Platzhalter.
    const anzeige = kpi.gerechnet
      ? `${format.number(kpi.gerechnet.zahl, { maximumFractionDigits: 1 })} ${kpi.gerechnet.einheit}`.trim()
      : kpi.wert;
    // Eine rechtlich ungeklaerte Kennzahl bleibt gelb, auch wenn sie
    // technisch schon aus echten Daten gerechnet wird - "berechnet"
    // ist keine Aussage darueber, ob die Kennzahl ueberhaupt verlangt
    // ist. Sonst verschwindet der Vorbehalt genau dann, wenn die
    // Zahl zum ersten Mal echt ist.
    const rechtlichUngeklaert = kpi.datenherkunft === "rechtlich-ungeklaert";
    return (
      <Card key={kpi.key} className="p-3">
        <div className="flex items-start justify-between gap-1">
          <p className="text-lg font-black text-foreground">{anzeige}</p>
          <TrendCmp
            className={`h-4 w-4 shrink-0 ${
              kpi.trend === "flat"
                ? "text-muted-foreground"
                : positive
                  ? "text-success"
                  : "text-destructive"
            }`}
          />
        </div>
        <p className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground">
          {kpiT(`${kpi.key}.label`)}
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground">
          {t("home.target")}: {kpi.ziel}
        </p>
        <p
          title={
            rechtlichUngeklaert
              ? kpiT(`${kpi.key}.braucht`)
              : kpi.gerechnet
                ? basisText(kpi)
                : kpiT(`${kpi.key}.braucht`)
          }
          className={`mt-2 flex items-start gap-1 border-t border-border pt-1.5 text-[10px] leading-3 ${
            rechtlichUngeklaert
              ? herkunftFarbe[kpi.datenherkunft]
              : kpi.gerechnet
                ? "text-success"
                : herkunftFarbe[kpi.datenherkunft]
          }`}
        >
          <span
            aria-hidden="true"
            className={`mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full ${
              rechtlichUngeklaert
                ? herkunftPunkt[kpi.datenherkunft]
                : kpi.gerechnet
                  ? "bg-success"
                  : herkunftPunkt[kpi.datenherkunft]
            }`}
          />
          {rechtlichUngeklaert
            ? kpi.gerechnet
              ? t("home.kpiGerechnetUngeklaert", { anzahl: kpi.gerechnet.datensaetze })
              : herkunftT(kpi.datenherkunft)
            : kpi.gerechnet
              ? t("home.kpiGerechnet", { anzahl: kpi.gerechnet.datensaetze })
              : herkunftT(kpi.datenherkunft)}
        </p>
      </Card>
    );
  };

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("home.eyebrow")}
        title={t("home.title")}
        description={t("home.description")}
      >
        <StatusPill tone="info">{roleT(role)}</StatusPill>
      </PageHeader>

      <Section
        title={t("home.kpiTitle")}
        description={`${t("home.kpiDescription")} ${
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
        }`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusPill tone={quelle === "db" ? "success" : "warning"}>
              {quelleT(quelle === "db" ? "db" : "demo")}
            </StatusPill>
            <StatusPill tone="warning">{t("home.placeholderBadge")}</StatusPill>
          </div>
        }
      >
        {kern.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {kern.map(kpiKachel)}
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
            {erweitert.map(kpiKachel)}
          </div>
        </Section>
      ) : null}

      <Section title={t("home.zonesTitle")} description={t("home.zonesDescription")}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {zones.map((zone) => {
            const items = modulesForZone(zone.key);
            const visible = items.filter((m) =>
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
                className="group @container flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
              >
                {/* Symbol, Name und Pfeil teilen sich eine Zeile. Frueher
                    stand das Symbol allein darueber und kostete 52 px Hoehe,
                    ohne rechts von sich etwas zu tragen. */}
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon name={zone.icon} className="h-5 w-5" />
                  </span>
                  <h3 className="min-w-0 flex-1 truncate text-base font-black text-card-foreground">
                    {zoneT(`${zone.key}.name`)}
                  </h3>
                  {/* Der Pfeil ersetzt die Zeile "Zone oeffnen". Fuer den
                      Bildschirmleser bleibt sie als Text erhalten, damit die
                      Karte weiter ansagt, wohin sie fuehrt. */}
                  <span className="sr-only">{t("home.openZone")}</span>
                  <ArrowRight
                    aria-hidden
                    className="h-4 w-4 shrink-0 text-primary transition group-hover:translate-x-0.5"
                  />
                </div>
                <p className="mt-2.5 text-xs leading-5 text-muted-foreground">
                  {zoneT(`${zone.key}.tagline`)}
                </p>
                {/* Die Module der Zone, so wie sie in der Seitenleiste
                    heissen. Sie beantworten die Frage, die vor der Karte
                    steht: was steckt in diesem Bereich. Gefiltert ist nach
                    denselben Rechten wie die Zaehlung darunter, eine Rolle
                    sieht hier also nur, was sie auch oeffnen darf. */}
                {/* Zwei Spalten erst ab 18rem Innenbreite der Karte, gemessen
                    an der Karte und nicht am Fenster. Bei vier Rasterspalten
                    neben der Seitenleiste ist die Karte auf 1440 px nur
                    216 px breit; dort blieben je Spalte 92 px, und
                    "Qualitaetsfaktor-Lohn" (106 px) stand abgeschnitten da.
                    Ein abgeschnittener Modulname ist schlechter als eine
                    Zeile mehr. Ab 288 px bleiben 128 px je Spalte, genug auch
                    fuer das laengste englische "Roles and permissions". */}
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
                {/* mt-auto: das Raster streckt alle Karten auf die Hoehe der
                    laengsten (Buero, neun Module). Die Pillen stehen dann in
                    jeder Karte auf derselben Linie. */}
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
    </div>
  );
}
