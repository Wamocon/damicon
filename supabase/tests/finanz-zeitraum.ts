// Tests fuer den Zeitraum- und Parameterteil der Finanzseite
// (lib/domain/finanzen.ts): Monatsgrenzen, Jahreswechsel, Schaltjahr, die
// Monatsliste des Filters und die Pruefung der Adresszeilen-Parameter.
//
// Reine Funktionen, kein Netzwerk, keine Datenbank. Aufruf:
// npm run test:finanz-zeitraum
//
// Warum eigene Tests: Die Grenzen werden als Zeichenketten gerechnet und
// gegen date-Spalten verglichen. Ein Fehler darin faellt nicht auf - die
// Seite zeigt dann einfach einen Tag zu wenig, und niemand merkt es. Die
// Parameterpruefung deckt ausserdem ab, dass ?zeilen=999999 keine Abfrage
// ueber den gesamten Bestand ausloest.

import {
  ZEILEN_HOECHSTENS,
  ZEILEN_STANDARD,
  finanzBereichAusText,
  ledgerTypAusText,
  monatsListe,
  zeilenAusText,
  zeitraumAusText,
  zeitraumGrenzen,
} from "@/lib/domain/finanzen";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ist: unknown, soll: unknown) {
  gesamt++;
  const a = JSON.stringify(ist);
  const b = JSON.stringify(soll);
  const ok = a === b;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok ? "" : `  - war ${a}, erwartet ${b}`}`);
}

// Feste Stichtage statt new Date(): sonst haengt das Ergebnis am Tag des
// Testlaufs, und der Januarfall waere elf Monate im Jahr nicht pruefbar.
const september = new Date(Date.UTC(2026, 8, 22));
const januar = new Date(Date.UTC(2026, 0, 15));
const maerz2024 = new Date(Date.UTC(2024, 2, 5));

// ---- Grenzen -------------------------------------------------------------
pruefe("monat deckt den ganzen September", zeitraumGrenzen("monat", september), {
  von: "2026-09-01",
  bis: "2026-09-30",
});
pruefe("vormonat im September ist August", zeitraumGrenzen("vormonat", september), {
  von: "2026-08-01",
  bis: "2026-08-31",
});
pruefe("vormonat im Januar springt ins Vorjahr", zeitraumGrenzen("vormonat", januar), {
  von: "2025-12-01",
  bis: "2025-12-31",
});
pruefe("Februar 2024 hat 29 Tage", zeitraumGrenzen("vormonat", maerz2024), {
  von: "2024-02-01",
  bis: "2024-02-29",
});
pruefe("Februar 2026 hat 28 Tage", zeitraumGrenzen("2026-02", september), {
  von: "2026-02-01",
  bis: "2026-02-28",
});
pruefe("jahr deckt das Kalenderjahr", zeitraumGrenzen("jahr", september), {
  von: "2026-01-01",
  bis: "2026-12-31",
});
pruefe("alles ist nach beiden Seiten offen", zeitraumGrenzen("alles", september), {
  von: null,
  bis: null,
});

// ---- Parameter aus der Adresszeile ---------------------------------------
pruefe("kein Zeitraum heisst dieser Monat", zeitraumAusText(undefined), "monat");
pruefe("Unsinn faellt auf dieser Monat", zeitraumAusText("morgen"), "monat");
pruefe("Monat 13 gibt es nicht", zeitraumAusText("2026-13"), "monat");
pruefe("Monat 00 gibt es nicht", zeitraumAusText("2026-00"), "monat");
pruefe("gueltiger Monat bleibt stehen", zeitraumAusText("2026-03"), "2026-03");
pruefe("Stufe bleibt stehen", zeitraumAusText("alles"), "alles");

pruefe("keine Zeilenzahl heisst Standard", zeilenAusText(undefined), ZEILEN_STANDARD);
pruefe("Buchstaben fallen auf den Standard", zeilenAusText("abc"), ZEILEN_STANDARD);
pruefe("unter dem Standard wird angehoben", zeilenAusText("1"), ZEILEN_STANDARD);
pruefe("negative Zahl wird angehoben", zeilenAusText("-5"), ZEILEN_STANDARD);
pruefe("zeilen=999999 faellt auf den Deckel", zeilenAusText("999999"), ZEILEN_HOECHSTENS);
pruefe("ein nachgeladener Wert bleibt", zeilenAusText("35"), 35);

pruefe("kein Bereich heisst Kostentraeger", finanzBereichAusText(undefined), "kostentraeger");
pruefe("fremder Bereich faellt zurueck", finanzBereichAusText("../etc"), "kostentraeger");
pruefe("gueltiger Bereich bleibt", finanzBereichAusText("buchungen"), "buchungen");
pruefe("fremder Typ wird verworfen", ledgerTypAusText("beides"), undefined);
pruefe("gueltiger Typ bleibt", ledgerTypAusText("kosten"), "kosten");

// ---- Monatsliste ---------------------------------------------------------
pruefe("ohne Buchung keine Monatsliste", monatsListe(null, september), []);
pruefe("Liste laeuft rueckwaerts bis zur aeltesten Buchung", monatsListe("2026-07-15", september), [
  "2026-09",
  "2026-08",
  "2026-07",
]);
pruefe("Liste traegt ueber den Jahreswechsel", monatsListe("2025-11-30", januar), [
  "2026-01",
  "2025-12",
  "2025-11",
]);
pruefe("lange Betriebsgeschichte wird gedeckelt", monatsListe("1990-01-01", september).length, 60);
pruefe("unbrauchbares Datum gibt eine leere Liste", monatsListe("kein-datum", september), []);

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
