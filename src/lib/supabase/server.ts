import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createJsClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { DB_OPTION } from "@/lib/supabase/schema";

// Server-Client fuer Server Components / Route Handler (RLS-bewusst, anon key +
// Session-Cookie). Server-Secrets werfen fail-fast statt still zu platzhaltern.
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen in der Umgebung.",
    );
  }

  const cookieStore = await cookies();

  return createServerClient<Database>(url, anon, {
    db: DB_OPTION,
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Aufruf aus einer Server Component - Cookies werden vom Proxy gesetzt.
        }
      },
    },
  });
}

// Anon-Client OHNE cookies() (anders als createClient() oben). Fuer
// oeffentliche Lesezugriffe auf statisch bleibenden Marketing-Seiten
// (Landingpage, Impressum, Datenschutz, Seitenfuss) - jeder Aufruf von
// cookies() markiert die ganze Route als dynamisch (Next.js Dynamic APIs),
// selbst wenn die Anfrage nie einen Sitzungs-Cookie braucht. Nutzt ausdruecklich
// dieselben anon-RLS-Policies wie createClient() fuer eine anonyme Anfrage -
// kein zusaetzlicher Rechteumfang, nur ohne den staticing-brechenden
// Cookie-Zugriff.
export function createPublicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY fehlen in der Umgebung.",
    );
  }
  return createJsClient<Database>(url, anon, { db: DB_OPTION });
}

// Service-Role-Client (umgeht RLS). Nur serverseitig, nie an den Client geben.
export function createServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen in der Umgebung.",
    );
  }
  return createServerClient<Database>(url, serviceKey, {
    db: DB_OPTION,
    cookies: { getAll: () => [], setAll: () => {} },
  });
}
