"use client";

// Variante 5: aus vierzehn Kacheln wird eine Liste.
//
// Das Kachelraster braucht auf 1600 px rund 460 px Hoehe fuer zwoelf Zahlen,
// auf dem Telefon sieben Bildschirmlaengen fuer vierzehn. Eine Kachel ist die
// teuerste Form, eine einzelne Zahl zu zeigen: sie traegt Rahmen, Schatten,
// vier Textzeilen und viel Luft.
//
// Diese Variante nutzt DataTable aus dem Kit. Die Kennzahlen stehen als
// Zeilen untereinander, mit Zone, Istwert, Ziel und Zielstand in eigenen
// Spalten - vergleichbar von oben nach unten, was zwischen Kacheln nie
// gelingt. Unter `md` macht der Baustein daraus von selbst Karten mit
// Spaltenbeschriftung, siehe globals.css.
import { useTranslations } from "next-intl";
import { DataTable, Section, StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import type { Kpi } from "@/lib/domain/kpis";
import type { Datenquelle } from "@/lib/supabase/config";
import { TrendPfeil, useAnzeigewert } from "./gemeinsam";
import { nachDringlichkeit, zielAuswerten, type Zielstand } from "./zielstand";

const ton: Record<Zielstand, "danger" | "warning" | "success" | "neutral"> = {
  verfehlt: "danger",
  knapp: "warning",
  erfuellt: "success",
  offen: "neutral",
};

export function KennzahlenAlsZeilen({
  kern,
  erweitert,
  quelle,
}: {
  kern: Kpi[];
  erweitert: Kpi[];
  quelle: Datenquelle;
}) {
  const t = useTranslations("dashboard");
  const entwurfT = useTranslations("dashboard.entwurf");
  const kpiT = useTranslations("kpis");
  const zoneT = useTranslations("zones");
  const quelleT = useTranslations("dashboard.dataSource");
  const anzeigewert = useAnzeigewert();

  const kopf = [
    entwurfT("zeile.spalteKennzahl"),
    entwurfT("zeile.spalteZone"),
    entwurfT("zeile.spalteIst"),
    entwurfT("zeile.spalteZiel"),
    entwurfT("zeile.spalteStand"),
  ];

  // Die zwei erweiterten Kennzahlen stehen heute in einem eigenen Abschnitt
  // mit eigener Ueberschrift. In einer Liste genuegt die Trennlinie: sie
  // haengen hinten dran und sind als erweitert gekennzeichnet.
  const zeilen = [
    ...nachDringlichkeit(kern).map((kpi) => ({ kpi, erweitert: false })),
    ...nachDringlichkeit(erweitert).map((kpi) => ({ kpi, erweitert: true })),
  ];

  if (zeilen.length === 0) {
    return (
      <Section title={t("home.kpiTitle")} description={t("home.kpiDescription")}>
        <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
          {t("home.kpiNoneForRole")}
        </p>
      </Section>
    );
  }

  return (
    <Section
      title={t("home.kpiTitle")}
      description={entwurfT("zeile.beschreibung")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      }
    >
      <DataTable head={kopf}>
        {zeilen.map(({ kpi, erweitert: istErweitert }) => {
          const { stand, abstand } = zielAuswerten(kpi);
          return (
            <tr key={kpi.key}>
              <td className="px-3 py-2">
                <span className="font-semibold text-card-foreground">
                  {kpiT(`${kpi.key}.label`)}
                </span>
                {istErweitert ? (
                  <span className="ml-2 text-[10px] uppercase tracking-wide text-muted-foreground">
                    {entwurfT("zeile.erweitert")}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {zoneT(`${kpi.zone}.name`)}
              </td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 font-black tabular-nums text-foreground">
                  {anzeigewert(kpi)}
                  <TrendPfeil kpi={kpi} className="h-3.5 w-3.5" />
                </span>
                {!kpi.gerechnet ? (
                  <span className="ml-2 text-[10px] text-warning">
                    {entwurfT("platzhalterWert")}
                  </span>
                ) : null}
              </td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">
                {kpi.ziel}
              </td>
              <td className="px-3 py-2">
                <StatusPill tone={ton[stand]}>
                  {entwurfT(`zielstand.${stand}`)}
                </StatusPill>
                {abstand !== null && stand !== "erfuellt" ? (
                  <span
                    className={cn(
                      "ml-2 text-[11px]",
                      stand === "verfehlt" ? "text-destructive" : "text-warning",
                    )}
                  >
                    {entwurfT("abstand", {
                      prozent: Math.round(Math.abs(abstand) * 100),
                    })}
                  </span>
                ) : null}
              </td>
            </tr>
          );
        })}
      </DataTable>
    </Section>
  );
}
