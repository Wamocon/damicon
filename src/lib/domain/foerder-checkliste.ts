// Checkliste je Foerderdossier (WMCNL-1448, Stufe 1): die Punkte, der Fortschritt und die
// Eingabepruefung. Rein, ohne Datenbank. Welche Unterlagen ein Programm verlangt, legt die
// Foerderstelle fest; das System fuehrt nur die Liste, die das Buero pflegt (siehe Kopf der
// Migration 20261207060000).

/** Die allgemeinen Vorschlaege. Ihre Beschriftung steht in den Sprachdateien, in der Datenbank nur der Schluessel. */
export const VORSCHLAG_PUNKTE = ["antragsformular", "identifikation", "kostenaufstellung", "flaechennachweis", "zahlungsbelege"] as const;
export type VorschlagPunkt = (typeof VORSCHLAG_PUNKTE)[number];

export const CHECKPUNKT_MAX_ZEICHEN = 200;

export interface Checkpunkt {
  id: string;
  dossierId: string;
  vorlageKey: VorschlagPunkt | null;
  bezeichnung: string | null;
  pflicht: boolean;
  fristAm: string | null;
  erledigtAm: string | null;
  reihenfolge: number;
}

export function istVorschlagPunkt(wert: unknown): wert is VorschlagPunkt {
  return typeof wert === "string" && (VORSCHLAG_PUNKTE as readonly string[]).includes(wert);
}

export interface ChecklistenStand {
  gesamt: number;
  erledigt: number;
  /** Pflichtpunkte, die noch offen sind. */
  pflichtOffen: number;
  /** Offene Punkte, deren Frist vor dem Stichtag liegt. */
  ueberfaellig: number;
  /** Alle Pflichtpunkte erledigt, und es gibt mindestens einen Punkt. */
  vollstaendig: boolean;
}

export function checklistenStand(punkte: readonly Checkpunkt[], heute: string): ChecklistenStand {
  const offen = punkte.filter((p) => p.erledigtAm === null);
  const pflichtOffen = offen.filter((p) => p.pflicht).length;
  return {
    gesamt: punkte.length,
    erledigt: punkte.length - offen.length,
    pflichtOffen,
    ueberfaellig: offen.filter((p) => p.fristAm !== null && p.fristAm < heute).length,
    vollstaendig: punkte.length > 0 && pflichtOffen === 0,
  };
}

/** Reihenfolge der Anzeige: offene vor erledigten, darin nach der eingegebenen Reihenfolge. */
export function sortiereCheckpunkte(punkte: readonly Checkpunkt[]): Checkpunkt[] {
  return [...punkte].sort((a, b) => {
    const offenA = a.erledigtAm === null ? 0 : 1;
    const offenB = b.erledigtAm === null ? 0 : 1;
    return offenA - offenB || a.reihenfolge - b.reihenfolge || a.id.localeCompare(b.id);
  });
}

/** Warum ein eigener Punkt abgelehnt wird; der Schluessel ist ein Text unter "aktionen.fehler". */
export type CheckpunktFehler = "eingabe" | "checkpunktZuLang";

export function checkpunktFehler(roh: string): CheckpunktFehler | null {
  const text = roh.trim();
  if (text.length === 0) return "eingabe";
  return [...text].length > CHECKPUNKT_MAX_ZEICHEN ? "checkpunktZuLang" : null;
}

/** Fortschritt in Prozent der erledigten Punkte, ganzzahlig; 0 ohne Punkte. */
export function fortschrittProzent(stand: Pick<ChecklistenStand, "gesamt" | "erledigt">): number {
  return stand.gesamt === 0 ? 0 : Math.round((100 * stand.erledigt) / stand.gesamt);
}
