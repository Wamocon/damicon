"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { abonniereHervorhebung, hervorhebungServer, leseHervorhebung } from "@/components/ki/hervorhebung";
import type { Rechteck } from "@/lib/domain/sprachmodus";

// Rahmen um das Element, das der Assistent gerade zeigt - waehrend des
// Sprachmodus. Die Seite bleibt ueberall normal hell und scharf sichtbar
// (Rueckmeldung vom 25.09.2026: "die Mitte muss ich gut sehen und lesen
// koennen, sie darf nicht verblurt werden") - bis zum 25.09.2026 dunkelte
// hier zusaetzlich eine Flaeche mit einem Loch fuer das Ziel ab; das ist
// entfallen, es bleibt nur der Rahmen, der das Ziel umrandet.
//
// Nachverfolgung: ResizeObserver auf dem Ziel selbst (Groessenaenderung),
// dazu Scroll- und Resize-Listener - im Unterschied zu react-joyride bewusst
// NICHT auf jede einzelne Scrollparent-Ebene einzeln, weil unsere Seiten kaum
// verschachtelte Scrollcontainer haben (Ausnahme: Tabellen mit eigenem
// Scrollbalken, dort scrollt der Anker ohnehin per scrollIntoView mit).

const ABSTAND = 16;

function rechteckVon(element: Element): Rechteck {
  const r = element.getBoundingClientRect();
  return { x: r.left, y: r.top, breite: r.width, hoehe: r.height };
}

/** Nur fuer das Spotlight (nicht fuer die Kugel-Platzierung, siehe sprachmodus.tsx):
 *  liefert das aktuelle Zielrechteck oder null, wenn nichts hervorgehoben ist.
 *
 *  Springt der Assistent waehrend des Sprachmodus auf eine neue Seite
 *  (oeffneBereich), raeumt React den kompletten Baum der vorigen Seite ab -
 *  auch das Element, auf das gerade noch gezeigt wurde. setzeHervorhebung
 *  haelt trotzdem die alte Referenz, und getBoundingClientRect() eines aus
 *  dem Dokument entfernten Elements liefert lautlos ein Nullrechteck (x=0,
 *  y=0, Breite=0, Hoehe=0) - derselbe Fall wie beim Blickziel der Figur
 *  (haustier-huelle.tsx, isConnected-Pruefung dort). Ohne diese Pruefung
 *  hier blieb das "Loch" im Abdunkel-Overlay ein 32x32 Pixel grosser Fleck
 *  in der linken oberen Bildschirmecke, der Rest der Seite blieb komplett
 *  abgedunkelt - gemeldet als "alles einfach weiss" (Screenshot vom
 *  25.09.2026, ausgeloest genau beim Sprung zu einem Bereich). */
export function useHervorhebungsRechteck(): Rechteck | null {
  const element = useSyncExternalStore(abonniereHervorhebung, leseHervorhebung, hervorhebungServer);
  const [rechteck, setRechteck] = useState<Rechteck | null>(null);

  useEffect(() => {
    // Kein Ziel: nichts zu messen und nichts zu abonnieren - das Rechteck von einem
    // vorigen Ziel wird unten (element ? rechteck : null) verworfen, ohne dass diese
    // Verzweigung selbst noch state setzt.
    if (!element) return;
    const messen = () => setRechteck(element.isConnected ? rechteckVon(element) : null);
    messen();
    const ro = new ResizeObserver(messen);
    ro.observe(element);
    window.addEventListener("scroll", messen, { passive: true, capture: true });
    window.addEventListener("resize", messen);
    // Eine Navigation aendert den DOM-Baum, loest aber weder scroll noch
    // resize aus - ohne diesen Beobachter bliebe das Nullrechteck stehen,
    // bis zufaellig eines der beiden Ereignisse eintrifft.
    const beobachter = new MutationObserver(messen);
    beobachter.observe(document.body, { childList: true, subtree: true });
    return () => {
      ro.disconnect();
      beobachter.disconnect();
      window.removeEventListener("scroll", messen, { capture: true });
      window.removeEventListener("resize", messen);
    };
  }, [element]);

  return element && element.isConnected ? rechteck : null;
}

export function SprachSpotlight({ rechteck }: { rechteck: Rechteck | null }) {
  // Ein Rechteck ohne Flaeche (verwaistes Ziel, Element noch nicht ausgemessen) zeigt keinen Rahmen.
  if (!rechteck || rechteck.breite <= 0 || rechteck.hoehe <= 0) return null;

  return (
    <div
      className="ki-sprachmodus__spotlight-ring"
      aria-hidden
      style={{
        left: rechteck.x - ABSTAND,
        top: rechteck.y - ABSTAND,
        width: rechteck.breite + 2 * ABSTAND,
        height: rechteck.hoehe + 2 * ABSTAND,
      }}
    />
  );
}
