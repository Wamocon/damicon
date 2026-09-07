import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ModulePageBody } from "@/components/dashboard/module-page-body";
import { serverModulAnsicht } from "@/components/db/server-module-views";
import { moduleByPath } from "@/lib/modules";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function ModulePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; zone: string; module: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { locale, zone, module: slug } = await params;
  setRequestLocale(locale);

  const found = moduleByPath(zone, slug);
  if (!found) notFound();

  const suche = await searchParams;

  // Die Sperre in ModulePageBody blendet nur aus. Die Fachdaten duerfen deshalb
  // gar nicht erst geladen werden, sonst stehen sie trotz Schloss-Symbol im
  // RSC-Payload. Massgeblich ist die Profilrolle, nicht die Ansichtsrolle.
  const profil = isSupabaseConfigured() ? await getSessionProfile() : null;
  const darfSehen = isSupabaseConfigured()
    ? hasPermission(profil?.role, found.resource, "view")
    : true;

  const ansicht = darfSehen
    ? serverModulAnsicht(found, {
        pfad: `/dashboard/${zone}/${slug}`,
        suche: {
          status: typeof suche.status === "string" ? suche.status : undefined,
          aufgabe: typeof suche.aufgabe === "string" ? suche.aufgabe : undefined,
          reklamation: typeof suche.reklamation === "string" ? suche.reklamation : undefined,
        },
      })
    : null;

  return <ModulePageBody module={found}>{ansicht}</ModulePageBody>;
}
