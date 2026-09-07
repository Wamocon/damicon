// Die 14 Baseline-Kennzahlen aus der WAMOCON-Marktanalyse (Kapitel 4.10). Sie
// werden am 01.10.2026 gemeinsam mit dem Kunden als Ausgangswert unterschrieben.
// Im Prototyp Platzhalterwerte - die echte Berechnung folgt mit den Erntedaten
// der ersten vollstaendig gemessenen Saison.

export type KpiTrend = "up" | "down" | "flat";

// Kann das System diese Kennzahl heute fortschreiben?
//   "berechenbar"        - aus den vorhandenen Tabellen ableitbar, nur die
//                          Aggregation fehlt noch.
//   "erfassung-fehlt"    - die Tabellen stehen, aber niemand traegt die
//                          Werte ein.
//   "tabelle-fehlt"      - das Datenmodell hat dafuer noch keinen Platz.
//   "rechtlich-ungeklaert" - technisch berechenbar, aber die rechtliche
//                          Grundlage der Kennzahl selbst ist nicht durch
//                          eine gepruefte Primaerquelle belegt (Fund aus dem
//                          Vergleich mit dem Schwesterprojekt: die ЕСУТД-
//                          Pflicht war zunaechst in keinem gepruefeten
//                          Primaertext belegt; der Masterplan vom 01.09.2026
//                          nennt inzwischen enbek.kz als Anbindungspunkt,
//                          siehe WMCNL-1447 - eine Rechtsprüfung der Pflicht
//                          selbst steht weiterhin aus). Eine Zahl aus
//                          unsicherer Rechtsgrundlage gehoert nicht
//                          kommentarlos unter eine Baseline-Unterschrift.
//
// Diese Einordnung gehoert an die Kachel, nicht in eine Anlage: wer eine
// Baseline unterschreibt, muss sehen, welche Zusage heute schon messbar ist.
export type Datenherkunft =
  | "berechenbar"
  | "erfassung-fehlt"
  | "tabelle-fehlt"
  | "rechtlich-ungeklaert";

export interface Kpi {
  key: string;
  zone: "feld" | "hof" | "buero" | "markt";
  wert: string;
  ziel: string;
  trend: KpiTrend;
  // positive Richtung: ist ein steigender Wert gut ("up") oder schlecht ("down")?
  gutRichtung: "up" | "down";
  platzhalter: true;
  datenherkunft: Datenherkunft;
  /** Was fehlt, damit die Kennzahl gemessen werden kann. */
  braucht: string;
  /** Aus echten Daten gerechneter Istwert, falls vorhanden. */
  gerechnet?: {
    zahl: number;
    einheit: string;
    basis: string;
    datensaetze: number;
  } | null;
}

export const kpis: Kpi[] = [
  {
    key: "verlustquote",
    zone: "hof",
    wert: "8,4 %",
    ziel: "< 6 %",
    trend: "down",
    gutRichtung: "down",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Ausschuss je Charge wird erfasst",
  },
  {
    key: "vermarktungsfaehig",
    zone: "hof",
    wert: "82 %",
    ziel: "> 90 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Qualitaetssortierung je Schale",
  },
  {
    key: "zeitBisVorkuehlung",
    zone: "hof",
    wert: "47 min",
    ziel: "< 60 min",
    trend: "flat",
    gutRichtung: "down",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Pflueck- und Kuehlzeitpunkt je Charge",
  },
  {
    key: "zeitBisKunde",
    zone: "hof",
    wert: "19 h",
    ziel: "< 24 h",
    trend: "down",
    gutRichtung: "down",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Lieferungen mit Abfahrt und Ankunft",
  },
  {
    key: "pflueckleistung",
    zone: "feld",
    wert: "6,1 kg/h",
    ziel: "> 7 kg/h",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Steige mit Person gegen Arbeitszeit",
  },
  {
    key: "pflueckStreuung",
    zone: "feld",
    wert: "2,3×",
    ziel: "< 1,8×",
    trend: "down",
    gutRichtung: "down",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Leistung je Person ueber die Saison",
  },
  {
    key: "pflueckintervall",
    zone: "feld",
    wert: "84 %",
    ziel: "> 95 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Erntefolge je Reihenblock aus den Chargen",
  },
  {
    key: "behandlungenWartezeit",
    zone: "feld",
    wert: "96 %",
    ziel: "100 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - aus Behandlung und Sperrlogik ableitbar",
  },
  {
    key: "reklamationsquote",
    zone: "markt",
    wert: "3,2 %",
    ziel: "< 2 %",
    trend: "down",
    gutRichtung: "down",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Reklamationen mit Bezug zur Charge",
  },
  {
    key: "liefertreue",
    zone: "markt",
    wert: "91 %",
    ziel: "> 97 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Zugesagte gegen tatsaechliche Lieferung",
  },
  {
    key: "belegteVerkaeufe",
    zone: "buero",
    wert: "71 %",
    ziel: "100 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Anbindung an ЭСФ und Warenbegleitschein",
  },
  {
    key: "deckungsbeitrag",
    zone: "buero",
    wert: "640 ₸/kg",
    ziel: "> 700 ₸/kg",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "berechenbar",
    braucht: "nichts - Buchungen je Charge gegen Erntemenge",
  },
  {
    key: "esutdAbdeckung",
    zone: "buero",
    wert: "64 %",
    ziel: "100 %",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "rechtlich-ungeklaert",
    braucht:
      "rechtliche Bestaetigung der ЕСУТД-Pflicht ueber enbek.kz (siehe WMCNL-1447) - Anbindungspunkt benannt, Rechtsprüfung der Pflicht selbst steht noch aus",
  },
  {
    key: "websiteAnfragen",
    zone: "markt",
    wert: "12 / Monat",
    ziel: "Ausgangswert",
    trend: "up",
    gutRichtung: "up",
    platzhalter: true,
    datenherkunft: "tabelle-fehlt",
    braucht: "Kontaktformular auf der Website",
  },
];

// Verteilung der Messbarkeit - Grundlage fuer den Hinweis am Kennzahlenblock.
export function herkunftZaehlen(liste: Kpi[] = kpis): Record<Datenherkunft, number> {
  const zaehler: Record<Datenherkunft, number> = {
    berechenbar: 0,
    "erfassung-fehlt": 0,
    "tabelle-fehlt": 0,
    "rechtlich-ungeklaert": 0,
  };
  for (const kpi of liste) zaehler[kpi.datenherkunft] += 1;
  return zaehler;
}
