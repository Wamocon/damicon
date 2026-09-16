import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { berechneTemperatursummen, saisonStart, type WetterTag } from "@/lib/domain/wetter";

// Wetteranbindung mit Temperatursummen-Heuristik (Anforderung 2.13). RLS
// (wetter_messungen_select_intern) laesst jede angemeldete Rolle lesen -
// dieselbe Grosszuegigkeit wie bei rotationsplan_eintraege, kein
// Kunden-/Personenbezug.

export interface WetterUebersicht {
  quelle: Datenquelle;
  tage: WetterTag[];
}

const demoTage: WetterTag[] = berechneTemperatursummen(
  Array.from({ length: 14 }, (_, i) => {
    const datum = new Date();
    datum.setDate(datum.getDate() - (13 - i));
    return {
      datum: datum.toISOString().slice(0, 10),
      tempMinC: 12 + Math.round(Math.sin(i / 2) * 3),
      tempMaxC: 24 + Math.round(Math.sin(i / 2) * 4),
      niederschlagMm: i % 5 === 0 ? 3.2 : 0,
    };
  }),
);

function demoUebersicht(quelle: WetterUebersicht["quelle"] = "demo"): WetterUebersicht {
  return { quelle, tage: demoTage };
}

export async function ladeWetterUebersicht(): Promise<WetterUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const start = saisonStart(new Date().getFullYear());
  const { data, error } = await supabase
    .from("wetter_messungen")
    .select("gemessen_am, temp_min_c, temp_max_c, niederschlag_mm, temperatursumme")
    .is("feldparzelle_id", null)
    .gte("gemessen_am", start)
    .order("gemessen_am", { ascending: true });

  if (error || !data) return demoUebersicht("fehler");

  return {
    quelle: "db",
    tage: data.map((t) => ({
      datum: t.gemessen_am,
      tempMinC: t.temp_min_c === null ? null : Number(t.temp_min_c),
      tempMaxC: t.temp_max_c === null ? null : Number(t.temp_max_c),
      niederschlagMm: t.niederschlag_mm === null ? null : Number(t.niederschlag_mm),
      temperatursumme: Number(t.temperatursumme ?? 0),
    })),
  };
}
