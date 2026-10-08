import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import type { Role } from "@/lib/rbac";

// MFA-Status aller Konten fuer die Administration (WMCNL-2479). Die Rechenregel
// steht in der Datenbank (public.mfa_status_je_konto(), nur admin, SECURITY
// DEFINER, weil auth.mfa_factors den Anwendungsrollen nicht gehoert).

export interface MfaKonto {
  profilId: string;
  name: string;
  email: string | null;
  rolle: Role;
  /** Zahl bestaetigter zweiter Faktoren; 0 heisst ungeschuetzt. */
  faktoren: number;
}

export interface MfaUebersicht {
  /** false: die Abfrage ist gescheitert, die Liste ist dann leer und nichts darf daraus gefolgert werden. */
  geladen: boolean;
  konten: MfaKonto[];
}

export async function ladeMfaUebersicht(): Promise<MfaUebersicht> {
  if (!isSupabaseConfigured()) return { geladen: false, konten: [] };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("mfa_status_je_konto");
  if (error || !data) return { geladen: false, konten: [] };
  return {
    geladen: true,
    konten: data.map((z) => ({
      profilId: z.profil_id,
      name: z.voller_name,
      email: z.email,
      rolle: z.rolle,
      faktoren: z.faktoren,
    })),
  };
}
