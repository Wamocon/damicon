// Tests fuer die Liste mit Detailansicht (WMCNL-2488, DESIGN.md Abschnitt 14):
// Parameter in der Adresse, Zeitraumgrenzen in Betriebszeit Almaty, Blaettern,
// die Filter- und Sortierregeln der Pflueckaufgaben und die Texte in allen
// vier Sprachen.
//
// Reine Funktionen, kein Netzwerk, keine Datenbank. Aufruf:
// npm run test:listen
//
// Warum eigene Tests: Die Grenzen eines Zeitraums, die Reihenfolge der Liste
// und die Regel "ein Filterwechsel springt auf Seite 1" sieht man der Seite
// nicht an. Ein Fehler zeigt sich als ein Eintrag zu viel oder zu wenig, als
// Seite, die sich mit der naechsten ueberschneidet, oder als leere Seite 4.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  aktiveFilter,
  einzelwert,
  leseParameter,
  listenQuery,
  suchtextBereinigen,
} from "@/lib/listen/parameter";
import { tagInZone, wandzeitZuUtc, zeitraumGrenzen } from "@/lib/listen/zeitraum";
import { nachbarn, seitenModell } from "@/lib/listen/seiten";
import {
  brigadeBedingung,
  darfAufgabeBearbeiten,
  passtZuStatus,
  passtZuUebrigemFilter,
  pflueckFilterSchluessel,
  pflueckListenSchema,
  pflueckStandard,
  vergleicheAufgaben,
  type FilterbareAufgabe,
} from "@/lib/domain/pflueckaufgaben-liste";
import { demoSeite } from "@/lib/data/pflueckaufgaben-liste";
import type { AufgabeZeile } from "@/lib/data/pflueckaufgaben";

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

// Query-Objekte ohne Ruecksicht auf die Reihenfolge der Schluessel vergleichen:
// URLSearchParams sortiert ohnehin nicht, und die Reihenfolge traegt nichts.
const sortiert = (objekt: Record<string, string>) =>
  Object.fromEntries(Object.entries(objekt).sort(([a], [b]) => a.localeCompare(b)));

// ---- Parameter -----------------------------------------------------------
pruefe("einzelwert nimmt den ersten von mehreren", einzelwert(["a", "b"]), "a");
pruefe("einzelwert laesst fehlende Werte fehlen", einzelwert(undefined), undefined);

const leer = leseParameter(pflueckListenSchema, {});
pruefe("ohne Parameter gelten die Standardwerte", leer, {
  status: "alle",
  suche: "",
  zeitraum: "alle",
  seite: 1,
  reiter: "uebersicht",
});

const verbogen = leseParameter(pflueckListenSchema, {
  status: "geloescht",
  seite: "-3",
  reiter: "admin",
  aufgabe: "x'; drop table",
  brigade: "../etc",
  von: "24.09.2026",
  zeitraum: "ewig",
});
pruefe("ungueltige Werte fallen auf den Standard zurueck, statt zu werfen", verbogen, {
  status: "alle",
  suche: "",
  zeitraum: "alle",
  seite: 1,
  reiter: "uebersicht",
});

const gueltig = leseParameter(pflueckListenSchema, {
  status: "belegpruefung",
  suche: "  T-N-A,01 ",
  brigade: "meine",
  zeitraum: "eigen",
  von: "2026-09-01",
  seite: ["3", "9"],
  aufgabe: "52a9dafa-e9e5-4ec8-868c-eb9dec5d9ab1",
  reiter: "fotos",
});
pruefe("gueltige Werte kommen an, Seite aus dem ersten Wert", gueltig, {
  status: "belegpruefung",
  suche: "T-N-A 01",
  brigade: "meine",
  zeitraum: "eigen",
  von: "2026-09-01",
  seite: 3,
  aufgabe: "52a9dafa-e9e5-4ec8-868c-eb9dec5d9ab1",
  reiter: "fotos",
});

pruefe(
  "Suchtext verliert PostgREST-Syntax und Platzhalter",
  suchtextBereinigen(`a,b(c)*d%e_f:g"h`),
  "a b c d e f g h",
);
pruefe("Suchtext wird gekuerzt", suchtextBereinigen("x".repeat(80)).length, 60);

const standard = pflueckStandard("betriebsleitung");
const werte = { ...standard, status: "belegpruefung", seite: 4, aufgabe: "abc", reiter: "fotos" };
pruefe(
  "Standardwerte fallen aus der Adresse, Auswahl und Reiter bleiben",
  sortiert(listenQuery({ werte, standard, filterSchluessel: pflueckFilterSchluessel })),
  sortiert({ status: "belegpruefung", seite: "4", aufgabe: "abc", reiter: "fotos" }),
);
pruefe(
  "ein Filterwechsel springt auf Seite 1",
  sortiert(listenQuery({
    werte,
    standard,
    aenderung: { status: "abgeschlossen" },
    filterSchluessel: pflueckFilterSchluessel,
  })),
  sortiert({ status: "abgeschlossen", aufgabe: "abc", reiter: "fotos" }),
);
pruefe(
  "ein Wechsel der Aufgabe behaelt Seite und Reiter",
  sortiert(listenQuery({
    werte,
    standard,
    aenderung: { aufgabe: "def" },
    filterSchluessel: pflueckFilterSchluessel,
  })),
  sortiert({ status: "belegpruefung", seite: "4", aufgabe: "def", reiter: "fotos" }),
);
pruefe(
  "Schliessen nimmt Auswahl und Reiter heraus",
  sortiert(listenQuery({
    werte,
    standard,
    aenderung: { aufgabe: undefined, reiter: undefined },
    filterSchluessel: pflueckFilterSchluessel,
  })),
  sortiert({ status: "belegpruefung", seite: "4" }),
);
pruefe("Brigade vorbelegt mit der eigenen", pflueckStandard("brigade").brigade, "meine");
pruefe(
  "aktive Filter zaehlen nur Abweichungen vom Standard",
  aktiveFilter({ ...standard, suche: "Polka", brigade: "alle" }, standard, ["suche", "brigade", "zeitraum"]),
  1,
);

// ---- Zeitraum in Betriebszeit Almaty ---------------------------------------
// Almaty ist seit dem 1. Maerz 2024 UTC+5, davor war es UTC+6.
pruefe(
  "Wandzeit September 2026 ist UTC+5",
  wandzeitZuUtc("2026-09-24T14:30")?.toISOString(),
  "2026-09-24T09:30:00.000Z",
);
pruefe(
  "Wandzeit Januar 2024 ist noch UTC+6",
  wandzeitZuUtc("2024-01-15T12:00")?.toISOString(),
  "2024-01-15T06:00:00.000Z",
);
pruefe("reines Datum ist Mitternacht in Almaty", wandzeitZuUtc("2026-09-24")?.toISOString(), "2026-09-23T19:00:00.000Z");
pruefe("31. Februar gibt es nicht", wandzeitZuUtc("2026-02-31T10:00"), null);
pruefe("25 Uhr gibt es nicht", wandzeitZuUtc("2026-09-24T25:00"), null);
pruefe("Unsinn wird abgewiesen", wandzeitZuUtc("morgen frueh"), null);

// 20:30 UTC ist in Almaty schon 01:30 am naechsten Tag.
const spaet = new Date("2026-09-24T20:30:00Z");
pruefe("der Tag auf dem Feld beginnt vor dem UTC-Tag", tagInZone(spaet), "2026-09-25");
pruefe("heute gilt in Betriebszeit", zeitraumGrenzen("heute", {}, spaet), {
  ab: "2026-09-24T19:00:00.000Z",
  vor: "2026-09-25T19:00:00.000Z",
});
// Donnerstag, 24.09.2026, mittags: die Woche beginnt am Montag, 21.09.
const donnerstag = new Date("2026-09-24T07:00:00Z");
pruefe("die Woche beginnt am Montag", zeitraumGrenzen("woche", {}, donnerstag), {
  ab: "2026-09-20T19:00:00.000Z",
  vor: "2026-09-27T19:00:00.000Z",
});
pruefe("der Monat reicht bis zum ersten des naechsten", zeitraumGrenzen("monat", {}, donnerstag), {
  ab: "2026-08-31T19:00:00.000Z",
  vor: "2026-09-30T19:00:00.000Z",
});
pruefe(
  "Dezember springt ins naechste Jahr",
  zeitraumGrenzen("monat", {}, new Date("2026-12-10T07:00:00Z")),
  { ab: "2026-11-30T19:00:00.000Z", vor: "2026-12-31T19:00:00.000Z" },
);
pruefe("die Saison ist das Kalenderjahr", zeitraumGrenzen("saison", {}, donnerstag), {
  ab: "2025-12-31T19:00:00.000Z",
  vor: "2026-12-31T19:00:00.000Z",
});
pruefe("alle hat keine Grenzen", zeitraumGrenzen("alle", {}, donnerstag), {});
pruefe(
  "eigener Zeitraum schliesst den Bis-Tag ein",
  zeitraumGrenzen("eigen", { von: "2026-09-01", bis: "2026-09-15" }, donnerstag),
  { ab: "2026-08-31T19:00:00.000Z", vor: "2026-09-15T19:00:00.000Z" },
);
pruefe(
  "vertauschtes Von und Bis wird gedreht",
  zeitraumGrenzen("eigen", { von: "2026-09-15", bis: "2026-09-01" }, donnerstag),
  { ab: "2026-08-31T19:00:00.000Z", vor: "2026-09-15T19:00:00.000Z" },
);
pruefe(
  "nur Von laesst das Ende offen",
  zeitraumGrenzen("eigen", { von: "2026-09-01" }, donnerstag),
  { ab: "2026-08-31T19:00:00.000Z" },
);

// ---- Blaettern -------------------------------------------------------------
pruefe("leere Liste hat eine Seite", seitenModell(0, 1, 20), { seite: 1, seiten: 1, von: 0, bis: 19 });
pruefe("Seite 2 beginnt bei 20", seitenModell(40, 2, 20), { seite: 2, seiten: 2, von: 20, bis: 39 });
pruefe("zu grosse Seite wird auf die letzte geklemmt", seitenModell(117, 9, 20), {
  seite: 6,
  seiten: 6,
  von: 100,
  bis: 119,
});
pruefe("Nachbarn in der Mitte", nachbarn(["a", "b", "c"], "b"), { vorher: "a", nachher: "c" });
pruefe("am Anfang gibt es keinen Vorgaenger", nachbarn(["a", "b"], "a"), { nachher: "b" });
pruefe("eine Aufgabe ausserhalb der Seite hat keine Nachbarn", nachbarn(["a", "b"], "x"), {});

// ---- Filter und Reihenfolge der Pflueckaufgaben ----------------------------
pruefe("alle Brigaden", brigadeBedingung("alle", "betriebsleitung", null), { art: "alle" });
pruefe("eigene Brigade samt freien Aufgaben", brigadeBedingung("meine", "brigade", "b1"), {
  art: "eigeneUndOhne",
  id: "b1",
});
pruefe("Brigade ohne Zuordnung sieht nur freie Aufgaben", brigadeBedingung("meine", "brigade", null), {
  art: "ohne",
});
pruefe("meine bedeutet fuer die Leitung nichts", brigadeBedingung("meine", "betriebsleitung", null), {
  art: "alle",
});
pruefe("eine bestimmte Brigade", brigadeBedingung("b2", "admin", null), { art: "eine", id: "b2" });

const jetzt = new Date("2026-09-24T07:00:00Z");
const aufgabe = (teil: Partial<FilterbareAufgabe>): FilterbareAufgabe => ({
  id: "x",
  code: "PA-1",
  reihenblock: "T-N-A-01",
  sorte: "Polka",
  brigadeId: null,
  status: "offen",
  faelligkeit: null,
  angelegt: null,
  ...teil,
});
pruefe(
  "ueberfaellig: offen und Faelligkeit vorbei",
  passtZuStatus(aufgabe({ faelligkeit: "2026-09-23T10:00:00Z" }), "ueberfaellig", jetzt),
  true,
);
pruefe(
  "abgeschlossen ist nie ueberfaellig",
  passtZuStatus(aufgabe({ status: "abgeschlossen", faelligkeit: "2026-09-23T10:00:00Z" }), "ueberfaellig", jetzt),
  false,
);
pruefe("ohne Faelligkeit nie ueberfaellig", passtZuStatus(aufgabe({}), "ueberfaellig", jetzt), false);
pruefe("zu erledigen umfasst die Belegpruefung", passtZuStatus(aufgabe({ status: "beleg_pruefung" }), "zu-erledigen", jetzt), true);
pruefe(
  "Suche findet die Sorte ohne Ruecksicht auf Gross- und Kleinschreibung",
  passtZuUebrigemFilter(aufgabe({}), { suche: "polka", brigade: { art: "alle" }, grenzen: {} }),
  true,
);
pruefe(
  "Zeitraum schliesst Aufgaben ohne Faelligkeit aus",
  passtZuUebrigemFilter(aufgabe({}), {
    suche: "",
    brigade: { art: "alle" },
    grenzen: { ab: "2026-09-01T00:00:00Z" },
  }),
  false,
);
pruefe(
  "eigene Brigade sieht fremde Aufgaben nicht",
  passtZuUebrigemFilter(aufgabe({ brigadeId: "b2" }), {
    suche: "",
    brigade: { art: "eigeneUndOhne", id: "b1" },
    grenzen: {},
  }),
  false,
);

const reihenfolge = [
  aufgabe({ id: "ohne-neu", angelegt: "2026-09-20T00:00:00Z" }),
  aufgabe({ id: "frueh", faelligkeit: "2026-09-01T00:00:00Z" }),
  aufgabe({ id: "b-spaet", faelligkeit: "2026-09-10T00:00:00Z" }),
  aufgabe({ id: "a-spaet", faelligkeit: "2026-09-10T00:00:00Z" }),
  aufgabe({ id: "ohne-alt", angelegt: "2026-08-01T00:00:00Z" }),
]
  .sort(vergleicheAufgaben)
  .map((eintrag) => eintrag.id);
pruefe(
  "spaeteste Faelligkeit zuerst, ID als Stichentscheid, ohne Faelligkeit am Ende",
  reihenfolge,
  ["a-spaet", "b-spaet", "frueh", "ohne-neu", "ohne-alt"],
);

pruefe(
  "Brigade darf eigene und freie Aufgaben bearbeiten",
  [null, "b1", "b2"].map((brigadeId) =>
    darfAufgabeBearbeiten({ role: "brigade", brigadeId: "b1" }, { brigadeId }),
  ),
  [true, true, false],
);
pruefe(
  "die Leitung darf jede Aufgabe bearbeiten",
  darfAufgabeBearbeiten({ role: "betriebsleitung", brigadeId: null }, { brigadeId: "b2" }),
  true,
);

// ---- Demo-Seite: dieselbe Logik im Speicher --------------------------------
const zeile = (id: string, status: AufgabeZeile["status"], faelligkeit: string | null): AufgabeZeile => ({
  id,
  code: id,
  reihenblock: "T-N-A-01",
  reihenblockId: "T-N-A-01",
  sorte: "Polka",
  brigade: "Brigade Nord",
  brigadeId: "brigade-nord",
  pflueckerAnzahl: 4,
  status,
  faelligkeit,
  angelegt: null,
  zielmengeKg: 30,
  istMengeKg: 0,
  ausschussKg: 0,
  qualitaetsfaktor: null,
  belegAnzahl: 0,
});
const viele = Array.from({ length: 45 }, (_, i) =>
  zeile(`PA-${String(i).padStart(2, "0")}`, i < 5 ? "offen" : "abgeschlossen", `2026-08-${String((i % 28) + 1).padStart(2, "0")}T08:00:00Z`),
);
const ohneFilter = { status: "alle" as const, suche: "", brigade: { art: "alle" as const }, grenzen: {} };
const seite3 = demoSeite(ohneFilter, 3, jetzt, "demo", viele);
pruefe("Demo: 45 Eintraege ergeben drei Seiten", [seite3.seiten, seite3.seite, seite3.zeilen.length], [3, 3, 5]);
pruefe("Demo: Zaehler je Pille", seite3.zaehler, {
  alle: 45,
  "zu-erledigen": 5,
  ueberfaellig: 5,
  belegpruefung: 0,
  abgeschlossen: 40,
});
const ersteSeite = demoSeite(ohneFilter, 1, jetzt, "demo", viele).zeilen.map((z) => z.id);
const zweiteSeite = demoSeite(ohneFilter, 2, jetzt, "demo", viele).zeilen.map((z) => z.id);
pruefe(
  "Demo: Seiten ueberschneiden sich nicht",
  ersteSeite.filter((id) => zweiteSeite.includes(id)),
  [],
);

// ---- Texte in allen vier Sprachen ------------------------------------------
function schluessel(wert: unknown, pfad = ""): string[] {
  if (typeof wert !== "object" || wert === null) return [pfad];
  return Object.entries(wert).flatMap(([name, kind]) => schluessel(kind, pfad ? `${pfad}.${name}` : name));
}
const sprachen = ["de", "en", "ru", "kk"] as const;
const texte = Object.fromEntries(
  sprachen.map((sprache) => [
    sprache,
    JSON.parse(readFileSync(join(process.cwd(), "src", "messages", `${sprache}.json`), "utf8")),
  ]),
) as Record<(typeof sprachen)[number], Record<string, Record<string, unknown>>>;
const bereiche = (t: Record<string, Record<string, unknown>>) => ({
  liste: t.liste,
  filter: t.pflueckaufgabenVerwaltung.filter,
  listeTexte: t.pflueckaufgabenVerwaltung.liste,
  panel: t.pflueckaufgabenVerwaltung.panel,
  schritt: t.pflueckaufgabenVerwaltung.schritt,
});
const deutsch = schluessel(bereiche(texte.de)).sort();
for (const sprache of sprachen.slice(1)) {
  pruefe(`Texte ${sprache}: dieselben Schluessel wie Deutsch`, schluessel(bereiche(texte[sprache])).sort(), deutsch);
}

console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
if (fehler > 0) process.exit(1);
console.log("Alle Pruefungen bestanden.");
