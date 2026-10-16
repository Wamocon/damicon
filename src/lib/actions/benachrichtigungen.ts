"use server";

import { createClient } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";
import { ladeBenachrichtigungen, type BenachrichtigungListe } from "@/lib/data/benachrichtigungen";
import { istUuid } from "@/lib/utils";

// Die Glocke fragt und meldet per Server Action (kein eigener Endpunkt): angemeldet sein genuegt, denn es geht nur um die eigenen Zeilen, und die
// Zeilensicherheit der Tabelle laesst nichts anderes zu (Migration 20261208150000).

export async function holeBenachrichtigungen(): Promise<BenachrichtigungListe | null> {
  if (!(await getSessionProfile())) return null;
  return ladeBenachrichtigungen();
}

/** Markiert Hinweise als gelesen: bestimmte (Liste von Ids) oder alle eigenen ungelesenen ("alle"). Gibt zurueck, ob es gelang. */
export async function markiereBenachrichtigungenGelesen(auswahl: string[] | "alle"): Promise<boolean> {
  if (!(await getSessionProfile())) return false;
  const ids = auswahl === "alle" ? null : auswahl.filter(istUuid).slice(0, 100);
  if (ids !== null && ids.length === 0) return true;

  const supabase = await createClient();
  const abfrage = supabase.from("benachrichtigungen").update({ gelesen_am: new Date().toISOString() }).is("gelesen_am", null);
  const { error } = await (ids === null ? abfrage : abfrage.in("id", ids));
  if (error) {
    console.error("[damicon] Benachrichtigungen als gelesen markieren fehlgeschlagen:", error.message);
    return false;
  }
  return true;
}
