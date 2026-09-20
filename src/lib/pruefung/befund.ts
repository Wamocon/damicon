import { z } from "zod";
import { roles } from "@/lib/rbac";
import type { Pruefbereich } from "@/lib/pruefung/rollen";
import {
  FRISTEN,
  SCHWEREN,
  STATUS,
  type Bericht,
  type Befund,
  type Kennzahlen,
  type Massnahme,
  type MassnahmeMitBezug,
  type Nachweis,
  type Schwere,
} from "@/lib/pruefung/typen";

// Alles, was aus einer Modellantwort eine belastbare Aussage macht. Reine Funktionen, ohne Modell,
// ohne Datenbank: Das Modell schlaegt einen Befund vor, hier wird entschieden, was davon gilt.
//
// Grundsatz "kein Beleg, keine Behauptung":
//   * Verstoss, Luecke oder "konform" gelten nur mit mindestens einer Rechtsquelle, die die
//     Wissenssuche FUER DIESES Pruefungsfeld geliefert hat. Erfundene Kennungen fallen weg.
//   * Ohne Betriebsdaten zu diesem Feld ist nur ein Hinweis moeglich. Eine Aussage ueber den
//     Betrieb ohne Daten waere geraten.
//   * Schweregrad und Massnahmen passen zum Status (ein Hinweis ist nie kritisch, "konform" hat keine Massnahmen).

export const befundEingabe = z.object({
  feld: z.string().min(1).max(40),
  status: z.enum(STATUS),
  schwere: z.enum(SCHWEREN),
  titel: z.string().min(3).max(140),
  befund: z.string().min(10).max(700),
  belege: z.array(z.string().max(8)).max(8).default([]),
  massnahmen: z
    .array(z.object({ schritt: z.string().min(3).max(240), verantwortlich: z.enum(roles), frist: z.enum(FRISTEN) }))
    .max(5)
    .default([]),
});
export type BefundEingabe = z.infer<typeof befundEingabe>;

const REIHE_SCHWERE: Record<Schwere, number> = { kritisch: 0, hoch: 1, mittel: 2, niedrig: 3, keine: 4 };
const REIHE_FRIST: Record<string, number> = { sofort: 0, "7 Tage": 1, "30 Tage": 2, "90 Tage": 3 };

export interface BefundKontext {
  id: string;
  bereich: Pruefbereich;
  /** Kennungen, die die Wissenssuche fuer dieses Feld geliefert hat. */
  gueltigeBelege: ReadonlySet<string>;
  nachweise: Nachweis[];
  hatDaten: boolean;
}

export function pruefeBefund(e: BefundEingabe, k: BefundKontext): Befund {
  let { status, schwere } = e;
  const belege = [...new Set(e.belege.map((b) => b.trim()))].filter((b) => k.gueltigeBelege.has(b));
  let ohneRechtsbeleg = false;
  let ohneDaten = false;
  let massnahmen: Massnahme[] = e.massnahmen;

  if (!k.hatDaten) {
    ohneDaten = true;
    status = "hinweis";
  }
  if ((status === "verstoss" || status === "luecke" || status === "konform") && belege.length === 0) {
    status = "hinweis";
    ohneRechtsbeleg = true;
  }
  if (status === "konform") {
    schwere = "keine";
    massnahmen = [];
  } else if (status === "hinweis") {
    if (schwere === "kritisch" || schwere === "hoch" || schwere === "keine") schwere = schwere === "keine" ? "niedrig" : "mittel";
  } else if (schwere === "keine") {
    schwere = "mittel";
  }
  return {
    id: k.id,
    bereich: k.bereich,
    feld: e.feld,
    titel: e.titel.trim(),
    status,
    schwere,
    befund: e.befund.trim(),
    belege,
    nachweise: k.nachweise,
    massnahmen,
    ...(ohneRechtsbeleg ? { ohneRechtsbeleg } : {}),
    ...(ohneDaten ? { ohneDaten } : {}),
  };
}

const ABZUG: Record<Schwere, number> = { kritisch: 25, hoch: 12, mittel: 5, niedrig: 2, keine: 0 };

/** Pruefungsreife 0 bis 100. Nur belegte Verstoesse und Luecken kosten Punkte, Hinweise kosten einen. */
export function kennzahlen(befunde: readonly Befund[]): Kennzahlen {
  const nachStatus = { verstoss: 0, luecke: 0, hinweis: 0, konform: 0 };
  const nachSchwere = { kritisch: 0, hoch: 0, mittel: 0, niedrig: 0, keine: 0 };
  let abzug = 0;
  for (const b of befunde) {
    nachStatus[b.status]++;
    nachSchwere[b.schwere]++;
    if (b.status === "verstoss" || b.status === "luecke") abzug += ABZUG[b.schwere];
    else if (b.status === "hinweis") abzug += 1;
  }
  const reife = Math.max(0, 100 - abzug);
  return {
    anzahl: befunde.length,
    nachStatus,
    nachSchwere,
    reife,
    stufe: reife >= 85 ? "bereit" : reife >= 60 ? "luecken" : "nicht-bereit",
    ohneRechtsbeleg: befunde.filter((b) => b.ohneRechtsbeleg).length,
    ohneDaten: befunde.filter((b) => b.ohneDaten).length,
  };
}

/** Alle Massnahmen, dringendste zuerst (erst Schwere des Befunds, dann Frist). */
export function massnahmenplan(befunde: readonly Befund[]): MassnahmeMitBezug[] {
  return befunde
    .flatMap((b) => b.massnahmen.map((m) => ({ ...m, befundId: b.id, titel: b.titel, schwere: b.schwere })))
    .sort((a, b) => REIHE_FRIST[a.frist]! - REIHE_FRIST[b.frist]! || REIHE_SCHWERE[a.schwere] - REIHE_SCHWERE[b.schwere]);
}

export function sortiereBefunde(befunde: readonly Befund[]): Befund[] {
  const rangStatus = { verstoss: 0, luecke: 1, hinweis: 2, konform: 3 } as const;
  return [...befunde].sort((a, b) => rangStatus[a.status] - rangStatus[b.status] || REIHE_SCHWERE[a.schwere] - REIHE_SCHWERE[b.schwere]);
}

// ---- Siegel ------------------------------------------------------------------------------------
/** Kanonische JSON-Form: Schluessel sortiert, keine undefined-Werte. Dieselbe Funktion laeuft im Browser fuer "Siegel pruefen". */
export function kanonisch(wert: unknown): string {
  if (wert === null || typeof wert !== "object") return JSON.stringify(wert) ?? "null";
  if (Array.isArray(wert)) return `[${wert.map(kanonisch).join(",")}]`;
  const o = wert as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${kanonisch(o[k])}`)
    .join(",")}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function siegelFuer(bericht: Omit<Bericht, "siegel">): Promise<Bericht["siegel"]> {
  return { algorithmus: "SHA-256", wert: await sha256Hex(kanonisch(bericht)) };
}

/** Stimmt das Siegel noch? Jede Aenderung an Befunden, Belegen oder Zahlen macht es ungueltig. */
export async function siegelGueltig(bericht: Bericht): Promise<boolean> {
  const { siegel, ...rest } = bericht;
  return siegel.algorithmus === "SHA-256" && siegel.wert === (await siegelFuer(rest)).wert;
}
