"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { zones } from "@/lib/modules";

// Vier Bereiche, eine Charge. Das Bild zeigt, was der Satz daneben behauptet:
// Feld, Hof, Büro und Markt hängen an derselben Charge, nicht an vier eigenen
// Listen.
//
// Die Bereiche docken nacheinander an, sobald der Abschnitt im Bild steht,
// und bleiben dann stehen. Eine Dauerschleife neben dem laufenden Hero-Video
// wäre Unruhe ohne Aussage.
//
// Wie bei Reveal steht der Endzustand im Markup: Ohne JavaScript und bei
// reduzierter Bewegung ist das Bild sofort vollständig. Erst der Browser
// setzt den Ausgangszustand und dockt dann der Reihe nach an - deshalb kein
// React-Zustand, sondern ein data-Attribut je Teil.
//
// Die Speichen sind ein SVG mit pathLength 1: Damit lässt sich der Strich
// unabhängig von seiner wirklichen Länge über stroke-dashoffset zeichnen.

// Mittelpunkt der Marke im quadratischen Feld, beginnend oben im Uhrzeigersinn.
// Links und rechts sitzen die Marken weiter innen als oben und unten: Sie sind
// breiter als hoch und ragen sonst aus der Flaeche.
const PLATZ = [
  { x: 50, y: 6 },
  { x: 78, y: 50 },
  { x: 50, y: 94 },
  { x: 22, y: 50 },
] as const;

// Endpunkt der Speiche, kurz vor der Marke.
const SPEICHE = [
  { x: 50, y: 20 },
  { x: 66, y: 50 },
  { x: 50, y: 80 },
  { x: 34, y: 50 },
] as const;

export function BereichsOrbit() {
  const t = useTranslations("zones");
  const s = useTranslations("landing");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const teile = Array.from(
      element.querySelectorAll<HTMLElement | SVGElement>("[data-angedockt]"),
    );
    for (const teil of teile) teil.dataset.angedockt = "nein";

    const uhren: number[] = [];
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (!eintraege.some((eintrag) => eintrag.isIntersecting)) return;
        beobachter.disconnect();
        for (const teil of teile) {
          // Speiche und Marke desselben Bereichs tragen denselben Platz und
          // docken damit gemeinsam an.
          const platz = Number(teil.dataset.platz ?? 0);
          uhren.push(
            window.setTimeout(() => {
              teil.dataset.angedockt = "ja";
            }, 350 + platz * 520),
          );
        }
      },
      { threshold: 0.35 },
    );

    beobachter.observe(element);
    return () => {
      beobachter.disconnect();
      for (const uhr of uhren) window.clearTimeout(uhr);
    };
  }, []);

  return (
    <div ref={ref} className="relative mx-auto aspect-square w-full max-w-sm">
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r="31"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeWidth="0.6"
          strokeDasharray="1.4 2.6"
        />
        <circle
          className="orbit__welle"
          cx="50"
          cy="50"
          r="15"
          fill="none"
          stroke="var(--himbeere)"
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />
        {zones.map((zone, i) => (
          <line
            key={zone.key}
            className="orbit__speiche"
            data-angedockt="ja"
            data-platz={i}
            x1="50"
            y1="50"
            x2={SPEICHE[i]!.x}
            y2={SPEICHE[i]!.y}
            pathLength="1"
            strokeDasharray="1"
            stroke={zone.accent}
            strokeWidth="0.9"
            strokeLinecap="round"
          />
        ))}
      </svg>

      {/* Kern: die Charge, an der alles haengt. */}
      <div className="absolute left-1/2 top-1/2 flex h-24 w-24 -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-border bg-card text-center shadow-sm">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {s("proofEyebrow")}
        </span>
        <span className="mt-0.5 text-sm font-black text-foreground">
          {s("proofSteps.charge.title")}
        </span>
      </div>

      {zones.map((zone, i) => (
        <div
          key={zone.key}
          className="orbit__satellit absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-sm"
          data-angedockt="ja"
          data-platz={i}
          style={{ left: `${PLATZ[i]!.x}%`, top: `${PLATZ[i]!.y}%` }}
        >
          <span
            className="inline-flex h-5 w-5 items-center justify-center"
            style={{ color: zone.accent }}
          >
            <Icon name={zone.icon} className="h-3.5 w-3.5" />
          </span>
          <span className="text-xs font-black text-card-foreground">{t(`${zone.key}.name`)}</span>
        </div>
      ))}
    </div>
  );
}
