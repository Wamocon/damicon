// Abholrunden bei Nachbarbetrieben (WMCNL-1577): die Regeln der Domain (60-Minuten-Regel, Planungshilfe, Eingaben), die Lesart der
// Routenreihenfolge von OSRM und die Texte in vier Sprachen. Reine Funktionen, kein Netzwerk, keine Datenbank. Die Datenbankseite
// prueft test:abholrunden-db, das Dokument test:dokument.
//
// Aufruf: npm run test:abholrunden

import { readFileSync } from "node:fs";
import {
  AUSLASTUNG_KNAPP_PROZENT,
  KAPAZITAET_MAX_KG,
  MAX_VORLAUF_MINUTEN,
  abholungFehler,
  ankuenfteNachMinuten,
  auslastung,
  fensterFehler,
  fensterStand,
  istUhrzeit,
  kurzeUhrzeit,
  bewertePlanung,
  bewerteAbholung,
  minutenBisKuehlung,
  pflueckbeginnAus,
  rundeFehler,
  rundenZusammenfassung,
  type AbholStoppZeile,
} from "@/lib/domain/abholrunden";
import { minutenAbErstemStopp, stoppPositionen } from "@/lib/tourenplanung/osrm-client";
import { ortszeitAlsInstant, uhrzeitInZone } from "@/lib/domain/tageszeit";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

// --- 1. 60-Minuten-Regel -----------------------------------------------------------------------------------------------------------
check("Regel: bis 45 Minuten in Ordnung, 46 bis 60 Warnung, ab 61 Verstoss", bewerteAbholung(0) === "ok" && bewerteAbholung(45) === "ok" && bewerteAbholung(46) === "warnung" && bewerteAbholung(60) === "warnung" && bewerteAbholung(61) === "verstoss");
check("Regel: ohne bekannten Pflueckbeginn eine Warnung statt ok", bewerteAbholung(null) === "warnung");
check("Minuten: vom Pflueckbeginn bis zur Ankunft, gerundet", minutenBisKuehlung("2026-10-14T08:00:00Z", "2026-10-14T08:50:29Z") === 50 && minutenBisKuehlung("2026-10-14T08:00:00Z", "2026-10-14T08:50:31Z") === 51);
check("Minuten: nie negativ, ohne eine der beiden Zeiten oder bei Muell keine Zahl", minutenBisKuehlung("2026-10-14T09:00:00Z", "2026-10-14T08:00:00Z") === 0 && minutenBisKuehlung(null, "2026-10-14T08:00:00Z") === null && minutenBisKuehlung("2026-10-14T08:00:00Z", null) === null && minutenBisKuehlung("kein Datum", "2026-10-14T08:00:00Z") === null);
check("Pflueckbeginn: Minuten vor der Uhr des Geraets", pflueckbeginnAus("2026-10-14T09:00:00.000Z", 40) === "2026-10-14T08:20:00.000Z" && pflueckbeginnAus("2026-10-14T09:00:00.000Z", 0) === "2026-10-14T09:00:00.000Z" && pflueckbeginnAus("Muell", 5) === null);

// --- 2. Planungshilfe --------------------------------------------------------------------------------------------------------------
check("Planung: ohne berechnete Route keine Aussage, sonst dieselben Grenzen", bewertePlanung(null) === null && bewertePlanung(30) === "ok" && bewertePlanung(50) === "warnung" && bewertePlanung(75) === "verstoss");

// --- 3. Zusammenfassung ----------------------------------------------------------------------------------------------------------
const stopp = (extra: Partial<AbholStoppZeile>): AbholStoppZeile => ({
  id: "s", nachbarbetriebId: "n", nachbarbetrieb: "Nachbar", ort: null, adresse: null, kontakt: null, breitengrad: null, laengengrad: null, reihenfolge: 0,
  mengeGeplantKg: 100, sorte: null, status: "geplant", mengeIstKg: null, pflueckbeginn: null, abgeholtAm: null, bemerkung: null, minutenBisKuehlung: null, ergebnis: null, ...extra,
});
{
  const z = rundenZusammenfassung([
    stopp({ status: "abgeholt", mengeIstKg: 90, ergebnis: "ok" }),
    stopp({ status: "abgeholt", mengeIstKg: 80, ergebnis: "verstoss" }),
    stopp({ status: "abgeholt", mengeIstKg: 70, ergebnis: "warnung" }),
    stopp({ status: "entfallen" }),
    stopp({ status: "geplant" }),
  ]);
  check("Zusammenfassung: Mengen, Zaehlung nach Status, schlechtestes Ergebnis", z.istKg === 240 && z.geplantKg === 400 && z.abgeholt === 3 && z.entfallen === 1 && z.offen === 1 && z.schlechtestes === "verstoss" && z.ergebnisse.ok === 1 && z.ergebnisse.warnung === 1 && z.ergebnisse.verstoss === 1, JSON.stringify(z));
  check("Zusammenfassung: ohne Bewertung kein Ergebnis", rundenZusammenfassung([stopp({})]).schlechtestes === null && rundenZusammenfassung([]).geplantKg === 0);
}

// --- 4. Eingaben -----------------------------------------------------------------------------------------------------------------
{
  const ok = { datum: "2026-10-20", fahrzeug: "Kuehlwagen 1", notiz: "", stopps: [{ nachbarbetriebId: "a", mengeKg: 120 }, { nachbarbetriebId: "b", mengeKg: 80 }] };
  check("Runde: eine vollstaendige Eingabe ist in Ordnung", rundeFehler(ok) === null && rundeFehler({ ...ok, fahrzeug: "" }) === null);
  check("Runde: Datum, Fahrzeug, Notiz", rundeFehler({ ...ok, datum: "2026-02-30" }) === "arDatum" && rundeFehler({ ...ok, fahrzeug: "x".repeat(61) }) === "arFahrzeug" && rundeFehler({ ...ok, notiz: "x".repeat(501) }) === "arNotiz");
  check("Runde: mindestens ein Stopp, Menge groesser als null, kein Betrieb doppelt", rundeFehler({ ...ok, stopps: [] }) === "arStopps" && rundeFehler({ ...ok, stopps: [{ nachbarbetriebId: "a", mengeKg: 0 }] }) === "arMenge" && rundeFehler({ ...ok, stopps: [{ nachbarbetriebId: "a", mengeKg: null }] }) === "arMenge" && rundeFehler({ ...ok, stopps: [{ nachbarbetriebId: "a", mengeKg: 5 }, { nachbarbetriebId: "a", mengeKg: 6 }] }) === "arDoppelt");
  check("Abholung: Menge 0 oder mehr, Vorlauf leer oder bis 24 Stunden", abholungFehler({ mengeKg: 0, vorMinuten: null, bemerkung: "" }) === null && abholungFehler({ mengeKg: 95.5, vorMinuten: 40, bemerkung: "" }) === null && abholungFehler({ mengeKg: -1, vorMinuten: null, bemerkung: "" }) === "arMenge" && abholungFehler({ mengeKg: null, vorMinuten: null, bemerkung: "" }) === "arMenge");
  check("Abholung: ein Vorlauf ueber 24 Stunden oder negativ oder keine Zahl wird abgelehnt", abholungFehler({ mengeKg: 1, vorMinuten: MAX_VORLAUF_MINUTEN, bemerkung: "" }) === null && abholungFehler({ mengeKg: 1, vorMinuten: MAX_VORLAUF_MINUTEN + 1, bemerkung: "" }) === "arVorlauf" && abholungFehler({ mengeKg: 1, vorMinuten: -5, bemerkung: "" }) === "arVorlauf" && abholungFehler({ mengeKg: 1, vorMinuten: Number.NaN, bemerkung: "" }) === "arVorlauf" && abholungFehler({ mengeKg: 1, vorMinuten: 5, bemerkung: "x".repeat(501) }) === "arBemerkung");
}

// --- 5. Routenreihenfolge von OSRM -------------------------------------------------------------------------------------------------
// OSRM liefert je Eingabepunkt seine Position in der Route (waypoint_index). Eingabe: Hof, A, B, C. Faehrt die Route Hof, C, A, B,
// lauten die waypoint_index je Eingabepunkt 0, 2, 3, 1. Frueher las der Code diese Liste in der falschen Richtung und ordnete die
// Stopps als B, C, A. Der Test haelt die richtige Lesart fest.
{
  const reihenfolge = [0, 2, 3, 1];
  const eingabe = ["A", "B", "C"];
  const positionen = stoppPositionen(reihenfolge);
  const geordnet = eingabe.map((name, i) => ({ name, position: positionen[i] })).sort((a, b) => a.position - b.position).map((x) => x.name);
  check("Route: die Stopps stehen in der Reihenfolge der Route (C, A, B), nicht in der umgekehrten Lesart", positionen.join(",") === "1,2,0" && geordnet.join("") === "CAB");
  const falsch = reihenfolge.filter((i) => i > 0).map((i) => eingabe[i - 1]).join("");
  check("Route: die alte Lesart ergab eine andere Reihenfolge (Regression)", falsch === "BCA" && falsch !== geordnet.join(""));
  check("Route: bei der Identitaet bleibt die Eingabe", stoppPositionen([0, 1, 2, 3]).join(",") === "0,1,2");
  check("Fahrzeit: ab dem ersten Stopp ohne die Anfahrt, ohne Teilstrecken keine Zahl", minutenAbErstemStopp({ teilstreckenSekunden: [600, 1200, 900, 600] }) === 45 && minutenAbErstemStopp({ teilstreckenSekunden: [] }) === null && minutenAbErstemStopp({ teilstreckenSekunden: [600] }) === null);
}

// --- 6. Uebersetzungen ---------------------------------------------------------------------------------------------------------------
{
  const holen = (objekt: unknown, pfad: string): unknown => pfad.split(".").reduce<unknown>((o, teil) => (o as Record<string, unknown> | undefined)?.[teil], objekt);
  const schluessel = (dateien: string[], muster: RegExp): Set<string> => {
    const menge = new Set<string>();
    for (const datei of dateien) for (const treffer of readFileSync(datei, "utf8").matchAll(muster)) menge.add(treffer[1]);
    return menge;
  };
  const kataloge = ["de", "en", "kk", "ru"].map((sprache) => ({ sprache, katalog: JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) }));
  const fehlend = (namensraum: string, menge: Set<string>) =>
    kataloge.flatMap(({ sprache, katalog }) => [...menge].filter((k) => typeof holen(holen(katalog, namensraum), k) !== "string").map((k) => `${sprache}:${namensraum}.${k}`));

  const tAufruf = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
  const ansicht = schluessel(["src/components/db/abholrunden-ansicht.tsx"], tAufruf);
  // Die Formulare holen ihre Texte aus Unterraeumen (useTranslations("abholrundenAnsicht.planen") und so weiter).
  const formulare = readFileSync("src/components/db/abholrunden-formulare.tsx", "utf8");
  const unterraeume = [...formulare.matchAll(/useTranslations\("abholrundenAnsicht\.([a-zA-Z]+)"\)/g)].map((m) => m[1]);
  const fuerFormulare = new Set<string>();
  for (const teil of formulare.split(/export function /).slice(1)) {
    const raum = /useTranslations\("abholrundenAnsicht\.([a-zA-Z]+)"\)/.exec(teil)?.[1];
    if (!raum) continue;
    for (const m of teil.matchAll(tAufruf)) fuerFormulare.add(`${raum}.${m[1]}`);
  }
  const alle = new Set([...ansicht, ...fuerFormulare]);
  check(`Texte: alle ${alle.size} Schluessel der Abholrunden stehen in vier Sprachen`, alle.size > 60 && unterraeume.length >= 5 && fehlend("abholrundenAnsicht", alle).length === 0, fehlend("abholrundenAnsicht", alle).slice(0, 6).join(", "));

  const dokument = schluessel(["src/lib/dokument/abholauftrag.ts"], tAufruf);
  for (const raum of ["dokument.abholauftrag", "abholrundenAnsicht", "roles"]) dokument.delete(raum);
  const eigene = new Set([...dokument].filter((k) => !k.startsWith("status.") && !k.startsWith("ergebnis.") && !k.startsWith("stoppStatus.")));
  check(`Texte: die ${eigene.size} eigenen Texte des Dokuments stehen in vier Sprachen`, eigene.size > 25 && fehlend("dokument.abholauftrag", eigene).length === 0, fehlend("dokument.abholauftrag", eigene).slice(0, 6).join(", "));

  const fehlerSchluessel = schluessel(["src/lib/domain/abholrunden.ts"], /"(ar[A-Z][A-Za-z]+)"/g);
  for (const k of schluessel(["src/lib/actions/abholrunden.ts"], /"fehler\.([a-zA-Z]+)"/g)) fehlerSchluessel.add(k);
  fehlerSchluessel.delete("eingabe");
  fehlerSchluessel.delete("berechtigung");
  fehlerSchluessel.delete("geokodierung");
  for (const k of ["abholrundeAbgeschlossen", "abholrundeNichtGestartet"]) fehlerSchluessel.add(k);
  check(`Texte: alle ${fehlerSchluessel.size} Fehlermeldungen der Abholrunden stehen in vier Sprachen`, fehlerSchluessel.size >= 10 && fehlend("aktionen.fehler", fehlerSchluessel).length === 0, fehlend("aktionen.fehler", fehlerSchluessel).slice(0, 6).join(", "));
  const okSchluessel = schluessel(["src/lib/actions/abholrunden.ts"], /"ok\.([a-zA-Z]+)"/g);
  okSchluessel.delete("adresseGeokodiert");
  check(`Texte: alle ${okSchluessel.size} Erfolgsmeldungen der Abholrunden stehen in vier Sprachen`, okSchluessel.size >= 6 && fehlend("aktionen.ok", okSchluessel).length === 0, fehlend("aktionen.ok", okSchluessel).slice(0, 6).join(", "));

  const striche = ["abholrundenAnsicht", "dokument.abholauftrag"].flatMap((raum) =>
    kataloge.flatMap(({ sprache, katalog }) => {
      const texte: string[] = [];
      const sammle = (w: unknown): void => {
        if (typeof w === "string") texte.push(w);
        else if (w && typeof w === "object") Object.values(w).forEach(sammle);
      };
      sammle(holen(katalog, raum));
      return texte.filter((x) => /[–—]| - /.test(x)).map((x) => `${sprache}: ${x.slice(0, 40)}`);
    }),
  );
  check("Texte: keine Gedankenstriche in den Texten der Abholrunden", striche.length === 0, striche.slice(0, 3).join(" | "));
}

// --- Ausbau (15.10.2026): Kapazitaet, Abholfenster, geschaetzte Ankunft ---------------------------------------------------------------------
{
  check("Auslastung: ohne Kapazitaet keine Aussage", auslastung(500, null) === null && auslastung(500, 0) === null && auslastung(500, Number.NaN) === null);
  check("Auslastung: bis 89 Prozent genug Platz, ab 90 Prozent knapp, ueber der Kapazitaet zu viel", auslastung(890, 1000)?.stufe === "ok" && auslastung(900, 1000)?.stufe === "knapp" && auslastung(1000, 1000)?.stufe === "knapp" && auslastung(1001, 1000)?.stufe === "ueber");
  check("Auslastung: Prozent gerundet, die Grenze 90 ist benannt", auslastung(625, 1000)?.prozent === 63 && AUSLASTUNG_KNAPP_PROZENT === 90);
  check("Uhrzeit: nur HH:MM von 00:00 bis 23:59", istUhrzeit("00:00") && istUhrzeit("23:59") && istUhrzeit("06:30") && !istUhrzeit("24:00") && !istUhrzeit("6:30") && !istUhrzeit("06:60") && !istUhrzeit("") && !istUhrzeit("06:30:00"));
  check("Uhrzeit: die Postgres-Zeit wird zu HH:MM gekuerzt, null bleibt null", kurzeUhrzeit("08:00:00") === "08:00" && kurzeUhrzeit("08:00") === "08:00" && kurzeUhrzeit(null) === null && kurzeUhrzeit(undefined) === null);
  check("Fenster: vor, im und nach dem Fenster, das Ende zaehlt noch", fensterStand("07:59", "08:00", "10:00") === "frueh" && fensterStand("08:00", "08:00", "10:00") === "im" && fensterStand("10:00", "08:00", "10:00") === "im" && fensterStand("10:01", "08:00", "10:00") === "spaet");
  check("Fenster: ohne Fenster keine Aussage", fensterStand("09:00", null, null) === null && fensterStand("09:00", "08:00", null) === null);
  check("Fenster: beides oder nichts, Beginn vor Ende", fensterFehler("", "") === null && fensterFehler("08:00", "10:00") === null && fensterFehler("08:00", "") === "arFenster" && fensterFehler("10:00", "08:00") === "arFenster" && fensterFehler("08:00", "08:00") === "arFenster" && fensterFehler("8", "10:00") === "arFenster");

  // Teilstrecken: 20 Minuten bis zum ersten Stopp, 15 zum zweiten, 25 zum dritten, 30 zurueck. Zeit je Stopp 10 Minuten.
  const strecken = [20 * 60, 15 * 60, 25 * 60, 30 * 60];
  const an = ankuenfteNachMinuten(strecken, 3, 10);
  check("Ankunft: Fahrzeit der Teilstrecken plus die Zeit auf den Stopps davor (20, 45, 80 Minuten nach der Abfahrt)", JSON.stringify(an) === JSON.stringify([20, 45, 80]), JSON.stringify(an));
  check("Ankunft: ohne Zeit je Stopp zaehlt nur die Fahrt", JSON.stringify(ankuenfteNachMinuten(strecken, 3, 0)) === JSON.stringify([20, 35, 60]));
  check("Ankunft: Teilstrecken in Sekunden werden zu Minuten gerundet", JSON.stringify(ankuenfteNachMinuten([90, 95], 2, 0)) === JSON.stringify([2, 3]));
  check("Ankunft: fehlen Teilstrecken oder Stopps, gibt es keine Schaetzung", ankuenfteNachMinuten([], 2, 10) === null && ankuenfteNachMinuten([60], 2, 10) === null && ankuenfteNachMinuten(strecken, 0, 10) === null);

  const basis = { datum: "2026-10-20", fahrzeug: "Wagen", notiz: "", stopps: [{ nachbarbetriebId: "a", mengeKg: 50 }] };
  check("Eingabe: eine Kapazitaet im erlaubten Bereich oder leer ist in Ordnung", rundeFehler({ ...basis, kapazitaetKg: 800 }) === null && rundeFehler({ ...basis, kapazitaetKg: null }) === null && rundeFehler({ ...basis }) === null && rundeFehler({ ...basis, kapazitaetKg: KAPAZITAET_MAX_KG }) === null);
  check("Eingabe: eine Kapazitaet von null, negativ, zu gross oder keine Zahl wird abgelehnt", [0, -5, KAPAZITAET_MAX_KG + 1, Number.NaN].every((k) => rundeFehler({ ...basis, kapazitaetKg: k }) === "arKapazitaet"));
  check("Eingabe: eine Abfahrt als Uhrzeit oder leer ist in Ordnung, sonst arStartzeit", rundeFehler({ ...basis, startZeit: "06:30" }) === null && rundeFehler({ ...basis, startZeit: "" }) === null && rundeFehler({ ...basis, startZeit: "25:00" }) === "arStartzeit" && rundeFehler({ ...basis, startZeit: "halb sieben" }) === "arStartzeit");

  // Ortszeit: Almaty ist seit dem 1. Maerz 2024 UTC+5 (vorher +6). Der Versatz kommt aus Intl fuer genau den Tag.
  check("Ortszeit: 06:30 in Almaty am 20.10.2026 sind 01:30 UTC (UTC+5)", ortszeitAlsInstant("2026-10-20", "06:30").toISOString() === "2026-10-20T01:30:00.000Z", ortszeitAlsInstant("2026-10-20", "06:30").toISOString());
  check("Ortszeit: vor der Umstellung 2024 galt UTC+6 (06:30 am 01.06.2023 sind 00:30 UTC)", ortszeitAlsInstant("2023-06-01", "06:30").toISOString() === "2023-06-01T00:30:00.000Z", ortszeitAlsInstant("2023-06-01", "06:30").toISOString());
  check("Ortszeit: die Uhrzeit eines Zeitpunkts kommt als HH:MM zurueck und trifft die Eingabe wieder", uhrzeitInZone(ortszeitAlsInstant("2026-10-20", "06:30")) === "06:30" && uhrzeitInZone(new Date("2026-10-20T19:05:00Z")) === "00:05");
  check("Ortszeit: eine andere Zone rechnet mit ihrem Versatz (Berlin im Sommer UTC+2)", ortszeitAlsInstant("2026-07-01", "12:00", "Europe/Berlin").toISOString() === "2026-07-01T10:00:00.000Z");
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Tests der Abholrunden gruen.");
