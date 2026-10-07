// Rotationsplan-Engine (Anforderung 2.2, P1). [NEU-BAUEN] - "Die erste
// Funktion, die gebaut wird" (Masterplan Abschnitt 10). Kein 1Cati-Vorbild;
// das Planungsproblem ist nicht die Prognose, sondern die zyklische Rotation
// ueber Wochen mit Sperrlogik. Die eigentliche Rechenarbeit (Zyklusfortschritt,
// Sperren/Entsperren bei Behandlung/Freigabe, automatisches Erledigen bei
// neuer Pflueckaufgabe) steht in der Datenbank
// (public.rotationsplan_generieren() und drei Trigger, Migration
// 20260910000000) - diese Datei traegt nur Typen und Demo-Werte.
//
// Wetterszenarien (der dritte Teil der Anforderung) fehlen bewusst: die
// Wetteranbindung (2.13) ist selbst noch nicht gebaut (P2, siehe Modul
// "wetter"). Das steht auch im Hinweistext der Ansicht, nicht nur hier im
// Kommentar.

export const rotationsplanStatus = ["geplant", "gesperrt", "erledigt", "uebersprungen"] as const;
export type RotationsplanStatus = (typeof rotationsplanStatus)[number];

export const rotationsplanStatusMeta: Record<
  RotationsplanStatus,
  { tone: "neutral" | "warning" | "danger" | "success" }
> = {
  geplant: { tone: "neutral" },
  gesperrt: { tone: "danger" },
  erledigt: { tone: "success" },
  uebersprungen: { tone: "warning" },
};

export interface RotationsplanEintrag {
  id: string;
  reihenblockId: string;
  reihenblockCode: string;
  sorteName: string | null;
  brigadeName: string | null;
  geplantFuer: string;
  intervallTage: number;
  status: RotationsplanStatus;
  /** true nur bei status "geplant", geplantFuer in der Vergangenheit und freiem Block. */
  ueberfaellig: boolean;
  pflueckaufgabeCode: string | null;
  /**
   * Der Reihenblock steht gerade in einer Wartezeitsperre, der Termin ist aber
   * noch "geplant" (WMCNL-2300): so ein Termin ist nicht ueberfaellig und darf
   * nicht beerntet werden.
   */
  blockGesperrt: boolean;
  /** Ende der laufenden Sperre (YYYY-MM-DD), sofern bekannt. */
  sperreFreiAb: string | null;
  /**
   * Termin liegt in der Zukunft und ist trotzdem "erledigt", weil die
   * Pflueckaufgabe schon angelegt wurde (WMCNL-2388).
   */
  vorgezogen: boolean;
}

/** Ein Reihenblock mit laufender Wartezeitsperre, gezaehlt je Block statt je Termin. */
export interface GesperrterBlock {
  id: string;
  code: string;
  freiAb: string | null;
}

export interface ReihenblockOption {
  id: string;
  code: string;
}

// Dieselbe Geschichte wie der Seed: T-N-A-01 ist wartezeitgesperrt (Signum,
// Wartezeit bis 04.09.), T-N-A-02 laeuft im 2-Tage-Takt, T-O-A-01 im
// 3-Tage-Takt. Ein Termin steht bereits als erledigt (verknuepft mit einer
// Pflueckaufgabe), einer als ueberfaellig, damit die Ansicht auch im
// Demo-Modus alle vier Zustaende zeigt.
export const demoRotationsplan: RotationsplanEintrag[] = [
  {
    id: "demo-rp-1",
    reihenblockId: "demo-rb-t-n-a-01",
    reihenblockCode: "T-N-A-01",
    sorteName: "Polka",
    brigadeName: null,
    geplantFuer: "2026-09-04",
    intervallTage: 3,
    status: "gesperrt",
    ueberfaellig: false,
    pflueckaufgabeCode: null,
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
  {
    id: "demo-rp-2",
    reihenblockId: "demo-rb-t-n-a-02",
    reihenblockCode: "T-N-A-02",
    sorteName: "Polka",
    brigadeName: "Brigade Nord",
    geplantFuer: "2026-09-01",
    intervallTage: 2,
    status: "erledigt",
    ueberfaellig: false,
    pflueckaufgabeCode: "PA-2026-0901-03",
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
  {
    id: "demo-rp-3",
    reihenblockId: "demo-rb-t-n-a-02",
    reihenblockCode: "T-N-A-02",
    sorteName: "Polka",
    brigadeName: "Brigade Nord",
    geplantFuer: "2026-09-03",
    intervallTage: 2,
    status: "geplant",
    ueberfaellig: true,
    pflueckaufgabeCode: null,
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
  {
    id: "demo-rp-4",
    reihenblockId: "demo-rb-t-n-a-02",
    reihenblockCode: "T-N-A-02",
    sorteName: "Polka",
    brigadeName: "Brigade Nord",
    geplantFuer: "2026-09-05",
    intervallTage: 2,
    status: "geplant",
    ueberfaellig: false,
    pflueckaufgabeCode: null,
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
  {
    id: "demo-rp-5",
    reihenblockId: "demo-rb-t-o-a-01",
    reihenblockCode: "T-O-A-01",
    sorteName: "Polana",
    brigadeName: "Brigade Ost",
    geplantFuer: "2026-09-04",
    intervallTage: 3,
    status: "geplant",
    ueberfaellig: false,
    pflueckaufgabeCode: null,
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
  {
    id: "demo-rp-6",
    reihenblockId: "demo-rb-t-o-a-01",
    reihenblockCode: "T-O-A-01",
    sorteName: "Polana",
    brigadeName: "Brigade Ost",
    geplantFuer: "2026-09-07",
    intervallTage: 3,
    status: "geplant",
    ueberfaellig: false,
    pflueckaufgabeCode: null,
    blockGesperrt: false,
    sperreFreiAb: null,
    vorgezogen: false,
  },
];

export const demoGesperrteBloecke: GesperrterBlock[] = [
  { id: "demo-rb-t-n-a-01", code: "T-N-A-01", freiAb: "2026-09-04" },
];

export const demoReihenblockOptionen: ReihenblockOption[] = [
  { id: "demo-rb-t-n-a-01", code: "T-N-A-01" },
  { id: "demo-rb-t-n-a-02", code: "T-N-A-02" },
  { id: "demo-rb-t-o-a-01", code: "T-O-A-01" },
];
