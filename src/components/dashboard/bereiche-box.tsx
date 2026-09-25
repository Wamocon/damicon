"use client";

import { useTranslations } from "next-intl";
import { ArrowRight, Briefcase, Sprout, Store, Warehouse } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { usePersona } from "@/components/dashboard/persona";
import { KennzahlBox } from "@/components/dashboard/kennzahl-box";
import { Section, StatusPill } from "@/components/ui/kit";
import { kpisFuerRolle, type Kpi } from "@/lib/domain/kpis";
import { auffaelligeZuerst } from "@/lib/domain/zielstand";
import { zones } from "@/lib/modules";
import type { Datenquelle } from "@/lib/supabase/config";

// Die vier Bereiche unter dem Compliance-Report: je ein Einstieg mit den Kennzahlen seiner
// Zone. Stand am 23.09.2026 kurzzeitig hinter einem Reiter; der ist wieder entfallen, die
// Seite ist ein Strang.
//
// Zwei Entscheidungen stecken darin, beide vom 23.09.2026:
//
// 1. Die Kennzahlen stehen bei ihrem Bereich, nicht in einem eigenen Reiter. Das haelt die
//    Entscheidung aus Runde 1 vom 21.09., und ihre Begruendung gilt unveraendert: "Wer wissen
//    wollte, woher '8,4 % Verlustquote' kommt, musste selbst darauf kommen, dass das die Zone
//    Hof ist." Ein eigener Kennzahlen-Reiter haette Zahl und Herkunft wieder getrennt.
//    Gezeigt wird nur, was ausserhalb seines Ziels liegt - der vollstaendige Satz steht auf
//    der Bereichsseite.
//
// 2. Die sechsundzwanzig Modulknoepfe sind ersatzlos entfallen. Woertlich: "Den Modulabsprung
//    brauchen wir auf der Hauptseite nicht. Dafuer ist das Menue da. Es reichen die Bereiche."
//    Das nimmt Runde 2 / Variante 4 zurueck ("Module als Wege"), die die Modulnamen zu
//    Knoepfen gemacht hatte, um einen Klick zu sparen - und damit sechsundzwanzig gleich
//    aussehende Ziele erzeugte, zwischen denen der Weg ins Modul unterging. Der Weg fuehrt
//    ab jetzt ueber die Seitenleiste und die Bereichsseite, die die Module ohnehin mit Titel,
//    Kurzbeschreibung und Reifegrad auflistet.
//
// "use client" wegen usePersona(): ein Admin in der Vorschau "als buchhaltung" soll die
// Kennzahlen dieser Rolle sehen. Der Server hat bereits nach der ECHTEN Rolle gefiltert
// (dashboard/page.tsx), hier wird fuer die Vorschau weiter eingeschraenkt.
//
// Die Zonenkarte ist nicht als Ganzes ein Verweis: sie enthaelt die Kennzahlkacheln, und
// verschachtelte <a> waeren ungueltiges HTML. Der Verweis sitzt deshalb auf dem Kartenkopf -
// dieselbe Loesung wie in der Vorgaengerfassung zonen-box.tsx.

// Wie viele Kennzahlen jede Zonenkarte mindestens zeigt. Vier, weil die groesste Zone
// heute genau vier freigegebene hat - so tragen alle vier Karten gleich viel und stehen
// ruhig nebeneinander.
const JE_BEREICH = 4;

const SYMBOL: Record<string, LucideIcon> = {
  sprout: Sprout,
  warehouse: Warehouse,
  briefcase: Briefcase,
  store: Store,
};

export function BereicheBox({ kpis, quelle }: { kpis: Kpi[]; quelle: Datenquelle }) {
  const t = useTranslations("dashboard.bereiche");
  const quelleT = useTranslations("dashboard.dataSource");
  const zoneT = useTranslations("zones");
  const { role } = usePersona();

  const { kern, erweitert } = kpisFuerRolle(role, kpis);
  const sichtbar = [...kern, ...erweitert];

  return (
    <Section
      title={t("titel")}
      description={t("lead")}
      action={
        <StatusPill tone={quelle === "db" ? "success" : "warning"}>
          {quelle === "db" ? quelleT("db") : quelleT("demo")}
        </StatusPill>
      }
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {zones.map((zone) => {
          const Symbol = SYMBOL[zone.icon] ?? Sprout;
          // Vier je Bereich, Auffaelliges zuerst, der Rest aufgefuellt mit dem, was im Ziel
          // liegt. Hat die Rolle weniger freigegeben, stehen eben weniger da.
          const dieser = auffaelligeZuerst(sichtbar.filter((kpi) => kpi.zone === zone.key), JE_BEREICH);

          return (
            <div key={zone.key} className="@container rounded-2xl border border-border bg-muted/20 p-4">
              <Link href={`/dashboard/${zone.slug}`} className="group flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
                  aria-hidden
                >
                  <Symbol className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-bold text-card-foreground">{zoneT(`${zone.key}.name`)}</span>
                  <span className="block text-xs text-muted-foreground">{zoneT(`${zone.key}.tagline`)}</span>
                </span>
                <ArrowRight
                  className="h-4 w-4 shrink-0 text-primary transition-transform group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>

              {dieser.length > 0 ? (
                <div className="mt-3 grid auto-rows-fr grid-cols-2 gap-2 @md:grid-cols-3 @xl:grid-cols-4">
                  {dieser.map((kpi) => (
                    <KennzahlBox key={kpi.key} kpi={kpi} platz="schmal" />
                  ))}
                </div>
              ) : (
                <p className="mt-3 rounded-xl border border-dashed border-border p-3 text-xs leading-5 text-muted-foreground">
                  {t("ohneKennzahl")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </Section>
  );
}
