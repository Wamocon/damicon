import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";

// Offene ESUTD-Meldefristen ueber alle Pfluecker (Migration 20261025000000) -
// eine eigene, schlanke Abfrage statt eines Auszugs aus
// ladePersonalUebersicht() (die dafuer Brigaden/Einsatzplan/Bedarf mitlaeden
// muesste): dieser Ausschnitt wird zusaetzlich vom Risiko-Radar im
// Compliance-Cockpit gebraucht, der keine der uebrigen Personal-Daten
// interessiert.

export interface OffeneEsutdFrist {
  id: string;
  pfluecker: string;
  meldefristAm: string;
}

export async function ladeOffeneEsutdFristen(): Promise<OffeneEsutdFrist[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("esutd_vertraege_mit_frist")
    .select("id, meldefrist_am, pfluecker ( name )")
    .eq("status", "offen")
    .not("meldefrist_am", "is", null)
    .order("meldefrist_am", { ascending: true });

  if (error || !data) return [];

  return data
    // id/meldefrist_am sind in der Basistabelle not null, die Sicht markiert
    // Spalten grundsaetzlich als nullable im generierten Typ.
    .filter(
      (row): row is typeof row & { id: string; meldefrist_am: string } =>
        row.id !== null && row.meldefrist_am !== null,
    )
    .map((row) => ({
      id: row.id,
      pfluecker: einsAus(row.pfluecker)?.name ?? "-",
      meldefristAm: row.meldefrist_am,
    }));
}
