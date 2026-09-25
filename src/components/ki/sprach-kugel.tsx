"use client";

import { useEffect, useRef } from "react";
import { lesePegel as leseMikrofonPegel } from "@/lib/hoeren";

// Die Kugel des Sprachmodus: reagiert live auf die eigene Stimme (Mikrofon,
// lib/hoeren.ts) UND auf die Stimme des Assistenten (Web-Audio-Ausgabe). Reines
// Canvas 2D statt WebGL oder einer Animationsbibliothek - eine Kugel aus
// Farbverlauf und Unschaerfe braucht keinen Shader, und jede Bibliothek dafuer
// waere mehrere hundert KB fuer einen einzelnen Kreis (siehe docs/infra/
// sprachmodus-recherche.md, Abschnitt Rendering).
//
// Der Pegel geht NIE durch React: eine Aktualisierung je Bild waere 60
// Renderdurchlaeufe pro Sekunde fuer eine Zahl, die diese Komponente ohnehin
// selbst pro Bild abholt (dasselbe Prinzip wie lib/hoeren.ts). Stattdessen
// zeichnet eine eigene requestAnimationFrame-Schleife direkt auf den Canvas.

export type KugelZustand = "hoert" | "denkt" | "spricht" | "pausiert" | "fehler";

export interface AusgabePegel {
  /** 0..1, geglaettet. Von aussen gesetzt (sprachausgabe-live.ts liest den
   *  Ausgabepegel aus demselben AnalyserNode, der schon fuer die Wiedergabe existiert). */
  lesen(): number;
}

const FARBEN: Record<KugelZustand, [string, string]> = {
  // Kern, Rand - beide als CSS-Farbfunktion, damit sie das Farbschema (hell/dunkel) mitgehen.
  hoert: ["oklch(78% 0.14 200)", "oklch(55% 0.16 200)"],
  denkt: ["oklch(80% 0.15 55)", "oklch(58% 0.18 30)"],
  spricht: ["oklch(75% 0.19 350)", "oklch(50% 0.2 350)"],
  pausiert: ["oklch(70% 0.02 250)", "oklch(50% 0.02 250)"],
  fehler: ["oklch(70% 0.18 25)", "oklch(45% 0.2 25)"],
};

/** Exponentiell geglaetteter Mittelwert - dieselbe Technik wie lib/hoeren.ts,
 *  hier zusaetzlich mit schnellerem Anstieg als Abklingen: Sprache soll die
 *  Kugel sofort aufleuchten lassen, aber nicht sofort wieder erschlaffen. */
function glaette(bisher: number, ziel: number, hoch: number, runter: number): number {
  const rate = ziel > bisher ? hoch : runter;
  return bisher + (ziel - bisher) * rate;
}

export function SprachKugel({
  zustand,
  ausgabePegel,
  groesse = 220,
  className,
}: {
  zustand: KugelZustand;
  /** Fehlt sie, ist es still (z. B. wenn der Assistent gerade nicht spricht). */
  ausgabePegel?: AusgabePegel | null;
  groesse?: number;
  className?: string;
}) {
  const leinwand = useRef<HTMLCanvasElement>(null);
  const zustandRef = useRef(zustand);
  const ausgabeRef = useRef(ausgabePegel);
  const bild = useRef(0);
  const start = useRef(0);
  const einPegel = useRef(0);
  const ausPegel = useRef(0);

  useEffect(() => {
    zustandRef.current = zustand;
    ausgabeRef.current = ausgabePegel;
  }, [zustand, ausgabePegel]);

  useEffect(() => {
    const el = leinwand.current;
    if (!el) return;
    const ctx2d = el.getContext("2d");
    if (!ctx2d) return;

    const bewegungReduziert =
      typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

    // Geraeteschaerfe: sonst wirkt die Kugel auf Handys mit hoher Pixeldichte
    // unscharf. Einmalig gesetzt, die Zeichenfunktionen arbeiten weiter in CSS-Pixeln.
    const dpr = typeof window !== "undefined" ? Math.min(window.devicePixelRatio || 1, 2.5) : 1;
    el.width = groesse * dpr;
    el.height = groesse * dpr;
    ctx2d.scale(dpr, dpr);

    const zeichne = (jetzt: number) => {
      if (!start.current) start.current = jetzt;
      const t = (jetzt - start.current) / 1000;

      const z = zustandRef.current;
      const zielEin = z === "hoert" ? leseMikrofonPegel() : 0;
      const zielAus = z === "spricht" ? (ausgabeRef.current?.lesen() ?? 0) : 0;
      einPegel.current = glaette(einPegel.current, zielEin, 0.5, 0.12);
      ausPegel.current = glaette(ausPegel.current, zielAus, 0.5, 0.12);
      const pegel = Math.max(einPegel.current, ausPegel.current);

      const mitte = groesse / 2;
      // Grundatmen: eine langsame Sinuskurve, damit die Kugel auch in Stille lebt -
      // ohne Bewegungsreduktion. Denken zeigt statt Pegel einen eigenen, schnelleren Puls.
      const atmen = bewegungReduziert ? 0 : Math.sin(t * 1.6) * 0.03;
      const puls = z === "denkt" && !bewegungReduziert ? (Math.sin(t * 5) * 0.5 + 0.5) * 0.14 : 0;
      const radius = mitte * 0.62 * (1 + atmen + puls + pegel * 0.32);

      ctx2d.clearRect(0, 0, groesse, groesse);

      const [kern, rand] = FARBEN[z];
      const verlauf = ctx2d.createRadialGradient(mitte, mitte, radius * 0.15, mitte, mitte, radius);
      verlauf.addColorStop(0, kern);
      verlauf.addColorStop(1, rand);

      // Weicher Schein aussen - ersetzt einen Blur-Filter (auf manchen Handy-GPUs
      // unzuverlaessig, siehe Recherche) durch mehrere Ringe abnehmender Deckkraft.
      for (let ring = 3; ring >= 1; ring--) {
        ctx2d.beginPath();
        ctx2d.globalAlpha = 0.05 * ring * (0.6 + pegel * 0.4);
        ctx2d.fillStyle = rand;
        ctx2d.arc(mitte, mitte, radius + ring * (bewegungReduziert ? 4 : 10), 0, Math.PI * 2);
        ctx2d.fill();
      }
      ctx2d.globalAlpha = 1;
      ctx2d.beginPath();
      ctx2d.fillStyle = verlauf;
      ctx2d.arc(mitte, mitte, radius, 0, Math.PI * 2);
      ctx2d.fill();

      bild.current = requestAnimationFrame(zeichne);
    };
    start.current = 0;
    bild.current = requestAnimationFrame(zeichne);
    return () => cancelAnimationFrame(bild.current);
    // groesse haengt bewusst in den Abhaengigkeiten: sprachmodus.tsx aendert sie zur Laufzeit
    // (Kugel schrumpft in die Ecke, sobald ein Bereich hervorgehoben wird - GROESSE_KLEIN statt
    // GROESSE_MITTE). React setzt dabei die width/height-Attribute des <canvas> neu, und das
    // Canvas-Element setzt bei JEDER Aenderung dieser Attribute seinen ganzen Zeichenzustand
    // zurueck - auch die hier oben gesetzte ctx2d.scale(dpr, dpr). Ohne diese Abhaengigkeit lief
    // die Schleife mit der alten, groesseren "groesse" (Kreismitte und Radius aus 220px) weiter,
    // gezeichnet in eine inzwischen nur noch 96px kleine, unskalierte Leinwand: sichtbar war nur
    // noch die obere linke Ecke des grossen Kreises - ein Dreieck statt einer Kugel (gemeldet am
    // 25.09.2026, "Fuehrmodus": die Sprechblase in der Ecke).
  }, [groesse]);

  return <canvas ref={leinwand} width={groesse} height={groesse} className={className} aria-hidden style={{ width: groesse, height: groesse }} />;
}
