#!/usr/bin/env node
// =============================================================================
// Damicon - Test der Proforma-Rechnungslogik (Anforderung 5.2, Teil 2b)
// =============================================================================
// Ausfuehren:  node supabase/tests/rechnungshistorie.mjs
//
// preisAmStichtag()/berechneProforma() sind reine Funktionen ohne
// Server-/Datenbankzugriff (siehe src/lib/domain/rechnungshistorie.ts) -
// dieselbe Trennung wie beim Zukauf-Import-Parser und der
// Temperatursummen-Rechnung.
// =============================================================================

import { berechneProforma, preisAmStichtag } from "../../src/lib/domain/rechnungshistorie.ts";

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name, bedingung, info = "") {
  if (bedingung) {
    bestanden++;
    console.log(`  OK   ${name}${info ? "  " + info : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`  FEHL ${name}${info ? "  " + info : ""}`);
  }
}

const PREISLISTEN = [
  {
    gueltigAb: "2026-01-01",
    gueltigBis: "2026-05-31",
    positionen: [{ sorteId: "polka", preisTengeKg: 2800 }],
  },
  {
    gueltigAb: "2026-06-01",
    gueltigBis: null,
    positionen: [{ sorteId: "polka", preisTengeKg: 3200 }],
  },
];

{
  const preis = preisAmStichtag(PREISLISTEN, "polka", "2026-03-15");
  pruefe("preisAmStichtag: findet die zum Datum gueltige Preisliste (fruehe Liste)", preis === 2800, `preis: ${preis}`);
}

{
  const preis = preisAmStichtag(PREISLISTEN, "polka", "2026-08-01");
  pruefe(
    "preisAmStichtag: findet die zum Datum gueltige Preisliste (unbefristet gueltige, spaetere Liste)",
    preis === 3200,
    `preis: ${preis}`,
  );
}

{
  const preis = preisAmStichtag(PREISLISTEN, "polka", "2026-01-01");
  pruefe("preisAmStichtag: gueltig_ab ist inklusiv", preis === 2800, `preis: ${preis}`);
}

{
  const preis = preisAmStichtag(PREISLISTEN, "polka", "2025-12-31");
  pruefe(
    "preisAmStichtag: ein Datum vor jeder Preisliste liefert keinen Preis",
    preis === null,
    `preis: ${preis}`,
  );
}

{
  const preis = preisAmStichtag(PREISLISTEN, "tulameen", "2026-03-15");
  pruefe(
    "preisAmStichtag: eine Sorte ohne Position in der gueltigen Preisliste liefert keinen Preis",
    preis === null,
    `preis: ${preis}`,
  );
}

{
  // Ueberlappende Preislisten (sollte fachlich nicht vorkommen): die mit dem
  // spaeteren gueltig_ab gewinnt.
  const ueberlappend = [
    { gueltigAb: "2026-01-01", gueltigBis: "2026-12-31", positionen: [{ sorteId: "polka", preisTengeKg: 2800 }] },
    { gueltigAb: "2026-06-01", gueltigBis: "2026-12-31", positionen: [{ sorteId: "polka", preisTengeKg: 3200 }] },
  ];
  const preis = preisAmStichtag(ueberlappend, "polka", "2026-07-01");
  pruefe(
    "preisAmStichtag: bei ueberlappenden Preislisten gewinnt die mit dem spaeteren gueltig_ab",
    preis === 3200,
    `preis: ${preis}`,
  );
}

{
  const zeilen = berechneProforma(
    [
      { id: "l1", geliefertAm: "2026-03-15T10:00:00Z", mengeKg: 80, sorteId: "polka" },
      { id: "l2", geliefertAm: "2026-08-01T10:00:00Z", mengeKg: 50, sorteId: "polka" },
      { id: "l3", geliefertAm: "2026-08-01T10:00:00Z", mengeKg: 30, sorteId: null },
    ],
    PREISLISTEN,
  );
  pruefe(
    "berechneProforma: Menge mal zum Liefertermin gueltigem Preis, korrekt je Zeile",
    zeilen[0].betragTenge === 224_000 && zeilen[1].betragTenge === 160_000,
    JSON.stringify(zeilen.map((z) => z.betragTenge)),
  );
  pruefe(
    "berechneProforma: eine Lieferung ohne bekannte Sorte liefert keinen Betrag statt einer Erfindung",
    zeilen[2].preisTengeKg === null && zeilen[2].betragTenge === null,
    JSON.stringify(zeilen[2]),
  );
}

// Anforderung 5.1/5.2: Preisstaffelung je Kundengruppe. Eine gruppenspezifische
// Preisliste geht einer gruppenlosen Standardliste vor, auch wenn die
// Standardliste das juengere gueltig_ab hat - dieselbe Konstellation wie im
// Seed (Preisliste Herbst 2026 vs. Preisliste Herbst 2026 - Handel).
const PREISLISTEN_GRUPPIERT = [
  {
    gueltigAb: "2026-08-01",
    gueltigBis: null,
    kundengruppe: null,
    positionen: [{ sorteId: "polka", preisTengeKg: 2100 }],
  },
  {
    gueltigAb: "2026-08-01",
    gueltigBis: null,
    kundengruppe: "handel",
    positionen: [{ sorteId: "polka", preisTengeKg: 1900 }],
  },
];

{
  const preis = preisAmStichtag(PREISLISTEN_GRUPPIERT, "polka", "2026-09-01", "handel");
  pruefe(
    "preisAmStichtag: eine zur Kundengruppe passende Preisliste gewinnt gegen die gruppenlose Standardliste",
    preis === 1900,
    `preis: ${preis}`,
  );
}

{
  const preis = preisAmStichtag(PREISLISTEN_GRUPPIERT, "polka", "2026-09-01", "gastronomie");
  pruefe(
    "preisAmStichtag: eine andere Kundengruppe ohne eigene Liste faellt auf die Standardliste zurueck",
    preis === 2100,
    `preis: ${preis}`,
  );
}

{
  const preis = preisAmStichtag(PREISLISTEN_GRUPPIERT, "polka", "2026-09-01", null);
  pruefe(
    "preisAmStichtag: ohne Kundengruppe (noch nicht zugeordneter Kunde) gilt die Standardliste",
    preis === 2100,
    `preis: ${preis}`,
  );
}

{
  const preis = preisAmStichtag(PREISLISTEN_GRUPPIERT, "polka", "2026-09-01");
  pruefe(
    "preisAmStichtag: Kundengruppe ist optional, Standardaufruf ohne vierten Parameter bleibt moeglich",
    preis === 2100,
    `preis: ${preis}`,
  );
}

{
  const zeilen = berechneProforma(
    [
      { id: "l1", geliefertAm: "2026-09-01T10:00:00Z", mengeKg: 100, sorteId: "polka", kundengruppe: "handel" },
      { id: "l2", geliefertAm: "2026-09-01T10:00:00Z", mengeKg: 100, sorteId: "polka", kundengruppe: "gastronomie" },
    ],
    PREISLISTEN_GRUPPIERT,
  );
  pruefe(
    "berechneProforma: zwei Lieferungen derselben Sorte/desselben Tages bekommen je nach Kundengruppe unterschiedliche Preise",
    zeilen[0].preisTengeKg === 1900 && zeilen[1].preisTengeKg === 2100,
    JSON.stringify(zeilen.map((z) => z.preisTengeKg)),
  );
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
