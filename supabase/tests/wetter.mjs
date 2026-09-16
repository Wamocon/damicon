#!/usr/bin/env node
// =============================================================================
// Damicon - Test der Temperatursummen-Heuristik (Anforderung 2.13)
// =============================================================================
// Ausfuehren:  node supabase/tests/wetter.mjs
//
// gddBeitrag()/berechneTemperatursummen() sind reine Funktionen ohne
// Netz-/Server-/Datenbankzugriff (siehe src/lib/domain/wetter.ts) - dieselbe
// Trennung wie beim Zukauf-Import-Parser und der Ausweis-Scan-Zuordnung. Der
// eigentliche Open-Meteo-Abruf (src/lib/wetter/open-meteo-client.ts) laesst
// sich in dieser Umgebung nicht sinnvoll automatisiert pruefen (echter
// Netzzugriff auf einen Drittanbieter in CI) - genau deshalb ist die
// Rechenlogik bewusst als eigene, isoliert testbare Funktion ausgelagert.
// =============================================================================

import { berechneTemperatursummen, gddBeitrag, GDD_BASIS_TEMPERATUR_C } from "../../src/lib/domain/wetter.ts";

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

{
  // Tagesmittel (10+20)/2 = 15, minus 5 Grad Basis = 10.
  const beitrag = gddBeitrag(10, 20);
  pruefe("gddBeitrag: Tagesmittel ueber der Basistemperatur zaehlt voll", beitrag === 10, `beitrag: ${beitrag}`);
}

{
  // Ein kalter Tag darf die Summe nicht negativ ziehen - 0, nicht -5.
  const beitrag = gddBeitrag(-5, 2);
  pruefe(
    "gddBeitrag: ein Tag unter der Basistemperatur traegt 0 bei, nie negativ",
    beitrag === 0,
    `beitrag: ${beitrag}, Basis: ${GDD_BASIS_TEMPERATUR_C}`,
  );
}

{
  const beitrag = gddBeitrag(null, 20);
  pruefe("gddBeitrag: fehlender Minimalwert traegt 0 bei statt zu werfen", beitrag === 0, `beitrag: ${beitrag}`);
}

{
  const tage = [
    { datum: "2026-01-01", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
    { datum: "2026-01-02", tempMinC: -5, tempMaxC: 2, niederschlagMm: 1.2 },
    { datum: "2026-01-03", tempMinC: 14, tempMaxC: 26, niederschlagMm: 0 },
  ];
  const ergebnis = berechneTemperatursummen(tage);
  pruefe(
    "berechneTemperatursummen: kumuliert ueber mehrere Tage, ein kalter Tag haelt die Summe, senkt sie nicht",
    ergebnis[0].temperatursumme === 10 &&
      ergebnis[1].temperatursumme === 10 &&
      ergebnis[2].temperatursumme === 25,
    JSON.stringify(ergebnis.map((t) => t.temperatursumme)),
  );
}

{
  const ergebnis = berechneTemperatursummen([]);
  pruefe("berechneTemperatursummen: eine leere Liste liefert eine leere Liste", ergebnis.length === 0);
}

{
  // Rundung auf eine Nachkommastelle, keine Fliesskomma-Artefakte.
  const tage = [{ datum: "2026-01-01", tempMinC: 5.05, tempMaxC: 5.15, niederschlagMm: 0 }];
  const ergebnis = berechneTemperatursummen(tage);
  pruefe(
    "berechneTemperatursummen: rundet auf eine Nachkommastelle",
    Number.isInteger(ergebnis[0].temperatursumme * 10),
    `temperatursumme: ${ergebnis[0].temperatursumme}`,
  );
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
