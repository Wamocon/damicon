import { getFormatter, getTranslations } from "next-intl/server";
import { Section, StatusPill } from "@/components/ui/kit";
import { CeoAktualisierenKnopf } from "@/components/dashboard/ceo-aktualisieren-knopf";
import { TagesKopf } from "@/components/dashboard/tages-kopf";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";

// "Das Wichtigste heute" fuer die Rollen ceo und admin - die Weiche steht in
// dashboard/page.tsx ueber darfCeoBerichtLesen().
//
// Steht oberhalb der Reiterleiste und ist damit in jedem Reiter sichtbar: wer auf
// "Kennzahlen" steht, soll trotzdem sehen, dass in den Steuern zwei kritische Punkte offen
// sind. Die fuenf Kacheln und der Rest des Berichts stehen dagegen im Reiter "Lage"
// (tages-lage.tsx).
//
// Der Bericht wird hier und dort geladen; letzterCeoBericht() haengt in React.cache(),
// es bleibt eine Abfrage je Anforderung.
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
      <TagesKopf initialBericht={zeile?.bericht ?? null} initialAenderungen={zeile?.aenderungen ?? []} />
    </Section>
  );
}
