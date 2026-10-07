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

// ---- Abbildung auf pgvector (sparsevec) --------------------------------------------------
// Qdrant nimmt u32-Indizes, pgvector hoechstens 1 Milliarde Dimensionen mit Index ab 1. Der Hash
// wird deshalb auf 1..1_000_000_000 abgebildet. Bei rund 100.000 verschiedenen Woertern sind
// Kollisionen zweier Woerter praktisch bedeutungslos (erwartet: einige Dutzend Paare).
export const SPARSE_DIMENSION = 1_000_000_000;

export function sparseIndex(hash: number): number {
  return (hash % SPARSE_DIMENSION) + 1;
}

/** Textform eines sparsevec fuer PostgREST: {index:wert,...}/dimension. Kollidierende Indizes werden addiert. */
export function alsSparsevec(v: SparseVektor): string {
  const summe = new Map<number, number>();
  v.indices.forEach((h, i) => {
    const idx = sparseIndex(h);
    summe.set(idx, (summe.get(idx) ?? 0) + (v.values[i] ?? 0));
  });
  const teile = [...summe].sort((a, b) => a[0] - b[0]).map(([idx, w]) => `${idx}:${Number(w.toFixed(4))}`);
  return `{${teile.join(",")}}/${SPARSE_DIMENSION}`;
}

/** Die Indizes eines sparsevec in Textform ("{4:1.5,6:2}/1000000000"), wie PostgREST ihn liefert. Gegenstueck zu alsSparsevec. */
export function sparsevecIndizes(text: string): number[] {
  const innen = text.slice(text.indexOf("{") + 1, text.lastIndexOf("}"));
  if (!innen.trim()) return [];
  return innen.split(",").map((paar) => Number(paar.split(":")[0]));
}

/** IDF eines Wortes: ln(1 + (N - df + 0.5) / (df + 0.5)), auf sechs Stellen gerundet. Die EINE Formel fuer ETL,
 *  Upload und Loeschen (vorher stand sie in sparse.ts und noch einmal in hochladen.ts). */
export function idf(n: number, df: number): number {
  return Number(Math.log(1 + (n - df + 0.5) / (df + 0.5)).toFixed(6));
}

/** Dokumenthaeufigkeit (df) je Wort: ein Wort zaehlt je Textstelle einmal. `chunkIndizes` hat je Textstelle die
 *  Wort-Indizes (schon mit sparseIndex abgebildet). Reihenfolge des Ergebnisses: erstes Auftreten. Upload und
 *  Loeschen zaehlen damit die Woerter EINES Dokuments, der ETL (ueber wortgewichte) den ganzen Korpus. */
export function zaehleWoerter(chunkIndizes: Iterable<readonly number[]>): Map<number, number> {
  const df = new Map<number, number>();
  for (const indizes of chunkIndizes) {
    for (const idx of new Set(indizes)) df.set(idx, (df.get(idx) ?? 0) + 1);
  }
  return df;
}

/** Dokumenthaeufigkeit (df) und IDF je Wort fuer wissen_begriffe. `chunkIndizes` hat je Textstelle die Wort-Indizes
 *  (schon mit sparseIndex abgebildet); ein Wort zaehlt je Textstelle einmal, N ist die Zahl der Textstellen.
 *  Reihenfolge des Ergebnisses: erstes Auftreten. Vom ETL (scripts/wissen-nach-supabase.ts) benutzt; die Rechnung
 *  ist die, die dort vorher inline stand. */
export function wortgewichte(chunkIndizes: Iterable<readonly number[]>): { hash: number; df: number; idf: number }[] {
  const liste = [...chunkIndizes];
  const n = liste.length;
  return [...zaehleWoerter(liste)].map(([hash, d]) => ({ hash, df: d, idf: idf(n, d) }));
}
