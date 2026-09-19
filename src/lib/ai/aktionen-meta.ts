import type { Resource } from "@/lib/rbac";

// Clientsicherer Teil der Agenten-Aktionen (die Ausfuehrung steht in
// aktionen.ts, server-only): welche Werkzeuge Aktionen sind und welches Recht
// sie voraussetzen. Der Chat braucht das, um eine Aktion als Freigabekarte
// statt als Leseschritt darzustellen, und um Vorschlaege nur fuer Aktionen zu
// zeigen, die die Rolle auch ausfuehren duerfte.
export interface AktionsRecht {
  resource: Resource;
  verb: "create" | "update";
}

export const AKTIONS_RECHTE = {
  mwstSchwellePruefen: { resource: "stammdaten", verb: "update" },
  aufgabeAnlegen: { resource: "pflueckaufgaben", verb: "create" },
  aufgabeStatusSetzen: { resource: "pflueckaufgaben", verb: "update" },
  kuehlmessungErfassen: { resource: "pflueckaufgaben", verb: "update" },
  reklamationAnlegen: { resource: "reklamationen", verb: "create" },
  lohnPeriodeBerechnen: { resource: "lohn", verb: "create" },
  mitarbeiterEinschalten: { resource: "ki_assistent", verb: "create" },
} as const satisfies Record<string, AktionsRecht>;

export type AktionsName = keyof typeof AKTIONS_RECHTE;

export const AKTIONS_NAMEN = Object.keys(AKTIONS_RECHTE) as AktionsName[];

export function istAktion(name: string): name is AktionsName {
  return name in AKTIONS_RECHTE;
}
