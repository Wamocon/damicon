import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { PersonaProvider } from "@/components/dashboard/persona";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardTopbar } from "@/components/dashboard/topbar";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

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

  return (
    <PersonaProvider
      echteRolle={profil?.role ?? "admin"}
      name={profil?.fullName ?? null}
      email={profil?.email ?? null}
      demoModus={demoModus}
    >
      <div className="dashboard-shell flex min-h-svh w-full">
        <DashboardSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <DashboardTopbar />
          <main id="main" className="min-w-0 flex-1 p-4 md:p-6 lg:p-8 print:p-0">
            {children}
          </main>
        </div>
      </div>
    </PersonaProvider>
  );
}
