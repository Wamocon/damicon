// B2B-Portal: Preisliste und Vorbestellung (Anforderung 5.1, Teil 2 von 2).
// Reine Typen/Konstanten ohne Server-Import, wie domain/lieferungen.ts -
// Client-Formulare importieren aus dieser Datei, nicht aus data/vorbestellungen.ts.

export const vorbestellungStatus = ["angefragt", "bestaetigt", "geliefert", "storniert"] as const;
export type VorbestellungStatus = (typeof vorbestellungStatus)[number];

export interface AuswahlZeile {
  id: string;
  label: string;
}

export interface VorbestellungZeile {
  id: string;
  kunde: string;
  kundeId: string;
  sorte: string;
  mengeKg: number;
  liefertermin: string | null;
  status: VorbestellungStatus;
  erstelltAm: string;
}

// Anforderung 5.1: Kontingent-Stand je Sorte (und, im Buero, je Kunde).
// reserviertKg wird seit der Migration 20261006000000 automatisch fortge-
// schrieben (angefragt->bestaetigt erhoeht, bestaetigt->storniert senkt).
export interface KontingentZeile {
  id: string;
  kunde: string;
  kundeId: string;
  sorte: string;
  saison: string | null;
  mengeKg: number;
  reserviertKg: number;
}

export interface PreislistenPositionZeile {
  id: string;
  sorte: string;
  preisTengeKg: number;
  minMengeKg: number;
}

export interface PreislisteZeile {
  id: string;
  name: string;
  gueltigAb: string;
  gueltigBis: string | null;
  positionen: PreislistenPositionZeile[];
}

export const demoVorbestellungen: VorbestellungZeile[] = [
  {
    id: "demo-vorbestellung-1",
    kunde: "Handelskette A",
    kundeId: "demo-kunde-1",
    sorte: "Polka",
    mengeKg: 320,
    liefertermin: "2026-09-15",
    status: "bestaetigt",
    erstelltAm: "2026-09-05T09:00:00.000Z",
  },
  {
    id: "demo-vorbestellung-2",
    kunde: "Gastro-Distributor Almaty",
    kundeId: "demo-kunde-2",
    sorte: "Tulameen",
    mengeKg: 60,
    liefertermin: null,
    status: "angefragt",
    erstelltAm: "2026-09-08T14:20:00.000Z",
  },
];

export const demoKontingente: KontingentZeile[] = [
  {
    id: "demo-kontingent-1",
    kunde: "Handelskette A",
    kundeId: "demo-kunde-1",
    sorte: "Polka",
    saison: "2026",
    mengeKg: 4200,
    reserviertKg: 3420,
  },
  {
    id: "demo-kontingent-2",
    kunde: "Handelskette A",
    kundeId: "demo-kunde-1",
    sorte: "Tulameen",
    saison: "2026",
    mengeKg: 1200,
    reserviertKg: 340,
  },
];

export const demoPreislisten: PreislisteZeile[] = [
  {
    id: "demo-preisliste-1",
    name: "Saison 2026",
    gueltigAb: "2026-06-01",
    gueltigBis: null,
    positionen: [
      { id: "demo-pos-1", sorte: "Polka", preisTengeKg: 3200, minMengeKg: 50 },
      { id: "demo-pos-2", sorte: "Tulameen", preisTengeKg: 3600, minMengeKg: 20 },
    ],
  },
];
