"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Blendet einen Abschnitt ein, sobald er in den Sichtbereich kommt. Bewusst
// ohne Animationsbibliothek: ein IntersectionObserver und zwei CSS-Regeln
// (globals.css, [data-reveal]) reichen dafuer und kosten kein zusaetzliches
// Bundle auf einer Seite, die sonst fast ohne Client-JavaScript auskommt.
//
// Drei Punkte, die hier bewusst so geloest sind:
//
// 1. Kein React-State. Der Zustand ist ein reines Anzeigedetail, das nur ein
//    data-Attribut umlegt - dafuer eine Zustandsvariable zu halten wuerde bei
//    jedem Abschnitt zwei zusaetzliche Renderdurchlaeufe ausloesen, ohne dass
//    sich am Markup etwas aendert.
// 2. Der unsichtbare Ausgangszustand wird erst im Browser gesetzt, nicht schon
//    im Server-Markup. Kommt kein JavaScript an - abgeschaltet, Fehler beim
//    Laden, Suchmaschine ohne Script-Ausfuehrung - steht der Inhalt trotzdem
//    sichtbar da, statt dauerhaft auf opacity 0 zu haengen.
// 3. Was beim Aufruf schon im Bild steht, wird nicht erst versteckt und dann
//    eingeblendet: Das erzeugt sichtbares Flackern statt eines Effekts.
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: ReactNode;
  /** Versatz in Millisekunden, um Bloecke nacheinander einzublenden. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    if (delay) element.style.transitionDelay = `${delay}ms`;
    element.dataset.reveal = "vorbereitet";

    // Loest genau einmal aus und haengt sich danach ab. Ein Abschnitt, der
    // beim Zurueckscrollen erneut wegblendet, liest sich als Fehler.
    const beobachter = new IntersectionObserver(
      (eintraege) => {
        for (const eintrag of eintraege) {
          if (eintrag.isIntersecting) {
            element.dataset.reveal = "sichtbar";
            beobachter.disconnect();
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );

    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
