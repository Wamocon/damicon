import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { DashboardHome } from "@/components/dashboard/home";
import { BereicheReiter } from "@/components/dashboard/bereiche-reiter";
import { FinanzenReiter } from "@/components/dashboard/finanzen-reiter";
import { TagesUebersicht } from "@/components/dashboard/tages-uebersicht";
import { TagesCompliance } from "@/components/dashboard/tages-compliance";
import { Reiter } from "@/components/ui/kit";
import { ladeKpis } from "@/lib/data/kpis";
import { getSessionProfile } from "@/lib/auth";
import { kpisFuerRolle } from "@/lib/domain/kpis";
import { reiterAusText, reiterFuer } from "@/lib/domain/uebersicht-reiter";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
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
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ locale }, suche] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  // Die Baseline-Kennzahlen kommen aus public.kpi_baseline (Meilenstein B).
  const [{ kpis, quelle }, profil, format, t] = await Promise.all([
    ladeKpis(),
    getSessionProfile(),
    getFormatter(),
    getTranslations("dashboard.reiter"),
  ]);

  // WMC-Vibecode-Cleanup: kpisFuerRolle() lief bisher ausschliesslich
  // clientseitig in DashboardHome. Ohne diesen serverseitigen Vorfilter
  // erreichten alle 14 Kennzahlen - darunter vertrauliche Werte wie
  // Deckungsbeitrag oder Verlustquote - jeden angemeldeten Client, auch
  // picker/erzeuger/kunde, die laut sichtbarFuer keine einzige sehen sollen.
  // Gefiltert wird nach der echten Profilrolle (nicht der clientseitig
  // umschaltbaren Persona-Rolle, die der Server gar nicht kennt) - ein Admin
  // in der Vorschau bekommt weiterhin alle Kennzahlen vom Server und filtert
  // clientseitig fuer die Vorschau weiter (kennzahlen-reiter.tsx), demoModus
  // (profil === null) bleibt unveraendert, da dort ohnehin nur
  // Platzhalterwerte fuer Interessenten gezeigt werden.
  let sichtbareKpis = kpis;
  if (profil) {
    const { kern, erweitert } = kpisFuerRolle(profil.role, kpis);
    sichtbareKpis = [...kern, ...erweitert];
  }

  // Wie in [module]/page.tsx: gefiltert wird nach der echten Profilrolle, und
  // im Demo-Betrieb ohne Supabase ist alles offen - dort gibt es keine
  // Anmeldung und ohnehin nur Beispielwerte.
  const darfFinanzenSehen = isSupabaseConfigured()
    ? hasPermission(profil?.role, "finanzen", "view")
    : true;

  // Die Tages-Uebersicht gilt seit dem 23.09.2026 fuer ceo UND admin. Entschieden wird an der
  // ECHTEN Profilrolle, nicht an der clientseitig umschaltbaren Vorschau-Rolle - dieselbe
  // Abgrenzung wie in ceo-pruefung-kontext.tsx. Im Demo-Betrieb ohne Supabase gibt es keinen
  // gespeicherten Bericht, dort stuende sonst eine leere Karte.
  const zeigtCompliance = isSupabaseConfigured() && darfCeoBerichtLesen(profil?.role);

  // Welche Reiter diese Person bekommt. Bewusst an der ECHTEN Rolle und serverseitig: haengte
  // die Reiterleiste an der clientseitig umschaltbaren Vorschau-Rolle, stuende sie erst nach
  // der Hydration fest - und damit funktionierte der Reiterwechsel nicht mehr ohne
  // JavaScript. Ein Admin in der Vorschau "als picker" sieht deshalb weiter alle Reiter, der
  // Kennzahleninhalt darin ist aber leer gefiltert.
  const erlaubt = reiterFuer({ compliance: zeigtCompliance, finanzen: darfFinanzenSehen });
  // Ein doppelter Parameter in der Adresszeile kommt als Array an; dann gilt der Standard.
  const aktiv = reiterAusText(typeof suche.reiter === "string" ? suche.reiter : undefined, erlaubt);

  const jetzt = new Date();

  return (
    <DashboardHome
      tageszeit={tageszeitBestimmen(jetzt)}
      datum={format.dateTime(jetzt, {
        dateStyle: "full",
        timeZone: betriebsZeitzone,
      })}
      spruch={spruchIndex(jetzt)}
      kopf={zeigtCompliance ? <TagesUebersicht /> : null}
      reiter={
        // Ein Reiter allein ist keiner: dann steht sein Inhalt direkt da.
        erlaubt.length > 1 ? (
          <Reiter
            label={t("label")}
            aktiv={aktiv}
            eintraege={erlaubt.map((wert) => ({ wert, text: t(wert) }))}
            // Die Uebersicht kennt sonst keine Filter, die ein Reiterwechsel mitnehmen
            // muesste - anders als die Finanzseite reicht hier der eine Parameter.
            ziel={(wert) => ({ pathname: "/dashboard", query: { reiter: wert } })}
          />
        ) : null
      }
      inhalt={
        aktiv === "compliance" ? (
          <TagesCompliance />
        ) : aktiv === "finanzen" ? (
          <FinanzenReiter />
        ) : (
          <BereicheReiter kpis={sichtbareKpis} quelle={quelle} />
        )
      }
    />
  );
}
