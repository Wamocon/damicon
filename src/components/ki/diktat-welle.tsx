"use client";

import { useEffect, useRef } from "react";
import { leseBaender } from "@/lib/hoeren";

// Die Welle unter dem Eingabefeld: waehrend diktiert wird, laeuft hier ein breiter
// Streifen ueber die volle Breite der Nachricht - anders als die Ringe um den Knopf
// (mikrofon-welle.tsx), die nur den Knopf selbst begleiten. Beide zeichnen aus
// derselben Quelle (lib/hoeren.ts), nur unterschiedlich gross und geformt.

const BAENDER = 32;

export function DiktatWelle() {
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
      const lueck = Math.max(1.5, breite * 0.006);
      const stab = Math.max(2, (breite - lueck * (BAENDER - 1)) / BAENDER);
      const mitte = hoehe / 2;
      ctx.fillStyle = "currentColor";
      for (let i = 0; i < BAENDER; i++) {
        // Eine Grundhoehe bleibt immer stehen: bei Stille verschwindet der Streifen
        // sonst ganz, und das sieht wie ein Fehler statt wie Stille aus.
        const h = Math.max(2, Math.min(hoehe, 2 + werte[i]! * hoehe * 0.95));
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

  return <canvas ref={leinwand} className="ki-diktat-welle" aria-hidden />;
}
