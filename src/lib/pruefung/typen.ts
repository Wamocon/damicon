import type { Role } from "@/lib/rbac";
import type { Beleg } from "@/lib/wissen/suche";
import type { Pruefbereich } from "@/lib/pruefung/rollen";

export const SCHWEREN = ["kritisch", "hoch", "mittel", "niedrig", "keine"] as const;
export type Schwere = (typeof SCHWEREN)[number];

export const STATUS = ["verstoss", "luecke", "hinweis", "konform"] as const;
export type BefundStatus = (typeof STATUS)[number];

export const FRISTEN = ["sofort", "7 Tage", "30 Tage", "90 Tage"] as const;
export type Frist = (typeof FRISTEN)[number];

export interface Massnahme {
  schritt: string;
  verantwortlich: Role;
  frist: Frist;
}

/** Womit eine Aussage ueber den Betrieb belegt ist: der Rohwert aus der Datenbank, mit Pruefsumme. */
export interface Nachweis {
  quelle: string;
  /** Kurzform der Betriebsdaten (auf 600 Zeichen gekuerzt). */
  daten: string;
  /** SHA-256 der vollstaendigen Rohdaten zum Zeitpunkt der Pruefung. */
  hash: string;
}

export interface Befund {
  id: string;
  bereich: Pruefbereich;
  feld: string;
  titel: string;
  status: BefundStatus;
  schwere: Schwere;
  befund: string;
  /** Kennungen (S12 ...) der Rechtsquellen, die diesen Befund tragen. */
  belege: string[];
  nachweise: Nachweis[];
  massnahmen: Massnahme[];
  /** Verstoss oder Luecke ohne gueltigen Rechtsbeleg wurde zum Hinweis herabgestuft. */
  ohneRechtsbeleg?: boolean;
  /** Fuer dieses Pruefungsfeld liegen dieser Rolle keine Betriebsdaten vor. */
  ohneDaten?: boolean;
}

export interface Kennzahlen {
  anzahl: number;
  nachStatus: Record<BefundStatus, number>;
  nachSchwere: Record<Schwere, number>;
  /** 0 bis 100. Aus den Schweregraden der Verstoesse und Luecken, nicht aus dem Modell. */
  reife: number;
  stufe: "bereit" | "luecken" | "nicht-bereit";
  ohneRechtsbeleg: number;
  ohneDaten: number;
}

export interface MassnahmeMitBezug extends Massnahme {
  befundId: string;
  titel: string;
  schwere: Schwere;
}

/** Was sich bei einem Befund gegenueber dem vorigen automatischen CEO-Bericht veraendert hat (lib/pruefung/ceo-auto.ts). */
export interface BefundAenderung {
  befundId: string;
  titel: string;
  art: "neu" | "status_veraendert" | "schwere_veraendert";
  status: BefundStatus;
  schwere: Schwere;
  vorherStatus?: BefundStatus;
  vorherSchwere?: Schwere;
}

export interface Siegel {
  algorithmus: "SHA-256";
  wert: string;
}

export interface Bericht {
  id: string;
  erstelltAm: string;
  ersteller: { name: string; rolle: Role };
  bereiche: Pruefbereich[];
  abgelehnteBereiche: Pruefbereich[];
  modell: string;
  sprache: string;
  kennzahlen: Kennzahlen;
  zusammenfassung: string;
  prioritaeten: string[];
  befunde: Befund[];
  /** Alle zitierten Rechtsquellen, damit der Bericht ohne die Wissensbasis lesbar und pruefbar bleibt. */
  belege: Beleg[];
  massnahmen: MassnahmeMitBezug[];
  vollstaendig: boolean;
  hinweise: string[];
  siegel: Siegel;
}

// ---- Ereignisse des Stroms (eine JSON-Zeile je Ereignis) -----------------------------------
export interface FeldInfo {
  id: string;
  titel: string;
}

export type AgentPhase = "spawn" | "sammelt" | "denkt" | "fertig" | "fehler";

/** Der Weg eines Pruefungsfelds durch seine Mini-Himbis: start (Feld-Agent), fakten (Sammler fertig), recht (Jurist fertig),
 *  denkt (Uebergabe an den Pruefer), bewertet (Befund liegt vor). */
export type FeldPhase = "start" | "fakten" | "recht" | "denkt" | "bewertet";

export type Ereignis =
  | { t: "start"; id: string; rolle: Role; agenten: Array<{ bereich: Pruefbereich; felder: FeldInfo[] }>; abgelehnt: Pruefbereich[] }
  | { t: "agent"; bereich: Pruefbereich; phase: AgentPhase; text?: string }
  | { t: "feld"; bereich: Pruefbereich; feld: string; phase: FeldPhase; anzahl?: number; text?: string }
  | { t: "befund"; befund: Befund }
  | { t: "synthese"; phase: "start" | "fertig" }
  // aenderungen nur gesetzt vom automatischen CEO-Lauf (app/api/ki-pruefung/auto):
  // was sich gegenueber dem vorigen automatischen Bericht veraendert hat, leer bei
  // einem manuellen Lauf ueber app/api/ki-pruefung (dort undefined).
  | { t: "bericht"; bericht: Bericht; protokolliert: boolean; aenderungen?: BefundAenderung[] }
  | { t: "fehler"; text: string };
