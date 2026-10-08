// Tests fuer das Lesen eines Bruttobetrags (lib/domain/lohn.ts, bruttoLesen),
// WMCNL-2304: der Abzugsrechner der Lohnseite.
//
// Reine Funktion, kein Netzwerk, keine Datenbank. Aufruf: npm run test:lohn-eingabe
//
// Warum eigene Tests: "300.000" ist in Deutschland dreihunderttausend, fuer
// Number() aber dreihundert. Der Rechner zeigte sonst zu einem Brutto von 300
// Tenge ein Ergebnis, das niemand als Tippfehler erkennt.

import { bruttoLesen } from "@/lib/domain/lohn";

let fehler = 0;
let gesamt = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  gesamt++;
  const ok = ist === soll;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  - war ${String(ist)}, erwartet ${String(soll)}`}`);
}

pruefe("einfache Zahl", bruttoLesen("300000"), 300000);
pruefe("Tausenderpunkt wie in Deutschland", bruttoLesen("300.000"), 300000);
pruefe("mehrere Tausenderpunkte", bruttoLesen("1.234.567"), 1234567);
pruefe("Leerzeichen als Tausendertrenner, wie in Kasachstan", bruttoLesen("300 000"), 300000);
pruefe("geschuetztes Leerzeichen", bruttoLesen("300\u00a0000"), 300000);
pruefe("Dezimalkomma", bruttoLesen("147000,5"), 147000.5);
pruefe("Tausenderpunkt und Dezimalkomma", bruttoLesen("1.234,56"), 1234.56);
pruefe("Dezimalpunkt mit weniger als drei Stellen", bruttoLesen("1234.5"), 1234.5);
pruefe("Null ist ein gueltiges Brutto", bruttoLesen("0"), 0);
pruefe("leere Eingabe", bruttoLesen(""), null);
pruefe("nur Leerzeichen", bruttoLesen("   "), null);
pruefe("Text", bruttoLesen("abc"), null);
pruefe("negative Zahl", bruttoLesen("-5"), null);
pruefe("zwei Dezimalkommas", bruttoLesen("1,2,3"), null);
pruefe("Einheit dahinter", bruttoLesen("300000 ₸"), null);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
