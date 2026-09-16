"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useBrowserBedingung, zeigerEffekteErlaubt } from "@/lib/bewegung";

// Zeiger-Folger fuer Maus und Stift. Der Systemzeiger bleibt sichtbar - ein
// eigener Zeiger, der ihn ersetzt, kostet Genauigkeit und irritiert jeden,
// der die Seite bedienen statt bestaunen will. Der Ring folgt weich und
// sagt ueber bedienbaren Medien, was dort geht, etwa "Ziehen" am
// Qualitaetsregler. Welches Wort, steht als data-cursor am Element.
//
// Ueber der Lupe (data-cursor="lupe") verschwindet der Ring: Er saesse genau
// in der Mitte der Vergroesserung und verdeckte das Detail, um das es geht.
//
// Auf Touch-Geraeten und bei reduzierter Bewegung wird nichts gerendert.
export function CursorFolger() {
  const aktiv = useBrowserBedingung(zeigerEffekteErlaubt);
  const t = useTranslations("erlebnis.cursor");
  const ziehen = t("ziehen");
  const huelle = useRef<HTMLDivElement>(null);
  const beschriftung = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = huelle.current;
    const text = beschriftung.current;
    if (!aktiv || !el || !text) return;

    const woerter: Record<string, string> = { ziehen };
    let x = 0;
    let y = 0;
    let zielX = 0;
    let zielY = 0;
    let raf = 0;
    let bereit = false;

    const schritt = () => {
      x += (zielX - x) * 0.22;
      y += (zielY - y) * 0.22;
      el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = Math.abs(zielX - x) + Math.abs(zielY - y) > 0.2 ? requestAnimationFrame(schritt) : 0;
    };

    const bewegung = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" && event.pointerType !== "pen") return;
      zielX = event.clientX;
      zielY = event.clientY;
      if (!bereit) {
        x = zielX;
        y = zielY;
        bereit = true;
      }
      const ziel = event.target instanceof Element ? event.target.closest("[data-cursor]") : null;
      const art = ziel?.getAttribute("data-cursor") ?? "";
      el.dataset.sichtbar = art === "lupe" ? "nein" : "ja";
      const wort = woerter[art] ?? "";
      if (text.textContent !== wort) {
        text.textContent = wort;
        el.dataset.text = wort ? "ja" : "nein";
      }
      if (!raf) raf = requestAnimationFrame(schritt);
    };

    const verlassen = () => {
      el.dataset.sichtbar = "nein";
    };

    window.addEventListener("pointermove", bewegung, { passive: true });
    document.documentElement.addEventListener("pointerleave", verlassen);
    return () => {
      window.removeEventListener("pointermove", bewegung);
      document.documentElement.removeEventListener("pointerleave", verlassen);
      cancelAnimationFrame(raf);
    };
  }, [aktiv, ziehen]);

  if (!aktiv) return null;

  return (
    <div
      ref={huelle}
      aria-hidden
      data-sichtbar="nein"
      data-text="nein"
      className="group/zeiger pointer-events-none fixed left-0 top-0 z-[60] print:hidden"
    >
      <div className="flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white opacity-0 mix-blend-difference transition-[width,height,opacity,background-color,border-color] duration-300 ease-out group-data-[sichtbar=ja]/zeiger:opacity-100 group-data-[text=ja]/zeiger:h-16 group-data-[text=ja]/zeiger:w-16 group-data-[text=ja]/zeiger:border-transparent group-data-[text=ja]/zeiger:bg-[#04161c]/85 group-data-[text=ja]/zeiger:mix-blend-normal">
        <span
          ref={beschriftung}
          className="text-[10px] font-black uppercase tracking-wider text-white opacity-0 transition-opacity duration-200 group-data-[text=ja]/zeiger:opacity-100"
        />
      </div>
    </div>
  );
}
