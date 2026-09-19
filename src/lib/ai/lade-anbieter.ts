import { createServiceRoleClient } from "@/lib/supabase/server";

// Ausgelagert aus actions/ki-assistent.ts (Vibecode-Cleanup): sowohl die
// bisherige Server Action (openai_kompatibel-Pfad) als auch der neue
// streamende Route Handler (anthropic-Pfad, src/app/api/ki-assistent/route.ts)
// brauchen denselben aktiven Standard-Anbieter - eine gemeinsame, kleine
// Funktion statt einer zweiten, unabhaengig zu pflegenden Kopie.
//
// RLS auf ki_anbieter ist admin-only (Migration 20260930000000), deshalb der
// service_role-Client - dieser Aufruf laeuft erst NACH requirePermission()
// bzw. der Sitzungspruefung im jeweiligen Aufrufer.
export async function ladeAktivenStandardAnbieter() {
  const dienst = createServiceRoleClient();
  const { data } = await dienst
    .from("ki_anbieter")
    .select("name, anzeige_name, typ, basis_url, modell, api_key_chiffrat")
    .eq("aktiv", true)
    .eq("ist_standard", true)
    .maybeSingle();
  return data;
}
