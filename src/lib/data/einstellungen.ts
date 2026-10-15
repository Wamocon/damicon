import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einstellungen, einstellungStandard, type EinstellungDef, type EinstellungSchluessel } from "@/lib/einstellungen";

// Fachliche Einstellungen (Migration 20261208030000). Die Anwendung liest die Werte hier, nicht aus Konstanten.
//
// Rueckfall: Fehlt die Datenbank oder die Zeile, gilt der Standardwert aus src/lib/einstellungen.ts (derselbe wie der Startwert der Migration).
// Eine Einstellung, die in der Datenbank bewusst auf "nicht gesetzt" (null) steht, bleibt null: das heisst "keine Pruefung", nicht "Standard".

export interface EinstellungZeile {
  def: EinstellungDef;
  wert: number | null;
  /** Gespeicherte Quelle und Stand der Zeile in der Datenbank (nur mit Datenbank). */
  quelle: string | null;
  stand: string | null;
  aktualisiertAm: string | null;
  aktualisiertVon: string | null;
}

/** Alle Einstellungen mit Wert, einmal je Anfrage gelesen. */
export const ladeEinstellungen = cache(async (): Promise<EinstellungZeile[]> => {
  const standard = (def: EinstellungDef): EinstellungZeile => ({ def, wert: def.standard, quelle: null, stand: null, aktualisiertAm: null, aktualisiertVon: null });
  if (!isSupabaseConfigured()) return einstellungen.map(standard);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("betriebs_einstellungen")
    .select("schluessel, wert, quelle, stand, aktualisiert_am, aktualisiert_von"); // grenze: eine Zeile je Einstellung der Liste im Code (src/lib/einstellungen.ts), zweistellig
  if (error || !data) {
    console.error("[damicon] Einstellungen lesen fehlgeschlagen, Standardwerte gelten:", error?.message ?? "keine Daten");
    return einstellungen.map(standard);
  }

  const jeSchluessel = new Map(data.map((z) => [z.schluessel, z]));
  return einstellungen.map((def) => {
    const z = jeSchluessel.get(def.schluessel);
    if (!z) return standard(def);
    return {
      def,
      wert: z.wert === null ? null : Number(z.wert),
      quelle: z.quelle,
      stand: z.stand,
      aktualisiertAm: z.aktualisiert_am,
      aktualisiertVon: z.aktualisiert_von,
    };
  });
});

/** Wert einer Einstellung; null heisst "nicht gesetzt". */
export async function einstellungWert(schluessel: EinstellungSchluessel): Promise<number | null> {
  const alle = await ladeEinstellungen();
  const zeile = alle.find((z) => z.def.schluessel === schluessel);
  return zeile ? zeile.wert : einstellungStandard(schluessel);
}

export interface EinstellungVerlaufEintrag {
  id: string;
  schluessel: string;
  altWert: number | null;
  neuWert: number | null;
  grund: string | null;
  von: string;
  zeitpunkt: string;
}

/** Die letzten Aenderungen, neueste zuerst. Wer sie lesen darf, bestimmt die Zeilensicherheit (Buero). */
export async function ladeEinstellungenVerlauf(grenze = 30): Promise<EinstellungVerlaufEintrag[]> {
  if (!isSupabaseConfigured()) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("betriebs_einstellungen_verlauf")
    .select("id, schluessel, alt_wert, neu_wert, grund, geaendert_von, geaendert_am")
    .order("geaendert_am", { ascending: false })
    .limit(grenze);
  if (error || !data) {
    if (error) console.error("[damicon] Verlauf der Einstellungen lesen fehlgeschlagen:", error.message);
    return [];
  }

  const ids = [...new Set(data.map((z) => z.geaendert_von).filter((id): id is string => !!id))];
  const { data: personen } = ids.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", ids) : { data: [] as { id: string; full_name: string | null }[] };
  const namen = new Map((personen ?? []).map((p) => [p.id, p.full_name ?? ""]));

  return data.map((z) => ({
    id: z.id,
    schluessel: z.schluessel,
    altWert: z.alt_wert === null ? null : Number(z.alt_wert),
    neuWert: z.neu_wert === null ? null : Number(z.neu_wert),
    grund: z.grund,
    von: (z.geaendert_von ? namen.get(z.geaendert_von) : null) || "-",
    zeitpunkt: z.geaendert_am,
  }));
}
