import { getFormatter, setRequestLocale } from "next-intl/server";
import { DashboardHome } from "@/components/dashboard/home";
import { CeoComplianceUebersicht } from "@/components/dashboard/ceo-compliance-uebersicht";
import { FinanzVorschau } from "@/components/dashboard/finanz-vorschau";
import { ladeKpis } from "@/lib/data/kpis";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";
import { hasPermission } from "@/lib/rbac";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import {
  betriebsZeitzone,
  spruchIndex,
  tageszeitBestimmen,
} from "@/lib/domain/tageszeit";

// Anforderung aus dem Auftrag vom 22.09.2026: der manuelle "Jetzt neu
// pruefen"-Knopf der CEO-Uebersicht ist eine Server Action auf dieser Seite
// und kann je nach Aenderungslage mehrere Modellaufrufe brauchen - derselbe
// Wert wie app/api/ki-pruefung/route.ts fuer denselben zugrunde liegenden
// Lauf (fuehrePruefungAus()).
export const maxDuration = 300;

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  // Die Baseline-Kennzahlen kommen aus public.kpi_baseline (Meilenstein B).
  const [{ kpis, quelle }, profil, format] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
    getFormatter(),
  ]);

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

  // Tageszeit und Satz der Begruessung bestimmt der Server. Rechnete der
  // Browser sie selbst, stuende im ausgelieferten HTML eine andere
  // Begruessung als nach der Hydration.
  // Wie in [module]/page.tsx: gefiltert wird nach der echten Profilrolle, und
  // im Demo-Betrieb ohne Supabase ist alles offen - dort gibt es keine
  // Anmeldung und ohnehin nur Beispielwerte.
  const darfFinanzenSehen = isSupabaseConfigured()
    ? hasPermission(profil?.role, "finanzen", "view")
    : true;

  const jetzt = new Date();

  return (
    <DashboardHome
      kpis={sichtbareKpis}
      quelle={quelle}
      tageszeit={tageszeitBestimmen(jetzt)}
      datum={format.dateTime(jetzt, {
        dateStyle: "full",
        timeZone: betriebsZeitzone,
      })}
      spruch={spruchIndex(jetzt)}
      // Auch fuer admin schon serverseitig geladen (RLS erlaubt has_role('ceo','admin')
      // den Lesezugriff): die Sichtbarkeit fuer eine Admin-Vorschau "als ceo" entscheidet
      // client-seitig home.tsx anhand der Vorschau-Rolle, siehe dortiger Kommentar.
      ceoUebersicht={profil?.role === "ceo" || profil?.role === "admin" ? <CeoComplianceUebersicht /> : null}
      finanzVorschau={darfFinanzenSehen ? <FinanzVorschau /> : null}
    />
  );
}
