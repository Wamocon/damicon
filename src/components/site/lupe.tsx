"use client";

import { useRef, type PointerEvent, type ReactNode } from "react";
import { ZoomIn } from "lucide-react";

// Lupe fuer die Qualitaetsfotos: Grauschimmel an einer einzigen Stelle und
// der weisse Bluetenboden sind Details, die in der Kachel wenige Pixel gross
// sind. Die Linse zeigt die Originaldatei (1400 px) vergroessert an der
// Zeigerposition; sie wird erst beim ersten Ueberfahren geladen.
//
// Die Rechnung bildet object-fit: cover nach - das Foto ist breiter als die
// Kachel und seitlich beschnitten, die Linse muss denselben Ausschnitt
// treffen. Maus und Stift folgen dem Zeiger; auf dem Telefon zeigt ein
// Tippen die Linse kurz an der getippten Stelle, ohne das Scrollen zu kapern.

const ZOOM = 2.6;
const LINSE = 160;

export function Lupe({
  quelle,
  breite,
  hoehe,
  hinweisMaus,
  hinweisTouch,
  children,
}: {
  quelle: string;
  /** Pixelmasse der Originaldatei. */
  breite: number;
  hoehe: number;
  hinweisMaus: string;
  hinweisTouch: string;
  children: ReactNode;
}) {
  const flaeche = useRef<HTMLDivElement>(null);
  const linse = useRef<HTMLDivElement>(null);
  const ausblenden = useRef(0);

  function zeigeBei(clientX: number, clientY: number) {
    const f = flaeche.current;
    const l = linse.current;
    if (!f || !l) return;
    const r = f.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const massstab = Math.max(r.width / breite, r.height / hoehe);
    const w = breite * massstab;
    const h = hoehe * massstab;
    const versatzX = (r.width - w) / 2;
    const versatzY = (r.height - h) / 2;

    if (!l.style.backgroundImage) l.style.backgroundImage = `url("${quelle}")`;
    l.style.backgroundSize = `${w * ZOOM}px ${h * ZOOM}px`;
    l.style.backgroundPosition = `${LINSE / 2 - (x - versatzX) * ZOOM}px ${LINSE / 2 - (y - versatzY) * ZOOM}px`;
    l.style.transform = `translate(${x - LINSE / 2}px, ${y - LINSE / 2}px)`;
    l.style.opacity = "1";
  }

  function verstecken() {
    if (linse.current) linse.current.style.opacity = "0";
  }

  function bewegen(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") return;
    zeigeBei(event.clientX, event.clientY);
  }

  function tippen(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== "touch") return;
    zeigeBei(event.clientX, event.clientY);
    window.clearTimeout(ausblenden.current);
    ausblenden.current = window.setTimeout(verstecken, 1600);
  }

  return (
    <div
      ref={flaeche}
      data-cursor="lupe"
      onPointerMove={bewegen}
      onPointerLeave={verstecken}
      onPointerDown={tippen}
      className="relative h-full w-full cursor-zoom-in overflow-hidden"
    >
      {children}
      <div
        ref={linse}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 rounded-full border-2 border-white/90 bg-no-repeat opacity-0 shadow-[0_8px_30px_rgba(0,0,0,0.45)] transition-opacity duration-150"
        style={{ width: LINSE, height: LINSE }}
      />
      <span className="pointer-events-none absolute right-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
        <ZoomIn className="h-3 w-3" />
        <span className="[@media(hover:none)]:hidden">{hinweisMaus}</span>
        <span className="hidden [@media(hover:none)]:inline">{hinweisTouch}</span>
      </span>
    </div>
  );
}
