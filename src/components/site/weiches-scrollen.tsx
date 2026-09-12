"use client";

import { useEffect } from "react";
import { bewegungReduziert, feinerZeiger } from "@/lib/bewegung";

// Weiches Scrollen mit Lenis - nur fuer Mausrad und Trackpad. Auf Touch-
// Geraeten bleibt das native Scrollen: es ist dort bereits weich, und jede
// Nachbildung fuehlt sich traeger an als das Original. Bei reduzierter
// Bewegung bleibt es ebenfalls beim nativen Scrollen.
//
// Lenis bewegt die echte Scrollposition des Dokuments. position: sticky, die
// scroll-getriebenen CSS-Animationen und die 60-Minuten-Szene laufen deshalb
// unveraendert mit. Die Bibliothek wird erst im Browser nachgeladen und
// belastet das Startpaket der Seite nicht. Nur auf der Landingpage montiert;
// das Dashboard ist ein Arbeitswerkzeug und scrollt nativ.
export function WeichesScrollen() {
  useEffect(() => {
    if (!feinerZeiger() || bewegungReduziert()) return;

    let lenis: { destroy(): void } | undefined;
    let abgebrochen = false;

    import("lenis").then(({ default: Lenis }) => {
      if (abgebrochen) return;
      lenis = new Lenis({
        autoRaf: true,
        lerp: 0.12,
        // Sprunglinks (#himbeere, #sechzig-minuten ...) weich anfahren und
        // unter der festen Navigation (h-16) stehen lassen.
        anchors: { offset: -72 },
        stopInertiaOnNavigate: true,
      });
    });

    return () => {
      abgebrochen = true;
      lenis?.destroy();
    };
  }, []);

  return null;
}
