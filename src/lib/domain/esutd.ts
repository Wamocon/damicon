import { istGueltigerTag } from "@/lib/listen/zeitraum";

// Meldeprozess fuer das Einheitssystem ЕСУТД, Stufe 1 (WMCNL-1447). Reine Pruef- und Sortierregeln
// ohne Server-Import. Das System meldet nicht selbst: es fuehrt, was zu melden ist, was gemeldet
// ist und womit es belegt ist. Die Meldefristen berechnet die Datenbank aus den Einstellungen (esutd.frist_abschluss_tage, _aenderung_tage,
// _beendigung_tage; Grundlage: Erlass des Arbeitsministers Nr. 353 vom 03.09.2020): Abschluss in Arbeitstagen nach Unterschrift (sonst Vertragsbeginn),
// Aenderung in Kalendertagen, Beendigung in Arbeitstagen. Ist eine Einstellung nicht gesetzt, gibt es fuer diese Art keine Frist.

export const ESUTD_ARTEN = ["abschluss", "aenderung", "beendigung"] as const;
export type EsutdArt = (typeof ESUTD_ARTEN)[number];

export type EsutdMeldungStatus = "offen" | "erfasst";

export const BESCHREIBUNG_MIN_ZEICHEN = 3;
export const BESCHREIBUNG_MAX_ZEICHEN = 300;
export const BESTAETIGUNG_MAX_ZEICHEN = 100;
export const VERTRAGSNUMMER_MAX_ZEICHEN = 60;

export function istEsutdArt(wert: string): wert is EsutdArt {
  return (ESUTD_ARTEN as readonly string[]).includes(wert);
}

export interface EsutdMeldung {
  /** "vertrag": der Abschluss (esutd_vertraege), "ereignis": Aenderung oder Beendigung (esutd_ereignisse). */
  quelle: "vertrag" | "ereignis";
  id: string;
  pfluecker: string | null;
  ausweis: string | null;
  art: EsutdArt;
  /** Vertragsbeginn, Wirksamkeit der Aenderung oder Ende des Vertrags. */
  ereignisAm: string | null;
  beschreibung: string | null;
  vertragsnummer: string | null;
  status: EsutdMeldungStatus;
  erfasstAm: string | null;
  bestaetigung: string | null;
  belegDokumentId: string | null;
  /** Nur bei einer offenen Meldung, und nur wenn die Einstellung der Art gesetzt ist. */
  meldefristAm: string | null;
}

export const esutdTon = { offen: "warning", erfasst: "success" } as const satisfies Record<EsutdMeldungStatus, "warning" | "success">;

/** Offen und die Frist ist vor `heute` verstrichen. Der Tag der Frist selbst zaehlt noch. */
/**
 * Altbestand: eine Person gilt als "erfasst", obwohl im Meldeprozess kein Vertrag zu ihr steht. Der Status stammt dann aus der alten Erfassung (Handeingabe),
 * der Meldeprozess kann ihn weder bestaetigen noch nachziehen (esutd_status_abgleichen laesst Personen ohne Vertrag aus). Nur, wo die Verträge sichtbar
 * sind: wer sie nicht lesen darf, sieht sonst bei jeder Person "kein Vertrag".
 */
export function esutdAltbestand(e: { status: string; hatVertrag: boolean | undefined; vertraegeSichtbar: boolean }): boolean {
  return e.vertraegeSichtbar && e.hatVertrag === false && e.status === "erfasst";
}

export function meldungUeberfaellig(m: Pick<EsutdMeldung, "status" | "meldefristAm">, heute: string): boolean {
  return m.status === "offen" && m.meldefristAm !== null && m.meldefristAm < heute;
}

export interface MeldungenZaehlung {
  offen: number;
  ueberfaellig: number;
  erfasst: number;
}

export function zaehleMeldungen(meldungen: readonly EsutdMeldung[], heute: string): MeldungenZaehlung {
  const z: MeldungenZaehlung = { offen: 0, ueberfaellig: 0, erfasst: 0 };
  for (const m of meldungen) {
    if (m.status === "erfasst") z.erfasst += 1;
    else {
      z.offen += 1;
      if (meldungUeberfaellig(m, heute)) z.ueberfaellig += 1;
    }
  }
  return z;
}

/**
 * Offenes zuerst, darin das Dringende vorn: erst mit Frist (die fruehere zuerst), dann ohne Frist nach
 * Datum des Ereignisses. Erledigtes folgt, die juengste Meldung zuerst.
 */
export function sortiereMeldungen<T extends EsutdMeldung>(meldungen: readonly T[]): T[] {
  const spaet = "9999-12-31";
  return [...meldungen].sort((a, b) => {
    if (a.status !== b.status) return a.status === "offen" ? -1 : 1;
    if (a.status === "erfasst") return (b.erfasstAm ?? "").localeCompare(a.erfasstAm ?? "");
    const fa = a.meldefristAm ?? spaet;
    const fb = b.meldefristAm ?? spaet;
    if (fa !== fb) return fa.localeCompare(fb);
    return (a.ereignisAm ?? spaet).localeCompare(b.ereignisAm ?? spaet);
  });
}

// --- Eingaben ---------------------------------------------------------------------------------------------------------

export type EsutdFehler = "esutdDatum" | "esutdVertragsnummer" | "esutdBeschreibung" | "esutdBestaetigung";

export function esutdVertragFehler(a: { beginn: string; vertragsnummer: string; unterzeichnet?: string }, heute?: string): EsutdFehler | null {
  if (!istGueltigerTag(a.beginn)) return "esutdDatum";
  // Die Unterschrift ist freiwillig. Sie liegt nicht in der Zukunft: Ein Vertrag ist unterschrieben, bevor er gemeldet wird.
  if (a.unterzeichnet && (!istGueltigerTag(a.unterzeichnet) || (heute !== undefined && a.unterzeichnet > heute))) return "esutdDatum";
  if (a.vertragsnummer.trim().length > VERTRAGSNUMMER_MAX_ZEICHEN) return "esutdVertragsnummer";
  return null;
}

export function esutdEreignisFehler(a: { art: EsutdArt; ereignisAm: string; beschreibung: string }): EsutdFehler | null {
  if (!istGueltigerTag(a.ereignisAm)) return "esutdDatum";
  const beschreibung = a.beschreibung.trim();
  if (beschreibung.length > BESCHREIBUNG_MAX_ZEICHEN) return "esutdBeschreibung";
  // Eine Aenderung sagt, was sich aendert. Bei einer Beendigung ist der Grund freiwillig.
  if (a.art === "aenderung" && beschreibung.length < BESCHREIBUNG_MIN_ZEICHEN) return "esutdBeschreibung";
  if (a.art === "beendigung" && beschreibung.length > 0 && beschreibung.length < BESCHREIBUNG_MIN_ZEICHEN) return "esutdBeschreibung";
  return null;
}

/** Erledigt: das Meldedatum liegt nicht in der Zukunft, die Bestaetigung ist optional und kurz. */
export function esutdErfassenFehler(a: { erfasstAm: string; bestaetigung: string }, heute: string): EsutdFehler | null {
  if (!istGueltigerTag(a.erfasstAm) || a.erfasstAm > heute) return "esutdDatum";
  if (a.bestaetigung.trim().length > BESTAETIGUNG_MAX_ZEICHEN) return "esutdBestaetigung";
  return null;
}
