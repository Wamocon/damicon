// Lexikalische Haelfte der Hybridsuche. Dichte Vektoren finden Sinn, verlieren
// aber exakte Treffer: "ст. 358", "ЭСФ", "БИН" oder eine Frist in Tagen. Die
// sparse Vektoren halten genau diese Woerter und Zahlen fest, Qdrant gewichtet
// sie serverseitig mit IDF (modifier "idf") und fuehrt beide Ergebnislisten per
// Reciprocal Rank Fusion zusammen.
//
// Ohne Bibliothek: Woerter werden klein geschrieben und auf ihren Wortanfang
// gekuerzt. Fuer Russisch und Kasachisch (viele Endungen: "налогообложения",
// "налогообложение", "налогообложению") ist das ein billiger, brauchbarer
// Ersatz fuer einen Stemmer, Zahlen bleiben unveraendert.

const STAMM_LAENGE = 6;

export interface SparseVektor {
  indices: number[];
  values: number[];
}

/** FNV-1a, 32 Bit: schnell, stabil, ohne Abhaengigkeit. Qdrant erwartet u32-Indizes. */
function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function tokens(text: string): string[] {
  const roh = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  const aus: string[] = [];
  for (const t of roh) {
    if (/^\d+$/.test(t)) aus.push(t);
    else if (t.length >= 2) aus.push(t.length > STAMM_LAENGE ? t.slice(0, STAMM_LAENGE) : t);
  }
  return aus;
}

/** Dokumentseite: Gewicht 1 + ln(Haeufigkeit), so dominiert ein oft wiederholtes Wort nicht. */
export function sparseDokument(text: string): SparseVektor {
  const zaehler = new Map<number, number>();
  for (const t of tokens(text)) {
    const h = hash32(t);
    zaehler.set(h, (zaehler.get(h) ?? 0) + 1);
  }
  const indices: number[] = [];
  const values: number[] = [];
  for (const [h, n] of zaehler) {
    indices.push(h);
    values.push(Number((1 + Math.log(n)).toFixed(4)));
  }
  return { indices, values };
}

/** Frageseite: jedes Wort einmal, Gewicht 1. */
export function sparseFrage(text: string): SparseVektor {
  const indices = [...new Set(tokens(text).map(hash32))];
  return { indices, values: indices.map(() => 1) };
}
