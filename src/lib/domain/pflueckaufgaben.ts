// Pflueckaufgaben-Engine mit Fotobeleg. [UEBERNEHMEN] aus 1Cati Migration 6:
// service_orders + workforce_tasks + media_reports sind bereits eine
// "Aufgabe-mit-Fotobeleg-Maschine". Hier direkt als Pflueckaufgabe je Brigade
// und Reihenblock genutzt.

import { wandzeitZuUtc } from "@/lib/listen/zeitraum";

/** Datum mit Uhrzeit, wie datetime-local es liefert: "2026-09-24T14:30". */
export const DATUM_UHRZEIT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

/** So weit darf eine Faelligkeit von heute entfernt liegen, in Tagen. */
const FAELLIGKEIT_SPANNE_TAGE = 366;

/**
 * Faelligkeit einer neuen Pflueckaufgabe, aus dem Formular oder vom
 * KI-Werkzeug: Datum und Uhrzeit in Betriebszeit Almaty, Pflicht seit
 * WMCNL-2488. null ohne Uhrzeit, bei einem Tag, den es nicht gibt, und bei
 * mehr als einem Jahr Abstand zu heute - ein Tippfehler wie 2206 statt 2026
 * landete sonst still in der Planung.
 */
export function faelligkeitLesen(roh: string, jetzt: Date = new Date()): Date | null {
  const wert = roh.trim();
  if (!DATUM_UHRZEIT.test(wert)) return null;
  const zeitpunkt = wandzeitZuUtc(wert);
  if (!zeitpunkt) return null;
  const abstandTage = Math.abs(zeitpunkt.getTime() - jetzt.getTime()) / 86_400_000;
  return abstandTage > FAELLIGKEIT_SPANNE_TAGE ? null : zeitpunkt;
}

// Reihenfolge wie im Datenbank-Enum public.pflueckaufgabe_status.
export const aufgabenStatus = [
  "offen",
  "angenommen",
  "in_arbeit",
  "beleg_pruefung",
  "abgeschlossen",
] as const;

export type AufgabenStatus = (typeof aufgabenStatus)[number];

export interface MediaBeleg {
  id: string;
  art: "schale" | "reihenblock" | "steige";
  aufgenommen: string;
  hinweis: string;
  // Platzhalterbild zum Thema Himbeerplantage (Analyse Kapitel 8)
  bildUrl: string;
}

export interface Pflueckaufgabe {
  id: string;
  reihenblock: string;
  sorte: string;
  brigade: string;
  pflueckerAnzahl: number;
  status: AufgabenStatus;
  faelligkeit: string;
  zielmengeKg: number;
  istMengeKg: number;
  belege: MediaBeleg[];
  qualitaetsfaktor: number | null;
}

// Platzhaltergrafiken je Belegart (Analyse Kapitel 8). Eigene SVGs statt
// Stockfotos - als Platzhalter erkennbar und ohne Netzzugriff nutzbar. Sie
// werden 1:1 durch echtes Betriebsmaterial aus Kasachstan ersetzt.
const feld = "/belege/reihenblock.svg";
const schale = "/belege/schale.svg";
const ernte = "/belege/steige.svg";

// Relativ zu "jetzt" berechnet, damit die Faelligkeitsanzeige auch im
// Demo-Modus ohne Datenbank lebendig wirkt statt "seit 3 Tagen ueberfaellig"
// zu zeigen - dieselbe Ueberlegung wie in supabase/seed.sql. Wird einmal beim
// Laden dieses Moduls (Serverstart bzw. erster Aufruf) berechnet.
function inMinuten(minuten: number): string {
  return new Date(Date.now() + minuten * 60_000).toISOString();
}

export const pflueckaufgaben: Pflueckaufgabe[] = [
  {
    id: "PA-2026-0912-01",
    reihenblock: "T-N-A-01",
    sorte: "Polka",
    brigade: "Brigade Nord",
    pflueckerAnzahl: 6,
    status: "beleg_pruefung",
    faelligkeit: inMinuten(-12), // knapp abgegeben, jetzt in Pruefung
    zielmengeKg: 48,
    istMengeKg: 51.4,
    qualitaetsfaktor: 1.08,
    belege: [
      { id: "MB-01", art: "schale", aufgenommen: "2026-09-02T10:41:00+06:00", hinweis: "Verkaufsschale 125 g, geschlossene Fruchtdecke", bildUrl: schale },
      { id: "MB-02", art: "reihenblock", aufgenommen: "2026-09-02T09:12:00+06:00", hinweis: "Reihenblock vor Pflücken, Tau abgetrocknet", bildUrl: feld },
    ],
  },
  {
    id: "PA-2026-0912-02",
    reihenblock: "T-O-A-01",
    sorte: "Polana",
    brigade: "Brigade Ost",
    pflueckerAnzahl: 4,
    status: "in_arbeit",
    faelligkeit: inMinuten(55), // laeuft, Frist rueckt naeher
    zielmengeKg: 30,
    istMengeKg: 17.9,
    qualitaetsfaktor: null,
    belege: [
      { id: "MB-03", art: "reihenblock", aufgenommen: "2026-09-02T08:55:00+06:00", hinweis: "Startbeleg Reihenblock", bildUrl: ernte },
    ],
  },
  {
    id: "PA-2026-0912-03",
    reihenblock: "K-A-01",
    sorte: "Polka",
    brigade: "Brigade Nachbarbetrieb",
    pflueckerAnzahl: 5,
    status: "angenommen",
    faelligkeit: inMinuten(190), // 3 Std. 10 Min. Vorlauf
    zielmengeKg: 26,
    istMengeKg: 0,
    qualitaetsfaktor: null,
    belege: [],
  },
  {
    id: "PA-2026-0912-04",
    reihenblock: "T-N-A-03",
    sorte: "Polka",
    brigade: "Brigade Nord",
    pflueckerAnzahl: 6,
    status: "abgeschlossen",
    faelligkeit: "2026-09-01T11:00:00+06:00",
    zielmengeKg: 45,
    istMengeKg: 44.2,
    qualitaetsfaktor: 0.97,
    belege: [
      { id: "MB-04", art: "schale", aufgenommen: "2026-09-01T10:30:00+06:00", hinweis: "Schale mit leichtem Überreifeanteil", bildUrl: schale },
      { id: "MB-05", art: "steige", aufgenommen: "2026-09-01T10:48:00+06:00", hinweis: "Steige 2 kg, QR-Etikett lesbar", bildUrl: ernte },
    ],
  },
  {
    id: "PA-2026-0912-05",
    reihenblock: "T-O-A-02",
    sorte: "Polana",
    brigade: "Brigade Ost",
    pflueckerAnzahl: 4,
    status: "offen",
    faelligkeit: inMinuten(-18), // noch nicht angenommen, bereits ueberfaellig
    zielmengeKg: 28,
    istMengeKg: 0,
    qualitaetsfaktor: null,
    belege: [],
  },
];

export const aufgabenStatusMeta: Record<
  AufgabenStatus,
  { tone: "neutral" | "info" | "warning" | "success" }
> = {
  offen: { tone: "neutral" },
  angenommen: { tone: "info" },
  in_arbeit: { tone: "info" },
  beleg_pruefung: { tone: "warning" },
  abgeschlossen: { tone: "success" },
};
