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

import { berechneTemperatursummen, gddBeitrag, GDD_BASIS_TEMPERATUR_C, summeBis, tagesMittel, waermeStand } from "../../src/lib/domain/wetter.ts";

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

{
  pruefe("tagesMittel: Mittelwert aus Tiefst- und Höchstwert, ohne einen der beiden null", tagesMittel(8, 20) === 14 && tagesMittel(null, 20) === null && tagesMittel(8, null) === null);
}

{
  pruefe("waermeStand: ohne Tage gibt es keinen Stand", waermeStand([]) === null);

  // Zehn Tage: neun warme (Beitrag je 10) und ein kalter am 09.06. (Beitrag 0).
  const roh = Array.from({ length: 10 }, (_, i) => ({
    datum: `2026-06-${String(i + 1).padStart(2, "0")}`,
    tempMinC: i === 8 ? -5 : 10,
    tempMaxC: i === 8 ? 2 : 20,
    niederschlagMm: 0,
  }));
  const tage = berechneTemperatursummen(roh);
  const stand = waermeStand(tage);
  pruefe("waermeStand: Summe, Zahl der Tage und Durchschnitt je Tag", stand?.summe === 90 && stand?.tage === 10 && stand?.schnittJeTag === 9, JSON.stringify(stand));
  pruefe("waermeStand: der letzte Tag mit Mittel und Beitrag", stand?.letzterTag.datum === "2026-06-10" && stand?.letzterTag.mittelC === 15 && stand?.letzterTag.beitrag === 10);
  // Die letzten sieben Kalendertage bis zum 10.06. sind der 04. bis 10.06.: sechs warme Tage (je 10) und der kalte am 09.06. (0).
  pruefe("waermeStand: die letzten sieben Tage zählen ihre Beiträge, der kalte trägt 0 bei", stand?.siebenTage === 60, `siebenTage: ${stand?.siebenTage}`);
}

{
  // Eine Lücke in der Reihe: die letzten sieben Kalendertage zählen nach dem Datum, nicht nach der Zahl der Zeilen.
  const tage = berechneTemperatursummen([
    { datum: "2026-06-01", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
    { datum: "2026-06-02", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
    { datum: "2026-06-20", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
  ]);
  const stand = waermeStand(tage);
  pruefe("waermeStand: Lücken in der Reihe verschieben die Woche nicht", stand?.siebenTage === 10 && stand?.tage === 3 && stand?.summe === 30, JSON.stringify(stand));
}

{
  const tage = berechneTemperatursummen([
    { datum: "2026-06-01", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
    { datum: "2026-06-02", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
    { datum: "2026-06-05", tempMinC: 10, tempMaxC: 20, niederschlagMm: 0 },
  ]);
  pruefe("summeBis: der letzte Tag bis zum Datum, auch wenn der genaue Tag fehlt", summeBis(tage, "2026-06-04")?.datum === "2026-06-02" && summeBis(tage, "2026-06-04")?.summe === 20);
  pruefe("summeBis: liegt das Datum vor der Reihe, gibt es keinen Wert", summeBis(tage, "2026-05-31") === null);
  pruefe("summeBis: am letzten Tag und danach die volle Summe", summeBis(tage, "2026-06-05")?.summe === 30 && summeBis(tage, "2026-12-31")?.summe === 30);
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
