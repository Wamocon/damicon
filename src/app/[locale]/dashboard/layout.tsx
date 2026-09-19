import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import "@/components/ki/ki-pane.css";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { PersonaProvider } from "@/components/dashboard/persona";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { KiAnbieterVerwaltung } from "@/components/db/ki-assistent-formulare";
import { KiWissenVerwaltung } from "@/components/db/ki-wissen-formulare";
import { KiFuehrungsAnzeige } from "@/components/ki/ki-fuehrung";
import { KiPane } from "@/components/ki/ki-pane";
import { KiPaneProvider } from "@/components/ki/ki-pane-kontext";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { ladeAktivenStandardAnbieter } from "@/lib/ai/lade-anbieter";
import { ladeKiAnbieterListe, ladeKiChatVerlauf } from "@/lib/data/ki-assistent";
import { ladeKiWissenDokumente } from "@/lib/data/ki-wissen";

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
  // Dasselbe gilt fuer die Wissensdokumente (RAG): gleicher Platz, gleiche
  // Admin-Pruefung - geladen wird die Liste nur fuer ki_assistent:manage.
  const darfKiNutzen = !demoModus && hasPermission(profil?.role, "ki_assistent", "create");
  const istKiAdmin = !demoModus && hasPermission(profil?.role, "ki_assistent", "manage");
  const [aktiverAnbieter, kiVerlauf, anbieterListe, wissenUebersicht] = darfKiNutzen
    ? await Promise.all([
        ladeAktivenStandardAnbieter(),
        ladeKiChatVerlauf(),
        istKiAdmin ? ladeKiAnbieterListe() : Promise.resolve(null),
        istKiAdmin ? ladeKiWissenDokumente() : Promise.resolve(null),
      ])
    : [null, null, null, null];
  const t = istKiAdmin ? await getTranslations("kiAssistentAnsicht") : null;

  return (
    <PersonaProvider
      echteRolle={profil?.role ?? "admin"}
      name={profil?.fullName ?? null}
      email={profil?.email ?? null}
      demoModus={demoModus}
    >
      <KiPaneProvider verfuegbar={darfKiNutzen && kiVerlauf !== null}>
        <div className="dashboard-shell flex min-h-svh w-full">
          <DashboardSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            <KiFuehrungsAnzeige />
            <DashboardTopbar />
            <main id="main" className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 print:p-0">
              {children}
            </main>
          </div>
          {kiVerlauf ? (
            <KiPane
              verlauf={kiVerlauf.nachrichten}
              agentFaehig={aktiverAnbieter?.typ === "anthropic"}
              einstellungen={
                anbieterListe ? (
                  <>
                    <KiAnbieterVerwaltung anbieter={anbieterListe.anbieter} />
                    {wissenUebersicht && t ? (
                      <div className="mt-6 space-y-3">
                        <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                          {t("wissensVerwaltung.titel")}
                        </p>
                        <p className="text-xs text-muted-foreground">{t("wissensVerwaltung.lead")}</p>
                        <KiWissenVerwaltung dokumente={wissenUebersicht.dokumente} />
                      </div>
                    ) : null}
                  </>
                ) : null
              }
            />
          ) : null}
        </div>
      </KiPaneProvider>
    </PersonaProvider>
  );
}
