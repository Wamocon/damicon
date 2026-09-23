import type { Role } from "@/lib/rbac";

// Wer darf welche Pruefung ausloesen? Eine Compliance-Pruefung legt offen, wo der Betrieb gegen
// Recht und Steuerpflichten verstoesst. Das ist nichts, was jeder Mitarbeiter ausloesen oder lesen
// soll. Die Zuordnung ist bewusst eng und wird auf dem SERVER erzwungen (route.ts), nicht nur in
// der Oberflaeche versteckt:
//
//   Administration   alle vier Bereiche (Vollpruefung)
//   Buchhaltung      Audit und Steuer (die Bereiche, fuer die sie ohnehin die Belege fuehrt)
//   Betriebsleitung  Recht und Risiko (Arbeits- und Datenschutzrecht, operative Risiken)
//   alle anderen     keine Pruefung (Brigade, Pfluecker, Erzeuger, Kunde)
//
// Die Betriebsdaten, aus denen die Pruefung ihre Fakten holt, sind zusaetzlich auf die Rolle
// zugeschnitten (die Lesewerkzeuge werden nur angeboten, wenn die Rolle sie nutzen darf).

export const PRUEFBEREICHE = ["audit", "steuer", "recht", "risiko"] as const;
export type Pruefbereich = (typeof PRUEFBEREICHE)[number];

const ZUGANG: Partial<Record<Role, readonly Pruefbereich[]>> = {
  admin: PRUEFBEREICHE,
  ceo: PRUEFBEREICHE,
  buchhaltung: ["audit", "steuer"],
  betriebsleitung: ["recht", "risiko"],
};

export function erlaubteBereiche(rolle: Role | null | undefined): Pruefbereich[] {
  return rolle ? [...(ZUGANG[rolle] ?? [])] : [];
}

export function darfPruefen(rolle: Role | null | undefined): boolean {
  return erlaubteBereiche(rolle).length > 0;
}

// ---- Der automatische Bericht auf der Uebersichtsseite -----------------------------------------
//
// Die Frage "darf diese Rolle den automatischen Compliance-Bericht?" stand bis zum 23.09.2026 an
// fuenf Stellen woertlich als `role !== "ceo"`: api/ki-pruefung/auto/route.ts, ceo-auto.ts,
// actions/compliance-ceo.ts, ceo-pruefung-kontext.tsx und dashboard/page.tsx. Alle fuenf muessen
// dieselbe Antwort geben, sonst sieht jemand einen Knopf, den der Server danach ablehnt.
//
// Lesen und Ausloesen sind bewusst zwei Funktionen, obwohl sie heute dieselbe Liste tragen: die
// Policies in der Datenbank trennen sie auch (SELECT has_role('ceo','admin'), INSERT
// has_role('admin') seit 20261110000000_ceo_bericht_admin.sql). Darf spaeter die Buchhaltung
// mitlesen, ohne einen Lauf bezahlen zu koennen, wird genau eine dieser beiden Zeilen laenger.

const BERICHT_LESEN: readonly Role[] = ["admin", "ceo"];
const BERICHT_AUSLOESEN: readonly Role[] = ["admin", "ceo"];

/** Darf diese Rolle den gespeicherten Bericht auf der Uebersichtsseite sehen? Spiegelt die SELECT-Policy. */
export function darfCeoBerichtLesen(rolle: Role | null | undefined): boolean {
  return rolle ? BERICHT_LESEN.includes(rolle) : false;
}

/** Darf diese Rolle einen Lauf starten - Knopf und automatischer Lauf beim Login? Spiegelt die INSERT-Policy. */
export function darfCeoBericht(rolle: Role | null | undefined): boolean {
  return rolle ? BERICHT_AUSLOESEN.includes(rolle) : false;
}

export interface Bereichswahl {
  /** Bereiche, die laufen. */
  erlaubt: Pruefbereich[];
  /** Angefragt, aber fuer diese Rolle nicht freigegeben: wird NICHT ausgefuehrt und im Bericht genannt. */
  abgelehnt: Pruefbereich[];
  /** Keine bekannten Bereiche (Tippfehler, Manipulation). */
  unbekannt: string[];
}

/** Schneidet die Anfrage auf das, was die Rolle darf. Ohne Angabe: alle erlaubten Bereiche. */
export function waehleBereiche(rolle: Role | null | undefined, angefragt: unknown): Bereichswahl {
  const frei = erlaubteBereiche(rolle);
  const roh = Array.isArray(angefragt) ? angefragt : [];
  const bekannt = new Set<string>(PRUEFBEREICHE);
  const gewollt = [...new Set(roh.filter((b): b is string => typeof b === "string"))];
  const unbekannt = gewollt.filter((b) => !bekannt.has(b));
  const gueltig = gewollt.filter((b): b is Pruefbereich => bekannt.has(b));
  if (gueltig.length === 0) return { erlaubt: frei, abgelehnt: [], unbekannt };
  return {
    erlaubt: gueltig.filter((b) => frei.includes(b)),
    abgelehnt: gueltig.filter((b) => !frei.includes(b)),
    unbekannt,
  };
}
