// Investitionsrechnung fuer die Damicon-Einfuehrung: lohnt sich die Ablesung,
// wann ist das Geld zurueck, was kostet das Besitzen. Bewusst getrennt von
// lib/domain/finanzen.ts - das dort ist Betriebsrechnung (Deckungsbeitrag je
// Kilogramm, laufender Monat, Tenge), das hier ist eine einmalige Investition
// ueber drei Jahre, urspruenglich in Euro gerechnet.
//
// Herkunft der Zahlen: Kennzahlenliste der Geschaeftsfuehrung vom 23.09.2026.
// Vorgegeben waren CAPEX, OPEX, Amortisationsdauer, beide ROI-Werte und der
// TCO. Der Jahresnutzen ("vermiedene Kosten p. a.") stand dort als "offen" -
// er laesst sich aber aus den drei gerundeten Werten zurueckrechnen:
//
//   aus ROI Jahr 1 = 12 %      -> 200.480 EUR
//   aus Amortisation 11 Monate -> 195.273 EUR
//   aus ROI 3 Jahre = 160 %    -> 198.467 EUR
//
// Mit 200.000 EUR stimmen alle drei wieder: 10,7 -> 11 Monate, 11,7 -> 12 %,
// 162 -> 160 %. Er ist damit die einzige Eingangsgroesse der ganzen Rechnung
// und zugleich die einzige Zahl, die aus dem Betrieb kommen muss. Deshalb
// traegt er die Herkunft "geschaetzt" und gehoert auf der Seite ueber das
// Kachelraster, nicht in den Aufklapper.

/**
 * Woher ein Wert stammt. "belegt" heisst: von der Geschaeftsfuehrung
 * vorgegeben. "geschaetzt" heisst: von uns abgeleitet oder angenommen - diese
 * Werte bekommen auf der Seite die zweite Markierungsstufe. "offen" heisst:
 * es gibt noch keinen Wert.
 */
export const herkunftStufen = ["belegt", "geschaetzt", "offen"] as const;
export type Herkunft = (typeof herkunftStufen)[number];

// ---------------------------------------------------------------------------
// Waehrung
// ---------------------------------------------------------------------------
// Die Vorgabe kam in Euro, die App rechnet durchgehend in Tenge. Angezeigt
// wird Tenge, in Klammern Rubel. Beide Kurse stammen vom selben Stichtag und
// aus derselben Quelle, sonst waere das Verhaeltnis der beiden Betraege
// zueinander falsch.
//
// Quelle: Nationalbank der Republik Kasachstan, offizieller Kurs,
// https://nationalbank.kz/rss/get_rates.cfm?fdate=23.09.2026
export const KURS_STICHTAG = "2026-09-23";
/** 1 EUR in Tenge am Stichtag. */
export const KURS_EUR_TENGE = 513.46;
/** 1 RUB in Tenge am Stichtag. Daraus ergibt sich 1 EUR = 96,70 RUB. */
export const KURS_RUB_TENGE = 5.31;

/** Euro-Betrag in Tenge, kaufmaennisch gerundet - keine Tiyn im Betrieb. */
export function euroInTenge(euro: number): number {
  return Math.round(euro * KURS_EUR_TENGE);
}

/** Euro-Betrag in Rubel, ueber denselben Stichtag wie euroInTenge. */
export function euroInRubel(euro: number): number {
  return Math.round((euro * KURS_EUR_TENGE) / KURS_RUB_TENGE);
}

/**
 * Tenge-Betrag in Rubel. Fuer Groessen, die von vornherein in Tenge
 * entstehen - die Kosten je Kilogramm etwa sind eine Betriebszahl und
 * durchlaufen den Euro nie.
 */
export function tengeInRubel(tenge: number): number {
  return Math.round(tenge / KURS_RUB_TENGE);
}

// ---------------------------------------------------------------------------
// Annahmen
// ---------------------------------------------------------------------------

/** Einmalige Investition bis zur Abnahme. Festpreis, keine Spanne. */
export const CAPEX_EUR = 154_000;
/** Hosting, Wartung, Support und Weiterentwicklung je Jahr. */
export const OPEX_EUR_PRO_JAHR = 25_000;
/**
 * Vermiedene Kosten je Jahr: Schwund, Handarbeit, Auditvorbereitung.
 * Rueckgerechnet, siehe Kopfkommentar. Die Zahl, die der Betrieb belegen muss.
 */
export const JAHRESNUTZEN_EUR = 200_000;
/**
 * Kalkulationszins fuer den Kapitalwert, jaehrlich. Von niemandem vorgegeben.
 * 12 % liegt unter der Basisrate der Nationalbank und ist damit eher
 * vorsichtig gewaehlt; die Zahl gehoert vom Finanzchef gesetzt.
 */
export const KALKULATIONSZINS = 0.12;
/** Wochen bis zum Echtbetrieb, gegen die Frostkante gerechnet. */
export const NUTZENBEGINN_WOCHEN = { von: 6, bis: 8 } as const;
/**
 * Vermarktete Menge je Jahr. Steht nirgends im System - weder kpi_baseline
 * noch die Deckungsbeitrags-Views fuehren eine Jahresmenge. Geschaetzt aus
 * einer Flaeche von rund 35 Hektar bei etwa zehn Tonnen je Hektar.
 */
export const VERMARKTETE_MENGE_KG = 350_000;
/**
 * Vollkosten je Kilogramm vor der Einfuehrung. Geschaetzt aus dem Abstand
 * zwischen dem Erloesband der oeffentlichen Seite (1.500 bis 3.500 Tenge je
 * Kilogramm) und dem Deckungsbeitrag im Kennzahlenkatalog (640 Tenge).
 */
export const VOLLKOSTEN_JE_KG_VORHER_TENGE = 1_500;
/** Betrachtungszeitraum in Jahren, aus dem die "3 Jahre"-Kennzahlen kommen. */
export const HORIZONT_JAHRE = 3;
export const HORIZONT_MONATE = HORIZONT_JAHRE * 12;

/** Kennzahlschluessel, deren Wert nicht belegt ist. Steuert die Markierung. */
export const herkunft = {
  capex: "belegt",
  opex: "belegt",
  jahresnutzen: "geschaetzt",
  kalkulationszins: "geschaetzt",
  vermarkteteMenge: "geschaetzt",
  kostenJeKilogramm: "geschaetzt",
} as const satisfies Record<string, Herkunft>;

// ---------------------------------------------------------------------------
// Kennzahlen - die Formeln stammen woertlich aus der Vorgabe
// ---------------------------------------------------------------------------

/** (CAPEX + OPEX) / Jahresnutzen * 12. Gibt null bei Jahresnutzen <= 0. */
export function amortisationMonate(
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
  nutzen: number = JAHRESNUTZEN_EUR,
): number | null {
  if (nutzen <= 0) return null;
  return ((capex + opex) / nutzen) * 12;
}

/** Gesamtkosten des Besitzens ueber n Jahre: CAPEX + n * OPEX. */
export function tco(
  jahre: number = HORIZONT_JAHRE,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
): number {
  return capex + jahre * opex;
}

/**
 * ROI ueber n Jahre als Anteil (0,12 = 12 %).
 * (n * Jahresnutzen - CAPEX - n * OPEX) / (CAPEX + n * OPEX).
 * Gibt null, wenn der Nenner null ist.
 */
export function roi(
  jahre: number,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
  nutzen: number = JAHRESNUTZEN_EUR,
): number | null {
  const einsatz = capex + jahre * opex;
  if (einsatz === 0) return null;
  return (jahre * nutzen - einsatz) / einsatz;
}

/**
 * Monatlicher Zinssatz aus dem Jahreszins, zinseszinstreu.
 * Nicht Jahreszins/12 - das waere um gut ein halbes Prozent daneben.
 */
export function monatszins(jahreszins: number = KALKULATIONSZINS): number {
  return Math.pow(1 + jahreszins, 1 / 12) - 1;
}

/**
 * Kapitalwert nach n Monaten: Barwert der monatlichen Ueberschuesse minus
 * CAPEX. Monatlich diskontiert, damit Kachel und Kurve dieselbe Zahl zeigen -
 * jaehrlich gerechnet faellt der Wert niedriger aus, weil die Zufluesse dann
 * erst am Jahresende angesetzt werden.
 */
export function kapitalwert(
  monate: number = HORIZONT_MONATE,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
  nutzen: number = JAHRESNUTZEN_EUR,
  jahreszins: number = KALKULATIONSZINS,
): number {
  const rate = (nutzen - opex) / 12;
  const r = monatszins(jahreszins);
  let barwert = 0;
  for (let m = 1; m <= monate; m += 1) barwert += rate / Math.pow(1 + r, m);
  return barwert - capex;
}

/**
 * Vollkosten je vermarktetem Kilogramm. Die allgemeine Form, sobald echte
 * Vollkosten und eine echte Menge erfasst sind. Gibt null statt einer Zahl,
 * wenn eines von beidem fehlt - eine Kachel ohne Wert ist besser als eine
 * mit einem falschen.
 */
export function kostenJeKilogramm(
  vollkostenTenge: number | null,
  mengeKg: number | null,
): number | null {
  if (vollkostenTenge === null || mengeKg === null || mengeKg <= 0) return null;
  return vollkostenTenge / mengeKg;
}

/**
 * Was der Jahresnutzen je vermarktetem Kilogramm bedeutet, in Tenge.
 *
 * Bewusst abgeleitet statt frei gesetzt: Waeren Vorher- und Nachher-Wert zwei
 * unabhaengige Schaetzungen, koennten sie dem Jahresnutzen widersprechen,
 * ohne dass es jemandem auffaellt. So haengt alles an einer Annahme, und die
 * Kachel beantwortet nebenbei eine nuetzliche Frage: Wenn die hier gezeigte
 * Senkung je Kilogramm unrealistisch wirkt, ist der Jahresnutzen zu hoch
 * angesetzt.
 */
export function ersparnisJeKilogramm(
  nutzenEuro: number = JAHRESNUTZEN_EUR,
  mengeKg: number = VERMARKTETE_MENGE_KG,
): number | null {
  if (mengeKg <= 0) return null;
  return euroInTenge(nutzenEuro) / mengeKg;
}

/** Vollkosten je Kilogramm nach der Einfuehrung: vorher minus Ersparnis. */
export function kostenJeKilogrammNachher(
  vorherTenge: number = VOLLKOSTEN_JE_KG_VORHER_TENGE,
  nutzenEuro: number = JAHRESNUTZEN_EUR,
  mengeKg: number = VERMARKTETE_MENGE_KG,
): number | null {
  const ersparnis = ersparnisJeKilogramm(nutzenEuro, mengeKg);
  if (ersparnis === null) return null;
  return vorherTenge - ersparnis;
}

// ---------------------------------------------------------------------------
// Reihen fuer die Diagramme
// ---------------------------------------------------------------------------
// Alle drei sind Projektionen: aus den Annahmen gerechnet, kein Punkt
// erfunden. Ist-Werte auf der Plankurve kommen erst, wenn die Erfassung steht.

export interface Monatspunkt {
  monat: number;
  wert: number;
}

/** ROI als Anteil je Monat, OPEX anteilig. Monat 0 ist -1 (alles eingesetzt). */
export function roiReihe(
  monate: number = HORIZONT_MONATE,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
  nutzen: number = JAHRESNUTZEN_EUR,
): Monatspunkt[] {
  const punkte: Monatspunkt[] = [];
  for (let m = 0; m <= monate; m += 1) {
    const wert = roi(m / 12, capex, opex, nutzen);
    punkte.push({ monat: m, wert: wert ?? 0 });
  }
  return punkte;
}

/**
 * Kapitalwert je Monat, monatlich diskontiert. Endpunkt = kapitalwert().
 *
 * Der Nulldurchgang liegt spaeter als die Kennzahl Amortisationsdauer: die
 * Vorgabe rechnet ohne Abzinsung und zieht das ganze erste OPEX-Jahr in den
 * Zaehler, diese Reihe zinst jeden Monatszufluss ab. Der Unterschied ist
 * genau das, was die Abzinsung kostet, und kein Rechenfehler.
 */
export function barwertReihe(
  monate: number = HORIZONT_MONATE,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
  nutzen: number = JAHRESNUTZEN_EUR,
  jahreszins: number = KALKULATIONSZINS,
): Monatspunkt[] {
  const rate = (nutzen - opex) / 12;
  const r = monatszins(jahreszins);
  const punkte: Monatspunkt[] = [{ monat: 0, wert: -capex }];
  let barwert = 0;
  for (let m = 1; m <= monate; m += 1) {
    barwert += rate / Math.pow(1 + r, m);
    punkte.push({ monat: m, wert: barwert - capex });
  }
  return punkte;
}

/** CAPEX und die einzelnen OPEX-Jahre als Bausteine des TCO. */
export interface TcoBaustein {
  name: "capex" | "opex";
  jahr: number;
  wert: number;
}

export function tcoBausteine(
  jahre: number = HORIZONT_JAHRE,
  capex: number = CAPEX_EUR,
  opex: number = OPEX_EUR_PRO_JAHR,
): TcoBaustein[] {
  const teile: TcoBaustein[] = [{ name: "capex", jahr: 0, wert: capex }];
  for (let j = 1; j <= jahre; j += 1) teile.push({ name: "opex", jahr: j, wert: opex });
  return teile;
}

