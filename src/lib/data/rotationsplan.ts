import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  demoGesperrteBloecke,
  demoReihenblockOptionen,
  demoRotationsplan,
  type GesperrterBlock,
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
  /** Alle Bloecke mit laufender Wartezeitsperre, auch ohne Termin im Anzeigefenster. */
  gesperrteBloecke: GesperrterBlock[];
}

function demoUebersicht(quelle: RotationsplanUebersicht["quelle"] = "demo"): RotationsplanUebersicht {
  return { quelle, eintraege: demoRotationsplan, gesperrteBloecke: demoGesperrteBloecke };
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

  // Die Sperre gehoert dem Block, nicht dem Termin: ein gesperrter Block hat
  // gar keine neuen Termine, sein alter bleibt "geplant" (WMCNL-2300, 2388).
  // Das Ende der Sperre ist das spaeteste Freigabedatum einer Behandlung, die
  // noch nicht freigegeben wurde.
  const { data: gesperrtRoh } = await supabase
    .from("reihenbloecke")
    .select("id, code, pflanzenschutz_behandlungen ( freigabe_am, freigegeben )")
    .eq("status", "wartezeitgesperrt")
    .order("code");
  const gesperrteBloecke: GesperrterBlock[] = (gesperrtRoh ?? []).map((b) => {
    const offene = (b.pflanzenschutz_behandlungen ?? [])
      .filter((x) => !x.freigegeben)
      .map((x) => x.freigabe_am)
      .sort();
    return { id: b.id, code: b.code, freiAb: offene.length > 0 ? offene[offene.length - 1] : null };
  });
  const sperreJeBlock = new Map(gesperrteBloecke.map((b) => [b.id, b]));

  const eintraege: RotationsplanEintrag[] = data.map((row) => {
    const block = einsAus(row.reihenbloecke);
    const sorte = einsAus(block?.sorten);
    const brigade = einsAus(row.brigaden);
    const aufgabe = einsAus(row.pflueckaufgaben);
    const sperre = block ? sperreJeBlock.get(block.id) : undefined;
    const blockGesperrt = row.status === "geplant" && sperre !== undefined;
    return {
      id: row.id,
      reihenblockId: block?.id ?? "",
      reihenblockCode: block?.code ?? "-",
      sorteName: sorte?.name ?? null,
      brigadeName: brigade?.name ?? null,
      geplantFuer: row.geplant_fuer,
      intervallTage: row.intervall_tage,
      status: row.status,
      ueberfaellig: row.status === "geplant" && row.geplant_fuer < heute && !blockGesperrt,
      pflueckaufgabeCode: aufgabe?.code ?? null,
      blockGesperrt,
      sperreFreiAb: blockGesperrt ? (sperre?.freiAb ?? null) : null,
      vorgezogen: row.status === "erledigt" && row.geplant_fuer > heute,
    };
  });

  return { quelle: "db", eintraege, gesperrteBloecke };
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
