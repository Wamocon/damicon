"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { HaustierZustand } from "@/lib/haustier";
import { BLICK_DENKT, blickRichtung } from "@/lib/haustier";

// Das Körperliche der Hülle um Himbi (haustier-huelle.tsx), seit dem 14.10.2026 eigene Hooks: der Platz im Bild (gespeicherte
// Position, Klemmen an den Rand, Seite und Höhe der Blase), wohin die Augen schauen, wie die Figur einem Blickziel folgt, Zeiger,
// Schlaf und Wecken, Hüpfer und Konfetti. Die Hülle ruft die Hooks in dieser Reihenfolge; so laufen die Effekte in derselben Folge
// wie vorher, als alles in der Komponente stand.

export const POS_SCHLUESSEL = "damicon-haustier-pos";
const SCHLAF_NACH_MS = 40_000;
const WECKEN_RADIUS = 220;
const RAND = 8;

type Griff = RefObject<HTMLDivElement | null>;

// ---- Mounten, gespeicherte Position ------------------------------------------------
export function useHimbiPlatz(paneOffen: boolean) {
  const griff = useRef<HTMLDivElement>(null);
  const versatz = useRef<HTMLDivElement>(null);
  const [bereit, setBereit] = useState(false);
  const [seite, setSeite] = useState<"rechts" | "links">("rechts");
  const [hoehe, setHoehe] = useState<"oben" | "unten">("oben");

  const versatzWert = useRef({ x: 0, y: 0 });
  const setzeVersatz = useCallback((x: number, y: number) => {
    versatzWert.current = { x, y };
    versatz.current?.style.setProperty("--hx", String(Math.round(x * 10) / 10));
    versatz.current?.style.setProperty("--hy", String(Math.round(y * 10) / 10));
  }, []);

  const bestimmeSeite = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (r) setSeite(r.left + r.width / 2 < window.innerWidth / 2 ? "links" : "rechts");
  }, []);

  /** Passt normalerweise ueber die Blase; steht Himbi zu nah am oberen Rand (moeglich, seit
   *  positionFolgtBlick sie ueberallhin ziehen kann), steht die Blase stattdessen darunter. */
  const BLASE_MINDESTHOEHE = 210;
  const bestimmeHoehe = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (r) setHoehe(r.top < BLASE_MINDESTHOEHE ? "unten" : "oben");
  }, []);

  /** Haelt Himbi im sichtbaren Bereich, wie auch immer sie dorthin kam (Ziehen, Fenster kleiner, Panel auf). */
  const klemme = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (!r) return;
    let { x, y } = versatzWert.current;
    if (r.left < RAND) x += RAND - r.left;
    if (r.right > window.innerWidth - RAND) x -= r.right - (window.innerWidth - RAND);
    if (r.top < RAND) y += RAND - r.top;
    if (r.bottom > window.innerHeight - RAND) y -= r.bottom - (window.innerHeight - RAND);
    if (x !== versatzWert.current.x || y !== versatzWert.current.y) setzeVersatz(x, y);
  }, [setzeVersatz]);

  useEffect(() => {
    try {
      const roh = window.localStorage.getItem(POS_SCHLUESSEL);
      if (roh) {
        const p = JSON.parse(roh) as { x?: number; y?: number };
        if (typeof p.x === "number" && typeof p.y === "number") setzeVersatz(p.x, p.y);
      }
    } catch {
      // gesperrter oder kaputter Speicher: Standardposition
    }
    // Erst nach dem Mount bereit, wie vor dem Zerlegen (die Position kommt aus dem Browser). Seit der Hook klein genug ist, dass
    // der React Compiler ihn prüft, meldet er das; das Verhalten bleibt bewusst unverändert.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBereit(true);
    const nachLayout = window.requestAnimationFrame(() => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    });
    const beiGroesse = () => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    };
    window.addEventListener("resize", beiGroesse);
    return () => {
      window.cancelAnimationFrame(nachLayout);
      window.removeEventListener("resize", beiGroesse);
    };
  }, [klemme, bestimmeSeite, bestimmeHoehe, setzeVersatz]);

  // Das Element gibt es erst, wenn bereit gesetzt ist (davor wird nichts gezeichnet). Die gespeicherte
  // Position wurde im Mount-Effekt nur gemerkt - hier wird sie ans echte Element geschrieben.
  useEffect(() => {
    if (bereit) setzeVersatz(versatzWert.current.x, versatzWert.current.y);
  }, [bereit, setzeVersatz]);

  // Panel auf/zu verschiebt Himbi - danach pruefen, ob sie noch im Bild ist.
  useEffect(() => {
    const id = window.setTimeout(() => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    }, 620);
    return () => window.clearTimeout(id);
  }, [paneOffen, klemme, bestimmeSeite, bestimmeHoehe]);

  return { griff, versatz, bereit, seite, hoehe, versatzWert, setzeVersatz, bestimmeSeite, bestimmeHoehe, klemme };
}
export type HimbiPlatz = ReturnType<typeof useHimbiPlatz>;

// ---- Wohin geschaut wird ------------------------------------------------------------
// Fuehrt niemand ihren Blick, schaut Himbi auf das Feld, in das gerade geschrieben
// wird: sie merkt, dass man ihr etwas tippt. Ermittelt ueber den Fokus im Dokument und
// nicht ueber einen Draht vom Chat hierher - der Blick ist keine Absprache wert, und
// so gilt es auch fuer das angedockte Panel und jedes Feld, das spaeter dazukommt.
export function useTippZiel(): Element | null {
  const [tippZiel, setTippZiel] = useState<Element | null>(null);
  useEffect(() => {
    const passend = (el: EventTarget | null): Element | null => {
      if (!(el instanceof Element)) return null;
      if (!el.matches("textarea, input[type='text'], input:not([type])")) return null;
      return el.closest(".ki-pane") ? el : null;
    };
    const rein = (e: FocusEvent) => setTippZiel(passend(e.target));
    const raus = () => setTippZiel(null);
    document.addEventListener("focusin", rein);
    document.addEventListener("focusout", raus);
    // Beim Mounten kann der Fokus schon im Feld stehen. Der React Compiler meldet das Setzen im Effekt, seit der Hook klein genug
    // für seine Prüfung ist; das Verhalten bleibt bewusst wie vor dem Zerlegen.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTippZiel(passend(document.activeElement));
    return () => {
      document.removeEventListener("focusin", rein);
      document.removeEventListener("focusout", raus);
    };
  }, []);
  return tippZiel;
}

// ---- Augen: gedaempft zum Ziel ------------------------------------------------------
export function useAugen(griffRef: Griff, anzeige: HaustierZustand, schauZiel: Element | null) {
  const ziel = useRef({ x: 0, y: 0 });
  const augen = useRef({ x: 0, y: 0 });
  const schleife = useRef(0);

  const laufe = useCallback(
    function schritt() {
      const el = griffRef.current;
      if (!el) return;
      const a = augen.current;
      const z = ziel.current;
      a.x += (z.x - a.x) * 0.2;
      a.y += (z.y - a.y) * 0.2;
      el.style.setProperty("--bx", a.x.toFixed(2));
      el.style.setProperty("--by", a.y.toFixed(2));
      if (Math.abs(z.x - a.x) > 0.02 || Math.abs(z.y - a.y) > 0.02) schleife.current = window.requestAnimationFrame(schritt);
      else schleife.current = 0;
    },
    [griffRef],
  );

  const richteAugen = useCallback(
    (x: number, y: number) => {
      ziel.current = { x, y };
      if (!schleife.current) schleife.current = window.requestAnimationFrame(laufe);
    },
    [laufe],
  );

  const blickZu = useCallback(
    (px: number, py: number) => {
      const r = griffRef.current?.getBoundingClientRect();
      if (!r) return;
      const b = blickRichtung(px - (r.left + r.width / 2), py - (r.top + r.height * 0.6));
      richteAugen(b.x, b.y);
    },
    [griffRef, richteAugen],
  );

  // Zustandsabhaengiger Blick: denkt = nach oben links, Schlaf/Fehler = nach unten
  useEffect(() => {
    if (schauZiel) return;
    if (anzeige === "denkt") richteAugen(BLICK_DENKT.x, BLICK_DENKT.y);
    else if (anzeige === "schlaeft") richteAugen(0, 1.5);
    else if (anzeige === "traurig") richteAugen(0, 2.6);
    else if (anzeige === "fehler") richteAugen(0, 2);
    else richteAugen(0, 0);
  }, [anzeige, schauZiel, richteAugen]);

  // Auf das Ziel schauen, auch waehrend die Seite dorthin scrollt (Tour) oder das
  // Panel noch aufgeht (Eingabefeld).
  useEffect(() => {
    if (!schauZiel) return;
    let frame = 0;
    const schaue = () => {
      frame = 0;
      const r = schauZiel.getBoundingClientRect();
      blickZu(r.left + r.width / 2, r.top + Math.min(r.height / 2, 260));
    };
    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(schaue);
    };
    planen();
    window.addEventListener("scroll", planen, { passive: true });
    window.addEventListener("resize", planen);
    return () => {
      window.removeEventListener("scroll", planen);
      window.removeEventListener("resize", planen);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [schauZiel, blickZu]);

  /** Haelt die laufende Augenschleife an (beim Abbau, aus useZeigerUndSchlaf). */
  const stoppeAugen = useCallback(() => {
    if (schleife.current) window.cancelAnimationFrame(schleife.current);
  }, []);

  return { blickZu, stoppeAugen };
}

// Die ganze Figur zum Blickziel bewegen, nicht nur die Augen (positionFolgtBlick) - fuer eine
// Fuehrung auf einer langen, scrollbaren Seite (Dashboard). Rechnet aus der TATSAECHLICH
// gezeichneten Position (die den aktuellen Versatz schon einschliesst), deshalb bleibt es
// richtig, wo immer Himbi gerade steht. Endet die Fuehrung, geht es zurueck in die Ecke - sonst
// bliebe die Figur an einer Bildschirmstelle stehen, die nach dem naechsten Scrollen zu nichts
// mehr gehoert (fixed positioniert, folgt dem Dokument nicht von selbst).
// griff und versatzWert sind Referenzen aus useHimbiPlatz mit fester Identität; sie stehen nur
// deshalb in den Abhängigkeiten, weil sie hier als Eingabe ankommen.
export function useFolgtBlick({ positionFolgtBlick, blickZiel, platz }: { positionFolgtBlick: boolean; blickZiel: Element | null | undefined; platz: HimbiPlatz }) {
  const { griff, versatzWert, setzeVersatz, bestimmeSeite, bestimmeHoehe } = platz;
  const folgtGerade = useRef(false);
  useEffect(() => {
    // isConnected: der Aufrufer kann ein Element noch referenzieren, das React laengst aus dem
    // DOM entfernt hat (z. B. der Live-Lauf-Hinweis, dessen Anker verschwindet, sobald der Check
    // fertig ist, bevor die Blase selbst das mitbekommt) - getBoundingClientRect() liefert dafuer
    // lautlos ein Nullrechteck, ohne diese Pruefung wuerde das die Figur in eine Bildschirmecke
    // ziehen, die nichts mit dem eigentlichen Ziel zu tun hat.
    if (!positionFolgtBlick || !blickZiel || !blickZiel.isConnected) {
      if (folgtGerade.current) {
        setzeVersatz(0, 0);
        bestimmeSeite();
        bestimmeHoehe();
      }
      folgtGerade.current = false;
      return;
    }
    folgtGerade.current = true;
    let frame = 0;
    const bewege = () => {
      frame = 0;
      if (!blickZiel.isConnected) return;
      const zielRect = blickZiel.getBoundingClientRect();
      const eigeneRect = griff.current?.getBoundingClientRect();
      if (!eigeneRect) return;
      const breite = eigeneRect.width;
      const hoehe = eigeneRect.height;
      // Knapp ausserhalb der unteren rechten Ecke des Ziels, dabei immer im sichtbaren Bereich.
      const zielX = Math.min(Math.max(zielRect.right - breite * 0.4, breite / 2 + RAND), window.innerWidth - breite / 2 - RAND);
      const zielY = Math.min(Math.max(zielRect.bottom - hoehe * 0.4, hoehe / 2 + RAND), window.innerHeight - hoehe / 2 - RAND);
      const deltaX = zielX - (eigeneRect.left + breite / 2);
      const deltaY = zielY - (eigeneRect.top + hoehe / 2);
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) setzeVersatz(versatzWert.current.x + deltaX, versatzWert.current.y + deltaY);
      bestimmeSeite();
      bestimmeHoehe();
    };
    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(bewege);
    };
    planen();
    window.addEventListener("scroll", planen, { passive: true });
    window.addEventListener("resize", planen);
    return () => {
      window.removeEventListener("scroll", planen);
      window.removeEventListener("resize", planen);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [positionFolgtBlick, blickZiel, setzeVersatz, bestimmeSeite, bestimmeHoehe, griff, versatzWert]);
}

// ---- Mauszeiger: Augen folgen, Naehe weckt, Leerlauf schlaefert ein -------------------
// griffRef, stoppeAugen und setSchlaeft haben eine feste Identität; sie stehen nur deshalb in den Abhängigkeiten, weil sie hier
// als Eingabe ankommen.
export function useZeigerUndSchlaf({
  griffRef,
  anzeige,
  schauZiel,
  blickZu,
  stoppeAugen,
  setSchlaeft,
}: {
  griffRef: Griff;
  anzeige: HaustierZustand;
  schauZiel: Element | null;
  blickZu: (px: number, py: number) => void;
  stoppeAugen: () => void;
  setSchlaeft: Dispatch<SetStateAction<boolean>>;
}) {
  // Die Hörer am Fenster lesen den letzten Stand: wie vor dem Zerlegen im Render nachgeführt. Seit der Hook klein genug ist, dass
  // der React Compiler ihn prüft, meldet er das; das Verhalten bleibt bewusst unverändert.
  const anzeigeRef = useRef(anzeige);
  // eslint-disable-next-line react-hooks/refs
  anzeigeRef.current = anzeige;
  const blickZielRef = useRef<Element | null>(null);
  // eslint-disable-next-line react-hooks/refs
  blickZielRef.current = schauZiel;
  const letzteAktivitaet = useRef(0);
  useEffect(() => {
    letzteAktivitaet.current = Date.now();
    const beiZeiger = (e: globalThis.PointerEvent) => {
      letzteAktivitaet.current = Date.now();
      const r = griffRef.current?.getBoundingClientRect();
      if (!r) return;
      const naeher = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < WECKEN_RADIUS;
      if (naeher && anzeigeRef.current === "schlaeft") setSchlaeft(false);
      if (blickZielRef.current) return;
      const z = anzeigeRef.current;
      if (z === "ruhe" || z === "fertig" || z === "freigabe" || z === "spricht") blickZu(e.clientX, e.clientY);
    };
    const beiTaste = () => {
      letzteAktivitaet.current = Date.now();
    };
    window.addEventListener("pointermove", beiZeiger, { passive: true });
    window.addEventListener("keydown", beiTaste, { passive: true });
    const wach = window.setInterval(() => {
      if (anzeigeRef.current === "ruhe" && Date.now() - letzteAktivitaet.current > SCHLAF_NACH_MS) setSchlaeft(true);
    }, 2000);
    return () => {
      window.removeEventListener("pointermove", beiZeiger);
      window.removeEventListener("keydown", beiTaste);
      window.clearInterval(wach);
      stoppeAugen();
    };
  }, [blickZu, griffRef, stoppeAugen, setSchlaeft]);
}

/** Huepfer bei jeder Aenderung des Zaehlers: Klasse entfernen, neu berechnen lassen, wieder setzen. Gibt die Referenz fuer den Koerper. */
export function useHuepfer(huepf: number) {
  const koerper = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = koerper.current;
    if (!huepf || !el) return;
    el.classList.remove("hb-huepf");
    void el.offsetWidth;
    el.classList.add("hb-huepf");
  }, [huepf]);
  return koerper;
}

/** Konfetti bei jedem Eintritt in "fertig": die laufende Nummer, 0 solange noch keins flog. */
export function useKonfetti(zustand: HaustierZustand): number {
  const [konfettiNr, setKonfettiNr] = useState(0);
  const vorher = useRef<HaustierZustand>("ruhe");
  useEffect(() => {
    // Erst nach dem Wechsel gezählt, wie vor dem Zerlegen. Seit der Hook klein genug ist, dass der React Compiler ihn prüft,
    // meldet er das; das Verhalten bleibt bewusst unverändert.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (zustand === "fertig" && vorher.current !== "fertig") setKonfettiNr((n) => n + 1);
    vorher.current = zustand;
  }, [zustand]);
  return konfettiNr;
}
