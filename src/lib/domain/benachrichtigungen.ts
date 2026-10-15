// Benachrichtigungen der Glocke (WMCNL-2486, Migration 20261208150000). Reine Typen und Regeln, ohne Datenbank: welche Arten es gibt, wie die Parameter eines
// Hinweises gelesen werden und wie die Oberflaeche zaehlt. Die Texte stehen in den Sprachdateien, die Erzeugung in der Datenbank.

export const BENACHRICHTIGUNG_ARTEN = ["nachweis_abgelaufen", "nachweis_laeuft_ab", "esf_ueberfaellig", "esutd_ueberfaellig", "block_risiko_hoch"] as const;
export type BenachrichtigungArt = (typeof BENACHRICHTIGUNG_ARTEN)[number];

export function istBenachrichtigungArt(wert: unknown): wert is BenachrichtigungArt {
  return typeof wert === "string" && (BENACHRICHTIGUNG_ARTEN as readonly string[]).includes(wert);
}

/** Rot fuer das, was schon verletzt ist, gelb fuer das, was droht. */
export const benachrichtigungTon = {
  nachweis_abgelaufen: "danger",
  nachweis_laeuft_ab: "warning",
  esf_ueberfaellig: "danger",
  esutd_ueberfaellig: "danger",
  block_risiko_hoch: "warning",
} as const satisfies Record<BenachrichtigungArt, "danger" | "warning">;

export interface BenachrichtigungParameter {
  name?: string;
  anzahl?: number;
}

export interface BenachrichtigungEintrag {
  id: string;
  art: BenachrichtigungArt;
  /** Schluessel des Moduls (src/lib/modules.ts), in dem der Hinweis bearbeitet wird. */
  modul: string;
  parameter: BenachrichtigungParameter;
  erstelltAm: string;
  gelesen: boolean;
}

/** Wie oft die Glocke nachfragt, solange die Seite offen und sichtbar ist. */
export const ABRUF_INTERVALL_MS = 5 * 60_000;
/** So viele Hinweise zeigt das Fenster hoechstens. */
export const ANZEIGE_MAX = 50;

const NAME_MAX = 120;

/** Die Parameter eines Hinweises aus dem JSON der Datenbank, defensiv: nur ein kurzer Name und eine ganze Zahl; alles andere faellt weg. */
export function leseParameter(roh: unknown): BenachrichtigungParameter {
  if (typeof roh !== "object" || roh === null || Array.isArray(roh)) return {};
  const o = roh as Record<string, unknown>;
  const aus: BenachrichtigungParameter = {};
  if (typeof o.name === "string" && o.name.trim() !== "") aus.name = [...o.name.trim()].slice(0, NAME_MAX).join("");
  if (typeof o.anzahl === "number" && Number.isInteger(o.anzahl) && o.anzahl >= 0 && o.anzahl <= 1_000_000) aus.anzahl = o.anzahl;
  return aus;
}

/** Die Zahl auf der Glocke: bis 99 genau, darueber "99+". */
export function plakatZahl(ungelesen: number): string {
  return ungelesen > 99 ? "99+" : String(Math.max(0, Math.trunc(ungelesen)));
}
