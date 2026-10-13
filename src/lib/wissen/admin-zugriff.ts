import type { SupabaseClient } from "@supabase/supabase-js";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Zugriff auf die Verwaltung der Wissensbasis: eine Stelle für das, was die Server Actions der Wissensbasis (wissen.ts, wissen-bestandspflege.ts,
// wissen-original.ts) und der Assistent vorher je selbst schrieben. Reine Hilfsfunktionen, keine Server Actions (eine "use server"-Datei darf nur
// asynchrone Funktionen ausführen lassen; diese Datei wird nur von dort importiert).

/**
 * Die angemeldete Person, wenn sie die Wissensbasis verwalten darf (ki_assistent:manage, laut rbac.ts nur die Administration), sonst null.
 * Die Prüfung läuft immer auf dem Server, nie nur in der Oberfläche.
 */
export async function verwaltungsProfil(): Promise<SessionProfile | null> {
  try {
    return await requirePermission("ki_assistent", "manage");
  } catch {
    return null;
  }
}

/**
 * Der Dienst-Client (service_role) für die Wissensbasis. Er umgeht die Zeilensicherheit: Aufrufen darf man ihn erst nach der Rechteprüfung
 * (verwaltungsProfil oder requirePermission). Der Cast steht nur hier, weil die generierten Typen die Wissensbasis-Tabellen nicht kennen.
 */
export function dienstClient(): SupabaseClient {
  return createServiceRoleClient() as unknown as SupabaseClient;
}
