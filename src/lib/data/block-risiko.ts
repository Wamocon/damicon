import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  istRisikoHauptgrund,
  istRisikoStufe,
  type BlockRisiko,
  type RisikoParameter,
} from "@/lib/domain/block-risiko";

// Block-Risiko-Bewertung (WMCNL-1470): die Sicht public.v_block_risiko und die Parameter, aus
// denen sie rechnet. Ohne Datenbank gibt es keine Bewertung: ein erfundener Punktwert waere
// schlimmer als keiner (die Ansicht blendet die Spalte dann aus).

export interface BlockRisikoStand {
  quelle: Datenquelle;
  /** Nach Id des Reihenblocks. */
  risiken: Record<string, BlockRisiko>;
  parameter: RisikoParameter[];
}

const LEER: BlockRisikoStand = { quelle: "demo", risiken: {}, parameter: [] };

export async function ladeBlockRisiko(): Promise<BlockRisikoStand> {
  if (!isSupabaseConfigured()) return LEER;

  const supabase = await createClient();
  const [sicht, parameter] = await Promise.all([
    supabase.from("v_block_risiko").select("*"),
    supabase.from("risiko_parameter").select("schluessel, wert, einheit, begruendung, standard_wert").order("schluessel"),
  ]);
  if (sicht.error || !sicht.data || parameter.error || !parameter.data) {
    return { quelle: "fehler", risiken: {}, parameter: [] };
  }

  const risiken: Record<string, BlockRisiko> = {};
  for (const z of sicht.data) {
    if (!z.reihenblock_id || !istRisikoStufe(z.risiko_stufe)) continue;
    risiken[z.reihenblock_id] = {
      blockId: z.reihenblock_id,
      punkte: Number(z.risiko_score ?? 0),
      stufe: z.risiko_stufe,
      hauptgrund: istRisikoHauptgrund(z.hauptgrund) ? z.hauptgrund : null,
      sperreKonflikt: z.sperre_konflikt ?? false,
      beitraege: {
        ueberfaellig: Number(z.beitrag_ueberfaellig ?? 0),
        sperre: Number(z.beitrag_sperre ?? 0),
        ausschuss: Number(z.beitrag_ausschuss ?? 0),
        kuehlkette: Number(z.beitrag_kuehlkette ?? 0),
        erfassung: Number(z.beitrag_erfassung ?? 0),
      },
    };
  }
  return {
    quelle: "db",
    risiken,
    parameter: parameter.data.map(parameterAusZeile),
  };
}

type ParameterZeile = { schluessel: string; wert: number | string; einheit: string; begruendung: string; standard_wert: number | string | null };

const parameterAusZeile = (p: ParameterZeile): RisikoParameter => ({
  schluessel: p.schluessel,
  wert: Number(p.wert),
  einheit: p.einheit,
  begruendung: p.begruendung,
  standard: p.standard_wert === null ? null : Number(p.standard_wert),
});

/** Nur die Parameter (ohne die Sicht), einmal je Anfrage gelesen: fuer die Pflege in den Einstellungen. Ohne Datenbank oder bei einem Fehler leer. */
export const ladeRisikoParameter = cache(async (): Promise<RisikoParameter[]> => {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  // grenze: vierzehn feste Schluessel (RISIKO_PARAMETER)
  const { data, error } = await supabase.from("risiko_parameter").select("schluessel, wert, einheit, begruendung, standard_wert");
  if (error || !data) {
    if (error) console.error("[damicon] Risiko-Parameter lesen fehlgeschlagen:", error.message);
    return [];
  }
  return data.map(parameterAusZeile);
});
