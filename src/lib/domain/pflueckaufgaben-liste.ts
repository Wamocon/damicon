import { z } from "zod";
import type { Role } from "@/lib/rbac";
import type { AufgabenStatus } from "@/lib/domain/pflueckaufgaben";
import { suchtextBereinigen } from "@/lib/listen/parameter";
import { zeitraumStufen, type ZeitraumGrenzen } from "@/lib/listen/zeitraum";

// Liste und Detailansicht der Pflueckaufgaben (WMCNL-2488): was in der Adresse
// steht, was ein Filter bedeutet und wer eine Aufgabe bearbeiten darf. Reine
// Regeln ohne Datenbank, damit Datenschicht, Demo-Modus und Tests dieselben
// benutzen.

export const PRO_SEITE = 20;

/**
 * Die Status-Pillen ueber der Liste. "zu-erledigen" fasst alles zusammen, was
 * noch nicht abgeschlossen ist; "ueberfaellig" ist kein Status der Datenbank,
 * sondern eine Faelligkeit in der Vergangenheit bei offener Aufgabe.
 */
export const statusFilter = [
  "alle",
  "zu-erledigen",
  "ueberfaellig",
  "belegpruefung",
  "abgeschlossen",
] as const;
export type StatusFilter = (typeof statusFilter)[number];

/** Die Reiter der Detailansicht. */
export const panelReiter = ["uebersicht", "fotos", "kette"] as const;
export type PanelReiter = (typeof panelReiter)[number];

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
// Eine Datenbank-ID (UUID) oder im Demo-Modus der Aufgabencode.
const KENNUNG = /^[A-Za-z0-9-]{1,64}$/;

export const pflueckListenSchema = z.object({
  status: z.enum(statusFilter).catch("alle"),
  suche: z
    .string()
    .transform((wert) => suchtextBereinigen(wert))
    .catch(""),
  // Ohne Wert gilt der Standard der Rolle, siehe brigadeStandard().
  brigade: z
    .string()
    .regex(/^(alle|meine|ohne|[A-Za-z0-9-]{1,64})$/)
    .optional()
    .catch(undefined),
  zeitraum: z.enum(zeitraumStufen).catch("alle"),
  von: z.string().regex(DATUM).optional().catch(undefined),
  bis: z.string().regex(DATUM).optional().catch(undefined),
  seite: z.coerce.number().int().min(1).max(10_000).catch(1),
  aufgabe: z.string().regex(KENNUNG).optional().catch(undefined),
  reiter: z.enum(panelReiter).catch("uebersicht"),
});

export type PflueckListenWerte = z.output<typeof pflueckListenSchema>;

/** Diese Schluessel sind Filter: aendert sich einer, springt die Liste auf Seite 1. */
export const pflueckFilterSchluessel = ["status", "suche", "brigade", "zeitraum", "von", "bis"] as const;

/**
 * Die Brigade sieht zuerst ihre eigenen Aufgaben und die ohne Zuordnung - nur
 * die darf sie laut Datenbankregel ueberhaupt bearbeiten
 * (20261018000000_brigade_schreibumfang.sql). Alle anderen Rollen sehen alles.
 */
export function brigadeStandard(rolle: Role | null | undefined): string {
  return rolle === "brigade" ? "meine" : "alle";
}

/** Standardwerte fuer listenQuery(): was hier steht, faellt aus der Adresse. */
export function pflueckStandard(rolle: Role | null | undefined) {
  return {
    status: "alle",
    suche: "",
    brigade: brigadeStandard(rolle),
    zeitraum: "alle",
    seite: 1,
    reiter: "uebersicht",
  } as const;
}

export type BrigadeBedingung =
  | { art: "alle" }
  | { art: "ohne" }
  | { art: "eine"; id: string }
  | { art: "eigeneUndOhne"; id: string };

export function brigadeBedingung(
  wert: string,
  rolle: Role | null | undefined,
  eigeneBrigadeId: string | null | undefined,
): BrigadeBedingung {
  if (wert === "alle") return { art: "alle" };
  if (wert === "ohne") return { art: "ohne" };
  if (wert === "meine") {
    if (eigeneBrigadeId) return { art: "eigeneUndOhne", id: eigeneBrigadeId };
    // Eine Brigade-Anmeldung ohne zugeordnete Brigade darf nur Aufgaben ohne
    // Zuordnung bearbeiten; fuer alle anderen Rollen bedeutet "meine" nichts.
    return rolle === "brigade" ? { art: "ohne" } : { art: "alle" };
  }
  return { art: "eine", id: wert };
}

export interface AufgabenFilter {
  status: StatusFilter;
  suche: string;
  brigade: BrigadeBedingung;
  grenzen: ZeitraumGrenzen;
}

/** Die Felder, nach denen gefiltert und sortiert wird - fuer Demo-Modus und Tests. */
export interface FilterbareAufgabe {
  id: string;
  code: string;
  reihenblock: string;
  sorte: string;
  brigadeId: string | null;
  status: AufgabenStatus;
  faelligkeit: string | null;
  angelegt: string | null;
}

export function passtZuStatus(
  aufgabe: Pick<FilterbareAufgabe, "status" | "faelligkeit">,
  status: StatusFilter,
  jetzt: Date,
): boolean {
  switch (status) {
    case "alle":
      return true;
    case "zu-erledigen":
      return aufgabe.status !== "abgeschlossen";
    case "ueberfaellig":
      return (
        aufgabe.status !== "abgeschlossen" &&
        aufgabe.faelligkeit !== null &&
        new Date(aufgabe.faelligkeit).getTime() < jetzt.getTime()
      );
    case "belegpruefung":
      return aufgabe.status === "beleg_pruefung";
    case "abgeschlossen":
      return aufgabe.status === "abgeschlossen";
  }
}

/** Alles ausser dem Status - die Zaehler der Pillen rechnen damit. */
export function passtZuUebrigemFilter(
  aufgabe: FilterbareAufgabe,
  filter: Omit<AufgabenFilter, "status">,
): boolean {
  const { brigade, grenzen, suche } = filter;
  if (brigade.art === "ohne" && aufgabe.brigadeId !== null) return false;
  if (brigade.art === "eine" && aufgabe.brigadeId !== brigade.id) return false;
  if (
    brigade.art === "eigeneUndOhne" &&
    aufgabe.brigadeId !== null &&
    aufgabe.brigadeId !== brigade.id
  ) {
    return false;
  }
  if (grenzen.ab || grenzen.vor) {
    if (!aufgabe.faelligkeit) return false;
    const zeit = new Date(aufgabe.faelligkeit).getTime();
    if (grenzen.ab && zeit < new Date(grenzen.ab).getTime()) return false;
    if (grenzen.vor && zeit >= new Date(grenzen.vor).getTime()) return false;
  }
  if (suche) {
    const nadel = suche.toLocaleLowerCase("de");
    const heuhaufen = [aufgabe.code, aufgabe.reihenblock, aufgabe.sorte]
      .join(" ")
      .toLocaleLowerCase("de");
    if (!heuhaufen.includes(nadel)) return false;
  }
  return true;
}

/**
 * Sortierung der Liste: Faelligkeit, spaeteste zuerst. Aufgaben ohne
 * Faelligkeit sind seit dem Pflichtfeld nur noch Altbestand und stehen am
 * Ende, darunter die zuletzt angelegten zuerst. Die ID entscheidet zuletzt:
 * die Testdaten entstehen in einem Lauf mit gleichem Anlagezeitpunkt, ohne
 * Stichentscheid ueberlappten sich die Seiten.
 */
export function vergleicheAufgaben(a: FilterbareAufgabe, b: FilterbareAufgabe): number {
  if (a.faelligkeit !== b.faelligkeit) {
    if (a.faelligkeit === null) return 1;
    if (b.faelligkeit === null) return -1;
    return a.faelligkeit < b.faelligkeit ? 1 : -1;
  }
  if (a.angelegt !== b.angelegt) {
    if (a.angelegt === null) return 1;
    if (b.angelegt === null) return -1;
    return a.angelegt < b.angelegt ? 1 : -1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * Darf diese Anmeldung die Aufgabe bearbeiten? Spiegelt die Datenbankregel:
 * die Brigade nur ihre eigenen und die ohne Zuordnung. Ohne diese Pruefung
 * saehe sie bei fremden Aufgaben Knoepfe, die die Datenbank dann ablehnt.
 * Das Recht an sich ("pflueckaufgaben:update") prueft der Aufrufer.
 */
export function darfAufgabeBearbeiten(
  profil: { role: Role; brigadeId: string | null } | null | undefined,
  aufgabe: { brigadeId: string | null },
): boolean {
  if (!profil) return false;
  if (profil.role !== "brigade") return true;
  return aufgabe.brigadeId === null || aufgabe.brigadeId === profil.brigadeId;
}
