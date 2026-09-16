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
