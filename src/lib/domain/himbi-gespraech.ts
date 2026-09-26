// Himbi im Sprachmodus: die Rechnung der Bildschleife (components/ki/sprach-himbi.tsx)
// als reine Funktionen, damit sie ohne Browser pruefbar ist (supabase/tests/haustier.ts).
// Die Komponente liest nur noch Pegel, Spektrum und Masse und schreibt das Ergebnis.
//
// Bis zum 25.09.2026 steckte das alles in einer Closure in useEffect; die
// Gegenpruefung fand, dass keine einzige Veraenderung daran von einem Test bemerkt
// wurde (0 von 15 Mutationen).

import { AUGEN_MAX, BLICK_DENKT, blickRichtung, type HaustierZustand } from "@/lib/haustier";
import { baenderAus, MUND_ZU, mundAusKlang, naeher, type Mundform } from "@/lib/domain/lippen";

export type SprachZustand = "hoert" | "denkt" | "spricht" | "pausiert" | "fehler";

/** Welche Figur-Pose zu welchem Gespraechszustand gehoert. */
export const HIMBI_ZUSTAND: Record<SprachZustand, HaustierZustand> = {
  hoert: "ruhe",
  denkt: "denkt",
  spricht: "spricht",
  pausiert: "schlaeft",
  fehler: "fehler",
};

/** Mund beim Sprechen, wenn Bewegung reduziert ist: ruhig offen, ohne Silben. */
export const RUHIG_OFFEN: Mundform = { offen: 0.3, breite: 0.5, rund: 0, zaehne: 0 };

// ---- Latenz ---------------------------------------------------------------------------

export interface MundEintrag {
  t: number;
  m: Mundform;
}

/** Latenzausgleich: legt die Form dieses Bilds ab und gibt die Form zurueck, die
 *  latenzMs alt ist, also gerade aus dem Lautsprecher klingt. Der Analyser misst vor dem
 *  Geraet; ohne den Puffer eilte der Mund bei Bluetooth-Kopfhoerern sichtbar vor.
 *  Veraendert verlauf (haelt nur, was noch faellig werden kann). */
export function faelligeForm(verlauf: MundEintrag[], jetzt: number, form: Mundform, latenzMs: number): Mundform {
  // Eine ungueltige Latenz (NaN) liesse den Puffer nie kuerzen: der Mund stuende still.
  const latenz = Number.isFinite(latenzMs) && latenzMs > 0 ? latenzMs : 0;
  verlauf.push({ t: jetzt, m: form });
  while (verlauf.length > 1 && verlauf[1]!.t <= jetzt - latenz) verlauf.shift();
  return verlauf[0]!.m;
}

// ---- Klang zu Zielform -----------------------------------------------------------------

export interface KlangBild {
  /** Pegel der Ausgabe (RMS) dieses Bilds. */
  pegel: number;
  /** Spektrum der Ausgabe, null ohne Analyser oder bei angehaltenem Kontext. */
  spektrum: { frequenzen: ArrayLike<number>; abtastrate: number; fftGroesse: number; minDb: number; maxDb: number } | null;
  /** Spielt gerade der Datei-Weg (<audio>) am Analyser vorbei? */
  elementSpielt: boolean;
}

/** Die Zielform eines Bilds beim Sprechen: Lautheit ist der Pegel geteilt durch die
 *  laufende Spitze, die Form kommt aus dem Spektrum. Ist am Analyser nichts zu hoeren,
 *  aber der Datei-Weg spielt, der Takt-Mund. Ohne Spektrum und ohne Datei-Weg: zu. */
export function sprechZiel(bild: KlangBild, spitze: number, jetzt: number): Mundform {
  if (bild.pegel === 0 && bild.elementSpielt) return taktMund(jetzt);
  const s = bild.spektrum;
  if (!s || spitze <= 0) return MUND_ZU;
  return mundAusKlang(bild.pegel / spitze, baenderAus(s.frequenzen, s.abtastrate, s.fftGroesse, s.minDb, s.maxDb));
}

// ---- Was sichtbar wird ----------------------------------------------------------------

/** Der Mund, der gezeichnet wird. Mit reduzierter Bewegung (WCAG 2.3.3) steht er still:
 *  beim Sprechen ruhig offen, sonst zu; Schein, Symbol und Zustandstext sagen dann, wer
 *  dran ist. */
export function sichtbareForm(still: boolean, zustand: SprachZustand, mund: Mundform): Mundform {
  if (!still) return mund;
  return zustand === "spricht" ? RUHIG_OFFEN : MUND_ZU;
}

/** Laecheln des Mundes: beim Nachdenken fast gerade, sonst das gewohnte Laecheln. */
export function laechelnFuer(zustand: SprachZustand): number {
  return zustand === "denkt" ? 0.2 : 1;
}

/** Ziel des Scheins hinter Himbi, 0..1: beim Zuhoeren die eigene Stimme (die wichtigste
 *  Rueckmeldung: "er hoert mich"), beim Sprechen die Oeffnung des Mundes, sonst nichts. */
export function scheinZiel(zustand: SprachZustand, mikrofonPegel: number, offen: number): number {
  if (zustand === "hoert") return Math.min(1, Math.max(0, mikrofonPegel * 6));
  if (zustand === "spricht") return Math.min(1, Math.max(0, offen));
  return 0;
}

/** Glaettung des Scheins: schneller Anstieg, langsames Abklingen, zeitbasiert wie der
 *  Mund (vorher je Bild um feste Anteile, bei 120 Hz also doppelt so schnell). */
export const SCHEIN_GLAETTUNG = { aufMs: 24, zuMs: 130 } as const;

export function glaetteSchein(bisher: number, ziel: number, dtMs: number): number {
  const dt = Math.min(Math.max(dtMs, 0), 100);
  return naeher(bisher, ziel, dt, ziel > bisher ? SCHEIN_GLAETTUNG.aufMs : SCHEIN_GLAETTUNG.zuMs);
}

/** Deckkraft und Groesse des Scheins aus seinem Wert (0..1). */
export function scheinStil(wert: number): { deckkraft: number; groesse: number } {
  return { deckkraft: 0.55 + wert * 0.45, groesse: 0.92 + wert * 0.3 };
}

/** Nicken: der Koerper hebt sich mit der Oeffnung des Mundes, in Prozent der Hoehe. */
export function nickenProzent(offen: number): number {
  return -3 * Math.min(1, Math.max(0, offen));
}

// ---- Blick ----------------------------------------------------------------------------

/** Blick im Gespraech: zum hervorgehobenen Bereich (ausser im Schlaf), sonst beim Denken
 *  nach oben (wie in der Ecke), links angedockt beim Sprechen zur Seite hin, und beim
 *  Zuhoeren geradeaus zur Person. dx/dy: Abstand des Ziels von den Augen in Pixeln. */
export function blickImGespraech(
  zustand: SprachZustand,
  zielAbstand: { dx: number; dy: number } | null,
  links: boolean,
): { x: number; y: number } {
  if (zielAbstand && zustand !== "pausiert") return blickRichtung(zielAbstand.dx, zielAbstand.dy);
  if (zustand === "denkt") return { ...BLICK_DENKT };
  if (links && zustand === "spricht") return { x: AUGEN_MAX * 0.5, y: 0 };
  return { x: 0, y: 0 };
}

// ---- Rueckfall ohne Spektrum ----------------------------------------------------------

/** Mund im festen Takt fuer eine Wiedergabe, deren Klang die Figur nicht hoert (der
 *  Datei-Weg der Sprachausgabe spielt ueber ein <audio>-Element, nicht ueber den
 *  gemeinsamen Ausgang). Zwei ueberlagerte Schwingungen um 4 bis 5 Silben je Sekunde,
 *  damit es nicht wie ein Metronom aussieht. Ehrlich gesagt: das folgt NICHT der Stimme. */
export function taktMund(zeitMs: number): Mundform {
  const s = zeitMs / 1000;
  const welle = 0.5 + 0.3 * Math.sin(s * 2 * Math.PI * 4.3) + 0.2 * Math.sin(s * 2 * Math.PI * 1.7 + 1);
  const offen = Math.min(1, Math.max(0, welle)) * 0.6;
  return { offen, breite: 0.5, rund: 0, zaehne: 0 };
}

// ---- Ruhe -----------------------------------------------------------------------------

/** Darf die Bildschleife schlafen? In Pause und Fehler, sobald Mund und Schein zur Ruhe
 *  gekommen sind; ein Zustandswechsel weckt sie wieder. */
export function darfRuhen(zustand: SprachZustand, mund: Mundform, schein: number): boolean {
  return (zustand === "pausiert" || zustand === "fehler") && mund.offen < 0.01 && schein < 0.01;
}
