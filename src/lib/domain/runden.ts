// Kaufmaennisches Runden ohne den Fehler der Gleitkommazahl. Math.round(wert * 100) / 100 rundet 1,005 auf 1,00, weil 1,005 * 100 in der Gleitkommazahl
// 100,49999999999999 ergibt. Hier wird die Dezimalstelle ueber die Schreibweise der Zahl verschoben ("1.005e2" ist genau 100,5), erst dann gerundet.
// Halbe Werte gehen weg von null, wie in der Buchhaltung ueblich (0,5 ergibt 1, -0,5 ergibt -1).

export function rundeKaufmaennisch(wert: number, stellen = 2): number {
  if (!Number.isFinite(wert)) return wert;
  const vorzeichen = wert < 0 ? -1 : 1;
  const betrag = Math.abs(wert);
  const text = String(betrag);
  const faktor = 10 ** stellen;
  // Exponentialschreibweise (sehr kleine oder sehr grosse Werte): dort geht der Umweg ueber den Text nicht, und die einfache Rechnung genuegt.
  const verschoben = text.includes("e") ? betrag * faktor : Number(`${text}e${stellen}`);
  return vorzeichen * (Math.round(verschoben) / faktor);
}
