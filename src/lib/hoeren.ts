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

let ktx: AudioContext | null = null;
let analyse: AnalyserNode | null = null;
// Ausdruecklich ueber ArrayBuffer: getByteFrequencyData nimmt keinen SharedArrayBuffer,
// und ohne diese Angabe waere der Puffer allgemeiner typisiert als die Methode erlaubt.
let roh: Uint8Array<ArrayBuffer> | null = null;
let pegel = 0;
let frame = 0;

/** Ein Wert zwischen 0 und 1: wie laut gerade gesprochen wird. 0, wenn nichts laeuft. */
export function lesePegel(): number {
  return pegel;
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
    const quelle = ktx.createMediaStreamSource(strom);
    analyse = ktx.createAnalyser();
    analyse.fftSize = 256;
    // Geglaettet, sonst flackert der Streifen und die Kugel zittert.
    analyse.smoothingTimeConstant = 0.72;
    quelle.connect(analyse);
    roh = new Uint8Array(new ArrayBuffer(analyse.frequencyBinCount));
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
  pegel = 0;
  void ktx?.close().catch(() => {});
  ktx = null;
}
