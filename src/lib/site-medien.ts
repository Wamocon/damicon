// Alle Bilder der oeffentlichen Seite stehen hier, nicht im Markup: Pfad,
// Reihenfolge und der Textschluessel, unter dem Titel und Beschreibung in
// src/messages/*.json liegen. Ein anderes Foto oder eine andere Reihenfolge ist
// damit eine Datenaenderung an einer Stelle - die Komponenten rendern nur noch,
// was hier steht, und die Texte kommen ohnehin je Sprache aus den Messages.

export type SeitenBild = {
  /** Pfad unter /public, mit fuehrendem Schraegstrich. */
  readonly quelle: string;
  /** Schluesselstamm in den Uebersetzungen: <textKey>Title und <textKey>Text. */
  readonly textKey: string;
};

/** Qualitaetsmaszstab: die drei Einzelbeeren, links nach rechts. */
export type QualitaetsBild = SeitenBild & {
  /** Steuert die Rahmenfarbe - Ausschuss wird abgesetzt, nicht nur benannt. */
  readonly ton: "gut" | "grenzfall" | "ausschuss";
};

export const qualitaetsBeeren: readonly QualitaetsBild[] = [
  { quelle: "/qualitaet/beere-gut.webp", textKey: "q1", ton: "gut" },
  { quelle: "/qualitaet/beere-unreif.webp", textKey: "q2", ton: "grenzfall" },
  { quelle: "/qualitaet/beere-schimmel.webp", textKey: "q3", ton: "ausschuss" },
];

/** Die Schale steht bewusst allein und breit: sie zeigt die Folge, nicht ein Merkmal. */
export const qualitaetsSchale: SeitenBild = {
  quelle: "/qualitaet/schale-ueberfuellt.webp",
  textKey: "tray",
};

// Direktvergleich im Regler. Es sind zwei Aufnahmen, nicht dieselbe Frucht
// vorher und nachher - der Text sagt das auch so. Beide Bilder haben denselben
// Bildausschnitt und dieselbe Lichtsetzung, deshalb liegt die Beere beim
// Ziehen an derselben Stelle und der Unterschied bleibt der Befall.
export const qualitaetsVergleich = {
  links: "/qualitaet/beere-gut.webp",
  rechts: "/qualitaet/beere-schimmel.webp",
} as const;

/** Betrieb: das breite Band ueber der Dreierreihe. */
export const betriebsBand: SeitenBild = {
  quelle: "/betrieb/anlage-weit.webp",
  textKey: "band",
};

/** Betrieb: die Dreierreihe darunter. `offen` markiert den benannten Mangel. */
export type BetriebsBild = SeitenBild & { readonly offen: boolean };

export const betriebsFotos: readonly BetriebsBild[] = [
  { quelle: "/betrieb/polka-frucht.webp", textKey: "photo1", offen: false },
  { quelle: "/betrieb/ernte-steigen.webp", textKey: "photo2", offen: false },
  { quelle: "/betrieb/ernte-lager.webp", textKey: "photo3", offen: true },
];

/** Bestand: vorhandene Technik und das bereits vermarktete Erzeugnis. */
export type BestandsBild = SeitenBild & { readonly marke: boolean };

export const bestandsFotos: readonly BestandsBild[] = [
  { quelle: "/betrieb/technik-traktor.webp", textKey: "asset1", marke: false },
  { quelle: "/betrieb/technik-spritze.webp", textKey: "asset2", marke: false },
  { quelle: "/betrieb/bewaesserung.webp", textKey: "asset3", marke: false },
  { quelle: "/betrieb/produkt-glas.webp", textKey: "asset4", marke: true },
];
