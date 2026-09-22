import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { KachelLabor } from "@/components/dashboard/kachel-labor";
import { ladeKpis } from "@/lib/data/kpis";
import { ladeLaborDaten } from "@/lib/data/kachel-labor";
import { getSessionProfile } from "@/lib/auth";

// Kachel-Labor: die vorgeschlagenen Darstellungsformen einmal nebeneinander,
// mit echten Werten. Eine Referenzseite fuer die Oberflaeche, kein Fachmodul -
// deshalb steht sie wie /dashboard/sicherheit ausserhalb von lib/modules.ts
// und traegt kein RBAC-Gate auf einer Ressource.
//
// Sichtbar nur fuer admin. Die Seite vergleicht Entwuerfe, sie gehoert nicht
// in den Arbeitsweg einer Brigade oder eines Kunden. Im Demo-Modus (ohne
// Supabase) ist sie offen, dort gibt es ohnehin keine Anmeldung.

export default async function KachelLaborSeite({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const [{ kpis, quelle }, profil, daten] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
    ladeLaborDaten(),
  ]);

  // Gefiltert wird nach der echten Profilrolle, nicht nach der clientseitig
  // umschaltbaren Persona - die kennt der Server gar nicht.
  if (profil && profil.role !== "admin") notFound();

  return <KachelLabor kpis={kpis} daten={daten} quelle={quelle} />;
}
