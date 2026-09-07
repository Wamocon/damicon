// Reklamationsmanagement (WMCNL-1455). [NEU-BAUEN] - im Schwesterprojekt
// Digitalisierung-Himbeerenbetrieb als public.complaints/complaint_events
// umgesetzt, hier auf Damicons Nachweiskette uebersetzt: eine Reklamation
// haengt an einer Charge statt an einem eigenen Beleg-Paar - von der Charge
// aus lassen sich Reihenblock, Pfluecker und Kuehlkurve bereits
// zurueckverfolgen (siehe public.rueckstandsnachweis()).

// Reihenfolge wie in den Datenbank-Enums public.reklamation_grund /
// public.reklamation_status.
export const reklamationGruende = [
  "qualitaet",
  "menge",
  "verspaetung",
  "verpackung",
  "temperatur",
  "sonstiges",
] as const;

export type ReklamationGrund = (typeof reklamationGruende)[number];

export const reklamationStatus = [
  "offen",
  "in_pruefung",
  "angenommen",
  "abgelehnt",
  "erledigt",
] as const;

export type ReklamationStatus = (typeof reklamationStatus)[number];

export const reklamationStatusMeta: Record<
  ReklamationStatus,
  { tone: "neutral" | "info" | "warning" | "success" | "danger" }
> = {
  offen: { tone: "neutral" },
  in_pruefung: { tone: "info" },
  angenommen: { tone: "success" },
  abgelehnt: { tone: "danger" },
  erledigt: { tone: "success" },
};

export interface ReklamationEreignis {
  id: string;
  neuerStatus: ReklamationStatus | null;
  text: string;
  sichtbarFuerKunde: boolean;
  autor: string | null;
  erstelltAm: string;
}

export interface Reklamation {
  id: string;
  code: string;
  kunde: string;
  chargeCode: string | null;
  reihenblock: string | null;
  grund: ReklamationGrund;
  betreff: string;
  beschreibung: string;
  betroffeneMengeKg: number | null;
  status: ReklamationStatus;
  gemeldetAm: string;
  fristAm: string | null;
  erledigtAm: string | null;
  loesung: string | null;
  gutschriftTenge: number | null;
  ereignisse: ReklamationEreignis[];
}

// Wenige, aber echte Beispieldaten fuer den Demo-Modus (ohne Supabase-Umgebung).
// Spiegelt die Seed-Daten aus supabase/seed.sql - dieselben drei Faelle, damit
// Demo- und DB-Modus dieselbe Geschichte erzaehlen.
export const demoReklamationen: Reklamation[] = [
  {
    id: "demo-rek-1",
    code: "REK-20260903-0001",
    kunde: "Handelskette A",
    chargeCode: "CH-0902-12",
    reihenblock: "T-N-A-03",
    grund: "temperatur",
    betreff: "Ware bei Anlieferung zu warm",
    beschreibung:
      "Kühlkette laut Messprotokoll erst nach 72 Minuten erreicht. Kunde meldet weiche, überreife Beeren bei Anlieferung.",
    betroffeneMengeKg: 44.2,
    status: "in_pruefung",
    gemeldetAm: "2026-09-03T09:10:00+06:00",
    fristAm: "2026-09-08",
    erledigtAm: null,
    loesung: null,
    gutschriftTenge: null,
    ereignisse: [
      {
        id: "demo-e1-1",
        neuerStatus: null,
        text: "Reklamation gemeldet: Ware bei Anlieferung zu warm",
        sichtbarFuerKunde: true,
        autor: "Handelskette A",
        erstelltAm: "2026-09-03T09:10:00+06:00",
      },
      {
        id: "demo-e1-2",
        neuerStatus: "in_pruefung",
        text: "Kühlkurve wird mit dem Messprotokoll der Charge abgeglichen.",
        sichtbarFuerKunde: true,
        autor: "Daniyar Omarov (betriebsleitung)",
        erstelltAm: "2026-09-03T15:00:00+06:00",
      },
    ],
  },
  {
    id: "demo-rek-2",
    code: "REK-20260903-0002",
    kunde: "Gastro-Distributor Almaty",
    chargeCode: "CH-0901-07",
    reihenblock: "T-N-A-01",
    grund: "menge",
    betreff: "Gelieferte Menge unter Bestellmenge",
    beschreibung:
      "Laut Lieferschein 49,5 kg angekündigt, im Wareneingang wurden nur 46,0 kg gewogen.",
    betroffeneMengeKg: 3.5,
    status: "offen",
    gemeldetAm: "2026-09-03T14:20:00+06:00",
    fristAm: "2026-09-08",
    erledigtAm: null,
    loesung: null,
    gutschriftTenge: null,
    ereignisse: [
      {
        id: "demo-e2-1",
        neuerStatus: null,
        text: "Reklamation gemeldet: Gelieferte Menge unter Bestellmenge",
        sichtbarFuerKunde: true,
        autor: "Gastro-Distributor Almaty",
        erstelltAm: "2026-09-03T14:20:00+06:00",
      },
    ],
  },
  {
    id: "demo-rek-3",
    code: "REK-20260821-0003",
    kunde: "Almaty Fresh Market",
    chargeCode: null,
    reihenblock: null,
    grund: "verpackung",
    betreff: "Kartons bei Anlieferung durchnässt",
    beschreibung:
      "Zwei von acht Kartons waren an der Unterseite durchnässt, Ware in diesen Kartons nicht mehr verkaufsfähig.",
    betroffeneMengeKg: null,
    status: "erledigt",
    gemeldetAm: "2026-08-20T10:00:00+06:00",
    fristAm: "2026-08-25",
    erledigtAm: "2026-08-22T09:00:00+06:00",
    loesung:
      "Gutschrift für zwei Kartons erteilt, Verpackungsvorgabe an die Logistik nachgeschärft.",
    gutschriftTenge: 15000,
    ereignisse: [
      {
        id: "demo-e3-1",
        neuerStatus: null,
        text: "Reklamation gemeldet: Kartons bei Anlieferung durchnässt",
        sichtbarFuerKunde: true,
        autor: "Almaty Fresh Market",
        erstelltAm: "2026-08-20T10:00:00+06:00",
      },
      {
        id: "demo-e3-2",
        neuerStatus: "erledigt",
        text: "Gutschrift für zwei Kartons erteilt, Verpackungsvorgabe an die Logistik nachgeschärft.",
        sichtbarFuerKunde: true,
        autor: "Saltanat Nurlan (buchhaltung)",
        erstelltAm: "2026-08-22T09:00:00+06:00",
      },
    ],
  },
];
