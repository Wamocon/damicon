import { getFormatter, getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section, StatusPill, knopfKlassen } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { CeoAktualisierenKnopf } from "@/components/dashboard/ceo-aktualisieren-knopf";
import { CeoAutoPruefung } from "@/components/dashboard/ceo-auto-pruefung";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";
import { ladeFinanzVorschau, type FinanzVorschau } from "@/lib/data/finanzen";
import { betriebsZeitzone } from "@/lib/domain/tageszeit";

// "Das Wichtigste heute" auf der Startseite, fuer die Rollen ceo und admin (die Weiche steht
// in dashboard/page.tsx ueber darfCeoBerichtLesen()). Laedt den letzten gespeicherten Bericht
// (lib/data/compliance-ceo.ts) und - wenn die Rolle Finanzen sehen darf - die Zahlen des
// laufenden Monats fuer die fuenfte Kachel.
//
// Die eigentliche Anzeige steckt in CeoAutoPruefung: live, waehrend ein Lauf arbeitet, sonst
// der aktuellste Bericht als Kurzfassung mit den Aenderungen seit dem vorigen.
export async function TagesUebersicht({ mitFinanzen }: { mitFinanzen: boolean }) {
  const [t, format, zeile, vorschau] = await Promise.all([
    getTranslations("ceoUebersicht"),
    getFormatter(),
    letzterCeoBericht(),
    mitFinanzen ? ladeFinanzVorschau() : Promise.resolve<FinanzVorschau | null>(null),
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
          {/* Die Finanzkachel traegt ihre Quelle nicht selbst - sie steht zwischen vier
              Kacheln, die keine haben, und ein fuenftes Abzeichen in der Reihe waere Unruhe.
              Ein Lesefehler muss aber sichtbar bleiben: eine 0 mit "Live-Daten" daneben ist
              schlimmer als eine fehlende Zahl (siehe Commit 97ff7f8). */}
          {vorschau ? <DatenquelleBadge quelle={vorschau.quelle} /> : null}
          <CeoAktualisierenKnopf />
        </div>
      }
    >
      <CeoAutoPruefung
        initialBericht={zeile?.bericht ?? null}
        initialAenderungen={zeile?.aenderungen ?? []}
        vorschau={vorschau}
      />

      <div className="mt-4">
        <Link
          href="/dashboard/compliance"
          className={knopfKlassen({ variante: "leise", rundung: "schmal", groesse: "formular" })}
        >
          {t("vollerBericht")}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </Section>
  );
}
