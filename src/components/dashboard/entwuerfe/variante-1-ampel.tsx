"use client";

// Variante 1: die Kennzahl sagt selbst, ob sie ihr Ziel haelt.
//
// Heute stehen Istwert und Zielwert untereinander und der Leser vergleicht
// selbst. "7,7 %" ueber "Ziel: < 6 %" sieht genauso aus wie "100 %" ueber
// "Ziel: 100 %" - einmal verfehlt, einmal erreicht, gleiche Optik. Diese
// Variante faerbt die Kante nach dem Abstand zum Ziel und sortiert die
// Kacheln danach: was am weitesten daneben liegt, steht vorn.
import { useTranslations } from "next-intl";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { TrendPfeil, useAnzeigewert, useKpiSektionstexte } from "./gemeinsam";
import { nachDringlichkeit, zielAuswerten, type Zielstand } from "./zielstand";

const kante: Record<Zielstand, string> = {
  verfehlt: "border-l-destructive",
  knapp: "border-l-warning",
  erfuellt: "border-l-success",
  offen: "border-l-border",
};

const schrift: Record<Zielstand, string> = {
  verfehlt: "text-destructive",
  knapp: "text-warning",
  erfuellt: "text-success",
  offen: "text-muted-foreground",
};

function AmpelKachel({ kpi }: { kpi: Kpi }) {
  const t = useTranslations("dashboard");
  const kpiT = useTranslations("kpis");
  const anzeigewert = useAnzeigewert();
  const { stand, abstand, platzhalter } = zielAuswerten(kpi);

  return (
    <Card className={cn("border-l-4 p-3", kante[stand])}>
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
          "mt-2 border-t border-border pt-1.5 text-[10px] font-semibold leading-3",
          schrift[stand],
        )}
      >
        {t(`entwurf.zielstand.${stand}`)}
        {abstand !== null && stand !== "erfuellt" ? (
          <span className="font-normal">
            {" · "}
            {t("entwurf.abstand", {
              prozent: Math.round(Math.abs(abstand) * 100),
            })}
          </span>
        ) : null}
      </p>
      {/* Der Platzhalter-Vorbehalt haengt an der einzelnen Zahl, nicht an der
          Sektion: acht der zwoelf Kacheln sind laengst gerechnet. */}
      {platzhalter ? (
        <p className="mt-1 text-[10px] leading-3 text-muted-foreground">
          {t("entwurf.platzhalterWert")}
        </p>
      ) : null}
    </Card>
  );
}

function Raster({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {nachDringlichkeit(kpis).map((kpi) => (
        <AmpelKachel key={kpi.key} kpi={kpi} />
      ))}
    </div>
  );
}

export function AmpelAbschnitt({
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
  const quelleT = useTranslations("dashboard.dataSource");
  const { titel } = useKpiSektionstexte(alle, quelle);

  const zaehlung = kern.reduce<Record<Zielstand, number>>(
    (summe, kpi) => {
      summe[zielAuswerten(kpi).stand] += 1;
      return summe;
    },
    { verfehlt: 0, knapp: 0, erfuellt: 0, offen: 0 },
  );

  return (
    <>
      <Section
        title={titel}
        description={t("entwurf.ampelBeschreibung")}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            {zaehlung.verfehlt > 0 ? (
              <StatusPill tone="danger">
                {t("entwurf.zaehlungVerfehlt", { anzahl: zaehlung.verfehlt })}
              </StatusPill>
            ) : null}
            {zaehlung.knapp > 0 ? (
              <StatusPill tone="warning">
                {t("entwurf.zaehlungKnapp", { anzahl: zaehlung.knapp })}
              </StatusPill>
            ) : null}
            {zaehlung.erfuellt > 0 ? (
              <StatusPill tone="success">
                {t("entwurf.zaehlungErfuellt", { anzahl: zaehlung.erfuellt })}
              </StatusPill>
            ) : null}
            <StatusPill tone={quelle === "db" ? "success" : "warning"}>
              {quelleT(quelle === "db" ? "db" : "demo")}
            </StatusPill>
          </div>
        }
      >
        {kern.length > 0 ? (
          <Raster kpis={kern} />
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
          <Raster kpis={erweitert} />
        </Section>
      ) : null}
    </>
  );
}
