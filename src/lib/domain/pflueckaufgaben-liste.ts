import { z } from "zod";
import { hasPermission, type Role } from "@/lib/rbac";
import type { AufgabenStatus } from "@/lib/domain/pflueckaufgaben";
import { suchtextBereinigen } from "@/lib/listen/parameter";
import { istGueltigerTag, zeitraumStufen, type ZeitraumGrenzen } from "@/lib/listen/zeitraum";

// Liste und Detailansicht der Pflueckaufgaben (WMCNL-2488): was in der Adresse
// steht, was ein Filter bedeutet und wer was darf. Reine Regeln ohne
// Datenbank, damit Datenschicht, Demo-Modus und Tests dieselben benutzen.

export const PRO_SEITE = 20;

/**
 * Die Status-Pillen ueber der Liste. "zu-erledigen" fasst alles zusammen, was
 * noch nicht abgeschlossen ist - fuer die Leitung ist auch die Belegpruefung
 * noch Arbeit. "ueberfaellig" ist kein Status der Datenbank, sondern eine
 * Faelligkeit in der Vergangenheit, solange die Brigade noch pflueckt.
 */
export const statusFilter = [
  "alle",
  "zu-erledigen",
  "ueberfaellig",
  "belegpruefung",
  "abgeschlossen",
] as const;
export type StatusFilter = (typeof statusFilter)[number];

/**
 * Die Faelligkeit zaehlt, solange die Brigade noch pflueckt. In der
 * Belegpruefung hat sie geliefert, und abgeschlossen ist abgeschlossen: dort
 * ist nichts mehr ueberfaellig, und das Abzeichen entfaellt (entschieden am
 * 25.09.2026). Eine Quelle fuer Pille, Liste, Demo-Modus und Anzeige.
 */
export const faelligkeitZaehltBei = [
  "offen",
  "angenommen",
  "in_arbeit",
] as const satisfies readonly AufgabenStatus[];

export function faelligkeitZaehlt(status: AufgabenStatus): boolean {
  return (faelligkeitZaehltBei as readonly AufgabenStatus[]).includes(status);
}

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
  von: z.string().regex(DATUM).refine(istGueltigerTag).optional().catch(undefined),
  bis: z.string().regex(DATUM).refine(istGueltigerTag).optional().catch(undefined),
  seite: z.coerce.number().int().min(1).max(10_000).catch(1),
  aufgabe: z.string().regex(KENNUNG).optional().catch(undefined),
  reiter: z.enum(panelReiter).catch("uebersicht"),
});

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
        faelligkeitZaehlt(aufgabe.status) &&
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
    const muster = suchMuster(suche);
    if (![aufgabe.code, aufgabe.reihenblock, aufgabe.sorte].some((feld) => muster.test(feld))) {
      return false;
    }
  }
  return true;
}

/**
 * Die Suchregel, wie sie die Datenbankabfrage anwendet
 * (lib/data/pflueckaufgaben-liste.ts): jedes Feld fuer sich, ohne Ruecksicht
 * auf Gross- und Kleinschreibung, das Leerzeichen als Platzhalter. "T-N 01"
 * findet "T-N-A-01" - in der Datenbank wie im Demo-Modus.
 */
export function suchMuster(suche: string): RegExp {
  const teile = suche
    .split(" ")
    .filter(Boolean)
    .map((teil) => teil.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return new RegExp(teile.join(".*"), "i");
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
 * Darf diese Anmeldung die Aufgabe bearbeiten? Spiegelt die Datenbankregeln
 * (pflueckaufgaben_update_feld, steigen_insert_feld, media_belege_insert_feld):
 * die Brigade nur ihre eigenen und die ohne Zuordnung. Die Oberflaeche blendet
 * damit Knoepfe aus, die die Datenbank ablehnen wuerde; belegKern prueft
 * damit vor dem Upload. Das Recht an sich ("pflueckaufgaben:update") prueft
 * der Aufrufer.
 */
export function darfAufgabeBearbeiten(
  profil: { role: Role; brigadeId: string | null } | null | undefined,
  aufgabe: { brigadeId: string | null },
): boolean {
  if (!profil) return false;
  if (profil.role !== "brigade") return true;
  return aufgabe.brigadeId === null || aufgabe.brigadeId === profil.brigadeId;
}

type Profil = { role: Role; brigadeId: string | null; darfKontrollieren?: boolean };

/** Was eine Anmeldung auf der Seite darf - eine Stelle fuer alle Knoepfe. */
export interface PflueckRechte {
  /** Schreibende Rolle mit Datenbank: Formulare, Offline-Spiegel, Pflueckerliste. */
  bearbeiten: boolean;
  anlegen: boolean;
  /** Belegpruefung und Freigabe (pflueckaufgaben:approve). */
  abschliessen: boolean;
  /** Stichprobenkontrolle je Steige (Anforderung 2.10). */
  kontrollieren: boolean;
  /** Fuer die gewaehlte Aufgabe: bearbeiten, und sie ist eigen oder frei. */
  handeln: boolean;
  /** Bearbeiten duerfte sie, aber die Aufgabe gehoert einer anderen Brigade. */
  fremdeBrigade: boolean;
}

/**
 * Die Rechte der Seite. Geschrieben wird nur mit echter Datenbank (live):
 * bei Beispieldaten oder einem Rueckfall auf sie entfallen alle Formulare.
 * Die Kontrolle steht zusaetzlich dem Vorarbeiter am Sammelpunkt offen, der
 * die Rolle "brigade" traegt und damit kein approve hat - dieselbe Bedingung
 * prueft steigeKontrollieren() (lib/actions/nachweiskette.ts).
 */
export function pflueckRechte(
  profil: Profil | null | undefined,
  live: boolean,
  aufgabe: { brigadeId: string | null } | null = null,
): PflueckRechte {
  const rolle = profil?.role ?? null;
  const bearbeiten = live && hasPermission(rolle, "pflueckaufgaben", "update");
  const abschliessen = live && hasPermission(rolle, "pflueckaufgaben", "approve");
  const handeln = Boolean(aufgabe && bearbeiten && darfAufgabeBearbeiten(profil, aufgabe));
  return {
    bearbeiten,
    anlegen: live && hasPermission(rolle, "pflueckaufgaben", "create"),
    abschliessen,
    kontrollieren: live && (abschliessen || profil?.darfKontrollieren === true),
    handeln,
    fremdeBrigade: Boolean(aufgabe && bearbeiten && !handeln),
  };
}

/**
 * Wessen Aufgaben und Pfluecker eine Anmeldung zum Schreiben laedt: null
 * heisst alle (Leitung, Administration), sonst die eigene Brigade samt der
 * Aufgaben ohne Zuordnung. Eine Brigade-Anmeldung ohne Zuordnung bekommt nur
 * die freien Aufgaben und keine Pfluecker - vorher stand dann die ganze
 * Pflueckerliste samt Ausweisnummern im Offline-Speicher.
 */
export function schreibUmfang(profil: Profil | null | undefined): { brigadeId: string | null } | null {
  if (profil?.role !== "brigade") return null;
  return { brigadeId: profil.brigadeId };
}

// Spiegel von media_belege_select_feld (20260905160000_haerten.sql). has_role
// zaehlt den CEO dort als admin, hier steht er ausdruecklich.
const BELEGE_LESEN: readonly Role[] = ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade"];

/**
 * Darf die Rolle Fotobelege sehen? Sonst liefert die Datenbank keine, und die
 * Oberflaeche zeigte "0 Fotos" oder "keine Belege", wo es in Wahrheit welche
 * gibt. Ohne Leserecht entfallen Fotoangaben und der Reiter ganz.
 */
export function darfBelegeSehen(rolle: Role | null | undefined): boolean {
  return rolle !== null && rolle !== undefined && BELEGE_LESEN.includes(rolle);
}

/** Fortschritt in Prozent, Ist gegen Ziel, auf 0 bis 100 begrenzt. */
export function fortschrittProzent(ist: number, ziel: number): number {
  if (!(ziel > 0)) return 0;
  return Math.max(0, Math.min(100, Math.round((ist / ziel) * 100)));
}
