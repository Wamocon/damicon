import { getFormatter, getTranslations } from "next-intl/server";
import { Landmark, ShieldAlert, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Card } from "@/components/ui/kit";
import { FaelligkeitAnzeige } from "@/components/db/faelligkeit-anzeige";
import { risikoAufbereiten, type RisikoEintrag, type RisikoKategorie } from "@/lib/domain/risikoradar";

// Das Risiko-Radar (Migration 20261025000000 + Compliance-Fristen): die eine
// Stelle, an der Fristen aus drei unabhaengigen Rechtsgrundlagen (MwSt-
// Registrierung, ESUTD-Arbeitsvertraege, Datenschutz-Meldefristen)
// zusammenlaufen. Zeigt und verlinkt, bearbeitet selbst nichts - das bleibt
// Aufgabe des jeweiligen Fachmoduls.
//
// Bewusst KEIN erfundener "Risiko-Score": eine einzelne Zahl, die drei
// unvergleichbare Rechtsfolgen (eine Steuerfrist, eine Arbeitsrechtsfrist,
// eine Datenschutzfrist) zu einem Punktwert verrechnet, waere praezise
// aussehende Willkuer. Der Radar sortiert nach Dringlichkeit, erfindet aber
// keine Kennzahl ueber die Fristen hinaus.

const kategorieIcon: Record<RisikoKategorie, typeof Landmark> = {
  steuer: Landmark,
  arbeit: UserRound,
  datenschutz: ShieldAlert,
};

export async function RisikoRadar({ eintraege }: { eintraege: RisikoEintrag[] }) {
  const t = await getTranslations("complianceAnsicht.risikoRadar");
  const format = await getFormatter();
  const { sortiert, ueberfaelligAnzahl } = risikoAufbereiten(eintraege);

  return (
    <Card id="risiko-radar" className="risiko-radar scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">{t("titel")}</h3>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{t("lead")}</p>
        </div>
        {sortiert.length > 0 ? (
          <span
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${
              ueberfaelligAnzahl > 0
                ? "border-danger/30 bg-danger/10 text-danger risiko-radar-puls"
                : "border-warning/30 bg-warning/10 text-warning"
            }`}
          >
            {t("anzahlOffen", { anzahl: sortiert.length })}
          </span>
        ) : null}
      </div>

      {sortiert.length === 0 ? (
        <div className="flex items-center gap-3 rounded-xl border border-success/25 bg-success/[0.06] px-4 py-4">
          <ShieldCheck className="h-6 w-6 shrink-0 text-success" />
          <p className="text-xs leading-5 text-foreground">{t("alleErledigt")}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sortiert.map((eintrag, index) => {
            const Icon = kategorieIcon[eintrag.kategorie];
            const { ueberfaellig } = eintrag;
            return (
              <li
                key={eintrag.id}
                className={`risiko-radar-eintrag flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
                  ueberfaellig ? "border-danger/30 bg-danger/[0.05]" : "border-border bg-card"
                }`}
                style={{ animationDelay: `${index * 70}ms` }}
              >
                <span
                  className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    ueberfaellig ? "bg-danger/15 text-danger" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-foreground">{eintrag.label}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {t(`kategorie.${eintrag.kategorie}`)} ·{" "}
                    {format.dateTime(new Date(eintrag.faelligkeit), { dateStyle: "medium" })}
                  </p>
                </div>
                <FaelligkeitAnzeige faelligkeit={eintrag.faelligkeit} />
                <Link
                  href={eintrag.ziel}
                  className="text-[11px] font-semibold text-primary underline-offset-2 hover:underline"
                >
                  {t("ansehen")}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
