import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, Stat, StatusPill } from "../../src/components/ui/kit";

// Gerenderte Klassen der Bausteine aus ui/kit.tsx.
//
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

// 4. Gemischte Kinder: eine Zelle direkt, die uebrigen aus einem map(). So
//    baut die Rechtematrix ihre Zeilen (demo/buero.tsx) - und genau daran kann
//    die Zuordnung ueber die Reihenfolge scheitern, wenn das Array nicht
//    flachgezogen wird.
const gemischt = renderToStaticMarkup(
  <DataTable head={["Ressource", "Admin", "Brigade"]}>
    <tr>
      <td>Pflueckaufgaben</td>
      {["ja", "nein"].map((wert) => (
        <td key={wert}>{wert}</td>
      ))}
    </tr>
  </DataTable>,
);

pruefe(
  "Zellen aus einem map() neben einer direkten Zelle sind richtig zugeordnet",
  gemischt.includes('data-kopf="Ressource">Pflueckaufgaben') &&
    gemischt.includes('data-kopf="Admin">ja') &&
    gemischt.includes('data-kopf="Brigade">nein'),
  "Muster der Rechtematrix",
);

// 5. Eine Matrix bleibt eine Tabelle: sie traegt das Attribut, an dem die
//    Kartendarstellung sie auslaesst, und ihre Mindestbreite samt
//    Scrollbehaelter gilt auch unter md. Ohne beides laufen acht Spalten
//    Haekchen ueber den Rand hinaus und werden abgeschnitten.
const alsMatrix = renderToStaticMarkup(
  <DataTable matrix head={KOEPFE}>
    <tr>
      <td>Pflueckaufgaben</td>
      <td>ja</td>
      <td>nein</td>
    </tr>
  </DataTable>,
);

pruefe(
  "Eine Matrix traegt data-matrix, Scrollbehaelter und Mindestbreite",
  alsMatrix.includes("data-matrix") &&
    alsMatrix.includes("overflow-x-auto") &&
    alsMatrix.includes("min-w-[640px]"),
);

pruefe(
  "Eine gewoehnliche Tabelle traegt data-matrix nicht",
  !einfach.includes("data-matrix"),
);

// 6. Der Traeger traegt die Klasse, an der die Kartendarstellung haengt.
pruefe(
  "Der Traeger traegt die Klasse datentabelle",
  einfach.includes("datentabelle"),
);

// 7. Die Schriftgroessen der Fach-Oberflaeche ueberleben cn().
//
//    Sie hiessen zuerst text-label und text-dense, weil Tailwind aus einem
//    --text-*-Token von selbst eine Utility macht. Der Name sieht aber aus
//    wie eine Textfarbe - text-label steht neben text-primary -, und genau
//    dafuer haelt ihn tailwind-merge, das in cn() jede Klassenliste
//    bereinigt. In der Statuspille traf text-label auf text-success aus
//    toneClasses: tailwind-merge entfernte die vermeintlich ueberschriebene
//    Farbe und damit die Schriftgroesse gleich mit, die Pillen erbten 16 px
//    statt 11. Am Schreibtisch sichtbar, im Quelltext unsichtbar.
const pilleNeutral = renderToStaticMarkup(<StatusPill>Live-Daten</StatusPill>);
const pilleErfolg = renderToStaticMarkup(
  <StatusPill tone="success">Live-Daten</StatusPill>,
);

pruefe(
  "Die Statuspille behaelt ihre Schriftgroesse neben der Tonfarbe",
  pilleNeutral.includes("text-[11px]") &&
    pilleErfolg.includes("text-[11px]") &&
    pilleErfolg.includes("text-success"),
  "cn() mit tailwind-merge",
);

// Und sie waechst auf dem Handy NICHT mit: eine Pille ist ein Marker, keine
// Beschriftung. Mitgewachsen nahm sie in einer schmalen Karte zu viel Platz.
pruefe(
  "Die Statuspille traegt keine der beiden wachsenden Groessen",
  !pilleNeutral.includes("schrift-label") &&
    !pilleNeutral.includes("schrift-dense"),
);

const kachel = renderToStaticMarkup(
  <Stat label="Verlustquote" value="7,7 %" helper="aus 10 Datensaetzen" />,
);

pruefe(
  "Die Kennzahlkachel traegt beide Schriftgroessen",
  kachel.includes("schrift-label") && kachel.includes("schrift-dense"),
);

pruefe(
  "Keine Klasse heisst mehr text-label oder text-dense",
  !pilleNeutral.includes("text-label") &&
    !kachel.includes("text-label") &&
    !kachel.includes("text-dense"),
);

console.log(
  `\nPruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`,
);
if (fehlgeschlagen > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
