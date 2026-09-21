"use client";

import { useEffect, useRef } from "react";
import { lesePegel } from "@/lib/hoeren";

// Wellen ringsum den Diktatknopf statt eines Balkens daneben: Ringe laufen vom Knopf
// nach aussen, wie ein Sonar-Ping. Lauter gesprochen, schneller und kraeftiger laufen
// sie - bei Stille bleibt ein ruhiger, blasser Puls, damit der Knopf sichtbar "hoert"
// und nicht wie ausgeschaltet wirkt.

const RINGE = 3;
const ABSTAND = 1 / RINGE;

export function MikrofonWelle() {
  const leinwand = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = leinwand.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    let frame = 0;
    let breite = 0;
    let hoehe = 0;
    let phase = 0;
    let stimme = 0;

    const messen = () => {
      breite = Math.max(1, el.offsetWidth);
      hoehe = Math.max(1, el.offsetHeight);
      const dichte = Math.min(3, window.devicePixelRatio || 1);
      el.width = Math.round(breite * dichte);
      el.height = Math.round(hoehe * dichte);
      ctx.setTransform(dichte, 0, 0, dichte, 0, 0);
    };

    const schritt = () => {
      const pegel = lesePegel();
      // Die Stimme folgt schneller als die Ringe selbst - sonst wirkt der Anstieg traege.
      stimme += (pegel - stimme) * 0.25;
      phase = (phase + 0.0055 + stimme * 0.018) % 1;

      ctx.clearRect(0, 0, breite, hoehe);
      const mx = breite / 2;
      const my = hoehe / 2;
      const radiusAussen = Math.min(breite, hoehe) / 2;
      // Die Ringe starten knapp hinter dem Knopfrand, nicht in seiner Mitte.
      const radiusInnen = radiusAussen * 0.46;

      for (let i = 0; i < RINGE; i++) {
        const t = (phase + i * ABSTAND) % 1;
        const radius = radiusInnen + (radiusAussen - radiusInnen) * t;
        // Am Anfang und Ende blass, in der Mitte des Laufs am kraeftigsten.
        const deckung = Math.sin(t * Math.PI) * (0.15 + stimme * 0.55);
        ctx.beginPath();
        ctx.arc(mx, my, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgb(216 27 96 / ${deckung.toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
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
