// Wer darf welches Wissen sehen? Die Filterung passiert in der Suche (payload.rollen),
// serverseitig aus der Sitzung - das Modell kann sie weder setzen noch umgehen.
// Ausgeschlossene Chunks kommen gar nicht erst in den Kontext ("Sicherheit durch
// Abwesenheit"), statt dem Modell per Prompt etwas zu verbieten.
//
// Standard: Recht, Steuer und Audit gehoeren zu Buero-Themen. Kunde, Brigade,
// Pfluecker und Erzeuger bekommen sie nicht, solange sie nicht ausdruecklich
// freigegeben werden (Eintrag hier, danach neu einlesen).

import type { Role } from "@/lib/rbac";

export const BUERO_ROLLEN: Role[] = ["admin", "ceo", "betriebsleitung", "buchhaltung"];

export function rollenFuerBereich(bereich: string): Role[] {
  void bereich; // Platzhalter: hier koennen einzelne Bereiche spaeter weitere Rollen bekommen.
  return BUERO_ROLLEN;
}
