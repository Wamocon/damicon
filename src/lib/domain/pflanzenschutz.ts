// Pflanzenschutz-Protokoll (Anforderung 2.4). Eigene Sicht auf dieselben
// Behandlungen, die in der Reihenbloecke-Ansicht erfasst werden: dort steht
// der Block im Mittelpunkt und zeigt hoechstens seine juengste offene Sperre,
// hier die Behandlung selbst - vollstaendig, mit Aufwandmenge, Person und
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
  freigegeben: boolean;
  /** Wartezeit laeuft noch: Freigabedatum liegt in der Zukunft. */
  gesperrt: boolean;
  aufwandmenge: number | null;
  aufwandmengeEinheit: string | null;
  durchgefuehrtVon: string | null;
  /** Anforderung 2.4: Protokoll-Upload ist noch nicht gebaut - die Spalte
   *  dokument_id fuellt heute niemand (siehe Modulnotiz). */
  hatProtokoll: boolean;
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
    gesperrt: true,
    aufwandmenge: 1.8,
    aufwandmengeEinheit: "l_ha",
    durchgefuehrtVon: "A. Iskakow",
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
    gesperrt: false,
    aufwandmenge: 2.5,
    aufwandmengeEinheit: "kg_ha",
    durchgefuehrtVon: "G. Nurlanowa",
    hatProtokoll: true,
  },
];
