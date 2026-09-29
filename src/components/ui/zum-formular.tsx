"use client";

import type { ReactNode } from "react";
import type { FormularZiel } from "@/lib/formular-ziele";

/**
 * Knopf aus einem Leerzustand zum Anlegen-Formular derselben Seite
 * (Ziele in lib/formular-ziele.ts).
 *
 * Ohne JavaScript ist es ein gewoehnlicher Anker, der Browser springt zur
 * Formularkarte (DESIGN.md Regel 6). Mit JavaScript klappt er vorher den
 * Aufklapper auf, in dem das Formular steckt - ein Sprung zu einem
 * geschlossenen <details> zeigte sonst nur dessen Titelzeile. Danach geht
 * der Fokus ins erste Feld, damit Tastatur und Vorlesehilfe dort
 * weitermachen, wo man hinwollte.
 */
export function ZumFormular({
  ziel,
  className,
  children,
}: {
  ziel: FormularZiel;
  className?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`#${ziel}`}
      className={className}
      onClick={() => {
        const karte = document.getElementById(ziel);
        if (!karte) {
          // Knopf ohne Formular auf der Seite: der Sprung geht ins Leere.
          // Passiert, wenn die Bedingung fuer den Knopf und die fuer das
          // Formular auseinanderlaufen - in der Entwicklung sichtbar machen.
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[ZumFormular] Kein Formular mit id="${ziel}" auf dieser Seite.`);
          }
          return;
        }
        const aufklapper = karte instanceof HTMLDetailsElement ? karte : karte.closest("details");
        if (aufklapper) aufklapper.open = true;
        // Erst nach dem Sprung, den der Browser selbst ausfuehrt.
        requestAnimationFrame(() => {
          karte
            .querySelector<HTMLElement>("input:not([type=hidden]), select, textarea")
            ?.focus({ preventScroll: true });
        });
      }}
    >
      {children}
    </a>
  );
}
