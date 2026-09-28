// Welcher Teil einer fertigen Antwort vorgelesen wird (api/ki-sprachausgabe, Weg 1).
//
// Seit 28.09.2026 zerfaellt eine gemischtsprachige Antwort in Sprachbloecke
// (vorlesePlan in domain/sprachausgabe.ts), und der Browser holt sie einzeln.
// Er nennt dabei nur ZAHLEN: `block` (der wievielte Sprachblock) und `rest`
// (nur die letzten so vielen Saetze). Der Text kommt immer aus der gespeicherten
// Nachricht, nie aus dem Browser.
//
// Aus der Route herausgezogen (Vibecode-Cleanup 28.09.2026, Fund 88): die
// Eingabepruefung und die Blockwahl waren nur als Quelltext festgenagelt, eine
// Pruefung, die jede Eingabe durchliess, blieb in allen Tests gruen. Ohne
// Importe, damit supabase/tests/schluessel-routen.ts sie direkt ausfuehrt.

/** Groesste Zahl, die `block` oder `rest` sein darf. Mehr Saetze oder Bloecke
 *  hat keine Antwort (MAX_SPRACHAUSGABE_ZEICHEN), und vier Stellen halten
 *  "1e3", "0x10" und Aehnliches draussen. */
export const AUSWAHL_HOECHSTENS = 9_999;

export type Auswahl = { rest?: number; block?: number };

/** `block` und `rest` aus Adresse (Zeichenkette) oder Koerper (Zahl). Fehlt ein
 *  Wert, ist er undefined (ohne `block`: die ganze Antwort, alter Tab). null
 *  heisst: ungueltig, die Route antwortet 400. */
export function leseAuswahl(rest: unknown, block: unknown): Auswahl | null {
  const zahl = (wert: unknown): number | undefined | null => {
    if (wert === null || wert === undefined || wert === "") return undefined;
    const n = typeof wert === "number" ? wert : typeof wert === "string" && /^\d{1,4}$/.test(wert) ? Number(wert) : Number.NaN;
    return Number.isInteger(n) && n >= 0 && n <= AUSWAHL_HOECHSTENS ? n : null;
  };
  const r = zahl(rest);
  const b = zahl(block);
  if (r === null || b === null) return null;
  return { rest: r, block: b };
}

/** Ein Sprachblock, wie vorlesePlan ihn liefert (nur, was hier gebraucht wird). */
export interface VorleseBlock {
  text: string;
  sprache: string;
  von: number;
  bis: number;
}

/** Was gesprochen wird: der Text, die Sprache und - bei einem Teil - welche
 *  Saetze (fuer den Ablagepfad). null: den Block gibt es im Plan nicht (422). */
export function waehleVorleseTeil(
  auswahl: Auswahl,
  plan: { sprache: string; bloecke: readonly VorleseBlock[] },
  ganzerText: string,
): { text: string; sprache: string; teil?: { von: number; bis: number } } | null {
  // Die ganze Antwort wie bisher (derselbe Text, derselbe Ablagepfad): ohne
  // `block` (alter Tab) oder wenn der Plan nur einen Block hat.
  const ganz = auswahl.block === undefined || (auswahl.rest === undefined && plan.bloecke.length <= 1);
  if (ganz && (auswahl.block ?? 0) === 0) {
    return { text: ganzerText, sprache: plan.bloecke.length === 1 ? plan.bloecke[0]!.sprache : plan.sprache };
  }
  const block = plan.bloecke[auswahl.block ?? 0];
  if (!block) return null;
  return { text: block.text, sprache: block.sprache, teil: { von: block.von, bis: block.bis } };
}
