import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoSorten,
  demoVerfuegbarkeit,
  type SorteZeile,
  type VerfuegbarkeitZeile,
} from "@/lib/domain/sortenkatalog";

// Sorten- und Kontingentkatalog. Die Kontingent-Verwaltung selbst (Zeilen je
// Kunde/Sorte/Saison) nutzt bewusst ladeKontingente() aus data/vorbestellungen.ts
// weiter - RLS (kontingente_select_kunde_buero) liefert dem Buero ohnehin
// bereits alle Zeilen, eine zweite, fast identische Loader-Funktion waere
// reine Duplikation.

export interface SortenUebersicht {
  quelle: Datenquelle;
  sorten: SorteZeile[];
}

function demoSortenUebersicht(quelle: SortenUebersicht["quelle"] = "demo"): SortenUebersicht {
  return { quelle, sorten: demoSorten };
}

export async function ladeSorten(): Promise<SortenUebersicht> {
  if (!isSupabaseConfigured()) return demoSortenUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sorten")
    .select("id, name, typ, erntefenster, schale_g")
    .order("name");

  if (error || !data) return demoSortenUebersicht("fehler");

  return {
    quelle: "db",
    sorten: data.map((s) => ({
      id: s.id,
      name: s.name,
      typ: s.typ,
      erntefenster: s.erntefenster,
      schaleG: s.schale_g,
    })),
  };
}

export interface VerfuegbarkeitUebersicht {
  quelle: Datenquelle;
  zeilen: VerfuegbarkeitZeile[];
}

function demoVerfuegbarkeitUebersicht(
  quelle: VerfuegbarkeitUebersicht["quelle"] = "demo",
): VerfuegbarkeitUebersicht {
  return { quelle, zeilen: demoVerfuegbarkeit };
}

export async function ladeVerfuegbarkeit(): Promise<VerfuegbarkeitUebersicht> {
  if (!isSupabaseConfigured()) return demoVerfuegbarkeitUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("kontingent_verfuegbarkeit_je_sorte");

  if (error || !data) return demoVerfuegbarkeitUebersicht("fehler");

  return {
    quelle: "db",
    zeilen: data.map((z) => ({
      sorteId: z.sorte_id,
      sorte: z.sorte_name,
      saison: z.saison,
      mengeKgGesamt: Number(z.menge_kg_gesamt),
      reserviertKgGesamt: Number(z.reserviert_kg_gesamt),
    })),
  };
}
