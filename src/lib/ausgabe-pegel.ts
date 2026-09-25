// Der Pegel der Sprachausgabe, damit die Kugel des Sprachmodus auf die Stimme
// des Assistenten reagiert - das Gegenstueck zu lib/hoeren.ts (Mikrofonpegel).
// Das Dazwischenreden im Sprachmodus vergleicht ihn ausserdem mit dem
// Mikrofon, um das eigene Echo zu erkennen (domain/sprachmodus.ts).
//
// Ein Modul mit einem einzigen Zustand, aus demselben Grund wie dort: es gibt
// hoechstens eine laufende Wiedergabe, und die Kugel liest den Pegel ohnehin
// in ihrer eigenen Bildschleife ab - ein React-Kontext wuerde nur unnoetige
// Renderdurchlaeufe erzeugen.
//
// Alles, was vorliest, spielt ueber EINEN Ausgang je AudioContext (ausgangFuer):
// Ausgang -> Analyse -> Lautsprecher. Bis zum 24.09.2026 bekam jeder Abschnitt
// einen eigenen Analyser, der nach dem Abschnitt haengen blieb; der Strom
// (components/ki/sprachausgabe-strom.ts) spielt Hunderte kleiner Stuecke und
// braucht einen festen Ausgang.

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
    analyse.smoothingTimeConstant = 0.6;
    roh = new Uint8Array(new ArrayBuffer(analyse.fftSize));
    ausgang.connect(analyse);
    analyse.connect(kontext.destination);
  } catch {
    // Ohne Analyse spielt die Wiedergabe trotzdem - die Kugel bleibt dann fuer
    // die Ausgabe stumm, ohne dass jemand etwas davon merkt.
    analyse = null;
    roh = null;
    ausgang.connect(kontext.destination);
  }
  return ausgang;
}

/** Muss regelmaessig aus einer eigenen requestAnimationFrame-Schleife (der Kugel)
 *  aufgerufen werden - dieses Modul haelt selbst keine Bildschleife, damit es nicht
 *  Bild fuer Bild laeuft, wenn gerade niemand hinsieht. Ohne Wiedergabe 0. */
export function leseAusgabePegel(): number {
  if (!analyse || !roh) return 0;
  analyse.getByteTimeDomainData(roh);
  let summe = 0;
  for (let i = 0; i < roh.length; i++) {
    const abweichung = (roh[i]! - 128) / 128;
    summe += abweichung * abweichung;
  }
  return Math.sqrt(summe / roh.length);
}
