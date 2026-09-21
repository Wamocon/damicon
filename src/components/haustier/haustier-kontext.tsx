"use client";

import { createContext, useCallback, useContext, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import {
  leseBewegung,
  leseInventar,
  leseSichtbarkeit,
  schreibeInventar,
  type AgentPhase,
  type Inventar,
  type Sichtbarkeit,
  type Stimmung,
} from "@/lib/haustier";

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

// Die Tracht liegt ebenso im Browser-Speicher, nach demselben Muster: Serverwert beim
// Hydrieren, echter Wert danach. Einstellung (haustier-einstellung.tsx) und Figur
// (haustier-dashboard.tsx) teilen sich so denselben Stand, ohne dass eine der beiden
// die andere kennen muss.
let inventarSitzungsWert: Inventar | null = null;
const inventarBeobachter = new Set<() => void>();
function leseInventarSpeicher(): Inventar {
  // Erst beim ersten Aufruf lesen und dann als dieselbe Referenz behalten - sonst liefert
  // useSyncExternalStore bei jedem Aufruf ein neues Objekt und haelt das fuer eine
  // Endlosschleife.
  if (!inventarSitzungsWert) inventarSitzungsWert = leseInventar();
  return inventarSitzungsWert;
}
function schreibeInventarSpeicher(neu: Inventar): void {
  inventarSitzungsWert = neu;
  schreibeInventar(neu);
  inventarBeobachter.forEach((b) => b());
}
function abonniereInventar(b: () => void): () => void {
  inventarBeobachter.add(b);
  window.addEventListener("storage", b);
  return () => {
    inventarBeobachter.delete(b);
    window.removeEventListener("storage", b);
  };
}
// Eine feste Referenz, aus demselben Grund wie leseInventarSpeicher oben.
const INVENTAR_SERVERWERT: Inventar = { tracht: 0, brille: true };
const serverInventarWert = (): Inventar => INVENTAR_SERVERWERT;

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
  /** Tracht und Brille - beides in den Einstellungen wechselbar. */
  inventar: Inventar;
}
interface Aktionen {
  melde: (phase: AgentPhase, text: string, stimmung?: Stimmung) => void;
  stelleFrage: (text: string) => void;
  /** Einstellung: ein (Himbi da) oder ganz aus (auch keine Spitze am Rand). */
  setAn: (an: boolean) => void;
  /** Wegschicken (Halten): Himbi geht, die Spitze bleibt zum Zurueckholen. */
  schickeWeg: () => void;
  holeZurueck: () => void;
  setInventar: (inventar: Inventar) => void;
}
export interface Vorgabe {
  id: number;
  text: string;
}

const StatusKontext = createContext<Status>({
  phase: "ruhe",
  text: "",
  an: true,
  weg: false,
  stimmung: "neutral",
  inventar: { tracht: 0, brille: true },
});
const AktionenKontext = createContext<Aktionen>({
  melde: () => {},
  stelleFrage: () => {},
  setAn: () => {},
  schickeWeg: () => {},
  holeZurueck: () => {},
  setInventar: () => {},
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
  const inventar = useSyncExternalStore(abonniereInventar, leseInventarSpeicher, serverInventarWert);
  const [vorgabe, setVorgabe] = useState<Vorgabe | null>(null);

  const melde = useCallback((neuePhase: AgentPhase, neuerText: string, neueStimmung: Stimmung = "neutral") => {
    setPhase(neuePhase);
    setText(neuerText);
    setStimmung(neueStimmung);
  }, []);

  const setAn = useCallback((an: boolean) => schreibeSpeicher(an ? "an" : "aus"), []);
  const schickeWeg = useCallback(() => schreibeSpeicher("weg"), []);
  const holeZurueck = useCallback(() => schreibeSpeicher("an"), []);
  const setInventar = useCallback((neu: Inventar) => schreibeInventarSpeicher(neu), []);

  const stelleFrage = useCallback(
    (frage: string) => {
      setOffen(true);
      setVorgabe((alt) => ({ id: (alt?.id ?? 0) + 1, text: frage }));
    },
    [setOffen],
  );

  const status = useMemo(
    () => ({ phase, text, an: sichtbarkeit === "an", weg: sichtbarkeit === "weg", stimmung, inventar }),
    [phase, text, sichtbarkeit, stimmung, inventar],
  );
  const aktionen = useMemo(
    () => ({ melde, stelleFrage, setAn, schickeWeg, holeZurueck, setInventar }),
    [melde, stelleFrage, setAn, schickeWeg, holeZurueck, setInventar],
  );

  return (
    <AktionenKontext.Provider value={aktionen}>
      <StatusKontext.Provider value={status}>
        <VorgabeKontext.Provider value={vorgabe}>{children}</VorgabeKontext.Provider>
      </StatusKontext.Provider>
    </AktionenKontext.Provider>
  );
}
