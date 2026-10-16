import { roles, type Role } from "@/lib/rbac";

// Rollenzuweisung in der Oberflaeche (WMCNL-1441). Die Regeln, die vor dem
// Schreiben gelten; die Datenbank zieht dieselben Grenzen noch einmal
// (profil_rolle_schuetzen, profil_letzter_admin_schuetzen), damit auch ein
// Aufruf an der Anwendung vorbei sie nicht umgeht.

/**
 * Wer Rollen vergeben darf. Nicht ueber rbac.ts, sondern fest die Administration:
 * rbac gibt "rollen:assign" auch dem ceo, die Datenbank aber nur dem admin
 * (profil_rolle_schuetzen). Die Oberflaeche bietet nichts an, was die Datenbank
 * danach ablehnt.
 */
export function darfRollenVergeben(rolle: Role | null | undefined): boolean {
  return rolle === "admin";
}

/**
 * Auf diese Rollen laesst sich ein Konto setzen. "kunde" fehlt bewusst: ein
 * Kundenkonto gehoert zu einem B2B-Kunden und entsteht ueber eine Einladung,
 * eine Rolle allein macht aus einem Mitarbeitenden keinen Kunden.
 */
export const ZUWEISBARE_ROLLEN = roles.filter((r) => r !== "kunde");

export function istZuweisbareRolle(wert: unknown): wert is Role {
  return typeof wert === "string" && (ZUWEISBARE_ROLLEN as readonly string[]).includes(wert);
}

// --- Konten anlegen, sperren, Passwort (15.10.2026) -------------------------------------------------------------------------------

/** Rollen, fuer die die Administration ein Konto anlegt. Kundenkonten entstehen ueber Einladungen, nicht hier. */
export const ANLEGBARE_ROLLEN = ZUWEISBARE_ROLLEN;

export const KONTO_NAME_MIN = 2;
export const KONTO_NAME_MAX = 100;
export const PASSWORT_MIN = 12;
export const PASSWORT_MAX = 72;
export const SPERRGRUND_MIN = 3;
export const SPERRGRUND_MAX = 300;

export type KontoFehler = "kontoName" | "kontoEmail" | "kontoRolle";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Prueft die Angaben fuer ein neues Konto. */
export function kontoAnlageFehler(e: { name: string; email: string; rolle: string }): KontoFehler | null {
  const name = e.name.trim();
  if ([...name].length < KONTO_NAME_MIN || [...name].length > KONTO_NAME_MAX) return "kontoName";
  const email = e.email.trim();
  if (email.length > 254 || !EMAIL.test(email)) return "kontoEmail";
  if (!istZuweisbareRolle(e.rolle)) return "kontoRolle";
  return null;
}

export type PasswortFehler = "passwortKurz" | "passwortLang" | "passwortUngleich" | "passwortEinfach";

/** Mindestlaenge 12, hoechstens 72 Zeichen (Grenze von bcrypt im Auth-Dienst), beide Eingaben gleich, nicht die E-Mail-Adresse und nicht nur ein Zeichen. */
export function passwortFehler(neu: string, wiederholung: string, email: string | null): PasswortFehler | null {
  if ([...neu].length < PASSWORT_MIN) return "passwortKurz";
  if (new TextEncoder().encode(neu).length > PASSWORT_MAX) return "passwortLang";
  if (neu !== wiederholung) return "passwortUngleich";
  if ((email && neu.toLowerCase() === email.toLowerCase()) || new Set([...neu]).size < 4) return "passwortEinfach";
  return null;
}

export type SperrFehler = "eigeneSperre" | "letzterAdmin" | "sperrgrund";

/** Regeln vor dem Sperren oder Entsperren; die Datenbank zieht dieselben Grenzen noch einmal (konto_sperren, DA011). */
export function sperrFehler(e: {
  akteurProfilId: string;
  zielProfilId: string;
  zielRolle: Role;
  zielGesperrt: boolean;
  sperren: boolean;
  grund: string;
  /** Aktive (nicht gesperrte) Konten mit der Rolle admin, einschliesslich des Ziels. */
  aktiveAdmins: number;
}): SperrFehler | null {
  if (e.akteurProfilId === e.zielProfilId) return "eigeneSperre";
  // Sperren und Entsperren sind idempotent: ein zweites Sperren aendert den Zeitpunkt nicht, schliesst aber nach einem Fehler beim Auth-Dienst die Sperre dort nach.
  if (e.sperren) {
    const laenge = [...e.grund.trim()].length;
    if (laenge < SPERRGRUND_MIN || laenge > SPERRGRUND_MAX) return "sperrgrund";
    if (e.zielRolle === "admin" && !e.zielGesperrt && e.aktiveAdmins <= 1) return "letzterAdmin";
  }
  return null;
}

/** Warum ein Wechsel abgelehnt wird; der Schluessel ist ein Text unter "aktionen.fehler". */
export type RollenFehler = "eingabe" | "eigeneRolle" | "kundenkonto" | "rolleUnveraendert" | "letzterAdmin";

export function pruefeRollenwechsel(wechsel: {
  /** Das Profil, das den Wechsel auslöst. */
  akteurProfilId: string;
  zielProfilId: string;
  alteRolle: Role;
  neueRolle: string;
  /** Konten mit der Rolle admin, einschliesslich des Ziels. */
  adminAnzahl: number;
}): RollenFehler | null {
  const { akteurProfilId, zielProfilId, alteRolle, neueRolle, adminAnzahl } = wechsel;
  if (akteurProfilId === zielProfilId) return "eigeneRolle";
  if (alteRolle === "kunde" || neueRolle === "kunde") return "kundenkonto";
  if (!istZuweisbareRolle(neueRolle)) return "eingabe";
  if (neueRolle === alteRolle) return "rolleUnveraendert";
  // adminAnzahl zaehlt nur aktive Administratoren (gesperrte Konten arbeiten nicht).
  if (alteRolle === "admin" && neueRolle !== "admin" && adminAnzahl <= 1) return "letzterAdmin";
  return null;
}
