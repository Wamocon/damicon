import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { ZonePageBody } from "@/components/dashboard/zone-page-body";
import { ladeKpis } from "@/lib/data/kpis";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";
import { zones, type ZoneKey } from "@/lib/modules";

export default async function ZonePage({
  params,
}: {
  params: Promise<{ locale: string; zone: string }>;
}) {
  const { locale, zone } = await params;
  setRequestLocale(locale);

  if (!zones.some((z) => z.key === zone)) notFound();

  const [{ kpis, quelle }, profil] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
  ]);

  // Derselbe serverseitige Vorfilter wie auf der Uebersicht. Ohne ihn
  // erreichten alle Kennzahlen jeden angemeldeten Client, auch die Rollen,
  // die laut sichtbarFuer keine einzige sehen sollen. Die ausfuehrliche
  // Begruendung steht in src/app/[locale]/dashboard/page.tsx.
  let sichtbareKpis = kpis;
  if (profil) {
    const { kern, erweitert } = kpisFuerRolle(profil.role, kpis);
    sichtbareKpis = [...kern, ...erweitert];
  }

  // Die Zone schneidet die Liste zu, bevor sie den Server verlaesst. Die
  // Seite zeigt ohnehin nur ihre eigene Zone, und was gar nicht erst
  // ausgeliefert wird, steht auch nicht im Browser.
  const zonenKpis = sichtbareKpis.filter((kpi) => kpi.zone === zone);

  return <ZonePageBody zone={zone as ZoneKey} kpis={zonenKpis} quelle={quelle} />;
}
