// Pegel und Spektrum der Sprachausgabe: damit Himbi im Sprachmodus die Lippen im
// Takt der Stimme bewegt (components/ki/sprach-himbi.tsx, lib/domain/lippen.ts) -
// das Gegenstueck zu lib/hoeren.ts (Mikrofonpegel). Das Dazwischenreden im
// Sprachmodus vergleicht den Pegel ausserdem mit dem Mikrofon, um das eigene Echo
// zu erkennen (domain/sprachmodus.ts).
//
// Ein Modul mit einem einzigen Zustand, aus demselben Grund wie dort: es gibt
// hoechstens eine laufende Wiedergabe, und die Figur liest Pegel und Spektrum
// ohnehin in ihrer eigenen Bildschleife ab - ein React-Kontext wuerde nur
// unnoetige Renderdurchlaeufe erzeugen.
//
// Strom und Abschnitte (components/ki/sprachausgabe-strom.ts und
// sprachausgabe-live.ts) spielen ueber EINEN Ausgang je AudioContext
// (ausgangFuer): Ausgang -> Analyse -> Lautsprecher. Bis zum 24.09.2026 bekam
// jeder Abschnitt einen eigenen Analyser, der nach dem Abschnitt haengen blieb.
// Der Datei-Weg (components/ki/sprachausgabe.tsx) spielt dagegen ueber ein
// <audio>-Element an diesem Ausgang vorbei; er meldet sich nur mit
// meldeElementWiedergabe, damit Himbi dort wenigstens im Takt spricht.

let kontextDesAusgangs: AudioContext | null = null;
let ausgang: GainNode | null = null;
let analyse: AnalyserNode | null = null;
let roh: Uint8Array<ArrayBuffer> | null = null;

/** Der gemeinsame Ausgang fuer einen AudioContext. Wird beim ersten Aufruf
 *  angelegt (Ausgang -> Analyse -> Lautsprecher); gibt es keine Analyse, geht
 *  der Ausgang direkt auf den Lautsprecher. */
export function ausgangFuer(kontext: AudioContext): AudioNode {
  if (ausgang && kontextDesAusgangs === kontext) return ausgang;
  kontextDesAusgangs = kontext;
  ausgang = kontext.createGain();
  try {
    analyse = kontext.createAnalyser();
    analyse.fftSize = 512;
    // Wirkt nur auf das Spektrum (die Lippen), nicht auf das Zeitsignal des Pegels.
    // 0,3 statt 0,6: sonst hinkt der Mund jeder Silbe ein paar Bilder hinterher.
    analyse.smoothingTimeConstant = 0.3;
    roh = new Uint8Array(new ArrayBuffer(analyse.fftSize));
    ausgang.connect(analyse);
    analyse.connect(kontext.destination);
  } catch {
    // Ohne Analyse spielt die Wiedergabe trotzdem - Himbis Mund bleibt dann fuer
    // die Ausgabe zu, ohne dass sonst etwas davon merkt.
    analyse = null;
    roh = null;
    ausgang.connect(kontext.destination);
  }
  return ausgang;
}

/** Klingt der Ausgang gerade? Ein angehaltener AudioContext (sprach-takt.ts haelt die
 *  Stimme beim Seitenwechsel bis zu 3,5 s an) liefert im Analyser weiter den zuletzt
 *  gerechneten Block: ohne diese Pruefung stand Himbis Mund in der Zeit offen, und der
 *  Waechter fuer das Dazwischenreden sah ein Echo, wo nichts klang (Gegenpruefung vom
 *  25.09.2026, in Chromium nachgemessen). */
function ausgangKlingt(): boolean {
  return kontextDesAusgangs !== null && kontextDesAusgangs.state === "running";
}

/** Wird regelmaessig aus einer Bildschleife aufgerufen (Himbi, sprach-himbi.tsx) und
 *  vom Waechter fuer das Dazwischenreden (sprachmodus.tsx) - dieses Modul haelt selbst
 *  keine Bildschleife, damit es nicht Bild fuer Bild laeuft, wenn gerade niemand
 *  hinsieht. Ohne Wiedergabe und bei angehaltenem Kontext 0. */
export function leseAusgabePegel(): number {
  if (!analyse || !roh || !ausgangKlingt()) return 0;
  analyse.getByteTimeDomainData(roh);
  let summe = 0;
  for (let i = 0; i < roh.length; i++) {
    const abweichung = (roh[i]! - 128) / 128;
    summe += abweichung * abweichung;
  }
  return Math.sqrt(summe / roh.length);
}

export interface AusgabeSpektrum {
  /** Betrag je Frequenz-Bin, 0..255 (dB-skaliert zwischen minDb und maxDb). */
  frequenzen: Uint8Array<ArrayBuffer>;
  abtastrate: number;
  fftGroesse: number;
  minDb: number;
  maxDb: number;
  /** Wie viel spaeter das Gemessene aus dem Lautsprecher klingt, in Sekunden
   *  (siehe ausgabeLatenz). */
  latenz: number;
}

/** Hoechstens so viel Latenz wird ausgeglichen, in Sekunden. */
export const LATENZ_HOECHSTENS = 0.4;

/** Wie viel spaeter das im Analyser Gemessene aus dem Lautsprecher klingt:
 *  outputLatency + baseLatency des AudioContext, begrenzt auf 0..LATENZ_HOECHSTENS.
 *  Fehlende oder ungueltige Werte zaehlen als 0. Ob ein Browser die Latenz von
 *  Bluetooth-Kopfhoerern darin meldet, haengt von Browser und Betriebssystem ab
 *  (web.dev misst 0 bis 25 ms eingebaut und rund 180 ms Bluetooth); meldet er sie
 *  nicht, eilt der Mund dort weiter vor. */
export function ausgabeLatenz(outputLatency: number | undefined, baseLatency: number | undefined): number {
  const aus = typeof outputLatency === "number" && Number.isFinite(outputLatency) ? outputLatency : 0;
  const basis = typeof baseLatency === "number" && Number.isFinite(baseLatency) ? baseLatency : 0;
  return Math.min(Math.max(aus + basis, 0), LATENZ_HOECHSTENS);
}

let spektrum: Uint8Array<ArrayBuffer> | null = null;

/** Das Spektrum der laufenden Ausgabe, fuer die Lippen von Himbi im Sprachmodus
 *  (components/ki/sprach-himbi.tsx, lib/domain/lippen.ts). Liest denselben Analyser
 *  wie leseAusgabePegel: dessen Zeitsignal, von dem das Dazwischenreden abhaengt,
 *  bleibt davon unberuehrt. Ohne Wiedergabe null. */
export function leseAusgabeSpektrum(): AusgabeSpektrum | null {
  if (!analyse || !kontextDesAusgangs || !ausgangKlingt()) return null;
  if (!spektrum || spektrum.length !== analyse.frequencyBinCount) {
    spektrum = new Uint8Array(new ArrayBuffer(analyse.frequencyBinCount));
  }
  analyse.getByteFrequencyData(spektrum);
  const k = kontextDesAusgangs as AudioContext & { outputLatency?: number };
  return {
    frequenzen: spektrum,
    abtastrate: kontextDesAusgangs.sampleRate,
    fftGroesse: analyse.fftSize,
    minDb: analyse.minDecibels,
    maxDb: analyse.maxDecibels,
    latenz: ausgabeLatenz(k.outputLatency, k.baseLatency),
  };
}

let elementSpielt = false;

/** Der Datei-Weg der Sprachausgabe (sprachausgabe.tsx, <audio>-Element) meldet hier,
 *  ob er gerade spielt. Sein Klang laeuft am Analyser vorbei; Himbi bewegt den Mund
 *  dann im festen Takt statt nach dem Klang (domain/himbi-gespraech.ts, taktMund). */
export function meldeElementWiedergabe(spielt: boolean): void {
  elementSpielt = spielt;
}

export function spieltUeberElement(): boolean {
  return elementSpielt;
}

/** Nur fuer Tests: vergisst Ausgang und Analyser. */
export function setzeAusgangZurueck(): void {
  kontextDesAusgangs = null;
  ausgang = null;
  analyse = null;
  roh = null;
  spektrum = null;
  elementSpielt = false;
}
