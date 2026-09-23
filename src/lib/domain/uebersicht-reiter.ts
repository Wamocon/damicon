// Die drei Reiter der Uebersichtsseite: Lage, Kennzahlen, Bereiche.
//
// Auftrag vom 23.09.2026: die Seite trug vier Informationsfamilien in einem einzigen
// Strang untereinander - Zusammenfassung und Compliance, Finanzen, vierzehn Kennzahlen,
// sechsundzwanzig Modulwege. Was zuletzt im Strang stand, ging unter. Gemessen am
// 23.09.: 2421 px am Schirm, 5185 px am Handy, also gut sechs Bildschirme.
//
// Rein und ohne React, damit die Reiterwahl ohne Datenbank pruefbar ist - dasselbe
// Muster wie finanzBereichAusText() in lib/domain/finanzen.ts, an dem sich auch das
// Rueckfallverhalten orientiert.

export const UEBERSICHT_REITER = ["compliance", "bereiche"] as const;
export type UebersichtReiter = (typeof UEBERSICHT_REITER)[number];

export interface ReiterLage {
  /** Die vier Pruefbereiche: gespeicherter Compliance-Bericht, fuer ceo und admin. */
  compliance: boolean;
}

/**
 * Welche Reiter diese Person bekommt. Ein Reiter erscheint nur, wenn er etwas traegt -
 * ein Klick auf einen Reiter, der nichts zeigt, ist ein vergeudeter Klick.
 *
 * "bereiche" fehlt bewusst in ReiterLage: die vier Zonen stehen statisch in
 * lib/modules.ts und sind fuer jede Rolle da. Es gibt also immer mindestens einen Reiter.
 *
 * Einen Reiter "Finanzen" gab es kurzzeitig auch. Er ist am 23.09.2026 wieder entfallen:
 * der Deckungsbeitrag steht jetzt in der Begruessungskarte (startkarte-finanzen.tsx), und
 * ein Reiter fuer eine Zahl, die schon oben steht, waere doppelte Pflege.
 * Die Kennzahlen stehen dort in ihrer Zonenkarte - eine Zone ohne freigegebene Kennzahl
 * bleibt trotzdem ein Einstieg.
 *
 * Abweichung von der Finanzseite, absichtlich: dort bleibt ein Reiter stehen, auch wenn
 * er leer ist (Anforderung 3.3 in finanzen-ansicht.tsx). Der Unterschied ist echt - dort
 * haengt die Leere am Filter und der Reiter kann morgen voll sein, hier haengt sie an der
 * Rolle und wird fuer diese Person nie Inhalt haben.
 */
export function reiterFuer(hat: ReiterLage): UebersichtReiter[] {
  return UEBERSICHT_REITER.filter((r) => (r === "compliance" ? hat.compliance : true));
}

/**
 * Der Reiter aus der Adresszeile, auf das eingeschraenkt, was diese Person haben darf.
 *
 * Faellt still auf den ersten erlaubten zurueck. Kein notFound() - die Seite selbst ist
 * erlaubt, nur der Ausschnitt nicht. Kein redirect() - das kostete einen zusaetzlichen
 * Gang zum Server und machte den Zurueck-Knopf unbrauchbar. Dieselbe Haltung wie bei
 * "?zeilen=abc" auf der Finanzseite.
 */
export function reiterAusText(wert: string | undefined, erlaubt: UebersichtReiter[]): UebersichtReiter {
  const ersterErlaubter = erlaubt[0] ?? "bereiche";
  if (!wert) return ersterErlaubter;
  const treffer = UEBERSICHT_REITER.find((r) => r === wert);
  return treffer && erlaubt.includes(treffer) ? treffer : ersterErlaubter;
}
