import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Next.js 16: `src/proxy.ts` ersetzt das veraltete `middleware.ts`.
// Zwei Aufgaben, in dieser Reihenfolge:
//   1. Locale-Weiterleitung von next-intl (localePrefix: "always")
//   2. Supabase-Session auffrischen und /dashboard schuetzen (Meilenstein B)
// Ohne Supabase-Umgebung entfaellt Schritt 2 - der Demo-Modus bleibt ohne
// Datenbank startbar.
const handleI18nRouting = createMiddleware(routing);

const localePrefix = routing.locales.join("|");
const dashboardPfad = new RegExp(`^/(?:${localePrefix})/dashboard(?:/|$)`);
// Exakt "/login" (nicht "/login/mfa" mit) - die Challenge-Seite braucht eine
// eigene, AAL-bewusste Behandlung weiter unten, sonst wuerde diese Regel sie
// sofort wieder zum Dashboard umleiten, bevor sie ueberhaupt rendert.
const loginPfad = new RegExp(`^/(?:${localePrefix})/login/?$`);
const mfaPfad = new RegExp(`^/(?:${localePrefix})/login/mfa(?:/|$)`);

function localeAus(pfad: string): string {
  const kandidat = pfad.split("/")[1];
  return (routing.locales as readonly string[]).includes(kandidat)
    ? kandidat
    : routing.defaultLocale;
}

// Beim Umleiten die von Supabase aufgefrischten Cookies mitnehmen, sonst geht
// das erneuerte Token verloren.
function weiterleiten(ziel: URL, quelle: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(ziel);
  for (const cookie of quelle.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export async function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pfad = request.nextUrl.pathname;
  const locale = localeAus(pfad);

  if (!user && dashboardPfad.test(pfad)) {
    const ziel = new URL(`/${locale}/login`, request.url);
    ziel.searchParams.set("weiter", pfad);
    return weiterleiten(ziel, response);
  }

  if (user) {
    // Mehrfaktor-Authentifizierung (Anforderung 4.9): eine AAL1-Sitzung (nur
    // Passwort) reicht nicht, wenn ein verifizierter zweiter Faktor verlangt
    // wird. Diese Pruefung gehoert in den Proxy, nicht nur in die
    // Login-Server-Action - sonst genuegt ein direkter Aufruf von
    // /dashboard mit einer bestehenden AAL1-Sitzung, um die Challenge zu
    // umgehen (siehe login/actions.ts fuer denselben Vergleich beim Login).
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const mfaOffen = !!aal && aal.nextLevel === "aal2" && aal.nextLevel !== aal.currentLevel;

    if (mfaOffen && dashboardPfad.test(pfad)) {
      const ziel = new URL(`/${locale}/login/mfa`, request.url);
      ziel.searchParams.set("weiter", pfad);
      return weiterleiten(ziel, response);
    }

    if (mfaOffen && loginPfad.test(pfad)) {
      const ziel = new URL(`/${locale}/login/mfa`, request.url);
      const weiterParam = request.nextUrl.searchParams.get("weiter");
      if (weiterParam) ziel.searchParams.set("weiter", weiterParam);
      return weiterleiten(ziel, response);
    }

    if (!mfaOffen && (loginPfad.test(pfad) || mfaPfad.test(pfad))) {
      return weiterleiten(new URL(`/${locale}/dashboard`, request.url), response);
    }
  }

  return response;
}

export const config = {
  // Alles ausser API-Routen, Next-Internals und Dateien mit Endung.
  matcher: ["/", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
