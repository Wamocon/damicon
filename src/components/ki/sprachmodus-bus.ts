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

// --- Freigabe (Klick- oder Aktionskarte) ------------------------------------------
//
// Bekommt der Sprachmodus dieselben Rechte wie der sichtbare Chat (25.09.2026:
// "der Sprachmodus soll die gleichen Rechte haben wie der Chat"), braucht er auch
// dessen Freigabeschritt: eine Aktion, die Daten aendert, zeigt der Chat als Karte
// und wartet auf eine Entscheidung (ki-chat-werkzeuge.ts: klickAnfrage;
// ki-chat-aktionskarte.tsx: eine Aktion im Zustand "freigabe"). Vorher war das der
// Grund, Klicken und Ausfuellen im Sprachmodus ganz zu sperren: "ohne sichtbaren
// Chat gibt es keine Stelle, an der jemand eine Freigabe erteilen koennte". Jetzt
// gibt es diese Stelle: der Chat meldet den Text der offenen Karte hier, der
// Sprachmodus zeigt ihn UND nimmt "Ja"/"Nein" als naechste Aeusserung entgegen,
// statt sie als neue Frage an den Chat weiterzureichen (sprachmodus.tsx,
// istZusageBefehl/istAbsageBefehl in domain/sprachmodus.ts).

export interface FreigabeAnfrage {
  /** Fortlaufend: eine Entscheidung gilt nur fuer GENAU die Anfrage, zu der der
   *  Sprachmodus sie zuletzt gesehen hat - kommt sie zu spaet (die Karte ist
   *  inzwischen weg, z. B. weil im Chat selbst geklickt wurde), passiert nichts. */
  nr: number;
  text: string;
}

let freigabeAnfrage: FreigabeAnfrage | null = null;
let freigabeNr = 0;
let freigabeEntscheider: ((erlaubt: boolean) => void) | null = null;

/** Chat -> Sprachmodus: eine Karte wartet auf Freigabe (oder null: erledigt,
 *  abgebrochen oder zurueckgezogen). `entscheide` loest GENAU diese Anfrage auf -
 *  dieselbe Funktion, die auch ein Klick auf die Karte im Chat selbst aufriefe. */
export function meldeFreigabeAnfrage(text: string | null, entscheide: ((erlaubt: boolean) => void) | null): void {
  // Derselbe Text zaehlt nicht als neue Anfrage - sonst meldete jeder Rerender
  // des Chats (z. B. weil freigabe() bei jedem Aufruf neu entsteht) eine neue
  // Nummer, obwohl sich an der offenen Karte nichts geaendert hat.
  if (text === (freigabeAnfrage?.text ?? null)) {
    freigabeEntscheider = entscheide;
    return;
  }
  freigabeAnfrage = text ? { nr: ++freigabeNr, text } : null;
  freigabeEntscheider = entscheide;
  melde();
}

export function leseFreigabeAnfrage(): FreigabeAnfrage | null {
  return freigabeAnfrage;
}

export function freigabeAnfrageServer(): null {
  return null;
}

/** Sprachmodus -> Chat: "Ja" oder "Nein" zur AKTUELLEN Anfrage. */
export function entscheideFreigabe(erlaubt: boolean): void {
  freigabeEntscheider?.(erlaubt);
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
