// Wo steht der Assistent - in der Mitte oder an der Seite?
//
// Beide Darstellungen gibt es laengst ("buehne" ist die Mitte, ki-pane.css
// nennt sie so). Neu ist, wann gewechselt wird und wie lange es haelt.
//
// Bisher war das Andocken eine LEIHGABE: begann eine Fuehrung, dockte das
// Panel an den Rand und sprang danach in die Mitte zurueck
// (ki-pane-kontext.tsx:266-277). Das ist genau verkehrt herum. Wer den
// Agenten etwas zeigen laesst, will die Seite sehen - und beim naechsten Mal
// wieder. Ein Panel, das nach jeder Tour in die Mitte zurueckspringt und die
// Seite verdeckt, nimmt dem Agenten den Sinn.
//
// Also: die erste Navigation des Agenten stellt dauerhaft auf "seite" um, und
// dort bleibt es - ueber weitere Fragen, weitere Stationen und ein Neuladen
// hinweg. Zurueck in die Mitte fuehrt nur ein Knopf im Panelkopf oder eine
// neue Anmeldung.
//
// Hier steht nur die Entscheidung, ohne React und ohne Browser, damit sie
// sich Fall fuer Fall pruefen laesst.

export type Darstellung = "seite" | "buehne";

/** Was den Wechsel ausloesen kann. */
export type Ausloeser =
  /** Der Agent oeffnet eine Ansicht im Hauptfenster (fuehreZu/oeffneZiel). */
  | "agent-navigation"
  /** Der Knopf im Panelkopf: zurueck in die Mitte. */
  | "knopf-mitte"
  /** Der Knopf im Panelkopf: an die Seite. */
  | "knopf-seite"
  /** Eine neue Anmeldung raeumt die gemerkte Wahl weg. */
  | "neue-anmeldung";

export type Zustand = { darstellung: Darstellung; offen: boolean };

/** Die Voreinstellung: der Assistent steht in der Mitte und ist zu. */
export const ANFANG: Zustand = { darstellung: "buehne", offen: false };

export const DARSTELLUNG_SCHLUESSEL = "damicon-ki-darstellung";
export const OFFEN_SCHLUESSEL = "damicon-ki-offen";

export function istDarstellung(wert: unknown): wert is Darstellung {
  return wert === "seite" || wert === "buehne";
}

/**
 * Der naechste Zustand.
 *
 * @param schalterAn KI_AGENT_SEITENANSICHT. Steht er aus, aendert die
 *   Navigation des Agenten nichts - dann gilt das Verhalten von vorher.
 */
export function naechsterZustand(aktuell: Zustand, ausloeser: Ausloeser, schalterAn: boolean): Zustand {
  switch (ausloeser) {
    case "agent-navigation":
      // Ohne den Schalter bleibt alles, wie es war.
      if (!schalterAn) return aktuell;
      // Und es oeffnet sich: eine Fuehrung, die niemand sieht, ist keine.
      return { darstellung: "seite", offen: true };
    case "knopf-mitte":
      return { ...aktuell, darstellung: "buehne" };
    case "knopf-seite":
      return { ...aktuell, darstellung: "seite" };
    case "neue-anmeldung":
      return ANFANG;
  }
}
