"use client";

import "@/components/haustier/haustier.css";
import { useEffect, useRef } from "react";
import { Himbi } from "@/components/haustier/himbi";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import type { HaustierZustand } from "@/lib/haustier";
import { lesePegel as leseMikrofonPegel } from "@/lib/hoeren";
import { leseAusgabePegel, leseAusgabeSpektrum } from "@/lib/ausgabe-pegel";
import { baenderAus, folgeSpitze, glaetteMund, MUND_ZU, mundAusKlang, mundGeometrie, type Mundform } from "@/lib/domain/lippen";

// Himbi als Gegenueber im Sprachmodus. Bis zum 25.09.2026 stand dort eine abstrakte
// Kugel (Canvas); jetzt fuehrt die Figur das Gespraech: sie hoert zu, denkt (die
// KI-Funken kreisen) und spricht mit Lippen, die dem Klang der Stimme folgen
// (lib/domain/lippen.ts). Rueckmeldung vom 25.09.2026: "anstatt der Sprachblase die
// Himbi-Figur, die beim Sprechen die Lippen bewegt".
//
// Wie bei der Kugel geht nichts davon durch React: eine eigene Bildschleife liest
// Pegel und Spektrum und schreibt Mundform, Blick, Schein und Nicken direkt an die
// Elemente. React rendert nur, wenn der Zustand wechselt.

export type SprachZustand = "hoert" | "denkt" | "spricht" | "pausiert" | "fehler";

const HIMBI_ZUSTAND: Record<SprachZustand, HaustierZustand> = {
  hoert: "ruhe",
  denkt: "denkt",
  spricht: "spricht",
  pausiert: "schlaeft",
  fehler: "fehler",
};

/** Wie weit die Pupillen wandern duerfen (SVG-Einheiten, Auge rx 8,4, Pupille r 5,2). */
const BLICK_X = 2.6;
const BLICK_Y = 2;

/** Mund beim Sprechen, wenn Bewegung reduziert ist. */
const RUHIG_OFFEN: Mundform = { offen: 0.3, breite: 0.5, rund: 0, zaehne: 0 };

export interface Blickziel {
  x: number;
  y: number;
}

function bewegungReduziert(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true ||
    document.documentElement.hasAttribute("data-hb-still")
  );
}

export function SprachHimbi({
  zustand,
  breite,
  blickziel,
  links = false,
}: {
  zustand: SprachZustand;
  /** Breite der Figur in Pixeln; die Hoehe ist das 1,5-Fache (viewBox 96 x 144). */
  breite: number;
  /** Mittelpunkt eines hervorgehobenen Bereichs (Bildschirmkoordinaten): Himbi sieht hin. */
  blickziel?: Blickziel | null;
  /** Himbi steht links ueber der Navigationsleiste: ohne Ziel sieht er zur Seite hin. */
  links?: boolean;
}) {
  const { inventar } = useHaustierStatus();
  const huelle = useRef<HTMLDivElement>(null);
  const zustandRef = useRef(zustand);
  const blickRef = useRef(blickziel ?? null);
  const linksRef = useRef(links);

  useEffect(() => {
    zustandRef.current = zustand;
    blickRef.current = blickziel ?? null;
    linksRef.current = links;
  }, [zustand, blickziel, links]);

  useEffect(() => {
    const el = huelle.current;
    if (!el) return;
    const teil = (name: string) => el.querySelector<SVGElement>(`[data-lippe="${name}"]`);
    const umriss = teil("umriss");
    const hoehle = teil("hoehle");
    const clip = teil("clip");
    const zunge = teil("zunge");
    const zaehne = teil("zaehne");

    let bild = 0;
    let letzte = 0;
    let mund: Mundform = MUND_ZU;
    let spitze = 0.04;
    let schein = 0;
    let letzterPfad = "";
    let letzterBlick = "";
    let rechteck: DOMRect | null = null;
    let rechteckZeit = 0;
    // Die Mundform wartet so lange, wie der Klang braucht, bis er aus dem Lautsprecher
    // kommt (Analyser misst VOR dem Geraet). Ohne das eilt der Mund bei Bluetooth sichtbar vor.
    const verlauf: Array<{ t: number; m: Mundform }> = [];
    let latenzMs = 0;
    const reduziert = bewegungReduziert();

    const schleife = (jetzt: number) => {
      const dt = letzte ? jetzt - letzte : 16;
      letzte = jetzt;
      const z = zustandRef.current;

      let ziel: Mundform = MUND_ZU;
      let pegel = 0;
      if (z === "spricht") {
        pegel = leseAusgabePegel();
        spitze = folgeSpitze(spitze, pegel, dt);
        const s = leseAusgabeSpektrum();
        if (s) {
          latenzMs = s.latenz * 1000;
          ziel = mundAusKlang(pegel / spitze, baenderAus(s.frequenzen, s.abtastrate, s.fftGroesse, s.minDb, s.maxDb));
        }
      } else if (z === "hoert") {
        pegel = leseMikrofonPegel();
      }
      verlauf.push({ t: jetzt, m: ziel });
      while (verlauf.length > 1 && verlauf[1]!.t <= jetzt - latenzMs) verlauf.shift();
      const faellig = verlauf[0]!.m;
      mund = glaetteMund(mund, faellig, dt);

      // Mund: nur schreiben, wenn sich die Form sichtbar aendert. Mit reduzierter
      // Bewegung (WCAG 2.3.3) steht er still: beim Sprechen ruhig offen, sonst zu;
      // Schein, Symbol und Zustandstext sagen dann, wer dran ist.
      const form = reduziert ? (z === "spricht" ? RUHIG_OFFEN : MUND_ZU) : mund;
      const g = mundGeometrie(form, z === "denkt" ? 0.2 : 1);
      if (g.pfad !== letzterPfad) {
        letzterPfad = g.pfad;
        umriss?.setAttribute("d", g.pfad);
        hoehle?.setAttribute("d", g.pfad);
        clip?.setAttribute("d", g.pfad);
        if (zunge) {
          zunge.setAttribute("cy", String(g.zunge.cy));
          zunge.setAttribute("rx", String(g.zunge.rx));
          zunge.setAttribute("ry", String(g.zunge.ry));
        }
        if (zaehne) {
          zaehne.setAttribute("y", String(g.zaehne.y));
          zaehne.setAttribute("height", String(g.zaehne.hoehe));
          zaehne.setAttribute("opacity", String(g.zaehne.deckkraft));
        }
      }

      // Schein hinter der Figur: folgt beim Zuhoeren der eigenen Stimme (das war die
      // wichtigste Rueckmeldung der Kugel: "er hoert mich"), beim Sprechen der Stimme
      // von Himbi. Nicken: der Koerper hebt sich mit jeder Silbe ein wenig.
      const zielSchein = z === "hoert" ? Math.min(1, pegel * 6) : z === "spricht" ? mund.offen : 0;
      schein += (zielSchein - schein) * (zielSchein > schein ? 0.5 : 0.12);
      el.style.setProperty("--himbi-schein", reduziert ? "0" : schein.toFixed(3));
      el.style.setProperty("--himbi-nicken", reduziert ? "0" : (mund.offen * 1).toFixed(3));

      // Blick: zum hervorgehobenen Bereich, sonst beim Denken nach oben zur Seite,
      // links angedockt zur Seite hin, und beim Zuhoeren geradeaus zur Person.
      if (jetzt - rechteckZeit > 250) {
        rechteck = el.getBoundingClientRect();
        rechteckZeit = jetzt;
      }
      let bx = 0;
      let by = 0;
      const b = blickRef.current;
      if (b && rechteck && z !== "pausiert") {
        const dx = b.x - (rechteck.left + rechteck.width / 2);
        const dy = b.y - (rechteck.top + rechteck.height * 0.47);
        const laenge = Math.hypot(dx, dy) || 1;
        bx = (dx / laenge) * BLICK_X;
        by = (dy / laenge) * BLICK_Y;
      } else if (z === "denkt") {
        bx = 1.8;
        by = -1.8;
      } else if (linksRef.current && z === "spricht") {
        bx = 1.6;
      }
      const blick = `${bx.toFixed(2)} ${by.toFixed(2)}`;
      if (blick !== letzterBlick) {
        letzterBlick = blick;
        el.style.setProperty("--bx", bx.toFixed(2));
        el.style.setProperty("--by", by.toFixed(2));
      }

      bild = requestAnimationFrame(schleife);
    };
    bild = requestAnimationFrame(schleife);
    return () => cancelAnimationFrame(bild);
  }, []);

  return (
    <div ref={huelle} className="ki-himbi" data-zustand={zustand} style={{ width: breite, height: breite * 1.5 }}>
      <span className="ki-himbi__schein" aria-hidden />
      <div className="ki-himbi__koerper">
        <Himbi zustand={HIMBI_ZUSTAND[zustand]} groesse={breite} tracht={inventar.tracht} brille={inventar.brille} lippen />
      </div>
    </div>
  );
}
