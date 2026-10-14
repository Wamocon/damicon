// Nachrichten je Vorbestellung (WMCNL-1472): die Eingabepruefung vor dem Schreiben.
// Die Datenbank prueft dieselbe Grenze (Check auf vorbestellung_nachrichten.text) und
// setzt Autor und Zeitpunkt selbst.

export const NACHRICHT_MAX_ZEICHEN = 2000;

/** Warum ein Text abgelehnt wird; der Schluessel ist ein Text unter "aktionen.fehler". */
export type NachrichtFehler = "eingabe" | "nachrichtZuLang";

export function nachrichtFehler(roh: string): NachrichtFehler | null {
  const text = roh.trim();
  if (text.length === 0) return "eingabe";
  // Zeichen zaehlen wie Postgres (char_length): ein Zeichen ist ein Codepunkt, nicht eine UTF-16-Einheit.
  if ([...text].length > NACHRICHT_MAX_ZEICHEN) return "nachrichtZuLang";
  return null;
}

export interface NachrichtZeile {
  id: string;
  vorbestellungId: string;
  autor: string;
  rolle: string;
  text: string;
  erstelltAm: string;
}

/** Fasst Nachrichten nach Vorbestellung zusammen, jeweils aelteste zuerst. */
export function jeVorbestellung(zeilen: readonly NachrichtZeile[]): Record<string, NachrichtZeile[]> {
  const gruppen: Record<string, NachrichtZeile[]> = {};
  for (const z of [...zeilen].sort((a, b) => (a.erstelltAm === b.erstelltAm ? a.id.localeCompare(b.id) : a.erstelltAm.localeCompare(b.erstelltAm)))) {
    (gruppen[z.vorbestellungId] ??= []).push(z);
  }
  return gruppen;
}
