"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { modules, zones, type Reifegrad, type ZoneKey } from "@/lib/modules";

// Was in den vier Bereichen steckt: alle Module, nach Bereich sortiert. Eine
// durchlaufende Liste von 25 Namen liest niemand, deshalb ein Reiter je
// Bereich - dieselbe Gliederung wie im Portal. Der Punkt am Modul zeigt den
// Reifegrad, damit die Liste nicht mehr verspricht, als gebaut ist.
//
// Tastaturbedienung wie für Reiter üblich: Pfeiltasten wechseln, Pos 1 und
// Ende springen an die Enden, nur der aktive Reiter liegt im Tabulator-Lauf.
// Die Zahl am Reiter kommt aus lib/modules.ts, nicht aus dem Text - so kann
// sie nicht veralten.
// Record<Reifegrad, ...> statt Record<string, ...>: sonst faellt ein Ton
// fuer einen Reifegrad, den es nicht mehr gibt, weder tsc noch einem Test
// auf - genau so ueberlebte "demo" hier das Verschwinden des Werts aus
// lib/modules.ts und stand weiter in der Legende.
const REIFE_TON: Record<Reifegrad, string> = {
  angebunden: "bg-success",
  "in-entwicklung": "bg-muted-foreground/45",
};

const STUFEN = ["angebunden", "in-entwicklung"] as const satisfies readonly Reifegrad[];

export function ModulReiter() {
  const t = useTranslations("zones");
  const m = useTranslations("modules");
  const r = useTranslations("reifegrad");
  const s = useTranslations("landing");
  const [aktiv, setAktiv] = useState<ZoneKey>("feld");
  const knoepfe = useRef<Array<HTMLButtonElement | null>>([]);

  const springen = (i: number) => {
    const platz = (i + zones.length) % zones.length;
    setAktiv(zones[platz]!.key);
    knoepfe.current[platz]?.focus();
  };

  const liste = modules.filter((modul) => modul.zone === aktiv);

  return (
    <div className="mt-10 rounded-3xl border border-border bg-card p-5 md:p-6">
      <div role="tablist" aria-label={s("zonesTitle")} className="flex flex-wrap gap-2">
        {zones.map((zone, i) => {
          const gewaehlt = zone.key === aktiv;
          return (
            <button
              key={zone.key}
              ref={(element) => {
                knoepfe.current[i] = element;
              }}
              type="button"
              role="tab"
              id={`reiter-${zone.key}`}
              aria-selected={gewaehlt}
              aria-controls={`tafel-${zone.key}`}
              tabIndex={gewaehlt ? 0 : -1}
              onClick={() => setAktiv(zone.key)}
              onKeyDown={(ereignis) => {
                const ziel = {
                  ArrowRight: i + 1,
                  ArrowLeft: i - 1,
                  Home: 0,
                  End: zones.length - 1,
                }[ereignis.key];
                if (ziel === undefined) return;
                ereignis.preventDefault();
                springen(ziel);
              }}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${
                gewaehlt
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon name={zone.icon} className="h-4 w-4" />
              {t(`${zone.key}.name`)}
              <span className="text-xs font-black opacity-60">
                {modules.filter((modul) => modul.zone === zone.key).length}
              </span>
            </button>
          );
        })}
      </div>

      <div
        key={aktiv}
        role="tabpanel"
        id={`tafel-${aktiv}`}
        aria-labelledby={`reiter-${aktiv}`}
        tabIndex={0}
        className="mt-5 motion-safe:animate-[tafel-auf_0.4s_cubic-bezier(0.22,1,0.36,1)]"
      >
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
          {t(`${aktiv}.description`)}
        </p>

        <ul className="mt-4 flex flex-wrap gap-2">
          {liste.map((modul) => (
            <li
              key={modul.key}
              title={r(modul.reifegrad)}
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground"
            >
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${REIFE_TON[modul.reifegrad]}`} />
              {m(`${modul.key}.title`)}
            </li>
          ))}
        </ul>

        <p className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-[11px] text-muted-foreground">
          {STUFEN.map((stufe) => (
            <span key={stufe} className="inline-flex items-center gap-1.5">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${REIFE_TON[stufe]}`} />
              {r(stufe)}
            </span>
          ))}
        </p>
      </div>
    </div>
  );
}
