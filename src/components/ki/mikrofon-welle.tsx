"use client";

import { useEffect, useRef } from "react";
import { leseBaender } from "@/lib/hoeren";

// Der Streifen neben dem Diktatknopf: zeigt waehrend der Aufnahme, dass tatsaechlich
// etwas ankommt. Das ist der eigentliche Zweck - ein Knopf, der nur die Farbe wechselt,
// laesst einen im Ungewissen, ob das Mikrofon wirklich hoert. Hier sieht man es.
//
// Gezeichnet werden die Frequenzbaender aus lib/hoeren.ts, gespiegelt an der Mittellinie.

const BAENDER = 18;

export function MikrofonWelle() {
  const leinwand = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = leinwand.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    let frame = 0;
    let breite = 0;
    let hoehe = 0;

    const messen = () => {
      breite = Math.max(1, el.offsetWidth);
      hoehe = Math.max(1, el.offsetHeight);
      const dichte = Math.min(3, window.devicePixelRatio || 1);
      el.width = Math.round(breite * dichte);
      el.height = Math.round(hoehe * dichte);
      ctx.setTransform(dichte, 0, 0, dichte, 0, 0);
    };

    const schritt = () => {
      const werte = leseBaender(BAENDER);
      ctx.clearRect(0, 0, breite, hoehe);
      const lueck = 2;
      const stab = Math.max(1.5, (breite - lueck * (BAENDER - 1)) / BAENDER);
      const mitte = hoehe / 2;
      ctx.fillStyle = "currentColor";
      for (let i = 0; i < BAENDER; i++) {
        // Eine Grundhoehe bleibt immer stehen: ein Streifen, der bei Stille voellig
        // verschwindet, sieht aus wie ein Fehler statt wie Stille.
        const h = Math.max(2, Math.min(hoehe, 2 + werte[i]! * hoehe * 1.15));
        const x = i * (stab + lueck);
        ctx.beginPath();
        ctx.roundRect(x, mitte - h / 2, stab, h, stab / 2);
        ctx.fill();
      }
      frame = window.requestAnimationFrame(schritt);
    };

    messen();
    frame = window.requestAnimationFrame(schritt);
    window.addEventListener("resize", messen);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", messen);
    };
  }, []);

  return <canvas ref={leinwand} className="ki-mikrofon__welle" aria-hidden />;
}
