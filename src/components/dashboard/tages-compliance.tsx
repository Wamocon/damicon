import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Section, knopfKlassen } from "@/components/ui/kit";
import { TagesKachelnLive } from "@/components/dashboard/tages-kacheln-live";
import { letzterCeoBericht } from "@/lib/data/compliance-ceo";

// Der Reiter "CEO-Compliance": die vier Pruefbereiche Audit, Steuern, Recht und Risiko als Kacheln,
// darunter der zugeklappte Rest des Pruefberichts.
//
// Die Finanzen standen bis zum 23.09.2026 als fuenfte Kachel in dieser Reihe. Sie haben jetzt
// einen eigenen Reiter: auf 200 px Kachelbreite mussten die Betraege kompakt geschrieben
// werden ("1,0 M ₸"), im eigenen Reiter stehen sie wieder ausgeschrieben nebeneinander.
//
// Der Reiter erscheint nur fuer Rollen mit gespeichertem Compliance-Bericht, also ceo und
// admin (reiterFuer() in lib/domain/uebersicht-reiter.ts). Wer ihn nicht hat, faellt auf
// "Finanzen" oder "Bereiche" zurueck.
export async function TagesCompliance() {
  const [t, zeile] = await Promise.all([getTranslations("ceoUebersicht"), letzterCeoBericht()]);

  return (
    <Section title={t("complianceTitel")} description={t("complianceLead")}>
      <div className="tages-flaeche">
        <TagesKachelnLive
          initialBericht={zeile?.bericht ?? null}
          initialAenderungen={zeile?.aenderungen ?? []}
        />
      </div>

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
