"use client";

// Die Leitung zwischen dem Sprachmodus (sprachmodus.tsx) und dem Chat (ki-chat.tsx).
//
// Der Sprachmodus hat keinen eigenen Chat. Er benutzt DEN Chat im Seitenpanel -
// mit seinem Verlauf, seinen Werkzeugen, der Navigation und dem Vorlesen -,
// nur ohne ihn zu zeigen. Nach dem Sprachmodus steht das ganze Gespraech dort
// zum Nachlesen, und es gibt nicht zwei Wege, die sich auseinanderentwickeln.
//
// In die eine Richtung geht die Frage (Sprachmodus -> Chat), in die andere der
// Stand des Chats (Chat -> Sprachmodus: arbeitet er, spricht er, was sagt er).
// Ein Modul statt eines React-Kontexts: der Stand aendert sich waehrend einer
// Antwort mit jedem Wort, und ein Kontext wuerde damit jedes Mal alles neu
// zeichnen, was am Panel haengt.

export interface ChatStand {
  /** Die Anfrage laeuft noch (Stream oder Werkzeuge im Browser). */
  beschaeftigt: boolean;
  /** Es wird gerade vorgelesen. */
  spricht: boolean;
  /** Vorlesen steht an, der Ton wird noch geholt. */
  laedt: boolean;
  /** Der Text der laufenden bzw. letzten Antwort - fuer die Untertitel. */
  antwort: string;
  /** Die erste Nachricht braucht die Einwilligung, und sie fehlt noch. */
  einwilligungFehlt: boolean;
  /** Die letzte Anfrage ist gescheitert. */
  fehler: boolean;
  /** Der Chat ist bereit (gemountet, Anbieter mit Werkzeugen). */
  bereit: boolean;
}

export interface SprachFrage {
  nr: number;
  text: string;
  sprachen: string[];
}

const LEER: ChatStand = {
  beschaeftigt: false,
  spricht: false,
  laedt: false,
  antwort: "",
  einwilligungFehlt: false,
  fehler: false,
  bereit: false,
};

let stand: ChatStand = LEER;
let frage: SprachFrage | null = null;
let stopp = 0;
let einwilligung = 0;
let frageNr = 0;
const hoerer = new Set<() => void>();

function melde(): void {
  for (const h of hoerer) h();
}

export function abonniereSprachBus(h: () => void): () => void {
  hoerer.add(h);
  return () => hoerer.delete(h);
}

// --- Chat -> Sprachmodus ---------------------------------------------------------

export function meldeChatStand(neu: ChatStand): void {
  if (
    neu.beschaeftigt === stand.beschaeftigt &&
    neu.spricht === stand.spricht &&
    neu.laedt === stand.laedt &&
    neu.antwort === stand.antwort &&
    neu.einwilligungFehlt === stand.einwilligungFehlt &&
    neu.fehler === stand.fehler &&
    neu.bereit === stand.bereit
  ) {
    return;
  }
  stand = neu;
  melde();
}

export function leseChatStand(): ChatStand {
  return stand;
}

export function chatStandServer(): ChatStand {
  return LEER;
}

// --- Sprachmodus -> Chat ---------------------------------------------------------

/** Stellt eine Frage. Der Chat schickt sie im Sprachmodus ab (modus "sprache"). */
export function stelleSprachFrage(text: string, sprachen: string[]): void {
  frage = { nr: ++frageNr, text, sprachen };
  melde();
}

export function leseSprachFrage(): SprachFrage | null {
  return frage;
}

/** Sofort still: laufende Antwort und Vorlesen abbrechen. Zaehlt hoch, damit
 *  zweimal hintereinander auch zweimal wirkt. */
export function unterbrichChat(): void {
  stopp += 1;
  melde();
}

export function leseStopp(): number {
  return stopp;
}

/** Die Einwilligung fuer die erste Nachricht, im Sprachmodus erteilt. */
export function erteileEinwilligung(): void {
  einwilligung += 1;
  melde();
}

export function leseEinwilligung(): number {
  return einwilligung;
}

export function zaehlerServer(): number {
  return 0;
}

// --- Ton entsperren --------------------------------------------------------------
//
// Auf dem iPhone darf Ton nur aus einer Geste heraus beginnen, und zwar im selben
// Durchlauf wie der Tipp. Der Start des Sprachmodus IST so ein Tipp - aber das
// Vorlesen gehoert dem Chat. Der Chat meldet hier, womit er seinen Ton entsperrt,
// und der Sprachmodus ruft das im Klick auf.

let entsperrer: (() => void) | null = null;

export function registriereEntsperren(fn: (() => void) | null): void {
  entsperrer = fn;
}

export function entsperreTon(): void {
  entsperrer?.();
}
