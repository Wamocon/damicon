import type { z } from "zod";

// Zustand einer Liste in der Adresszeile: Filter, Seite, gewaehlter Eintrag,
// Reiter der Detailansicht. Gebaut fuer die Pflueckaufgaben (WMCNL-2488) und
// fuer die Module, die das Muster "Liste mit Detailansicht" danach uebernehmen
// (Reklamationen, WMCNL-2489; Filter und Blaettern, WMCNL-2491).
//
// Warum in der Adresse und nicht im React-Zustand: Die Seite bleibt eine Server
// Component, ein Link auf eine gefilterte Liste oder eine geoeffnete Aufgabe
// ist teilbar, der Zurueck-Knopf wirkt, und ohne JavaScript bleibt alles
// bedienbar (DESIGN.md Regel 6). Dasselbe Vorgehen wie bei Reiter und
// FilterPillen in ui/kit.tsx.
//
// Gelesen wird mit einem zod-Schema je Modul, dessen Felder mit .catch() einen
// Rueckfallwert tragen. Das Lesen wirft deshalb nie: ein von Hand verbogener
// Parameter faellt auf den Standard zurueck, statt die Seite zu zerlegen.

/** Suchparameter, wie Next.js sie an eine Seite reicht. */
export type SuchParameter = Readonly<Record<string, string | string[] | undefined>>;

/** Ein Wert pro Schluessel. Doppelte Parameter (?a=1&a=2) zaehlen mit dem ersten. */
export function einzelwert(wert: string | string[] | undefined): string | undefined {
  return Array.isArray(wert) ? wert[0] : wert;
}

/**
 * Liest die Felder eines Schemas aus den Suchparametern. Fremde Schluessel
 * bleiben unbeachtet, jeder Schluessel des Schemas bekommt genau einen Wert.
 */
export function leseParameter<S extends z.ZodRawShape>(
  schema: z.ZodObject<S>,
  suche: SuchParameter,
): z.output<z.ZodObject<S>> {
  const roh: Record<string, string | undefined> = {};
  for (const schluessel of Object.keys(schema.shape)) {
    roh[schluessel] = einzelwert(suche[schluessel]);
  }
  return schema.parse(roh);
}

/**
 * Suchtext fuer eine Abfrage vorbereiten. PostgREST liest Komma, Klammern und
 * Doppelpunkt in einem or()-Filter als Syntax, * und % als Platzhalter. Solche
 * Zeichen fliegen raus, statt sie zu maskieren: in Codes, Blocknamen und
 * Sorten kommen sie nicht vor, und eine Suche nach "(" findet ohnehin nichts.
 */
export function suchtextBereinigen(wert: string, laenge = 60): string {
  return wert
    .replace(/[%_,()"'\\*:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, laenge);
}

export type Parameterwert = string | number | undefined;

/** Zustand einer Liste aus der Adresse: Filter, Seite, Auswahl, Reiter. */
export type ListenWerte = Readonly<Record<string, Parameterwert>>;

/**
 * Baut die Query fuer einen Link aus dem aktuellen Zustand und einer Aenderung.
 *
 * - Werte, die dem Standard entsprechen, und leere Werte fallen weg. So bleibt
 *   die Adresse kurz, und zwei Wege zur selben Ansicht ergeben dieselbe URL.
 * - Aendert sich ein Filter, springt die Liste auf Seite 1: Seite 4 einer
 *   anderen Auswahl gibt es womoeglich gar nicht.
 * - Auswahl und Reiter bleiben stehen. Die Detailansicht haengt nicht an der
 *   Liste, ein Filterwechsel schliesst sie nicht.
 */
export function listenQuery({
  werte,
  standard,
  aenderung = {},
  filterSchluessel,
  seitenSchluessel = "seite",
}: {
  werte: ListenWerte;
  standard: ListenWerte;
  aenderung?: ListenWerte;
  filterSchluessel: readonly string[];
  seitenSchluessel?: string;
}): Record<string, string> {
  const zusammen: Record<string, Parameterwert> = { ...werte, ...aenderung };
  if (Object.keys(aenderung).some((schluessel) => filterSchluessel.includes(schluessel))) {
    delete zusammen[seitenSchluessel];
  }

  const query: Record<string, string> = {};
  for (const [schluessel, wert] of Object.entries(zusammen)) {
    if (wert === undefined || wert === "") continue;
    if (standard[schluessel] !== undefined && String(standard[schluessel]) === String(wert)) {
      continue;
    }
    query[schluessel] = String(wert);
  }
  return query;
}

/** Wie viele Filter vom Standard abweichen, fuer den Zaehler am Filterknopf. */
export function aktiveFilter(
  werte: ListenWerte,
  standard: ListenWerte,
  schluessel: readonly string[],
): number {
  return schluessel.filter((name) => {
    const wert = werte[name];
    if (wert === undefined || wert === "") return false;
    return String(wert) !== String(standard[name] ?? "");
  }).length;
}
