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

/** Die Voreinstellung der Anwendung: angedockt und zu.
 *
 *  Wichtig, weil der Auftrag es anders liest ("zurueck zur Mitte nach neuer
 *  Anmeldung"): die Mitte war NIE die Voreinstellung. ki-pane-kontext.tsx
 *  startet seit jeher mit "seite", auch vor dieser Aenderung. Eine neue
 *  Anmeldung stellt deshalb nicht auf die Mitte um, sondern vergisst die
 *  gemerkte Wahl - danach gilt wieder, womit die Anwendung beginnt.
 *
 *  Die Mitte ist das, was jemand selbst ueber den Knopf im Panelkopf waehlt;
 *  die Navigation des Agenten holt das Panel dann zurueck an die Seite. */
export const ANFANG: Zustand = { darstellung: "seite", offen: false };

export const DARSTELLUNG_SCHLUESSEL = "damicon-ki-darstellung";
export const OFFEN_SCHLUESSEL = "damicon-ki-offen";
/** Zu wem die gemerkte Ansicht gehoert. Ohne das erbt die naechste Person,
 *  die sich an diesem Rechner anmeldet, die Ansicht ihrer Vorgaengerin -
 *  samt geoeffnetem Panel. */
export const NUTZER_SCHLUESSEL = "damicon-ki-nutzer";

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
