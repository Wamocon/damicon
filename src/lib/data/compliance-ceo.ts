import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import type { BefundAenderung, Bericht } from "@/lib/pruefung/typen";

// Liest den automatischen CEO-Compliance-Bericht (compliance_ceo_berichte,
// Migration 20261108020000). RLS beschraenkt SELECT auf ceo/admin (has_role()),
// diese Funktion filtert selbst nicht zusaetzlich nach Rolle.

export interface CeoBerichtZeile {
  id: string;
  erstelltAm: string;
  quelle: "auto-login" | "manuell";
  bericht: Bericht;
  aenderungen: BefundAenderung[];
}

function zuZeile(data: {
  id: string;
  erstellt_am: string;
  quelle: string;
  bericht: unknown;
  aenderungen: unknown;
}): CeoBerichtZeile {
  return {
    id: data.id,
    erstelltAm: data.erstellt_am,
    quelle: data.quelle === "manuell" ? "manuell" : "auto-login",
    bericht: data.bericht as Bericht,
    aenderungen: Array.isArray(data.aenderungen) ? (data.aenderungen as BefundAenderung[]) : [],
  };
}

export async function letzterCeoBericht(): Promise<CeoBerichtZeile | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("compliance_ceo_berichte")
    .select("id, erstellt_am, quelle, bericht, aenderungen")
    .order("erstellt_am", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return zuZeile(data);
}
