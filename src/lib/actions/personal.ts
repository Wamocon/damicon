"use server";

import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import type { Json } from "@/lib/database.types";
import { text, aktualisiere, protokolliere as protokolliereBasis } from "@/lib/actions/formular-helfer";

// Brigadenplanung (Anforderung 2.11): Reserveliste schliessen - einen
// Pfluecker ohne aktuelle Brigadenzuordnung (brigade_id is null, siehe
// Migrationskopf 20260927000000) einer Brigade zuweisen. RLS
// (pfluecker_update_leitung) ist die zweite Verteidigungslinie.

function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string,
  metadata: Record<string, Json> = {},
) {
  return protokolliereBasis(profil, aktion, "personal", ressourceId, metadata);
}

export async function pfleuckerBrigadeZuweisen(
  _status: AktionsStatus,
  formData: FormData,
): Promise<AktionsStatus> {
  let profil: SessionProfile;
  try {
    profil = await requirePermission("personal", "update");
  } catch (error) {
    return zugriffsFehler(error);
  }

  const id = text(formData, "id");
  const brigadeId = text(formData, "brigade_id");
  if (!id || !brigadeId) return fehler("fehler.eingabe");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pfluecker")
    .update({ brigade_id: brigadeId })
    .eq("id", id)
    .select("id, name")
    .maybeSingle();

  if (error) return dbFehler(error);
  if (!data) return fehler("fehler.nichtGefunden");

  await protokolliere(profil, "personal.brigade_zugewiesen", data.id, { brigade_id: brigadeId });
  aktualisiere(formData);
  return ok("ok.pfleuckerBrigadeZugewiesen", data.name);
}
