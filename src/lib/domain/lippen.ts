// Lippen fuer Himbi im Sprachmodus: aus dem Klang der Sprachausgabe eine Mundform.
//
// Warum aus dem Klang und nicht aus Phonemen: die Stimme kommt von Soniox als
// fertiges Audio ohne Laut- oder Wortzeitstempel, und sie spricht Deutsch,
// Englisch, Russisch und Kasachisch. Eine Analyse des Spektrums braucht weder
// Zeitstempel noch ein Sprachmodell und ist darum in allen vier Sprachen gleich
// gut (Recherche vom 25.09.2026, docs/infra/sprachmodus.md, Abschnitt Himbi).
// Gelesen wird am gemeinsamen Ausgang (lib/ausgabe-pegel.ts): was dort ankommt,
// klingt gleich darauf aus dem Lautsprecher.
//
// Drei Groessen statt einer Tabelle fester Mundbilder:
//   offen  0..1  wie weit der Kiefer offen ist (Lautstaerke, bei Zischlauten weniger)
//   breite 0..1  breit gezogen (E, I) oder schmal (O, U)
//   rund   0..1  gerundete Lippen (O, U)
//   zaehne 0..1  Zaehne sichtbar (S, F, Sch, Z)
// Aus ihnen entsteht die Form stufenlos. Das wirkt bei einer kleinen 2D-Figur
// ruhiger als harte Wechsel zwischen sechs bis neun Mundbildern, und falsche
// Zuordnungen fallen nicht auf, weil die Form nie ganz falsch springt.
//
// Alles hier ist reine Rechnung ohne DOM: die Bildschleife sitzt in
// components/ki/sprach-himbi.tsx, die Tests rufen diese Funktionen direkt auf.

export interface Mundform {
  offen: number;
  breite: number;
  rund: number;
  zaehne: number;
}

export const MUND_ZU: Mundform = { offen: 0, breite: 0.5, rund: 0, zaehne: 0 };

/** Frequenzbaender in Hz (Recherche vom 25.09.2026, Formantbereiche nach der
 *  UPF-Arbeit zu Lippensynchronisation im Browser). Grund: Grundton und das
 *  Brummen der Nasale M und N (Lippen zu). Tief: erster Formant von O und U.
 *  Mitte: erster Formant von A, der Kiefer. Hoch: zweiter Formant von E und I
 *  (breite Lippen). Zisch: Reibelaute S, Sch, F, Z. */
export const BAENDER = {
  grund: [80, 300],
  tief: [300, 700],
  mitte: [700, 1800],
  hoch: [1800, 4000],
  zisch: [4000, 8000],
} as const;

export interface Baender {
  grund: number;
  tief: number;
  mitte: number;
  hoch: number;
  zisch: number;
}

const klemme = (x: number, min = 0, max = 1) => (x < min ? min : x > max ? max : x);

/** Die Energie je Band aus getByteFrequencyData (0..255, dB-skaliert zwischen
 *  minDecibels und maxDecibels des Analysers) als lineare Leistung, gemittelt
 *  ueber die Bins des Bands. */
export function baenderAus(
  frequenzen: ArrayLike<number>,
  abtastrate: number,
  fftGroesse: number,
  minDb = -100,
  maxDb = -30,
): Baender {
  const binHz = abtastrate / fftGroesse;
  const band = ([von, bis]: readonly [number, number]) => {
    const a = Math.max(1, Math.floor(von / binHz));
    const b = Math.min(frequenzen.length - 1, Math.ceil(bis / binHz));
    if (b < a) return 0;
    let summe = 0;
    for (let i = a; i <= b; i++) {
      const db = minDb + ((frequenzen[i] ?? 0) / 255) * (maxDb - minDb);
      summe += Math.pow(10, db / 10);
    }
    return summe / (b - a + 1);
  };
  return { grund: band(BAENDER.grund), tief: band(BAENDER.tief), mitte: band(BAENDER.mitte), hoch: band(BAENDER.hoch), zisch: band(BAENDER.zisch) };
}

/** Lautstaerke unterhalb dieser Schwelle (nach der Anpassung an die Spitze) gilt als
 *  Pause: der Mund schliesst. Ohne Schwelle zittert er in jeder Atempause. */
export const STILLE = 0.1;

/** Aus Lautstaerke (0..1, schon an die laufende Spitze angepasst) und den Baendern
 *  die Zielform dieses Bilds. */
export function mundAusKlang(lautheit: number, b: Baender): Mundform {
  if (lautheit < STILLE) return MUND_ZU;
  const stimme = b.tief + b.mitte + b.hoch;
  const gesamt = stimme + b.zisch;
  if (gesamt <= 0) return MUND_ZU;
  const zischAnteil = b.zisch / gesamt;
  // Verhaeltnisse statt Anteilen an der ganzen Stimme: der zweite Formant ist bei I und
  // E absolut viel leiser als der erste, als Anteil an allem ging er unter, und I galt
  // als rund. Gemessen mit der echten Soniox-Stimme am 25.09.2026 (Median je Probe;
  // Einzelvokale, im Fliesstext liegt A eher bei kiefer 0,45 bis 0,6):
  //            kiefer  vorn   nasal
  //   A        0,75    0,10   0,63
  //   O        0,29    0,00   0,67
  //   U        0,02    0,00   0,69
  //   I        0,00    0,80   0,71
  //   E        0,00    0,81   0,64
  //   M        0,01    0,10   0,76 bis 0,88
  // kiefer: erster Formant hoch (A) gegen tief (U, I). vorn: zweiter Formant hoch (I, E).
  // nasal: Brummen unter 300 Hz, bei M und N am staerksten; die Lippen sind dann zu.
  const kiefer = b.tief + b.mitte > 0 ? b.mitte / (b.tief + b.mitte) : 0;
  const vorn = b.hoch + b.mitte > 0 ? b.hoch / (b.hoch + b.mitte) : 0;
  const nasal = b.grund + b.tief + b.mitte > 0 ? b.grund / (b.grund + b.tief + b.mitte) : 0;
  // Zischlaut: Zaehne zeigen, Kiefer fast zu. Ab 50 % Anteil ganz, ab 25 % anteilig.
  const zaehne = klemme((zischAnteil - 0.25) / 0.25);
  // M und N: viel Brummen, kein Kiefer, kein zweiter Formant. Ein U kann das fuer ein
  // Bild auch sein, dann schliesst er kurz: faellt weniger auf als ein offener Mund bei M.
  const zu = klemme((nasal - 0.72) / 0.08) * (1 - klemme(kiefer / 0.15)) * (1 - klemme((vorn - 0.2) / 0.3)) * (1 - zaehne);
  const rund = klemme((0.55 - vorn) / 0.3) * klemme((0.42 - kiefer) / 0.2) * (1 - zaehne) * (1 - zu);
  const breite = klemme(0.5 + klemme((vorn - 0.45) / 0.35) * 0.5 - rund * 0.5 + zaehne * 0.3);
  // Kiefer: folgt der Lautstaerke mit etwas Kompression (leise Silben sollen sichtbar
  // sein), weiter offen bei A, enger bei I und U und bei Zischlauten, zu bei M und N.
  const offenRoh = Math.pow(klemme((lautheit - STILLE) / (1 - STILLE)), 0.7);
  const offen = klemme(offenRoh * (0.55 + kiefer * 0.9) * (1 - 0.7 * zaehne) * (1 - 0.85 * zu));
  return { offen, breite, rund, zaehne };
}

/** Anstieg schneller als Abklingen: eine Silbe oeffnet den Mund sofort, das Schliessen
 *  darf eine Spur weicher sein. Zeitkonstanten in Millisekunden. */
export const GLAETTUNG = { offenAuf: 35, offenZu: 110, form: 60 } as const;

function naeher(bisher: number, ziel: number, dtMs: number, tauMs: number): number {
  if (dtMs <= 0) return bisher;
  const anteil = 1 - Math.exp(-dtMs / tauMs);
  return bisher + (ziel - bisher) * anteil;
}

/** Ein Bild der Glaettung, unabhaengig von der Bildrate (60 oder 120 Hz, oder ein
 *  Bild, das der Browser verschluckt hat). */
export function glaetteMund(bisher: Mundform, ziel: Mundform, dtMs: number): Mundform {
  const dt = Math.min(dtMs, 100);
  return {
    offen: naeher(bisher.offen, ziel.offen, dt, ziel.offen > bisher.offen ? GLAETTUNG.offenAuf : GLAETTUNG.offenZu),
    breite: naeher(bisher.breite, ziel.breite, dt, GLAETTUNG.form),
    rund: naeher(bisher.rund, ziel.rund, dt, GLAETTUNG.form),
    zaehne: naeher(bisher.zaehne, ziel.zaehne, dt, GLAETTUNG.form),
  };
}

/** Passt die Lautstaerke an die Stimme an: die Spitze folgt lauten Stellen sofort und
 *  sinkt langsam (Halbwertszeit rund 1,5 s), der Boden verhindert, dass Rauschen in
 *  einer langen Pause zur vollen Oeffnung aufgeblasen wird. Rueckgabe: neue Spitze. */
export function folgeSpitze(spitze: number, pegel: number, dtMs: number, boden = 0.04): number {
  const sinken = Math.pow(0.5, Math.min(dtMs, 100) / 1500);
  return Math.max(boden, pegel, spitze * sinken);
}

// ---- Geometrie ------------------------------------------------------------------------
//
// Im Koordinatensystem von Himbi (viewBox 0 0 96 144): der Mund sitzt mittig bei x 48
// unter den Augen, das gewohnte Laecheln (himbi.tsx, hb-mund--lachen) spannt von x 40
// bis 56 um y 82 bis 86. Die Form ist ein Linsen- bis Ellipsenbogen aus zwei kubischen
// Kurven; geschlossen bleibt davon eine leicht laechelnde Linie.

export const MUND_MITTE = { x: 48, y: 83.5 } as const;

export interface MundGeometrie {
  /** Umriss der Mundoeffnung (zugleich Clip fuer Zunge und Zaehne). */
  pfad: string;
  /** Zunge: Mittelpunkt und Radien. */
  zunge: { cx: number; cy: number; rx: number; ry: number };
  /** Obere Zahnreihe: Oberkante, Hoehe, Deckkraft. */
  zaehne: { y: number; hoehe: number; deckkraft: number };
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function mundGeometrie(m: Mundform, laecheln = 1): MundGeometrie {
  const { x: cx, y: cy } = MUND_MITTE;
  // Halbe Breite: schmal bei O und U, breit bei E und I; in Ruhe etwa so breit wie das
  // gewohnte Laecheln.
  const w = 5.4 + m.breite * 4 - m.rund * 2.2;
  // Oeffnung nach unten (Kiefer) und nach oben (Oberlippe hebt sich nur wenig, bei O mehr).
  // Bei Zischlauten einen Spalt weiter, sonst sieht man die Zaehne nicht.
  const unten = 0.35 + m.offen * 7.2 + m.zaehne * 1.4;
  const oben = 0.15 + m.offen * (1.2 + m.rund * 2.2) + m.zaehne * 0.9;
  // Laecheln, solange der Mund zu ist: Winkel nach oben, beide Lippen zur Mitte hin
  // durchgebogen. So sieht der geschlossene Mund aus wie das Laecheln in der Ecke und
  // nicht wie ein flacher Strich (Bildvergleich vom 25.09.2026). Beim Oeffnen und bei
  // runden Lauten verschwindet es.
  const zu = (1 - m.offen) * (1 - m.rund);
  const winkel = cy - laecheln * 2.4 * (1 - m.rund) * (1 - m.offen * 0.7);
  // Kontrollpunkte: nahe den Winkeln ergibt eine Ellipse (O), zur Mitte hin eine Linse (E).
  const k = w * (0.45 + 0.55 * Math.max(m.rund, m.offen * 0.6));
  const ol = cy - oben * 1.33 + laecheln * 0.8 * zu;
  const ul = cy + unten * 1.33 + laecheln * 1.6 * zu;
  const pfad =
    `M${r2(cx - w)} ${r2(winkel)}` +
    `C${r2(cx - k)} ${r2(ol)} ${r2(cx + k)} ${r2(ol)} ${r2(cx + w)} ${r2(winkel)}` +
    `C${r2(cx + k)} ${r2(ul)} ${r2(cx - k)} ${r2(ul)} ${r2(cx - w)} ${r2(winkel)}Z`;
  // Ober- und Unterkante der Oeffnung in der Mitte (Mittelpunkt der kubischen Kurven):
  // dort sitzen Zaehne und Zunge.
  const kanteOben = (2 * winkel + 6 * ol) / 8;
  const kanteUnten = (2 * winkel + 6 * ul) / 8;
  const zungeRy = Math.max(0.2, unten * 0.42);
  const zunge = { cx, cy: r2(kanteUnten - zungeRy * 0.35), rx: r2(w * 0.62), ry: r2(zungeRy) };
  const zaehne = { y: r2(kanteOben - 0.6), hoehe: r2(1.5 + m.zaehne * 0.8 + m.offen * 0.4), deckkraft: r2(klemme(m.zaehne * 1.4 + (m.offen > 0.35 ? 0.35 : 0))) };
  return { pfad, zunge, zaehne };
}
