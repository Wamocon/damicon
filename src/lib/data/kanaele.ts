import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { demoKanaele, type KontaktkanalZeile } from "@/lib/domain/kanaele";
import type { Database } from "@/lib/database.types";

// Anforderung 5.6: RLS (kontaktkanaele_select_public/-intern) filtert bereits
// nach Anmeldestatus - anon sieht nur aktive Kanaele, jede angemeldete Rolle
// auch die noch nicht gepflegten Entwuerfe.

export interface KanaeleUebersicht {
  quelle: Datenquelle;
  kanaele: KontaktkanalZeile[];
}

function demoUebersicht(quelle: KanaeleUebersicht["quelle"] = "demo"): KanaeleUebersicht {
  return { quelle, kanaele: demoKanaele };
}

async function ladeMit(supabase: SupabaseClient<Database>): Promise<KanaeleUebersicht> {
  const { data, error } = await supabase
    .from("kontaktkanaele")
    .select("id, typ, bezeichnung, wert, aktiv, reihenfolge")
    .order("reihenfolge", { ascending: true });

  if (error || !data) return demoUebersicht("fehler");

  return {
    quelle: "db",
    kanaele: data.map((k) => ({
      id: k.id,
      typ: k.typ,
      bezeichnung: k.bezeichnung,
      wert: k.wert,
      aktiv: k.aktiv,
      reihenfolge: k.reihenfolge,
    })),
  };
}

// Fuer die Verwaltung im Dashboard (angemeldet, ohnehin schon dynamisch).
export async function ladeKanaele(): Promise<KanaeleUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();
  return ladeMit(await createClient());
}

// Fuer den oeffentlichen Seitenfuss: createPublicClient() liest keine
// cookies() - anders als createClient() zwingt das die Marketing-Seiten
// dadurch nicht in dynamisches Rendering (Next.js Dynamic APIs). RLS
// (kontaktkanaele_select_public) liefert ohnehin nur aktive Kanaele an anon.
export async function ladeOeffentlicheKanaele(): Promise<KanaeleUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();
  return ladeMit(createPublicClient());
}
