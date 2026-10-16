import type { Herkunft } from "@/lib/domain/wirtschaftlichkeit";
import { schwaechste, summiereTenge, type Annahmen, type Posten, type Rechenstand } from "@/lib/domain/wirtschaftlichkeit-erfassung";

// Wirtschaftlichkeit des Betriebs: Erlöse und Kosten über drei bis fünf Jahre bis zum Betriebsergebnis (Entscheidung vom 16.10.2026). Rein, ohne Datenbank und Server.
//
// Die Rechnung in einer Zeile je Jahr:
//
//   Erlös               = Menge mal Preis
//   - variable Kosten   = Menge mal variable Kosten je kg
//   = Deckungsbeitrag
//   - Fixkosten
//   = Betriebsergebnis
//   + Nutzen des Systems - laufende Kosten des Systems - Abschreibung des Systems
//   = Ergebnis mit System
//
// Jahr 1 sind die zwölf Monate ab Beginn des Echtbetriebs. Menge, Preis, variable Kosten und Fixkosten des ersten Jahres sind Annahmen (oder aus dem Betrieb
// belegt) und verändern sich danach um einen festen Satz je Jahr. Der Nutzen und die laufenden Kosten des Systems bleiben ohne Preissteigerung stehen:
// eine vorsichtige Annahme, die den Nutzen eher unterschätzt als überschätzt. Fehlt eine Eingabe, bleibt die Rechnung "offen", nie null.

/** Wählbare Horizonte der Betriebsrechnung und der Rechnung des Systems. */
export const PLAN_JAHRE = [3, 4, 5] as const;
export type PlanJahre = (typeof PLAN_JAHRE)[number];
export const PLAN_JAHRE_STANDARD: PlanJahre = 5;

/** Ein Wert aus Adresszeile oder Formular als Horizont; alles andere ist der Standard. */
export function planJahreAus(wert: string | string[] | undefined | null): PlanJahre {
  const roh = Array.isArray(wert) ? wert[0] : wert;
  const zahl = Number(roh);
  return (PLAN_JAHRE as readonly number[]).includes(zahl) ? (zahl as PlanJahre) : PLAN_JAHRE_STANDARD;
}

/** Jahre der Abschreibung, wenn nichts gesetzt ist: die übliche Nutzungsdauer von Software und Geräten. */
export const ABSCHREIBUNG_JAHRE_STANDARD = 5;

export const BETRIEB_ANNAHME_SCHLUESSEL = ["preis", "kosten", "entwicklung"] as const;
export type BetriebAnnahmeSchluessel = (typeof BETRIEB_ANNAHME_SCHLUESSEL)[number];

export type AnnahmeHerkunft = "belegt" | "geschaetzt";

/** Planung des Betriebs: Werte des ersten Jahres und jährliche Entwicklung. Alle Beträge in Tenge, Entwicklungen als Anteil (0,05 = fünf Prozent). */
export interface BetriebsAnnahmen {
  /** Jahresmenge im ersten Jahr (kg); dieselbe Zahl wie die Annahme "vermarktete Menge" des Systems. */
  mengeKg: number | null;
  preisTengeKg: number | null;
  variableKostenTengeKg: number | null;
  mengeEntwicklung: number | null;
  preisEntwicklung: number | null;
  kostenEntwicklung: number | null;
  fixkostenEntwicklung: number | null;
  abschreibungJahre: number | null;
  /** Je Annahme belegt oder geschätzt; fehlt ein Schlüssel, gilt geschätzt. Die Menge trägt die Herkunft aus den Annahmen des Systems. */
  herkunft: Partial<Record<BetriebAnnahmeSchluessel | "menge", AnnahmeHerkunft>>;
}

/** Was das System zur Betriebsrechnung beiträgt, in Tenge (aus dem Rechenstand des Systems, Kurs vom Stichtag). */
export interface BetriebSystem {
  capexTenge: number | null;
  opexTengeJahr: number | null;
  nutzenTengeJahr: number | null;
  herkunft: Herkunft;
}

export interface BetriebsEingabe {
  annahmen: BetriebsAnnahmen;
  /** Summe der erfassten Fixkosten je Jahr in Tenge; null, solange keine erfasst ist. */
  fixkostenTengeJahr: number | null;
  fixkostenHerkunft: Herkunft;
  system: BetriebSystem;
  jahre: number;
}

/**
 * Die Eingabe der Betriebsrechnung aus dem, was die Seite ohnehin geladen hat: der Rechenstand des Systems (Kurs vom Stichtag), die Posten (die Fixkosten
 * darunter) und die Planung des Betriebs. Die Jahresmenge ist die des Systems, von Hand gesetzt oder aus den Lieferungen: eine Zahl, nicht zwei.
 */
export function betriebsEingabe(e: { betrieb: BetriebsAnnahmen; stand: Rechenstand; annahmen: Annahmen; posten: readonly Posten[]; jahre: number }): BetriebsEingabe {
  const { betrieb, stand, annahmen } = e;
  const inTengeEuro = (euro: number | null): number | null => (euro === null ? null : euro * annahmen.kurse.eurTenge);
  const fixkosten = summiereTenge(e.posten, "fixkosten", annahmen.kurse);
  return {
    annahmen: {
      ...betrieb,
      mengeKg: stand.mengeKg,
      herkunft: { ...betrieb.herkunft, menge: stand.mengeQuelle === "lieferungen" ? "belegt" : betrieb.herkunft.menge },
    },
    fixkostenTengeJahr: fixkosten.summe,
    fixkostenHerkunft: fixkosten.herkunft,
    system: {
      capexTenge: inTengeEuro(stand.capexEur),
      opexTengeJahr: inTengeEuro(stand.opexEur),
      nutzenTengeJahr: inTengeEuro(stand.nutzenEur),
      herkunft: schwaechste(stand.herkunft.capex, stand.herkunft.opex, stand.herkunft.vermiedeneKosten),
    },
    jahre: e.jahre,
  };
}

export type BetriebFehlt = "menge" | "preis" | "variableKosten" | "fixkosten";

export interface PlanJahr {
  /** 1 bis Horizont. */
  jahr: number;
  mengeKg: number;
  preisTengeKg: number;
  erloes: number;
  variableKosten: number;
  deckungsbeitrag: number;
  fixkosten: number;
  /** Deckungsbeitrag minus Fixkosten, ohne das System. */
  betriebsergebnis: number;
  /** Nutzen minus laufende Kosten minus Abschreibung des Systems; 0, wenn das System nicht mitgerechnet wird. */
  systemEffekt: number;
  nutzen: number;
  systemKosten: number;
  abschreibung: number;
  /** Betriebsergebnis plus Systemeffekt. Ohne vollständige Systemrechnung gleich dem Betriebsergebnis. */
  ergebnis: number;
  ergebnisKumuliert: number;
}

export interface BetriebKennzahlen {
  ergebnisErstesJahr: number;
  ergebnisLetztesJahr: number;
  ergebnisSumme: number;
  umsatzrenditeErstesJahr: number | null;
  umsatzrenditeLetztesJahr: number | null;
  /** Deckungsbeitrag je kg im ersten Jahr (Preis minus variable Kosten). */
  deckungsbeitragJeKg: number;
  /** Menge im ersten Jahr, ab der das Ergebnis nicht mehr negativ ist; 0, wenn schon ohne Menge kein Verlust entsteht; null, wenn der Deckungsbeitrag nicht positiv ist. */
  gewinnschwelleKg: number | null;
  /** Anteil der Planmenge des ersten Jahres, um den die Menge sinken dürfte, bevor ein Verlust entsteht (negativ: schon darunter). */
  puffer: number | null;
}

export interface Betriebsplan {
  jahre: number;
  /** Was für die Rechnung fehlt; leer, wenn sie steht. */
  fehlt: BetriebFehlt[];
  /** Das System fließt in "ergebnis" ein: CAPEX, laufende Kosten und Nutzen sind alle erfasst. */
  systemEnthalten: boolean;
  zeilen: PlanJahr[];
  kennzahlen: BetriebKennzahlen | null;
  /** Die schwächste Herkunft aller Eingaben, die in das Ergebnis eingehen; "offen", wenn die Rechnung nicht steht. */
  herkunft: Herkunft;
}

const faktor = (satz: number | null, jahr: number): number => Math.pow(1 + (satz ?? 0), jahr - 1);
const herkunftVon = (h: AnnahmeHerkunft | undefined): Herkunft => h ?? "geschaetzt";

export function rechneBetrieb(e: BetriebsEingabe): Betriebsplan {
  const a = e.annahmen;
  const fehlt: BetriebFehlt[] = [];
  if (a.mengeKg === null || a.mengeKg <= 0) fehlt.push("menge");
  if (a.preisTengeKg === null || a.preisTengeKg <= 0) fehlt.push("preis");
  if (a.variableKostenTengeKg === null) fehlt.push("variableKosten");
  if (e.fixkostenTengeJahr === null) fehlt.push("fixkosten");
  if (fehlt.length > 0) return { jahre: e.jahre, fehlt, systemEnthalten: false, zeilen: [], kennzahlen: null, herkunft: "offen" };

  const menge1 = a.mengeKg as number;
  const preis1 = a.preisTengeKg as number;
  const kosten1 = a.variableKostenTengeKg as number;
  const fix1 = e.fixkostenTengeJahr as number;

  const s = e.system;
  const systemEnthalten = s.capexTenge !== null && s.opexTengeJahr !== null && s.nutzenTengeJahr !== null;
  const abschreibungJahre = a.abschreibungJahre ?? ABSCHREIBUNG_JAHRE_STANDARD;

  const zeilen: PlanJahr[] = [];
  let kumuliert = 0;
  for (let jahr = 1; jahr <= e.jahre; jahr += 1) {
    const mengeKg = menge1 * faktor(a.mengeEntwicklung, jahr);
    const preisTengeKg = preis1 * faktor(a.preisEntwicklung, jahr);
    const erloes = mengeKg * preisTengeKg;
    const variableKosten = mengeKg * kosten1 * faktor(a.kostenEntwicklung, jahr);
    const deckungsbeitrag = erloes - variableKosten;
    const fixkosten = fix1 * faktor(a.fixkostenEntwicklung, jahr);
    const betriebsergebnis = deckungsbeitrag - fixkosten;
    const nutzen = systemEnthalten ? (s.nutzenTengeJahr as number) : 0;
    const systemKosten = systemEnthalten ? (s.opexTengeJahr as number) : 0;
    const abschreibung = systemEnthalten && jahr <= abschreibungJahre ? (s.capexTenge as number) / abschreibungJahre : 0;
    const systemEffekt = nutzen - systemKosten - abschreibung;
    const ergebnis = betriebsergebnis + systemEffekt;
    kumuliert += ergebnis;
    zeilen.push({ jahr, mengeKg, preisTengeKg, erloes, variableKosten, deckungsbeitrag, fixkosten, betriebsergebnis, systemEffekt, nutzen, systemKosten, abschreibung, ergebnis, ergebnisKumuliert: kumuliert });
  }

  const erstes = zeilen[0];
  const letztes = zeilen[zeilen.length - 1];
  const dbJeKg = preis1 - kosten1;
  // Im ersten Jahr: Ergebnis = Menge mal Deckungsbeitrag je kg minus Fixkosten plus Systemeffekt. Null setzen und nach der Menge auflösen.
  const lastOhneMenge = fix1 - erstes.systemEffekt;
  const gewinnschwelleKg = dbJeKg > 0 ? Math.max(0, lastOhneMenge / dbJeKg) : null;

  const entwicklungHerkunft = herkunftVon(a.herkunft.entwicklung);
  const herkunft = schwaechste(
    herkunftVon(a.herkunft.menge),
    herkunftVon(a.herkunft.preis),
    herkunftVon(a.herkunft.kosten),
    e.fixkostenHerkunft,
    entwicklungHerkunft,
    ...(systemEnthalten ? [s.herkunft] : []),
  );

  return {
    jahre: e.jahre,
    fehlt: [],
    systemEnthalten,
    zeilen,
    herkunft,
    kennzahlen: {
      ergebnisErstesJahr: erstes.ergebnis,
      ergebnisLetztesJahr: letztes.ergebnis,
      ergebnisSumme: letztes.ergebnisKumuliert,
      umsatzrenditeErstesJahr: erstes.erloes > 0 ? erstes.ergebnis / erstes.erloes : null,
      umsatzrenditeLetztesJahr: letztes.erloes > 0 ? letztes.ergebnis / letztes.erloes : null,
      deckungsbeitragJeKg: dbJeKg,
      gewinnschwelleKg,
      puffer: gewinnschwelleKg === null ? null : 1 - gewinnschwelleKg / menge1,
    },
  };
}

// --- Vergleichswert aus dem Betrieb --------------------------------------------------------------------------------------------

/** Die letzten zwölf Monate aus dem Finanzjournal und den Chargen (Funktion betrieb_ist_zwoelf_monate). */
export interface BetriebIst {
  erloesTenge: number;
  kostenTenge: number;
  mengeKg: number;
  buchungen: number;
  von: string;
  bis: string;
}

export interface BetriebIstJeKg {
  preisTengeKg: number;
  kostenTengeKg: number;
  deckungsbeitragTengeKg: number;
}

/** Preis, Kosten und Deckungsbeitrag je kg aus dem Journal; null, solange es keine Menge oder keinen Erlös gibt (dann steht kein Vergleichswert da). */
export function istJeKg(ist: BetriebIst | null): BetriebIstJeKg | null {
  if (ist === null || ist.mengeKg <= 0 || ist.erloesTenge <= 0) return null;
  const preis = ist.erloesTenge / ist.mengeKg;
  const kosten = ist.kostenTenge / ist.mengeKg;
  return { preisTengeKg: preis, kostenTengeKg: kosten, deckungsbeitragTengeKg: preis - kosten };
}

// --- Eingaben des Formulars ----------------------------------------------------------------------------------------------------

export type BetriebFehler = "biPreis" | "biKosten" | "biMenge" | "biEntwicklung" | "biAbschreibung";

/** Ein Entwicklungssatz in Prozent aus dem Formular; erlaubt ist minus 50 bis plus 100 Prozent. */
function prozentGueltig(wert: number | null): boolean {
  return wert === null || (Number.isFinite(wert) && wert >= -50 && wert <= 100);
}

export function betriebAnnahmenFehler(e: {
  mengeKg: number | null;
  preisTengeKg: number | null;
  variableKostenTengeKg: number | null;
  mengeProzent: number | null;
  preisProzent: number | null;
  kostenProzent: number | null;
  fixkostenProzent: number | null;
  abschreibungJahre: number | null;
}): BetriebFehler | null {
  if (e.mengeKg !== null && !(e.mengeKg > 0)) return "biMenge";
  if (e.preisTengeKg !== null && !(e.preisTengeKg > 0)) return "biPreis";
  if (e.variableKostenTengeKg !== null && !(e.variableKostenTengeKg >= 0)) return "biKosten";
  if (![e.mengeProzent, e.preisProzent, e.kostenProzent, e.fixkostenProzent].every(prozentGueltig)) return "biEntwicklung";
  if (e.abschreibungJahre !== null && !(Number.isInteger(e.abschreibungJahre) && e.abschreibungJahre >= 1 && e.abschreibungJahre <= 20)) return "biAbschreibung";
  return null;
}
