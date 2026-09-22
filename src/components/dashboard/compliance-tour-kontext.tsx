"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

// Bruecke zwischen der CEO-Bereichsuebersicht (ceo-bereichs-kacheln.tsx, kennt den Bericht) und
// Himbi im Dashboard (haustier-dashboard.tsx, haelt die einzige schwebende Figur). Beide haengen
// nur als Geschwister unter demselben Layout - die Uebersicht meldet hier an, WELCHE Stationen es
// auf der aktuellen Seite zu zeigen gibt (leer/verlassen: wieder abmelden), Himbi fragt hier ab,
// ob es ueberhaupt etwas zu fuehren gibt. Ohne diese Bruecke braeuchte die Tour eine zweite,
// eigene Figur - zwei Himbis auf einer Seite waeren kein Fuehrer, sondern eine Verwirrung.

export interface ComplianceTourSchritt {
  /** id des Abschnitts, zu dem gescrollt wird (Kopfkarte oder eine Bereichs-Kachel). */
  anker: string;
  titel: string;
  text: string;
}

interface ComplianceTourApi {
  schritte: ComplianceTourSchritt[] | null;
  registriere: (schritte: ComplianceTourSchritt[] | null) => void;
}

const ComplianceTourContext = createContext<ComplianceTourApi | null>(null);

export function ComplianceTourProvider({ children }: { children: ReactNode }) {
  const [schritte, setSchritte] = useState<ComplianceTourSchritt[] | null>(null);
  const registriere = useCallback((s: ComplianceTourSchritt[] | null) => setSchritte(s), []);
  const value = useMemo(() => ({ schritte, registriere }), [schritte, registriere]);
  return <ComplianceTourContext.Provider value={value}>{children}</ComplianceTourContext.Provider>;
}

/** Fuer Himbi: die Stationen der aktuellen Seite, oder null - dann gibt es (noch) keine Tour. */
export function useComplianceTourSchritte(): ComplianceTourSchritt[] | null {
  return useContext(ComplianceTourContext)?.schritte ?? null;
}

/** Fuer die Bereichsuebersicht: ihre Stationen anmelden, solange sie gemountet ist - beim
 *  Verlassen der Seite (Unmount) wieder abmelden, sonst zeigt Himbi anderswo ins Leere. */
export function useRegistriereComplianceTour(schritte: ComplianceTourSchritt[] | null): void {
  const api = useContext(ComplianceTourContext);
  const registriere = api?.registriere;
  const schluessel = schritte?.map((s) => `${s.anker}:${s.titel}:${s.text}`).join("|") ?? "";
  useEffect(() => {
    registriere?.(schritte);
    return () => registriere?.(null);
    // schritte bewusst nicht in den Abhaengigkeiten: schluessel fasst seinen Inhalt zusammen -
    // ueber die Array-Referenz selbst wuerde jeder Render (neue Bericht-Referenz) erneut anmelden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registriere, schluessel]);
}
