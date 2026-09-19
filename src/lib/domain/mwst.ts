// Mehrwertsteuer-Registrierungsstatus (Migration 20261025000000). Reine
// Typen/Demo-Daten ohne Server-Import, wie domain/lohn.ts.

export interface MwstStatus {
  standardProzent: number;
  schwelleTenge: number;
  quelle: string;
  registriert: boolean;
  registriertAm: string | null;
  schwelleUeberschrittenAm: string | null;
  meldefristAm: string | null;
  letzterUmsatzTenge: number | null;
  letztePruefungAm: string | null;
}

// Steuerkodex RK 2026 - dieselben Werte wie der Startsatz in Migration
// 20261025000000. Demo-Umsatz bewusst weit unter der Schwelle: ein Betrieb in
// der Groessenordnung dieses Prototyps hat sie noch nicht ueberschritten.
export const demoMwstStatus: MwstStatus = {
  standardProzent: 16,
  schwelleTenge: 43250000,
  quelle: "Steuerkodex RK 2026 (in Kraft seit 01.01.2026), Registrierungsschwelle 10.000 MRP.",
  registriert: false,
  registriertAm: null,
  schwelleUeberschrittenAm: null,
  meldefristAm: null,
  letzterUmsatzTenge: 337700,
  letztePruefungAm: null,
};
