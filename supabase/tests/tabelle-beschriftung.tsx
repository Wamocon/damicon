import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "../../src/components/ui/kit";

// DataTable haengt jeder Zelle ihren Spaltenkopf als data-kopf an, damit die
// Kartendarstellung auf dem Handy (globals.css, .datentabelle) Beschriftung
// und Wert nebeneinander zeigen kann. Die Zuordnung laeuft ueber die
// Reihenfolge der Zellen, und genau deshalb steht sie hier auf dem Pruefstand:
// verschiebt sie sich, steht auf dem Handy der falsche Name am Wert, und das
// faellt niemandem auf, der am Schreibtisch arbeitet.

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

const KOEPFE = ["Datum", "Brigade", "Menge"];

// 1. Der Normalfall: eine Zeile aus einem map(), drei Zellen.
const einfach = renderToStaticMarkup(
  <DataTable head={KOEPFE}>
    {[{ id: "a" }, { id: "b" }].map((z) => (
      <tr key={z.id}>
        <td>01.09.</td>
        <td>Brigade 1</td>
        <td>420 kg</td>
      </tr>
    ))}
  </DataTable>,
);

pruefe(
  "Jede Zelle traegt ihren eigenen Spaltenkopf",
  einfach.includes('data-kopf="Datum">01.09.') &&
    einfach.includes('data-kopf="Brigade">Brigade 1') &&
    einfach.includes('data-kopf="Menge">420 kg'),
  "3 Spalten",
);

pruefe(
  "Auch die zweite Zeile aus demselben map() ist beschriftet",
  (einfach.match(/data-kopf="Datum"/g) ?? []).length === 2,
  "2 Zeilen",
);

pruefe(
  "Die Kopfzeile bleibt erhalten (sie traegt den Schreibtisch-Fall)",
  KOEPFE.every((k) => einfach.includes(`>${k}</th>`)),
);

// 2. Die Leerzeile: eine Zelle ueber alle Spalten. Sie ist keine Wertzeile und
//    darf keine Beschriftung bekommen - "Datum: keine Daten vorhanden" waere
//    schlicht falsch.
const leer = renderToStaticMarkup(
  <DataTable head={KOEPFE}>
    <tr>
      <td colSpan={3}>Keine Daten vorhanden</td>
    </tr>
  </DataTable>,
);

pruefe(
  "Eine colSpan-Meldung bekommt keine Beschriftung",
  leer.includes("Keine Daten vorhanden") && !leer.includes("data-kopf"),
);

// 3. Mehr Zellen als Koepfe: darf nicht zu undefined im Markup fuehren.
const zuViele = renderToStaticMarkup(
  <DataTable head={["Nur einer"]}>
    <tr>
      <td>A</td>
      <td>B</td>
    </tr>
  </DataTable>,
);

pruefe(
  "Eine Zelle ohne zugehoerigen Kopf bleibt unbeschriftet",
  zuViele.includes('data-kopf="Nur einer"') &&
    !zuViele.includes('data-kopf="undefined"'),
);

// 4. Der Traeger traegt die Klasse, an der die Kartendarstellung haengt.
pruefe(
  "Der Traeger traegt die Klasse datentabelle",
  einfach.includes("datentabelle"),
);

console.log(
  `\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`,
);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
