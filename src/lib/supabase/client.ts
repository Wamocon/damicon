import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/lib/database.types";

// Browser-Client (anon key). Fallback-URL statt `?? ''`, damit ein fehlender
// Env-Wert nicht schon beim Modul-Load `supabaseUrl is required` wirft und alle
// SSR-Routen crasht (siehe .github/copilot-instructions.md Regel 11).
// Noch kein Aufrufer: alle Supabase-Zugriffe laufen bisher serverseitig ueber
// server.ts. Die Datei bleibt, weil sie die Browser-Haelfte des Supabase-SSR-
// Musters ist - die Offline-Synchronisation in src/lib/offline braucht sie,
// sobald sie direkt mit der Datenbank spricht. Absichtlich vorhanden.
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key",
  );
}
