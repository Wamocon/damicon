// Die Warteschlange der Abschnitte: was wird geholt, was wird gespielt, und
// was passiert, wenn etwas dazwischenkommt.
//
// Drei Dinge muessen gleichzeitig stimmen, und genau deshalb steht das hier
// als eigene Einheit und nicht verstreut im Bauteil:
//
//   1. REIHENFOLGE. Abschnitt 2 darf nie vor Abschnitt 1 klingen, auch wenn
//      seine Anfrage frueher zurueckkommt - kurze Saetze sind schneller
//      erzeugt als lange.
//   2. VORSPRUNG, aber nicht zu viel. Zwei Anfragen gleichzeitig reichen, um
//      die Luecken zu fuellen. Mehr erzeugt Audio, das nie gespielt wird,
//      sobald jemand abbricht - und bezahlt wird es trotzdem.
//   3. SOFORT STILL. Mikrofon an, jemand tippt, neue Frage, Stopp, Panel zu:
//      dann endet alles auf der Stelle, auch das, was schon unterwegs ist.
//
// Hier steht nur die Buchfuehrung - kein fetch, kein Audio. So laesst sich
// pruefen, was in welcher Reihenfolge passiert, ohne Browser.

/** Mehr als zwei offene Anfragen bringen nichts: waehrend zwei erzeugt
 *  werden, spielt laengst ein dritter Abschnitt. */
export const HOECHSTENS_GLEICHZEITIG = 2;

/** Ein Abschnitt darf einmal scheitern. Beim zweiten Mal wird er
 *  uebersprungen - lieber eine Luecke als Stille bis zum Ende. */
export const VERSUCHE_JE_ABSCHNITT = 2;

export type Stand = "wartet" | "laedt" | "bereit" | "spielt" | "fertig" | "uebersprungen";

export interface Eintrag {
  nr: number;
  text: string;
  stand: Stand;
  versuche: number;
}

export interface Warteschlange {
  /** Ein neuer Abschnitt aus dem Stream. */
  stelleEin(nr: number, text: string): void;
  /** Welche Abschnitte jetzt geholt werden sollen (hoechstens zwei offen). */
  naechsteZumHolen(): Eintrag[];
  /** Das Audio ist da. */
  melde(nr: number, ergebnis: "bereit" | "fehler"): void;
  /** Welcher Abschnitt jetzt gespielt werden soll - oder null. */
  naechsterZumSpielen(): Eintrag | null;
  /** Der gerade gespielte Abschnitt ist zu Ende. */
  fertigGespielt(nr: number): void;
  /** Alles abbrechen. Gibt zurueck, was noch unterwegs war. */
  leere(): number[];
  /** Nur fuer Test und Fehlersuche. */
  stand(): Eintrag[];
}

export function erzeugeWarteschlange(): Warteschlange {
  const eintraege = new Map<number, Eintrag>();
  let spieltGerade: number | null = null;
  let naechsteErwartet = 1;

  const sortiert = () => [...eintraege.values()].sort((a, b) => a.nr - b.nr);
  const offen = () => sortiert().filter((e) => e.stand === "laedt").length;

  return {
    stelleEin(nr, text) {
      if (eintraege.has(nr)) return;
      eintraege.set(nr, { nr, text, stand: "wartet", versuche: 0 });
    },

    naechsteZumHolen() {
      const raus: Eintrag[] = [];
      let frei = HOECHSTENS_GLEICHZEITIG - offen();
      for (const e of sortiert()) {
        if (frei <= 0) break;
        if (e.stand !== "wartet") continue;
        e.stand = "laedt";
        e.versuche += 1;
        raus.push(e);
        frei -= 1;
      }
      return raus;
    },

    melde(nr, ergebnis) {
      const e = eintraege.get(nr);
      if (!e || e.stand !== "laedt") return;
      if (ergebnis === "bereit") { e.stand = "bereit"; return; }
      // Einmal darf es schiefgehen - danach wird der Abschnitt
      // uebersprungen, damit die Antwort nicht daran haengen bleibt.
      e.stand = e.versuche < VERSUCHE_JE_ABSCHNITT ? "wartet" : "uebersprungen";
    },

    naechsterZumSpielen() {
      if (spieltGerade !== null) return null;
      // Streng der Reihe nach: steht Abschnitt 1 noch aus, wartet 2, auch
      // wenn er laengst fertig waere.
      for (;;) {
        const naechster = eintraege.get(naechsteErwartet);
        if (!naechster) return null;
        if (naechster.stand === "uebersprungen") { naechsteErwartet += 1; continue; }
        if (naechster.stand !== "bereit") return null;
        naechster.stand = "spielt";
        spieltGerade = naechster.nr;
        return naechster;
      }
    },

    fertigGespielt(nr) {
      const e = eintraege.get(nr);
      if (e) e.stand = "fertig";
      if (spieltGerade === nr) spieltGerade = null;
      if (naechsteErwartet === nr) naechsteErwartet = nr + 1;
    },

    leere() {
      const unterwegs = sortiert().filter((e) => e.stand === "laedt" || e.stand === "spielt").map((e) => e.nr);
      eintraege.clear();
      spieltGerade = null;
      naechsteErwartet = 1;
      return unterwegs;
    },

    stand: sortiert,
  };
}
