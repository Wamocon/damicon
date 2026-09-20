// Fuer die Skripte (kein Browser, keine Cookies): bei WISSEN_BACKEND=supabase ein Client mit dem
// Dienstschluessel. Die Rolle wird trotzdem als Filter (p_rolle) mitgegeben, die Rollenwirkung der
// Suche ist also dieselbe wie in der Anwendung; nur die Zeilensicherheit der Sitzung entfaellt.
import { createClient } from "@supabase/supabase-js";
import type { RpcKlient } from "../src/lib/wissen/supabase-suche";

export function supabaseKlient(): RpcKlient | undefined {
  if (process.env.WISSEN_BACKEND !== "supabase") return undefined;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const schluessel = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !schluessel) throw new Error("WISSEN_BACKEND=supabase braucht NEXT_PUBLIC_SUPABASE_URL und SUPABASE_SERVICE_ROLE_KEY.");
  return createClient(url, schluessel, { auth: { persistSession: false, autoRefreshToken: false } }) as unknown as RpcKlient;
}
