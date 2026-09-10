"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePermission, type SessionProfile } from "@/lib/auth";
import { dbFehler, fehler, ok, zugriffsFehler, type AktionsStatus } from "@/lib/actions/status";
import type { Json } from "@/lib/database.types";

// Brigadenplanung (Anforderung 2.11): Reserveliste schliessen - einen
// Pfluecker ohne aktuelle Brigadenzuordnung (brigade_id is null, siehe
// Migrationskopf 20260927000000) einer Brigade zuweisen. RLS
// (pfluecker_update_leitung) ist die zweite Verteidigungslinie.

function text(formData: FormData, feld: string): string {
  return String(formData.get(feld) ?? "").trim();
}

function aktualisiere(formData: FormData) {
  const pfad = text(formData, "pfad");
  if (pfad.startsWith("/")) revalidatePath(pfad);
}

async function protokolliere(
  profil: SessionProfile,
  aktion: string,
  ressourceId: string,
  metadata: Record<string, Json> = {},
) {
  const supabase = await createClient();
  await supabase.from("audit_events").insert({
    actor: `${profil.fullName} (${profil.role})`,
    aktion,
    ressource: "personal",
    ressource_id: ressourceId,
    metadata,
  });
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
