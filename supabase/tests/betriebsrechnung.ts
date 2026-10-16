// Wirtschaftlichkeit des Betriebs (Entscheidung vom 16.10.2026): Erlöse, Kosten und Ergebnis über drei bis fünf Jahre, Gewinnschwelle, Herkunft der Zahlen,
// Offen statt Null, Horizont der Rechnung des Systems.
//
// Reine Funktionen, kein Netzwerk, keine Datenbank.
// Aufruf: npm run test:betriebsrechnung

import {
  ABSCHREIBUNG_JAHRE_STANDARD,
  betriebAnnahmenFehler,
  betriebsEingabe,
  istJeKg,
  planJahreAus,
  rechneBetrieb,
  type BetriebsAnnahmen,
  type BetriebsEingabe,
} from "@/lib/domain/betriebsrechnung";
import {
  inTenge,
  kapitalwertBeiZinsen,
  rechneStand,
  summiereTenge,
  type Annahmen,
  type Posten,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";
import { KALKULATIONSZINS, KURS_EUR_TENGE, KURS_RUB_TENGE, VERMARKTETE_MENGE_KG, VOLLKOSTEN_JE_KG_VORHER_TENGE } from "@/lib/domain/wirtschaftlichkeit";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const nahe = (a: number | null | undefined, b: number, toleranz = 1e-6) => a !== null && a !== undefined && Math.abs(a - b) <= toleranz * Math.max(1, Math.abs(b));

const KURSE = { eurTenge: KURS_EUR_TENGE, rubTenge: KURS_RUB_TENGE };

const ANNAHMEN: BetriebsAnnahmen = {
  mengeKg: 100_000,
  preisTengeKg: 2_000,
  variableKostenTengeKg: 1_200,
  mengeEntwicklung: 0,
  preisEntwicklung: 0,
  kostenEntwicklung: 0,
  fixkostenEntwicklung: 0,
  abschreibungJahre: 5,
  herkunft: { menge: "belegt", preis: "belegt", kosten: "belegt", entwicklung: "belegt" },
};
const KEIN_SYSTEM = { capexTenge: null, opexTengeJahr: null, nutzenTengeJahr: null, herkunft: "offen" as const };
const SYSTEM = { capexTenge: 50_000_000, opexTengeJahr: 10_000_000, nutzenTengeJahr: 60_000_000, herkunft: "belegt" as const };

function eingabe(zusatz: Partial<BetriebsEingabe> = {}, annahmen: Partial<BetriebsAnnahmen> = {}): BetriebsEingabe {
  return { annahmen: { ...ANNAHMEN, ...annahmen }, fixkostenTengeJahr: 40_000_000, fixkostenHerkunft: "belegt", system: KEIN_SYSTEM, jahre: 3, ...zusatz };
}

// --- 1. Die Rechnung eines Jahres ---------------------------------------------------------------------------------------------
{
  const p = rechneBetrieb(eingabe());
  const j = p.zeilen[0];
  check("Jahr 1: Erlös ist Menge mal Preis", nahe(j.erloes, 200_000_000));
  check("Jahr 1: variable Kosten sind Menge mal Kosten je kg", nahe(j.variableKosten, 120_000_000));
  check("Jahr 1: Deckungsbeitrag ist Erlös minus variable Kosten", nahe(j.deckungsbeitrag, 80_000_000));
  check("Jahr 1: Betriebsergebnis ist Deckungsbeitrag minus Fixkosten", nahe(j.betriebsergebnis, 40_000_000));
  check("Ohne System ist das Ergebnis das Betriebsergebnis und es steht dabei", !p.systemEnthalten && nahe(j.ergebnis, 40_000_000) && j.systemEffekt === 0);
  check("Drei Jahre ergeben drei Zeilen", p.zeilen.length === 3 && p.zeilen.map((z) => z.jahr).join() === "1,2,3");
  check("Kumuliert: ohne Entwicklung dreimal dasselbe Ergebnis", nahe(p.zeilen[2].ergebnisKumuliert, 120_000_000) && nahe(p.kennzahlen?.ergebnisSumme ?? null, 120_000_000));
}

// --- 2. Entwicklung je Jahr ---------------------------------------------------------------------------------------------------
{
  const p = rechneBetrieb(eingabe({}, { mengeEntwicklung: 0.1, preisEntwicklung: 0.05, kostenEntwicklung: 0.08, fixkostenEntwicklung: 0.06 }));
  const j2 = p.zeilen[1];
  check("Jahr 2: Menge und Preis wachsen um ihren Satz", nahe(j2.mengeKg, 110_000) && nahe(j2.preisTengeKg, 2_100));
  check("Jahr 2: variable Kosten wachsen mit Menge und Kostensatz", nahe(j2.variableKosten, 110_000 * 1_200 * 1.08));
  check("Jahr 2: Fixkosten wachsen um ihren Satz", nahe(j2.fixkosten, 40_000_000 * 1.06));
  const j3 = p.zeilen[2];
  check("Jahr 3: der Satz wirkt zweimal (hoch zwei, nicht doppelt)", nahe(j3.mengeKg, 100_000 * 1.21) && nahe(j3.preisTengeKg, 2_000 * 1.05 * 1.05));
  check("Nicht gesetzte Entwicklung gilt als null Prozent", nahe(rechneBetrieb(eingabe({}, { mengeEntwicklung: null })).zeilen[1].mengeKg, 100_000));
}

// --- 3. Offen statt Null ------------------------------------------------------------------------------------------------------
{
  const ohnePreis = rechneBetrieb(eingabe({}, { preisTengeKg: null }));
  check("Ohne Preis ist die Rechnung offen und sagt, was fehlt", ohnePreis.fehlt.join() === "preis" && ohnePreis.kennzahlen === null && ohnePreis.zeilen.length === 0 && ohnePreis.herkunft === "offen");
  const ohneAlles = rechneBetrieb(eingabe({ fixkostenTengeJahr: null }, { mengeKg: null, preisTengeKg: null, variableKostenTengeKg: null }));
  check("Alles Fehlende wird genannt", ohneAlles.fehlt.join() === "menge,preis,variableKosten,fixkosten");
  check("Kosten von null sind eine Angabe, keine fehlende", rechneBetrieb(eingabe({}, { variableKostenTengeKg: 0 })).fehlt.length === 0);
  check("Menge null zählt als fehlend", rechneBetrieb(eingabe({}, { mengeKg: 0 })).fehlt.join() === "menge");
}

// --- 4. Das System in der Rechnung ----------------------------------------------------------------------------------------------
{
  const p = rechneBetrieb(eingabe({ system: SYSTEM, jahre: 5 }));
  check("Mit System: Nutzen minus laufende Kosten minus Abschreibung", p.systemEnthalten && nahe(p.zeilen[0].systemEffekt, 60_000_000 - 10_000_000 - 10_000_000));
  check("Mit System: das Ergebnis ist Betriebsergebnis plus Systemeffekt", nahe(p.zeilen[0].ergebnis, 40_000_000 + 40_000_000));
  const kurz = rechneBetrieb(eingabe({ system: SYSTEM, jahre: 5 }, { abschreibungJahre: 3 }));
  check("Die Abschreibung endet nach ihren Jahren", nahe(kurz.zeilen[2].abschreibung, 50_000_000 / 3) && kurz.zeilen[3].abschreibung === 0 && kurz.zeilen[4].abschreibung === 0);
  const standard = rechneBetrieb(eingabe({ system: SYSTEM, jahre: 5 }, { abschreibungJahre: null }));
  check("Ohne Angabe wird über fünf Jahre abgeschrieben", ABSCHREIBUNG_JAHRE_STANDARD === 5 && nahe(standard.zeilen[0].abschreibung, 10_000_000) && standard.zeilen[4].abschreibung > 0);
  const unvollstaendig = rechneBetrieb(eingabe({ system: { ...SYSTEM, nutzenTengeJahr: null } }));
  check("Fehlt ein Teil des Systems, bleibt es draußen und die Rechnung steht trotzdem", !unvollstaendig.systemEnthalten && unvollstaendig.fehlt.length === 0 && unvollstaendig.zeilen[0].systemEffekt === 0);
}

// --- 5. Gewinnschwelle und Puffer -----------------------------------------------------------------------------------------------
{
  const k = rechneBetrieb(eingabe()).kennzahlen;
  check("Deckungsbeitrag je kg ist Preis minus variable Kosten", nahe(k?.deckungsbeitragJeKg ?? null, 800));
  check("Gewinnschwelle: Fixkosten geteilt durch Deckungsbeitrag je kg", nahe(k?.gewinnschwelleKg ?? null, 50_000));
  check("Puffer: um die Hälfte darf die Menge sinken", nahe(k?.puffer ?? null, 0.5));
  const mitSystem = rechneBetrieb(eingabe({ system: SYSTEM })).kennzahlen;
  check("Trägt das System die Fixkosten, liegt die Schwelle bei null", mitSystem?.gewinnschwelleKg === 0 && mitSystem.puffer === 1);
  const verlust = rechneBetrieb(eingabe({ fixkostenTengeJahr: 100_000_000 })).kennzahlen;
  check("Über der Planmenge: der Puffer ist negativ, das Ergebnis ein Verlust", nahe(verlust?.gewinnschwelleKg ?? null, 125_000) && (verlust?.puffer ?? 0) < 0 && (verlust?.ergebnisErstesJahr ?? 0) < 0);
  const ohneDb = rechneBetrieb(eingabe({}, { variableKostenTengeKg: 2_000 })).kennzahlen;
  check("Ohne positiven Deckungsbeitrag gibt es keine Schwelle", ohneDb?.gewinnschwelleKg === null && ohneDb.puffer === null);
  check("Umsatzrendite: Ergebnis durch Erlös", nahe(k?.umsatzrenditeErstesJahr ?? null, 0.2));
}

// --- 6. Herkunft ----------------------------------------------------------------------------------------------------------------
{
  check("Alles belegt ergibt belegt", rechneBetrieb(eingabe()).herkunft === "belegt");
  check("Ein geschätzter Preis macht das Ergebnis geschätzt", rechneBetrieb(eingabe({}, { herkunft: { ...ANNAHMEN.herkunft, preis: "geschaetzt" } })).herkunft === "geschaetzt");
  check("Geschätzte Fixkosten machen es geschätzt", rechneBetrieb(eingabe({ fixkostenHerkunft: "geschaetzt" })).herkunft === "geschaetzt");
  check("Ohne Angabe gilt geschätzt", rechneBetrieb(eingabe({}, { herkunft: {} })).herkunft === "geschaetzt");
  check("Das System zählt nur, wenn es mitgerechnet wird", rechneBetrieb(eingabe({ system: { ...SYSTEM, herkunft: "geschaetzt" } })).herkunft === "geschaetzt" && rechneBetrieb(eingabe({ system: { ...KEIN_SYSTEM, herkunft: "geschaetzt" } })).herkunft === "belegt");
}

// --- 7. Horizont ----------------------------------------------------------------------------------------------------------------
{
  check("Horizont aus der Adresszeile: drei bis fünf, sonst der Standard", planJahreAus("3") === 3 && planJahreAus("4") === 4 && planJahreAus("5") === 5);
  check("Ungültiges fällt auf fünf zurück", planJahreAus("2") === 5 && planJahreAus("6") === 5 && planJahreAus("x") === 5 && planJahreAus(undefined) === 5 && planJahreAus(null) === 5);
  check("Eine Liste nimmt den ersten Wert", planJahreAus(["4", "5"]) === 4);
  check("Fünf Jahre ergeben fünf Zeilen", rechneBetrieb(eingabe({ jahre: 5 })).zeilen.length === 5);
}

// --- 8. Rechnung des Systems mit wählbarem Horizont -------------------------------------------------------------------------------
{
  const annahmen: Annahmen = {
    kalkulationszins: KALKULATIONSZINS,
    kurse: KURSE,
    kursStichtag: "2026-09-23",
    kursQuelle: null,
    vollkostenVorherTenge: VOLLKOSTEN_JE_KG_VORHER_TENGE,
    vermarkteteMengeKg: VERMARKTETE_MENGE_KG,
    nutzenbeginnWochen: { von: 6, bis: 8 },
    echtbetriebBeginn: null,
    herkunft: {},
  };
  const posten = (art: Posten["art"], betrag: number): Posten => ({ id: art, art, kategorie: "x", bezeichnung: art, betrag, waehrung: "EUR", datum: "2026-09-23", herkunft: "belegt", notiz: null });
  const p = [posten("investition", 154_000), posten("betrieb", 25_000), posten("nutzen", 200_000), posten("fixkosten", 999_999)];
  const drei = rechneStand(p, annahmen, null);
  const fuenf = rechneStand(p, annahmen, null, 5);
  check("System: Standard bleibt drei Jahre (TCO 229.000)", drei.kennzahlen.tcoHorizont === 229_000);
  check("System: fünf Jahre rechnen das TCO über fünf Jahre (154.000 plus 5 mal 25.000)", fuenf.kennzahlen.tcoHorizont === 154_000 + 5 * 25_000);
  check("System: die Rendite über fünf Jahre ist höher als über drei", (fuenf.kennzahlen.roiHorizont ?? 0) > (drei.kennzahlen.roiHorizont ?? 0));
  check("System: Fixkosten des Betriebs gehen in keine Kennzahl des Systems ein", drei.capexEur === 154_000 && drei.opexEur === 25_000 && drei.nutzenEur === 200_000);
  const zins = kapitalwertBeiZinsen(fuenf, [0.12], 5)[0];
  check("System: Kapitalwert über fünf Jahre weicht vom dreijährigen ab", zins !== null && zins !== drei.kennzahlen.kapitalwert);
}

// --- 9. Tenge, Summen, Vergleichswert, Eingaben ----------------------------------------------------------------------------------------
{
  check("In Tenge: Tenge bleibt, Euro und Rubel gehen über den Kurs", inTenge(1_000, "KZT", KURSE) === 1_000 && nahe(inTenge(1, "EUR", KURSE), KURS_EUR_TENGE) && nahe(inTenge(100, "RUB", KURSE), 100 * KURS_RUB_TENGE));
  const mix: Posten[] = [
    { id: "a", art: "fixkosten", kategorie: "Personal", bezeichnung: "a", betrag: 12_000_000, waehrung: "KZT", datum: "2026-10-01", herkunft: "belegt", notiz: null },
    { id: "b", art: "fixkosten", kategorie: "Pacht", bezeichnung: "b", betrag: 10_000, waehrung: "EUR", datum: "2026-10-01", herkunft: "geschaetzt", notiz: null },
  ];
  const s = summiereTenge(mix, "fixkosten", KURSE);
  check("Fixkosten in verschiedenen Währungen werden in Tenge summiert", nahe(s.summe, 12_000_000 + 10_000 * KURS_EUR_TENGE) && s.herkunft === "geschaetzt");
  check("Ohne Fixkosten: keine Summe, offen", summiereTenge([], "fixkosten", KURSE).summe === null && summiereTenge([], "fixkosten", KURSE).herkunft === "offen");

  const ist = istJeKg({ erloesTenge: 12_000_000, kostenTenge: 6_000_000, mengeKg: 6_000, buchungen: 40, von: "2025-10-17", bis: "2026-10-16" });
  check("Vergleichswert: Preis, Kosten und Deckungsbeitrag je kg aus dem Journal", ist !== null && nahe(ist.preisTengeKg, 2_000) && nahe(ist.kostenTengeKg, 1_000) && nahe(ist.deckungsbeitragTengeKg, 1_000));
  check("Ohne Menge oder Erlös kein Vergleichswert", istJeKg(null) === null && istJeKg({ erloesTenge: 0, kostenTenge: 0, mengeKg: 0, buchungen: 0, von: "", bis: "" }) === null);

  const gut = { mengeKg: 350_000, preisTengeKg: 2_100, variableKostenTengeKg: 1_350, mengeProzent: 5, preisProzent: 7, kostenProzent: 8, fixkostenProzent: 8, abschreibungJahre: 5 };
  check("Eingaben: gültig", betriebAnnahmenFehler(gut) === null);
  check("Eingaben: leer ist erlaubt", betriebAnnahmenFehler({ mengeKg: null, preisTengeKg: null, variableKostenTengeKg: null, mengeProzent: null, preisProzent: null, kostenProzent: null, fixkostenProzent: null, abschreibungJahre: null }) === null);
  check("Eingaben: Preis und Menge müssen positiv sein, Kosten dürfen null sein", betriebAnnahmenFehler({ ...gut, preisTengeKg: 0 }) === "biPreis" && betriebAnnahmenFehler({ ...gut, mengeKg: -1 }) === "biMenge" && betriebAnnahmenFehler({ ...gut, variableKostenTengeKg: 0 }) === null && betriebAnnahmenFehler({ ...gut, variableKostenTengeKg: -1 }) === "biKosten");
  check("Eingaben: Entwicklung zwischen minus 50 und plus 100 Prozent", betriebAnnahmenFehler({ ...gut, preisProzent: 101 }) === "biEntwicklung" && betriebAnnahmenFehler({ ...gut, kostenProzent: -51 }) === "biEntwicklung" && betriebAnnahmenFehler({ ...gut, mengeProzent: -50 }) === null && betriebAnnahmenFehler({ ...gut, fixkostenProzent: Number.NaN }) === "biEntwicklung");
  check("Eingaben: Abschreibung ganze Jahre von eins bis zwanzig", betriebAnnahmenFehler({ ...gut, abschreibungJahre: 0 }) === "biAbschreibung" && betriebAnnahmenFehler({ ...gut, abschreibungJahre: 21 }) === "biAbschreibung" && betriebAnnahmenFehler({ ...gut, abschreibungJahre: 2.5 }) === "biAbschreibung" && betriebAnnahmenFehler({ ...gut, abschreibungJahre: 20 }) === null);
}

// --- 10. Eingabe aus Rechenstand, Posten und Planung -------------------------------------------------------------------------------
{
  const annahmen: Annahmen = {
    kalkulationszins: KALKULATIONSZINS,
    kurse: KURSE,
    kursStichtag: "2026-09-23",
    kursQuelle: null,
    vollkostenVorherTenge: VOLLKOSTEN_JE_KG_VORHER_TENGE,
    vermarkteteMengeKg: VERMARKTETE_MENGE_KG,
    nutzenbeginnWochen: { von: 6, bis: 8 },
    echtbetriebBeginn: null,
    herkunft: { menge: "geschaetzt" },
  };
  const post = (id: string, art: Posten["art"], betrag: number, waehrung: Posten["waehrung"], herkunft: Posten["herkunft"]): Posten => ({ id, art, kategorie: "x", bezeichnung: id, betrag, waehrung, datum: "2026-10-01", herkunft, notiz: null });
  const posten = [post("i", "investition", 154_000, "EUR", "belegt"), post("b", "betrieb", 25_000, "EUR", "belegt"), post("n", "nutzen", 200_000, "EUR", "geschaetzt"), post("f", "fixkosten", 40_000_000, "KZT", "belegt")];
  const stand = rechneStand(posten, annahmen, null, 5);
  const e = betriebsEingabe({ betrieb: ANNAHMEN, stand, annahmen, posten, jahre: 5 });
  check("Eingabe: die Fixkosten kommen in Tenge aus den Posten der Art Fixkosten", e.fixkostenTengeJahr === 40_000_000 && e.fixkostenHerkunft === "belegt");
  check("Eingabe: das System kommt in Tenge zum Kurs vom Stichtag", nahe(e.system.capexTenge, 154_000 * KURS_EUR_TENGE) && nahe(e.system.opexTengeJahr, 25_000 * KURS_EUR_TENGE) && nahe(e.system.nutzenTengeJahr, 200_000 * KURS_EUR_TENGE));
  check("Eingabe: die Herkunft des Systems ist die schwächste der drei Arten", e.system.herkunft === "geschaetzt");
  check("Eingabe: die Fixkosten zählen nicht zu den Posten des Systems", stand.capexEur === 154_000 && stand.opexEur === 25_000 && stand.nutzenEur === 200_000);
  check("Eingabe: die Jahresmenge ist die des Systems, nicht die der Planung", e.annahmen.mengeKg === VERMARKTETE_MENGE_KG && e.jahre === 5);

  const lieferungen = rechneStand(posten, { ...annahmen, vermarkteteMengeKg: null }, { mengeKg12Monate: 82_000, erste: "2025-10-20", tageAbdeckung: 360, belastbar: true }, 3);
  const aus = betriebsEingabe({ betrieb: { ...ANNAHMEN, mengeKg: null, herkunft: { ...ANNAHMEN.herkunft, menge: "geschaetzt" } }, stand: lieferungen, annahmen: { ...annahmen, vermarkteteMengeKg: null }, posten, jahre: 3 });
  check("Eingabe: ohne gesetzte Menge gilt die aus den Lieferungen, und sie ist belegt", aus.annahmen.mengeKg === 82_000 && aus.annahmen.herkunft.menge === "belegt");

  const ohne = betriebsEingabe({ betrieb: ANNAHMEN, stand: rechneStand([], annahmen, null), annahmen, posten: [], jahre: 3 });
  check("Eingabe ohne Posten: Fixkosten und System offen, nie null als Betrag", ohne.fixkostenTengeJahr === null && ohne.system.capexTenge === null && rechneBetrieb(ohne).fehlt.includes("fixkosten"));
  const plan = rechneBetrieb(e);
  check("Mit allen Posten steht die Rechnung und enthält das System", plan.fehlt.length === 0 && plan.systemEnthalten && plan.zeilen.length === 5);
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Tests der Betriebsrechnung gruen.");
