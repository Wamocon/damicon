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
