import { getTranslations } from "next-intl/server";
import { Plus } from "lucide-react";
import { Card, Section, StatusPill, knopfKlassen } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { KanalAnlegenFormular, KanalBearbeitenFormular } from "@/components/db/kanaele-formulare";
import { ladeKanaele } from "@/lib/data/kanaele";
import { LeererZustand } from "@/components/ui/liste";
import { ZumFormular } from "@/components/ui/zum-formular";
import { modulSymbol } from "@/lib/modules";
import { formularZiel } from "@/lib/formular-ziele";

// Verwaltung der lokalen Kontaktkanaele/Zahlungswege (Anforderung 5.6). Reine
// Anzeige/Verwaltung, keine echte API-Integration - siehe domain/kanaele.ts.
export async function KanaeleAnsicht() {
  const [uebersicht, t] = await Promise.all([ladeKanaele(), getTranslations("kanaeleAnsicht")]);

  return (
    <div className="space-y-6">
      <Section
        title={t("titel")}
        description={t("lead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.kanaele.length === 0 ? (
          <LeererZustand
            titel={t("keineKanaele")}
            {...modulSymbol("kanaele")}
            bewegt
            aktion={
              <ZumFormular ziel={formularZiel.kanal} className={knopfKlassen()}>
                <Plus className="h-4 w-4" aria-hidden="true" />
                {t("anlegenTitel")}
              </ZumFormular>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uebersicht.kanaele.map((kanal) => (
              <div key={kanal.id} className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(`typ.${kanal.typ}`)}
                  </span>
                  <StatusPill tone={kanal.aktiv ? "success" : "neutral"}>
                    {kanal.aktiv ? t("aktivPill") : t("entwurfPill")}
                  </StatusPill>
                </div>
                <KanalBearbeitenFormular kanal={kanal} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <KanalAnlegenFormular />

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
