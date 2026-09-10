import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { betrieb as demoBetrieb } from "@/lib/domain/hierarchy";
import { einsAus } from "@/lib/data/util";

// Standort-Hierarchie aus der Datenbank (Meilenstein B). Ohne Supabase-Umgebung
// faellt die Funktion auf die Beispieldaten aus src/lib/domain/hierarchy.ts
// zurueck, damit der Prototyp ohne Datenbank startbar bleibt.

export interface ReihengruppeKnoten {
  id: string;
  name: string;
  spalierrichtung: "n_s" | "o_w";
  reihenbloecke: number;
}

export interface ParzelleKnoten {
  id: string;
  name: string;
  flaecheHa: number;
  sorte: string;
  reihengruppen: ReihengruppeKnoten[];
}

export interface PlantageKnoten {
  id: string;
  name: string;
  ort: string;
  typ: "eigen" | "nachbarbetrieb";
  parzellen: ParzelleKnoten[];
}

export interface StandortBaum {
  quelle: Datenquelle;
  betriebName: string;
  betriebId: string | null;
  plantagen: PlantageKnoten[];
  stats: {
    plantagen: number;
    parzellen: number;
    reihengruppen: number;
    reihenbloecke: number;
    flaecheHa: number;
  };
}

export interface SortenOption {
  id: string;
  name: string;
}

function statsAus(plantagen: PlantageKnoten[]): StandortBaum["stats"] {
  const parzellen = plantagen.flatMap((p) => p.parzellen);
  const reihengruppen = parzellen.flatMap((p) => p.reihengruppen);
  return {
    plantagen: plantagen.length,
    parzellen: parzellen.length,
    reihengruppen: reihengruppen.length,
    reihenbloecke: reihengruppen.reduce((s, rg) => s + rg.reihenbloecke, 0),
    flaecheHa: parzellen.reduce((s, p) => s + p.flaecheHa, 0),
  };
}

function demoBaum(quelle: StandortBaum["quelle"] = "demo"): StandortBaum {
  const plantagen: PlantageKnoten[] = demoBetrieb.plantagen.map((plantage) => ({
    id: plantage.id,
    name: plantage.name,
    ort: plantage.ort,
    typ: plantage.typ,
    parzellen: plantage.parzellen.map((parzelle) => ({
      id: parzelle.id,
      name: parzelle.name,
      flaecheHa: parzelle.flaecheHa,
      sorte: parzelle.sorte,
      reihengruppen: parzelle.reihengruppen.map((rg) => ({
        id: rg.id,
        name: rg.name,
        spalierrichtung: rg.spalierrichtung,
        reihenbloecke: rg.reihenbloecke,
      })),
    })),
  }));

  return {
    quelle,
    betriebName: demoBetrieb.name,
    betriebId: null,
    plantagen,
    stats: statsAus(plantagen),
  };
}

export async function ladeStandortBaum(): Promise<StandortBaum> {
  if (!isSupabaseConfigured()) return demoBaum();

  const supabase = await createClient();

  const [{ data: betriebe }, { data: plantagenRoh, error }] = await Promise.all([
    supabase.from("betriebe").select("id, name").order("name").limit(1),
    supabase
      .from("plantagen")
      .select(
        `id, name, ort, typ,
         feldparzellen (
           id, name, flaeche_ha,
           sorten ( name ),
           reihengruppen (
             id, name, spalierrichtung,
             reihenbloecke ( id )
           )
         )`,
      )
      .order("name"),
  ]);

  // Bei einem Lesefehler lieber die Beispieldaten zeigen als eine leere
  // Seite - aber ausdruecklich als Fehler gekennzeichnet, nicht als Demo.
  if (error || !plantagenRoh) return demoBaum("fehler");

  const plantagen: PlantageKnoten[] = plantagenRoh.map((plantage) => ({
    id: plantage.id,
    name: plantage.name,
    ort: plantage.ort ?? "",
    typ: plantage.typ,
    parzellen: (plantage.feldparzellen ?? [])
      .map((parzelle) => ({
        id: parzelle.id,
        name: parzelle.name,
        flaecheHa: Number(parzelle.flaeche_ha ?? 0),
        sorte: einsAus(parzelle.sorten)?.name ?? "",
        reihengruppen: (parzelle.reihengruppen ?? [])
          .map((rg) => ({
            id: rg.id,
            name: rg.name,
            spalierrichtung: (rg.spalierrichtung === "o_w" ? "o_w" : "n_s") as
              | "n_s"
              | "o_w",
            reihenbloecke: (rg.reihenbloecke ?? []).length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  }));

  const betrieb = betriebe?.[0];

  return {
    quelle: "db",
    betriebName: betrieb?.name ?? demoBetrieb.name,
    betriebId: betrieb?.id ?? null,
    plantagen,
    stats: statsAus(plantagen),
  };
}

export async function ladeSorten(): Promise<SortenOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("sorten").select("id, name").order("name");
  return data ?? [];
}
