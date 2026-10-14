import { moduleHref, modules, type ModuleDef } from "@/lib/modules";
import { hasPermission, type Role } from "@/lib/rbac";

// Stufe 2 der globalen Suche (WMCNL-1467): Datensaetze statt Seiten. Die
// Datenbankfunktion public.search_everything() liefert Treffer mit einem Typ
// und einer Id; hier steht, welches Modul zu welchem Typ gehoert, wer ihn sehen
// darf und wohin ein Treffer verlinkt. Rein, ohne React und ohne Datenbank,
// damit die Regeln im Test stehen (supabase/tests/suche-daten.ts).
//
// Zwei Linien der Verteidigung, wie ueberall: die Datenbank zeigt nur Zeilen,
// die die Zeilensicherheit der Tabelle erlaubt, und die Anwendung zeigt nur
// Typen, deren Modul die Rolle sehen darf. Ein Treffer auf eine Seite, die die
// Rolle nur mit Umleitung erreicht, waere ein Treffer ohne Nutzen.

/** Die Typen der Rueckgabe von search_everything(), in der Reihenfolge der Oberflaeche. */
export const DATEN_TYPEN = ["steige", "charge", "aufgabe", "pfluecker", "block", "dokument", "kunde"] as const;
export type DatenTyp = (typeof DATEN_TYPEN)[number];

export interface DatenTreffer {
  typ: DatenTyp;
  id: string;
  titel: string;
  untertitel: string | null;
}

/** Ab so vielen Zeichen sucht die Datenbank. Dieselbe Grenze steht in der SQL-Funktion. */
export const DATEN_AB = 2;
/** Laenger wird die Eingabe von der Funktion ohnehin gekuerzt. */
export const DATEN_BIS = 60;

// Welches Modul zeigt den Typ. Chargen und Steigen haben keine eigene Seite:
// die Charge lebt in der Nachweiskette einer Pflueckaufgabe, die Steige im
// QR-Modul. Kunden stehen in den Stammdaten.
const MODUL_JE_TYP: Record<DatenTyp, string> = {
  steige: "qr_steigen",
  charge: "pflueckaufgaben",
  aufgabe: "pflueckaufgaben",
  pfluecker: "personal",
  block: "reihenbloecke",
  dokument: "dokumente",
  kunde: "stammdaten",
};

export function istDatenTyp(wert: unknown): wert is DatenTyp {
  return typeof wert === "string" && (DATEN_TYPEN as readonly string[]).includes(wert);
}

export function modulFuerTyp(typ: DatenTyp): ModuleDef {
  const modul = modules.find((m) => m.key === MODUL_JE_TYP[typ]);
  if (!modul) throw new Error(`Kein Modul fuer den Suchtyp "${typ}"`);
  return modul;
}

/** Darf die Rolle Datensaetze dieses Typs sehen? Dieselbe Regel wie die Modulseite. */
export function darfTypSehen(typ: DatenTyp, rolle: Role | null | undefined): boolean {
  return hasPermission(rolle, modulFuerTyp(typ).resource, "view");
}

/**
 * Wohin ein Treffer fuehrt. Pflueckaufgaben haben eine Detailansicht in der
 * Adresse (?aufgabe=<Code>, lib/domain/pflueckaufgaben-liste.ts), alle anderen
 * Treffer fuehren auf die Seite ihres Moduls: ein Treffer, der nur zu einer
 * Liste fuehrt, sagt das im Untertitel mit, damit man ihn dort wiederfindet.
 */
export function datenTrefferHref(treffer: DatenTreffer): string {
  const basis = moduleHref(modulFuerTyp(treffer.typ));
  return treffer.typ === "aufgabe" ? `${basis}?aufgabe=${encodeURIComponent(treffer.titel)}` : basis;
}

/** Bereinigt die Eingabe wie die Funktion: Leerraum an den Enden weg, hoechstens DATEN_BIS Zeichen. */
export function datenBegriff(roh: string): string {
  return roh.trim().slice(0, DATEN_BIS);
}

/** Ein Treffer aus der Rueckgabe der Funktion, oder null bei einem unbekannten Typ oder fehlenden Feldern. */
export function trefferAusZeile(zeile: {
  treffer_typ: string;
  treffer_id: string;
  treffer_titel: string;
  treffer_untertitel: string | null;
}): DatenTreffer | null {
  if (!istDatenTyp(zeile.treffer_typ) || !zeile.treffer_id || !zeile.treffer_titel) return null;
  return {
    typ: zeile.treffer_typ,
    id: zeile.treffer_id,
    titel: zeile.treffer_titel,
    untertitel: zeile.treffer_untertitel,
  };
}

/** Das Ergebnis einer Datensuche zu genau einem Begriff, so wie die Oberflaeche es haelt. */
export interface DatenStand {
  begriff: string;
  treffer: readonly DatenTreffer[];
}
