import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { jeVorbestellung, type NachrichtZeile } from "@/lib/domain/nachrichten";

// Nachrichten je Vorbestellung (WMCNL-1472). Welche Verlaeufe zurueckkommen,
// entscheidet die Zeilensicherheit: wer die Vorbestellung sieht, sieht ihren
// Verlauf (Migration 20261207040000). Ohne Datenbank gibt es keine Nachrichten:
// ein erfundener Verlauf waere Irrefuehrung.

/** So viele Nachrichten holt die Ansicht hoechstens, die neuesten zuerst gekappt und dann je Vorbestellung wieder nach vorn sortiert. */
const GRENZE = 500;

export async function ladeNachrichten(): Promise<Record<string, NachrichtZeile[]>> {
  if (!isSupabaseConfigured()) return {};

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vorbestellung_nachrichten")
    .select("id, vorbestellung_id, autor_name, autor_rolle, text, created_at")
    .order("created_at", { ascending: false })
    .limit(GRENZE);
  if (error || !data) return {};

  return jeVorbestellung(
    data.map((n) => ({
      id: n.id,
      vorbestellungId: n.vorbestellung_id,
      autor: n.autor_name ?? "",
      rolle: n.autor_rolle ?? "",
      text: n.text,
      erstelltAm: n.created_at,
    })),
  );
}
