// Der Pegel des Mikrofons, damit die Figur auf die Stimme reagiert statt auf eine Uhr.
//
// Bewusst ein Modul mit einem einzigen Zustand und ohne React: es gibt genau ein
// Mikrofon, und die beiden Stellen, die zuhoeren (die Frequenzkugel hinter der Figur und
// der Streifen neben dem Knopf), zeichnen ohnehin in ihrer eigenen Bildschleife. Ein
// Kontext wuerde hier sechzig Renderdurchlaeufe je Sekunde ausloesen, um eine Zahl
// weiterzureichen, die beide sowieso jedes Bild selbst abholen.
//
// Der Knopf (ki/mikrofon.tsx) hat den Datenstrom schon - er reicht ihn hier herein und
// meldet sich beim Stoppen wieder ab. Ohne laufende Aufnahme steht der Pegel auf 0, und
// alles, was ihn liest, verhaelt sich wie vorher.

import { pegelAusZeitbereich } from "@/lib/domain/diktat";

let ktx: AudioContext | null = null;
let analyse: AnalyserNode | null = null;
// Ausdruecklich ueber ArrayBuffer: getByteFrequencyData nimmt keinen SharedArrayBuffer,
// und ohne diese Angabe waere der Puffer allgemeiner typisiert als die Methode erlaubt.
let roh: Uint8Array<ArrayBuffer> | null = null;
// Zweiter Analyser fuer die Lautstaerke (RMS) - mit laengerem Fenster als das
// Frequenzbild, sonst zittert der Wert von Bild zu Bild.
let zeitAnalyse: AnalyserNode | null = null;
let zeitRoh: Uint8Array<ArrayBuffer> | null = null;
let pegel = 0;
let lautstaerke = 0;
let frame = 0;

/** Ein Wert zwischen 0 und 1: wie laut gerade gesprochen wird. 0, wenn nichts laeuft. */
export function lesePegel(): number {
  return pegel;
}

/** Lautstaerke als RMS 0..1 - dieselbe Skala wie pegelAusZeitbereich() und die
 *  Stilleerkennung des Diktats (domain/diktat.ts). Der Sprachmodus erkennt daran,
 *  dass jemand dazwischenspricht (domain/sprachmodus.ts). 0, wenn nichts laeuft. */
export function leseLautstaerke(): number {
  return lautstaerke;
}

/** Das Frequenzbild, auf `anzahl` Baender gemittelt, jeweils zwischen 0 und 1.
 *  Die oberen Bins sind bei Sprache fast immer leer - darum nur die unteren zwei
 *  Drittel, sonst waere die Haelfte des Streifens dauerhaft flach. */
export function leseBaender(anzahl: number): number[] {
  const baender = new Array<number>(anzahl).fill(0);
  if (!roh) return baender;
  const nutzbar = Math.floor(roh.length * 0.66);
  const breite = Math.max(1, Math.floor(nutzbar / anzahl));
  for (let i = 0; i < anzahl; i++) {
    let summe = 0;
    for (let j = 0; j < breite; j++) summe += roh[i * breite + j] ?? 0;
    baender[i] = summe / breite / 255;
  }
  return baender;
}

/** Haengt sich an einen laufenden Aufnahmestrom. Gibt zurueck, womit man wieder loskommt. */
export function starteHoeren(strom: MediaStream): () => void {
  stoppeHoeren();
  const Klasse =
    typeof window === "undefined"
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Klasse) return () => {};

  try {
    ktx = new Klasse();
    // Entsteht der Kontext erst nach der Mikrofonfreigabe, also ausserhalb der Geste,
    // beginnt er in Safari angehalten - der Analyser laese dann nur Nullen.
    if (ktx.state === "suspended") void ktx.resume().catch(() => {});
    const quelle = ktx.createMediaStreamSource(strom);
    analyse = ktx.createAnalyser();
    analyse.fftSize = 256;
    // Geglaettet, sonst flackert der Streifen und die Kugel zittert.
    analyse.smoothingTimeConstant = 0.72;
    quelle.connect(analyse);
    roh = new Uint8Array(new ArrayBuffer(analyse.frequencyBinCount));
    zeitAnalyse = ktx.createAnalyser();
    zeitAnalyse.fftSize = 1024;
    quelle.connect(zeitAnalyse);
    zeitRoh = new Uint8Array(new ArrayBuffer(zeitAnalyse.fftSize));
  } catch {
    // Kein Web Audio, gesperrter Kontext: die Figur schwingt dann wie bisher nach Uhr.
    stoppeHoeren();
    return () => {};
  }

  const schritt = () => {
    if (!analyse || !roh) return;
    analyse.getByteFrequencyData(roh);
    let summe = 0;
    for (let i = 0; i < roh.length; i++) summe += roh[i]!;
    pegel = summe / roh.length / 255;
    if (zeitAnalyse && zeitRoh) {
      zeitAnalyse.getByteTimeDomainData(zeitRoh);
      lautstaerke = pegelAusZeitbereich(zeitRoh);
    }
    frame = window.requestAnimationFrame(schritt);
  };
  frame = window.requestAnimationFrame(schritt);

  return stoppeHoeren;
}

export function stoppeHoeren(): void {
  if (frame) window.cancelAnimationFrame(frame);
  frame = 0;
  analyse = null;
  roh = null;
  zeitAnalyse = null;
  zeitRoh = null;
  pegel = 0;
  lautstaerke = 0;
  void ktx?.close().catch(() => {});
  ktx = null;
}
