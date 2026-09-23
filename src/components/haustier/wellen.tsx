"use client";

import { useEffect, useRef } from "react";
import type { HaustierZustand } from "@/lib/haustier";
import { lesePegel } from "@/lib/hoeren";

// Die Frequenzkugel hinter Himbi auf der Buehne: ineinanderliegende Ringe, deren Radius
// von einer Summe aus drei Sinuswellen verformt wird. Weil die drei Wellen verschiedene
// Ordnungen haben (3, 5, 8) und mit verschiedenem Tempo weiterlaufen, wiederholt sich das
// Bild praktisch nie - genau davon lebt der Eindruck, dass da etwas schwingt.
//
// Canvas und nicht CSS: die Form aendert sich in jedem Bild. Mit CSS ginge nur Drehen und
// Skalieren einer festen Form, und das sieht man sofort. Ein Canvas, ein Ringpfad je
// Zeichnung, additive Ueberlagerung - das Leuchten entsteht dabei von selbst.

const RINGE = 13;
const SCHRITTE = 120;

/** Wie stark und wie schnell es schwingt, je Zustand. Zwischen zwei Zustaenden wird
 *  weich ueberblendet - ein Sprung in der Amplitude sieht aus wie ein Bildfehler. */
function ziel(zustand: HaustierZustand): { staerke: number; tempo: number; leuchten: number } {
  switch (zustand) {
    case "denkt":
      return { staerke: 0.2, tempo: 1.5, leuchten: 1 };
    case "spricht":
      return { staerke: 0.17, tempo: 1.15, leuchten: 0.95 };
    case "freigabe":
      return { staerke: 0.14, tempo: 0.9, leuchten: 0.9 };
    case "fertig":
      return { staerke: 0.18, tempo: 1, leuchten: 1 };
    case "fehler":
    case "traurig":
      return { staerke: 0.05, tempo: 0.25, leuchten: 0.4 };
    case "schlaeft":
      return { staerke: 0.03, tempo: 0.12, leuchten: 0.22 };
    default:
      return { staerke: 0.075, tempo: 0.38, leuchten: 0.62 };
  }
}

// Farbverlauf ueber die Ringe: von Himbeere ueber Violett und Steppenblau nach Tuerkis.
// Die ersten beiden sind die Farben der Figur, die hinteren tragen das Leuchten.
const RAMPE: Array<[number, number, number]> = [
  [216, 27, 96],
  [150, 70, 220],
  [86, 110, 245],
  [25, 150, 190],
  [58, 214, 232],
];

function farbe(anteil: number): [number, number, number] {
  const p = Math.min(0.9999, Math.max(0, anteil)) * (RAMPE.length - 1);
  const i = Math.floor(p);
  const f = p - i;
  const a = RAMPE[i]!;
  const b = RAMPE[i + 1]!;
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export function Wellen({ zustand }: { zustand: HaustierZustand }) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  // Der Zustand darf die Schleife nicht neu starten - sie liest ihn ueber die Referenz.
  const zustandRef = useRef(zustand);
  useEffect(() => {
    zustandRef.current = zustand;
  }, [zustand]);

  useEffect(() => {
    const el = leinwand.current;
    const ctx = el?.getContext("2d");
    if (!el || !ctx) return;

    const ruhig = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let zeit = 0;
    let stimme = 0;
    let breite = 0;
    let hoehe = 0;
    const ist = { staerke: 0.075, tempo: 0.38, leuchten: 0.62 };

    const messen = () => {
      breite = Math.max(1, el.offsetWidth);
      hoehe = Math.max(1, el.offsetHeight);
      // Die Kugel steht in einem vergroesserten Elternelement. Die Aufloesung muss
      // mitwachsen, sonst franst sie sichtbar aus - daher der Zuschlag von 1,6.
      const dichte = Math.min(3, (window.devicePixelRatio || 1) * 1.6);
      el.width = Math.round(breite * dichte);
      el.height = Math.round(hoehe * dichte);
      ctx.setTransform(dichte, 0, 0, dichte, 0, 0);
    };

    const zeichne = () => {
      const z = ziel(zustandRef.current);
      // Weiche Annaeherung an den Zielwert, damit ein Zustandswechsel nicht springt.
      ist.staerke += (z.staerke - ist.staerke) * 0.05;
      ist.tempo += (z.tempo - ist.tempo) * 0.05;
      ist.leuchten += (z.leuchten - ist.leuchten) * 0.05;

      // Laeuft gerade eine Aufnahme, schwingt die Kugel nach der Stimme statt nach der
      // Uhr (lib/hoeren.ts). Ohne Mikrofon steht der Pegel auf 0 und es bleibt wie zuvor.
      // Die Stimme folgt schneller als der Zustand - sonst kaeme sie dem Sprechen
      // hinterher und wirkte wie eine Aufzeichnung.
      const pegel = lesePegel();
      stimme += (pegel - stimme) * 0.28;
      const staerke = ist.staerke * (1 + stimme * 3.4);
      const leuchten = Math.min(1.3, ist.leuchten * (1 + stimme * 1.1));

      ctx.clearRect(0, 0, breite, hoehe);
      ctx.globalCompositeOperation = "lighter";
      ctx.lineWidth = 1.15;

      const mx = breite / 2;
      const my = hoehe / 2;
      const grund = Math.min(breite, hoehe) * 0.3;

      for (let ring = 0; ring < RINGE; ring++) {
        const anteil = ring / (RINGE - 1);
        const phase = zeit * ist.tempo + ring * 0.42;
        const radius = grund * (1 + anteil * 0.34);

        ctx.beginPath();
        for (let s = 0; s <= SCHRITTE; s++) {
          const w = (s / SCHRITTE) * Math.PI * 2;
          const schwingung =
            0.44 * Math.sin(3 * w + phase) +
            0.28 * Math.sin(5 * w - phase * 1.31 + ring * 0.7) +
            0.18 * Math.sin(8 * w + phase * 0.67 - ring * 0.4);
          const r = radius * (1 + staerke * schwingung);
          const x = mx + Math.cos(w) * r;
          // Leicht gestaucht: eine perfekte Kreisscheibe wirkt wie ein Logo, eine
          // gestauchte wie etwas, das im Raum steht.
          const y = my + Math.sin(w) * r * 0.93;
          if (s === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();

        // Die Farbe wandert langsam durch die Rampe, damit die Kugel nicht starr wirkt.
        const [r, g, b] = farbe((anteil + zeit * 0.02) % 1);
        const deckung = (0.1 + 0.32 * (1 - anteil)) * leuchten;
        ctx.strokeStyle = `rgb(${r.toFixed(0)} ${g.toFixed(0)} ${b.toFixed(0)} / ${deckung.toFixed(3)})`;
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const schritt = () => {
      // Beim Sprechen laeuft auch die Zeit schneller - das Muster wandert mit der Stimme.
      zeit += 0.016 * (1 + stimme * 1.6);
      zeichne();
      frame = window.requestAnimationFrame(schritt);
    };

    const starten = () => {
      messen();
      if (frame) window.cancelAnimationFrame(frame);
      if (ruhig.matches) {
        // Ohne Bewegungswunsch ein einziges, stehendes Bild - die Kugel ist dann
        // Schmuck, kein Signal, und darf niemanden anstrengen.
        Object.assign(ist, ziel(zustandRef.current));
        zeichne();
        frame = 0;
        return;
      }
      frame = window.requestAnimationFrame(schritt);
    };

    starten();
    window.addEventListener("resize", messen);
    ruhig.addEventListener("change", starten);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", messen);
      ruhig.removeEventListener("change", starten);
    };
  }, []);

  return <canvas ref={leinwand} className="hb-wellen" aria-hidden />;
}
