"use client";

import { useEffect } from "react";

// Ausloeser der Welle (K2, docs/design/leerzustaende-ladezustaende-2026-09-25)
// fuer die ganze Seite. Ein Zuhoerer am Dokument statt einer Client-Komponente
// je Knopf: knopfKlassen() steht auch an Links in Server-Komponenten, die
// selbst kein JavaScript mitbringen. Gezeichnet wird in globals.css
// (.klick-welle); hier werden nur Mittelpunkt und Groesse gesetzt und die
// Animation neu angestossen. Bei reduzierter Bewegung laeuft sie nicht (CSS).
export function KlickWelle() {
  useEffect(() => {
    function beiDruck(ereignis: PointerEvent) {
      if (ereignis.button !== 0 || !(ereignis.target instanceof Element)) return;
      const knopf = ereignis.target.closest<HTMLElement>(".klick-welle");
      if (!knopf || knopf.matches(":disabled, [aria-disabled='true']")) return;
      // Attribut weg und Layout abfragen, bevor es wieder gesetzt wird: so
      // beginnt die Welle auch bei schnell aufeinanderfolgenden Beruehrungen
      // jedes Mal von vorn.
      knopf.removeAttribute("data-welle");
      const flaeche = knopf.getBoundingClientRect();
      const x = ereignis.clientX - flaeche.left;
      const y = ereignis.clientY - flaeche.top;
      // Bis zur entferntesten Ecke, damit der Kreis den ganzen Knopf fuellt.
      const durchmesser =
        2 * Math.hypot(Math.max(x, flaeche.width - x), Math.max(y, flaeche.height - y));
      knopf.style.setProperty("--welle-x", `${x}px`);
      knopf.style.setProperty("--welle-y", `${y}px`);
      knopf.style.setProperty("--welle-d", `${durchmesser}px`);
      knopf.setAttribute("data-welle", "");
    }
    // Nach dem Ablauf wieder weg: bliebe das Attribut stehen, liefe die Welle
    // erneut ab, sobald ein verborgener Vorfahr (Aufklapper, Schublade)
    // wieder sichtbar wird - display: none startet CSS-Animationen neu.
    function beiEnde(ereignis: AnimationEvent) {
      if (ereignis.animationName !== "klick-welle" || !(ereignis.target instanceof Element)) return;
      ereignis.target.removeAttribute("data-welle");
    }
    document.addEventListener("pointerdown", beiDruck, { passive: true });
    document.addEventListener("animationend", beiEnde);
    return () => {
      document.removeEventListener("pointerdown", beiDruck);
      document.removeEventListener("animationend", beiEnde);
    };
  }, []);
  return null;
}
