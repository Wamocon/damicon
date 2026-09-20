"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { leseSichtbarkeit, type AgentPhase, type Sichtbarkeit, type Stimmung } from "@/lib/haustier";

// Gemeinsamer Stand zwischen Chat und Himbi. Bewusst in DREI Kontexten statt einem:
// - Status (Phase, Text, an/aus): liest nur Himbi. Aendert sich mit jedem Werkzeugschritt.
// - Aktionen (melden, Frage stellen, ein/aus): stabile Funktionen, Aenderungen loesen
//   kein Neuzeichnen aus. Der Chat meldet darueber seinen Zustand, ohne selbst
//   neu zu rendern, wenn sich der Status aendert.
// - Vorgabe (Frage, die Himbi stellen will): liest nur der Chat.

const AN_SCHLUESSEL = "damicon-haustier";

// Die Sichtbarkeit liegt im Browser-Speicher. Als externer Speicher angebunden, damit React beim
// Hydrieren erst den Serverwert ("an") nimmt und danach den echten. Ohne nutzbaren Speicher
// (privates Fenster) gilt der Wert fuer die Sitzung im Arbeitsspeicher.
let sitzungsWert: Sichtbarkeit | null = null;
const beobachter = new Set<() => void>();
function leseSpeicher(): Sichtbarkeit {
  if (sitzungsWert) return sitzungsWert;
  try {
    return leseSichtbarkeit(window.localStorage.getItem(AN_SCHLUESSEL));
  } catch {
    return "an";
  }
}
function schreibeSpeicher(neu: Sichtbarkeit): void {
  sitzungsWert = neu;
  try {
    window.localStorage.setItem(AN_SCHLUESSEL, neu);
  } catch {
    // Speicher gesperrt: gilt dann nur fuer diese Sitzung
  }
  beobachter.forEach((b) => b());
}
function abonniere(b: () => void): () => void {
  beobachter.add(b);
  window.addEventListener("storage", b);
  return () => {
    beobachter.delete(b);
    window.removeEventListener("storage", b);
  };
}
const serverWert = (): Sichtbarkeit => "an";

interface Status {
  phase: AgentPhase;
  /** Kurzer Text zur Phase, z. B. "Pruefe MwSt-Status ..." */
  text: string;
  /** Himbi ist da. */
  an: boolean;
  /** Weggeschickt: nur die Blattspitze schaut am Rand heraus. */
  weg: boolean;
  /** Wie die letzte fertige Antwort geklungen hat. Faerbt nur das Gesicht. */
  stimmung: Stimmung;
}
interface Aktionen {
  melde: (phase: AgentPhase, text: string, stimmung?: Stimmung) => void;
  stelleFrage: (text: string) => void;
  /** Einstellung: ein (Himbi da) oder ganz aus (auch keine Spitze am Rand). */
  setAn: (an: boolean) => void;
  /** Wegschicken (Halten): Himbi geht, die Spitze bleibt zum Zurueckholen. */
  schickeWeg: () => void;
  holeZurueck: () => void;
}
export interface Vorgabe {
  id: number;
  text: string;
}

const StatusKontext = createContext<Status>({ phase: "ruhe", text: "", an: true, weg: false, stimmung: "neutral" });
const AktionenKontext = createContext<Aktionen>({
  melde: () => {},
  stelleFrage: () => {},
  setAn: () => {},
  schickeWeg: () => {},
  holeZurueck: () => {},
});
const VorgabeKontext = createContext<Vorgabe | null>(null);

export const useHaustierStatus = () => useContext(StatusKontext);
export const useHaustierAktionen = () => useContext(AktionenKontext);
export const useHaustierVorgabe = () => useContext(VorgabeKontext);

export function HaustierProvider({ children }: { children: ReactNode }) {
  const { setOffen } = useKiPane();
  const [phase, setPhase] = useState<AgentPhase>("ruhe");
  const [text, setText] = useState("");
  const [stimmung, setStimmung] = useState<Stimmung>("neutral");
  const sichtbarkeit = useSyncExternalStore(abonniere, leseSpeicher, serverWert);
  const [vorgabe, setVorgabe] = useState<Vorgabe | null>(null);

  const melde = useCallback((neuePhase: AgentPhase, neuerText: string, neueStimmung: Stimmung = "neutral") => {
    setPhase(neuePhase);
    setText(neuerText);
    setStimmung(neueStimmung);
  }, []);

  const setAn = useCallback((an: boolean) => schreibeSpeicher(an ? "an" : "aus"), []);
  const schickeWeg = useCallback(() => schreibeSpeicher("weg"), []);
  const holeZurueck = useCallback(() => schreibeSpeicher("an"), []);

  const stelleFrage = useCallback(
    (frage: string) => {
      setOffen(true);
      setVorgabe((alt) => ({ id: (alt?.id ?? 0) + 1, text: frage }));
    },
    [setOffen],
  );

  const status = useMemo(
    () => ({ phase, text, an: sichtbarkeit === "an", weg: sichtbarkeit === "weg", stimmung }),
    [phase, text, sichtbarkeit, stimmung],
  );
  const aktionen = useMemo(
    () => ({ melde, stelleFrage, setAn, schickeWeg, holeZurueck }),
    [melde, stelleFrage, setAn, schickeWeg, holeZurueck],
  );

  return (
    <AktionenKontext.Provider value={aktionen}>
      <StatusKontext.Provider value={status}>
        <VorgabeKontext.Provider value={vorgabe}>{children}</VorgabeKontext.Provider>
      </StatusKontext.Provider>
    </AktionenKontext.Provider>
  );
}
