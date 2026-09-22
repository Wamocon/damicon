// Login-Ausloeser fuer die automatische CEO-Compliance-Uebersicht. Wird von
// einem kleinen Client-Effekt aufgerufen (components/dashboard/
// ceo-auto-trigger.tsx), sobald die Startseite als Rolle ceo geladen wird.
//
// after() statt einer direkten Server-Component-Ausfuehrung: after() darf in
// einer Server Component (dashboard/page.tsx) kein cookies()/createClient()
// aufrufen (siehe node_modules/next/dist/docs/01-app/03-api-reference/
// 04-functions/after.md, Abschnitt "In Server Components"), in einem Route
// Handler dagegen schon. Die Antwort kommt deshalb sofort (202), der
// eigentliche Lauf - inklusive der guenstigen Aenderungspruefung, die den
// teuren Modellauf meist ueberhaupt nicht braucht - passiert danach im
// Hintergrund und blockiert das Login/den Seitenaufbau nicht.

import { after } from "next/server";
import { getSessionProfile } from "@/lib/auth";
import { aktualisiereCeoBericht } from "@/lib/pruefung/ceo-auto";

export const maxDuration = 300;

export async function POST() {
  const profil = await getSessionProfile();
  if (!profil) return new Response("nicht angemeldet", { status: 401 });
  if (profil.role !== "ceo") return new Response("keine berechtigung", { status: 403 });

  after(() =>
    aktualisiereCeoBericht({ profil, erzwungen: false }).catch((e: unknown) => {
      console.error("[damicon] CEO-Auto-Pruefung fehlgeschlagen:", e);
    }),
  );

  return new Response(null, { status: 202 });
}
