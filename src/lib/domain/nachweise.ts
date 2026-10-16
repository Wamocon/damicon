// Nachweisregister (WMCNL-1469): der Ablaufstatus eines Dokuments. Dieselbe
// Regel wie public.nachweis_status() in der Datenbank (Migration
// 20261207010000); supabase/tests/nachweisregister.mjs gleicht beide ab, damit
// sie nicht auseinanderlaufen. Hier steht sie fuer den Demo-Modus ohne
// Datenbank und fuer die Anzeige, die einen Stichtag braucht.
//
// Der Status folgt aus dem Datum, nicht aus einer Eingabe: ein Zertifikat,
// das gestern ablief, ist heute "abgelaufen", ohne dass jemand daran denken
// muss.

import { istGueltigerTag } from "@/lib/listen/zeitraum";
import { istUuid } from "@/lib/utils";

export const NACHWEIS_STATUS = ["gueltig", "laeuft_ab", "abgelaufen", "offen"] as const;
export type NachweisStatus = (typeof NACHWEIS_STATUS)[number];

/** So viele Tage vor dem Ende beginnt die Vorwarnung, wenn nichts anderes gesetzt ist. */
export const WARNUNG_TAGE_STANDARD = 60;
export const WARNUNG_TAGE_MIN = 1;
export const WARNUNG_TAGE_MAX = 365;

export interface NachweisZeitraum {
  gueltigVon: string | null;
  gueltigBis: string | null;
  unbefristet: boolean;
  warnungTage: number;
}

const TAG_MS = 86_400_000;

// Der Stichtag ist der Kalendertag in Almaty, so wie public.heute_almaty() ihn
// kennt: tagInZone(new Date()) aus domain/tageszeit.ts.

/** Tage zwischen zwei Kalendertagen "JJJJ-MM-TT", positiv wenn bis nach von liegt. */
export function tageZwischen(von: string, bis: string): number {
  return Math.round((Date.parse(`${bis}T00:00:00Z`) - Date.parse(`${von}T00:00:00Z`)) / TAG_MS);
}

/**
 * gueltig     im Zeitraum, mehr als warnungTage vor dem Ende (oder unbefristet)
 * laeuft_ab   endet in hoechstens warnungTage Tagen; der letzte Tag gilt noch
 * abgelaufen  das Ende liegt vor dem Stichtag
 * offen       kein Zeitraum erfasst, oder gueltigVon liegt noch in der Zukunft
 */
export function nachweisStatus(zeitraum: NachweisZeitraum, stichtag: string): NachweisStatus {
  const { gueltigVon, gueltigBis, unbefristet, warnungTage } = zeitraum;
  if (gueltigVon && gueltigVon > stichtag) return "offen";
  if (unbefristet) return "gueltig";
  if (!gueltigBis) return "offen";
  if (gueltigBis < stichtag) return "abgelaufen";
  if (tageZwischen(stichtag, gueltigBis) <= warnungTage) return "laeuft_ab";
  return "gueltig";
}

/** Tage bis zum Ende, negativ nach Ablauf; null ohne Enddatum oder bei unbefristeten Dokumenten. */
export function tageBisAblauf(zeitraum: NachweisZeitraum, stichtag: string): number | null {
  if (zeitraum.unbefristet || !zeitraum.gueltigBis) return null;
  return tageZwischen(stichtag, zeitraum.gueltigBis);
}

// --- Eingabe des Formulars ---------------------------------------------------

/** Nach welcher Regel eine Eingabe abgelehnt wird; der Schluessel ist ein Text unter "aktionen.fehler". */
export type ZeitraumFehler = "eingabe" | "zeitraum";

/**
 * Prueft Beginn, Ende und Befristung, so wie die Datenbank es mit den
 * Constraints dokumente_zeitraum_check und dokumente_unbefristet_check tut,
 * nur mit einer verstaendlichen Meldung statt eines rohen Fehlercodes.
 */
export function zeitraumFehler(z: {
  gueltigVon: string | null;
  gueltigBis: string | null;
  unbefristet: boolean;
}): ZeitraumFehler | null {
  if ((z.gueltigVon && !istGueltigerTag(z.gueltigVon)) || (z.gueltigBis && !istGueltigerTag(z.gueltigBis))) {
    return "eingabe";
  }
  if (z.unbefristet && z.gueltigBis) return "zeitraum";
  if (z.gueltigVon && z.gueltigBis && z.gueltigBis < z.gueltigVon) return "zeitraum";
  return null;
}

/** Vorwarnzeit aus dem Formular: leer gilt als Vorgabe, eine Zahl ausserhalb von 1 bis 365 oder ein Bruch als ungueltig (null). */
export function warnungTageAus(roh: string): number | null {
  if (roh.trim() === "") return WARNUNG_TAGE_STANDARD;
  const wert = Number(roh.trim());
  return Number.isInteger(wert) && wert >= WARNUNG_TAGE_MIN && wert <= WARNUNG_TAGE_MAX ? wert : null;
}

export type PartnerArt = "kunde" | "nachbar";

/** "kunde:<uuid>" oder "nachbar:<uuid>" aus dem Formular; leer heisst kein Partner, alles andere ist ungueltig (null). */
export function partnerAusWert(wert: string): { art: PartnerArt; id: string } | "keiner" | null {
  if (wert === "") return "keiner";
  const [art, id] = wert.split(":");
  if ((art === "kunde" || art === "nachbar") && id && istUuid(id)) return { art, id };
  return null;
}

export function istNachweisStatus(wert: unknown): wert is NachweisStatus {
  return typeof wert === "string" && (NACHWEIS_STATUS as readonly string[]).includes(wert);
}

/** Tonart der Statuspille: nur "abgelaufen" ist rot, "offen" ist eine Luecke und kein Alarm. */
export const nachweisTon = {
  gueltig: "success",
  laeuft_ab: "warning",
  abgelaufen: "danger",
  offen: "neutral",
} as const satisfies Record<NachweisStatus, "success" | "warning" | "danger" | "neutral">;

/** Was ein Dokument braucht, um in einer Versionskette zu stehen (v_dokumente: ersetzt_id, ersetzt_durch_id). */
export interface Versionierbar {
  id: string;
  ersetztId: string | null;
  ersetztDurchId: string | null;
}

/**
 * Ordnet die Dokumente nach Versionen (Migration 20261208120000). Aktuell ist, was keinen Nachfolger hat; zu jedem aktuellen Dokument gehoeren seine
 * frueheren Versionen, die neueste zuerst. Die Reihenfolge der aktuellen Dokumente bleibt die der Eingabe. Ein Nachfolger, der nicht in der Liste steht
 * (die Zeile ist fuer die Person nicht sichtbar), macht das Dokument nicht unsichtbar. Kreise und fehlende Glieder brechen die Kette ab.
 */
export function ordneVersionen<T extends Versionierbar>(zeilen: readonly T[]): { aktuell: T; vorversionen: T[] }[] {
  const nachId = new Map(zeilen.map((z) => [z.id, z]));
  return zeilen
    .filter((z) => z.ersetztDurchId === null || !nachId.has(z.ersetztDurchId))
    .map((aktuell) => {
      const vorversionen: T[] = [];
      const gesehen = new Set([aktuell.id]);
      let id = aktuell.ersetztId;
      while (id !== null && !gesehen.has(id)) {
        const vor = nachId.get(id);
        if (!vor) break;
        gesehen.add(id);
        vorversionen.push(vor);
        id = vor.ersetztId;
      }
      return { aktuell, vorversionen };
    });
}

/** Nur die aktuellen Versionen: das Register zaehlt und zeigt sie, ein ersetzter Nachweis schlaegt nicht mehr Alarm. */
export const aktuelleVersionen = <T extends Versionierbar>(zeilen: readonly T[]): T[] => ordneVersionen(zeilen).map((g) => g.aktuell);

/** Zaehlung fuer die Kopfzeile des Registers. */
export function nachweisZaehlung(status: readonly NachweisStatus[]): Record<NachweisStatus, number> {
  const zaehler: Record<NachweisStatus, number> = { gueltig: 0, laeuft_ab: 0, abgelaufen: 0, offen: 0 };
  for (const s of status) zaehler[s] += 1;
  return zaehler;
}

/** Ein Nachweis, der im Risiko-Radar auftaucht: abgelaufen oder bald ablaufend, mit Enddatum. */
export interface NachweisFrist {
  id: string;
  name: string;
  /** Letzter Gueltigkeitstag, "JJJJ-MM-TT". */
  gueltigBis: string;
  status: Extract<NachweisStatus, "laeuft_ab" | "abgelaufen">;
}

/** Wählt aus dem Register die Eintraege fuer das Radar. Offene Eintraege haben kein Datum und gehoeren nicht hinein. */
export function nachweisFristen(
  zeilen: readonly { id: string; name: string; gueltigBis: string | null; status: NachweisStatus }[],
): NachweisFrist[] {
  return zeilen.flatMap((z) =>
    z.gueltigBis && (z.status === "laeuft_ab" || z.status === "abgelaufen")
      ? [{ id: z.id, name: z.name, gueltigBis: z.gueltigBis, status: z.status }]
      : [],
  );
}
