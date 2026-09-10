// Kamera-QR-Scan des Pfluecker-Ausweises (Anforderung 2.7/2.8). Reine
// Zuordnungslogik ohne Server-/Browser-Import, damit sie sowohl im Client
// (ausweis-scan.tsx) als auch eigenstaendig per Node getestet werden kann
// (supabase/tests/ausweis-scan.mjs) - dieselbe Trennung wie bei
// src/lib/import/zukauf-parser.ts.
//
// Der QR-Inhalt des Ausweises ist seit dieser Anforderung der rohe
// ausweis-Code selbst (z. B. "MAL-0417"), nicht mehr eine fuer alle
// Ausweise identische Navigations-URL - siehe Migrationskommentar in
// qr-steigen-ansicht.tsx. Der Code steht ohnehin bereits als Klartext unter
// dem QR auf demselben Ausweis, das Kodieren desselben Werts in den QR
// selbst schafft also keine neue Preisgabe.

export interface PflueckerOption {
  id: string;
  name: string;
  ausweis: string;
}

// Normalisiert einen rohen QR-/Freitext-Wert fuer den Vergleich: Gross-/
// Kleinschreibung und Rand-Leerzeichen sind fuer eine Kamera-Erkennung oder
// eine haendische Nachbesserung keine inhaltlichen Unterschiede.
export function normalisiereAusweis(wert: string): string {
  return wert.trim().toUpperCase();
}

// Ordnet einen gescannten/eingegebenen Ausweis-Code einem Pfluecker aus der
// (bereits geladenen, RLS-gefilterten) Liste zu. Gibt null zurueck, wenn der
// Code leer ist, zu keinem bekannten Pfluecker passt (fremder/beschaedigter
// QR-Code) oder - bei einer Datenanomalie - mehrfach vorkommt, statt
// stillschweigend die erste Übereinstimmung zu waehlen.
export function pflueckerZuAusweis(
  ausweisRoh: string,
  liste: PflueckerOption[],
): PflueckerOption | null {
  const gesucht = normalisiereAusweis(ausweisRoh);
  if (!gesucht) return null;

  const treffer = liste.filter((p) => normalisiereAusweis(p.ausweis) === gesucht);
  return treffer.length === 1 ? treffer[0] : null;
}
