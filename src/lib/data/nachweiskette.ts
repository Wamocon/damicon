import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";

// Die Nachweiskette einer Pflueckaufgabe: Charge, Kuehlkurve, Steigen mit
// Person und der Rueckstandsnachweis. Das ist die Frage, die Handel und
// Behoerde stellen - und bis Meilenstein C war sie nicht beantwortbar, weil im
// laufenden Betrieb nie eine Charge entstand.

export interface KuehlMessung {
  id: string;
  gemessenAm: string;
  temperaturC: number;
  minutenSeitPfluecken: number | null;
  ergebnis: "ok" | "warnung" | "verstoss";
}

export interface SteigeZeile {
  id: string;
  code: string;
  gewichtKg: number | null;
  scanZeitpunkt: string | null;
  pfluecker: string | null;
  /** Anforderung 2.10: Stichprobenkontrolle je einzelner Steige. */
  kontrolliertAm: string | null;
}

export interface BehandlungsNachweis {
  mittel: string;
  wirkstoff: string | null;
  behandeltAm: string;
  wartezeitTage: number;
  freigabeAm: string;
  tageVorErnte: number;
  eingehalten: boolean;
}

export interface Nachweiskette {
  charge: {
    id: string;
    code: string;
    ernteDatum: string;
    status: string;
    mengeKg: number;
    ausschussKg: number;
    pflueckZeitpunkt: string | null;
    vorkuehlungZeitpunkt: string | null;
    /** Minuten von Pflücken bis Vorkühlung, sofern beide Zeitpunkte stehen. */
    minutenBisVorkuehlung: number | null;
  } | null;
  messungen: KuehlMessung[];
  steigen: SteigeZeile[];
  behandlungen: BehandlungsNachweis[];
}

const leereKette: Nachweiskette = {
  charge: null,
  messungen: [],
  steigen: [],
  behandlungen: [],
};

export async function ladeNachweiskette(
  aufgabeId: string,
): Promise<Nachweiskette> {
  if (!isSupabaseConfigured() || !aufgabeId) return leereKette;

  const supabase = await createClient();

  const { data: charge, error } = await supabase
    .from("chargen")
    .select(
      `id, code, ernte_datum, status, menge_kg, ausschuss_kg,
       pflueck_zeitpunkt, vorkuehlung_zeitpunkt,
       kuehlketten_messungen ( id, gemessen_am, temperatur_c, minuten_seit_pfluecken, ergebnis )`,
    )
    .eq("pflueckaufgabe_id", aufgabeId)
    .maybeSingle();

  if (error || !charge) return leereKette;

  const [{ data: steigen }, { data: behandlungen }] = await Promise.all([
    supabase
      .from("steigen")
      .select("id, code, gewicht_kg, scan_zeitpunkt, kontrolliert_am, pfluecker ( name )")
      .eq("pflueckaufgabe_id", aufgabeId)
      .order("code"),
    supabase.rpc("rueckstandsnachweis", { p_charge: charge.id }),
  ]);

  const pflueck = charge.pflueck_zeitpunkt
    ? new Date(charge.pflueck_zeitpunkt).getTime()
    : null;
  const kuehlung = charge.vorkuehlung_zeitpunkt
    ? new Date(charge.vorkuehlung_zeitpunkt).getTime()
    : null;

  return {
    charge: {
      id: charge.id,
      code: charge.code,
      ernteDatum: charge.ernte_datum,
      status: charge.status,
      mengeKg: Number(charge.menge_kg),
      ausschussKg: Number(charge.ausschuss_kg),
      pflueckZeitpunkt: charge.pflueck_zeitpunkt,
      vorkuehlungZeitpunkt: charge.vorkuehlung_zeitpunkt,
      minutenBisVorkuehlung:
        pflueck !== null && kuehlung !== null
          ? Math.max(0, Math.round((kuehlung - pflueck) / 60000))
          : null,
    },
    messungen: (charge.kuehlketten_messungen ?? [])
      .map((m) => ({
        id: m.id,
        gemessenAm: m.gemessen_am,
        temperaturC: Number(m.temperatur_c),
        minutenSeitPfluecken: m.minuten_seit_pfluecken,
        ergebnis: m.ergebnis,
      }))
      .sort((a, b) => (a.gemessenAm > b.gemessenAm ? 1 : -1)),
    steigen: (steigen ?? []).map((s) => ({
      id: s.id,
      code: s.code,
      gewichtKg: s.gewicht_kg === null ? null : Number(s.gewicht_kg),
      scanZeitpunkt: s.scan_zeitpunkt,
      pfluecker: einsAus(s.pfluecker)?.name ?? null,
      kontrolliertAm: s.kontrolliert_am,
    })),
    behandlungen: (behandlungen ?? []).map((b) => ({
      mittel: b.mittel,
      wirkstoff: b.wirkstoff,
      behandeltAm: b.behandelt_am,
      wartezeitTage: b.wartezeit_tage,
      freigabeAm: b.freigabe_am,
      tageVorErnte: b.tage_vor_ernte,
      eingehalten: b.eingehalten,
    })),
  };
}

export interface PflueckerOption {
  id: string;
  name: string;
  ausweis: string;
}

export async function ladePfluecker(brigadeId?: string | null): Promise<PflueckerOption[]> {
  if (!isSupabaseConfigured()) return [];
  const supabase = await createClient();
  let abfrage = supabase.from("pfluecker").select("id, name, ausweis").order("name");
  if (brigadeId) abfrage = abfrage.eq("brigade_id", brigadeId);
  const { data } = await abfrage;
  return data ?? [];
}
