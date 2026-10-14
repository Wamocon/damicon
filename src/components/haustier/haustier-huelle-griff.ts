"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type KeyboardEvent, type PointerEvent, type SetStateAction } from "react";
import type { WegTexte } from "@/components/haustier/haustier-huelle";
import { POS_SCHLUESSEL, type HimbiPlatz } from "@/components/haustier/haustier-huelle-koerper";

// Die Bedienung am Griff der Hülle (haustier-huelle.tsx), seit dem 14.10.2026 eigene Hooks: Ziehen und Klicken, Wegschicken durch
// Halten oder mit Entf, Doppelklick zurück in die Ecke. Die Zeitgeber des Wegschickens räumt ein eigener Effekt beim Abbau auf;
// er steht wie vorher als letzter Effekt der Hülle.

const ZIEHSCHWELLE = 5;
// Wegschicken durch Halten: nach HALTEN_START_MS wird Himbi traurig und ein Ring laeuft
// HALTEN_DAUER_MS lang voll; wer vorher loslaesst, hat es sich anders ueberlegt.
const HALTEN_START_MS = 380;
const HALTEN_DAUER_MS = 900;
const ABSCHIED_MS = 1250;
const ERLEICHTERT_MS = 1100;

type Setzer = Dispatch<SetStateAction<boolean>>;

/** Was die Hülle sichtbar macht (Zustand der Figur), die Bedienung aber setzt. Die Setzer haben eine feste Identität. */
export interface HaltenStand {
  schlaeft: boolean;
  setSchlaeft: Setzer;
  halten: boolean;
  setHalten: Setzer;
  abschied: boolean;
  setAbschied: Setzer;
  setErleichtert: Setzer;
}

// ---- Wegschicken durch Halten --------------------------------------------------------------
function useWegschicken(weg: WegTexte | undefined, { setHalten, setAbschied, setErleichtert }: HaltenStand) {
  const wegRef = useRef(weg);
  // Wie vor dem Zerlegen im Render nachgeführt: der Abschied ruft onWeg aus dem letzten Stand. Seit der Hook klein genug ist, dass
  // der React Compiler ihn prüft, meldet er das; das Verhalten bleibt bewusst unverändert.
  // eslint-disable-next-line react-hooks/refs
  wegRef.current = weg;
  const haltenTimer = useRef<number | undefined>(undefined);
  const abschiedTimer = useRef<number | undefined>(undefined);
  const endeTimer = useRef<number | undefined>(undefined);
  const erleichtertTimer = useRef<number | undefined>(undefined);

  const stoppeHalten = useCallback(() => {
    window.clearTimeout(haltenTimer.current);
    window.clearTimeout(abschiedTimer.current);
    setHalten(false);
  }, [setHalten]);

  const starteAbschied = useCallback(() => {
    window.clearTimeout(haltenTimer.current);
    window.clearTimeout(abschiedTimer.current);
    window.clearTimeout(endeTimer.current);
    setHalten(true);
    setAbschied(true);
    endeTimer.current = window.setTimeout(() => wegRef.current?.onWeg(), ABSCHIED_MS);
  }, [setHalten, setAbschied]);

  useEffect(
    () => () => {
      window.clearTimeout(haltenTimer.current);
      window.clearTimeout(abschiedTimer.current);
      window.clearTimeout(endeTimer.current);
      window.clearTimeout(erleichtertTimer.current);
    },
    [],
  );

  /** Gedrueckt: nach HALTEN_START_MS traurig, nach weiteren HALTEN_DAUER_MS der Abschied. */
  const starteHalten = () => {
    window.clearTimeout(haltenTimer.current);
    window.clearTimeout(abschiedTimer.current);
    haltenTimer.current = window.setTimeout(() => setHalten(true), HALTEN_START_MS);
    abschiedTimer.current = window.setTimeout(starteAbschied, HALTEN_START_MS + HALTEN_DAUER_MS);
  };

  /** Vor dem Ende losgelassen: Himbi ist erleichtert. */
  const erleichtere = () => {
    stoppeHalten();
    setErleichtert(true);
    window.clearTimeout(erleichtertTimer.current);
    erleichtertTimer.current = window.setTimeout(() => setErleichtert(false), ERLEICHTERT_MS);
  };

  return { stoppeHalten, starteAbschied, starteHalten, erleichtere };
}

// ---- Ziehen und Klicken ----------------------------------------------------------------
/** Ereignisse am Griff. Gibt den Zustand "zieht", die Referenz fuer die Wurzel (Neigung beim Ziehen) und die Hoerer zurueck. */
export function useGriffBedienung({ weg, onKlick, platz, stand }: { weg: WegTexte | undefined; onKlick: () => void; platz: HimbiPlatz; stand: HaltenStand }) {
  const { stoppeHalten, starteAbschied, starteHalten, erleichtere } = useWegschicken(weg, stand);
  const wurzel = useRef<HTMLDivElement>(null);
  const [zieht, setZieht] = useState(false);
  const start = useRef<{ x: number; y: number; vx: number; vy: number; bewegt: boolean } | null>(null);
  const { versatzWert, setzeVersatz, klemme, bestimmeSeite, bestimmeHoehe } = platz;
  const { schlaeft, setSchlaeft, halten, abschied } = stand;

  const beiZiehen = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, vx: versatzWert.current.x, vy: versatzWert.current.y, bewegt: false };
    if (schlaeft) setSchlaeft(false);
    if (weg && !abschied) starteHalten();
  };
  const beiBewegen = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.bewegt && Math.hypot(dx, dy) < ZIEHSCHWELLE) return;
    if (!s.bewegt) {
      s.bewegt = true;
      stoppeHalten(); // wer zieht, will nichts wegschicken
      setZieht(true);
    }
    setzeVersatz(s.vx + dx, s.vy + dy);
    wurzel.current?.style.setProperty("--hb-neigung", `${Math.max(-14, Math.min(14, e.movementX * 1.6)).toFixed(1)}deg`);
  };
  const beiLoslassen = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s) return;
    if (s.bewegt) {
      setZieht(false);
      wurzel.current?.style.setProperty("--hb-neigung", "0deg");
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
      try {
        window.localStorage.setItem(POS_SCHLUESSEL, JSON.stringify(versatzWert.current));
      } catch {
        // gesperrter Speicher: Position gilt nur bis zum Neuladen
      }
    } else if (abschied) {
      // Der Abschied laeuft, Loslassen aendert nichts mehr.
    } else if (halten) {
      erleichtere();
    } else {
      stoppeHalten();
      onKlick();
    }
  };
  const beiTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onKlick();
    } else if ((e.key === "Delete" || e.key === "Backspace") && weg && !abschied) {
      e.preventDefault();
      starteAbschied();
    }
  };
  const zuruecksetzen = () => {
    setzeVersatz(0, 0);
    try {
      window.localStorage.removeItem(POS_SCHLUESSEL);
    } catch {
      // egal
    }
    bestimmeSeite();
    bestimmeHoehe();
  };

  return { wurzel, zieht, beiZiehen, beiBewegen, beiLoslassen, beiTaste, zuruecksetzen };
}
