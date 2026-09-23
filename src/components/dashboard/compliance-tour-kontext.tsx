"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useComplianceTour, type ComplianceTourAnzeige, type ComplianceTourSchritt } from "@/components/dashboard/use-compliance-tour";
import type { PruefBezug } from "@/components/ki/ki-pane-kontext";

// Bruecke zwischen der CEO-Bereichsuebersicht (ceo-bereichs-kacheln.tsx, kennt den Bericht,
// meldet die Stationen an), Himbi im Dashboard (haustier-dashboard.tsx, haelt die einzige
// schwebende Figur, zeigt die Tour) und einem Neustart-Knopf (ceo-bereichs-kacheln.tsx, jederzeit
// erreichbar). Alle drei haengen nur als Geschwister unter demselben Layout - ohne diese Bruecke
// braeuchte die Tour eine zweite, eigene Figur oder einen unerreichbaren, einmaligen Zustand.
//
// Der Hook mit der eigentlichen Tour-Logik (use-compliance-tour.tsx) wird bewusst HIER, ein
// einziges Mal, aufgerufen - nicht in HaustierDashboard. Nur so teilen sich die Huelle (die die
// Tour anzeigt) und der Neustart-Knopf (der sie erneut auslöst) denselben Zustand.

export type { ComplianceTourSchritt } from "@/components/dashboard/use-compliance-tour";

interface ComplianceTourApi extends ComplianceTourAnzeige {
  schritte: ComplianceTourSchritt[] | null;
  registriere: (schritte: ComplianceTourSchritt[] | null, bezug: PruefBezug | null) => void;
}

const ComplianceTourContext = createContext<ComplianceTourApi | null>(null);

export function ComplianceTourProvider({ children }: { children: ReactNode }) {
  const [schritte, setSchritte] = useState<ComplianceTourSchritt[] | null>(null);
  const [bezug, setBezug] = useState<PruefBezug | null>(null);
  const registriere = useCallback((s: ComplianceTourSchritt[] | null, b: PruefBezug | null) => {
    setSchritte(s);
    setBezug(b);
  }, []);
  const anzeige = useComplianceTour(schritte, bezug);
  const value = useMemo<ComplianceTourApi>(() => ({ schritte, registriere, ...anzeige }), [schritte, registriere, anzeige]);
  return <ComplianceTourContext.Provider value={value}>{children}</ComplianceTourContext.Provider>;
}

/** Fuer die Bereichsuebersicht: die aktuellen Stationen, oder null - dann gibt es (noch) keine Tour. */
export function useComplianceTourSchritte(): ComplianceTourSchritt[] | null {
  return useContext(ComplianceTourContext)?.schritte ?? null;
}

/** Fuer die Bereichsuebersicht: ihre Stationen UND den Berichtsbezug (fuer "Ergebnis besprechen"
 *  am Ende der Tour) anmelden, solange sie gemountet ist - beim Verlassen der Seite (Unmount)
 *  wieder abmelden, sonst zeigt Himbi anderswo ins Leere. */
export function useRegistriereComplianceTour(schritte: ComplianceTourSchritt[] | null, bezug: PruefBezug | null): void {
  const api = useContext(ComplianceTourContext);
  const registriere = api?.registriere;
  const schluessel = `${schritte?.map((s) => `${s.anker}:${s.titel}:${s.text}`).join("|") ?? ""}::${bezug?.id ?? ""}`;
  useEffect(() => {
    registriere?.(schritte, bezug);
    return () => registriere?.(null, null);
    // schritte/bezug bewusst nicht in den Abhaengigkeiten: schluessel fasst ihren Inhalt zusammen -
    // ueber die Objekt-Referenzen selbst wuerde jeder Render (neue Bericht-Referenz) erneut anmelden.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registriere, schluessel]);
}

const LEER_ANZEIGE: ComplianceTourAnzeige = {
  frageBereit: false,
  frageBlase: null,
  aktiv: false,
  tourBlase: null,
  tourZustand: "ruhe",
  tourZiel: null,
  huepf: 0,
  verfuegbar: false,
  starten: () => {},
  zusammenfassen: () => {},
};

/** Fuer Himbi (haustier-dashboard.tsx): alles, was in ihre Blase, ihren Zustand und ihr
 *  Blickziel einfliesst. */
export function useComplianceTourAnzeige(): ComplianceTourAnzeige {
  return useContext(ComplianceTourContext) ?? LEER_ANZEIGE;
}

/** Fuer die Kopfzeile der CEO-Uebersicht (ceo-tour-aktionen.tsx): ob es ueberhaupt etwas zu
 *  zeigen gibt, ob die Tour gerade laeuft, und die zwei Funktionen, die sie (wieder) starten
 *  bzw. das Ergebnis im Chat zusammenfassen lassen. */
export function useComplianceTourSteuerung(): Pick<ComplianceTourAnzeige, "verfuegbar" | "aktiv" | "starten" | "zusammenfassen"> {
  const api = useContext(ComplianceTourContext);
  return {
    verfuegbar: api?.verfuegbar ?? false,
    aktiv: api?.aktiv ?? false,
    starten: api?.starten ?? LEER_ANZEIGE.starten,
    zusammenfassen: api?.zusammenfassen ?? LEER_ANZEIGE.zusammenfassen,
  };
}
