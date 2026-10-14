// Management-Cockpit (Masterplan 4.11, WMCNL-1519): hoechstens zwoelf Kennzahlen je Rolle prominent.
// Die vierzehn Baseline-Kennzahlen bleiben vollstaendig erhalten, die ueberzaehligen stehen
// als "erweitert" ausserhalb des Cockpits.
//
// Aufruf: npm run test:kennzahlen-cockpit (ueber tsx, damit die @/-Pfade aufloesen).

import { COCKPIT_MAX_KENNZAHLEN, kpis, kpisFuerRolle } from "@/lib/domain/kpis";
import { roles } from "@/lib/rbac";

let fehlgeschlagen = 0;
function pruefe(name: string, ok: boolean, zusatz = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${zusatz ? "  - " + zusatz : ""}`);
  if (!ok) fehlgeschlagen++;
}

const kern = kpis.filter((k) => k.stufe === "kern");
const erweitert = kpis.filter((k) => k.stufe === "erweitert");

pruefe("Die Baseline umfasst vierzehn Kennzahlen", kpis.length === 14, `Anzahl: ${kpis.length}`);
pruefe("Hoechstens zwoelf Kennzahlen gehoeren zum Cockpit (stufe kern)", kern.length <= COCKPIT_MAX_KENNZAHLEN, `kern: ${kern.length}`);
pruefe("Kern und erweitert ergeben die ganze Baseline, keine Kennzahl geht verloren", kern.length + erweitert.length === kpis.length);
pruefe("Die Grenze ist zwoelf", COCKPIT_MAX_KENNZAHLEN === 12);

const schluessel = new Set(kpis.map((k) => k.key));
pruefe("Jede Kennzahl hat einen eindeutigen Schluessel", schluessel.size === kpis.length);

for (const rolle of roles) {
  const { kern: eigene, erweitert: weitere } = kpisFuerRolle(rolle);
  pruefe(`Rolle ${rolle}: hoechstens zwoelf Kern-Kennzahlen im Cockpit`, eigene.length <= COCKPIT_MAX_KENNZAHLEN, `kern: ${eigene.length}`);
  pruefe(`Rolle ${rolle}: nichts doppelt in Kern und erweitert`, !eigene.some((k) => weitere.includes(k)));
}

for (const rolle of ["picker", "erzeuger", "kunde"] as const) {
  const { kern: eigene, erweitert: weitere } = kpisFuerRolle(rolle);
  pruefe(`Rolle ${rolle}: ohne betriebsweite Sicht keine Kennzahlen`, eigene.length === 0 && weitere.length === 0);
}
pruefe("ceo sieht dieselben Kennzahlen wie admin", kpisFuerRolle("ceo").kern.length === kpisFuerRolle("admin").kern.length);

console.log("");
if (fehlgeschlagen > 0) {
  console.error(`${fehlgeschlagen} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("Alle Pruefungen bestanden.");
