// Sorten- und Kontingentkatalog. Reine Typen/Konstanten ohne Server-Import,
// wie domain/vorbestellungen.ts. KontingentZeile wird bewusst NICHT hier neu
// definiert, sondern aus domain/vorbestellungen.ts wiederverwendet - dieselbe
// Zeilenform (Kunde, Sorte, Saison, Menge, reserviert) reicht auch fuer die
// Buero-Verwaltung, nur die Sichtbarkeit unterscheidet sich (dort RLS-gefiltert
// auf die eigene Firma, hier immer die volle Buero-Sicht).

export const sorteTypen = ["remontierend", "sommertragend"] as const;
export type SorteTyp = (typeof sorteTypen)[number];

export interface SorteZeile {
  id: string;
  name: string;
  typ: SorteTyp;
  erntefenster: string | null;
  schaleG: number | null;
}

// Anforderung Sortenkatalog: Summe ueber alle Kunden je Sorte/Saison, ohne
// einzelne Kundenzuordnung - siehe kontingent_verfuegbarkeit_je_sorte()
// (Migration 20261012000000).
export interface VerfuegbarkeitZeile {
  sorteId: string;
  sorte: string;
  saison: string | null;
  mengeKgGesamt: number;
  reserviertKgGesamt: number;
}

export const demoSorten: SorteZeile[] = [
  { id: "demo-sorte-1", name: "Polka", typ: "remontierend", erntefenster: "Aug - erster Frost", schaleG: 125 },
  { id: "demo-sorte-2", name: "Polana", typ: "remontierend", erntefenster: "Aug - Okt", schaleG: 125 },
  { id: "demo-sorte-3", name: "Tulameen", typ: "sommertragend", erntefenster: "Jun - Jul", schaleG: 170 },
  { id: "demo-sorte-4", name: "Kweli", typ: "remontierend", erntefenster: "Aug - Sep", schaleG: 125 },
];

export const demoVerfuegbarkeit: VerfuegbarkeitZeile[] = [
  { sorteId: "demo-sorte-1", sorte: "Polka", saison: "2026", mengeKgGesamt: 4200, reserviertKgGesamt: 3420 },
  { sorteId: "demo-sorte-2", sorte: "Polana", saison: "2026", mengeKgGesamt: 2600, reserviertKgGesamt: 1450 },
  { sorteId: "demo-sorte-3", sorte: "Tulameen", saison: "2026", mengeKgGesamt: 1200, reserviertKgGesamt: 340 },
];
