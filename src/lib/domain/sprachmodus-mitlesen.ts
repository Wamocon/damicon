// Mitlesen im Sprachmodus: welcher Satz klingt gerade?
//
// Soniox meldet nicht, bis wohin gesprochen ist. Der Sprecher
// (components/ki/sprachausgabe-strom.ts, stand()) schätzt es aus der schon
// gespielten Tondauer; diese Funktion ordnet die gesprochene Strecke dem Satz zu.
// Welche Stelle der Seite ein Satz meint, sagt seit dem 25.09.2026 seine
// Sprechmarke (domain/sprechmarken.ts), nicht mehr ein Wortvergleich.

/** Der Satz, der zur gespielten Strecke gehört. `laengen`: die Zeichen jedes Satzes
 *  in der Reihenfolge des Sprechens, `position`: so viele Zeichen sind schon
 *  gesprochen (Tondauer mal Sprechgeschwindigkeit). -1, wenn es keine Sätze gibt. */
export function satzBeiPosition(laengen: readonly number[], position: number): number {
  if (laengen.length === 0) return -1;
  let summe = 0;
  for (let i = 0; i < laengen.length; i++) {
    summe += laengen[i]!;
    if (position < summe) return i;
  }
  return laengen.length - 1;
}
