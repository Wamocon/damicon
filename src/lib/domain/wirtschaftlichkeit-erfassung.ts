import {
  CAPEX_EUR,
  HORIZONT_JAHRE,
  JAHRESNUTZEN_EUR,
  KALKULATIONSZINS,
  KURS_EUR_TENGE,
  KURS_RUB_TENGE,
  KURS_STICHTAG,
  NUTZENBEGINN_WOCHEN,
  OPEX_EUR_PRO_JAHR,
  VERMARKTETE_MENGE_KG,
  VOLLKOSTEN_JE_KG_VORHER_TENGE,
  amortisationMonate,
  barwertReihe,
  kapitalwert,
  monatszins,
  roi,
  tco,
  type Herkunft,
  type Kennzahlschluessel,
  type Monatspunkt,
} from "@/lib/domain/wirtschaftlichkeit";
import { istGueltigerTag } from "@/lib/listen/zeitraum";

// Erfassung und Auswertung der Investitionsrechnung (WMCNL-2470): aus Posten und Annahmen wird ein Rechenstand, aus dem
// Rechenstand ein festgehaltener Stand, aus Ist-Werten ein Plan-Ist-Vergleich. Rein, ohne Datenbank und Server.
//
// Die Kennzahlformeln selbst stehen in lib/domain/wirtschaftlichkeit.ts (aus der Vorgabe der Geschaeftsfuehrung); dieses
// Modul fuettert sie mit erfassten Zeilen statt mit Konstanten. Der Test rechnet auf die Vorgabewerte zurueck: sind
// dieselben Betraege erfasst, kommen dieselben Kennzahlen heraus.
//
// Fehlt eine ganze Art von Posten, ist alles, was davon abhaengt, "offen": eine Null waere eine Aussage, die niemand
// gemacht hat. Gerechnet wird in Euro, wie die Vorgabe, angezeigt in Tenge und Rubel zum Kurs des Standes.

export const POSTEN_ARTEN = ["investition", "betrieb", "nutzen"] as const;
export type PostenArt = (typeof POSTEN_ARTEN)[number];

export const NUTZEN_KATEGORIEN = ["schwund", "handarbeit", "audit", "sonstiges"] as const;
export type NutzenKategorie = (typeof NUTZEN_KATEGORIEN)[number];

export const WAEHRUNGEN = ["EUR", "KZT", "RUB"] as const;
export type Waehrung = (typeof WAEHRUNGEN)[number];

export const POSTEN_HERKUNFT = ["belegt", "geschaetzt"] as const;
export type PostenHerkunft = (typeof POSTEN_HERKUNFT)[number];

export const ANNAHME_SCHLUESSEL = ["kalkulationszins", "kurs", "vollkosten", "menge", "nutzenbeginn"] as const;
export type AnnahmeSchluessel = (typeof ANNAHME_SCHLUESSEL)[number];

export const BEZEICHNUNG_MAX_ZEICHEN = 120;
export const KATEGORIE_MAX_ZEICHEN = 60;
export const NOTIZ_MAX_ZEICHEN = 500;

export function istPostenArt(wert: string): wert is PostenArt {
  return (POSTEN_ARTEN as readonly string[]).includes(wert);
}
export const istWaehrung = (wert: string): wert is Waehrung => (WAEHRUNGEN as readonly string[]).includes(wert);
export const istNutzenKategorie = (wert: string): wert is NutzenKategorie => (NUTZEN_KATEGORIEN as readonly string[]).includes(wert);

// --- Waehrung ---------------------------------------------------------------------------------------------------------------------

/** Kurse eines Standes: 1 EUR und 1 RUB in Tenge. Beide vom selben Stichtag, sonst stimmt ihr Verhaeltnis nicht. */
export interface Kurse {
  eurTenge: number;
  rubTenge: number;
}

export function inEuro(betrag: number, waehrung: Waehrung, k: Kurse): number {
  if (waehrung === "EUR") return betrag;
  if (waehrung === "KZT") return betrag / k.eurTenge;
  return (betrag * k.rubTenge) / k.eurTenge;
}

export const euroInTengeMit = (euro: number, k: Kurse): number => Math.round(euro * k.eurTenge);
export const euroInRubelMit = (euro: number, k: Kurse): number => Math.round((euro * k.eurTenge) / k.rubTenge);
export const tengeInRubelMit = (tenge: number, k: Kurse): number => Math.round(tenge / k.rubTenge);

// --- Daten -------------------------------------------------------------------------------------------------------------------------

export interface Posten {
  id: string;
  art: PostenArt;
  kategorie: string;
  bezeichnung: string;
  betrag: number;
  waehrung: Waehrung;
  datum: string;
  herkunft: PostenHerkunft;
  notiz: string | null;
}

export interface Annahmen {
  kalkulationszins: number;
  kurse: Kurse;
  kursStichtag: string;
  kursQuelle: string | null;
  vollkostenVorherTenge: number | null;
  /** Von Hand gesetzte Jahresmenge. Ueberschreibt die aus den Lieferungen abgeleitete. */
  vermarkteteMengeKg: number | null;
  nutzenbeginnWochen: { von: number; bis: number } | null;
  /** Erster Tag des ersten Echtbetriebsmonats, "JJJJ-MM-01". */
  echtbetriebBeginn: string | null;
  /** Je Annahme belegt oder geschaetzt; fehlt ein Schluessel, gilt geschaetzt. */
  herkunft: Partial<Record<AnnahmeSchluessel, PostenHerkunft>>;
}

/** Vermarktete Menge der letzten 365 Tage aus den Lieferungen (Sicht v_vermarktete_menge). */
export interface MengeAbgeleitet {
  mengeKg12Monate: number;
  erste: string | null;
  tageAbdeckung: number;
  belastbar: boolean;
}

export interface IstEintrag {
  id: string;
  /** Erster Tag des Monats, "JJJJ-MM-01". */
  monat: string;
  kategorie: NutzenKategorie;
  betrag: number;
  waehrung: Waehrung;
  notiz: string | null;
}

// --- Modellwerte -------------------------------------------------------------------------------------------------------------------

/**
 * Die Werte der Kennzahlenliste vom 23.09.2026 als Posten: der Startpunkt, wenn noch nichts erfasst ist, und der Rueckfall
 * ohne Datenbank. Investition und Betrieb stehen so in der Vorgabe (belegt), der Nutzen ist aus ihren Ergebnissen
 * rueckgerechnet (geschaetzt, siehe lib/domain/wirtschaftlichkeit.ts).
 */
export const MODELL_POSTEN = [
  { schluessel: "investition", art: "investition", betrag: CAPEX_EUR, herkunft: "belegt" },
  { schluessel: "betrieb", art: "betrieb", betrag: OPEX_EUR_PRO_JAHR, herkunft: "belegt" },
  { schluessel: "nutzen", art: "nutzen", betrag: JAHRESNUTZEN_EUR, herkunft: "geschaetzt" },
] as const satisfies readonly { schluessel: string; art: PostenArt; betrag: number; herkunft: PostenHerkunft }[];

export type ModellSchluessel = (typeof MODELL_POSTEN)[number]["schluessel"];

export function modellAnnahmen(): Annahmen {
  return {
    kalkulationszins: KALKULATIONSZINS,
    kurse: { eurTenge: KURS_EUR_TENGE, rubTenge: KURS_RUB_TENGE },
    kursStichtag: KURS_STICHTAG,
    kursQuelle: null,
    vollkostenVorherTenge: VOLLKOSTEN_JE_KG_VORHER_TENGE,
    vermarkteteMengeKg: VERMARKTETE_MENGE_KG,
    nutzenbeginnWochen: { von: NUTZENBEGINN_WOCHEN.von, bis: NUTZENBEGINN_WOCHEN.bis },
    echtbetriebBeginn: null,
    herkunft: { kalkulationszins: "geschaetzt", kurs: "belegt", vollkosten: "geschaetzt", menge: "geschaetzt", nutzenbeginn: "belegt" },
  };
}

/**
 * Die Modellwerte als Posten. Bezeichnung und Kategorie (bei Investition und Betrieb frei benannt) gibt der Aufrufer
 * uebersetzt mit; der Nutzen steht in der Sammelkategorie "sonstiges", weil die Vorgabe ihn nicht aufteilt.
 */
export function modellPosten(texte: Record<ModellSchluessel, { bezeichnung: string; kategorie: string }>, datum: string): Posten[] {
  return MODELL_POSTEN.map((m) => ({
    id: `modell-${m.schluessel}`,
    art: m.art,
    kategorie: m.art === "nutzen" ? "sonstiges" : texte[m.schluessel].kategorie,
    bezeichnung: texte[m.schluessel].bezeichnung,
    betrag: m.betrag,
    waehrung: "EUR",
    datum,
    herkunft: m.herkunft,
    notiz: null,
  }));
}

// --- Rechenstand -------------------------------------------------------------------------------------------------------------------

export interface Rechenstand {
  capexEur: number | null;
  opexEur: number | null;
  nutzenEur: number | null;
  mengeKg: number | null;
  mengeQuelle: "annahme" | "lieferungen" | "offen";
  vollkostenVorherTenge: number | null;
  kennzahlen: {
    amortisationMonate: number | null;
    roiJahr1: number | null;
    roiHorizont: number | null;
    tcoHorizont: number | null;
    kapitalwert: number | null;
    ersparnisJeKgTenge: number | null;
    kostenJeKgNachherTenge: number | null;
  };
  /** Je Kennzahl belegt, geschaetzt oder offen: aus den Zeilen und Annahmen, die in sie eingehen. */
  herkunft: Record<Kennzahlschluessel, Herkunft>;
}

const RANG: Record<Herkunft, number> = { belegt: 0, geschaetzt: 1, offen: 2 };

/** Die schwaechste Herkunft gewinnt: ein offener Eingang macht die Kennzahl offen, ein geschaetzter geschaetzt. */
export function schwaechste(...stufen: Herkunft[]): Herkunft {
  return stufen.reduce<Herkunft>((a, b) => (RANG[b] > RANG[a] ? b : a), "belegt");
}

/** Summe einer Art in Euro und ihre Herkunft. Ohne Zeile: null und offen. */
export function summiere(posten: readonly Posten[], art: PostenArt, k: Kurse): { summe: number | null; herkunft: Herkunft } {
  const zeilen = posten.filter((p) => p.art === art);
  if (zeilen.length === 0) return { summe: null, herkunft: "offen" };
  return {
    summe: zeilen.reduce((s, p) => s + inEuro(p.betrag, p.waehrung, k), 0),
    herkunft: zeilen.some((p) => p.herkunft === "geschaetzt") ? "geschaetzt" : "belegt",
  };
}

const ann = (a: Annahmen, s: AnnahmeSchluessel): Herkunft => a.herkunft[s] ?? "geschaetzt";

export function rechneStand(posten: readonly Posten[], a: Annahmen, menge: MengeAbgeleitet | null): Rechenstand {
  const capex = summiere(posten, "investition", a.kurse);
  const opex = summiere(posten, "betrieb", a.kurse);
  const nutzen = summiere(posten, "nutzen", a.kurse);

  const mengeKg = a.vermarkteteMengeKg ?? (menge?.belastbar ? menge.mengeKg12Monate : null);
  const mengeQuelle: Rechenstand["mengeQuelle"] = a.vermarkteteMengeKg !== null ? "annahme" : menge?.belastbar ? "lieferungen" : "offen";
  const mengeHerkunft: Herkunft = mengeQuelle === "annahme" ? ann(a, "menge") : mengeQuelle === "lieferungen" ? "belegt" : "offen";
  const vollkostenHerkunft: Herkunft = a.vollkostenVorherTenge === null ? "offen" : ann(a, "vollkosten");

  const c = capex.summe;
  const o = opex.summe;
  const n = nutzen.summe;
  const alle3 = c !== null && o !== null && n !== null;
  const beide = c !== null && o !== null;
  const ersparnis = n !== null && mengeKg !== null && mengeKg > 0 ? euroInTengeMit(n, a.kurse) / mengeKg : null;

  const kennzahlen: Rechenstand["kennzahlen"] = {
    amortisationMonate: alle3 ? amortisationMonate(c, o, n) : null,
    roiJahr1: alle3 ? roi(1, c, o, n) : null,
    roiHorizont: alle3 ? roi(HORIZONT_JAHRE, c, o, n) : null,
    tcoHorizont: beide ? tco(HORIZONT_JAHRE, c, o) : null,
    kapitalwert: alle3 ? kapitalwert(HORIZONT_JAHRE * 12, c, o, n, a.kalkulationszins) : null,
    ersparnisJeKgTenge: ersparnis,
    kostenJeKgNachherTenge: ersparnis !== null && a.vollkostenVorherTenge !== null ? a.vollkostenVorherTenge - ersparnis : null,
  };

  const aus = (wert: unknown, h: Herkunft): Herkunft => (wert === null ? "offen" : h);
  const dreiArten = schwaechste(capex.herkunft, opex.herkunft, nutzen.herkunft);
  const herkunft: Record<Kennzahlschluessel, Herkunft> = {
    amortisation: aus(kennzahlen.amortisationMonate, dreiArten),
    roiJahr1: aus(kennzahlen.roiJahr1, dreiArten),
    roiDreiJahre: aus(kennzahlen.roiHorizont, dreiArten),
    capex: capex.herkunft,
    opex: opex.herkunft,
    tco: aus(kennzahlen.tcoHorizont, schwaechste(capex.herkunft, opex.herkunft)),
    nutzenbeginn: a.nutzenbeginnWochen === null ? "offen" : ann(a, "nutzenbeginn"),
    vermiedeneKosten: nutzen.herkunft,
    kapitalwert: aus(kennzahlen.kapitalwert, schwaechste(dreiArten, ann(a, "kalkulationszins"))),
    kostenJeKilogramm: aus(kennzahlen.kostenJeKgNachherTenge, schwaechste(nutzen.herkunft, mengeHerkunft, vollkostenHerkunft)),
  };

  return { capexEur: c, opexEur: o, nutzenEur: n, mengeKg, mengeQuelle, vollkostenVorherTenge: a.vollkostenVorherTenge, kennzahlen, herkunft };
}

/**
 * Kapitalwert (Euro, Horizont der Investitionsrechnung) bei verschiedenen Zinssaetzen, gerechnet aus denselben Summen wie die Kennzahl. Die Spanne zeigt, wie
 * stark das Ergebnis am Kalkulationszins haengt, den niemand vorgegeben hat. Ohne Posten in allen drei Arten (offen) gibt es keine Werte.
 * zinsen: Jahreszinsen als Anteil (0,2 fuer 20 Prozent).
 */
export function kapitalwertBeiZinsen(stand: Pick<Rechenstand, "capexEur" | "opexEur" | "nutzenEur">, zinsen: readonly number[]): (number | null)[] {
  const { capexEur: c, opexEur: o, nutzenEur: n } = stand;
  if (c === null || o === null || n === null) return zinsen.map(() => null);
  return zinsen.map((z) => kapitalwert(HORIZONT_JAHRE * 12, c, o, n, z));
}

// --- Plan-Ist ----------------------------------------------------------------------------------------------------------------------

export interface PlanIstZeile {
  /** "JJJJ-MM-01". */
  monat: string;
  /** Monat seit Beginn des Echtbetriebs, ab 1: dieselbe Achse wie die Plankurven. */
  index: number;
  planEur: number | null;
  istEur: number;
  abweichungEur: number | null;
  planKumuliertEur: number | null;
  istKumuliertEur: number;
}

export interface PlanIst {
  /** Erster Monat der Reihe, "JJJJ-MM-01"; null ohne Echtbetriebsbeginn und ohne Ist-Wert. */
  start: string | null;
  zeilen: PlanIstZeile[];
  planGesamtEur: number | null;
  istGesamtEur: number;
}

const monatsEnde = (monat: string): number => Number(monat.slice(0, 4)) * 12 + (Number(monat.slice(5, 7)) - 1);
const monatAusIndex = (i: number): string => `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}-01`;

/** Gibt es hoechstens so viele Monate in der Reihe, sonst waere ein Tippfehler im Jahr eine Reihe ueber Jahrhunderte. */
export const PLAN_IST_MAX_MONATE = 60;

/**
 * Die Monate seit dem Beginn des Echtbetriebs mit dem geplanten Nutzen (ein Zwoelftel des Jahresnutzens) und dem, was
 * tatsaechlich vermieden wurde. Ohne Beginn im Datensatz beginnt die Reihe mit dem ersten Ist-Wert. Ist-Werte vor dem
 * Beginn zaehlen nicht mit.
 */
export function planIst(nutzenEurProJahr: number | null, ist: readonly IstEintrag[], a: Annahmen, bisMonat: string): PlanIst {
  const monateMitIst = ist.map((e) => monatsEnde(e.monat));
  const startIndex = a.echtbetriebBeginn !== null ? monatsEnde(a.echtbetriebBeginn) : monateMitIst.length > 0 ? Math.min(...monateMitIst) : null;
  if (startIndex === null) return { start: null, zeilen: [], planGesamtEur: null, istGesamtEur: 0 };

  const ende = Math.min(Math.max(monatsEnde(bisMonat), ...monateMitIst, startIndex), startIndex + PLAN_IST_MAX_MONATE - 1);
  const proMonat = nutzenEurProJahr === null ? null : nutzenEurProJahr / 12;
  const zeilen: PlanIstZeile[] = [];
  let planSumme = 0;
  let istSumme = 0;
  for (let m = startIndex; m <= ende; m += 1) {
    const monat = monatAusIndex(m);
    const istMonat = ist.filter((e) => monatsEnde(e.monat) === m).reduce((s, e) => s + inEuro(e.betrag, e.waehrung, a.kurse), 0);
    planSumme += proMonat ?? 0;
    istSumme += istMonat;
    zeilen.push({
      monat,
      index: m - startIndex + 1,
      planEur: proMonat,
      istEur: istMonat,
      abweichungEur: proMonat === null ? null : istMonat - proMonat,
      planKumuliertEur: proMonat === null ? null : planSumme,
      istKumuliertEur: istSumme,
    });
  }
  return { start: monatAusIndex(startIndex), zeilen, planGesamtEur: proMonat === null ? null : planSumme, istGesamtEur: istSumme };
}

/**
 * Die Zeilen bis zum letzten Monat, in dem tatsaechlich ein Ist-Wert erfasst ist. Fuer die Kurven: ein Monat ohne Eintrag
 * nach dem letzten erfassten ist "noch nicht erfasst", nicht "nichts vermieden", und gehoert nicht als Nullpunkt in die Kurve.
 */
export function zeilenBisLetzteErfassung(zeilen: readonly PlanIstZeile[], ist: readonly IstEintrag[]): PlanIstZeile[] {
  const erfasst = new Set(ist.map((e) => e.monat));
  let letzte = -1;
  zeilen.forEach((z, i) => {
    if (erfasst.has(z.monat)) letzte = i;
  });
  return zeilen.slice(0, letzte + 1);
}

/** ROI der Ist-Werte je Monat, auf derselben Achse wie roiReihe(): (kumulierter Ist-Nutzen minus Einsatz) durch Einsatz. */
export function roiIstPunkte(zeilen: readonly PlanIstZeile[], capexEur: number, opexEur: number): Monatspunkt[] {
  return zeilen.flatMap((z) => {
    const einsatz = capexEur + (z.index / 12) * opexEur;
    return einsatz === 0 ? [] : [{ monat: z.index, wert: (z.istKumuliertEur - einsatz) / einsatz }];
  });
}

/** Kapitalwert der Ist-Werte je Monat, monatlich abgezinst wie barwertReihe(). */
export function barwertIstPunkte(zeilen: readonly PlanIstZeile[], capexEur: number, opexEur: number, jahreszins: number): Monatspunkt[] {
  const r = monatszins(jahreszins);
  let barwert = 0;
  return zeilen.map((z) => {
    barwert += (z.istEur - opexEur / 12) / Math.pow(1 + r, z.index);
    return { monat: z.index, wert: barwert - capexEur };
  });
}

/** Die Plankurve des Kapitalwerts, falls ein vollstaendiger Rechenstand vorliegt. */
export function planBarwert(s: Rechenstand, a: Annahmen): Monatspunkt[] | null {
  return s.capexEur !== null && s.opexEur !== null && s.nutzenEur !== null ? barwertReihe(HORIZONT_JAHRE * 12, s.capexEur, s.opexEur, s.nutzenEur, a.kalkulationszins) : null;
}

// --- Stand (Momentaufnahme) ----------------------------------------------------------------------------------------------------------

export interface StandSnapshot {
  version: 1;
  erstelltAm: string;
  annahmen: Annahmen;
  mengeAbgeleitet: MengeAbgeleitet | null;
  posten: Posten[];
  ist: IstEintrag[];
  ergebnis: Rechenstand;
}

export function baueSnapshot(erstelltAm: string, posten: readonly Posten[], ist: readonly IstEintrag[], a: Annahmen, menge: MengeAbgeleitet | null): StandSnapshot {
  return { version: 1, erstelltAm, annahmen: a, mengeAbgeleitet: menge, posten: [...posten], ist: [...ist], ergebnis: rechneStand(posten, a, menge) };
}

/** Liest einen gespeicherten Stand defensiv: die Spalte ist jsonb, ein Fremdwert darf die Seite nicht zerlegen. */
export function liesSnapshot(wert: unknown): StandSnapshot | null {
  if (typeof wert !== "object" || wert === null) return null;
  const s = wert as Partial<StandSnapshot>;
  if (s.version !== 1 || typeof s.erstelltAm !== "string" || !s.annahmen || !Array.isArray(s.posten) || !Array.isArray(s.ist) || !s.ergebnis) return null;
  const k = s.annahmen.kurse;
  if (typeof k?.eurTenge !== "number" || typeof k?.rubTenge !== "number") return null;
  return s as StandSnapshot;
}

// --- Eingaben ----------------------------------------------------------------------------------------------------------------------

export type WirtschaftlichkeitFehler =
  | "wiBezeichnung"
  | "wiKategorie"
  | "wiBetrag"
  | "wiWaehrung"
  | "wiDatum"
  | "wiMonat"
  | "wiNotiz"
  | "wiAnnahme"
  | "wiStandName";

const istZahl = (w: number): boolean => Number.isFinite(w);

export function postenFehler(e: { art: string; kategorie: string; bezeichnung: string; betrag: number | null; waehrung: string; datum: string; notiz: string }): WirtschaftlichkeitFehler | null {
  if (!istPostenArt(e.art)) return "wiKategorie";
  const bez = e.bezeichnung.trim();
  if (bez.length < 1 || bez.length > BEZEICHNUNG_MAX_ZEICHEN) return "wiBezeichnung";
  const kat = e.kategorie.trim();
  if (kat.length < 1 || kat.length > KATEGORIE_MAX_ZEICHEN) return "wiKategorie";
  if (e.art === "nutzen" && !istNutzenKategorie(kat)) return "wiKategorie";
  if (e.betrag === null || !istZahl(e.betrag) || e.betrag < 0 || e.betrag > 1e12) return "wiBetrag";
  if (!istWaehrung(e.waehrung)) return "wiWaehrung";
  if (!istGueltigerTag(e.datum)) return "wiDatum";
  if (e.notiz.trim().length > NOTIZ_MAX_ZEICHEN) return "wiNotiz";
  return null;
}

/** Ein Monat als "JJJJ-MM" aus dem Eingabefeld; null, wenn er keiner ist. Liefert den ersten Tag, "JJJJ-MM-01". */
export function monatAusEingabe(wert: string): string | null {
  const m = /^(\d{4})-(\d{2})$/.exec(wert.trim());
  if (!m) return null;
  const tag = `${m[1]}-${m[2]}-01`;
  return istGueltigerTag(tag) ? tag : null;
}

export function istFehler(e: { monat: string; kategorie: string; betrag: number | null; waehrung: string; notiz: string }): WirtschaftlichkeitFehler | null {
  if (monatAusEingabe(e.monat) === null) return "wiMonat";
  if (!istNutzenKategorie(e.kategorie.trim())) return "wiKategorie";
  if (e.betrag === null || !istZahl(e.betrag) || e.betrag < 0 || e.betrag > 1e12) return "wiBetrag";
  if (!istWaehrung(e.waehrung)) return "wiWaehrung";
  if (e.notiz.trim().length > NOTIZ_MAX_ZEICHEN) return "wiNotiz";
  return null;
}

export function annahmenFehler(e: {
  kalkulationszinsProzent: number | null;
  kurseurTenge: number | null;
  kursRubTenge: number | null;
  kursStichtag: string;
  vollkostenVorherTenge: number | null;
  vermarkteteMengeKg: number | null;
  wochenVon: number | null;
  wochenBis: number | null;
  echtbetriebMonat: string;
}): WirtschaftlichkeitFehler | null {
  const z = e.kalkulationszinsProzent;
  if (z === null || !istZahl(z) || z < 0 || z > 100) return "wiAnnahme";
  if (e.kurseurTenge === null || !(e.kurseurTenge > 0) || e.kursRubTenge === null || !(e.kursRubTenge > 0)) return "wiAnnahme";
  if (!istGueltigerTag(e.kursStichtag)) return "wiDatum";
  if (e.vollkostenVorherTenge !== null && !(e.vollkostenVorherTenge > 0)) return "wiAnnahme";
  if (e.vermarkteteMengeKg !== null && !(e.vermarkteteMengeKg > 0)) return "wiAnnahme";
  const v = e.wochenVon;
  const b = e.wochenBis;
  if ((v === null) !== (b === null)) return "wiAnnahme";
  if (v !== null && b !== null && (v < 0 || b > 104 || v > b || !Number.isInteger(v) || !Number.isInteger(b))) return "wiAnnahme";
  if (e.echtbetriebMonat !== "" && monatAusEingabe(e.echtbetriebMonat) === null) return "wiMonat";
  return null;
}

// --- Schwund-Nutzen aus den Betriebsdaten (15.10.2026) ------------------------------------------------------------------------------------------
//
// Der geringere Schwund ist ein Nutzen, den die Betriebsdaten belegen koennen: Die Verlustquote vor der Einfuehrung steht in der Baseline (kpi_baseline), die heutige
// folgt aus den Chargen (Ausschuss gegen Menge plus Ausschuss). Jedes Kilogramm, das nicht mehr verloren geht, hat Vollkosten verursacht, die sonst umsonst waeren:
//
//   vermiedene kg   = (Quote vorher minus Quote jetzt) / 100 mal Jahresmenge (Menge plus Ausschuss der letzten 365 Tage)
//   Nutzen je Jahr  = vermiedene kg mal Vollkosten je kg (Tenge) / Kurs (Tenge je Euro)
//
// Bewusst vorsichtig: Bewertet wird mit den Vollkosten, nicht mit dem Verkaufserloes. Der Erloes wuerde den Nutzen erhoehen, haengt aber von Preis und Absatz ab, die
// Kosten sind belegt. Die Herleitung ist ein Vorschlag mit sichtbarer Eingabe, kein Messwert; der Posten bekommt die Herkunft "geschaetzt".

/** Weniger Chargen tragen keine Quote: eine einzelne schlechte oder gute Ernte waere das Ergebnis. */
export const SCHWUND_MIN_CHARGEN = 10;

export interface SchwundEingabe {
  /** Verlustquote vor der Einfuehrung in Prozent (Baseline). */
  verlustVorherProzent: number | null;
  /** Verlustquote der letzten 365 Tage in Prozent. */
  verlustJetztProzent: number | null;
  /** Menge plus Ausschuss der letzten 365 Tage in kg. */
  gesamtMengeKg: number | null;
  chargen: number;
  kostenJeKgTenge: number | null;
  kursEurTenge: number;
}

export type SchwundGrund = "keineBaseline" | "keineBetriebsdaten" | "zuWenigDaten" | "keineKosten" | "keineBesserung";

export type SchwundErgebnis = { stand: "ok"; vermiedeneKg: number; nutzenEurJahr: number } | { stand: "offen"; grund: SchwundGrund };

export function herleiteSchwundNutzen(e: SchwundEingabe): SchwundErgebnis {
  const positiv = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;
  if (e.verlustVorherProzent === null || !Number.isFinite(e.verlustVorherProzent)) return { stand: "offen", grund: "keineBaseline" };
  if (e.verlustJetztProzent === null || !Number.isFinite(e.verlustJetztProzent) || !positiv(e.gesamtMengeKg)) return { stand: "offen", grund: "keineBetriebsdaten" };
  if (e.chargen < SCHWUND_MIN_CHARGEN) return { stand: "offen", grund: "zuWenigDaten" };
  if (!positiv(e.kostenJeKgTenge) || !positiv(e.kursEurTenge)) return { stand: "offen", grund: "keineKosten" };
  if (e.verlustJetztProzent >= e.verlustVorherProzent) return { stand: "offen", grund: "keineBesserung" };
  const vermiedeneKg = ((e.verlustVorherProzent - e.verlustJetztProzent) / 100) * e.gesamtMengeKg;
  return { stand: "ok", vermiedeneKg: Math.round(vermiedeneKg), nutzenEurJahr: Math.round((vermiedeneKg * e.kostenJeKgTenge) / e.kursEurTenge) };
}

/** Eine Prozentangabe aus Text ("8,4 %"); null bei allem anderen, auch bei Spannen und Grenzen ("< 6 %"). */
export function prozentAusText(text: string | null): number | null {
  if (text === null) return null;
  const treffer = /^\s*(\d+(?:[.,]\d+)?)\s*%\s*$/.exec(text);
  return treffer ? Number(treffer[1].replace(",", ".")) : null;
}
