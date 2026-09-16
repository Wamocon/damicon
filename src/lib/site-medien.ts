// Alle Bilder der oeffentlichen Seite stehen hier, nicht im Markup: Pfad,
// Reihenfolge und der Textschluessel, unter dem Titel und Beschreibung in
// src/messages/*.json liegen. Ein anderes Foto oder eine andere Reihenfolge ist
// damit eine Datenaenderung an einer Stelle - die Komponenten rendern nur noch,
// was hier steht, und die Texte kommen ohnehin je Sprache aus den Messages.

import type { ZoneKey } from "@/lib/modules";

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
  /** Pixelmasse der Datei. Die Lupe braucht sie, um den Ausschnitt zu treffen. */
  readonly breite: number;
  readonly hoehe: number;
};

export const qualitaetsBeeren: readonly QualitaetsBild[] = [
  { quelle: "/qualitaet/beere-gut.webp", textKey: "q1", ton: "gut", breite: 1400, hoehe: 757 },
  { quelle: "/qualitaet/beere-unreif.webp", textKey: "q2", ton: "grenzfall", breite: 1400, hoehe: 757 },
  { quelle: "/qualitaet/beere-schimmel.webp", textKey: "q3", ton: "ausschuss", breite: 1400, hoehe: 757 },
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

/**
 * Bild im Schlussblock. Der Handlungsaufruf war der einzige grosse Abschnitt
 * der Seite ganz ohne Bild - eine Farbflaeche mit Text, unmittelbar vor dem
 * Klick ins Dashboard. Die Aufnahme vom 14.09.2026 zeigt den Trieb in der
 * Hand und dahinter die Bergkette: Der letzte Blick vor dem Prototyp gilt dem
 * Betrieb, um den es geht, nicht der Software.
 *
 * Das Bild traegt keine eigene Aussage, die der Text nicht schon sagt, und ist
 * deshalb fuer Screenreader ausgeblendet (alt="").
 */
export const abschlussBild = "/betrieb/rute-hand.webp";

// Bereichskarten "Feld, Hof, Büro, Markt" (ZonesOverview in landing.tsx).
// Die vier Bilder sind erzeugte Symbolbilder, keine Aufnahmen vom Betrieb. Der
// Ausschnitt ist in die Datei geschnitten, die Vorlagen liegen unversioniert
// in Bilder/. Gesichter und Preisschilder bleiben außerhalb. Im Marktbild ist
// die fremde Marke entfernt (Vorlage Bilder/Markt_ohne-Marke.jpg). Das Hofbild
// zeigt in voller Auflösung Äpfel; im Ausschnitt ist davon nur eine kleine
// Kiste zu sehen, so am 11.09.2026 freigegeben.
export const bereichsBilder: Readonly<Record<ZoneKey, string>> = {
  feld: "/bereiche/feld.webp",
  hof: "/bereiche/hof.webp",
  buero: "/bereiche/buero.webp",
  markt: "/bereiche/markt-schale.webp",
};

/** Kurzer, stummer Loop mit Bildausschnitt (components/site/loop-clip.tsx). */
export type LoopClipQuelle = {
  /** `null`, solange es nur das Standbild gibt - dann laeuft kein Video. */
  readonly quelle: string | null;
  readonly poster: string;
  /** Mittelpunkt des Ausschnitts in Prozent und Vergroesserung. */
  readonly fokus: { readonly x: number; readonly y: number; readonly zoom: number };
};

// Nahaufnahme im Bento "Warum die Himbeere anders ist". Hier lief bis zum
// 16.09.2026 derselbe Rundgang wie im Hero, 1,6-fach in den Ausschnitt
// gezogen: aus 1280 x 720 wurden damit rund 800 x 450 auf einer Flaeche von
// etwa 1100 px Breite - sichtbar weich, und dasselbe Material ein zweites Mal
// auf einer Seite, auf der "echte Aufnahmen statt Stockfotos" das Argument
// ist. Jetzt steht dort eine eigene Aufnahme vom 14.09.2026: zwei reife
// Fruechte und eine unreife am selben Trieb, also genau der Punkt der Kachel.
//
// `quelle` ist null, es laeuft also kein Video. Die Bewegung kommt stattdessen
// aus der Scroll-Fahrt (.kapitel-fahrt, siehe loop-clip.tsx). Aufnahme 1 des
// Aufnahmeplans ersetzt das Standbild spaeter durch einen Loop - dafuer reicht
// es, hier `quelle` zu fuellen.
export const beerenNahaufnahme: LoopClipQuelle = {
  quelle: null,
  poster: "/betrieb/frucht-nah.webp",
  fokus: { x: 50, y: 50, zoom: 1 },
};

/** Einzelbilder 00.webp bis (anzahl - 1).webp unter `ordner`. */
export type BildSequenz = {
  readonly ordner: string;
  readonly anzahl: number;
};

// Scroll-Sequenz der 60-Minuten-Szene. Vorlaeufig 36 Einzelbilder aus dem
// Rundgangsvideo (1024 x 576, zusammen rund 1 MB; schmale Viewports laden nur
// jedes zweite). Die Drehsequenz aus dem Shooting ersetzt sie: gleicher
// Ordneraufbau, dann hier nur Ordner und Anzahl aendern.
export const sechzigMinutenSequenz: BildSequenz = {
  ordner: "/sequenz/beere",
  anzahl: 36,
};

/** Feldgeraeusche fuer den Tonschalter: die Tonspur des Rundgangsvideos. */
export const feldTon = "/hero-himbeere.mp4";

/** 3D-Scan der Anlage als Gaussian Splat. */
export type PlantagenScan = {
  readonly quelle: string;
  readonly format: "splat" | "ply";
  /** Dateigroesse, steht auf dem Ladeknopf - niemand soll 30 MB ungefragt laden. */
  readonly megabyte: number;
};

// Noch kein Scan vorhanden. Solange hier null steht, erscheint der Abschnitt
// nicht. Aufnahme und Export beschreibt docs/aufnahmeplan.md.
export const plantagenScan = null as PlantagenScan | null;
