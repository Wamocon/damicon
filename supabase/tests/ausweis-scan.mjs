#!/usr/bin/env node
// =============================================================================
// Damicon - Test der Ausweis-Scan-Zuordnungslogik (Anforderung 2.7/2.8)
// =============================================================================
// Ausfuehren:  node supabase/tests/ausweis-scan.mjs
//
// pflueckerZuAusweis() ist eine reine Funktion ohne Kamera-/Server-/
// Datenbankzugriff (siehe src/lib/domain/ausweis-scan.ts) - dieser Test
// braucht deshalb weder eine laufende Supabase-Instanz noch einen echten
// Kamera-Scan, anders als supabase/tests/integration.mjs. Die eigentliche
// Kamera-/QR-Dekodierung (qr-scanner, src/components/db/ausweis-scan.tsx)
// laesst sich in dieser Umgebung nicht automatisiert pruefen (kein Browser,
// keine Kamera in CI) - genau deshalb ist die Zuordnungslogik bewusst als
// eigene, isoliert testbare Funktion ausgelagert, dieselbe Trennung wie beim
// Zukauf-Import-Parser (zukauf-parser.mjs).
// =============================================================================

import { pflueckerZuAusweis } from "../../src/lib/domain/ausweis-scan.ts";

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

const LISTE = [
  { id: "p1", name: "L. Achmet", ausweis: "MAL-0441" },
  { id: "p2", name: "D. Sarsenbaj", ausweis: "MAL-0417" },
];

{
  const treffer = pflueckerZuAusweis("MAL-0417", LISTE);
  pruefe(
    "Exakter Ausweis-Code wird dem richtigen Pfluecker zugeordnet",
    treffer?.id === "p2",
    JSON.stringify(treffer),
  );
}

{
  // Ein Kamera-Scan liefert haeufig Gross-/Kleinschreibung so, wie der
  // gedruckte QR sie enthaelt - der gedruckte Ausweis selbst ist grossgeschrieben,
  // ein Vergleich darf trotzdem nicht an Schreibweise oder Rand-Leerzeichen
  // scheitern (z. B. bei einer manuellen Nachbesserung ohne Kamera).
  const treffer = pflueckerZuAusweis("  mal-0441  ", LISTE);
  pruefe(
    "Gross-/Kleinschreibung und Rand-Leerzeichen spielen keine Rolle",
    treffer?.id === "p1",
    JSON.stringify(treffer),
  );
}

{
  const treffer = pflueckerZuAusweis("MAL-9999", LISTE);
  pruefe(
    "Ein unbekannter/fremder Code liefert keinen Treffer statt eines falschen",
    treffer === null,
    JSON.stringify(treffer),
  );
}

{
  const treffer = pflueckerZuAusweis("", LISTE);
  pruefe("Ein leerer Code liefert keinen Treffer", treffer === null, JSON.stringify(treffer));
}

{
  const treffer = pflueckerZuAusweis("   ", LISTE);
  pruefe(
    "Ein nur aus Leerzeichen bestehender Code liefert keinen Treffer",
    treffer === null,
    JSON.stringify(treffer),
  );
}

{
  // Datenanomalie: zwei Pfluecker mit demselben Ausweis-Code (sollte durch
  // die unique-Constraint auf pfluecker.ausweis nicht vorkommen, die
  // Funktion selbst darf sich darauf aber nicht ungeprueft verlassen) -
  // lieber kein Treffer als eine willkuerliche erste Uebereinstimmung.
  const duplikatListe = [
    { id: "p1", name: "A", ausweis: "DUP-0001" },
    { id: "p2", name: "B", ausweis: "dup-0001" },
  ];
  const treffer = pflueckerZuAusweis("DUP-0001", duplikatListe);
  pruefe(
    "Ein mehrdeutiger Code (Datenanomalie) liefert keinen Treffer statt einer willkuerlichen Auswahl",
    treffer === null,
    JSON.stringify(treffer),
  );
}

{
  const treffer = pflueckerZuAusweis("MAL-0417", []);
  pruefe("Eine leere Referenzliste liefert keinen Treffer", treffer === null, JSON.stringify(treffer));
}

{
  // Verwechslungsgefahr in der Praxis: ein Steigen-Etikett kodiert eine volle
  // Herkunfts-URL (absoluteUrl(), qr.ts), kein Ausweis-Code - wird am
  // Sammelpunkt versehentlich ein Etikett statt eines Ausweises gescannt,
  // darf das nicht zufaellig auf einen Pfluecker passen.
  const etikettInhalt = "https://damicon.example.com/de/herkunft/hk_5d9d056eb3694c8a";
  const treffer = pflueckerZuAusweis(etikettInhalt, LISTE);
  pruefe(
    "Der QR-Inhalt eines Steigen-Etiketts (Herkunfts-URL) liefert keinen Treffer",
    treffer === null,
    JSON.stringify(treffer),
  );
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
