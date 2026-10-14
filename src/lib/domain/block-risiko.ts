// Block-Risiko-Bewertung (WMCNL-1470): was die Sicht public.v_block_risiko liefert und wie die
// Oberflaeche es zeigt. Gerechnet wird in der Datenbank (Migration 20261207020000); hier stehen
// nur die Stufen, die Hauptgruende und die Zuordnung der Parameter zu den fuenf Faktoren.
//
// Die Gewichte, Grenzen und Schwellen kommen aus public.risiko_parameter und werden in der
// Oberflaeche mit angezeigt: wer einen Punktwert sieht, soll nachlesen koennen, wie er entsteht.

export const RISIKO_STUFEN = ["hoch", "mittel", "niedrig"] as const;
export type RisikoStufe = (typeof RISIKO_STUFEN)[number];

/** Die fuenf Faktoren in der Reihenfolge ihrer Schwere. */
export const RISIKO_FAKTOREN = ["ueberfaellig", "sperre", "ausschuss", "kuehlkette", "erfassung"] as const;
export type RisikoFaktor = (typeof RISIKO_FAKTOREN)[number];

/** Der Hauptgrund ist ein Faktor oder der Konflikt mit der Wartezeitsperre. */
export type RisikoHauptgrund = RisikoFaktor | "sperre_konflikt";

export const risikoTon = {
  hoch: "danger",
  mittel: "warning",
  niedrig: "success",
} as const satisfies Record<RisikoStufe, "danger" | "warning" | "success">;

export interface BlockRisiko {
  blockId: string;
  /** 0 bis 100. */
  punkte: number;
  stufe: RisikoStufe;
  hauptgrund: RisikoHauptgrund | null;
  /** Eine offene Aufgabe wird vor dem Ende der laufenden Wartezeitsperre faellig. */
  sperreKonflikt: boolean;
  /** Punkte je Faktor, so wie sie in den Wert eingehen. */
  beitraege: Record<RisikoFaktor, number>;
}

export interface RisikoParameter {
  schluessel: string;
  wert: number;
  einheit: string;
  begruendung: string;
}

/** Der Schluessel des Gewichts eines Faktors in risiko_parameter. */
export const gewichtSchluessel = (faktor: RisikoFaktor): string => `gewicht_${faktor}`;

export function istRisikoStufe(wert: unknown): wert is RisikoStufe {
  return typeof wert === "string" && (RISIKO_STUFEN as readonly string[]).includes(wert);
}

export function istRisikoHauptgrund(wert: unknown): wert is RisikoHauptgrund {
  return wert === "sperre_konflikt" || (typeof wert === "string" && (RISIKO_FAKTOREN as readonly string[]).includes(wert));
}

/** Ein Wert aus den Parametern, oder der Rueckfall, wenn der Schluessel fehlt. */
export function parameterWert(parameter: readonly RisikoParameter[], schluessel: string, rueckfall = 0): number {
  return parameter.find((p) => p.schluessel === schluessel)?.wert ?? rueckfall;
}

/** Zaehlung der Stufen fuer die Kopfzeile. */
export function risikoZaehlung(risiken: readonly Pick<BlockRisiko, "stufe">[]): Record<RisikoStufe, number> {
  const zaehler: Record<RisikoStufe, number> = { hoch: 0, mittel: 0, niedrig: 0 };
  for (const r of risiken) zaehler[r.stufe] += 1;
  return zaehler;
}
