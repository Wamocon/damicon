// Erfassung der Investitionsrechnung (WMCNL-2470): aus Posten wird ein Rechenstand, der auf die Vorgabewerte der
// Geschaeftsfuehrung zurueckrechnet, solange dieselben Betraege erfasst sind; fehlende Arten machen Kennzahlen "offen";
// die Herkunft folgt der Datenlage; Staende behalten ihren Kurs; der Plan-Ist-Vergleich haengt am Monatsraster.
//
// Reine Funktionen, kein Netzwerk, keine Datenbank. Die Datenbankseite prueft test:wirtschaftlichkeit-db.
// Aufruf: npm run test:wirtschaftlichkeit-erfassung

import { readFileSync } from "node:fs";
import {
  CAPEX_EUR,
  HORIZONT_JAHRE,
  JAHRESNUTZEN_EUR,
  KALKULATIONSZINS,
  KURS_EUR_TENGE,
  KURS_RUB_TENGE,
  OPEX_EUR_PRO_JAHR,
  VERMARKTETE_MENGE_KG,
  VOLLKOSTEN_JE_KG_VORHER_TENGE,
  amortisationMonate,
  barwertReihe,
  kapitalwert,
  kostenJeKilogrammNachher,
  roi,
  roiReihe,
  tco,
} from "@/lib/domain/wirtschaftlichkeit";
import {
  annahmenFehler,
  baueSnapshot,
  barwertIstPunkte,
  euroInRubelMit,
  euroInTengeMit,
  inEuro,
  istFehler,
  liesSnapshot,
  monatAusEingabe,
  planIst,
  postenFehler,
  rechneStand,
  roiIstPunkte,
  schwaechste,
  summiere,
  zeilenBisLetzteErfassung,
  modellAnnahmen,
  modellPosten,
  type Annahmen,
  type IstEintrag,
  type MengeAbgeleitet,
  type Posten,
} from "@/lib/domain/wirtschaftlichkeit-erfassung";

let fehler = 0;
function check(name: string, ok: boolean, detail = "") {
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}
const rund = (w: number, stellen = 6) => Math.round(w * 10 ** stellen) / 10 ** stellen;
const nahe = (a: number | null, b: number | null, stellen = 6) => a !== null && b !== null && rund(a, stellen) === rund(b, stellen);

// --- Beispieldaten -------------------------------------------------------------------------------------------------------------
const KURSE = { eurTenge: KURS_EUR_TENGE, rubTenge: KURS_RUB_TENGE };
const ANNAHMEN: Annahmen = {
  kalkulationszins: KALKULATIONSZINS,
  kurse: KURSE,
  kursStichtag: "2026-09-23",
  kursQuelle: "Nationalbank",
  vollkostenVorherTenge: VOLLKOSTEN_JE_KG_VORHER_TENGE,
  vermarkteteMengeKg: VERMARKTETE_MENGE_KG,
  nutzenbeginnWochen: { von: 6, bis: 8 },
  echtbetriebBeginn: "2026-11-01",
  herkunft: { kalkulationszins: "geschaetzt", kurs: "belegt", vollkosten: "geschaetzt", menge: "geschaetzt", nutzenbeginn: "belegt" },
};
const posten = (art: Posten["art"], betrag: number, extra: Partial<Posten> = {}): Posten => ({
  id: `${art}-${betrag}`, art, kategorie: art === "nutzen" ? "sonstiges" : "Entwicklung", bezeichnung: `${art} ${betrag}`, betrag, waehrung: "EUR", datum: "2026-09-23", herkunft: "belegt", notiz: null, ...extra,
});
const VORGABE: Posten[] = [posten("investition", CAPEX_EUR), posten("betrieb", OPEX_EUR_PRO_JAHR), posten("nutzen", JAHRESNUTZEN_EUR)];

// --- 1. Rueckrechnung auf die Vorgabewerte --------------------------------------------------------------------------------
{
  const s = rechneStand(VORGABE, ANNAHMEN, null);
  check("Rueckrechnung: Amortisation 11 Monate wie die Vorgabe", s.kennzahlen.amortisationMonate !== null && Math.round(s.kennzahlen.amortisationMonate) === 11 && nahe(s.kennzahlen.amortisationMonate, amortisationMonate()));
  check("Rueckrechnung: ROI Jahr 1 12 Prozent, ueber drei Jahre rund 160 Prozent", Math.round((s.kennzahlen.roiJahr1 ?? 0) * 100) === 12 && Math.round(((s.kennzahlen.roiHorizont ?? 0) * 100) / 10) * 10 === 160 && nahe(s.kennzahlen.roiHorizont, roi(HORIZONT_JAHRE)));
  check("Rueckrechnung: TCO ueber drei Jahre 229.000 EUR", s.kennzahlen.tcoHorizont === 229_000 && s.kennzahlen.tcoHorizont === tco());
  check("Rueckrechnung: Kapitalwert und Kosten je Kilogramm wie die Konstanten", nahe(s.kennzahlen.kapitalwert, kapitalwert()) && nahe(s.kennzahlen.kostenJeKgNachherTenge, kostenJeKilogrammNachher(), 4), String(s.kennzahlen.kostenJeKgNachherTenge));
  check("Rueckrechnung: Summen sind die erfassten Betraege", s.capexEur === CAPEX_EUR && s.opexEur === OPEX_EUR_PRO_JAHR && s.nutzenEur === JAHRESNUTZEN_EUR);
}

// --- 2. Fehlende Arten sind offen, nicht null -------------------------------------------------------------------------------
{
  const ohneNutzen = rechneStand(VORGABE.filter((p) => p.art !== "nutzen"), ANNAHMEN, null);
  check("Offen: ohne Nutzenposten sind Amortisation, ROI, Kapitalwert und Kosten je Kilogramm offen", ohneNutzen.kennzahlen.amortisationMonate === null && ohneNutzen.kennzahlen.roiJahr1 === null && ohneNutzen.kennzahlen.roiHorizont === null && ohneNutzen.kennzahlen.kapitalwert === null && ohneNutzen.kennzahlen.kostenJeKgNachherTenge === null);
  check("Offen: ohne Nutzenposten bleibt der TCO, er braucht den Nutzen nicht", ohneNutzen.kennzahlen.tcoHorizont === 229_000);
  check("Offen: die Herkunft der abhaengigen Kennzahlen ist offen, nie belegt", ohneNutzen.herkunft.amortisation === "offen" && ohneNutzen.herkunft.vermiedeneKosten === "offen" && ohneNutzen.herkunft.kapitalwert === "offen" && ohneNutzen.herkunft.capex === "belegt");
  const ohneInvestition = rechneStand(VORGABE.filter((p) => p.art !== "investition"), ANNAHMEN, null);
  check("Offen: ohne Investitionsposten ist alles ausser dem Nutzen offen", ohneInvestition.capexEur === null && ohneInvestition.kennzahlen.tcoHorizont === null && ohneInvestition.kennzahlen.roiJahr1 === null && ohneInvestition.nutzenEur === JAHRESNUTZEN_EUR);
  const leer = rechneStand([], ANNAHMEN, null);
  check("Offen: ganz ohne Posten ist jede Kennzahl ausser dem Nutzenbeginn offen", Object.entries(leer.herkunft).every(([k, h]) => (k === "nutzenbeginn" ? h === "belegt" : h === "offen")));
  check("Offen: ein Nutzen von null ist keine Null-Kennzahl, sondern keine Amortisation", rechneStand([...VORGABE.filter((p) => p.art !== "nutzen"), posten("nutzen", 0)], ANNAHMEN, null).kennzahlen.amortisationMonate === null);
}

// --- 3. Herkunft folgt der Datenlage ------------------------------------------------------------------------------------------
{
  const alleBelegt = rechneStand(VORGABE, ANNAHMEN, null);
  check("Herkunft: belegte Posten ergeben belegte Kennzahlen, Zins, Vollkosten und Menge machen ihre Kennzahlen geschaetzt", alleBelegt.herkunft.amortisation === "belegt" && alleBelegt.herkunft.roiJahr1 === "belegt" && alleBelegt.herkunft.tco === "belegt" && alleBelegt.herkunft.vermiedeneKosten === "belegt" && alleBelegt.herkunft.kapitalwert === "geschaetzt" && alleBelegt.herkunft.kostenJeKilogramm === "geschaetzt");
  const geschaetzterNutzen = rechneStand([posten("investition", CAPEX_EUR), posten("betrieb", OPEX_EUR_PRO_JAHR), posten("nutzen", JAHRESNUTZEN_EUR, { herkunft: "geschaetzt" })], ANNAHMEN, null);
  check("Herkunft: ein geschaetzter Nutzen macht Amortisation und Renditen geschaetzt, CAPEX und OPEX bleiben belegt", geschaetzterNutzen.herkunft.amortisation === "geschaetzt" && geschaetzterNutzen.herkunft.roiDreiJahre === "geschaetzt" && geschaetzterNutzen.herkunft.capex === "belegt" && geschaetzterNutzen.herkunft.opex === "belegt" && geschaetzterNutzen.herkunft.tco === "belegt");
  const belegteAnnahmen = rechneStand(VORGABE, { ...ANNAHMEN, herkunft: { ...ANNAHMEN.herkunft, kalkulationszins: "belegt", vollkosten: "belegt", menge: "belegt" } }, null);
  check("Herkunft: sind auch die Annahmen belegt, verlieren Kapitalwert und Kosten je Kilogramm die Markierung", belegteAnnahmen.herkunft.kapitalwert === "belegt" && belegteAnnahmen.herkunft.kostenJeKilogramm === "belegt");
  check("Herkunft: eine fehlende Angabe zur Herkunft gilt als geschaetzt", rechneStand(VORGABE, { ...ANNAHMEN, herkunft: {} }, null).herkunft.kapitalwert === "geschaetzt");
  check("Herkunft: schwaechste() waehlt offen vor geschaetzt vor belegt", schwaechste("belegt", "geschaetzt") === "geschaetzt" && schwaechste("geschaetzt", "offen", "belegt") === "offen" && schwaechste() === "belegt");
  const gemischt = summiere([posten("nutzen", 100), posten("nutzen", 50, { herkunft: "geschaetzt" })], "nutzen", KURSE);
  check("Herkunft: eine Summe ist geschaetzt, sobald eine Zeile es ist", gemischt.herkunft === "geschaetzt" && gemischt.summe === 150);
}

// --- 4. Waehrung und Kurs des Standes --------------------------------------------------------------------------------------------
{
  check("Waehrung: EUR bleibt, KZT geht durch den Euro-Kurs, RUB ueber Tenge", inEuro(100, "EUR", KURSE) === 100 && rund(inEuro(KURS_EUR_TENGE * 100, "KZT", KURSE), 8) === 100 && rund(inEuro(100, "RUB", KURSE), 8) === rund((100 * KURS_RUB_TENGE) / KURS_EUR_TENGE, 8));
  const gemischt: Posten[] = [posten("investition", 100_000), posten("investition", KURS_EUR_TENGE * 54_000, { waehrung: "KZT" })];
  check("Waehrung: Posten in verschiedenen Waehrungen werden in Euro summiert", rund(summiere(gemischt, "investition", KURSE).summe ?? 0, 4) === 154_000);
  const januar = { eurTenge: 480, rubTenge: 5 };
  const heute = { eurTenge: 513.46, rubTenge: 5.31 };
  check("Kurs: ein Stand rechnet mit seinem eigenen Kurs, nicht mit dem heutigen", euroInTengeMit(1000, januar) === 480_000 && euroInTengeMit(1000, heute) === 513_460 && euroInRubelMit(1000, januar) === 96_000);
  const imJanuar = rechneStand([posten("investition", 100_000, { waehrung: "KZT" }), posten("betrieb", 20_000, { waehrung: "KZT" }), posten("nutzen", 200_000, { waehrung: "KZT" })], { ...ANNAHMEN, kurse: januar }, null);
  const heuteStand = rechneStand([posten("investition", 100_000, { waehrung: "KZT" }), posten("betrieb", 20_000, { waehrung: "KZT" }), posten("nutzen", 200_000, { waehrung: "KZT" })], { ...ANNAHMEN, kurse: heute }, null);
  check("Kurs: dieselben Tenge-Betraege ergeben je nach Kurs andere Euro-Summen", Math.round(imJanuar.capexEur ?? 0) === Math.round(100_000 / 480) && Math.round(heuteStand.capexEur ?? 0) === Math.round(100_000 / 513.46) && imJanuar.capexEur !== heuteStand.capexEur);
}

// --- 5. Vermarktete Menge --------------------------------------------------------------------------------------------------------
{
  const belastbar: MengeAbgeleitet = { mengeKg12Monate: 280_000, erste: "2025-09-01", tageAbdeckung: 400, belastbar: true };
  const nochNicht: MengeAbgeleitet = { mengeKg12Monate: 90_000, erste: "2026-07-01", tageAbdeckung: 105, belastbar: false };
  const ohneOverride = { ...ANNAHMEN, vermarkteteMengeKg: null };
  const a = rechneStand(VORGABE, ohneOverride, belastbar);
  check("Menge: aus den Lieferungen, wenn die Daten ein Jahr tragen", a.mengeKg === 280_000 && a.mengeQuelle === "lieferungen" && a.herkunft.kostenJeKilogramm === "geschaetzt" && a.kennzahlen.ersparnisJeKgTenge !== null);
  const b = rechneStand(VORGABE, ohneOverride, nochNicht);
  check("Menge: eine Saison ist keine Jahressumme, dann offen", b.mengeKg === null && b.mengeQuelle === "offen" && b.kennzahlen.kostenJeKgNachherTenge === null && b.herkunft.kostenJeKilogramm === "offen");
  const c = rechneStand(VORGABE, { ...ANNAHMEN, vermarkteteMengeKg: 350_000 }, belastbar);
  check("Menge: der Wert der Annahmen geht vor", c.mengeKg === 350_000 && c.mengeQuelle === "annahme");
  const d = rechneStand(VORGABE, ohneOverride, null);
  check("Menge: ohne Sicht und ohne Annahme offen", d.mengeKg === null && d.mengeQuelle === "offen");
  const belegtMenge = rechneStand(VORGABE, { ...ohneOverride, herkunft: { ...ANNAHMEN.herkunft, vollkosten: "belegt" } }, belastbar);
  check("Menge: aus den Lieferungen gemessen gilt als belegt", belegtMenge.herkunft.kostenJeKilogramm === "belegt");
}

// --- 6. Plan-Ist -----------------------------------------------------------------------------------------------------------------
{
  const ist = (monat: string, betrag: number, extra: Partial<IstEintrag> = {}): IstEintrag => ({ id: `${monat}-${betrag}`, monat, kategorie: "schwund", betrag, waehrung: "EUR", notiz: null, ...extra });
  const planProMonat = JAHRESNUTZEN_EUR / 12;
  const pi = planIst(JAHRESNUTZEN_EUR, [ist("2026-11-01", 10_000), ist("2026-11-01", 2_000, { kategorie: "handarbeit" }), ist("2026-12-01", 20_000)], ANNAHMEN, "2027-01");
  check("Plan-Ist: Monatsraster ab dem Echtbetrieb bis zum laufenden Monat", pi.start === "2026-11-01" && pi.zeilen.map((z) => z.monat).join(",") === "2026-11-01,2026-12-01,2027-01-01" && pi.zeilen.map((z) => z.index).join(",") === "1,2,3");
  check("Plan-Ist: Plan ist ein Zwoelftel des Jahresnutzens, Ist die Summe des Monats", nahe(pi.zeilen[0].planEur, planProMonat) && pi.zeilen[0].istEur === 12_000 && pi.zeilen[2].istEur === 0);
  check("Plan-Ist: Abweichung und Kumulierung", nahe(pi.zeilen[1].abweichungEur, 20_000 - planProMonat) && pi.zeilen[2].istKumuliertEur === 32_000 && nahe(pi.zeilen[2].planKumuliertEur, planProMonat * 3) && pi.istGesamtEur === 32_000);
  const ohneNutzen = planIst(null, [ist("2026-11-01", 5_000)], ANNAHMEN, "2026-11");
  check("Plan-Ist: ohne Plan bleibt die Abweichung offen, der Ist-Wert steht trotzdem da", ohneNutzen.zeilen[0].planEur === null && ohneNutzen.zeilen[0].abweichungEur === null && ohneNutzen.zeilen[0].istEur === 5_000 && ohneNutzen.planGesamtEur === null);
  const ohneBeginn = planIst(JAHRESNUTZEN_EUR, [ist("2026-12-01", 1_000), ist("2026-10-01", 2_000)], { ...ANNAHMEN, echtbetriebBeginn: null }, "2026-12");
  check("Plan-Ist: ohne Echtbetriebsbeginn beginnt die Reihe mit dem ersten Ist-Wert", ohneBeginn.start === "2026-10-01" && ohneBeginn.zeilen.length === 3);
  const vorBeginn = planIst(JAHRESNUTZEN_EUR, [ist("2026-09-01", 9_999)], ANNAHMEN, "2026-11");
  check("Plan-Ist: ein Ist-Wert vor dem Beginn zaehlt nicht mit", vorBeginn.istGesamtEur === 0 && vorBeginn.zeilen.length === 1);
  check("Plan-Ist: ohne Beginn und ohne Ist-Wert keine Reihe", planIst(JAHRESNUTZEN_EUR, [], { ...ANNAHMEN, echtbetriebBeginn: null }, "2026-11").zeilen.length === 0);
  const lang = planIst(JAHRESNUTZEN_EUR, [], { ...ANNAHMEN, echtbetriebBeginn: "2000-01-01" }, "2026-11");
  check("Plan-Ist: die Reihe hat hoechstens 60 Monate (ein Tippfehler im Jahr ist keine Reihe ueber Jahrhunderte)", lang.zeilen.length === 60);
  const kzt = planIst(JAHRESNUTZEN_EUR, [ist("2026-11-01", KURS_EUR_TENGE * 1000, { waehrung: "KZT" })], ANNAHMEN, "2026-11");
  check("Plan-Ist: ein Ist-Wert in Tenge wird zum Kurs des Standes in Euro gerechnet", rund(kzt.zeilen[0].istEur, 6) === 1000);

  // Ist gleich Plan ergibt dieselben Punkte wie die Plankurven.
  const gleich = planIst(JAHRESNUTZEN_EUR, Array.from({ length: 12 }, (_, i) => ist(`2026-${String(11 + i > 12 ? 0 : 11 + i).padStart(2, "0")}-01`, planProMonat)).slice(0, 2), ANNAHMEN, "2026-12");
  const alsPlan: IstEintrag[] = [ist("2026-11-01", planProMonat), ist("2026-12-01", planProMonat), ist("2027-01-01", planProMonat)];
  const g = planIst(JAHRESNUTZEN_EUR, alsPlan, ANNAHMEN, "2027-01");
  const roiPlan = roiReihe(12, CAPEX_EUR, OPEX_EUR_PRO_JAHR, JAHRESNUTZEN_EUR);
  const roiIst = roiIstPunkte(g.zeilen, CAPEX_EUR, OPEX_EUR_PRO_JAHR);
  check("Plan-Ist: ROI der Ist-Werte liegt auf der Plankurve, wenn Ist gleich Plan ist", roiIst.length === 3 && roiIst.every((p) => nahe(p.wert, roiPlan[p.monat].wert, 9)), JSON.stringify(roiIst.map((p) => p.monat)));
  const barPlan = barwertReihe(12, CAPEX_EUR, OPEX_EUR_PRO_JAHR, JAHRESNUTZEN_EUR, KALKULATIONSZINS);
  const barIst = barwertIstPunkte(g.zeilen, CAPEX_EUR, OPEX_EUR_PRO_JAHR, KALKULATIONSZINS);
  check("Plan-Ist: Kapitalwert der Ist-Werte liegt auf der Plankurve, wenn Ist gleich Plan ist", barIst.length === 3 && barIst.every((p) => nahe(p.wert, barPlan[p.monat].wert, 6)));
  check("Plan-Ist: bleibt der Ist-Nutzen aus, faellt der ROI unter die Plankurve", roiIstPunkte(planIst(JAHRESNUTZEN_EUR, [], ANNAHMEN, "2027-01").zeilen, CAPEX_EUR, OPEX_EUR_PRO_JAHR).every((p) => p.wert < roiPlan[p.monat].wert));
  void gleich;

  // Kurven zeigen nur erfasste Monate.
  const luecke = planIst(JAHRESNUTZEN_EUR, [ist("2026-11-01", 1000), ist("2027-01-01", 500)], ANNAHMEN, "2027-03");
  check("Plan-Ist: die Kurven enden im letzten Monat mit Eintrag, danach ist es nicht erfasst und nicht null", luecke.zeilen.length === 5 && zeilenBisLetzteErfassung(luecke.zeilen, [ist("2026-11-01", 1000), ist("2027-01-01", 500)]).length === 3 && zeilenBisLetzteErfassung(luecke.zeilen, []).length === 0);
}

// --- 6b. Modellwerte --------------------------------------------------------------------------------------------------------------
{
  const texte = { investition: { bezeichnung: "a", kategorie: "k1" }, betrieb: { bezeichnung: "b", kategorie: "k2" }, nutzen: { bezeichnung: "c", kategorie: "egal" } };
  const m = modellPosten(texte, "2026-09-23");
  const s = rechneStand(m, modellAnnahmen(), null);
  check("Modellwerte: drei Posten, Nutzen in der Sammelkategorie, Texte aus dem Aufrufer", m.length === 3 && m[2].kategorie === "sonstiges" && m[0].kategorie === "k1" && m[1].bezeichnung === "b");
  check("Modellwerte: als Posten gerechnet kommen die Vorgabewerte heraus (11 Monate, 12 Prozent, 229.000 EUR)", Math.round(s.kennzahlen.amortisationMonate ?? 0) === 11 && Math.round((s.kennzahlen.roiJahr1 ?? 0) * 100) === 12 && s.kennzahlen.tcoHorizont === 229_000 && nahe(s.kennzahlen.kapitalwert, kapitalwert()));
  check("Modellwerte: Kosten je Kilogramm wie die Konstanten (Menge aus den Annahmen)", nahe(s.kennzahlen.kostenJeKgNachherTenge, kostenJeKilogrammNachher(), 4) && s.mengeQuelle === "annahme");
  check("Modellwerte: Herkunft wie bisher, nur ehrlicher: der geschaetzte Nutzen macht seine Folgekennzahlen geschaetzt", s.herkunft.capex === "belegt" && s.herkunft.opex === "belegt" && s.herkunft.tco === "belegt" && s.herkunft.vermiedeneKosten === "geschaetzt" && s.herkunft.amortisation === "geschaetzt" && s.herkunft.kapitalwert === "geschaetzt" && s.herkunft.nutzenbeginn === "belegt");
}

// --- 7. Stand -------------------------------------------------------------------------------------------------------------------
{
  const snap = baueSnapshot("2027-01-15T08:00:00.000Z", VORGABE, [], ANNAHMEN, null);
  const hin = JSON.parse(JSON.stringify(snap));
  const gelesen = liesSnapshot(hin);
  check("Stand: Hin- und Rueckweg ueber JSON ist verlustfrei", gelesen !== null && JSON.stringify(gelesen) === JSON.stringify(snap));
  check("Stand: der Stand traegt Kurs und Stichtag", gelesen?.annahmen.kurse.eurTenge === KURS_EUR_TENGE && gelesen?.annahmen.kursStichtag === "2026-09-23");
  const nachgerechnet = rechneStand(gelesen?.posten ?? [], gelesen?.annahmen as Annahmen, gelesen?.mengeAbgeleitet ?? null);
  check("Stand: aus Posten und Annahmen laesst sich das Ergebnis nachrechnen", JSON.stringify(nachgerechnet) === JSON.stringify(gelesen?.ergebnis));
  check("Stand: Muell wird nicht zum Stand", [null, undefined, "x", 3, [], {}, { version: 2 }, { ...hin, annahmen: { kurse: {} } }].every((w) => liesSnapshot(w) === null));
}

// --- 8. Eingaben -------------------------------------------------------------------------------------------------------------------
{
  const ok = { art: "investition", kategorie: "Entwicklung", bezeichnung: "Einfuehrung", betrag: 154_000, waehrung: "EUR", datum: "2026-09-23", notiz: "" };
  check("Posten: eine vollstaendige Eingabe ist in Ordnung", postenFehler(ok) === null);
  check("Posten: ohne Bezeichnung, mit zu langer Bezeichnung", postenFehler({ ...ok, bezeichnung: " " }) === "wiBezeichnung" && postenFehler({ ...ok, bezeichnung: "x".repeat(121) }) === "wiBezeichnung" && postenFehler({ ...ok, bezeichnung: "x".repeat(120) }) === null);
  check("Posten: Betrag nicht negativ, endlich und vorhanden", postenFehler({ ...ok, betrag: -1 }) === "wiBetrag" && postenFehler({ ...ok, betrag: null }) === "wiBetrag" && postenFehler({ ...ok, betrag: Infinity }) === "wiBetrag" && postenFehler({ ...ok, betrag: 0 }) === null);
  check("Posten: Waehrung und Datum", postenFehler({ ...ok, waehrung: "USD" }) === "wiWaehrung" && postenFehler({ ...ok, datum: "2026-02-30" }) === "wiDatum" && postenFehler({ ...ok, datum: "" }) === "wiDatum");
  check("Posten: Nutzen kennt nur die vier Kategorien, die anderen Arten frei", postenFehler({ ...ok, art: "nutzen", kategorie: "audit" }) === null && postenFehler({ ...ok, art: "nutzen", kategorie: "Sonstige Ideen" }) === "wiKategorie" && postenFehler({ ...ok, art: "betrieb", kategorie: "Hosting" }) === null && postenFehler({ ...ok, art: "unbekannt" }) === "wiKategorie");
  check("Posten: Notiz hoechstens 500 Zeichen", postenFehler({ ...ok, notiz: "x".repeat(501) }) === "wiNotiz" && postenFehler({ ...ok, notiz: "x".repeat(500) }) === null);
  check("Monat: JJJJ-MM wird der erste Tag, alles andere ist keiner", monatAusEingabe("2026-11") === "2026-11-01" && monatAusEingabe("2026-13") === null && monatAusEingabe("2026-11-01") === null && monatAusEingabe("11.2026") === null && monatAusEingabe("") === null);
  const istOk = { monat: "2026-11", kategorie: "schwund", betrag: 1000, waehrung: "EUR", notiz: "" };
  check("Ist: Monat, Kategorie, Betrag, Waehrung", istFehler(istOk) === null && istFehler({ ...istOk, monat: "2026-11-05" }) === "wiMonat" && istFehler({ ...istOk, kategorie: "anderes" }) === "wiKategorie" && istFehler({ ...istOk, betrag: -5 }) === "wiBetrag" && istFehler({ ...istOk, waehrung: "XXX" }) === "wiWaehrung");
  const annOk = { kalkulationszinsProzent: 12, kurseurTenge: 513.46, kursRubTenge: 5.31, kursStichtag: "2026-09-23", vollkostenVorherTenge: 1500, vermarkteteMengeKg: null, wochenVon: 6, wochenBis: 8, echtbetriebMonat: "2026-11" };
  check("Annahmen: eine vollstaendige Eingabe ist in Ordnung, Menge und Echtbetrieb sind optional", annahmenFehler(annOk) === null && annahmenFehler({ ...annOk, echtbetriebMonat: "" }) === null && annahmenFehler({ ...annOk, vollkostenVorherTenge: null, wochenVon: null, wochenBis: null }) === null);
  check("Annahmen: Zins 0 bis 100 Prozent, Kurse positiv, Stichtag echt, Wochen paarweise und geordnet", annahmenFehler({ ...annOk, kalkulationszinsProzent: 101 }) === "wiAnnahme" && annahmenFehler({ ...annOk, kalkulationszinsProzent: -1 }) === "wiAnnahme" && annahmenFehler({ ...annOk, kurseurTenge: 0 }) === "wiAnnahme" && annahmenFehler({ ...annOk, kursStichtag: "x" }) === "wiDatum" && annahmenFehler({ ...annOk, wochenVon: 8, wochenBis: 6 }) === "wiAnnahme" && annahmenFehler({ ...annOk, wochenBis: null }) === "wiAnnahme" && annahmenFehler({ ...annOk, vermarkteteMengeKg: 0 }) === "wiAnnahme" && annahmenFehler({ ...annOk, echtbetriebMonat: "2026-99" }) === "wiMonat");
}

// --- 9. Uebersetzungen ---------------------------------------------------------------------------------------------------------------
// Ein fehlender Schluessel wirft erst auf der fertigen Seite, und nur in der Sprache, in der er fehlt. Der Test liest die
// Schluessel aus dem Quelltext (t("...")) und prueft sie in allen vier Sprachen.
{
  const holen = (objekt: unknown, pfad: string): unknown => pfad.split(".").reduce<unknown>((o, teil) => (o as Record<string, unknown> | undefined)?.[teil], objekt);
  const schluessel = (dateien: string[], muster: RegExp): Set<string> => {
    const menge = new Set<string>();
    for (const datei of dateien) for (const treffer of readFileSync(datei, "utf8").matchAll(muster)) menge.add(treffer[1]);
    return menge;
  };
  const kataloge = ["de", "en", "kk", "ru"].map((sprache) => ({ sprache, katalog: JSON.parse(readFileSync(`src/messages/${sprache}.json`, "utf8")) }));
  const fehlend = (namensraum: string, schluesselMenge: Set<string>) =>
    kataloge.flatMap(({ sprache, katalog }) => [...schluesselMenge].filter((k) => typeof holen(holen(katalog, namensraum), k) !== "string").map((k) => `${sprache}:${namensraum}.${k}`));

  const tAufruf = /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g;
  const erfassung = schluessel(["src/components/db/wirtschaftlichkeit-erfassung.tsx", "src/components/db/wirtschaftlichkeit-formulare.tsx"], tAufruf);
  check(`Texte: alle ${erfassung.size} Schluessel der Erfassung stehen in vier Sprachen`, erfassung.size > 60 && fehlend("wirtschaftlichkeitErfassung", erfassung).length === 0, fehlend("wirtschaftlichkeitErfassung", erfassung).slice(0, 6).join(", "));

  const modellTexte = new Set(["investition.bezeichnung", "investition.kategorie", "betrieb.bezeichnung", "betrieb.kategorie", "nutzen.bezeichnung", "notiz"]);
  check("Texte: die Modellwerte-Aktion findet ihre sechs Texte", fehlend("wirtschaftlichkeitErfassung.modell", modellTexte).length === 0, fehlend("wirtschaftlichkeitErfassung.modell", modellTexte).join(", "));

  // Das Dokument liest aus drei Namensraeumen; hier zaehlen die eigenen (dokument.wirtschaftlichkeit), die anderen prueft test:dokument.
  const dokument = schluessel(["src/lib/dokument/wirtschaftlichkeit.ts"], /\bt\(\s*["'`]([a-zA-Z0-9_.]+)["'`]/g);
  for (const raum of ["dokument.wirtschaftlichkeit", "wirtschaftlichkeitAnsicht", "wirtschaftlichkeitErfassung", "roles"]) dokument.delete(raum);
  check(`Texte: die ${dokument.size} eigenen Texte des Dokuments stehen in vier Sprachen`, dokument.size > 15 && fehlend("dokument.wirtschaftlichkeit", dokument).length === 0, fehlend("dokument.wirtschaftlichkeit", dokument).slice(0, 6).join(", "));

  // Fehler- und Erfolgsmeldungen der Aktionen: die Fehlerschluessel der Domain und die Schluessel der Actions.
  const fehlerSchluessel = schluessel(["src/lib/domain/wirtschaftlichkeit-erfassung.ts"], /"(wi[A-Z][A-Za-z]+)"/g);
  for (const k of schluessel(["src/lib/actions/wirtschaftlichkeit.ts"], /"fehler\.(wi[A-Z][A-Za-z]+)"/g)) fehlerSchluessel.add(k);
  check(`Texte: alle ${fehlerSchluessel.size} Fehlermeldungen der Erfassung stehen in vier Sprachen`, fehlerSchluessel.size >= 12 && fehlend("aktionen.fehler", fehlerSchluessel).length === 0, fehlend("aktionen.fehler", fehlerSchluessel).slice(0, 6).join(", "));
  const okSchluessel = schluessel(["src/lib/actions/wirtschaftlichkeit.ts"], /"ok\.(wi[A-Z][A-Za-z]+)"/g);
  check(`Texte: alle ${okSchluessel.size} Erfolgsmeldungen der Erfassung stehen in vier Sprachen`, okSchluessel.size >= 7 && fehlend("aktionen.ok", okSchluessel).length === 0, fehlend("aktionen.ok", okSchluessel).slice(0, 6).join(", "));

  // Keine Gedankenstriche in den neuen Texten (Hausregel): weder der lange noch der kurze als Einschub.
  const striche = ["wirtschaftlichkeitErfassung", "dokument.wirtschaftlichkeit"].flatMap((raum) =>
    kataloge.flatMap(({ sprache, katalog }) => {
      const texte: string[] = [];
      const sammle = (w: unknown): void => {
        if (typeof w === "string") texte.push(w);
        else if (w && typeof w === "object") Object.values(w).forEach(sammle);
      };
      sammle(holen(katalog, raum));
      return texte.filter((x) => /[\u2013\u2014]| - /.test(x)).map((x) => `${sprache}: ${x.slice(0, 40)}`);
    }),
  );
  check("Texte: keine Gedankenstriche in den Texten der Erfassung", striche.length === 0, striche.slice(0, 3).join(" | "));
}

// --- Stand nur aus vollstaendigen Daten (Pruefung PR #156, 15.10.2026) -----------------------------------------------------------------
// Ein Stand ist unveraenderlich. Fehlte beim Lesen eine Abfrage (Timeout), rechnete die Seite mit Modellwerten, und der Stand hielte falsche Kurse und
// Posten fuer immer fest.
{
  const lies = (pfad: string) => readFileSync(pfad, "utf8").replace(/\r\n/g, "\n");
  const daten = lies("src/lib/data/wirtschaftlichkeit.ts");
  const aktion = lies("src/lib/actions/wirtschaftlichkeit.ts");
  check("Stand: die Daten melden einen Lesefehler (lesefehler), auch ohne Datenbank als false", daten.includes("lesefehler: lesefehler !== null") && daten.includes("lesefehler: false"));
  check("Stand: bei einem Lesefehler wird nichts festgehalten (vor der Leer-Pruefung)", /daten\.lesefehler\) return fehler\("fehler\.wiStandLesefehler"\);[\s\S]{0,160}wiStandLeer/.test(aktion));
  const katalog = (s: string) => JSON.parse(lies(`src/messages/${s}.json`)).aktionen?.fehler ?? JSON.parse(lies(`src/messages/${s}.json`));
  const hatSchluessel = ["de", "en", "kk", "ru"].every((s) => JSON.stringify(katalog(s)).includes('"wiStandLesefehler"'));
  check("Stand: die Meldung steht in allen vier Sprachen", hatSchluessel);
}

if (fehler > 0) {
  console.log(`\n${fehler} Pruefung(en) fehlgeschlagen.`);
  process.exit(1);
}
console.log("\nAlle Tests der Erfassung gruen.");
