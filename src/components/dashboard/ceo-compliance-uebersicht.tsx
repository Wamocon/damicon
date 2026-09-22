import { getFormatter, getTranslations } from "next-intl/server";
import { Section, StatusPill } from "@/components/ui/kit";
import { CeoAktualisierenKnopf } from "@/components/dashboard/ceo-aktualisieren-knopf";
import { CeoAutoPruefung } from "@/components/dashboard/ceo-auto-pruefung";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";

// Nur fuer die Rolle ceo auf der Startseite eingebunden (siehe home.tsx). Laedt den
// letzten gespeicherten Bericht als Ausgangspunkt (lib/data/compliance-ceo.ts); die
// eigentliche Anzeige (live waehrend ein Lauf arbeitet, sonst der aktuellste Bericht mit
// den Aenderungen seit dem vorigen) steckt in CeoAutoPruefung.
export async function CeoComplianceUebersicht() {
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
      {/* key auf die Berichts-Id: aendert sie sich (frischer Bericht, z. B. ueber den manuellen
          Knopf gespeichert), startet eine neue Instanz sauber mit dem neuen Stand statt an einem
          veralteten Live-Zustand aus einem vorigen Lauf festzuhalten. */}
      <CeoAutoPruefung key={zeile?.id ?? "leer"} initialBericht={zeile?.bericht ?? null} initialAenderungen={zeile?.aenderungen ?? []} />
    </Section>
  );
}
