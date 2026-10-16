import { getSessionProfile, requireAal2Aktuell, type SessionProfile } from "@/lib/auth";
import type { Role } from "@/lib/rbac";
import { routing } from "@/i18n/routing";

// Gemeinsame Pruefung der Schnittstellen, die eine Datei oder ein Dokument an die Sitzung geben (Lieferplan, ЕСУТД-Export,
// Dokumente im Damicon-Layout). src/proxy.ts schliesst /api aus, deshalb prueft jeder dieser Handler Anmeldung, Recht und
// zweiten Faktor selbst. Der Handler ruft sitzungFuerRoute() auf; scripts/qualitaet/rechte.mjs kennt den Aufruf als Pruefung.

export function textAntwort(text: string, status: number): Response {
  return new Response(text, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
}

export interface RouteSitzung {
  profil: SessionProfile;
  /** Eine bekannte Oberflaechensprache aus ?sprache=, sonst Deutsch. */
  sprache: string;
  parameter: URLSearchParams;
}

/** Antwortet mit 401 ohne Anmeldung oder ohne aktuellen zweiten Faktor und mit 403 ohne Recht, sonst mit der Sitzung. */
export async function sitzungFuerRoute(request: Request, erlaubt: (rolle: Role) => boolean): Promise<RouteSitzung | Response> {
  const profil = await getSessionProfile();
  if (!profil) return textAntwort("Nicht angemeldet.", 401);
  if (!erlaubt(profil.role)) return textAntwort("Keine Berechtigung.", 403);
  try {
    await requireAal2Aktuell();
  } catch {
    return textAntwort("Zweiter Faktor erforderlich.", 401);
  }
  const parameter = new URL(request.url).searchParams;
  const gewuenscht = parameter.get("sprache") ?? "";
  const sprache = (routing.locales as readonly string[]).includes(gewuenscht) ? gewuenscht : routing.defaultLocale;
  return { profil, sprache, parameter };
}
