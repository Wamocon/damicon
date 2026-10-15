import { requirePermission, type SessionProfile } from "@/lib/auth";
import { zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import type { Action, Resource } from "@/lib/rbac";

// Die erste Verteidigungslinie jeder Server Action: Anmeldung und Recht pruefen, Fehler als Status zurueckgeben statt zu werfen. Bis zum 15.10.2026 stand
// diese Funktion sechsmal fast wortgleich in den Aktionsdateien (esutd, esf, foerder-checkliste, abholrunden, wirtschaftlichkeit, integration-auslieferung).

/** Entweder das Profil der angemeldeten Person oder der fertige Fehlerstatus fuer die Oberflaeche. */
export type Zugriff = { profil: SessionProfile } | { status: AktionsStatus };

export async function mitRecht(ressource: Resource, aktion: Action): Promise<Zugriff> {
  try {
    return { profil: await requirePermission(ressource, aktion) };
  } catch (error) {
    return { status: zugriffsFehler(error) };
  }
}
