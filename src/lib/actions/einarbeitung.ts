"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere } from "@/lib/actions/formular-helfer";

// Anforderung 2.12: ein Schritt der Kurzeinarbeitung wird abgehakt. Die
// eigentliche Einschraenkung auf die eigene pfluecker_id liegt in der
// RLS-Policy einarbeitung_fortschritt_insert_own, requirePermission prueft
// nur die grobe Berechtigungsstufe (schulungen:complete, nur Rolle picker).
//
// WMC-Vibecode-Cleanup: kein protokolliere()-Aufruf, diese Datei loggt
// bislang keine audit_events (anders als die meisten Schreibaktionen im
// Projekt). Bewusst nicht in diesem Durchgang nachgezogen, da eine neue
// Protokollierungspflicht eine fachliche Entscheidung ist (Grundprinzip 6),
// keine mechanische - siehe Abschlussbericht.

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
