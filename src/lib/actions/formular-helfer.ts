import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { SessionProfile } from "@/lib/auth";
import type { Json } from "@/lib/database.types";

// WMC-Vibecode-Cleanup-Fund: text(), zahl(), aktualisiere() und
// protokolliere() waren nahezu wortgleich einzeln in rund 20
// src/lib/actions/*.ts-Dateien nachgebaut. Byte-fuer-Byte-Vergleich vor der
// Zusammenfuehrung bestaetigt, dass text()/zahl()/aktualisiere() ueberall
// identisch waren, protokolliere() nutzt jetzt hier die Signatur mit
// explizitem ressource-Parameter (bisher nur in standort.ts so, sonst
// ueberall als String in der jeweiligen Funktion hartkodiert).

export function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

export function zahl(formData: FormData, feld: string): number | null {
  const roh = text(formData, feld).replace(",", ".");
  if (!roh) return null;
  const wert = Number(roh);
  return Number.isFinite(wert) ? wert : null;
}

export function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

/**
 * Schreibt einen Protokolleintrag und sagt, ob es gelang. Fuer Zugriffe, die ohne Eintrag nicht hinausgehen duerfen (zum Beispiel der Export von Namen
 * und Ausweisnummern): schlaegt es fehl, bricht der Aufrufer ab. protokolliere() dagegen bricht eine schon geschehene Aktion nicht ab.
 */
export async function protokolliereStreng(
  profil: SessionProfile,
  aktion: string,
  ressource: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
): Promise<boolean> {
  const supabase = await createClient();
  const { error } = await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource,
    ressource_id: ressourceId,
    metadata,
  });
  if (error) console.error(`[damicon] Protokolleintrag "${aktion}" fehlgeschlagen:`, error.message);
  return !error;
}

export async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressource: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  // Ein fehlender Protokolleintrag bricht die Aktion nicht ab (sie ist schon geschehen), darf aber nicht still bleiben: protokolliereStreng() meldet es im Log.
  await protokolliereStreng(profil, aktion, ressource, ressourceId, metadata);
}

// WMC-Vibecode-Cleanup-Fund: derselbe Datumsstempel-plus-Zufallssuffix-Code
// stand wortgleich (bis auf das Praefix) in reklamationen.ts und
// pflueckaufgaben.ts, beide mit Math.random().toString(36).slice(2, 6) - vier
// Zeichen im Basis-36-Alphabet, rund 1,68 Mio. Kombinationen je Tag. Beide
// Zielspalten (code) sind unique constraint, ein Insert bei einer Kollision
// haette ohne Wiederholung mit einem rohen 23505-Fehler abgebrochen. Acht
// Hex-Zeichen aus randomUUID() (rund 4,3 Mrd. Kombinationen je Tag) senken das
// Kollisionsrisiko deutlich, randomUUID() ist ausserdem bereits ueberall sonst
// im Projekt die etablierte Quelle fuer Zufalls-IDs (z. B. Sync-Warteschlange).
export function generiereTicketCode(praefix: string): string {
  const heute = new Date();
  const stempel = `${heute.getFullYear()}${String(heute.getMonth() + 1).padStart(2, "0")}${String(
    heute.getDate(),
  ).padStart(2, "0")}`;
  const zufall = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${praefix}-${stempel}-${zufall}`;
}
