import { hasPermission, roles } from "../../src/lib/rbac";
import { modules, modulesForZone, sichtbareModule, zones } from "../../src/lib/modules";

// Die Rechtepruefung der Navigation (lib/modules.ts, sichtbareModule).
//
// Drei Stellen fragen sie: die Seitenleiste am Schreibtisch, die Auswahl der
// Bereiche in nav-ziele.ts und die zweite Ebene des Menue-Blatts auf dem Handy.
// Bis zum Umbau stand die Filterung an zwei davon woertlich ausgeschrieben.
// Geprueft wird deshalb zuerst, dass die Funktion fuer jede Rolle und jeden
// Bereich genau das liefert, was der alte Ausdruck geliefert hat - und danach,
// dass die Menge fuer die Demo-Rollen stimmt, mit denen das Menue von Hand
// abgenommen wurde.
//
// Der Schutz selbst liegt nicht hier: die Modulseite prueft das Recht
// serverseitig und laedt ohne Recht keine Fachdaten. Diese Funktion
// entscheidet nur, was die Navigation anbietet.

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name: string, bedingung: boolean, zusatz = "") {
  if (bedingung) {
    bestanden++;
    console.log(`PASS  ${name}${zusatz ? "  - " + zusatz : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`FAIL  ${name}${zusatz ? "  - " + zusatz : ""}`);
  }
}

const schluessel = (liste: { key: string }[]) => liste.map((m) => m.key).join(",");

// 1. Gleichwertig zum frueheren Ausdruck, fuer alle Rollen und Bereiche.
let abweichungen = 0;
for (const rolle of roles) {
  for (const zone of zones) {
    const alt = modulesForZone(zone.key).filter((m) =>
      hasPermission(rolle, m.resource, "view"),
    );
    if (schluessel(alt) !== schluessel(sichtbareModule(rolle, zone.key))) {
      abweichungen++;
      console.log(`      Abweichung bei ${rolle} / ${zone.key}`);
    }
  }
}
pruefe(
  "sichtbareModule liefert fuer jede Rolle und jeden Bereich dasselbe wie der alte Filter",
  abweichungen === 0,
  `${roles.length} Rollen x ${zones.length} Bereiche`,
);

// 2. Reihenfolge bleibt die aus modules.ts - das Menue zeigt sie so an.
const adminBuero = sichtbareModule("admin", "buero");
const erwartet = modules.filter((m) => m.zone === "buero");
pruefe(
  "Reihenfolge entspricht modules.ts",
  schluessel(adminBuero) === schluessel(erwartet),
);

// 3. Ohne Rolle gibt es nichts zu sehen - etwa vor dem Laden des Profils.
pruefe(
  "ohne Rolle: in keinem Bereich ein Modul",
  zones.every((z) => sichtbareModule(null, z.key).length === 0) &&
    zones.every((z) => sichtbareModule(undefined, z.key).length === 0),
);

// 4. Nur Module des gefragten Bereichs, nie eines aus einem anderen.
pruefe(
  "liefert nur Module des gefragten Bereichs",
  zones.every((z) => sichtbareModule("admin", z.key).every((m) => m.zone === z.key)),
);

// 5. Die Rollen, mit denen das Menue abgenommen wurde.
pruefe(
  "Betriebsleitung sieht alle vier Bereiche",
  zones.every((z) => sichtbareModule("betriebsleitung", z.key).length > 0),
);
const pickerBereiche = zones
  .filter((z) => sichtbareModule("picker", z.key).length > 0)
  .map((z) => z.key)
  .join(",");
pruefe(
  "Pfluecker sieht genau Buero und Markt",
  pickerBereiche === "buero,markt",
  pickerBereiche,
);

console.log(
  `\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`,
);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
