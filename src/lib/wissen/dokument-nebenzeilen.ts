import type { SupabaseClient } from "@supabase/supabase-js";
import { entferneOriginal } from "@/lib/wissen/original";

// Alles, was zu einem Wissensdokument gehört, aber nicht in wissen_chunks steht, geht mit dem Dokument: beim Löschen eines Uploads
// (speicher-supabase.ts) und beim Entfernen in der Bestandspflege (speicher-bestandspflege.ts). Vorher stand die Aufzählung an beiden Stellen.
// Kommt eine weitere Tabelle je Dokument dazu (Schlüssel quelle_id), gehört sie in diese Liste und sonst nirgends hin.

/** Abgeleitete Tabellen mit einer Zeile je Dokument (quelle_id) und die Bezeichnung für das Protokoll. */
export const NEBENTABELLEN = [
  { tabelle: "wissen_qualitaet", name: "Qualitätswert" },
  { tabelle: "wissen_seiten_vermerk", name: "Seiten-Vermerk" },
  { tabelle: "wissen_seiten_nachtrag", name: "Nachgeladene Seiten" },
] as const;

/**
 * Entfernt die Nebenzeilen eines Dokuments und seine Original-PDF. Ein Fehler (zum Beispiel vor der Migration der Tabelle) wird nur protokolliert:
 * Er darf das Löschen des Dokuments nie aufhalten, das ist zu diesem Zeitpunkt schon geschehen.
 */
export async function entferneNebenzeilen(db: SupabaseClient, quelleId: string): Promise<void> {
  for (const { tabelle, name } of NEBENTABELLEN) {
    const { error } = await db.from(tabelle).delete().eq("quelle_id", quelleId);
    if (error) console.error(`[damicon] ${name} nicht entfernt:`, error.message);
  }
  await entferneOriginal(db, quelleId);
}
