import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus, heuteIso } from "@/lib/data/util";
import { demoBehandlungen, type BehandlungZeile } from "@/lib/domain/pflanzenschutz";

// Pflanzenschutz-Protokoll (Anforderung 2.4). Bis hierher zeigte das Modul
// "pflanzenschutz" dieselbe Reihenbloecke-Ansicht wie das Nachbarmodul: dort
// steht der Block im Mittelpunkt und traegt hoechstens seine juengste offene
// Sperre. Eine Behandlung, die laengst freigegeben ist, war damit nirgends
// mehr sichtbar - fuer den Nachweis gegenueber Handel und Behoerde aber genau
// das Gefragte. Diese Abfrage liest die Behandlungen selbst.

export interface BehandlungListe {
  quelle: Datenquelle;
  behandlungen: BehandlungZeile[];
  offen: number;
}

function demoListe(quelle: BehandlungListe["quelle"] = "demo"): BehandlungListe {
  return {
    quelle,
    behandlungen: demoBehandlungen,
    offen: demoBehandlungen.filter((b) => b.gesperrt).length,
  };
}

export async function ladeBehandlungen(): Promise<BehandlungListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pflanzenschutz_behandlungen")
    .select(
      `id, behandelt_am, wartezeit_tage, freigabe_am, freigegeben, dokument_id,
       aufwandmenge, aufwandmenge_einheit,
       reihenbloecke ( code ),
       psm_mittel ( name, wirkstoff ),
       profiles ( full_name )`,
    )
    .order("behandelt_am", { ascending: false })
    .limit(200);

  if (error || !data) return demoListe("fehler");

  const heute = heuteIso();

  const behandlungen: BehandlungZeile[] = data.map((row) => {
    const mittel = einsAus(row.psm_mittel);
    const freigabeAm = row.freigabe_am as string;
    return {
      id: row.id,
      reihenblock: einsAus(row.reihenbloecke)?.code ?? "",
      mittel: mittel?.name ?? "",
      wirkstoff: mittel?.wirkstoff ?? null,
      behandeltAm: row.behandelt_am,
      wartezeitTage: row.wartezeit_tage,
      freigabeAm,
      freigegeben: row.freigegeben,
      gesperrt: !row.freigegeben && freigabeAm > heute,
      aufwandmenge: row.aufwandmenge === null ? null : Number(row.aufwandmenge),
      aufwandmengeEinheit: row.aufwandmenge_einheit,
      durchgefuehrtVon: einsAus(row.profiles)?.full_name ?? null,
      hatProtokoll: Boolean(row.dokument_id),
    };
  });

  return {
    quelle: "db",
    behandlungen,
    offen: behandlungen.filter((b) => b.gesperrt).length,
  };
}
