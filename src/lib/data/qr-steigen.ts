import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured, type Datenquelle } from "@/lib/supabase/config";
import { einsAus } from "@/lib/data/util";
import { demoPfleuckerAusweise, demoSteigenEtiketten } from "@/lib/domain/qr-steigen";

// Datenquelle fuer QR-Etiketten (Steigen) und Pfluecker-Ausweise (WMCNL-1439).
// Reine Leseansicht: anders als lohn.ts/zukauf.ts gibt es hier keine
// zugehoerige Server Action, die etwas schreibt - Steigen entstehen bereits
// ueber die Nachweiskette (src/lib/actions/nachweiskette.ts), Pfluecker ueber
// die Personalverwaltung. Muster (Datenquelle-Badge, Demo-Fallback bei
// fehlendem Supabase, "fehler" statt "demo" bei einem echten Lesefehler)
// trotzdem identisch zu ladeZukaufPositionen in src/lib/data/zukauf.ts.

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

function demoEtikettenListe(quelle: Datenquelle = "demo"): SteigenEtikettenListe {
  return { quelle, etiketten: demoSteigenEtiketten.map((e) => ({ ...e })) };
}

export async function ladeSteigenEtiketten(): Promise<SteigenEtikettenListe> {
  if (!isSupabaseConfigured()) return demoEtikettenListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("steigen")
    .select("id, code, chargen ( oeffentlicher_code )")
    .order("created_at", { ascending: false })
    .limit(ETIKETTEN_LIMIT);

  if (error || !data) return demoEtikettenListe("fehler");

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

function demoAusweisListe(quelle: Datenquelle = "demo"): PfleuckerAusweisListe {
  return { quelle, ausweise: demoPfleuckerAusweise.map((p) => ({ ...p })) };
}

export async function ladePfleuckerAusweise(): Promise<PfleuckerAusweisListe> {
  if (!isSupabaseConfigured()) return demoAusweisListe();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pfluecker")
    .select("id, name, ausweis")
    .order("name")
    .limit(AUSWEISE_LIMIT);

  if (error || !data) return demoAusweisListe("fehler");

  return { quelle: "db", ausweise: data };
}
