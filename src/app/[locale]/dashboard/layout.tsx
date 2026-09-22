import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import "@/components/ki/ki-pane.css";
import { setRequestLocale } from "next-intl/server";
import { PersonaProvider } from "@/components/dashboard/persona";
import { CeoPruefungProvider } from "@/components/dashboard/ceo-pruefung-kontext";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { UntereLeiste } from "@/components/dashboard/untere-leiste";
import { KiAnbieterVerwaltung } from "@/components/db/ki-assistent-formulare";
import { KiFuehrungsAnzeige } from "@/components/ki/ki-fuehrung";
import { KiPane } from "@/components/ki/ki-pane";
import { erlaubteBereiche } from "@/lib/pruefung/rollen";
import { HaustierDashboard } from "@/components/haustier/haustier-dashboard";
import { HaustierProvider } from "@/components/haustier/haustier-kontext";
import { KiPaneProvider } from "@/components/ki/ki-pane-kontext";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ladeAktivenStandardAnbieter } from "@/lib/ai/lade-anbieter";
import { ladeKiAnbieterListe, ladeKiChatVerlauf } from "@/lib/data/ki-assistent";
import { agentSeitenansichtAn } from "@/lib/domain/schalter";

// Das Diktat laeuft als Server Action auf DIESER Seiten-Route, nicht ueber
// eine API-Route - und ohne diese Zeile bekaeme es nicht 60 Sekunden, sondern
// was immer die Plattform vorgibt ("Set by deployment platform", Next.js
// Route Segment Config). Die drei api/*/route.ts setzen ihr maxDuration
// selbst; dieser Pfad hatte keines, obwohl das Zeitbudget der Spracherkennung
// (Deckel 40 s, siehe lib/domain/spracherkennung.ts) sich darauf stuetzt.
//
// Am Layout und nicht an einer einzelnen Seite: das KI-Panel haengt im
// Layout und ist damit auf jeder Dashboard-Seite erreichbar - /dashboard,
// /dashboard/[zone] und /dashboard/sicherheit. Laut Next.js gilt die
// Einstellung "at the page level" fuer alle Server Actions der Seite; das
// Layout deckt alle drei ab.
export const maxDuration = 60;

export default async function DashboardLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Mit Supabase-Umgebung ist das Dashboard geschuetzt (zusaetzlich zum Proxy,
  // der schon vorher umleitet). Ohne Umgebung laeuft der Demo-Modus weiter.
  const demoModus = !isSupabaseConfigured();
  const profil = demoModus ? null : await getSessionProfile();
  if (!demoModus && !profil) redirect(`/${locale}/login`);

  // KI-Seitenpanel ("KI fragen" in der Kopfzeile, ersetzt das fruehere Modul
  // KI-Assistent): nur mit echter Datenbank (im Demo-Modus gibt es weder
  // Chatverlauf noch Anbieter) und nur fuer Rollen, die den Chat nutzen
  // duerfen. Der Anbieter entscheidet, WAS im Panel steckt: 'anthropic' =
  // Streaming-Agent mit Werkzeugen und Modi, alles andere = der bisherige
  // Server-Action-Chat. Die Anbieterverwaltung (Admin) wandert als fertig
  // gerendertes Element ins Panel, statt eine eigene Seite zu brauchen.
  const darfKiNutzen = !demoModus && hasPermission(profil?.role, "ki_assistent", "create");
  const istKiAdmin = !demoModus && hasPermission(profil?.role, "ki_assistent", "manage");
  const [aktiverAnbieter, kiVerlauf, anbieterListe] = darfKiNutzen
    ? await Promise.all([
        ladeAktivenStandardAnbieter(),
        ladeKiChatVerlauf(),
        istKiAdmin ? ladeKiAnbieterListe() : Promise.resolve(null),
      ])
    : [null, null, null];

  return (
    <PersonaProvider
      echteRolle={profil?.role ?? "admin"}
      name={profil?.fullName ?? null}
      email={profil?.email ?? null}
      demoModus={demoModus}
    >
      <KiPaneProvider
        verfuegbar={darfKiNutzen && kiVerlauf !== null}
        seitenansichtAn={agentSeitenansichtAn()}
        nutzerId={profil?.id ?? null}
      >
        <CeoPruefungProvider>
        <HaustierProvider>
        <div className="dashboard-shell flex min-h-svh w-full">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <KiFuehrungsAnzeige />
            <DashboardTopbar />
            {/* Der untere Innenabstand haelt den Platz der unteren
                Navigationsleiste frei (--untere-leiste-raum, globals.css) -
                ohne ihn verdeckt sie den letzten Knopf jeder Seite. Ab md ist
                die Variable 0 und es gelten wieder die regulaeren Masse. */}
            <main
              id="main"
              className="min-w-0 flex-1 p-4 pb-[calc(1rem+var(--untere-leiste-raum))] md:p-6 md:pb-6 lg:p-8 lg:pb-8 print:p-0"
            >
              {children}
            </main>
            <UntereLeiste />
          </div>
          {kiVerlauf ? (
            <KiPane
              verlauf={kiVerlauf.nachrichten}
              agentFaehig={aktiverAnbieter?.typ === "anthropic"}
              pruefungBereiche={aktiverAnbieter?.typ === "anthropic" ? erlaubteBereiche(profil?.role) : []}
              einstellungen={
                anbieterListe ? <KiAnbieterVerwaltung anbieter={anbieterListe.anbieter} /> : null
              }
            />
          ) : null}
        </div>
        <HaustierDashboard />
        </HaustierProvider>
        </CeoPruefungProvider>
      </KiPaneProvider>
    </PersonaProvider>
  );
}
