// Mitlesen im Sprachmodus: welcher Satz klingt gerade, und welche Stelle auf der
// Seite meint er?
//
// Wer eine längere Erklärung hört (etwa die Compliance-Prüfung), muss sehen
// können, bei welchem Punkt Himbi gerade ist (Rückmeldung vom 25.09.2026: "ich
// kann nicht nachvollziehen, bei welchem Punkt er gerade ist, das wird nicht in
// der Mitte visualisiert"). Das Modell zeigt nicht zuverlässig auf jeden Punkt,
// deshalb wird es hier ohne sein Zutun bestimmt: aus der Tondauer, die schon
// gespielt wurde, der Satz, und aus dem Satz die Stelle der Seite, deren Text
// am besten dazu passt. Reine Funktionen, ohne DOM.

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

// Füllwörter, die auf fast jeder Seite und in fast jedem Satz stehen (nach dem
// Kürzen auf sechs Zeichen). Sie sagen nichts darüber, welche Stelle gemeint ist.
const FUELLWOERTER = new Set([
  "dieser", "diese", "dieses", "diesen", "dieser", "seite", "zeigt", "sehen", "ihnen", "damit", "dabei", "gerade",
  "jetzt", "haben", "koenne", "werden", "wurde", "sowie", "dazu", "darunt", "darin", "obere", "unten", "obenau",
  "ihre", "ihren", "ihrer", "ihrem", "einen", "einem", "einer", "eines", "nicht", "nur", "auch", "noch", "schon",
  "immer", "alles", "sind", "wenn", "dann", "doch", "gleic", "eigent", "bereit", "bereic", "system", "damico",
  "himbi", "steht", "stehen", "liegt", "liegen", "gibt", "kommt", "macht", "mache", "einfa", "ganz", "genau",
  "weite", "weiter", "zuers", "zunaec", "danach", "schau", "schaue", "lese", "erklae", "zeige", "oeffne",
]);

/** Die Wörter eines Textes, an denen man eine Stelle wiedererkennt: Umlaute
 *  aufgelöst, klein, auf sechs Zeichen gekürzt (so passen "Meldung" und
 *  "Meldungen" zusammen), ohne Füllwörter. Zahlen ab zwei Ziffern zählen mit:
 *  "37 Tage" erkennt man wieder. */
export function bedeutsameWoerter(text: string): string[] {
  const norm = text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
  const ergebnis: string[] = [];
  for (const wort of norm.split(/[^\p{L}\p{N}]+/u)) {
    if (!wort) continue;
    if (/^\d+$/.test(wort)) {
      if (wort.length >= 2 && wort.length <= 4) ergebnis.push(wort);
      continue;
    }
    if (wort.length < 5) continue;
    const stamm = wort.slice(0, 6);
    if (!FUELLWOERTER.has(stamm)) ergebnis.push(stamm);
  }
  return ergebnis;
}

export interface MitleseKandidat {
  /** Der Text der Stelle. */
  text: string;
  /** Ihre Fläche in Pixeln - bei gleichem Treffer gewinnt die kleinere. */
  flaeche: number;
}

/** Wie viele Zeichen vom Anfang eines Kandidaten als Überschrift gelten. */
const UEBERSCHRIFT_ZEICHEN = 70;
/** Mindestwert, damit eine Stelle überhaupt gezeigt wird: lieber die alte
 *  Markierung behalten als auf eine zufällige Stelle springen. */
const MINDESTWERT = 0.32;

/** Die Stelle, die zum Satz passt (Index in `kandidaten`), oder null. Treffer in
 *  der Überschrift der Stelle zählen doppelt, Zahlen anderthalbfach; lange
 *  Stellen werden gedämpft, damit der ganze Bereich nicht immer gegen seinen
 *  einzelnen Eintrag gewinnt, obwohl der Eintrag gemeint war. */
export function bestesZiel(satz: string, kandidaten: readonly MitleseKandidat[]): number | null {
  const gesucht = new Set(bedeutsameWoerter(satz));
  if (gesucht.size === 0) return null;
  let bester = -1;
  let besterWert = 0;
  let besteFlaeche = Infinity;
  kandidaten.forEach((k, i) => {
    const alle = new Set(bedeutsameWoerter(k.text));
    if (alle.size === 0) return;
    const kopf = new Set(bedeutsameWoerter(k.text.slice(0, UEBERSCHRIFT_ZEICHEN)));
    let punkte = 0;
    let treffer = 0;
    for (const w of gesucht) {
      if (!alle.has(w)) continue;
      treffer++;
      const zahl = /^\d+$/.test(w);
      punkte += (kopf.has(w) ? 2 : 1) * (zahl ? 1.5 : 1);
    }
    if (treffer === 0) return;
    const wert = punkte / Math.sqrt(alle.size + 6);
    // Fast gleich gut: die kleinere Stelle, sie ist genauer.
    const besser = wert > besterWert * 1.05 || (wert >= besterWert * 0.95 && wert > 0 && k.flaeche < besteFlaeche && bester >= 0);
    if (bester < 0 || besser) {
      if (bester < 0 || wert >= besterWert * 0.95) {
        bester = i;
        besterWert = Math.max(wert, besterWert);
        besteFlaeche = k.flaeche;
      }
    }
  });
  return bester >= 0 && besterWert >= MINDESTWERT ? bester : null;
}
