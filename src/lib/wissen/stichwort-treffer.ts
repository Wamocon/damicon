import type { SupabaseClient } from "@supabase/supabase-js";

// Inhaltliche Stichwortprobe ueber die ganze Wissensbasis fuer die Verwaltung (Assistent): In welchen Dokumenten kommt ein Wort im Text oder
// im Titel vor, unabhaengig vom Bereich? Der Bereich ist nur ein Ordnungsetikett. Am 15.10.2026 schloss der Assistent aus "Bereich Risiko: 0 Dokumente",
// die Wissensbasis habe nichts zu Risikomanagement, obwohl ISO 31000 und COSO unter audit und legal standen. Diese Probe antwortet auf die Frage,
// die der Nutzer eigentlich stellt: Gibt es dazu etwas, egal wo es einsortiert ist?

const SEITE = 1000;
/** So viele Abschnitte werden hoechstens gelesen. Ein sehr haeufiges Wort (zum Beispiel "und") laeuft darueber: das Ergebnis ist dann als gekuerzt gekennzeichnet. */
const MAX_ABSCHNITTE = 6000;

/** Das Stichwort so, dass es unveraendert in einen Datenbankfilter passt: Kommas, Klammern, Prozentzeichen und Sternchen wuerden den Filter verändern. */
export function bereinigeStichwort(roh: string): string {
  return roh
    .normalize("NFC")
    .replace(/[^\p{L}\p{N} .:-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

export interface StichwortTreffer {
  /** Abschnitte mit dem Stichwort je Dokument (Kennung wie in der Liste: quelle_id, sonst pfad). */
  je: Map<string, number>;
  /** Das Lesen wurde bei MAX_ABSCHNITTE beendet: die Zahlen sind eine Untergrenze. */
  gekuerzt: boolean;
}

/** Zaehlt die Abschnitte mit dem Stichwort (Text oder Titel, ohne Beachtung der Gross- und Kleinschreibung) je Dokument. Wirft bei einem Datenbankfehler. */
export async function zaehleStichwortTreffer(db: SupabaseClient, stichwort: string): Promise<StichwortTreffer> {
  const wort = bereinigeStichwort(stichwort);
  const je = new Map<string, number>();
  if (wort.length < 3) return { je, gekuerzt: false };
  let gelesen = 0;
  for (let von = 0; von < MAX_ABSCHNITTE; von += SEITE) {
    const { data, error } = await db
      .from("wissen_chunks")
      .select("quelle_id, pfad")
      .or(`text.ilike.%${wort}%,titel.ilike.%${wort}%`)
      .order("id")
      .range(von, von + SEITE - 1);
    if (error) throw new Error(error.message);
    const zeilen = (data ?? []) as { quelle_id: string | null; pfad: string | null }[];
    for (const z of zeilen) {
      const k = z.quelle_id ?? z.pfad;
      if (k) je.set(k, (je.get(k) ?? 0) + 1);
    }
    gelesen += zeilen.length;
    if (zeilen.length < SEITE) return { je, gekuerzt: false };
  }
  return { je, gekuerzt: gelesen >= MAX_ABSCHNITTE };
}
