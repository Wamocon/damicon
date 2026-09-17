// Compliance-Cockpit (WMCNL-1446): reine Domaenentypen und Beispieldaten,
// keine Supabase-Abhaengigkeit. Die eigentlichen Ladefunktionen und der
// "quelle"-tragende Cockpit-Wrapper stehen in src/lib/data/compliance.ts -
// gleiche Aufteilung wie bei den meisten anderen Modulen (siehe
// domain/reklamationen.ts + data/reklamationen.ts), hier nachgezogen, weil
// die Datei sonst alle vier Zwecke (Typen, Demo-Daten, Kennzahlenrechnung,
// echte Ladefunktionen) in einer 377-Zeilen-Datei buendelte
// (WMC-Vibecode-Cleanup-Fund).

export type Rechtsgrundlage = "einwilligung" | "vertrag" | "gesetzliche_pflicht";
export type EinwilligungKanal = "papier" | "app" | "web" | "sms";
export type VorfallArt = "unbefugter_zugriff" | "verlust" | "offenlegung" | "sonstiges";
export type Zugriffsaktion = "lesen" | "export" | "druck" | "uebermittlung";

export interface VerarbeitungszweckZeile {
  id: string;
  code: string;
  bezeichnung: string;
  rechtsgrundlage: Rechtsgrundlage;
  aufbewahrungMonate: number;
  automatisierteEntscheidung: boolean;
  /** Anforderung 4.8: benannte verantwortliche Person, sofern gesetzt. */
  verantwortlichProfilId: string | null;
  verantwortlicher: string | null;
}

export interface EinwilligungZeile {
  id: string;
  betroffener: string;
  zweck: string;
  kanal: EinwilligungKanal;
  erteiltAm: string;
  widerrufenAm: string | null;
  widerrufGrund: string | null;
}

export interface VorfallZeile {
  id: string;
  festgestelltAm: string;
  art: VorfallArt;
  beschreibung: string;
  betroffeneAnzahl: number | null;
  meldefristAm: string | null;
  gemeldetAm: string | null;
  meldereferenz: string | null;
  behobenAm: string | null;
  ueberfaellig: boolean;
  /** Anforderung 4.8: wer diesen Vorfall bearbeitet, sofern gesetzt. */
  verantwortlichProfilId: string | null;
  verantwortlicher: string | null;
}

export interface DrittweitergabeZeile {
  id: string;
  betroffener: string;
  empfaenger: string;
  zweck: string | null;
  weitergegebenAm: string;
  benachrichtigungsfristAm: string | null;
  benachrichtigtAm: string | null;
  ueberfaellig: boolean;
}

export interface ComplianceKennzahlen {
  einwilligungenAktiv: number;
  einwilligungenWiderrufen: number;
  vorfaelleUeberfaellig: number;
  drittweitergabenUeberfaellig: number;
}

export function kennzahlenAus(
  einwilligungen: EinwilligungZeile[],
  vorfaelle: VorfallZeile[],
  drittweitergaben: DrittweitergabeZeile[],
): ComplianceKennzahlen {
  return {
    einwilligungenAktiv: einwilligungen.filter((e) => !e.widerrufenAm).length,
    einwilligungenWiderrufen: einwilligungen.filter((e) => e.widerrufenAm).length,
    vorfaelleUeberfaellig: vorfaelle.filter((v) => v.ueberfaellig).length,
    drittweitergabenUeberfaellig: drittweitergaben.filter((d) => d.ueberfaellig).length,
  };
}

// Wenige, aber echte Beispieldaten fuer den Demo-Modus (ohne Supabase-Umgebung).
// Anders als bei Dokumenten gab es fuer Compliance noch keinen strukturierten
// Demo-Datensatz in src/lib/domain/ - nur die frueheren, rein statischen Texte
// aus ComplianceDemo. Diese Werte spiegeln die Seed-Daten aus supabase/seed.sql.
export const demoVerarbeitungszwecke: VerarbeitungszweckZeile[] = [
  {
    id: "demo-personaleinsatz",
    code: "personaleinsatz",
    bezeichnung: "Personaleinsatz und Lohnabrechnung",
    rechtsgrundlage: "vertrag",
    aufbewahrungMonate: 36,
    automatisierteEntscheidung: true,
    verantwortlichProfilId: "demo-leitung",
    verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
  },
  {
    id: "demo-auftragsabwicklung",
    code: "auftragsabwicklung",
    bezeichnung: "Auftragsabwicklung und Lieferung",
    rechtsgrundlage: "vertrag",
    aufbewahrungMonate: 60,
    automatisierteEntscheidung: false,
    verantwortlichProfilId: "demo-leitung",
    verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
  },
  {
    id: "demo-esutd",
    code: "esutd_meldung",
    bezeichnung: "Meldung an ESUTD (enbek.kz)",
    rechtsgrundlage: "gesetzliche_pflicht",
    aufbewahrungMonate: 60,
    automatisierteEntscheidung: false,
    verantwortlichProfilId: null,
    verantwortlicher: null,
  },
];

export const demoEinwilligungen: EinwilligungZeile[] = [
  {
    id: "demo-e1",
    betroffener: "D. Sarsenbaj",
    zweck: "Personaleinsatz und Lohnabrechnung",
    kanal: "papier",
    erteiltAm: "2026-08-20T08:00:00+06:00",
    widerrufenAm: null,
    widerrufGrund: null,
  },
  {
    id: "demo-e2",
    betroffener: "A. Tulegenowa",
    zweck: "Personaleinsatz und Lohnabrechnung",
    kanal: "papier",
    erteiltAm: "2026-07-01T08:00:00+06:00",
    widerrufenAm: "2026-08-10T09:00:00+06:00",
    widerrufGrund: "Beschaeftigungsverhaeltnis beendet",
  },
  {
    id: "demo-e3",
    betroffener: "Handelskette A",
    zweck: "Auftragsabwicklung und Lieferung",
    kanal: "web",
    erteiltAm: "2026-08-15T08:00:00+06:00",
    widerrufenAm: null,
    widerrufGrund: null,
  },
];

export const demoVorfaelle: VorfallZeile[] = [
  {
    id: "demo-v1",
    festgestelltAm: "2026-08-25T14:00:00+06:00",
    art: "unbefugter_zugriff",
    beschreibung: "Unpersoenliches Konto im Buero blieb nach Personalwechsel eine Woche aktiv.",
    betroffeneAnzahl: 1,
    meldefristAm: "2026-08-26T14:00:00+06:00",
    gemeldetAm: null,
    meldereferenz: null,
    behobenAm: null,
    ueberfaellig: true,
    verantwortlichProfilId: null,
    verantwortlicher: null,
  },
  {
    id: "demo-v2",
    festgestelltAm: "2026-07-10T09:00:00+06:00",
    art: "verlust",
    beschreibung: "USB-Stick mit ESUTD-Sammelnachweis verlegt, am Folgetag wiedergefunden.",
    betroffeneAnzahl: 42,
    meldefristAm: "2026-07-11T09:00:00+06:00",
    gemeldetAm: "2026-07-11T08:00:00+06:00",
    meldereferenz: "Meldung enbek.kz Nr. 2026-0710",
    behobenAm: "2026-07-11T16:00:00+06:00",
    ueberfaellig: false,
    verantwortlichProfilId: "demo-leitung",
    verantwortlicher: "N. Amanschajewa (Betriebsleitung)",
  },
];

export const demoDrittweitergaben: DrittweitergabeZeile[] = [
  {
    id: "demo-d1",
    betroffener: "M. Qojschybaj",
    empfaenger: "ESUTD (enbek.kz)",
    zweck: "Meldung an ESUTD (enbek.kz)",
    weitergegebenAm: "2026-08-05T08:00:00+06:00",
    benachrichtigungsfristAm: "2026-08-19T08:00:00+06:00",
    benachrichtigtAm: null,
    ueberfaellig: true,
  },
  {
    id: "demo-d2",
    betroffener: "Handelskette A",
    empfaenger: "ISESF - elektronische Rechnungsstellung",
    zweck: "Auftragsabwicklung und Lieferung",
    weitergegebenAm: "2026-08-15T08:00:00+06:00",
    benachrichtigungsfristAm: "2026-08-29T08:00:00+06:00",
    benachrichtigtAm: "2026-08-16T09:00:00+06:00",
    ueberfaellig: false,
  },
];
