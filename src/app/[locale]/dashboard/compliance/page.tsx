import { notFound } from "next/navigation";
import { getFormatter, getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card, PageHeader, StatusPill, knopfKlassen } from "@/components/ui/kit";
import { ComplianceBerichtAnsicht } from "@/components/dashboard/compliance-bericht-ansicht";
import { getSessionProfile } from "@/lib/auth";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";
import { darfCeoBerichtLesen } from "@/lib/pruefung/rollen";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Der zuletzt gespeicherte Compliance-Gesamtbericht in voller Laenge: Befunde mit Filter,
// Massnahmenplan, Hinweise, Siegel und der PDF-Export. Bis zum 23.09.2026 stand all das inline
// auf der Startseite und machte sie unlesbar lang; jetzt fuehrt jede Bereichskachel hierher.
//
// Eine Seite und kein Blatt, aus drei Gruenden: ein Blatt ist ohne JavaScript nichts (DESIGN.md
// Regel 6), waehrend PruefungBericht zwar eine Client-Komponente ist, aber serverseitig
// vollstaendig vorgerendert ausgeliefert wird - ohne JavaScript fehlen nur Filterknoepfe und
// Siegelpruefung, der Inhalt steht da. Siegel und PDF will man verlinken und drucken koennen,
// ein Blatt hat keine eigene Adresse und traegt print:hidden. Und der lange Block verschwindet
// so dauerhaft von der Startseite, statt sich hinter einem Zustand zu verstecken.
//
// Kontoseite neben [zone], wie /dashboard/sicherheit: "compliance" kollidiert mit keinem
// Zonen-Slug (feld, hof, buero, markt). Nicht zu verwechseln mit dem Modul compliance in der
// Zone Buero (/dashboard/buero/compliance, Datenschutz und MwSt) - das bleibt, wo es ist.
export default async function ComplianceBerichtSeite({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const profil = await getSessionProfile();
  // Serverseitig entschieden, wie in [module]/page.tsx. Im Demo-Betrieb ohne Supabase gibt es
  // keinen gespeicherten Bericht und damit auch nichts zu zeigen.
  if (!isSupabaseConfigured() || !darfCeoBerichtLesen(profil?.role)) notFound();

  const [t, format, zeile] = await Promise.all([
    getTranslations({ locale, namespace: "complianceBericht" }),
    getFormatter(),
    letzterCeoBericht(),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={
          <Link
            href="/dashboard"
            className={knopfKlassen({ variante: "leise", rundung: "schmal", groesse: "formular" })}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("zurueck")}
          </Link>
        }
        title={t("titel")}
        description={t("lead")}
      >
        {zeile ? (
          <StatusPill tone="neutral">
            {t("stand", {
              datum: format.dateTime(new Date(zeile.erstelltAm), {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: betriebsZeitzone,
              }),
            })}
          </StatusPill>
        ) : null}
      </PageHeader>

      {zeile ? (
        <ComplianceBerichtAnsicht bericht={zeile.bericht} />
      ) : (
        <Card ton="box" className="text-center text-xs text-muted-foreground">
          {t("keinBericht")}
        </Card>
      )}
    </div>
  );
}
