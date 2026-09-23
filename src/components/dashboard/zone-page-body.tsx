"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronDown } from "lucide-react";
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
import { KennzahlBox } from "@/components/dashboard/kennzahl-box";
import { ModulStatusPille } from "@/components/dashboard/module-meta";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import { moduleHref, modulesForZone, type ZoneKey } from "@/lib/modules";
import { kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import { nachDringlichkeit } from "@/lib/domain/zielstand";
import {
  kachelform,
  kachelgroesse,
  kachelSpanne,
} from "@/lib/domain/kachel-form";
import type { Datenquelle } from "@/lib/supabase/config";

// Der Kennzahlenabschnitt der Zone. Dieselben Bausteine wie auf der
// Uebersicht - Section, KennzahlBox, nachDringlichkeit -, nur ohne die
// Zonenschleife: hier steht genau eine Zone, dafuer mit allen ihren
// Kennzahlen statt nur den Kern-Kacheln. Auf der Uebersicht ist der Platz
// knapp, hier nicht.
//
// @container statt Fensterbreite: was in der Karte umbricht, richtet sich
// nach der Karte. Sonst steht bei 1440 px ein abgeschnittener Kennzahlname
// da, obwohl das Fenster breit ist.
type Verteilungen = Record<string, { name: string; wert: number }[]>;

function Kennzahlen({
  kpis,
  quelle,
  verteilungen,
}: {
  kpis: Kpi[];
  quelle: Datenquelle;
  verteilungen: Verteilungen;
}) {
  const t = useTranslations("dashboard");
  const quelleT = useTranslations("dashboard.dataSource");
  const [offen, setOffen] = useState(false);

  const { role } = usePersona();

  // Der Lueckenhinweis gilt nur bei echter Datenbank. Im Demo-Modus ist keine
  // Kennzahl gerechnet, weil gar keine Datenbank da ist - dort waere "die
  // Auswertung fehlt noch" schlicht falsch. Die Pille am Abschnitt sagt in
  // dem Fall bereits "Beispieldaten", und das ist die richtige Auskunft.
  const istDb = quelle === "db";

  // Zweiter Durchlauf nach dem serverseitigen Vorfilter, genau wie in
  // home.tsx: ein Admin in der "Ansicht als"-Vorschau bekommt alle
  // Kennzahlen vom Server und schneidet hier auf die Vorschaurolle zu.
  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const erweitertSortiert = nachDringlichkeit(erweitert);

  const form = (kpi: Kpi) =>
    kachelform(kpi, "breit", (verteilungen[kpi.key]?.length ?? 0) > 1);

  // Die Heldenzahl steht ueber dem Raster, nicht darin: genau eine je
  // Ansicht, sonst ist keine mehr hervorgehoben. Bekommt eine Zone keine,
  // faengt sie schlicht mit dem Raster an.
  const alleKern = nachDringlichkeit(kern);
  const held = alleKern.find((kpi) => form(kpi) === "held");

  // Die Heldenzahl fuehrt die Ansicht an, auch wenn sie im Ziel liegt und
  // nachDringlichkeit sie ans Ende schoebe. Sie ist nicht die dringendste
  // Kennzahl, sondern die wichtigste - das ist nicht dasselbe.
  const kernSortiert = held
    ? [held, ...alleKern.filter((kpi) => kpi !== held)]
    : alleKern;

  // Drei Groessen, mehr nicht. Welche eine Form bekommt, steht in
  // lib/domain/kachel-form.ts; hier wird sie nur ins Raster uebersetzt.
  const spanne = (kpi: Kpi) => kachelSpanne[kachelgroesse(form(kpi))];

  // Alle Kacheln bekommen dieselbe Spalte. Frueher nahm der Punktstreifen
  // zwei - das machte ihn lesbarer, liess die Reihe aber in zwei Groessen
  // zerfallen. Bei vier Spalten auf dem Schreibtisch bleibt eine Spalte breit
  // genug fuer den Streifen, und die Karten tragen eine gemeinsame Silhouette.

  if (kernSortiert.length === 0 && erweitertSortiert.length === 0) {
    return (
      <Section title={t("zoneKennzahlTitel")} description={t("zoneKennzahlLead")}>
        <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {t("home.zoneOhneKennzahl")}
        </p>
      </Section>
    );
  }

  return (
    <Section
      title={t("zoneKennzahlTitel")}
      description={t("zoneKennzahlLead")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelleT(quelle === "db" ? "db" : "demo")}
        </StatusPill>
      }
    >
      <div className="@container">
        {/* Dieselbe Kachelgroesse wie auf der Uebersicht, rund 180 px. Das
            Raster nimmt so viele Spuren, wie hineinpassen (auto-fill), statt
            vier feste Spalten zu setzen - auf der breiten Bereichsseite sind
            das sechs statt vier, und die Karte bleibt klein. auto-rows-fr
            haelt alle Reihen auf gleicher Hoehe. */}
        <div className="grid auto-rows-fr gap-2 grid-cols-2 @md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
          {kernSortiert.map((kpi) => (
            <div key={kpi.key} className={cn("min-w-0", spanne(kpi))}>
              <KennzahlBox
                kpi={kpi}
                platz="breit"
                verteilung={verteilungen[kpi.key]}
                lueckeZeigen={istDb}
              />
            </div>
          ))}
        </div>

        {/* Die Baseline umfasst 14 Kennzahlen, das Cockpit aus Anforderung
            4.11 nur zwoelf. Die restlichen zwei gehoeren dazu, stehen aber
            nicht im ersten Blick - sonst waere die Obergrenze umgangen,
            indem man sie einfach danebenstellt. */}
        {erweitertSortiert.length > 0 ? (
          <div className="mt-3 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => setOffen((vorher) => !vorher)}
              aria-expanded={offen}
              className="inline-flex items-center gap-1.5 rounded-md text-xs font-semibold text-primary transition hover:text-primary/80"
            >
              <ChevronDown
                aria-hidden
                className={cn("h-3.5 w-3.5 transition", offen && "rotate-180")}
              />
              {offen
                ? t("zoneKennzahlWeniger")
                : t("zoneKennzahlMehr", { count: erweitertSortiert.length })}
            </button>

            {offen ? (
              <div className="mt-3 grid auto-rows-fr gap-2 grid-cols-2 @md:grid-cols-[repeat(auto-fill,minmax(170px,1fr))]">
                {erweitertSortiert.map((kpi) => (
                  <div key={kpi.key} className={cn("min-w-0", spanne(kpi))}>
                    <KennzahlBox
                      kpi={kpi}
                      platz="breit"
                      verteilung={verteilungen[kpi.key]}
                      lueckeZeigen={istDb}
                    />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

// Dasselbe Boxensystem wie die Uebersichtsseite: jeder Abschnitt sitzt in
// einer Card, was darin als eigene Einheit steht, traegt den gedaempften
// Grund und keinen Schatten. Zwei Karten mit Schatten uebereinander sehen
// aus wie ein Fehler.
export function ZonePageBody({
  zone,
  kpis,
  quelle,
  verteilungen = {},
}: {
  zone: ZoneKey;
  /** Bereits serverseitig auf Rolle und Zone geschnitten. */
  kpis: Kpi[];
  quelle: Datenquelle;
  /** Einzelwerte hinter einzelnen Kennzahlen, je Schluessel. */
  verteilungen?: Verteilungen;
}) {
  const { role } = usePersona();
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const t = useTranslations("dashboard");

  const items = modulesForZone(zone).filter((module) =>
    hasPermission(role, module.resource, "view"),
  );

  return (
    <div className="space-y-6">
      <Card ton="box" className="p-5 sm:p-6">
        <PageHeader
          title={zoneT(`${zone}.name`)}
          description={zoneT(`${zone}.description`)}
        />
      </Card>

      {/* Die Kennzahlen stehen ueber den Modulen. Wer die Bereichsseite
          oeffnet, will zuerst wissen, wie der Bereich dasteht, und erst
          danach, womit man daran arbeitet. */}
      <Kennzahlen kpis={kpis} quelle={quelle} verteilungen={verteilungen} />

      <Section title={t("home.moduleTitel")} description={t("zoneModuleLead")}>
        {items.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            {t("zoneEmpty")}
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
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
                  {module.reifegrad === "in-entwicklung" ? (
                    <span className="ml-auto shrink-0">
                      <ModulStatusPille />
                    </span>
                  ) : null}
                </div>
                <p className="mt-2.5 flex-1 text-sm leading-6 text-muted-foreground">
                  {moduleT(`${module.key}.summary`)}
                </p>
                {/* Links stand bis zur Textpruefung die Einstufung aus der
                    Migrationsanalyse. Ohne sie traegt die Zeile nur noch den
                    Weg ins Modul, also rueckt er nach rechts. */}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-border pt-3">
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
      </Section>
    </div>
  );
}
