// Kostenstellen/Kostentraeger-Anbindung (Anforderung 4.2, P0). [ANPASSEN] -
// Schema (kostentraeger, finance_ledger_entries) stand seit dem initialen
// Schema aus Phase 6 der 1Cati-Ledger-Engine (Analyse Kapitel 5), war bisher
// aber nur lesbar und ohne Kundenbezug - das Buero-Modul blieb deshalb reine
// Demo-Oberflaeche (src/components/demo/buero.tsx FinanzenDemo, jetzt
// entfernt). Migration 20260909000000 ergaenzt Schreibrechte, den
// Kundenbezug und die Deckungsbeitrag-View
// (public.deckungsbeitrag_je_kostentraeger) - diese Datei traegt nur die
// Typen und die Demo-Werte fuer den Betrieb ohne Supabase-Umgebung.
//
// Die Demo-Zahlen sind keine Erfindung: sie sind wortgleich mit
// supabase/seed.sql (Abschnitt "Finanzen: Kostentraeger + Ledger") - wer die
// lokale Datenbank aufsetzt, sieht dieselben Zahlen wie im Demo-Modus.

export const ledgerTyp = ["erloes", "kosten"] as const;
export type LedgerTyp = (typeof ledgerTyp)[number];

export interface DeckungsbeitragZeile {
  kostentraegerId: string;
  bezeichnung: string;
  erntetag: string | null;
  reihenblockCode: string | null;
  sorteName: string | null;
  b2bKundeName: string | null;
  erloesTenge: number;
  kostenTenge: number;
  deckungsbeitragTenge: number;
  buchungen: number;
  /** Anforderung 4.3: tatsaechlich geerntete Menge, null bei Zukauf-Kostentraegern ohne eigenen Reihenblock. */
  mengeKg: number | null;
  /** Anforderung 4.3: deckungsbeitragTenge / mengeKg, null wenn mengeKg fehlt oder 0 ist. */
  deckungsbeitragJeKgTenge: number | null;
}

export interface LedgerEintrag {
  id: string;
  kostentraegerBezeichnung: string;
  typ: LedgerTyp;
  kategorie: string;
  betragTenge: number;
  buchungsdatum: string;
  beschreibung: string | null;
}

// Anforderung 3.3: Deckungsbeitrag je einzelner Charge statt nur pauschal je
// Kostentraeger, sobald eine Buchung direkt mit charge_id erfasst wurde.
export interface DeckungsbeitragChargeZeile {
  chargeId: string;
  chargeCode: string;
  ernteDatum: string | null;
  reihenblockCode: string | null;
  sorteName: string | null;
  mengeKg: number | null;
  erloesTenge: number;
  kostenTenge: number;
  deckungsbeitragTenge: number;
  deckungsbeitragJeKgTenge: number | null;
  buchungen: number;
}

export interface ChargeOption {
  id: string;
  code: string;
}

export interface KostentraegerOption {
  id: string;
  bezeichnung: string;
  /** Traegt die Gruppierung im Auswahlfeld. null bei Zukauf ohne eigene Ernte. */
  erntetag: string | null;
}

export interface ReihenblockOption {
  id: string;
  code: string;
}

export interface SorteOption {
  id: string;
  name: string;
}

export interface B2bKundeOption {
  id: string;
  name: string;
}

// Dieselben vier Kostentraeger und acht Buchungen wie
// supabase/seed.sql - drei Eigenanbau-Bloecke, ein Zukauf-Kostentraeger
// (K-A-01), damit der Unterschied zwischen Eigenanbau und Aggregator-Zukauf
// auch im Demo-Modus sichtbar bleibt (Anforderung 6.1).
export const demoDeckungsbeitrag: DeckungsbeitragZeile[] = [
  {
    kostentraegerId: "demo-kt-1",
    bezeichnung: "T-N-A-01 / 2026-08-30",
    erntetag: "2026-08-30",
    reihenblockCode: "T-N-A-01",
    sorteName: "Polka",
    b2bKundeName: "Handelskette A",
    erloesTenge: 108780,
    kostenTenge: 41200,
    deckungsbeitragTenge: 67580,
    buchungen: 2,
    mengeKg: 145.5,
    deckungsbeitragJeKgTenge: 464.47,
  },
  {
    kostentraegerId: "demo-kt-2",
    bezeichnung: "T-N-A-03 / 2026-08-29",
    erntetag: "2026-08-29",
    reihenblockCode: "T-N-A-03",
    sorteName: "Polka",
    b2bKundeName: "Handelskette A",
    erloesTenge: 92820,
    kostenTenge: 38900,
    deckungsbeitragTenge: 53920,
    buchungen: 2,
    mengeKg: 128.0,
    deckungsbeitragJeKgTenge: 421.25,
  },
  {
    kostentraegerId: "demo-kt-3",
    bezeichnung: "T-O-A-01 / 2026-08-31",
    erntetag: "2026-08-31",
    reihenblockCode: "T-O-A-01",
    sorteName: "Polana",
    b2bKundeName: "Gastro-Distributor Almaty",
    erloesTenge: 61500,
    kostenTenge: 27300,
    deckungsbeitragTenge: 34200,
    buchungen: 2,
    mengeKg: 98.5,
    deckungsbeitragJeKgTenge: 347.21,
  },
  {
    kostentraegerId: "demo-kt-4",
    bezeichnung: "K-A-01 / 2026-08-30",
    erntetag: "2026-08-30",
    reihenblockCode: "K-A-01",
    sorteName: "Polka (Zukauf)",
    b2bKundeName: null,
    erloesTenge: 54600,
    kostenTenge: 44100,
    deckungsbeitragTenge: 10500,
    buchungen: 2,
    // Zukauf-Kostentraeger ohne eigenen Reihenblock: keine Pflueckaufgabe,
    // also auch im Demo-Modus konsistent keine Menge/kein Wert je Kilogramm.
    mengeKg: null,
    deckungsbeitragJeKgTenge: null,
  },
];

// Anforderung 3.3: zwei Chargen desselben Tages/Blocks wie der erste
// Kostentraeger oben (T-N-A-01 / 2026-08-30), Erloes/Kosten/Menge summieren
// sich exakt zu dessen Werten - im Demo-Modus sichtbar dieselbe Aufteilung
// wie in der echten Datenbank, wenn ein Kostentraeger mehrere Chargen buendelt.
export const demoDeckungsbeitragJeCharge: DeckungsbeitragChargeZeile[] = [
  {
    chargeId: "demo-charge-1",
    chargeCode: "CH-T-N-A-01-2608301015-7F2A",
    ernteDatum: "2026-08-30",
    reihenblockCode: "T-N-A-01",
    sorteName: "Polka",
    mengeKg: 82.0,
    erloesTenge: 61200,
    kostenTenge: 23100,
    deckungsbeitragTenge: 38100,
    deckungsbeitragJeKgTenge: 464.63,
    buchungen: 2,
  },
  {
    chargeId: "demo-charge-2",
    chargeCode: "CH-T-N-A-01-2608301430-C93B",
    ernteDatum: "2026-08-30",
    reihenblockCode: "T-N-A-01",
    sorteName: "Polka",
    mengeKg: 63.5,
    erloesTenge: 47580,
    kostenTenge: 18100,
    deckungsbeitragTenge: 29480,
    deckungsbeitragJeKgTenge: 464.25,
    buchungen: 2,
  },
];

export const demoChargeOptionen: ChargeOption[] = demoDeckungsbeitragJeCharge.map((z) => ({
  id: z.chargeId,
  code: z.chargeCode,
}));

export const demoLedgerEintraege: LedgerEintrag[] = [
  { id: "demo-le-1", kostentraegerBezeichnung: "T-N-A-01 / 2026-08-30", typ: "erloes", kategorie: "B2B-Verkauf", betragTenge: 108780, buchungsdatum: "2026-08-30", beschreibung: "Lieferung Handelskette A" },
  { id: "demo-le-2", kostentraegerBezeichnung: "T-N-A-01 / 2026-08-30", typ: "kosten", kategorie: "Ernte + Kühlung", betragTenge: 41200, buchungsdatum: "2026-08-30", beschreibung: "Brigade Nord, Vorkühlung" },
  { id: "demo-le-3", kostentraegerBezeichnung: "T-N-A-03 / 2026-08-29", typ: "erloes", kategorie: "B2B-Verkauf", betragTenge: 92820, buchungsdatum: "2026-08-29", beschreibung: "Lieferung Handelskette A" },
  { id: "demo-le-4", kostentraegerBezeichnung: "T-N-A-03 / 2026-08-29", typ: "kosten", kategorie: "Ernte + Kühlung", betragTenge: 38900, buchungsdatum: "2026-08-29", beschreibung: "Brigade Nord" },
  { id: "demo-le-5", kostentraegerBezeichnung: "T-O-A-01 / 2026-08-31", typ: "erloes", kategorie: "B2B-Verkauf", betragTenge: 61500, buchungsdatum: "2026-08-31", beschreibung: "Lieferung Gastro-Distributor" },
  { id: "demo-le-6", kostentraegerBezeichnung: "T-O-A-01 / 2026-08-31", typ: "kosten", kategorie: "Ernte + Kühlung", betragTenge: 27300, buchungsdatum: "2026-08-31", beschreibung: "Brigade Ost" },
  { id: "demo-le-7", kostentraegerBezeichnung: "K-A-01 / 2026-08-30", typ: "erloes", kategorie: "B2B-Verkauf", betragTenge: 54600, buchungsdatum: "2026-08-30", beschreibung: "Zukauf-Charge" },
  { id: "demo-le-8", kostentraegerBezeichnung: "K-A-01 / 2026-08-30", typ: "kosten", kategorie: "Zukauf + Handling", betragTenge: 44100, buchungsdatum: "2026-08-30", beschreibung: "Nachbarbetrieb Kaskelen" },
];

export const demoKostentraegerOptionen: KostentraegerOption[] = demoDeckungsbeitrag.map((z) => ({
  id: z.kostentraegerId,
  bezeichnung: z.bezeichnung,
  erntetag: z.erntetag,
}));

export const demoReihenblockOptionen: ReihenblockOption[] = [
  { id: "demo-rb-1", code: "T-N-A-01" },
  { id: "demo-rb-2", code: "T-N-A-03" },
  { id: "demo-rb-3", code: "T-O-A-01" },
];

export const demoSorteOptionen: SorteOption[] = [
  { id: "demo-sorte-1", name: "Polka" },
  { id: "demo-sorte-2", name: "Polana" },
];

export const demoB2bKundeOptionen: B2bKundeOption[] = [
  { id: "demo-kunde-1", name: "Handelskette A" },
  { id: "demo-kunde-2", name: "Gastro-Distributor Almaty" },
  { id: "demo-kunde-3", name: "Almaty Fresh Market" },
];

// ---------------------------------------------------------------------------
// Zeitraum, Bereich, Zeilenzahl
//
// Die Finanzseite zeigt drei Tabellen nebeneinander statt untereinander und
// begrenzt jede auf einen Zeitraum. Alles steht in der Adresszeile, damit die
// Seite Server Component bleibt und ein Link auf einen Ausschnitt teilbar ist -
// dasselbe Vorgehen wie beim Statusfilter in reihenbloecke-ansicht.tsx.
//
// Achtung, zwei verschiedene Daten: Die Buchungen haengen an buchungsdatum,
// die beiden Deckungsbeitrag-Sichten dagegen am Erntetag der Kostentraeger
// bzw. Chargen. Derselbe Zeitraum waehlt in der einen Tabelle also andere
// Zeilen aus als in der anderen. Die Oberflaeche muss das beschriften; hier
// werden nur die Grenzen gerechnet.
//
// Alle Grenzen sind Zeichenketten im Format JJJJ-MM-TT und werden gegen
// date-Spalten verglichen. Bewusst keine Date-Objekte in der Abfrage: ein
// Date traegt eine Zeitzone, eine date-Spalte nicht, und beim Umrechnen
// verschiebt sich sonst der erste oder letzte Tag des Monats.
// ---------------------------------------------------------------------------

export const zeitraumStufen = ["monat", "vormonat", "jahr", "alles"] as const;
export type ZeitraumStufe = (typeof zeitraumStufen)[number];

/** Eine der vier Stufen oder ein einzelner Monat als "JJJJ-MM". */
export type Zeitraum = ZeitraumStufe | string;

export const ZEITRAUM_STANDARD: ZeitraumStufe = "monat";

const MONAT_MUSTER = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function istMonatsWert(wert: string): boolean {
  return MONAT_MUSTER.test(wert);
}

export function zeitraumAusText(wert: string | undefined): Zeitraum {
  if (!wert) return ZEITRAUM_STANDARD;
  if ((zeitraumStufen as readonly string[]).includes(wert)) return wert as ZeitraumStufe;
  if (istMonatsWert(wert)) return wert;
  return ZEITRAUM_STANDARD;
}

export interface ZeitraumGrenzen {
  /** Erster Tag, einschliesslich. null heisst: nach unten offen. */
  von: string | null;
  /** Letzter Tag, einschliesslich. null heisst: nach oben offen. */
  bis: string | null;
}

function zwei(n: number): string {
  return String(n).padStart(2, "0");
}

// Tag 0 des Folgemonats ist der letzte Tag des gesuchten Monats - das erspart
// eine eigene Schaltjahrrechnung fuer den Februar.
function monatsGrenzen(jahr: number, monat: number): ZeitraumGrenzen {
  const letzterTag = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  return {
    von: `${jahr}-${zwei(monat)}-01`,
    bis: `${jahr}-${zwei(monat)}-${zwei(letzterTag)}`,
  };
}

export function zeitraumGrenzen(zeitraum: Zeitraum, heute: Date = new Date()): ZeitraumGrenzen {
  const jahr = heute.getUTCFullYear();
  const monat = heute.getUTCMonth() + 1;

  if (zeitraum === "alles") return { von: null, bis: null };
  if (zeitraum === "jahr") return { von: `${jahr}-01-01`, bis: `${jahr}-12-31` };
  if (zeitraum === "vormonat") {
    return monat === 1 ? monatsGrenzen(jahr - 1, 12) : monatsGrenzen(jahr, monat - 1);
  }
  if (zeitraum === "monat") return monatsGrenzen(jahr, monat);

  const treffer = MONAT_MUSTER.exec(zeitraum);
  if (!treffer) return monatsGrenzen(jahr, monat);
  return monatsGrenzen(Number(treffer[1]), Number(treffer[2]));
}

// Die Monatsliste im Filter wird aus der aeltesten Buchung abgeleitet, nicht
// aus einer eigenen Abfrage ueber alle Monate: eine Zeile reicht, und der
// Index auf buchungsdatum traegt sie. Gedeckelt, damit ein Betrieb mit langer
// Geschichte nicht irgendwann ein Auswahlfeld mit hunderten Eintraegen hat.
const MONATE_HOECHSTENS = 60;

export function monatsListe(fruehestes: string | null, heute: Date = new Date()): string[] {
  if (!fruehestes) return [];
  const treffer = MONAT_MUSTER.exec(fruehestes.slice(0, 7));
  if (!treffer) return [];

  const vonJahr = Number(treffer[1]);
  const vonMonat = Number(treffer[2]);
  let jahr = heute.getUTCFullYear();
  let monat = heute.getUTCMonth() + 1;

  const liste: string[] = [];
  while (
    liste.length < MONATE_HOECHSTENS &&
    (jahr > vonJahr || (jahr === vonJahr && monat >= vonMonat))
  ) {
    liste.push(`${jahr}-${zwei(monat)}`);
    monat -= 1;
    if (monat === 0) {
      monat = 12;
      jahr -= 1;
    }
  }
  return liste;
}

export const finanzBereiche = ["kostentraeger", "charge", "buchungen"] as const;
export type FinanzBereich = (typeof finanzBereiche)[number];

export function finanzBereichAusText(wert: string | undefined): FinanzBereich {
  return (finanzBereiche as readonly string[]).includes(wert ?? "")
    ? (wert as FinanzBereich)
    : "kostentraeger";
}

export function ledgerTypAusText(wert: string | undefined): LedgerTyp | undefined {
  return wert === "erloes" || wert === "kosten" ? wert : undefined;
}

// Zeilenzahl: Fremdeingabe aus der Adresszeile. Ohne Deckel loest ?zeilen=999999
// eine Abfrage ueber den gesamten Bestand aus, ohne Untergrenze liesse sich die
// Tabelle auf null Zeilen stellen.
export const ZEILEN_STANDARD = 10;
/** Am Handy sind nur die ersten fuenf sichtbar, siehe .startzeilen in globals.css. */
export const ZEILEN_HANDY = 5;
export const ZEILEN_SCHRITT = 25;
export const ZEILEN_HOECHSTENS = 500;

export function zeilenAusText(wert: string | undefined): number {
  if (!wert) return ZEILEN_STANDARD;
  const zahl = Number.parseInt(wert, 10);
  if (!Number.isFinite(zahl) || zahl < ZEILEN_STANDARD) return ZEILEN_STANDARD;
  return Math.min(zahl, ZEILEN_HOECHSTENS);
}
