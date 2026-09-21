// Soll-Ist-Auswertung einer Kennzahl. Nur fuer die Entwuerfe der
// Uebersichtsseite - die Ist-Fassung zeigt Wert und Ziel nebeneinander und
// laesst den Leser selbst vergleichen.
//
// Das Zielfeld ist heute eine fertig formatierte Zeichenkette ("< 6 %",
// "> 700 ₸/kg", "Ausgangswert"), siehe der Hinweis ueber `kpis` in
// src/lib/domain/kpis.ts. Solange das so ist, muss ein Abgleich den Operator
// aus dem Text holen. Wird eine Variante uebernommen, gehoert an diese Stelle
// das dort beschriebene Schema aus Operator, Zahl und Einheit - dann faellt
// dieser Parser ersatzlos weg.
import type { Kpi } from "@/lib/domain/kpis";

export type Zielstand = "erfuellt" | "knapp" | "verfehlt" | "offen";

export interface Zielauswertung {
  stand: Zielstand;
  /** Abstand zum Ziel, als Anteil des Zielwerts. Negativ heisst daneben. */
  abstand: number | null;
  ist: number | null;
  soll: number | null;
  /** true, solange der Istwert der unterschriebene Platzhalter ist. */
  platzhalter: boolean;
}

/** "7,7 %" -> 7.7, "446 ₸/kg" -> 446, "1,8 x" -> 1.8 */
function zahlAus(text: string): number | null {
  const treffer = text.replace(/\s/g, "").match(/-?\d+(?:[.,]\d+)?/);
  if (!treffer) return null;
  const zahl = Number(treffer[0].replace(",", "."));
  return Number.isFinite(zahl) ? zahl : null;
}

// Ab hier gilt eine Kennzahl als knapp daneben statt verfehlt. Zehn Prozent
// sind gegriffen - der Wert gehoert mit dem Kunden festgelegt, sobald eine
// Variante steht.
const knappGrenze = 0.1;

export function zielAuswerten(kpi: Kpi): Zielauswertung {
  const ist = kpi.gerechnet ? kpi.gerechnet.zahl : zahlAus(kpi.wert);
  const platzhalter = !kpi.gerechnet;
  const ziel = kpi.ziel.trim();
  const soll = zahlAus(ziel);

  // "Ausgangswert": die erste Messung ist selbst der Zielwert, es gibt nichts
  // zu vergleichen.
  if (ist === null || soll === null || soll === 0) {
    return { stand: "offen", abstand: null, ist, soll, platzhalter };
  }

  const operator = ziel.startsWith("<") ? "<" : ziel.startsWith(">") ? ">" : "=";

  let abstand: number;
  if (operator === "<") {
    abstand = (soll - ist) / soll;
  } else if (operator === ">") {
    abstand = (ist - soll) / soll;
  } else {
    // Punktziel, etwa "100 %": jede Abweichung nach beiden Seiten zaehlt.
    abstand = -Math.abs(ist - soll) / soll;
  }

  const stand: Zielstand =
    abstand >= 0 ? "erfuellt" : abstand >= -knappGrenze ? "knapp" : "verfehlt";

  return { stand, abstand, ist, soll, platzhalter };
}

// Reihenfolge fuer eine nach Dringlichkeit sortierte Liste: was am weitesten
// daneben liegt, steht vorn. Erfuellte Kennzahlen und solche ohne Vergleich
// wandern ans Ende.
const rang: Record<Zielstand, number> = {
  verfehlt: 0,
  knapp: 1,
  erfuellt: 2,
  offen: 3,
};

export function nachDringlichkeit(kpis: Kpi[]): Kpi[] {
  return [...kpis].sort((a, b) => {
    const links = zielAuswerten(a);
    const rechts = zielAuswerten(b);
    if (rang[links.stand] !== rang[rechts.stand]) {
      return rang[links.stand] - rang[rechts.stand];
    }
    return (links.abstand ?? 0) - (rechts.abstand ?? 0);
  });
}
