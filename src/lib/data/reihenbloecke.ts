import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import {
  reihenbloecke as demoBloecke,
  type ReihenblockStatus,
} from "@/lib/domain/reihenbloecke";
import { einsAus, heuteIso } from "@/lib/data/util";

// Reihenbloecke inklusive offener Wartezeitsperre. Kernabfrage von
// Meilenstein B: der Status entscheidet, ob ein Block gepflueckt werden darf.

export interface Sperre {
  mittel: string;
  behandeltAm: string;
  wartezeitTage: number;
  freigabeAm: string;
  /** Wartezeit abgelaufen - der Block darf freigegeben werden. */
  faellig: boolean;
  /** Verbleibende Tage bis zur Freigabe (0, wenn faellig). */
  resttage: number;
}

export interface ReihenblockZeile {
  id: string;
  code: string;
  parzelle: string;
  reihengruppe: string;
  sorte: string;
  /** Anforderung 2.1: Rohwert fuer die Bearbeitung - null im Demo-Modus. */
  sorteId: string | null;
  status: ReihenblockStatus;
  laengeM: number | null;
  letzteErnte: string | null;
  sperre: Sperre | null;
}

export interface ReihenblockListe {
  quelle: Datenquelle;
  bloecke: ReihenblockZeile[];
  counts: Record<ReihenblockStatus, number>;
}

export interface PsmOption {
  id: string;
  name: string;
  wirkstoff: string | null;
  wartezeitTage: number;
}

function tageBis(datum: string): number {
  const ziel = new Date(`${datum}T00:00:00Z`).getTime();
  const heute = new Date(`${heuteIso()}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((ziel - heute) / 86_400_000));
}

function zaehle(bloecke: ReihenblockZeile[]): Record<ReihenblockStatus, number> {
  const counts: Record<ReihenblockStatus, number> = {
    bepflanzt: 0,
    erntereif: 0,
    ruhend: 0,
    rueckschnitt: 0,
    wartezeitgesperrt: 0,
  };
  for (const block of bloecke) counts[block.status] += 1;
  return counts;
}

function demoListe(quelle: ReihenblockListe["quelle"] = "demo"): ReihenblockListe {
  const bloecke: ReihenblockZeile[] = demoBloecke.map((block) => ({
    id: block.id,
    code: block.id,
    parzelle: block.parzelle,
    reihengruppe: block.reihengruppe,
    sorte: block.sorte,
    sorteId: null,
    status: block.status,
    laengeM: block.laengeM,
    letzteErnte: block.letzteErnte,
    sperre: block.sperre
      ? {
          mittel: block.sperre.mittel,
          behandeltAm: block.sperre.behandeltAm,
          wartezeitTage: block.sperre.wartezeitTage,
          freigabeAm: block.sperre.freigabeAm,
          faellig: block.sperre.freigabeAm <= heuteIso(),
          resttage: tageBis(block.sperre.freigabeAm),
        }
      : null,
  }));
  return { quelle, bloecke, counts: zaehle(bloecke) };
}

export async function ladeReihenbloecke(): Promise<ReihenblockListe> {
  if (!isSupabaseConfigured()) return demoListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("reihenbloecke")
    .select(
      `id, code, status, laenge_m, letzte_ernte, sorte_id,
       sorten ( name ),
       reihengruppen ( name, feldparzellen ( name ) ),
       pflanzenschutz_behandlungen (
         behandelt_am, wartezeit_tage, freigabe_am, freigegeben,
         psm_mittel ( name, wirkstoff )
       )`,
    )
    .order("code");

  if (error || !data) return demoListe("fehler");

  const heute = heuteIso();

  const bloecke: ReihenblockZeile[] = data.map((row) => {
    const gruppe = einsAus(row.reihengruppen);
    const parzelle = einsAus(gruppe?.feldparzellen);

    // Massgeblich ist die spaeteste noch nicht quittierte Behandlung.
    const offen = (row.pflanzenschutz_behandlungen ?? [])
      .filter((b) => !b.freigegeben && b.freigabe_am)
      .sort((a, b) => (a.freigabe_am! > b.freigabe_am! ? -1 : 1))[0];

    const mittel = einsAus(offen?.psm_mittel);

    return {
      id: row.id,
      code: row.code,
      parzelle: parzelle?.name ?? "",
      reihengruppe: gruppe?.name ?? "",
      sorte: einsAus(row.sorten)?.name ?? "",
      sorteId: row.sorte_id,
      status: row.status,
      laengeM: row.laenge_m === null ? null : Number(row.laenge_m),
      letzteErnte: row.letzte_ernte,
      sperre: offen
        ? {
            mittel: mittel
              ? `${mittel.name}${mittel.wirkstoff ? ` (${mittel.wirkstoff})` : ""}`
              : "",
            behandeltAm: offen.behandelt_am,
            wartezeitTage: offen.wartezeit_tage,
            freigabeAm: offen.freigabe_am!,
            faellig: offen.freigabe_am! <= heute,
            resttage: tageBis(offen.freigabe_am!),
          }
        : null,
    };
  });

  return { quelle: "db", bloecke, counts: zaehle(bloecke) };
}

export async function ladePsmMittel(): Promise<PsmOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("psm_mittel")
    .select("id, name, wirkstoff, wartezeit_tage")
    .order("name");
  return (data ?? []).map((m) => ({
    id: m.id,
    name: m.name,
    wirkstoff: m.wirkstoff,
    wartezeitTage: m.wartezeit_tage,
  }));
}

export interface ProfilOption {
  id: string;
  vollerName: string;
}

// Anforderung 2.4: fuer die Auswahl der durchfuehrenden Person beim Erfassen
// einer Behandlung.
export async function ladeProfile(): Promise<ProfilOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .order("full_name");
  return (data ?? []).map((p) => ({ id: p.id, vollerName: p.full_name }));
}
