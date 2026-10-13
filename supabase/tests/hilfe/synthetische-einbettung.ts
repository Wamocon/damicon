// Synthetische Einbettung für die Datenbanktests der Wissensbasis: deterministisch, ohne Netz, ohne Modell. Jedes Wort setzt eine Stelle eines
// 1024-dimensionalen Vektors (Hash des Worts), der Vektor wird normiert. Gleiche Wörter ergeben ähnliche Vektoren, damit Vergleich und Suche
// gegen echtes Postgres prüfbar sind. Vorher stand dieser Block wortgleich in fünf Testdateien.

import type { Einbettung } from "@/lib/wissen/embed";
import { tokens } from "@/lib/wissen/sparse";

export const DIM = 1024;

export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export const einbettung: Einbettung = {
  modell: "synthetisch-bge-m3",
  dimension: DIM,
  async einbetten(texte) {
    return texte.map((t) => {
      const v = new Array<number>(DIM).fill(0);
      for (const w of tokens(t)) v[hash32(w) % DIM]! += 1;
      const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
      return v.map((x) => x / norm);
    });
  },
};
