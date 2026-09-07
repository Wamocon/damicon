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
