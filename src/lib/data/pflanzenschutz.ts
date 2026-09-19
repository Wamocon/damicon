import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus, heuteIso } from "@/lib/data/util";
import {
  demoBehandlungen,
  type BehandlungFilter,
  type BehandlungZeile,
} from "@/lib/domain/pflanzenschutz";

// Pflanzenschutz-Protokoll (Anforderung 2.4). Bis hierher zeigte das Modul
// "pflanzenschutz" dieselbe Reihenbloecke-Ansicht wie sein Nachbarmodul: dort
// steht der Block im Mittelpunkt und traegt hoechstens seine juengste offene
// Sperre. Eine Behandlung, die laengst freigegeben ist, war damit nirgends
// mehr sichtbar, fuer den Nachweis gegenueber Handel und Behoerde aber genau
// das Gefragte. Diese Abfrage liest die Behandlungen selbst.

/** Hoechstzahl der angezeigten Zeilen. Die Kennzahlen werden davon unabhaengig gezaehlt. */
const MAX_ZEILEN = 200;

export interface BehandlungListe {
  quelle: Datenquelle;
  /** Die neuesten Behandlungen (hoechstens MAX_ZEILEN), nach Filter. */
  behandlungen: BehandlungZeile[];
  /** Alle Behandlungen, unabhaengig von Filter und Kuerzung. */
  gesamt: number;
  /** Behandlungen mit laufender Wartezeit, ebenfalls ueber alle Zeilen gezaehlt. */
  laufend: number;
  /** Behandlungen ohne Protokolldokument, ebenfalls ueber alle Zeilen gezaehlt. */
  ohneProtokoll: number;
  /** Es gibt mehr Behandlungen als angezeigt werden (Filter angewendet). */
  gekuerzt: boolean;
  filter: BehandlungFilter;
}

function demoListe(
  filter: BehandlungFilter,
  quelle: BehandlungListe["quelle"] = "demo",
): BehandlungListe {
  const zeilen = demoBehandlungen.filter(
    (b) => filter === "alle" || (filter === "offen" ? !b.freigegeben : b.freigegeben),
  );
  return {
    quelle,
    behandlungen: zeilen,
    gesamt: demoBehandlungen.length,
    laufend: demoBehandlungen.filter((b) => b.wartezeitLaeuft).length,
    ohneProtokoll: demoBehandlungen.filter((b) => !b.hatProtokoll).length,
    gekuerzt: false,
    filter,
  };
}

export async function ladeBehandlungen(
  filter: BehandlungFilter = "alle",
): Promise<BehandlungListe> {
  if (!isSupabaseConfigured()) return demoListe(filter);

  const supabase = await createClient();
  // Bewusst das UTC-Datum wie current_date in der Datenbank: dieselbe Grenze
  // zieht reihenblock_freigeben(), wenn es die Wartezeit als abgelaufen wertet.
  const heute = heuteIso();

  let basis = supabase.from("pflanzenschutz_behandlungen").select(
    `id, behandelt_am, wartezeit_tage, freigabe_am, freigegeben, dokument_id,
     aufwandmenge, aufwandmenge_einheit, durchgefuehrt_von_profil_id,
     reihenbloecke ( code ),
     psm_mittel ( name, wirkstoff ),
     profiles ( full_name )`,
    { count: "exact" },
  );
  if (filter === "offen") basis = basis.eq("freigegeben", false);
  if (filter === "freigegeben") basis = basis.eq("freigegeben", true);
  // Stabile Reihenfolge: bei gleichem Behandlungsdatum entscheidet die id, damit
  // die Schnittkante der Kuerzung nicht von Abfrage zu Abfrage wandert.
  const zeilenAbfrage = basis
    .order("behandelt_am", { ascending: false })
    .order("id")
    .limit(MAX_ZEILEN);

  // Die Kennzahlen zaehlen ueber alle Behandlungen, nicht ueber die angezeigten
  // Zeilen, sonst kappten sie ab MAX_ZEILEN still mit.
  const [zeilen, gesamt, laufend, ohneProtokoll] = await Promise.all([
    zeilenAbfrage,
    supabase.from("pflanzenschutz_behandlungen").select("id", { count: "exact", head: true }),
    supabase
      .from("pflanzenschutz_behandlungen")
      .select("id", { count: "exact", head: true })
      .eq("freigegeben", false)
      .gt("freigabe_am", heute),
    supabase
      .from("pflanzenschutz_behandlungen")
      .select("id", { count: "exact", head: true })
      .is("dokument_id", null),
  ]);

  const { data, error } = zeilen;
  if (error || !data || gesamt.error || laufend.error || ohneProtokoll.error) {
    return demoListe(filter, "fehler");
  }

  const behandlungen: BehandlungZeile[] = data.map((row) => {
    const mittel = einsAus(row.psm_mittel);
    const freigabeAm = row.freigabe_am as string;
    const person = einsAus(row.profiles)?.full_name ?? null;
    return {
      id: row.id,
      reihenblock: einsAus(row.reihenbloecke)?.code ?? "",
      mittel: mittel?.name ?? "",
      wirkstoff: mittel?.wirkstoff ?? null,
      behandeltAm: row.behandelt_am,
      wartezeitTage: row.wartezeit_tage,
      freigabeAm,
      freigegeben: row.freigegeben,
      wartezeitLaeuft: !row.freigegeben && freigabeAm > heute,
      aufwandmenge: row.aufwandmenge === null ? null : Number(row.aufwandmenge),
      aufwandmengeEinheit: row.aufwandmenge_einheit,
      durchgefuehrtVon: person,
      // Eine hinterlegte Person, deren Name RLS ausblendet (nur Buero liest profiles).
      personVerborgen: Boolean(row.durchgefuehrt_von_profil_id) && person === null,
      hatProtokoll: Boolean(row.dokument_id),
    };
  });

  return {
    quelle: "db",
    behandlungen,
    gesamt: gesamt.count ?? behandlungen.length,
    laufend: laufend.count ?? 0,
    ohneProtokoll: ohneProtokoll.count ?? 0,
    gekuerzt: (zeilen.count ?? behandlungen.length) > behandlungen.length,
    filter,
  };
}
