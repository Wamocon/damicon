import { istGueltigerTag } from "@/lib/listen/zeitraum";

// Abholrunden bei Nachbarbetrieben (WMCNL-1577). Reine Typen und Regeln ohne Server-Import, wie domain/tourenplanung.ts.
//
// Die Tourenplanung plant die Auslieferung an Kunden. Hier steht die Gegenrichtung: ein Fahrzeug holt Ware bei Nachbarbetrieben ab
// und bringt sie ins Kuehlhaus. Fuer diese Richtung gilt die 60-Minuten-Regel der Kuehlkette (Anforderung 2.6): ab dem
// Pflueckbeginn zaehlt die Uhr, bis die Ware im Kuehlhaus ist. Die Grenzen sind dieselben wie in kuehlkette_bewerten()
// (Migration 20260911000000) und in der Sicht v_abholstopps_kuehlkette (Migration 20261207100000); der Test gleicht Domain und
// Datenbank ab.

export const ABHOLRUNDE_STATUS = ["geplant", "unterwegs", "abgeschlossen"] as const;
export type AbholrundeStatus = (typeof ABHOLRUNDE_STATUS)[number];

export const STOPP_STATUS = ["geplant", "abgeholt", "entfallen"] as const;
export type StoppStatus = (typeof STOPP_STATUS)[number];

export type KuehlErgebnis = "ok" | "warnung" | "verstoss";

/** Ab wie vielen Minuten seit dem Pflueckbeginn eine Warnung gilt (mehr als diese Zahl). */
export const WARNUNG_AB_MINUTEN = 45;
/** Ab wie vielen Minuten seit dem Pflueckbeginn ein Verstoss gilt (mehr als diese Zahl). */
export const VERSTOSS_AB_MINUTEN = 60;
/** So weit darf der genannte Pflueckbeginn hoechstens zurueckliegen (die Datenbank lehnt mehr ab). */
export const MAX_VORLAUF_MINUTEN = 24 * 60;

export const FAHRZEUG_MAX_ZEICHEN = 60;
export const NOTIZ_MAX_ZEICHEN = 500;

export const istAbholrundeStatus = (w: string): w is AbholrundeStatus => (ABHOLRUNDE_STATUS as readonly string[]).includes(w);
export const istStoppStatus = (w: string): w is StoppStatus => (STOPP_STATUS as readonly string[]).includes(w);

/**
 * Ergebnis der 60-Minuten-Regel fuer einen abgeholten Stopp. Ohne bekannten Pflueckbeginn (null) laesst sich die Zeit nicht
 * beurteilen: das ist eine Warnung und kein "ok".
 */
export function bewerteAbholung(minuten: number | null): KuehlErgebnis {
  if (minuten === null) return "warnung";
  if (minuten > VERSTOSS_AB_MINUTEN) return "verstoss";
  if (minuten > WARNUNG_AB_MINUTEN) return "warnung";
  return "ok";
}

/** Minuten vom Pflueckbeginn bis zur Ankunft im Kuehlhaus, gerundet, nie negativ. null, wenn eine der beiden Zeiten fehlt. */
export function minutenBisKuehlung(pflueckbeginn: string | null, kuehlhausAn: string | null): number | null {
  if (pflueckbeginn === null || kuehlhausAn === null) return null;
  const von = Date.parse(pflueckbeginn);
  const bis = Date.parse(kuehlhausAn);
  if (Number.isNaN(von) || Number.isNaN(bis)) return null;
  return Math.max(0, Math.round((bis - von) / 60_000));
}

/** Der Pflueckbeginn aus der Angabe "vor so vielen Minuten", gemessen an der Uhr des Geraets. */
export function pflueckbeginnAus(geraetZeitpunkt: string, vorMinuten: number): string | null {
  const jetzt = Date.parse(geraetZeitpunkt);
  if (Number.isNaN(jetzt)) return null;
  return new Date(jetzt - vorMinuten * 60_000).toISOString();
}

/**
 * Planungshilfe: die geschaetzte Fahrzeit vom ersten Stopp bis zum Kuehlhaus gegen dieselben Grenzen. Schon die reine Fahrt
 * darf die 60 Minuten nicht ueberschreiten, denn die Uhr lief beim Pfluecken an, vor dem Eintreffen des Fahrzeugs. Ohne
 * berechnete Route (null) gibt es keine Aussage.
 */
export function bewertePlanung(abErstemStoppMinuten: number | null): KuehlErgebnis | null {
  return abErstemStoppMinuten === null ? null : bewerteAbholung(abErstemStoppMinuten);
}

// --- Daten ---------------------------------------------------------------------------------------------------------------------

export interface AbholStoppZeile {
  id: string;
  nachbarbetriebId: string;
  nachbarbetrieb: string;
  ort: string | null;
  adresse: string | null;
  kontakt: string | null;
  breitengrad: number | null;
  laengengrad: number | null;
  reihenfolge: number;
  mengeGeplantKg: number;
  sorte: string | null;
  status: StoppStatus;
  mengeIstKg: number | null;
  pflueckbeginn: string | null;
  abgeholtAm: string | null;
  bemerkung: string | null;
  /** Nur bei einer abgeschlossenen Runde und einem abgeholten Stopp. */
  minutenBisKuehlung: number | null;
  ergebnis: KuehlErgebnis | null;
}

export interface AbholRundeZeile {
  id: string;
  datum: string;
  status: AbholrundeStatus;
  fahrzeug: string | null;
  notiz: string | null;
  distanzKm: number | null;
  dauerMinuten: number | null;
  abErstemStoppMinuten: number | null;
  geometrie: GeoJSON.LineString | null;
  gestartetAm: string | null;
  kuehlhausAn: string | null;
  stopps: AbholStoppZeile[];
}

/** Ein Nachbarbetrieb als Kandidat fuer eine neue Runde. */
export interface NachbarbetriebOption {
  id: string;
  name: string;
  ort: string | null;
  adresse: string | null;
  breitengrad: number | null;
  laengengrad: number | null;
}

export interface RundenZusammenfassung {
  geplantKg: number;
  istKg: number;
  abgeholt: number;
  entfallen: number;
  offen: number;
  ergebnisse: Record<KuehlErgebnis, number>;
  /** Das schlechteste Ergebnis aller abgeholten Stopps; null, solange nichts bewertet ist. */
  schlechtestes: KuehlErgebnis | null;
}

const RANG: Record<KuehlErgebnis, number> = { ok: 0, warnung: 1, verstoss: 2 };

export function rundenZusammenfassung(stopps: readonly AbholStoppZeile[]): RundenZusammenfassung {
  const ergebnisse: Record<KuehlErgebnis, number> = { ok: 0, warnung: 0, verstoss: 0 };
  let schlechtestes: KuehlErgebnis | null = null;
  for (const s of stopps) {
    if (s.ergebnis === null) continue;
    ergebnisse[s.ergebnis] += 1;
    if (schlechtestes === null || RANG[s.ergebnis] > RANG[schlechtestes]) schlechtestes = s.ergebnis;
  }
  return {
    geplantKg: stopps.filter((s) => s.status !== "entfallen").reduce((a, s) => a + s.mengeGeplantKg, 0),
    istKg: stopps.reduce((a, s) => a + (s.mengeIstKg ?? 0), 0),
    abgeholt: stopps.filter((s) => s.status === "abgeholt").length,
    entfallen: stopps.filter((s) => s.status === "entfallen").length,
    offen: stopps.filter((s) => s.status === "geplant").length,
    ergebnisse,
    schlechtestes,
  };
}

// --- Eingaben ------------------------------------------------------------------------------------------------------------------

export type AbholFehler = "arDatum" | "arFahrzeug" | "arNotiz" | "arStopps" | "arMenge" | "arDoppelt" | "arVorlauf" | "arBemerkung";

export function rundeFehler(e: {
  datum: string;
  fahrzeug: string;
  notiz: string;
  stopps: { nachbarbetriebId: string; mengeKg: number | null }[];
}): AbholFehler | null {
  if (!istGueltigerTag(e.datum)) return "arDatum";
  if (e.fahrzeug.trim().length > FAHRZEUG_MAX_ZEICHEN) return "arFahrzeug";
  if (e.notiz.trim().length > NOTIZ_MAX_ZEICHEN) return "arNotiz";
  if (e.stopps.length === 0) return "arStopps";
  if (e.stopps.some((s) => s.mengeKg === null || !Number.isFinite(s.mengeKg) || s.mengeKg <= 0 || s.mengeKg > 1_000_000)) return "arMenge";
  if (new Set(e.stopps.map((s) => s.nachbarbetriebId)).size !== e.stopps.length) return "arDoppelt";
  return null;
}

/**
 * Die Angaben bei einer Abholung: die tatsaechliche Menge (0 oder mehr), seit wann der Nachbarbetrieb pflueckt (in Minuten
 * vor der Abholung, leer fuer "unbekannt") und eine Bemerkung.
 */
export function abholungFehler(e: { mengeKg: number | null; vorMinuten: number | null; bemerkung: string }): AbholFehler | null {
  if (e.mengeKg === null || !Number.isFinite(e.mengeKg) || e.mengeKg < 0 || e.mengeKg > 1_000_000) return "arMenge";
  if (e.vorMinuten !== null && (!Number.isFinite(e.vorMinuten) || e.vorMinuten < 0 || e.vorMinuten > MAX_VORLAUF_MINUTEN)) return "arVorlauf";
  if (e.bemerkung.trim().length > NOTIZ_MAX_ZEICHEN) return "arBemerkung";
  return null;
}
