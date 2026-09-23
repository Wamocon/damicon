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

// Ein Platzhalter reiht sich hinter allem Gemessenen ein, auch wenn sein
// Abstand zum Ziel rechnerisch gross ist: der Wert ist ein unterschriebener
// Ausgangswert und keine Messung, er gehoert nicht an die erste Stelle.
function rangVon(auswertung: Zielauswertung): number {
  return auswertung.platzhalter ? rang.offen : rang[auswertung.stand];
}

export function nachDringlichkeit(kpis: Kpi[]): Kpi[] {
  return [...kpis].sort((a, b) => {
    const links = zielAuswerten(a);
    const rechts = zielAuswerten(b);
    if (rangVon(links) !== rangVon(rechts)) {
      return rangVon(links) - rangVon(rechts);
    }
    return (links.abstand ?? 0) - (rechts.abstand ?? 0);
  });
}

// Was auf die Uebersichtsseite gehoert: alles, was nicht im Ziel liegt.
//
// Entscheidung vom 23.09.2026. Bewusst diese Grenze und nicht "nur verfehlt":
// die 10-Prozent-Marke oben ist gegriffen und seit dem 21.09. als offener Punkt
// notiert. Haengt an ihr, OB eine Kennzahl ueberhaupt erscheint, entscheidet eine
// ungeklaerte Zahl ueber die Sichtbarkeit - bei 9 Prozent Abweichung verschwaende
// eine Kennzahl, bei 11 erschiene sie. So entscheidet sie nur noch ueber die
// Reihenfolge innerhalb der Liste.
//
// Platzhalter bleiben drin und stehen hinten: ein unterschriebener Ausgangswert
// ist keine Messung, aber er ist auch nicht "im Ziel". Ihn wegzulassen hiesse zu
// behaupten, dort sei alles in Ordnung. KennzahlBox schreibt bei ihnen "Platzhalter"
// statt einer Ampel.
export function nurAuffaellige(kpis: Kpi[]): Kpi[] {
  const auffaellig = kpis.filter((kpi) => {
    const auswertung = zielAuswerten(kpi);
    return auswertung.platzhalter || auswertung.stand !== "erfuellt";
  });
  return nachDringlichkeit(auffaellig);
}

// Was in einer Zonenkarte steht: das Auffaellige zuerst, danach aufgefuellt bis zu einer
// Mindestzahl.
//
// Entscheidung vom 23.09.2026, Nachtrag zu nurAuffaellige(): eine Zonenkarte mit nur einer
// einzigen Kachel sieht aus, als fehle etwas, und vier Karten mit unterschiedlich vielen
// Kacheln stehen unruhig nebeneinander. Gezeigt werden deshalb mindestens vier je Bereich -
// aufgefuellt mit dem, was im Ziel liegt.
//
// Nie weniger als alles Auffaellige: liegen fuenf Kennzahlen daneben, stehen auch fuenf da.
// Eine Obergrenze waere die falsche Sparsamkeit - sie verstecke genau das, wofuer die Seite
// gebaut ist. Heute hat keine Zone mehr als vier freigegebene Kennzahlen, die Regel greift
// also erst, wenn welche dazukommen.
export function auffaelligeZuerst(kpis: Kpi[], mindestens: number): Kpi[] {
  // Bewusst nicht einfach nachDringlichkeit(kpis).slice(...): dort steht "erfuellt" VOR
  // "offen", ein erfuellter Wert verdraengte also beim Auffuellen einen Platzhalter. Erst
  // alles Auffaellige, dann der Rest - beides je fuer sich nach Dringlichkeit gereiht.
  const auffaellig = nurAuffaellige(kpis);
  const uebrig = nachDringlichkeit(kpis.filter((kpi) => !auffaellig.includes(kpi)));
  return [...auffaellig, ...uebrig].slice(0, Math.max(auffaellig.length, mindestens));
}
