// Lieferungen: Uebergabequittung und Lieferstatus (Anforderung 3.5 Teil 2,
// 5.2 Teil 2a). Reine Typen/Konstanten ohne Server-Import, wie
// domain/finanzen.ts und domain/foerdermittel.ts - Client-Formulare
// importieren aus dieser Datei, nicht aus data/lieferungen.ts.

export const lieferungStatus = ["geplant", "zugestellt", "storniert"] as const;
export type LieferungStatus = (typeof lieferungStatus)[number];

export interface AuswahlZeile {
  id: string;
  label: string;
}

export interface KuehlmessungHinweis {
  temperaturC: number;
  minutenSeitPfluecken: number | null;
  ergebnis: string;
}

export interface LieferungZeile {
  id: string;
  kunde: string;
  kundeId: string;
  chargeCode: string | null;
  /** Aus der verknuepften Vorbestellung, fuer den Mengenabgleich - null ohne Vorbestellungsbezug. */
  bestellteMengeKg: number | null;
  mengeKg: number;
  status: LieferungStatus;
  geliefertAm: string | null;
  empfaengerName: string | null;
  belegStoragePath: string | null;
  /** Juengste Kuehlmessung der verknuepften Charge, fuer den Temperaturabgleich. */
  letzteKuehlmessung: KuehlmessungHinweis | null;
}

export const demoLieferungen: LieferungZeile[] = [
  {
    id: "demo-lieferung-1",
    kunde: "Handelskette A",
    kundeId: "demo-kunde-1",
    chargeCode: "CH-T-N-A-01-2608301015-7F2A",
    bestellteMengeKg: 80,
    mengeKg: 80,
    status: "zugestellt",
    geliefertAm: "2026-08-30T15:40:00.000Z",
    empfaengerName: "A. Seitkali (Wareneingang)",
    belegStoragePath: null,
    letzteKuehlmessung: { temperaturC: 3.2, minutenSeitPfluecken: 25, ergebnis: "ok" },
  },
  {
    id: "demo-lieferung-2",
    kunde: "Gastro-Distributor Almaty",
    kundeId: "demo-kunde-2",
    chargeCode: "CH-T-O-A-01-2608311200-C41D",
    bestellteMengeKg: 60,
    mengeKg: 58.5,
    status: "geplant",
    geliefertAm: null,
    empfaengerName: null,
    belegStoragePath: null,
    letzteKuehlmessung: null,
  },
];
