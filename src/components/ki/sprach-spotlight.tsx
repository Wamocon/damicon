"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { abonniereHervorhebung, hervorhebungServer, leseHervorhebung } from "@/components/ki/hervorhebung";
import { besterPlatz, type Platz, type Raender, type Rechteck } from "@/lib/domain/sprachmodus";

// Lichtkegel um das Element, das der Assistent gerade zeigt - waehrend des
// Sprachmodus. Rest der Seite bleibt unter dem Unschaerfe-Hintergrund des
// Overlays sichtbar, aber gedimmt; das Ziel selbst steht scharf und hell
// darueber, mit einem duennen Ring.
//
// Technik: EIN SVG-Pfad mit "fill-rule: evenodd" - ein Aussenrechteck (das ganze
// Fenster) und ein inneres, abgerundetes Rechteck (das Ziel). Das ist die
// robusteste der verglichenen Techniken (driver.js, react-joyride): sie haengt
// nicht vom Stacking-Context des Ziels ab, im Unterschied zum aelteren
// box-shadow/z-index-Trick (intro.js) - ein Ziel in einem Container mit
// overflow:hidden, transform oder filter bleibt so erreichbar (siehe
// docs/infra/sprachmodus-recherche.md, Abschnitt Spotlight).
//
// Nachverfolgung: ResizeObserver auf dem Ziel selbst (Groessenaenderung),
// dazu Scroll- und Resize-Listener - im Unterschied zu react-joyride bewusst
// NICHT auf jede einzelne Scrollparent-Ebene einzeln, weil unsere Seiten kaum
// verschachtelte Scrollcontainer haben (Ausnahme: Tabellen mit eigenem
// Scrollbalken, dort scrollt der Anker ohnehin per scrollIntoView mit).

const ABSTAND = 16;
const RUNDUNG = 12;

function pfad(ziel: Rechteck, fenster: { breite: number; hoehe: number }): string {
  const x = ziel.x - ABSTAND;
  const y = ziel.y - ABSTAND;
  const b = ziel.breite + 2 * ABSTAND;
  const h = ziel.hoehe + 2 * ABSTAND;
  const r = Math.min(RUNDUNG, b / 2, h / 2);
  const aussen = `M0,0H${fenster.breite}V${fenster.hoehe}H0Z`;
  // Abgerundetes Innenrechteck von Hand (kein <rect rx>, das ginge nur additiv,
  // nicht als zweiter Teilpfad in derselben "d"-Definition).
  const innen = [
    `M${x + r},${y}`,
    `H${x + b - r}`,
    `A${r},${r} 0 0 1 ${x + b},${y + r}`,
    `V${y + h - r}`,
    `A${r},${r} 0 0 1 ${x + b - r},${y + h}`,
    `H${x + r}`,
    `A${r},${r} 0 0 1 ${x},${y + h - r}`,
    `V${y + r}`,
    `A${r},${r} 0 0 1 ${x + r},${y}Z`,
  ].join("");
  return `${aussen} ${innen}`;
}

function rechteckVon(element: Element): Rechteck {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, breite: r.width, hoehe: r.height };
}

/** Nur fuer das Spotlight (nicht fuer die Kugel-Platzierung, siehe sprachmodus.tsx):
 *  liefert das aktuelle Zielrechteck oder null, wenn nichts hervorgehoben ist. */
export function useHervorhebungsRechteck(): Rechteck | null {
  const element = useSyncExternalStore(abonniereHervorhebung, leseHervorhebung, hervorhebungServer);
  const [rechteck, setRechteck] = useState<Rechteck | null>(null);

  useEffect(() => {
    // Kein Ziel: nichts zu messen und nichts zu abonnieren - das Rechteck von einem
    // vorigen Ziel wird unten (element ? rechteck : null) verworfen, ohne dass diese
    // Verzweigung selbst noch state setzt.
    if (!element) return;
    const messen = () => setRechteck(rechteckVon(element));
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(element);
    window.addEventListener("scroll", messen, { passive: true, capture: true });
    window.addEventListener("resize", messen);
    return () => {
      ro.disconnect();
      window.removeEventListener("scroll", messen, { capture: true });
      window.removeEventListener("resize", messen);
    };
  }, [element]);

  return element ? rechteck : null;
}

export function SprachSpotlight({ rechteck }: { rechteck: Rechteck | null }) {
  const [fenster, setFenster] = useState({ breite: 0, hoehe: 0 });
  useEffect(() => {
    const messen = () => setFenster({ breite: window.innerWidth, hoehe: window.innerHeight });
    messen();
    window.addEventListener("resize", messen);
    return () => window.removeEventListener("resize", messen);
  }, []);

  if (!rechteck || fenster.breite === 0) return null;

  return (
    <div className="ki-sprachmodus__spotlight" aria-hidden>
      <svg width={fenster.breite} height={fenster.hoehe} className="ki-sprachmodus__spotlight-maske">
        <path d={pfad(rechteck, fenster)} fillRule="evenodd" />
      </svg>
      <div
        className="ki-sprachmodus__spotlight-ring"
        style={{
          left: rechteck.x - ABSTAND,
          top: rechteck.y - ABSTAND,
          width: rechteck.breite + 2 * ABSTAND,
          height: rechteck.hoehe + 2 * ABSTAND,
        }}
      />
    </div>
  );
}

/** Fuer sprachmodus.tsx: wohin die Kugel rueckt, wenn ein Ziel hervorgehoben ist. */
export function useKugelPlatz(
  ziel: Rechteck | null,
  blase: { breite: number; hoehe: number },
  raender: Raender,
): { platz: Platz; rechteck: Rechteck } | null {
  const [stand, setStand] = useState<{ platz: Platz; rechteck: Rechteck } | null>(null);
  useEffect(() => {
    if (!ziel || typeof window === "undefined") {
      setStand(null);
      return;
    }
    const berechne = () => {
      const fenster = { breite: window.innerWidth, hoehe: window.innerHeight };
      setStand((bisher) => besterPlatz(ziel, fenster, blase, raender, ABSTAND, bisher?.platz));
    };
    berechne();
    window.addEventListener("resize", berechne);
    return () => window.removeEventListener("resize", berechne);
    // ziel ist ein neues Objekt bei jeder Messung (useHervorhebungsRechteck) - absichtlich
    // ueber die Werte statt die Referenz verglichen, sonst rechnet jeder Scroll-Frame neu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ziel?.x, ziel?.y, ziel?.breite, ziel?.hoehe, blase.breite, blase.hoehe, raender]);
  return stand;
}
