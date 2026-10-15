import type { Role } from "@/lib/rbac";

// Fachliche Einstellungen, in der Oberflaeche pflegbar (Migration 20261208030000, Entscheidung vom 15.10.2026): Fristen, Kapazitaeten und
// Richtwerte stehen nicht fest im Code. Diese Liste kennt jede Einstellung mit Standardwert, Grenzen und den Rollen, die sie aendern duerfen.
// Die Datenbank traegt dieselben Werte (betriebs_einstellungen.standard_wert, min_wert, max_wert, bearbeiter); ein Test haelt beide gleich.
//
// NICHT hier: Zugriffsrechte. Die bleiben in rbac.ts und in den Policies.

export type EinstellungTyp = "ganzzahl" | "dezimal" | "ja_nein" | "text";
export type EinstellungBereich = "steuer" | "arbeitsrecht" | "abholung" | "finanzen" | "auslieferung" | "sicherheit";

export interface EinstellungDef {
  schluessel: string;
  bereich: EinstellungBereich;
  typ: EinstellungTyp;
  /** Standardwert; null = nicht gesetzt, dann gilt keine Pruefung. */
  standard: number | null;
  einheit: string;
  min: number | null;
  max: number | null;
  /** Rollen ausser admin und ceo, die diese Einstellung aendern duerfen. */
  bearbeiter: readonly Role[];
}

const BUERO_FACH: readonly Role[] = ["buchhaltung"];
const ARBEITSRECHT: readonly Role[] = ["buchhaltung", "betriebsleitung"];

export const einstellungen = [
  { schluessel: "esf.frist_tage", bereich: "steuer", typ: "ganzzahl", standard: 15, einheit: "kalendertage", min: 1, max: 60, bearbeiter: BUERO_FACH },
  { schluessel: "esutd.frist_abschluss_tage", bereich: "arbeitsrecht", typ: "ganzzahl", standard: 5, einheit: "arbeitstage", min: 1, max: 60, bearbeiter: ARBEITSRECHT },
  { schluessel: "esutd.frist_aenderung_tage", bereich: "arbeitsrecht", typ: "ganzzahl", standard: 15, einheit: "kalendertage", min: 1, max: 90, bearbeiter: ARBEITSRECHT },
  { schluessel: "esutd.frist_beendigung_tage", bereich: "arbeitsrecht", typ: "ganzzahl", standard: 3, einheit: "arbeitstage", min: 1, max: 60, bearbeiter: ARBEITSRECHT },
  { schluessel: "abholung.fahrzeug_kapazitaet_kg", bereich: "abholung", typ: "dezimal", standard: null, einheit: "kg", min: 1, max: 100000, bearbeiter: ["betriebsleitung"] },
  { schluessel: "wirtschaftlichkeit.kalkulationszins_richtwert", bereich: "finanzen", typ: "dezimal", standard: 20, einheit: "prozent", min: 1, max: 60, bearbeiter: [] },
  { schluessel: "wirtschaftlichkeit.zins_sensitivitaet_niedrig", bereich: "finanzen", typ: "dezimal", standard: 16, einheit: "prozent", min: 1, max: 60, bearbeiter: [] },
  { schluessel: "wirtschaftlichkeit.zins_sensitivitaet_hoch", bereich: "finanzen", typ: "dezimal", standard: 24, einheit: "prozent", min: 1, max: 60, bearbeiter: [] },
  { schluessel: "auslieferung.zeitbudget_sekunden", bereich: "auslieferung", typ: "ganzzahl", standard: 40, einheit: "sekunden", min: 5, max: 55, bearbeiter: [] },
  { schluessel: "sicherheit.adresssuche_je_stunde", bereich: "sicherheit", typ: "ganzzahl", standard: 20, einheit: "anfragen_je_stunde", min: 1, max: 200, bearbeiter: [] },
] as const satisfies readonly EinstellungDef[];

export type EinstellungSchluessel = (typeof einstellungen)[number]["schluessel"];

export const bereiche: readonly EinstellungBereich[] = ["steuer", "arbeitsrecht", "abholung", "finanzen", "auslieferung", "sicherheit"];

export function einstellungDef(schluessel: string): EinstellungDef | undefined {
  return einstellungen.find((e) => e.schluessel === schluessel);
}

/** Standardwert einer Einstellung aus dem Code: der Rueckfall, wenn die Datenbank die Zeile nicht liefert. */
export function einstellungStandard(schluessel: EinstellungSchluessel): number | null {
  return einstellungDef(schluessel)?.standard ?? null;
}

/** Namensraum der Texte (Label, Beschreibung, Quelle): Punkt wird Unterstrich, weil der Punkt in next-intl trennt. */
export function einstellungTextSchluessel(schluessel: string): string {
  return schluessel.replace(/\./g, "_");
}

/** Darf diese Rolle die Einstellung aendern? admin und ceo immer, sonst die Rollen der Einstellung. */
export function darfEinstellungAendern(role: Role | null | undefined, def: EinstellungDef): boolean {
  if (!role) return false;
  return role === "admin" || role === "ceo" || def.bearbeiter.includes(role);
}

export type EinstellungFehler = "eingabe" | "einstellungGrenzen" | "einstellungGanzzahl";

/**
 * Prueft die Eingabe eines Formularfelds gegen Typ und Grenzen. Leer heisst "nicht gesetzt" (null). Dezimalkomma ist erlaubt.
 * Liefert den Wert oder den Schluessel der Fehlermeldung.
 */
export function pruefeEinstellungEingabe(def: EinstellungDef, roh: string): { wert: number | null } | { fehler: EinstellungFehler } {
  const text = roh.trim().replace(",", ".");
  if (text === "") return { wert: null };
  if (!/^-?\d+(\.\d+)?$/.test(text)) return { fehler: "eingabe" };
  const wert = Number(text);
  if (!Number.isFinite(wert)) return { fehler: "eingabe" };
  if (def.typ === "ganzzahl" && !Number.isInteger(wert)) return { fehler: "einstellungGanzzahl" };
  if (def.typ === "ja_nein" && wert !== 0 && wert !== 1) return { fehler: "eingabe" };
  if ((def.min !== null && wert < def.min) || (def.max !== null && wert > def.max)) return { fehler: "einstellungGrenzen" };
  return { wert };
}
