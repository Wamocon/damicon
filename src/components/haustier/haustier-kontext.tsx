"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import {
  autoStartSpeicher,
  bewegungSpeicher,
  inventarSpeicher,
  sichtbarkeitSpeicher,
  tagesbeginnSpeicher,
  tourSpeicher,
  type AgentPhase,
  type Inventar,
  type Stimmung,
} from "@/lib/haustier";

// Gemeinsamer Stand zwischen Chat und Himbi. Bewusst in DREI Kontexten statt einem:
// - Status (Phase, Text, an/aus): liest nur Himbi. Aendert sich mit jedem Werkzeugschritt.
// - Aktionen (melden, Frage stellen, ein/aus): stabile Funktionen, Aenderungen loesen
//   kein Neuzeichnen aus. Der Chat meldet darueber seinen Zustand, ohne selbst
//   neu zu rendern, wenn sich der Status aendert.
// - Vorgabe (Frage, die Himbi stellen will): liest nur der Chat.
//
// Die Einstellungen (Sichtbarkeit, Tracht, Tour, automatischer Start, Tagesbeginn) liegen im
// Browser-Speicher, je als externer Speicher aus lib/haustier.ts (erzeugeBrowserSpeicher): React
// nimmt beim Hydrieren erst den Serverwert und danach den echten, Einstellung
// (haustier-einstellung.tsx), Figur (haustier-dashboard.tsx), Tour-Hook (use-compliance-tour.tsx)
// und Sprachmodus teilen sich so denselben Stand, auch ueber Tabs hinweg. Bis zum 28.09.2026
// stand hier fuenfmal dasselbe Muster von Hand (Fund 57).

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
  /** Einstellung: die gefuehrte Compliance-Tour (use-compliance-tour.tsx) anbieten und
   *  automatisch starten. Aus heisst nur: kein Herumspringen und Hervorheben auf der Seite -
   *  die automatische Zusammenfassung im Chat bleibt davon unberuehrt. */
  tourAn: boolean;
  /** Einstellung: Tour UND Zusammenfassung starten nach einer Pruefung von selbst (samt dem
   *  einmaligen Angebot). Aus heisst: nichts startet von selbst, die Knoepfe in der Uebersicht
   *  bleiben. */
  autoStart: boolean;
  /** Einstellung: Himbi fragt einmal am Tag von sich aus nach der Tageslage, im Gespraech und
   *  als Sprechblase (lib/himbi-tagesbeginn.ts). Voreinstellung an. */
  tagesbeginnAn: boolean;
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
  setTourAn: (an: boolean) => void;
  setAutoStart: (an: boolean) => void;
  setTagesbeginnAn: (an: boolean) => void;
}
export interface Vorgabe {
  id: number;
  text: string;
}

// Ohne Provider gelten die Voreinstellungen der Speicher, dieselben wie beim Hydrieren.
const StatusKontext = createContext<Status>({
  phase: "ruhe",
  text: "",
  an: sichtbarkeitSpeicher.serverWert() === "an",
  weg: sichtbarkeitSpeicher.serverWert() === "weg",
  stimmung: "neutral",
  inventar: inventarSpeicher.serverWert(),
  tourAn: tourSpeicher.serverWert(),
  autoStart: autoStartSpeicher.serverWert(),
  tagesbeginnAn: tagesbeginnSpeicher.serverWert(),
});
const AktionenKontext = createContext<Aktionen>({
  melde: () => {},
  stelleFrage: () => {},
  setAn: () => {},
  schickeWeg: () => {},
  holeZurueck: () => {},
  setInventar: () => {},
  setTourAn: () => {},
  setAutoStart: () => {},
  setTagesbeginnAn: () => {},
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

  // Der gespeicherte Bewegungsschalter gilt fuer das ganze Dokument. Einmal beim Start
  // setzen - danach schreibt ihn nur noch die Einstellung selbst.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-hb-still", !bewegungSpeicher.lese());
  }, []);
  const sichtbarkeit = useSyncExternalStore(sichtbarkeitSpeicher.abonniere, sichtbarkeitSpeicher.lese, sichtbarkeitSpeicher.serverWert);
  const inventar = useSyncExternalStore(inventarSpeicher.abonniere, inventarSpeicher.lese, inventarSpeicher.serverWert);
  const tourAn = useSyncExternalStore(tourSpeicher.abonniere, tourSpeicher.lese, tourSpeicher.serverWert);
  const autoStart = useSyncExternalStore(autoStartSpeicher.abonniere, autoStartSpeicher.lese, autoStartSpeicher.serverWert);
  const tagesbeginnAn = useSyncExternalStore(tagesbeginnSpeicher.abonniere, tagesbeginnSpeicher.lese, tagesbeginnSpeicher.serverWert);
  const [vorgabe, setVorgabe] = useState<Vorgabe | null>(null);

  const melde = useCallback((neuePhase: AgentPhase, neuerText: string, neueStimmung: Stimmung = "neutral") => {
    setPhase(neuePhase);
    setText(neuerText);
    setStimmung(neueStimmung);
  }, []);

  const setAn = useCallback((an: boolean) => sichtbarkeitSpeicher.schreibe(an ? "an" : "aus"), []);
  const schickeWeg = useCallback(() => sichtbarkeitSpeicher.schreibe("weg"), []);
  const holeZurueck = useCallback(() => sichtbarkeitSpeicher.schreibe("an"), []);
  const setInventar = useCallback((neu: Inventar) => inventarSpeicher.schreibe(neu), []);
  const setTourAn = useCallback((neu: boolean) => tourSpeicher.schreibe(neu), []);
  const setAutoStart = useCallback((neu: boolean) => autoStartSpeicher.schreibe(neu), []);
  const setTagesbeginnAn = useCallback((neu: boolean) => tagesbeginnSpeicher.schreibe(neu), []);

  const stelleFrage = useCallback(
    (frage: string) => {
      setOffen(true);
      setVorgabe((alt) => ({ id: (alt?.id ?? 0) + 1, text: frage }));
    },
    [setOffen],
  );

  const status = useMemo(
    () => ({ phase, text, an: sichtbarkeit === "an", weg: sichtbarkeit === "weg", stimmung, inventar, tourAn, autoStart, tagesbeginnAn }),
    [phase, text, sichtbarkeit, stimmung, inventar, tourAn, autoStart, tagesbeginnAn],
  );
  const aktionen = useMemo(
    () => ({ melde, stelleFrage, setAn, schickeWeg, holeZurueck, setInventar, setTourAn, setAutoStart, setTagesbeginnAn }),
    [melde, stelleFrage, setAn, schickeWeg, holeZurueck, setInventar, setTourAn, setAutoStart, setTagesbeginnAn],
  );

  return (
    <AktionenKontext.Provider value={aktionen}>
      <StatusKontext.Provider value={status}>
        <VorgabeKontext.Provider value={vorgabe}>{children}</VorgabeKontext.Provider>
      </StatusKontext.Provider>
    </AktionenKontext.Provider>
  );
}
