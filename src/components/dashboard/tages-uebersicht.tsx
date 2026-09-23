import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section, StatusPill, knopfKlassen } from "@/components/ui/kit";
import { CeoAktualisierenKnopf } from "@/components/dashboard/ceo-aktualisieren-knopf";
import { TagesKopf } from "@/components/dashboard/tages-kopf";
import { TagesKachelnLive } from "@/components/dashboard/tages-kacheln-live";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";

// Der Compliance-Report auf der Startseite, fuer die Rollen ceo und admin - die Weiche steht
// in dashboard/page.tsx ueber darfCeoBerichtLesen().
//
// Ein Block, nicht mehr zwei: Zusammenfassung, Prioritaeten, die vier Bereichskacheln und der
// zugeklappte Rest stehen wieder zusammen, so wie in main. Die Reiter, die beides kurzzeitig
// getrennt haben, sind am 23.09.2026 wieder entfallen - die Bereiche stehen jetzt als eigener
// Block unter dem Report statt hinter einem Reiter.
//
// Der Bericht wird hier und in TagesKachelnLive gebraucht; letzterCeoBericht() haengt in
// React.cache(), es bleibt eine Abfrage je Anforderung.
export async function TagesUebersicht() {
  const [t, format, zeile] = await Promise.all([
    getTranslations("ceoUebersicht"),
    getFormatter(),
    letzterCeoBericht(),
  ]);

  return (
    <Section
      title={t("titel")}
      description={t("untertitel")}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {zeile ? (
            <StatusPill tone="neutral">
              {t("zuletztGeprueft", {
                datum: format.dateTime(new Date(zeile.erstelltAm), {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: betriebsZeitzone,
                }),
              })}
            </StatusPill>
          ) : null}
          <CeoAktualisierenKnopf />
        </div>
      }
    >
      <div className="space-y-4">
        <TagesKopf initialBericht={zeile?.bericht ?? null} initialAenderungen={zeile?.aenderungen ?? []} />
        <TagesKachelnLive initialBericht={zeile?.bericht ?? null} initialAenderungen={zeile?.aenderungen ?? []} />

        <div>
          <Link
            href="/dashboard/compliance"
            className={knopfKlassen({ variante: "leise", rundung: "schmal", groesse: "formular" })}
          >
            {t("vollerBericht")}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Section>
  );
}
