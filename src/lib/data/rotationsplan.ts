import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoReihenblockOptionen,
  demoRotationsplan,
  type ReihenblockOption,
  type RotationsplanEintrag,
} from "@/lib/domain/rotationsplan";
import { einsAus, heuteIso } from "@/lib/data/util";

// Rotationsplan (Anforderung 2.2, P1). Wie bei ladeReihenbloecke(): die
// Sperr-/Entsperr-/Erledigen-Logik steht vollstaendig in der Datenbank
// (Migration 20260910000000), diese Datei liest nur das Ergebnis und rechnet
// "ueberfaellig" aus dem aktuellen Datum - kein eigener Fachzustand.

export interface RotationsplanUebersicht {
  quelle: Datenquelle;
  eintraege: RotationsplanEintrag[];
}

function demoUebersicht(quelle: RotationsplanUebersicht["quelle"] = "demo"): RotationsplanUebersicht {
  return { quelle, eintraege: demoRotationsplan };
}

export async function ladeRotationsplan(): Promise<RotationsplanUebersicht> {
  if (!isSupabaseConfigured()) return demoUebersicht();

  const supabase = await createClient();
  const heute = heuteIso();

  // Anzeigefenster bewusst enger als der Erzeugungshorizont (der Erzeuger
  // plant bis zu 12 Wochen voraus): eine Woche zurueck, damit ueberfaellige
  // bzw. gerade erledigte Termine noch sichtbar sind, zwei Wochen voraus.
  // Rotationsplanung ist ein Naharbeitsinstrument - bei realistischer
  // Blockzahl waeren sechs Wochen ohne Gruppierung/Paginierung eine
  // unlesbare Tabelle (bei sechs Demo-Bloecken allein schon rund 70 Zeilen).
  const vor = new Date();
  vor.setDate(vor.getDate() - 7);
  const bis = new Date();
  bis.setDate(bis.getDate() + 14);

  const { data, error } = await supabase
    .from("rotationsplan_eintraege")
    .select(
      `id, geplant_fuer, intervall_tage, status,
       reihenbloecke ( id, code, sorten ( name ) ),
       brigaden ( name ),
       pflueckaufgaben ( code )`,
    )
    .gte("geplant_fuer", vor.toISOString().slice(0, 10))
    .lte("geplant_fuer", bis.toISOString().slice(0, 10))
    .order("geplant_fuer", { ascending: true });

  if (error || !data) return demoUebersicht("fehler");

  const eintraege: RotationsplanEintrag[] = data.map((row) => {
    const block = einsAus(row.reihenbloecke);
    const sorte = einsAus(block?.sorten);
    const brigade = einsAus(row.brigaden);
    const aufgabe = einsAus(row.pflueckaufgaben);
    return {
      id: row.id,
      reihenblockId: block?.id ?? "",
      reihenblockCode: block?.code ?? "-",
      sorteName: sorte?.name ?? null,
      brigadeName: brigade?.name ?? null,
      geplantFuer: row.geplant_fuer,
      intervallTage: row.intervall_tage,
      status: row.status,
      ueberfaellig: row.status === "geplant" && row.geplant_fuer < heute,
      pflueckaufgabeCode: aufgabe?.code ?? null,
    };
  });

  return { quelle: "db", eintraege };
}

export async function ladeReihenblockOptionen(): Promise<ReihenblockOption[]> {
  if (!isSupabaseConfigured()) return demoReihenblockOptionen;
  const supabase = await createClient();
  const { data } = await supabase
    .from("reihenbloecke")
    .select("id, code")
    .in("status", ["bepflanzt", "erntereif"])
    .order("code");
  return (data ?? []).map((r) => ({ id: r.id, code: r.code }));
}
