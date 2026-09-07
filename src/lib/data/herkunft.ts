import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Oeffentliche Herkunftsauskunft (WMCNL-1456): Wer den Code auf der Steige
// oder dem Lieferschein liest, bekommt genau diese eine Charge zu sehen -
// ohne Anmeldung, ohne Personenbezug. Der eigentliche Zugriffsschutz liegt in
// der Datenbank (SECURITY-DEFINER-Funktion public.herkunftsauskunft, siehe
// supabase/migrations/20260908150000_oeffentliche_herkunft.sql), die fuer
// einen nicht angemeldeten Besucher als anon-Rolle laeuft. Die Formatpruefung
// hier ist nur ein frueher Ausstieg fuer offensichtlich falsche Eingaben -
// Muster wie ladeNachweiskette in src/lib/data/nachweiskette.ts.

const CODE_FORMAT = /^hk_[0-9a-f]{16}$/;

export function istGueltigerHerkunftsCode(code: string): boolean {
  return CODE_FORMAT.test(code);
}

export interface OeffentlicheHerkunft {
  reihenblockCode: string | null;
  sorteName: string | null;
  ernteDatum: string | null;
  pflueckZeitpunkt: string | null;
  vorkuehlungZeitpunkt: string | null;
  /** Minuten von Pflücken bis Vorkühlung, sofern beide Zeitpunkte stehen. */
  minutenBisVorkuehlung: number | null;
  /** null = Vorkühlung steht noch aus, es gibt also noch kein Urteil. */
  kuehlketteEingehalten: boolean | null;
  wartezeitEingehalten: boolean;
}

export async function ladeOeffentlicheHerkunft(
  code: string,
): Promise<OeffentlicheHerkunft | null> {
  if (!isSupabaseConfigured() || !istGueltigerHerkunftsCode(code)) return null;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("herkunftsauskunft", {
    p_code: code,
  });

  const zeile = data?.[0];
  if (error || !zeile) return null;

  return {
    reihenblockCode: zeile.reihenblock_code,
    sorteName: zeile.sorte_name,
    ernteDatum: zeile.ernte_datum,
    pflueckZeitpunkt: zeile.pflueck_zeitpunkt,
    vorkuehlungZeitpunkt: zeile.vorkuehlung_zeitpunkt,
    minutenBisVorkuehlung: zeile.minuten_bis_vorkuehlung,
    kuehlketteEingehalten: zeile.kuehlkette_eingehalten,
    wartezeitEingehalten: zeile.wartezeit_eingehalten,
  };
}
