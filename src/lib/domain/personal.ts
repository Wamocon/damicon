// Brigadenplanung (Anforderung 2.11). Reine Typen ohne Server-Import, wie
// domain/lieferungen.ts - Client-Formulare importieren nur von hier.

export interface BrigadeOption {
  id: string;
  name: string;
}

export interface PfleuckerZeile {
  id: string;
  name: string;
  ausweis: string;
  brigadeId: string | null;
  brigadeName: string | null;
  esutd: string;
  // Migration 20261025000000: die 5-Werktage-ESUTD-Meldefrist, fertig
  // berechnet aus esutd_vertraege_mit_frist - null, wenn kein offener
  // Vertrag mit Beginndatum vorliegt (kein Feldarbeiter ohne erkennbare
  // Frist zeigt einen falschen Countdown).
  esutdFaelligkeit: string | null;
  letzteMengeKg: number | null;
  letzterQualitaetsfaktor: number | null;
}

export interface BrigadeZeile {
  id: string;
  name: string;
  vorarbeiter: string | null;
  staerke: number;
  plantage: string | null;
}

export interface EinsatzZeile {
  geplantFuer: string;
  brigadeId: string;
  brigadeName: string;
  staerke: number;
  bloeckeZugewiesen: number;
}

export interface BedarfZeile {
  geplantFuer: string;
  bloeckeGesamt: number;
  bloeckeZugewiesen: number;
  bloeckeOffen: number;
}

export interface OffenerTerminZeile {
  id: string;
  geplantFuer: string;
  reihenblockCode: string;
}

export const demoBrigaden: BrigadeZeile[] = [
  { id: "demo-brigade-1", name: "Brigade Nord", vorarbeiter: "R. Beisenov", staerke: 6, plantage: "Plantage Nord" },
  { id: "demo-brigade-2", name: "Brigade Ost", vorarbeiter: "A. Duissenov", staerke: 5, plantage: "Plantage Ost" },
];

export const demoPfluecker: PfleuckerZeile[] = [
  {
    id: "demo-pfluecker-1",
    name: "D. Sarsenbaj",
    ausweis: "MAL-0417",
    brigadeId: "demo-brigade-1",
    brigadeName: "Brigade Nord",
    esutd: "erfasst",
    esutdFaelligkeit: null,
    letzteMengeKg: 25.7,
    letzterQualitaetsfaktor: 0.95,
  },
  {
    id: "demo-pfluecker-2",
    name: "K. Nurlanuly",
    ausweis: "MAL-0433",
    brigadeId: null,
    brigadeName: null,
    esutd: "offen",
    // Demo: Vertrag vor drei Tagen begonnen, Frist laeuft noch (5 Werktage
    // minus Wochenende) - eine bald faellige, nicht ueberfaellige Kachel.
    esutdFaelligkeit: new Date(Date.now() + 1000 * 60 * 60 * 24).toISOString(),
    letzteMengeKg: null,
    letzterQualitaetsfaktor: null,
  },
];

export const demoEinsatzplan: EinsatzZeile[] = [
  { geplantFuer: "2026-09-03", brigadeId: "demo-brigade-1", brigadeName: "Brigade Nord", staerke: 6, bloeckeZugewiesen: 1 },
];

export const demoBedarf: BedarfZeile[] = [
  { geplantFuer: "2026-09-03", bloeckeGesamt: 1, bloeckeZugewiesen: 1, bloeckeOffen: 0 },
  { geplantFuer: "2026-09-09", bloeckeGesamt: 1, bloeckeZugewiesen: 0, bloeckeOffen: 1 },
];

export const demoOffeneTermine: OffenerTerminZeile[] = [
  { id: "demo-termin-1", geplantFuer: "2026-09-09", reihenblockCode: "T-O-A-02" },
];
