import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";

// Datenquelle fuer QR-Etiketten (Steigen) und Pfluecker-Ausweise (WMCNL-1439).
// Reine Leseansicht: anders als lohn.ts/zukauf.ts gibt es hier keine
// zugehoerige Server Action, die etwas schreibt - Steigen entstehen bereits
// ueber die Nachweiskette (src/lib/actions/nachweiskette.ts), Pfluecker ueber
// die Personalverwaltung.
//
// Ohne Demo-Fallback, anders als das Muster in ladeZukaufPositionen
// (src/lib/data/zukauf.ts): das System laeuft ausschliesslich gegen die
// gemeinsame Cloud-Instanz. Fehlt die Konfiguration oder schlaegt die
// Abfrage fehl, bleibt die Liste leer statt erfundene Chargen/Ausweise zu
// zeigen - ein gedruckter QR-Code auf Basis erfundener Daten waere ohnehin
// nie einloesbar gewesen.

const ETIKETTEN_LIMIT = 40;
const AUSWEISE_LIMIT = 60;

export interface SteigenEtikett {
  id: string;
  code: string;
  /** Verweist auf chargen.oeffentlicher_code - der QR kodiert die Herkunftsseite dieser Charge, nicht einen eigenen Steigen-Code. */
  oeffentlicherCode: string;
}

export interface SteigenEtikettenListe {
  quelle: Datenquelle;
  etiketten: SteigenEtikett[];
}

export async function ladeSteigenEtiketten(): Promise<SteigenEtikettenListe> {
  if (!isSupabaseConfigured()) return { quelle: "fehler", etiketten: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("steigen")
    .select("id, code, chargen ( oeffentlicher_code )")
    .order("created_at", { ascending: false })
    .limit(ETIKETTEN_LIMIT);

  if (error || !data) return { quelle: "fehler", etiketten: [] };

  const etiketten = data
    .map((s) => ({
      id: s.id as string,
      code: s.code as string,
      oeffentlicherCode: einsAus(s.chargen)?.oeffentlicher_code ?? null,
    }))
    // Eine Steige, deren Charge geloescht wurde (charge_id steht auf
    // "on delete set null"), hat keinen oeffentlichen Code mehr - fuer sie
    // liesse sich kein funktionierendes Etikett drucken.
    .filter((e): e is SteigenEtikett => e.oeffentlicherCode !== null);

  return { quelle: "db", etiketten };
}

export interface PfleuckerAusweis {
  id: string;
  name: string;
  ausweis: string;
}

export interface PfleuckerAusweisListe {
  quelle: Datenquelle;
  ausweise: PfleuckerAusweis[];
}

export async function ladePfleuckerAusweise(): Promise<PfleuckerAusweisListe> {
  if (!isSupabaseConfigured()) return { quelle: "fehler", ausweise: [] };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pfluecker")
    .select("id, name, ausweis")
    .order("name")
    .limit(AUSWEISE_LIMIT);

  if (error || !data) return { quelle: "fehler", ausweise: [] };

  return { quelle: "db", ausweise: data };
}
