import type { Role } from "@/lib/rbac";

// Was in der rechten Haelfte der Begruessungskarte steht - je Rolle etwas anderes.
//
// Auftrag vom 23.09.2026: die Begruessungskarte trug vier Informationseinheiten und keine
// einzige Zahl, die rechte Haelfte war verschenkter Platz. Jetzt steht dort die eine Zahl,
// mit der diese Rolle den Tag beginnt.
//
// Rein und ohne React, damit die Zuordnung ohne Datenbank pruefbar ist - dasselbe Muster wie
// reiterFuer() nebenan.

export const STARTKARTEN = ["finanzen", "pflueckaufgaben", "lohn", "lieferung"] as const;
export type Startkarte = (typeof STARTKARTEN)[number];

const ZUORDNUNG: Partial<Record<Role, Startkarte>> = {
  admin: "finanzen",
  ceo: "finanzen",
  betriebsleitung: "finanzen",
  buchhaltung: "finanzen",
  brigade: "pflueckaufgaben",
  picker: "lohn",
  kunde: "lieferung",
  // erzeuger fehlt bewusst. Die Rechtematrix gibt ihm zwar finanzen:view, aber das sind die
  // Nachbarbetriebe im Zukauf - ein externer Zulieferer soll den Gesamtdeckungsbeitrag des
  // Betriebs nicht als erste Zahl auf seiner Startseite lesen. Entscheidung vom 23.09.2026.
  // Ob finanzen:view fuer ihn ueberhaupt richtig ist, gehoert getrennt geprueft; bis dahin
  // faellt hier nur die Karte weg, nicht das Recht.
};

/** null: diese Rolle bekommt keine Zahl, die Begruessung nimmt die volle Breite. */
export function startkarteFuer(rolle: Role | null | undefined): Startkarte | null {
  return rolle ? (ZUORDNUNG[rolle] ?? null) : null;
}
