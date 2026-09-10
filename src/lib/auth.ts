import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { hasPermission, roles, type Action, type Resource, type Role } from "@/lib/rbac";

// Angemeldeter Nutzer inklusive Damicon-Profil. Die Rolle kommt aus
// public.profiles und ist zugleich die Rolle, gegen die die RLS-Policies in der
// Datenbank pruefen (public.current_app_role()).
export interface SessionProfile {
  id: string;
  authUserId: string;
  fullName: string;
  email: string | null;
  role: Role;
  brigadeId: string | null;
  /** B2B-Kunde einer "kunde"-Anmeldung (WMCNL-1455) - null fuer alle anderen Rollen. */
  b2bKundeId: string | null;
  /** Pfluecker-Stammsatz einer "picker"-Anmeldung (Anforderung 7.1/2.12) - null fuer alle anderen Rollen. */
  pflueckerId: string | null;
}

// `cache` dedupliziert den Aufruf innerhalb eines Requests - Layout, Seite und
// Server Action lesen dieselbe Session ohne Mehrfachabfrage.
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  // getUser() statt getSession(): validiert das Token gegen den Auth-Server.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, brigade_id, b2b_kunde_id, pfluecker_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!data) return null;

  const role = (roles as readonly string[]).includes(data.role)
    ? (data.role as Role)
    : "kunde";

  return {
    id: data.id,
    authUserId: user.id,
    fullName: data.full_name,
    email: data.email ?? user.email ?? null,
    role,
    brigadeId: data.brigade_id,
    b2bKundeId: data.b2b_kunde_id,
    pflueckerId: data.pfluecker_id,
  };
});

// Fuer Server Actions: Session holen und Berechtigung pruefen. Wirft, statt
// still nichts zu tun - die RLS-Policy ist die zweite Verteidigungslinie.
export async function requirePermission(
  resource: Resource,
  action: Action,
): Promise<SessionProfile> {
  const profil = await getSessionProfile();
  if (!profil) {
    throw new Error("nicht-angemeldet");
  }
  if (!hasPermission(profil.role, resource, action)) {
    throw new Error("keine-berechtigung");
  }
  return profil;
}

// Anforderung 2.5: fuer den Sync-Endpunkt (src/app/api/sync/route.ts).
// src/proxy.ts schuetzt den gesamten /dashboard-Baum inklusive
// AAL2-Weiterleitung, aber sein config.matcher schliesst /api ausdruecklich
// aus - ein Route Handler bekaeme sonst ueberhaupt keine AAL2-Pruefung,
// obwohl er dieselben schreibenden Kernfunktionen aufruft wie die
// Formulare. Dieselbe Pruefung wie dort, hier als eigene Funktion, weil ein
// Route Handler kein Redirect zurueckgeben soll, sondern einen Fehlerstatus.
export async function requireAal2Aktuell(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  const mfaOffen = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;
  if (mfaOffen) {
    throw new Error("mfa-erforderlich");
  }
}
