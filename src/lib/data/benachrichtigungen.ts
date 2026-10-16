import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ANZEIGE_MAX, istBenachrichtigungArt, leseParameter, type BenachrichtigungEintrag } from "@/lib/domain/benachrichtigungen";

// Die Hinweise der angemeldeten Person (Migration 20261208150000). Die Zeilensicherheit zeigt nur die eigenen Zeilen; hier steht nichts, was das ersetzt.

export interface BenachrichtigungListe {
  eintraege: BenachrichtigungEintrag[];
  /** Alle ungelesenen, auch die, die das Fenster nicht mehr zeigt. */
  ungelesen: number;
}

/** Ohne Datenbank oder bei einem Fehler: null (die Glocke zeigt dann ihren Leerzustand, kein erfundener Inhalt). */
export async function ladeBenachrichtigungen(): Promise<BenachrichtigungListe | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const [liste, zaehler] = await Promise.all([
    supabase.from("benachrichtigungen").select("id, art, modul, parameter, erstellt_am, gelesen_am").order("erstellt_am", { ascending: false }).limit(ANZEIGE_MAX),
    supabase.from("benachrichtigungen").select("id", { count: "exact", head: true }).is("gelesen_am", null),
  ]);
  if (liste.error || zaehler.error) {
    console.error("[damicon] Benachrichtigungen lesen fehlgeschlagen:", (liste.error ?? zaehler.error)?.message);
    return null;
  }
  return {
    eintraege: (liste.data ?? []).flatMap((z) =>
      istBenachrichtigungArt(z.art)
        ? [{ id: z.id, art: z.art, modul: z.modul, parameter: leseParameter(z.parameter), erstelltAm: z.erstellt_am, gelesen: z.gelesen_am !== null }]
        : [],
    ),
    ungelesen: zaehler.count ?? 0,
  };
}
