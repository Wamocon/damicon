// QR-Steigenkennung (WMCNL-1439). Beispieldaten fuer den Demo-Modus (kein
// Supabase konfiguriert) und fuer den Fehlerfall - Muster wie
// demoZukaufPositionen in src/lib/domain/zukauf.ts, damit der Prototyp auch
// ohne Datenbank ein funktionierendes QR-Etikett/-Ausweis zeigt.
//
// Die Codes haben dasselbe Format wie chargen.oeffentlicher_code
// (hk_ + 16 Hexstellen), sind aber frei erfunden - ein Scan im Demo-Modus
// fuehrt bewusst ins Leere statt auf eine echte Charge.

export interface DemoSteigenEtikett {
  id: string;
  code: string;
  oeffentlicherCode: string;
}

export const demoSteigenEtiketten: DemoSteigenEtikett[] = [
  { id: "demo-stg-1", code: "STG-2026-000481", oeffentlicherCode: "hk_0000000000000481" },
  { id: "demo-stg-2", code: "STG-2026-000482", oeffentlicherCode: "hk_0000000000000482" },
  { id: "demo-stg-3", code: "STG-2026-000483", oeffentlicherCode: "hk_0000000000000483" },
];

// Namensmuster wie supabase/seed.sql ("Anfangsbuchstabe. Nachname"), damit
// Demo- und DB-Modus dieselbe Optik zeigen.
export interface DemoPfleuckerAusweis {
  id: string;
  name: string;
  ausweis: string;
}

export const demoPfleuckerAusweise: DemoPfleuckerAusweis[] = [
  { id: "demo-pfl-1", name: "D. Sarsenbaj", ausweis: "MAL-0417" },
  { id: "demo-pfl-2", name: "A. Tulegenowa", ausweis: "MAL-0418" },
];
