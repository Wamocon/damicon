// Stellt der Wissensbasis eine Frage und zeigt Belege und Zeiten - dieselbe Suche,
// die der Agent benutzt (lib/wissen/suche.ts).
//
//   npx tsx scripts/wissen-frage.ts "Frage" ["Frage auf Russisch"] [--rolle buchhaltung] [--limit 6]

import { sucheWissen } from "../src/lib/wissen/suche";
import type { Role } from "../src/lib/rbac";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const opt = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

async function main() {
  const [frage, russisch] = args;
  if (!frage) throw new Error('Frage fehlt: npx tsx scripts/wissen-frage.ts "Frage" ["Russisch"]');
  const r = await sucheWissen({ frage, frageRussisch: russisch }, (opt("rolle") ?? "admin") as Role, { limit: Number(opt("limit") ?? 6) });
  console.log(`${r.belege.length} Treffer in ${r.dauerMs.gesamt} ms (Einbettung ${r.dauerMs.einbettung} ms, Suche ${r.dauerMs.suche} ms)\n`);
  for (const b of r.belege) {
    console.log(`[${b.id}] ${b.fundstelle}`);
    console.log(`     Stufe ${b.stufe ?? "?"} | ${b.sprache ?? "?"} | Stand ${b.gueltigAb ?? "?"} | abgerufen ${b.abgerufenAm ?? "?"} | Punkte ${b.punktzahl}`);
    console.log(`     ${b.url ?? "(kein Link)"}`);
    console.log(`     ${b.text.replace(/\s+/g, " ").slice(0, 200)}\n`);
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
