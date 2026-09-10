"use client";

import { useEffect, useRef } from "react";

// Zaehlt eine Kennzahl hoch, sobald die Kachel ins Bild kommt. Die Werte sind
// keine reinen Zahlen, sondern fertig formatierte Zeichenketten aus
// lib/domain/kpis.ts ("8,4 %", "640 ₸/kg", "2,3×", "12 / Monat"). Deshalb wird
// nur der fuehrende Zahlenteil animiert und der Rest unveraendert angehaengt -
// so bleibt die Einheit stehen und die Nachkommastellen aendern sich nicht.
//
// Was kein Zahlenanfang ist, bleibt einfach stehen: kein Sonderfall, keine
// Ausnahmeliste. Und der Server rendert von vornherein den Endwert, damit ohne
// JavaScript die richtige Zahl dasteht statt einer Null.
export function CountUp({ wert }: { wert: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const treffer = wert.match(/^(\d+(?:[.,]\d+)?)([\s\S]*)$/);
    if (!treffer) return;

    const [, zahlText, rest] = treffer;
    const ziel = Number(zahlText.replace(",", "."));
    if (!Number.isFinite(ziel)) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const nachkommastellen = (zahlText.split(/[.,]/)[1] ?? "").length;
    const zeige = (zahl: number) =>
      zahl.toFixed(nachkommastellen).replace(".", ",") + rest;

    element.textContent = zeige(0);

    let anforderung = 0;
    const dauer = 850;

    const beobachter = new IntersectionObserver(
      (eintraege) => {
        if (!eintraege.some((eintrag) => eintrag.isIntersecting)) return;
        beobachter.disconnect();

        const beginn = performance.now();
        const schritt = (jetzt: number) => {
          const fortschritt = Math.min(1, (jetzt - beginn) / dauer);
          // Am Ende auslaufen lassen, sonst wirkt der Stopp abrupt.
          const geglaettet = 1 - Math.pow(1 - fortschritt, 3);
          element.textContent = zeige(ziel * geglaettet);
          if (fortschritt < 1) anforderung = requestAnimationFrame(schritt);
          else element.textContent = wert;
        };
        anforderung = requestAnimationFrame(schritt);
      },
      { threshold: 0.4 },
    );

    beobachter.observe(element);
    return () => {
      beobachter.disconnect();
      cancelAnimationFrame(anforderung);
    };
  }, [wert]);

  return <span ref={ref}>{wert}</span>;
}
