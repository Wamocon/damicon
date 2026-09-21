"use client";

// Variante 4: der Projektplan verlaesst die Betriebsuebersicht.
//
// Unten auf der Startseite stehen heute zwei Karten "Meilensteine der
// internen Vorbereitung" mit Design-Token, Landingpage und Row Level
// Security - Bauzustand des Portals, sichtbar fuer jede Rolle, auch fuer den
// Pfluecker auf dem Telefon (siehe docs/text-audit-portal.md, Punkt 1).
//
// An ihre Stelle tritt die Frage, die an dieser Stelle wirklich offen ist:
// wie belastbar sind die Zahlen darueber. Woher kommen sie, wie viele sind
// gerechnet, wie alt ist der Stand.
//
// Zweite Aenderung, die dazugehoert: die Pille "Platzhalterwerte" haengt
// heute fest an der Sektion und widerspricht der Pille "Live-Daten"
// daneben. Sie gehoert an die einzelne Kachel, die noch ein Platzhalter ist.
import { useTranslations } from "next-intl";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { TrendPfeil, useAnzeigewert } from "./gemeinsam";

/** Kachel ohne Bauzustand in der Fusszeile - dort steht jetzt der Datenstand. */
function KachelOhneBauzustand({ kpi }: { kpi: Kpi }) {
  const t = useTranslations("dashboard");
  const kpiT = useTranslations("kpis");
  const anzeigewert = useAnzeigewert();

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
        className={cn(
          "mt-2 border-t border-border pt-1.5 text-[10px] leading-3",
          kpi.gerechnet ? "text-muted-foreground" : "text-warning",
        )}
      >
        {kpi.gerechnet
          ? t("entwurf.standGerechnet", { anzahl: kpi.gerechnet.datensaetze })
          : t("entwurf.platzhalterWert")}
      </p>
    </Card>
  );
}

export function KennzahlenOhneBauzustand({
  kern,
  erweitert,
  quelle,
}: {
  kern: Kpi[];
  erweitert: Kpi[];
  quelle: Datenquelle;
}) {
  const t = useTranslations("dashboard");
  const quelleT = useTranslations("dashboard.dataSource");
  return (
    <>
      <Section
        title={t("home.kpiTitle")}
        description={t("home.kpiDescription")}
        action={
          <StatusPill tone={quelle === "db" ? "success" : "warning"}>
            {quelleT(quelle === "db" ? "db" : "demo")}
          </StatusPill>
        }
      >
        {kern.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
            {kern.map((kpi) => (
              <KachelOhneBauzustand key={kpi.key} kpi={kpi} />
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
              <KachelOhneBauzustand key={kpi.key} kpi={kpi} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

export function DatenstandAbschnitt({
  alle,
  quelle,
  stand,
  istAdmin,
}: {
  alle: Kpi[];
  quelle: Datenquelle;
  stand: string;
  /** Nur die Administration bekommt den Verweis auf den Projektstand. */
  istAdmin: boolean;
}) {
  const t = useTranslations("dashboard.entwurf");
  const quelleT = useTranslations("dashboard.dataSource");
  const gerechnet = alle.filter((kpi) => kpi.gerechnet).length;
  const datensaetze = alle.reduce(
    (summe, kpi) => summe + (kpi.gerechnet?.datensaetze ?? 0),
    0,
  );

  return (
    <Section title={t("datenstand.titel")} description={t("datenstand.beschreibung")}>
      <Card>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
              {t("datenstand.quelle")}
            </dt>
            <dd className="mt-1 text-sm font-bold text-card-foreground">
              {quelleT(quelle === "db" ? "db" : "demo")}
            </dd>
          </div>
          <div>
            <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
              {t("datenstand.gerechnet")}
            </dt>
            <dd className="mt-1 text-sm font-bold text-card-foreground">
              {t("datenstand.gerechnetWert", {
                gerechnet,
                gesamt: alle.length,
                datensaetze,
              })}
            </dd>
          </div>
          <div>
            <dt className="schrift-label font-semibold uppercase tracking-wide text-muted-foreground">
              {t("datenstand.abruf")}
            </dt>
            <dd className="mt-1 text-sm font-bold text-card-foreground">{stand}</dd>
          </div>
        </dl>
        {istAdmin ? (
          <p className="mt-4 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
            {t("datenstand.projektHinweis")}
          </p>
        ) : null}
      </Card>
    </Section>
  );
}
