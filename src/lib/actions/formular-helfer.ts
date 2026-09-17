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

export async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressource: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource,
    ressource_id: ressourceId,
    metadata,
  });
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
