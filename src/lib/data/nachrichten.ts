import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { jeVorbestellung, type NachrichtZeile } from "@/lib/domain/nachrichten";
import { liesI18n, uebersetzt } from "@/lib/i18n-daten";

// Nachrichten je Vorbestellung (WMCNL-1472). Welche Verlaeufe zurueckkommen,
// entscheidet die Zeilensicherheit: wer die Vorbestellung sieht, sieht ihren
// Verlauf (Migration 20261207040000). Ohne Datenbank gibt es keine Nachrichten:
// ein erfundener Verlauf waere Irrefuehrung.

/** So viele Nachrichten holt die Ansicht hoechstens, die neuesten zuerst gekappt und dann je Vorbestellung wieder nach vorn sortiert. */
const GRENZE = 500;

export async function ladeNachrichten(): Promise<Record<string, NachrichtZeile[]>> {
  if (!isSupabaseConfigured()) return {};

  const supabase = await createClient();
  const sprache = await getLocale();
  const { data, error } = await supabase
    .from("vorbestellung_nachrichten")
    .select("id, vorbestellung_id, autor_name, autor_rolle, text, i18n, created_at, anonymisiert_am, anonymisiert_grund")
    .order("created_at", { ascending: false })
    .limit(GRENZE);
  if (error || !data) return {};

  return jeVorbestellung(
    data.map((n) => ({
      id: n.id,
      vorbestellungId: n.vorbestellung_id,
      autor: n.autor_name ?? "",
      rolle: n.autor_rolle ?? "",
      // Die Nachrichten sind unveraenderlich und nur zum Lesen: die Uebersetzung der gewaehlten Sprache steht gleich im Feld, ohne Uebersetzung das Original.
      text: uebersetzt(liesI18n(n.i18n), "text", sprache, n.text),
      erstelltAm: n.created_at,
      anonymisiertAm: n.anonymisiert_am,
      anonymisierungsgrund: n.anonymisiert_grund,
    })),
  );
}
