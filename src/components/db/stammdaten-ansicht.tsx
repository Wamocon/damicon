import { getTranslations } from "next-intl/server";
import { Card, Section, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { StammdatenZeileFormular } from "@/components/db/stammdaten-formulare";
import { ladeStammdaten } from "@/lib/data/stammdaten";
import { STAMMDATEN_GRUPPEN } from "@/lib/domain/stammdaten";

// Rechtsform und ИИН/БИН fuer Betrieb, Zulieferer und Kunden (Anforderung E.11).
//
// Nach Gruppe gegliedert, weil die drei unterschiedlich dringend sind: Ohne
// die Nummer des eigenen Betriebs laesst sich gar kein Beleg ausstellen, ohne
// die eines Kunden nur dessen Rechnung nicht. Die Zaehlung je Gruppe macht
// sichtbar, wie weit die Erhebung ist - eine leere Liste "noch offen" ist das
// Ziel, nicht eine lange Liste gepflegter Zeilen.
export async function StammdatenAnsicht() {
  const [uebersicht, t] = await Promise.all([ladeStammdaten(), getTranslations("stammdatenAnsicht")]);

  const offen = uebersicht.zeilen.filter((z) => z.identifikationsnummer === null).length;

  return (
    <div className="space-y-6">
      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <Card className="flex flex-wrap items-center gap-3 text-xs">
          <StatusPill tone={offen === 0 ? "success" : "warning"}>
            {offen === 0 ? t("alleGepflegt") : t("nochOffen", { anzahl: offen })}
          </StatusPill>
          <span className="text-muted-foreground">
            {t("gesamt", { anzahl: uebersicht.zeilen.length })}
          </span>
        </Card>
      </Section>

      {STAMMDATEN_GRUPPEN.map((gruppe) => {
        const zeilen = uebersicht.zeilen.filter((z) => z.gruppe === gruppe);
        if (zeilen.length === 0) return null;
        return (
          <Section key={gruppe} title={t(`gruppe.${gruppe}`)} description={t(`gruppeLead.${gruppe}`)}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {zeilen.map((zeile) => (
                <StammdatenZeileFormular key={`${zeile.gruppe}-${zeile.id}`} zeile={zeile} />
              ))}
            </div>
          </Section>
        );
      })}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
