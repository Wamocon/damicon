"use client";

import Image from "next/image";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { qualitaetsVergleich } from "@/lib/site-medien";

// Direktvergleich zwischen einwandfreier und befallener Beere. Zwei Karten
// nebeneinander zeigen denselben Sachverhalt, aber der Regler zeigt ihn an
// derselben Stelle im Bild - man sieht den Belag dort auftauchen, wo eben noch
// die heile Frucht war.
//
// Bedient wird das über ein echtes <input type="range"> mit voller Fläche und
// opacity-0: Damit funktionieren Ziehen, Tippen, Tastatur (Pfeiltasten, Pos1,
// Ende) und Screenreader ohne eigene Pointer-Logik. Ein handgebauter Griff aus
// mousedown/mousemove kann all das nicht, ohne es einzeln nachzubauen.
export function QualityCompare() {
  const t = useTranslations("qualityStandard");
  const [anteil, setAnteil] = useState(50);

  // Der Fokusrahmen sitzt aussen an der Karte, nicht innen auf dem Foto: innen
  // laege eine 2px-Linie auf dunklem Bildgrund und waere kaum zu sehen. Aussen
  // steht sie auf der hellen Kartenflaeche. Das overflow-hidden der Figur
  // beschneidet Kinder, nicht die eigene Outline.
  return (
    <figure className="mt-4 overflow-hidden rounded-2xl border border-border bg-card has-[input:focus-visible]:outline has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-primary">
      <div data-cursor="ziehen" className="relative aspect-37/20 w-full select-none">
        {/* Rechte Aufnahme liegt vollflaechig darunter. */}
        <Image
          src={qualitaetsVergleich.rechts}
          alt={t("q3Title")}
          fill
          sizes="(min-width: 1024px) 1024px, 100vw"
          loading="lazy"
          className="object-cover"
        />

        {/* Linke Aufnahme darueber, auf den eingestellten Anteil beschnitten. */}
        <div
          className="absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - anteil}% 0 0)` }}
        >
          <Image
            src={qualitaetsVergleich.links}
            alt={t("q1Title")}
            fill
            sizes="(min-width: 1024px) 1024px, 100vw"
            loading="lazy"
            className="object-cover"
          />
        </div>

        {/* Trennkante und Griff sind reine Anzeige - bedient wird der Regler. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white/90 shadow-[0_0_8px_rgba(0,0,0,0.55)]"
          style={{ left: `${anteil}%` }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/70 bg-white/15 text-white backdrop-blur-sm"
          style={{ left: `${anteil}%` }}
        >
          <span className="text-xs font-black leading-none tracking-tighter">
            &lt;&nbsp;&gt;
          </span>
        </div>

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
          {t("vergleichLinks")}
        </span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-warning/85 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
          {t("vergleichRechts")}
        </span>

        {/* pan-y laesst das Wischen nach unten weiterhin die Seite scrollen -
            ohne das faengt der Regler auf dem Telefon auch senkrechte Gesten. */}
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={anteil}
          onChange={(event) => setAnteil(Number(event.target.value))}
          aria-label={t("vergleichRegler")}
          className="absolute inset-0 h-full w-full cursor-ew-resize appearance-none bg-transparent opacity-0 [touch-action:pan-y]"
        />
      </div>

      <figcaption className="p-6">
        <p className="text-sm font-black text-card-foreground">
          {t("vergleichTitle")}
        </p>
        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
          {t("vergleichText")}
        </p>
      </figcaption>
    </figure>
  );
}
