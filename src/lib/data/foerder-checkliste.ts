import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { istVorschlagPunkt, type Checkpunkt } from "@/lib/domain/foerder-checkliste";

// Checklisten der Foerderdossiers (WMCNL-1448). Nur das Buero liest sie (Zeilensicherheit von
// foerder_checkpunkte). Ohne Datenbank gibt es keine Checklisten: eine erfundene Liste waere
// Irrefuehrung.

export async function ladeCheckpunkte(): Promise<Record<string, Checkpunkt[]>> {
  if (!isSupabaseConfigured()) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("foerder_checkpunkte")
    .select("id, dossier_id, vorlage_key, bezeichnung, pflicht, frist_am, erledigt_am, reihenfolge");
  if (error || !data) return {};

  const gruppen: Record<string, Checkpunkt[]> = {};
  for (const z of data) {
    (gruppen[z.dossier_id] ??= []).push({
      id: z.id,
      dossierId: z.dossier_id,
      vorlageKey: istVorschlagPunkt(z.vorlage_key) ? z.vorlage_key : null,
      bezeichnung: z.bezeichnung,
      pflicht: z.pflicht,
      fristAm: z.frist_am,
      erledigtAm: z.erledigt_am,
      reihenfolge: z.reihenfolge,
    });
  }
  return gruppen;
}
