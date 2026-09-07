// Aggregator / Zukauf von Nachbarbetrieben (WMCNL-1453). [ANPASSEN] - im
// Schwesterprojekt Digitalisierung-Himbeerenbetrieb traegt der Enum-Wert
// 'sourcing' keine eigene Import-/Commit-Strecke (die dortige zukauf/page.tsx
// zeigt ein anderes, umfangreicheres Wareneingangsmodell mit Temperatur/
// Trefferquote, fachlich nicht 1:1 uebertragbar). Damicon fuehrt zugekaufte
// Ware stattdessen als eigene Charge mit reihenblock_id = null - "eigene
// Charge je Fremdbetrieb", strukturell bereits im initialen Schema angelegt
// (siehe Kommentar an public.chargen: "Charge = Herkunftsblock + Sorte +
// Erntetag", das Herkunftsfeld ist fuer Zukauf einfach leer).
//
// Spiegelt exakt die beiden Zeilen aus supabase/seed.sql, damit Demo- und
// DB-Modus dieselbe Geschichte erzaehlen (ein Bestandsfall mit Preis und
// Rechnungsdatum, ein frisch importierter Fall mit noch offenem Preis).

export interface DemoZukaufPosition {
  id: string;
  nachbarbetrieb: string;
  nachbarbetriebId: string;
  sorte: string | null;
  chargeCode: string | null;
  mengeKg: number;
  preisTengeKg: number | null;
  rechnungsdatum: string | null;
  erntedatum: string | null;
  erfasstAm: string;
}

export const demoZukaufPositionen: DemoZukaufPosition[] = [
  {
    id: "demo-zuk-1",
    nachbarbetrieb: "Nachbarbetrieb Kaskelen",
    nachbarbetriebId: "demo-nb-1",
    sorte: "Polka",
    chargeCode: null,
    mengeKg: 210,
    preisTengeKg: 1400,
    rechnungsdatum: "2026-09-01",
    erntedatum: null,
    erfasstAm: "2026-09-01T09:00:00.000Z",
  },
  {
    id: "demo-zuk-2",
    nachbarbetrieb: "Nachbarbetrieb Uzynagash",
    nachbarbetriebId: "demo-nb-2",
    sorte: "Polana",
    chargeCode: "ZUK-SEED-0001",
    mengeKg: 150,
    preisTengeKg: null,
    rechnungsdatum: null,
    erntedatum: "2026-09-05",
    erfasstAm: "2026-09-05T14:00:00.000Z",
  },
];
