import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import {
  demoB2bKunden,
  demoPreislisten,
  type AuswahlZeile,
  type B2bKundeZeile,
  type PreislisteZeile,
} from "@/lib/domain/vorbestellungen";

// Buero-Verwaltung der Preislisten und Kundengruppen (Anforderung 5.1/5.2,
// Migration 20261011000000). Anders als ladePreislisten() (data/vorbestellungen.ts,
// nur aktive/gueltige Listen fuer die Kunden-/Buero-Anzeige im B2B-Portal)
// zeigt diese Ansicht ALLE Listen inklusive inaktiver und zukuenftiger, damit
// das Buero auch eine noch nicht gestartete oder bewusst deaktivierte Liste
// wiederfindet und bearbeiten kann.

export interface PreislistenUebersicht {
  quelle: Datenquelle;
  preislisten: PreislisteZeile[];
}

function demoPreislistenUebersicht(quelle: PreislistenUebersicht["quelle"] = "demo"): PreislistenUebersicht {
  return { quelle, preislisten: demoPreislisten };
}

export async function ladePreislistenVerwaltung(): Promise<PreislistenUebersicht> {
  if (!isSupabaseConfigured()) return demoPreislistenUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("preislisten")
    .select(
      `id, name, gueltig_ab, gueltig_bis, aktiv, kundengruppe,
       preislisten_positionen ( id, preis_tenge_kg, min_menge_kg, sorten ( name ) )`,
    )
    .order("gueltig_ab", { ascending: false });

  if (error || !data) return demoPreislistenUebersicht("fehler");

  return {
    quelle: "db",
    preislisten: data.map((p) => ({
      id: p.id,
      name: p.name,
      gueltigAb: p.gueltig_ab,
      gueltigBis: p.gueltig_bis,
      aktiv: p.aktiv,
      kundengruppe: p.kundengruppe,
      positionen: (p.preislisten_positionen ?? []).map((pos) => {
        const sorte = einsAus(pos.sorten);
        return {
          id: pos.id,
          sorte: sorte?.name ?? "-",
          preisTengeKg: Number(pos.preis_tenge_kg),
          minMengeKg: Number(pos.min_menge_kg),
        };
      }),
    })),
  };
}

export interface B2bKundenUebersicht {
  quelle: Datenquelle;
  kunden: B2bKundeZeile[];
}

function demoB2bKundenUebersicht(quelle: B2bKundenUebersicht["quelle"] = "demo"): B2bKundenUebersicht {
  return { quelle, kunden: demoB2bKunden };
}

export async function ladeB2bKundenMitGruppe(): Promise<B2bKundenUebersicht> {
  if (!isSupabaseConfigured()) return demoB2bKundenUebersicht();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("b2b_kunden")
    .select("id, name, kundengruppe")
    .order("name");

  if (error || !data) return demoB2bKundenUebersicht("fehler");

  return {
    quelle: "db",
    kunden: data.map((k) => ({ id: k.id, name: k.name, kundengruppe: k.kundengruppe })),
  };
}

export async function ladeSortenOptionenFuerPreisliste(): Promise<AuswahlZeile[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("sorten").select("id, name").order("name");
  return (data ?? []).map((s) => ({ id: s.id, label: s.name }));
}
