// Tests fuer die Liste mit Detailansicht (WMCNL-2488, DESIGN.md Abschnitt 14):
// Parameter in der Adresse, Zeitraumgrenzen in Betriebszeit Almaty, Blaettern,
// die Filter- und Sortierregeln der Pflueckaufgaben, die Rechte auf der Seite,
// die Faelligkeit neuer Aufgaben und die Texte in allen vier Sprachen.
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
import { istGueltigerTag, tagInZone, wandzeitZuUtc, zeitraumGrenzen } from "@/lib/listen/zeitraum";
import { nachbarn, seitenModell } from "@/lib/listen/seiten";
import {
  brigadeBedingung,
  darfAufgabeBearbeiten,
  darfBelegeSehen,
  faelligkeitZaehlt,
  fortschrittProzent,
  passtZuStatus,
  passtZuUebrigemFilter,
  pflueckFilterSchluessel,
  pflueckListenSchema,
  pflueckRechte,
  pflueckStandard,
  schreibUmfang,
  suchMuster,
  vergleicheAufgaben,
  type BrigadeBedingung,
  type FilterbareAufgabe,
  type PflueckRechte,
} from "@/lib/domain/pflueckaufgaben-liste";
import { aufgabenStatus, faelligkeitLesen } from "@/lib/domain/pflueckaufgaben";
import { demoSeite } from "@/lib/data/pflueckaufgaben-liste";
import type { AufgabeZeile } from "@/lib/data/pflueckaufgaben";
import { roles, type Role } from "@/lib/rbac";

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
  "ein Von, den es nicht gibt, faellt aus der Adresse",
  leseParameter(pflueckListenSchema, { zeitraum: "eigen", von: "2026-02-31", bis: "2026-03-02" }),
  { status: "alle", suche: "", zeitraum: "eigen", bis: "2026-03-02", seite: 1, reiter: "uebersicht" },
);

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
pruefe(
  "Schalttag 2024 vor dem Wechsel ist noch UTC+6",
  wandzeitZuUtc("2024-02-29T20:00")?.toISOString(),
  "2024-02-29T14:00:00.000Z",
);
pruefe(
  "am Tag nach dem Wechsel gilt UTC+5",
  wandzeitZuUtc("2024-03-01T12:00")?.toISOString(),
  "2024-03-01T07:00:00.000Z",
);
pruefe("31. Februar gibt es nicht", wandzeitZuUtc("2026-02-31T10:00"), null);
pruefe("25 Uhr gibt es nicht", wandzeitZuUtc("2026-09-24T25:00"), null);
pruefe(
  "59 Minuten ja, 60 nicht",
  [wandzeitZuUtc("2026-09-24T12:59") !== null, wandzeitZuUtc("2026-09-24T12:60")],
  [true, null],
);
pruefe("Monat 13 gibt es nicht", wandzeitZuUtc("2026-13-01"), null);
pruefe("Unsinn wird abgewiesen", wandzeitZuUtc("morgen frueh"), null);
pruefe(
  "Kalendertage: Schaltjahr, Monatsende, Format",
  ["2024-02-29", "2026-02-29", "2026-02-31", "2026-04-30", "2026-9-1", ""].map(istGueltigerTag),
  [true, false, false, true, false, false],
);

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
// Sonntag, 27.09.2026, mittags: noch dieselbe Woche wie am Donnerstag.
pruefe("der Sonntag gehoert zur laufenden Woche", zeitraumGrenzen("woche", {}, new Date("2026-09-27T07:00:00Z")), {
  ab: "2026-09-20T19:00:00.000Z",
  vor: "2026-09-27T19:00:00.000Z",
});
// Montag, 28.09.2026, 00:30 in Almaty - in UTC ist noch Sonntag.
pruefe(
  "kurz nach Mitternacht in Almaty beginnt die neue Woche",
  zeitraumGrenzen("woche", {}, new Date("2026-09-27T19:30:00Z")),
  { ab: "2026-09-27T19:00:00.000Z", vor: "2026-10-04T19:00:00.000Z" },
);
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
pruefe(
  "nur Bis laesst den Anfang offen",
  zeitraumGrenzen("eigen", { bis: "2026-09-15" }, donnerstag),
  { vor: "2026-09-15T19:00:00.000Z" },
);
pruefe(
  "einen Tag, den es nicht gibt, laesst der eigene Zeitraum fallen",
  zeitraumGrenzen("eigen", { von: "2026-02-31", bis: "2026-03-02" }, donnerstag),
  { vor: "2026-03-02T19:00:00.000Z" },
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
pruefe("die letzte Seite ist nur so lang wie der Rest", seitenModell(41, 3, 20), {
  seite: 3,
  seiten: 3,
  von: 40,
  bis: 59,
});
pruefe(
  "Seite 0, negative Seiten und Unsinn landen auf Seite 1",
  [0, -2, Number.NaN].map((seite) => seitenModell(40, seite, 20).seite),
  [1, 1, 1],
);
pruefe("Nachbarn in der Mitte", nachbarn(["a", "b", "c"], "b"), { vorher: "a", nachher: "c" });
pruefe("am Anfang gibt es keinen Vorgaenger", nachbarn(["a", "b"], "a"), { nachher: "b" });
pruefe("am Ende gibt es keinen Nachfolger", nachbarn(["a", "b"], "b"), { vorher: "a" });
pruefe("eine Aufgabe ausserhalb der Seite hat keine Nachbarn", nachbarn(["a", "b"], "x"), {});
pruefe("ohne Auswahl keine Nachbarn", nachbarn(["a", "b"], undefined), {});

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
pruefe("ohne Zuordnung", brigadeBedingung("ohne", "admin", "b1"), { art: "ohne" });

// Ueberfaellig ist eine Aufgabe nur, solange die Brigade pflueckt
// (entschieden am 25.09.2026).
pruefe(
  "die Faelligkeit zaehlt nur bis zur Mengenmeldung",
  aufgabenStatus.map((status) => faelligkeitZaehlt(status)),
  [true, true, true, false, false],
);

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
pruefe(
  "eine Faelligkeit in der Zukunft ist nicht ueberfaellig",
  passtZuStatus(aufgabe({ faelligkeit: "2026-09-25T10:00:00Z" }), "ueberfaellig", jetzt),
  false,
);
pruefe(
  "genau jetzt faellig ist noch nicht ueberfaellig",
  passtZuStatus(aufgabe({ faelligkeit: jetzt.toISOString() }), "ueberfaellig", jetzt),
  false,
);
pruefe(
  "ueberfaellig nach Status bei vergangener Faelligkeit",
  aufgabenStatus.map((status) =>
    passtZuStatus(aufgabe({ status, faelligkeit: "2026-09-23T10:00:00Z" }), "ueberfaellig", jetzt),
  ),
  [true, true, true, false, false],
);
pruefe(
  "zu erledigen ist alles ausser abgeschlossen, auch die Belegpruefung",
  aufgabenStatus.map((status) => passtZuStatus(aufgabe({ status }), "zu-erledigen", jetzt)),
  [true, true, true, true, false],
);
pruefe(
  "die Pille Belegpruefung zeigt genau die Belegpruefung",
  aufgabenStatus.map((status) => passtZuStatus(aufgabe({ status }), "belegpruefung", jetzt)),
  [false, false, false, true, false],
);

const findet = (suche: string) =>
  passtZuUebrigemFilter(aufgabe({}), { suche, brigade: { art: "alle" }, grenzen: {} });
pruefe("Suche findet die Sorte ohne Ruecksicht auf Gross- und Kleinschreibung", findet("polka"), true);
pruefe("das Leerzeichen in der Suche ist ein Platzhalter", findet("T-N 01"), true);
pruefe("die Teile muessen in dieser Reihenfolge stehen", findet("01 T-N"), false);
pruefe("jedes Feld fuer sich: Code und Sorte zusammen treffen nicht", findet("PA-1 Polka"), false);
pruefe("Suche ohne Treffer", findet("Elsanta"), false);
pruefe("ein Punkt in der Suche ist kein Platzhalter", suchMuster("T.N").test("T-N-A-01"), false);

pruefe(
  "Zeitraum schliesst Aufgaben ohne Faelligkeit aus",
  passtZuUebrigemFilter(aufgabe({}), {
    suche: "",
    brigade: { art: "alle" },
    grenzen: { ab: "2026-09-01T00:00:00Z" },
  }),
  false,
);
const woche = { ab: "2026-09-20T19:00:00.000Z", vor: "2026-09-27T19:00:00.000Z" };
pruefe(
  "der erste Moment des Zeitraums zaehlt mit, der erste danach nicht",
  ["2026-09-20T18:59:59.999Z", woche.ab, "2026-09-27T18:59:59.999Z", woche.vor].map((faelligkeit) =>
    passtZuUebrigemFilter(aufgabe({ faelligkeit }), { suche: "", brigade: { art: "alle" }, grenzen: woche }),
  ),
  [false, true, true, false],
);

// Aufgaben ohne Brigade, der eigenen und einer fremden.
const nachBrigade = (brigade: BrigadeBedingung) =>
  [null, "b1", "b2"].map((brigadeId) =>
    passtZuUebrigemFilter(aufgabe({ brigadeId }), { suche: "", brigade, grenzen: {} }),
  );
pruefe("eigene Brigade: freie und eigene, keine fremden", nachBrigade({ art: "eigeneUndOhne", id: "b1" }), [
  true,
  true,
  false,
]);
pruefe("ohne Zuordnung: nur freie", nachBrigade({ art: "ohne" }), [true, false, false]);
pruefe("eine Brigade: nur deren Aufgaben", nachBrigade({ art: "eine", id: "b2" }), [false, false, true]);

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
  "ohne Faelligkeit und ohne Anlagedatum ganz ans Ende",
  [aufgabe({ id: "a" }), aufgabe({ id: "b", angelegt: "2026-09-01T00:00:00Z" })]
    .sort(vergleicheAufgaben)
    .map((eintrag) => eintrag.id),
  ["b", "a"],
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

// ---- Rechte auf der Seite ----------------------------------------------------
// Welche Knoepfe erscheinen, haengt an pflueckRechte(). Die Datenbank lehnt
// ohnehin ab, was nicht erlaubt ist; ein falsches Recht hier zeigt einen
// Knopf, der beim Klick scheitert, oder versteckt einen, der funktionieren wuerde.
const gesetzt = (rechte: PflueckRechte) =>
  Object.entries(rechte)
    .filter(([, an]) => an)
    .map(([name]) => name);
const profil = (role: Role, brigadeId: string | null = null, darfKontrollieren = false) => ({
  role,
  brigadeId,
  darfKontrollieren,
});
pruefe(
  "die Leitung darf alles, auch an Aufgaben fremder Brigaden",
  gesetzt(pflueckRechte(profil("betriebsleitung"), true, { brigadeId: "b2" })),
  ["bearbeiten", "anlegen", "abschliessen", "kontrollieren", "handeln"],
);
pruefe(
  "Brigade an eigener Aufgabe: bearbeiten und anlegen, nicht freigeben",
  gesetzt(pflueckRechte(profil("brigade", "b1"), true, { brigadeId: "b1" })),
  ["bearbeiten", "anlegen", "handeln"],
);
pruefe(
  "Brigade an freier Aufgabe darf handeln",
  pflueckRechte(profil("brigade", "b1"), true, { brigadeId: null }).handeln,
  true,
);
pruefe(
  "Brigade an fremder Aufgabe: keine Knoepfe, nur der Hinweis",
  gesetzt(pflueckRechte(profil("brigade", "b1"), true, { brigadeId: "b2" })),
  ["bearbeiten", "anlegen", "fremdeBrigade"],
);
pruefe(
  "der Vorarbeiter am Sammelpunkt darf kontrollieren",
  gesetzt(pflueckRechte(profil("brigade", "b1", true), true)),
  ["bearbeiten", "anlegen", "kontrollieren"],
);
pruefe(
  "Buchhaltung und Erzeuger sehen nur",
  (["buchhaltung", "erzeuger"] as const).map((rolle) =>
    gesetzt(pflueckRechte(profil(rolle), true, { brigadeId: null })),
  ),
  [[], []],
);
pruefe(
  "mit Beispieldaten entfallen alle Formulare",
  gesetzt(pflueckRechte(profil("admin"), false, { brigadeId: null })),
  [],
);
pruefe("ohne Anmeldung nichts", gesetzt(pflueckRechte(null, true, { brigadeId: null })), []);
pruefe("die Leitung laedt alle Aufgaben und Pfluecker", schreibUmfang(profil("betriebsleitung")), null);
pruefe(
  "die Brigade laedt nur ihren Umfang, ohne Zuordnung nur freie Aufgaben",
  [schreibUmfang(profil("brigade", "b1")), schreibUmfang(profil("brigade"))],
  [{ brigadeId: "b1" }, { brigadeId: null }],
);
pruefe(
  "Fotobelege sehen die Rollen mit Leserecht in der Datenbank",
  roles.filter((rolle) => darfBelegeSehen(rolle)),
  ["admin", "ceo", "betriebsleitung", "buchhaltung", "brigade"],
);
pruefe(
  "Fortschritt in Prozent, begrenzt auf 0 bis 100",
  [[15, 30], [1, 3], [45, 30], [-5, 30], [10, 0]].map(([ist, ziel]) => fortschrittProzent(ist, ziel)),
  [50, 33, 100, 0, 0],
);

// ---- Faelligkeit einer neuen Aufgabe -----------------------------------------
// Formular und KI-Werkzeug liefern "JJJJ-MM-TTTHH:MM" in Betriebszeit.
const lies = (roh: string) => faelligkeitLesen(roh, jetzt)?.toISOString() ?? null;
pruefe("Datum und Uhrzeit in Betriebszeit", lies("2026-09-25T08:00"), "2026-09-25T03:00:00.000Z");
pruefe("Leerraum um die Eingabe stoert nicht", lies(" 2026-09-25T08:00 "), "2026-09-25T03:00:00.000Z");
pruefe("ohne Uhrzeit keine Faelligkeit", lies("2026-09-25"), null);
pruefe("mit Sekunden ist es nicht das Format des Formulars", lies("2026-09-25T08:00:00"), null);
pruefe("einen Tag, den es nicht gibt, auch nicht", lies("2026-02-31T08:00"), null);
pruefe("ein Tippfehler im Jahr faellt auf", lies("2206-09-25T08:00"), null);
pruefe(
  "ein Jahr voraus geht noch, ein Jahr und eine Woche nicht",
  [lies("2027-09-24T08:00") !== null, lies("2027-10-01T08:00")],
  [true, null],
);
pruefe("weit in der Vergangenheit ebenso nicht", lies("2025-09-01T08:00"), null);

// ---- Demo-Seite: dieselbe Logik im Speicher --------------------------------
const zeile = (id: string, status: AufgabeZeile["status"], faelligkeit: string | null): AufgabeZeile => ({
  id,
  code: id,
  reihenblock: "T-N-A-01",
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
pruefe(
  "Demo: die Seiten ergeben aneinandergereiht die ganze Liste in Reihenfolge",
  [1, 2, 3].flatMap((nummer) => demoSeite(ohneFilter, nummer, jetzt, "demo", viele).zeilen.map((z) => z.id)),
  [...viele].sort(vergleicheAufgaben).map((z) => z.id),
);
const gemischt = [
  zeile("PA-A", "offen", "2026-09-01T08:00:00Z"),
  zeile("PA-B", "in_arbeit", "2026-09-01T08:00:00Z"),
  zeile("PA-C", "beleg_pruefung", "2026-09-01T08:00:00Z"),
  zeile("PA-D", "abgeschlossen", "2026-09-01T08:00:00Z"),
  zeile("PA-E", "offen", "2026-10-01T08:00:00Z"),
];
pruefe(
  "Demo: die Belegpruefung ist zu erledigen, aber nicht ueberfaellig",
  demoSeite(ohneFilter, 1, jetzt, "demo", gemischt).zaehler,
  { alle: 5, "zu-erledigen": 4, ueberfaellig: 2, belegpruefung: 1, abgeschlossen: 1 },
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
  feld: t.pflueckaufgabenVerwaltung.feld,
  neu: t.pflueckaufgabenVerwaltung.neu,
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
