// Der Pegel der Sprachausgabe, damit die Kugel des Sprachmodus auf die Stimme
// des Assistenten reagiert - das Gegenstueck zu lib/hoeren.ts (Mikrofonpegel).
//
// Ein Modul mit einem einzigen Zustand, aus demselben Grund wie dort: es gibt
// hoechstens eine laufende Wiedergabe, und die Kugel liest den Pegel ohnehin
// in ihrer eigenen Bildschleife ab - ein React-Kontext wuerde nur unnoetige
// Renderdurchlaeufe erzeugen.
//
// Angeschlossen wird an EINER Stelle: components/ki/sprachausgabe-live.ts haengt
// bei jedem AudioBufferSourceNode einen AnalyserNode dazwischen (verbindeAnalyse
// unten). Ohne laufende Wiedergabe steht der Pegel auf 0.

let analyse: AnalyserNode | null = null;
let roh: Uint8Array<ArrayBuffer> | null = null;
let pegel = 0;

/** Haengt einen AnalyserNode zwischen eine Quelle und ihr Ziel: quelle -> Analyse -> ziel.
 *  Ersetzt eine vorige Analyse desselben Kontexts. Wird bei jedem neuen Abschnitt
 *  erneut aufgerufen (ein Abschnitt = eine Quelle), die Kugel liest ohne Kenntnis davon. */
export function verbindeAnalyse(kontext: AudioContext, quelle: AudioNode, ziel: AudioNode): void {
  try {
    analyse = kontext.createAnalyser();
    analyse.fftSize = 512;
    analyse.smoothingTimeConstant = 0.6;
    roh = new Uint8Array(new ArrayBuffer(analyse.fftSize));
    quelle.connect(analyse);
    analyse.connect(ziel);
  } catch {
    // Ohne Analyse spielt die Wiedergabe trotzdem - die Kugel bleibt dann fuer
    // die Ausgabe stumm, ohne dass jemand etwas davon merkt.
    analyse = null;
    roh = null;
  }
}

export function trenneAnalyse(): void {
  analyse = null;
  roh = null;
  pegel = 0;
}

/** Muss regelmaessig aus einer eigenen requestAnimationFrame-Schleife (der Kugel)
 *  aufgerufen werden - dieses Modul haelt selbst keine Bildschleife, damit es nicht
 *  Bild fuer Bild laeuft, wenn gerade niemand hinsieht. */
export function leseAusgabePegel(): number {
  if (!analyse || !roh) return 0;
  analyse.getByteTimeDomainData(roh);
  let summe = 0;
  for (let i = 0; i < roh.length; i++) {
    const abweichung = (roh[i]! - 128) / 128;
    summe += abweichung * abweichung;
  }
  pegel = Math.sqrt(summe / roh.length);
  return pegel;
}
