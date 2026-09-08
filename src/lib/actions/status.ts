import type { PostgrestError } from "@supabase/supabase-js";

// Einheitlicher Rueckgabewert aller Server Actions. `meldung` ist ein
// Uebersetzungsschluessel unterhalb des Namespaces "aktionen", damit die
// Oberflaeche in allen fuenf Sprachen antwortet.
export interface AktionsStatus {
  stand: "leer" | "ok" | "fehler";
  meldung?: string;
  /** Zusatzangabe fuer Meldungen mit Platzhalter, z. B. der Blockcode. */
  wert?: string;
}

export const leer: AktionsStatus = { stand: "leer" };

export function ok(meldung: string, wert?: string): AktionsStatus {
  return { stand: "ok", meldung, wert };
}

export function fehler(meldung: string, wert?: string): AktionsStatus {
  return { stand: "fehler", meldung, wert };
}

// Datenbankfehler auf sprechende Schluessel abbilden. Der Rohtext bleibt im
// Server-Log; die Oberflaeche zeigt eine uebersetzte Meldung.
export function dbFehler(error: PostgrestError | { code?: string; message: string }): AktionsStatus {
  console.error("[damicon] Schreibvorgang fehlgeschlagen:", error.message);

  switch (error.code) {
    case "42501":
      // Keine passende RLS-Policy - die Rolle darf hier nicht schreiben.
      return fehler("fehler.berechtigung");
    case "23505":
      return fehler("fehler.doppelt");
    case "23503":
      return fehler("fehler.bezug");
    case "23514":
    case "P0001":
      // Eigene raise-Bedingungen, u. a. die Wartezeitsperre.
      return fehler("fehler.regel");
    case "DA001":
      // geraet_zeitpunkt_pruefen() (Anforderung 2.6): Geraete-Zeitstempel
      // unplausibel (Zukunft oder > 24h Abweichung vom Servereingang).
      return fehler("fehler.geraetezeit");
    default:
      return fehler("fehler.unbekannt");
  }
}

// Fehler aus requirePermission() bzw. fehlender Session.
export function zugriffsFehler(error: unknown): AktionsStatus {
  const nachricht = error instanceof Error ? error.message : String(error);
  if (nachricht === "nicht-angemeldet") return fehler("fehler.angemeldet");
  if (nachricht === "keine-berechtigung") return fehler("fehler.berechtigung");
  console.error("[damicon] Aktion fehlgeschlagen:", nachricht);
  return fehler("fehler.unbekannt");
}
