"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import type { AgentPhase } from "@/lib/haustier";

// Gemeinsamer Stand zwischen Chat und Himbi. Bewusst in DREI Kontexten statt einem:
// - Status (Phase, Text, an/aus): liest nur Himbi. Aendert sich mit jedem Werkzeugschritt.
// - Aktionen (melden, Frage stellen, ein/aus): stabile Funktionen, Aenderungen loesen
//   kein Neuzeichnen aus. Der Chat meldet darueber seinen Zustand, ohne selbst
//   neu zu rendern, wenn sich der Status aendert.
// - Vorgabe (Frage, die Himbi stellen will): liest nur der Chat.

const AN_SCHLUESSEL = "damicon-haustier";

interface Status {
  phase: AgentPhase;
  /** Kurzer Text zur Phase, z. B. "Pruefe MwSt-Status ..." */
  text: string;
  an: boolean;
}
interface Aktionen {
  melde: (phase: AgentPhase, text: string) => void;
  stelleFrage: (text: string) => void;
  setAn: (an: boolean) => void;
}
export interface Vorgabe {
  id: number;
  text: string;
}

const StatusKontext = createContext<Status>({ phase: "ruhe", text: "", an: true });
const AktionenKontext = createContext<Aktionen>({ melde: () => {}, stelleFrage: () => {}, setAn: () => {} });
const VorgabeKontext = createContext<Vorgabe | null>(null);

export const useHaustierStatus = () => useContext(StatusKontext);
export const useHaustierAktionen = () => useContext(AktionenKontext);
export const useHaustierVorgabe = () => useContext(VorgabeKontext);

export function HaustierProvider({ children }: { children: ReactNode }) {
  const { setOffen } = useKiPane();
  const [phase, setPhase] = useState<AgentPhase>("ruhe");
  const [text, setText] = useState("");
  // Aus dem Browser gelesen: Himbi zeichnet sich erst nach dem Mounten (haustier-huelle.tsx), Server und
  // erster Client-Render sind deshalb beide leer, ein abweichender Startwert verfehlt die Hydration nicht.
  const [an, setAnState] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      return window.localStorage.getItem(AN_SCHLUESSEL) !== "aus";
    } catch {
      return true;
    }
  });
  const [vorgabe, setVorgabe] = useState<Vorgabe | null>(null);

  const melde = useCallback((neuePhase: AgentPhase, neuerText: string) => {
    setPhase(neuePhase);
    setText(neuerText);
  }, []);

  const setAn = useCallback((neu: boolean) => {
    setAnState(neu);
    try {
      window.localStorage.setItem(AN_SCHLUESSEL, neu ? "an" : "aus");
    } catch {
      // siehe oben
    }
  }, []);

  const stelleFrage = useCallback(
    (frage: string) => {
      setOffen(true);
      setVorgabe((alt) => ({ id: (alt?.id ?? 0) + 1, text: frage }));
    },
    [setOffen],
  );

  const status = useMemo(() => ({ phase, text, an }), [phase, text, an]);
  const aktionen = useMemo(() => ({ melde, stelleFrage, setAn }), [melde, stelleFrage, setAn]);

  return (
    <AktionenKontext.Provider value={aktionen}>
      <StatusKontext.Provider value={status}>
        <VorgabeKontext.Provider value={vorgabe}>{children}</VorgabeKontext.Provider>
      </StatusKontext.Provider>
    </AktionenKontext.Provider>
  );
}
