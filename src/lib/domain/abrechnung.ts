// Abrechnung gegenueber Lieferbetrieben (Masterplan-Anforderung 6.4). Reine
// Typen ohne Server-Import, wie domain/zukauf.ts. Die eigentliche Rechnung
// (Einkaufswert abzueglich Spanne) steht in der Datenbank
// (abrechnung_je_nachbarbetrieb(), Migration 20261009000000) - hier nur die
// Form, in der sie beim Client ankommt.

export interface AbrechnungZeile {
  nachbarbetriebId: string;
  nachbarbetriebName: string;
  mengeKgGesamt: number;
  einkaufswertTenge: number;
  spanneProzent: number;
  auszahlungTenge: number;
}

export const demoAbrechnung: AbrechnungZeile[] = [
  {
    nachbarbetriebId: "demo-nb-1",
    nachbarbetriebName: "Nachbarbetrieb Kaskelen",
    mengeKgGesamt: 640,
    einkaufswertTenge: 1_408_000,
    spanneProzent: 8,
    auszahlungTenge: 1_295_360,
  },
];
