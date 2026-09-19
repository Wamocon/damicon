// Reine Logik fuer Himbi, den Begleiter (components/haustier). Ohne React, damit sie
// testbar bleibt: welchen Zustand hat die Himbeere, wenn der Agent gerade dies oder
// das tut, welchem Modul gehoert ein Pfad, wie sieht die Tour aus.

export type AgentPhase = "ruhe" | "arbeitet" | "freigabe" | "fehler";

export type HaustierZustand = "ruhe" | "denkt" | "freigabe" | "fertig" | "fehler" | "schlaeft" | "spricht";

/** Was der Chat gerade tut, in einer Zahl von Faellen. Eine offene Freigabe gewinnt vor allem
 *  anderen: der Agent wartet auf den Menschen, alles andere kann warten. */
export function agentPhase(a: { beschaeftigt: boolean; freigabeOffen: boolean; fehler: boolean }): AgentPhase {
  if (a.freigabeOffen) return "freigabe";
  if (a.beschaeftigt) return "arbeitet";
  if (a.fehler) return "fehler";
  return "ruhe";
}

/** Der Zustand der Figur. Rangfolge: was Aufmerksamkeit braucht, steht vorn. */
export function haustierZustand(a: {
  phase: AgentPhase;
  /** Antwort kam an, waehrend das Panel zu war, und wurde noch nicht angesehen. */
  fertigUngelesen: boolean;
  schlaeft: boolean;
  spricht?: boolean;
}): HaustierZustand {
  if (a.phase === "freigabe") return "freigabe";
  if (a.phase === "fehler") return "fehler";
  if (a.phase === "arbeitet") return "denkt";
  if (a.spricht) return "spricht";
  if (a.fertigUngelesen) return "fertig";
  if (a.schlaeft) return "schlaeft";
  return "ruhe";
}

/** Das Modul zu einem Pfad wie "/dashboard/buero/lohn" (ohne Sprachpraefix). */
export function modulAusPfad<M extends { zone: string; slug: string }>(pfad: string, module: readonly M[]): M | null {
  const teile = pfad.split("?")[0]!.split("/").filter(Boolean);
  if (teile[0] !== "dashboard" || teile.length < 3) return null;
  return module.find((m) => m.zone === teile[1] && m.slug === teile[2]) ?? null;
}

/** Die Stationen der Tour auf der oeffentlichen Startseite. anker = id des Abschnitts. */
export const TOUR_SCHRITTE = [
  { schluessel: "himbeere", anker: "himbeere" },
  { schluessel: "sechzig", anker: "sechzig-minuten" },
  { schluessel: "beleg", anker: "belegbarkeit" },
  { schluessel: "zonen", anker: "zonen" },
  { schluessel: "kpis", anker: "kpis" },
  { schluessel: "compliance", anker: "compliance" },
  { schluessel: "fragen", anker: "fragen" },
] as const;

export type TourSchluessel = (typeof TOUR_SCHRITTE)[number]["schluessel"];
