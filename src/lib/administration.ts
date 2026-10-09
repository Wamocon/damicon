import type { ZoneKey } from "./modules";
import { hasPermission, type Role } from "./rbac";

// Der Bereich Administration: eine eigene Gruppe in der Seitenleiste, nach den vier Zonen, mit aufklappbaren
// Unterseiten. Die Inhalte erscheinen wie jede Zonenseite im Hauptbereich der Seite. Vorher steckten KI-Anbieter,
// Ratenlimit und Wissensdokumente in den Einstellungen des KI-Seitenpanels, das fuer so viel Verwaltung zu schmal war.
//
// Bewusst KEINE fuenfte Zone in modules.ts: Die Zonen sind die Fachbereiche des Betriebs (Feld, Hof, Buero, Markt) und
// tragen die oeffentliche Seite, das Handbuch, die KI-Ziele und die Kennzahlen. Administration ist Verwaltung des
// Systems selbst, nur fuer eine Rolle sichtbar, und gehoert in keine dieser Listen. Navigation, Brotkrumen und
// Mobilmenue behandeln sie wie eine Zone, die Routen liegen unter /dashboard/administration.
//
// Sichtbar und erreichbar nur mit ki_assistent:manage (Rolle admin). Die Seiten pruefen das auf dem Server noch einmal,
// und jede Server Action dahinter prueft es selbst.

export const ADMINISTRATION = "administration" as const;
export type AdministrationKey = typeof ADMINISTRATION;

/** Eine Gruppe der Seitenleiste: eine der vier Zonen oder die Administration. */
export type BereichKey = ZoneKey | AdministrationKey;

export const ADMINISTRATION_SLUG = "administration";
export const ADMINISTRATION_ICON = "shield-check";
export const ADMINISTRATION_HREF = `/dashboard/${ADMINISTRATION_SLUG}`;

export type AdminSeiteKey = "ki-anbieter" | "ratenlimit" | "wissensbasis";

export interface AdminSeite {
  key: AdminSeiteKey;
  /** Letztes Pfadstueck: /dashboard/administration/<slug>. */
  slug: string;
  /** Name aus der Symbolablage (components/icon.tsx). */
  icon: string;
}

/** Reihenfolge wie im Menue. */
export const adminSeiten: readonly AdminSeite[] = [
  { key: "ki-anbieter", slug: "ki-anbieter", icon: "plug" },
  { key: "ratenlimit", slug: "ratenlimit", icon: "timer" },
  { key: "wissensbasis", slug: "wissensbasis", icon: "book-open" },
];

/** Darf die Rolle den Bereich Administration sehen? Dieselbe Regel wie die Verwaltung im KI-Panel bisher. */
export function darfAdministrieren(role: Role | null | undefined): boolean {
  return hasPermission(role, "ki_assistent", "manage");
}

export function adminSeiteBySlug(slug: string): AdminSeite | undefined {
  return adminSeiten.find((seite) => seite.slug === slug);
}

export function adminSeiteHref(seite: AdminSeite): string {
  return `${ADMINISTRATION_HREF}/${seite.slug}`;
}

/** Die Seiten, die eine Rolle sieht: alle oder keine, solange es eine Berechtigung fuer den ganzen Bereich gibt. */
export function sichtbareAdminSeiten(role: Role | null | undefined): readonly AdminSeite[] {
  return darfAdministrieren(role) ? adminSeiten : [];
}
