"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";

// Anforderung 2.12: ein Schritt der Kurzeinarbeitung wird abgehakt. Die
// eigentliche Einschraenkung auf die eigene pfluecker_id liegt in der
// RLS-Policy einarbeitung_fortschritt_insert_own, requirePermission prueft
// nur die grobe Berechtigungsstufe (schulungen:complete, nur Rolle picker).

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

export async function schrittAbhaken(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("schulungen", "complete");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const schrittId = text(formData, "schritt_id");
  if (!schrittId || !profil.pflueckerId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { error } = await supabase.from("einarbeitung_fortschritt").insert({
    pfluecker_id: profil.pflueckerId,
    schritt_id: schrittId,
  });

  // Schon abgehakt (unique pfluecker_id/schritt_id) ist kein Fehlerfall fuer
  // die Oberflaeche - ein zweiter Klick auf denselben Schritt bleibt ohne
  // Wirkung, nicht als Fehlermeldung sichtbar.
  if (error && error.code !== "23505") return dbFehler(error);

  aktualisiere(formData);
  return ok("ok.einarbeitungSchritt");
}
