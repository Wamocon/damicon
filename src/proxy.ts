import createMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { routing } from "@/i18n/routing";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { DB_OPTION } from "@/lib/supabase/schema";
import { mfaHerausforderungOffen } from "@/lib/domain/mfa";
import { moduleByPath, zones } from "@/lib/modules";

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

// Zone und Modul eines Dashboard-Pfads: /de/dashboard/markt/b2b-portal.
const modulPfad = new RegExp(`^/(?:${localePrefix})/dashboard/([^/]+)/([^/]+)/?$`);

// WMCNL-2311: ein Modulpfad, den es nicht gibt, antwortete mit HTTP 200, obwohl
// die 404-Seite im Inhalt stand. Die Seite wirft notFound() erst, nachdem das
// Dashboard-Layout mit seinen Ladezustaenden (loading.tsx) den Kopf der Antwort
// schon gesendet hat, und danach laesst sich der Status nicht mehr aendern.
// Ueberwachung, Testautomatisierung und Suchmaschinen sehen so einen Fehlaufruf
// als gueltige Seite. Hier, vor dem Rendern, steht der Status noch offen: die
// Seite rendert unveraendert (dieselbe 404-Ansicht im Dashboard), antwortet aber
// mit 404. Nur Zone plus Modul wird geprueft: eine unbekannte Zone oder eine
// feste Seite wie /dashboard/sicherheit bleibt Sache des Routers.
function unbekanntesModul(pfad: string): boolean {
  const treffer = modulPfad.exec(pfad);
  if (!treffer) return false;
  const [, zone, slug] = treffer;
  return zones.some((z) => z.key === zone) && !moduleByPath(zone, slug);
}

function mitModulPruefung(request: NextRequest, response: NextResponse): NextResponse {
  if (!unbekanntesModul(request.nextUrl.pathname)) return response;
  const antwort = NextResponse.rewrite(request.nextUrl, { status: 404 });
  // Die Kopfzeilen der Sprachweiche (next-intl) und die aufgefrischten
  // Supabase-Cookies gehen mit; "x-middleware-next" gilt nur fuer "weiter".
  response.headers.forEach((wert, name) => {
    const klein = name.toLowerCase();
    if (klein === "set-cookie" || klein === "x-middleware-next") return;
    antwort.headers.set(name, wert);
  });
  for (const cookie of response.cookies.getAll()) antwort.cookies.set(cookie);
  return antwort;
}

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
  if (!isSupabaseConfigured()) return mitModulPruefung(request, response);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      db: DB_OPTION,
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
    // umgehen. mfaHerausforderungOffen() (domain/mfa.ts) buendelt dieselbe
    // Bedingung, die auch login/actions.ts und login/mfa/page.tsx pruefen -
    // WMC-Vibecode-Cleanup-Fund, vier wortgleiche Kopien dieser einen
    // Bedingung.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    const mfaOffen = mfaHerausforderungOffen(aal);

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

  return mitModulPruefung(request, response);
}

export const config = {
  // Alles ausser API-Routen, Next-Internals und Dateien mit Endung.
  matcher: ["/", "/((?!api|_next|_vercel|.*\\..*).*)"],
};
