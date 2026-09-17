"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";
import type { Json } from "@/lib/database.types";

// Anforderung 4.10: eine Teilnahme an einer Pflichtschulung erfassen. Ein
// Formularfeld, zwei Anwendungsfaelle: ohne profil_id im Formular ist es die
// eigene Selbstauskunft, mit profil_id einer fremden Person erfasst das
// Buero eine gemeinsame Praesenzschulung. requirePermission() prueft nur die
// grobe Berechtigungsstufe (schulungen:complete), die eigentliche
// Einschraenkung "eigene Zeile oder Buero" liegt in der RLS-Policy
// schulungsteilnahmen_insert_own (WITH CHECK).
//
// WMC-Vibecode-Cleanup: anders als einarbeitung.ts (reine Selbstauskunft
// eines Pflueckers am eigenen Checklisten-Fortschritt, weiterhin bewusst ohne
// Protokollierung) faengt teilnahmeErfassen() jetzt einen audit_events-Eintrag
// ein - eine Pflichtschulung laesst sich auch vom Buero fuer eine fremde
// Person erfassen (erfasst_von_profil_id), das ist ein Vorgang mit
// Compliance-Bezug (Nachweis der Pflichtschulung), kein reiner
// Selbstauskunfts-Klick.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string | null,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "pflichtschulungen", ressourceId, metadata);
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
  const { data, error } = await supabase
    .from("schulungsteilnahmen")
    .insert({
      schulungsvideo_id: schulungsvideoId,
      profil_id: zielProfilId,
      // Nur gesetzt, wenn tatsaechlich fuer eine andere Person erfasst wird -
      // eine Selbstauskunft traegt keinen separaten Erfasser.
      erfasst_von_profil_id: zielProfilId !== profil.id ? profil.id : null,
    })
    .select("id")
    .single();

  if (error) return dbFehler(error);

  await protokolliere(profil, "pflichtschulung.teilnahme_erfasst", data.id, {
    schulungsvideo_id: schulungsvideoId,
    profil_id: zielProfilId,
    fuer_fremde_person: zielProfilId !== profil.id,
  });
  aktualisiere(formData);
  return ok("ok.pflichtschulungTeilnahme");
}
