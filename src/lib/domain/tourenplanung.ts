// Tourenplanung mit Routenoptimierung (Masterplan-Anforderung 3.5, Teil 1).
// Reine Typen ohne Server-Import, wie domain/lieferungen.ts.

export const tourStatus = ["geplant", "unterwegs", "abgeschlossen"] as const;
export type TourStatus = (typeof tourStatus)[number];

export interface TourStopp {
  lieferungId: string;
  kunde: string;
  adresse: string | null;
  breitengrad: number | null;
  laengengrad: number | null;
  mengeKg: number;
  reihenfolge: number | null;
}

export interface TourZeile {
  id: string;
  datum: string;
  status: TourStatus;
  distanzKm: number | null;
  dauerMinuten: number | null;
  geometrie: GeoJSON.LineString | null;
  stopps: TourStopp[];
}

export interface LieferungOhneTour {
  id: string;
  kundeId: string;
  kunde: string;
  adresse: string | null;
  breitengrad: number | null;
  laengengrad: number | null;
  mengeKg: number;
  liefertermin: string | null;
}

export const demoTouren: TourZeile[] = [
  {
    id: "demo-tour-1",
    datum: "2026-09-20",
    status: "geplant",
    distanzKm: 18.4,
    dauerMinuten: 42,
    geometrie: null,
    stopps: [
      {
        lieferungId: "demo-stopp-1",
        kunde: "Handelskette A",
        adresse: "Dostyk Avenue 100, Almaty",
        breitengrad: 43.238,
        laengengrad: 76.945,
        mengeKg: 80,
        reihenfolge: 0,
      },
      {
        lieferungId: "demo-stopp-2",
        kunde: "Gastro-Distributor Almaty",
        adresse: "Abay Avenue 50, Almaty",
        breitengrad: 43.229,
        laengengrad: 76.909,
        mengeKg: 40,
        reihenfolge: 1,
      },
    ],
  },
];

export const demoLieferungenOhneTour: LieferungOhneTour[] = [
  {
    id: "demo-frei-1",
    kundeId: "demo-kunde-1",
    kunde: "Almaty Fresh Market",
    adresse: "Seifullin Avenue 458, Almaty",
    breitengrad: 43.263,
    laengengrad: 76.929,
    mengeKg: 60,
    liefertermin: "2026-09-21",
  },
];
