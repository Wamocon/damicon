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
  if (alteRolle === "admin" && neueRolle !== "admin" && adminAnzahl <= 1) return "letzterAdmin";
  return null;
}
