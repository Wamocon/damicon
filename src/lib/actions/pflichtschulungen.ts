"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";

// Anforderung 4.10: eine Teilnahme an einer Pflichtschulung erfassen. Ein
// Formularfeld, zwei Anwendungsfaelle: ohne profil_id im Formular ist es die
// eigene Selbstauskunft, mit profil_id einer fremden Person erfasst das
// Buero eine gemeinsame Praesenzschulung. requirePermission() prueft nur die
// grobe Berechtigungsstufe (schulungen:complete), die eigentliche
// Einschraenkung "eigene Zeile oder Buero" liegt in der RLS-Policy
// schulungsteilnahmen_insert_own (WITH CHECK).

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

export async function teilnahmeErfassen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("schulungen", "complete");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const schulungsvideoId = text(formData, "schulungsvideo_id");
  const fremdProfilId = text(formData, "profil_id");
  if (!schulungsvideoId) return fehler("fehler.eingabe");

  const zielProfilId = fremdProfilId || profil.id;

  const supabase = await createClient();
  const { error } = await supabase.from("schulungsteilnahmen").insert({
    schulungsvideo_id: schulungsvideoId,
    profil_id: zielProfilId,
    // Nur gesetzt, wenn tatsaechlich fuer eine andere Person erfasst wird -
    // eine Selbstauskunft traegt keinen separaten Erfasser.
    erfasst_von_profil_id: zielProfilId !== profil.id ? profil.id : null,
  });

  if (error) return dbFehler(error);

  aktualisiere(formData);
  return ok("ok.pflichtschulungTeilnahme");
}
