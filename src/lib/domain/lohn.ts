// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). [NEU-BAUEN] - Idee aus
// dem Schwesterprojekt Digitalisierung-Himbeerenbetrieb (public.payroll_rates
// / calculate_payroll() / quality_factor()), auf Damicons Datenmodell
// uebersetzt: Ausschuss liegt hier nur je Pflueckaufgabe vor (Brigade-Ebene),
// nicht je Steige oder Person - die Berechnung legt ihn deshalb ueber den
// kg-Anteil der Steigen auf die beteiligten Pfluecker um (siehe
// public.lohn_periode_berechnen() in der Migration und public.kpi_aktuell()
// fuer dasselbe Umlage-Muster bei der Pflueckleistung).
//
// Verhaeltnis zu pflueckaufgaben.qualitaetsfaktor: jenes Feld bleibt
// unangetastet - eine manuelle, subjektive Einschaetzung der Betriebsleitung
// je Aufgabe bei der Belegpruefung (geschuetzt durch
// pflueckaufgabe_freigabe_pruefen). Der hier berechnete Qualitaetsfaktor ist
// ein eigener, objektiv aus der gemessenen Ausschussquote abgeleiteter Wert
// ausschliesslich fuer die Lohnrechnung - beide bestehen bewusst nebeneinander.

export const lohnStatus = ["entwurf", "freigegeben", "ausgezahlt"] as const;
export type LohnStatus = (typeof lohnStatus)[number];

export const lohnStatusMeta: Record<
  LohnStatus,
  { tone: "neutral" | "info" | "success" }
> = {
  entwurf: { tone: "neutral" },
  freigegeben: { tone: "info" },
  ausgezahlt: { tone: "success" },
};

export interface LohnSatz {
  id: string;
  gueltigAb: string;
  gueltigBis: string | null;
  stundenlohnTenge: number;
  kgSatzTenge: number;
  qualitaetsZielAusschussquote: number;
  qualitaetsfaktorMin: number;
  qualitaetsfaktorMax: number;
  notiz: string | null;
}

export interface LohnAbrechnung {
  id: string;
  pfluecker: string;
  pfleuckerAusweis: string;
  periodeStart: string;
  periodeEnde: string;
  stunden: number;
  mengeKg: number;
  ausschussquote: number | null;
  grundlohnTenge: number;
  mengenKomponenteTenge: number;
  qualitaetsfaktor: number;
  gesamtTenge: number;
  status: LohnStatus;
}

// WMCNL-2375: lohn_periode_berechnen() liest die Mengenkomponente
// ausschliesslich aus steigen (bewusste Architekturentscheidung, siehe
// Migrationskopf 20260908130000, Punkt 1 - Ausschuss liegt nur je Aufgabe
// vor und wird ueber den kg-Anteil der Steigen umgelegt). Eine abgeschlossene
// Aufgabe mit gemeldeter Menge, aber ohne jede Steige, geht dadurch still
// aus der Lohnabrechnung - dieser Typ traegt genau diesen Luecke-Befund,
// damit er sichtbar wird, statt das Kernmodell umzubauen.
export interface LohnAbschlussLuecke {
  id: string;
  code: string;
  istMengeKg: number;
}

export interface LohnPosition {
  id: string;
  pfluecker: string;
  periodeStart: string;
  periodeEnde: string;
  aufgabeCode: string | null;
  mengeKg: number;
  ausschussAnteiligKg: number;
  qualitaetsfaktor: number;
  betragTenge: number;
}

// Gesetzliche Lohnabzuege Kasachstan (Migration 20261024000000). Getrennt von
// LohnSatz/LohnAbrechnung: ein betrieblicher Lohnsatz und ein gesetzlicher
// Steuersatz aendern sich aus unabhaengigen Gruenden - siehe Migrationskopf.
export interface LohnSteuersatzKz {
  id: string;
  gueltigAb: string;
  gueltigBis: string | null;
  opvProzent: number;
  opvBemessungsgrenzeTenge: number;
  vosmsProzent: number;
  vosmsBemessungsgrenzeTenge: number;
  ipnProzent: number;
  ipnFreibetragTenge: number;
  opvrProzent: number;
  soProzent: number;
  snProzent: number;
  osmsProzent: number;
  quelle: string;
  notiz: string | null;
}

// Ein Monatsaggregat je Pfluecker - siehe Migrationskopf, warum ОПВ/ВОСМС/ИПН
// auf den Kalendermonat bezogen gerechnet werden, nicht auf eine einzelne,
// beliebig kurze lohn_abrechnungen-Periode.
export interface LohnMonatsabzug {
  id: string;
  pfluecker: string;
  pfleuckerAusweis: string;
  jahr: number;
  monat: number;
  bruttoGesamtTenge: number;
  opvTenge: number;
  vosmsTenge: number;
  ipnBemessungsgrundlageTenge: number;
  ipnTenge: number;
  nettoTenge: number;
  opvrTenge: number;
  soTenge: number;
  snTenge: number;
  osmsTenge: number;
  arbeitgeberkostenGesamtTenge: number;
}

// Demo-Modus (ohne Supabase-Umgebung): dieselbe Geschichte wie der Seed -
// D. Sarsenbaj und A. Tulegenowa (Brigade Nord) mit hoeherem Ausschuss auf
// einer bereits abgeschlossenen Aufgabe, M. Qojschybaj (Brigade Ost) mit
// makellosem Zwischenstand auf einer noch laufenden Aufgabe. Die Zahlen sind
// mit derselben Formel gerechnet wie public.lohn_periode_berechnen() (Satz:
// 900 ₸/h, 850 ₸/kg, Ziel 5 % Ausschuss, Korridor 0,90-1,10) - anders als die
// fruehere, rein hartkodierte Seed-Zeile ist das hier keine erfundene Summe.
export const demoLohnSatz: LohnSatz = {
  id: "demo-satz-1",
  gueltigAb: "2026-01-01",
  gueltigBis: null,
  stundenlohnTenge: 900,
  kgSatzTenge: 850,
  qualitaetsZielAusschussquote: 5,
  qualitaetsfaktorMin: 0.9,
  qualitaetsfaktorMax: 1.1,
  notiz: "Annahme für den Prototyp – noch keine mit dem Kunden bestätigte Zahl.",
};

export const demoLohnAbrechnungen: LohnAbrechnung[] = [
  {
    id: "demo-lohn-1",
    pfluecker: "D. Sarsenbaj",
    pfleuckerAusweis: "MAL-0417",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    stunden: 7.2,
    mengeKg: 47.8,
    ausschussquote: 10.56,
    grundlohnTenge: 6480,
    mengenKomponenteTenge: 37440.8,
    qualitaetsfaktor: 0.9,
    gesamtTenge: 43920.8,
    status: "entwurf",
  },
  {
    id: "demo-lohn-2",
    pfluecker: "A. Tulegenowa",
    pfleuckerAusweis: "MAL-0418",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    stunden: 7.33,
    mengeKg: 47.8,
    ausschussquote: 10.56,
    grundlohnTenge: 6600,
    mengenKomponenteTenge: 37440.8,
    qualitaetsfaktor: 0.9,
    gesamtTenge: 44040.8,
    status: "freigegeben",
  },
  {
    id: "demo-lohn-3",
    pfluecker: "M. Qojschybaj",
    pfleuckerAusweis: "MAL-0421",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    stunden: 2.12,
    mengeKg: 8,
    ausschussquote: 0,
    grundlohnTenge: 1905,
    mengenKomponenteTenge: 7480,
    qualitaetsfaktor: 1.1,
    gesamtTenge: 9385,
    status: "entwurf",
  },
];

export const demoLohnPositionen: LohnPosition[] = [
  {
    id: "demo-pos-1",
    pfluecker: "D. Sarsenbaj",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    aufgabeCode: "PA-2026-0912-01",
    mengeKg: 25.7,
    ausschussAnteiligKg: 2.1,
    qualitaetsfaktor: 0.94,
    betragTenge: 20534.3,
  },
  {
    id: "demo-pos-2",
    pfluecker: "D. Sarsenbaj",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    aufgabeCode: "PA-2026-0912-04",
    mengeKg: 22.1,
    ausschussAnteiligKg: 2.95,
    qualitaetsfaktor: 0.9,
    betragTenge: 16906.5,
  },
  {
    id: "demo-pos-3",
    pfluecker: "A. Tulegenowa",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    aufgabeCode: "PA-2026-0912-01",
    mengeKg: 25.7,
    ausschussAnteiligKg: 2.1,
    qualitaetsfaktor: 0.94,
    betragTenge: 20534.3,
  },
  {
    id: "demo-pos-4",
    pfluecker: "A. Tulegenowa",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    aufgabeCode: "PA-2026-0912-04",
    mengeKg: 22.1,
    ausschussAnteiligKg: 2.95,
    qualitaetsfaktor: 0.9,
    betragTenge: 16906.5,
  },
  {
    id: "demo-pos-5",
    pfluecker: "M. Qojschybaj",
    periodeStart: "2026-09-01",
    periodeEnde: "2026-09-02",
    aufgabeCode: "PA-2026-0912-02",
    mengeKg: 8,
    ausschussAnteiligKg: 0,
    qualitaetsfaktor: 1.1,
    betragTenge: 7480,
  },
];

// Steuerkodex RK 2026 (in Kraft seit 01.01.2026) - dieselben Werte wie der
// Startsatz in Migration 20261024000000, nicht separat erfunden.
export const demoLohnSteuersatzKz: LohnSteuersatzKz = {
  id: "demo-steuersatz-kz-1",
  gueltigAb: "2026-01-01",
  gueltigBis: null,
  opvProzent: 10,
  opvBemessungsgrenzeTenge: 4250000,
  vosmsProzent: 2,
  vosmsBemessungsgrenzeTenge: 1700000,
  ipnProzent: 10,
  ipnFreibetragTenge: 129750,
  opvrProzent: 3.5,
  soProzent: 5,
  snProzent: 6,
  osmsProzent: 3,
  quelle: "Steuerkodex RK 2026; ИПН-Standardabzug 30 МРП, МРП 2026 = 4 325 Tenge.",
  notiz: "Näherung: Sonderfreibeträge und die СО-Kuerzung der СН sind hier nicht abgebildet, siehe Migrationskopf 20261024000000.",
};

// Mit derselben Formel gerechnet wie public.lohn_kz_abzuege_berechnen()
// (Brutto = Summe der Demo-Abrechnungen von D. Sarsenbaj/A. Tulegenowa oben
// fuer denselben Monat), keine unabhaengig erfundene Zeile.
export const demoLohnMonatsabzuege: LohnMonatsabzug[] = [
  {
    id: "demo-monatsabzug-1",
    pfluecker: "D. Sarsenbaj",
    pfleuckerAusweis: "MAL-0417",
    jahr: 2026,
    monat: 9,
    bruttoGesamtTenge: 43920.8,
    opvTenge: 4392.08,
    vosmsTenge: 878.42,
    ipnBemessungsgrundlageTenge: 0,
    ipnTenge: 0,
    nettoTenge: 38650.3,
    opvrTenge: 1537.23,
    soTenge: 2196.04,
    snTenge: 2635.25,
    osmsTenge: 1317.62,
    arbeitgeberkostenGesamtTenge: 51606.94,
  },
  {
    id: "demo-monatsabzug-2",
    pfluecker: "A. Tulegenowa",
    pfleuckerAusweis: "MAL-0418",
    jahr: 2026,
    monat: 9,
    bruttoGesamtTenge: 44040.8,
    opvTenge: 4404.08,
    vosmsTenge: 880.82,
    ipnBemessungsgrundlageTenge: 0,
    ipnTenge: 0,
    nettoTenge: 38755.9,
    opvrTenge: 1541.43,
    soTenge: 2202.04,
    snTenge: 2642.45,
    osmsTenge: 1321.22,
    arbeitgeberkostenGesamtTenge: 51747.94,
  },
];
