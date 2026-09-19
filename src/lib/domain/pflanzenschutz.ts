// Pflanzenschutz-Protokoll (Anforderung 2.4). Eigene Sicht auf dieselben
// Behandlungen, die in der Reihenbloecke-Ansicht erfasst werden: dort steht
// der Block im Mittelpunkt und zeigt hoechstens seine juengste offene Sperre,
// hier die Behandlung selbst, vollstaendig, mit Aufwandmenge, Person und
// Wartezeit. Reine Typen/Beispieldaten ohne Server-Import, wie
// domain/foerdermittel.ts.

export interface BehandlungZeile {
  id: string;
  reihenblock: string;
  mittel: string;
  wirkstoff: string | null;
  behandeltAm: string;
  wartezeitTage: number;
  freigabeAm: string;
  /** Die Freigabe ist erfolgt (reihenblock_freigeben()). Erst damit endet die Sperre
   *  des Blocks, auch wenn das Freigabedatum laengst erreicht ist. */
  freigegeben: boolean;
  /** Die Wartezeit laeuft noch: nicht freigegeben, Freigabedatum liegt in der Zukunft. */
  wartezeitLaeuft: boolean;
  aufwandmenge: number | null;
  aufwandmengeEinheit: string | null;
  durchgefuehrtVon: string | null;
  /** Es ist eine ausfuehrende Person hinterlegt, die diese Rolle aber nicht lesen
   *  darf (profiles ist nur fuer das Buero lesbar). Ohne den Hinweis sah das aus
   *  wie "keine Person erfasst". */
  personVerborgen: boolean;
  /** Anforderung 2.4: Protokoll-Upload ist noch nicht gebaut, die Spalte
   *  dokument_id fuellt heute niemand (siehe Modulnotiz). */
  hatProtokoll: boolean;
}

/** Filter ueber den Freigabestand einer Behandlung. */
export type BehandlungFilter = "alle" | "offen" | "freigegeben";

/**
 * Liest den Filter aus der Adresszeile. "wartezeitgesperrt" war der Filterwert der
 * frueheren Blocksicht dieses Moduls und bleibt als Alias fuer gespeicherte Links
 * gueltig: gemeint war dort der noch gesperrte, also nicht freigegebene Stand.
 */
export function parseBehandlungFilter(wert: string | undefined): BehandlungFilter {
  if (wert === "offen" || wert === "wartezeitgesperrt") return "offen";
  if (wert === "freigegeben") return "freigegeben";
  return "alle";
}

export const demoBehandlungen: BehandlungZeile[] = [
  {
    id: "demo-b-1",
    reihenblock: "T-N-A-01",
    mittel: "Kupferhydroxid",
    wirkstoff: "Kupfer",
    behandeltAm: "2026-09-05",
    wartezeitTage: 7,
    freigabeAm: "2026-09-12",
    freigegeben: false,
    wartezeitLaeuft: true,
    aufwandmenge: 1.8,
    aufwandmengeEinheit: "l_ha",
    durchgefuehrtVon: "A. Iskakow",
    personVerborgen: false,
    hatProtokoll: false,
  },
  {
    id: "demo-b-2",
    reihenblock: "T-O-A-01",
    mittel: "Schwefel-Netzmittel",
    wirkstoff: "Schwefel",
    behandeltAm: "2026-08-20",
    wartezeitTage: 3,
    freigabeAm: "2026-08-23",
    freigegeben: true,
    wartezeitLaeuft: false,
    aufwandmenge: 2.5,
    aufwandmengeEinheit: "kg_ha",
    durchgefuehrtVon: "G. Nurlanowa",
    personVerborgen: false,
    hatProtokoll: true,
  },
];
