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
  /** Startwert der Migration; fehlt ohne Datenbank oder vor der Migration 20261208100000. */
  standard: number | null;
}

/** Die vierzehn Parameter in der Reihenfolge der Oberflaeche: Gewichte, Grenzen der Faktoren, Zeitfenster, Schwellen. */
export const RISIKO_PARAMETER = [
  "gewicht_ueberfaellig",
  "gewicht_sperre",
  "gewicht_ausschuss",
  "gewicht_kuehlkette",
  "gewicht_erfassung",
  "intervall_max_tage",
  "ausschuss_ziel_prozent",
  "ausschuss_kritisch_prozent",
  "kuehl_verstoesse_voll",
  "sperre_durchgaenge_voll",
  "betrachtung_tage",
  "aktiv_tage",
  "schwelle_hoch",
  "schwelle_mittel",
] as const;
export type RisikoParameterSchluessel = (typeof RISIKO_PARAMETER)[number];

/** Die Gruppen der Oberflaeche (Namen sind Textschluessel unter einstellungen.risiko.gruppe). */
export const RISIKO_PARAMETER_GRUPPEN: ReadonlyArray<{ name: "gewichte" | "faktoren" | "zeitfenster" | "schwellen"; schluessel: readonly RisikoParameterSchluessel[] }> = [
  { name: "gewichte", schluessel: ["gewicht_ueberfaellig", "gewicht_sperre", "gewicht_ausschuss", "gewicht_kuehlkette", "gewicht_erfassung"] },
  { name: "faktoren", schluessel: ["intervall_max_tage", "ausschuss_ziel_prozent", "ausschuss_kritisch_prozent", "kuehl_verstoesse_voll", "sperre_durchgaenge_voll"] },
  { name: "zeitfenster", schluessel: ["betrachtung_tage", "aktiv_tage"] },
  { name: "schwellen", schluessel: ["schwelle_hoch", "schwelle_mittel"] },
];

export interface RisikoGrenze {
  min: number;
  max: number;
  ganzzahl: boolean;
}

/** Erlaubter Bereich je Parameter. Derselbe Satz steht in der Datenbank (risiko_parameter_grenzen); ein Test haelt beide gleich. */
export const RISIKO_GRENZEN: Record<RisikoParameterSchluessel, RisikoGrenze> = {
  gewicht_ueberfaellig: { min: 0, max: 100, ganzzahl: false },
  gewicht_sperre: { min: 0, max: 100, ganzzahl: false },
  gewicht_ausschuss: { min: 0, max: 100, ganzzahl: false },
  gewicht_kuehlkette: { min: 0, max: 100, ganzzahl: false },
  gewicht_erfassung: { min: 0, max: 100, ganzzahl: false },
  intervall_max_tage: { min: 1, max: 30, ganzzahl: true },
  ausschuss_ziel_prozent: { min: 0, max: 100, ganzzahl: false },
  ausschuss_kritisch_prozent: { min: 0, max: 100, ganzzahl: false },
  kuehl_verstoesse_voll: { min: 1, max: 50, ganzzahl: true },
  sperre_durchgaenge_voll: { min: 1, max: 20, ganzzahl: true },
  betrachtung_tage: { min: 1, max: 90, ganzzahl: true },
  aktiv_tage: { min: 1, max: 365, ganzzahl: true },
  schwelle_hoch: { min: 0, max: 100, ganzzahl: false },
  schwelle_mittel: { min: 0, max: 100, ganzzahl: false },
};

export function istRisikoParameter(wert: unknown): wert is RisikoParameterSchluessel {
  return typeof wert === "string" && (RISIKO_PARAMETER as readonly string[]).includes(wert);
}

export type RisikoEingabeFehler = "eingabe" | "einstellungGanzzahl" | "einstellungGrenzen" | "risikoSchwellen" | "risikoAusschuss" | "risikoGewichte";

/**
 * Prueft einen neuen Wert gegen den Bereich des Parameters und gegen die Werte der uebrigen (Reihenfolge der Schwellen, Gewichte nicht alle null).
 * Dezimalkomma ist erlaubt, leer ist keine Eingabe: ein Parameter hat immer einen Wert.
 */
export function pruefeRisikoEingabe(
  schluessel: RisikoParameterSchluessel,
  roh: string,
  aktuell: ReadonlyArray<Pick<RisikoParameter, "schluessel" | "wert">>,
): { wert: number } | { fehler: RisikoEingabeFehler } {
  const text = roh.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(text)) return { fehler: "eingabe" };
  const wert = Number(text);
  if (!Number.isFinite(wert)) return { fehler: "eingabe" };
  const g = RISIKO_GRENZEN[schluessel];
  if (g.ganzzahl && !Number.isInteger(wert)) return { fehler: "einstellungGanzzahl" };
  if (wert < g.min || wert > g.max) return { fehler: "einstellungGrenzen" };

  const mit = (s: string): number => (s === schluessel ? wert : parameterWert(aktuell, s));
  if (mit("schwelle_hoch") <= mit("schwelle_mittel")) return { fehler: "risikoSchwellen" };
  if (mit("ausschuss_kritisch_prozent") <= mit("ausschuss_ziel_prozent")) return { fehler: "risikoAusschuss" };
  if (RISIKO_PARAMETER.filter((s) => s.startsWith("gewicht_")).reduce((summe, s) => summe + mit(s), 0) <= 0) return { fehler: "risikoGewichte" };
  return { wert };
}

/** Wer die Parameter aendern darf: Administration und Geschaeftsfuehrung (Policy und Funktion in der Datenbank). */
export const darfRisikoParameterAendern = (rolle: string | null | undefined): boolean => rolle === "admin" || rolle === "ceo";

/** Der Schluessel des Gewichts eines Faktors in risiko_parameter. */
export const gewichtSchluessel = (faktor: RisikoFaktor): string => `gewicht_${faktor}`;

export function istRisikoStufe(wert: unknown): wert is RisikoStufe {
  return typeof wert === "string" && (RISIKO_STUFEN as readonly string[]).includes(wert);
}

export function istRisikoHauptgrund(wert: unknown): wert is RisikoHauptgrund {
  return wert === "sperre_konflikt" || (typeof wert === "string" && (RISIKO_FAKTOREN as readonly string[]).includes(wert));
}

/** Ein Wert aus den Parametern, oder der Rueckfall, wenn der Schluessel fehlt. */
export function parameterWert(parameter: ReadonlyArray<Pick<RisikoParameter, "schluessel" | "wert">>, schluessel: string, rueckfall = 0): number {
  return parameter.find((p) => p.schluessel === schluessel)?.wert ?? rueckfall;
}

/** Zaehlung der Stufen fuer die Kopfzeile. */
export function risikoZaehlung(risiken: readonly Pick<BlockRisiko, "stufe">[]): Record<RisikoStufe, number> {
  const zaehler: Record<RisikoStufe, number> = { hoch: 0, mittel: 0, niedrig: 0 };
  for (const r of risiken) zaehler[r.stufe] += 1;
  return zaehler;
}
