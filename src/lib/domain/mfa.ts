// Typ und Leerzustand fuer den MFA-Enrollment-Ablauf (Anforderung 4.9).
// Eigene, kleine Datei ohne "use server": src/lib/actions/mfa.ts traegt die
// Direktive und darf deshalb ausschliesslich async Funktionen exportieren -
// ein Objektexport wie ein Leerzustand wuerde den Build brechen (siehe
// src/lib/auth-nav.ts fuer denselben Grund bei den Login-Hilfsfunktionen).

export interface MfaEnrollStatus {
  schritt: "start" | "qr" | "fertig";
  fehler?: string;
  faktorId?: string;
  qrCodeSvg?: string;
  secret?: string;
}

export const mfaEnrollLeer: MfaEnrollStatus = { schritt: "start" };

// WMC-Vibecode-Cleanup: dieselbe Bedingung stand wortgleich in src/proxy.ts
// (Redirect zur Challenge-Seite) und src/lib/auth.ts::requireAal2Aktuell()
// (Fehlerstatus fuer den Sync-Endpunkt). Absichtlich als reine, importfreie
// Funktion hier statt in einer der beiden Dateien: proxy.ts laeuft in der
// Edge-Middleware und darf keine Node-lastigen Importe (z. B. ueber
// @/lib/auth -> @/lib/supabase/server) mitziehen, waehrend beide Aufrufer
// nach der Pruefung unterschiedlich reagieren muessen (Redirect vs. throw)
// und deshalb nicht selbst zusammengelegt werden koennen.
export function mfaHerausforderungOffen(
  aal: { currentLevel: string | null; nextLevel: string | null } | null,
): boolean {
  return !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
}
