import { setRequestLocale } from "next-intl/server";
import { DashboardHome } from "@/components/dashboard/home";
import { ladeKpis } from "@/lib/data/kpis";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Die Baseline-Kennzahlen kommen aus public.kpi_baseline (Meilenstein B).
  const [{ kpis, quelle }, profil] = await Promise.all([ladeKpis(), getSessionProfile()]);

  // WMC-Vibecode-Cleanup: kpisFuerRolle() lief bisher ausschliesslich
  // clientseitig in DashboardHome (dort noetig fuer die "Ansicht als"-Vorschau
  // eines Admins, siehe usePersona()). Ohne diesen serverseitigen Vorfilter
  // erreichten alle 14 Kennzahlen - darunter vertrauliche Werte wie
  // Deckungsbeitrag oder Verlustquote - jeden angemeldeten Client, auch
  // picker/erzeuger/kunde, die laut sichtbarFuer keine einzige sehen sollen.
  // Gefiltert wird nach der echten Profilrolle (nicht der clientseitig
  // umschaltbaren Persona-Rolle, die der Server gar nicht kennt) - ein Admin
  // in der Vorschau bekommt weiterhin alle Kennzahlen vom Server und filtert
  // clientseitig fuer die Vorschau weiter, demoModus (profil === null) bleibt
  // unveraendert, da dort ohnehin nur Platzhalterwerte fuer Interessenten
  // gezeigt werden.
  let sichtbareKpis = kpis;
  if (profil) {
    const { kern, erweitert } = kpisFuerRolle(profil.role, kpis);
    sichtbareKpis = [...kern, ...erweitert];
  }

  return <DashboardHome kpis={sichtbareKpis} quelle={quelle} />;
}
