import { getLocale, getTranslations } from "next-intl/server";
import { CheckCircle2 } from "lucide-react";
import { Card, Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { Icon } from "@/components/icon";
import { SchrittAbhakenKnopf } from "@/components/db/einarbeitung-formulare";
import { ladeEinarbeitung } from "@/lib/data/einarbeitung";
import { getSessionProfile } from "@/lib/auth";
import type { Locale } from "@/i18n/routing";

// Mehrsprachige Kurzeinarbeitung als bebilderte Checkliste (Anforderung
// 2.12). Bebildert ueber ein Lucide-Icon je Schritt statt eigener
// Bilddateien - automatisch offline verfuegbar, gleiches Prinzip wie die
// Qualitaetsreferenz aus Anforderung 2.9.
export async function EinarbeitungAnsicht() {
  const [locale, profil, t] = await Promise.all([
    getLocale(),
    getSessionProfile(),
    getTranslations("einarbeitungAnsicht"),
  ]);

  const uebersicht = await ladeEinarbeitung(locale as Locale, profil?.pflueckerId ?? null);
  const erledigteAnzahl = uebersicht.schritte.filter((s) => s.erledigt).length;

  return (
    <div className="space-y-6">
      <Section
        title={t("titel")}
        description={
          uebersicht.darfAbhaken
            ? t("leadEigen")
            : t("leadReferenz")
        }
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.darfAbhaken ? (
          <p className="mb-3 text-xs font-semibold text-muted-foreground">
            {t("fortschritt", {
              erledigt: erledigteAnzahl,
              gesamt: uebersicht.schritte.length,
            })}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          {uebersicht.schritte.map((schritt) => (
            <Card
              key={schritt.id}
              className={schritt.erledigt ? "border-success/30 bg-success/[0.04]" : undefined}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                    schritt.erledigt ? "bg-success/15 text-success" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon name={schritt.icon} className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-sm font-black text-card-foreground">
                    {schritt.titel}
                    {schritt.erledigt ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" />
                    ) : null}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {schritt.beschreibung}
                  </p>
                  {uebersicht.darfAbhaken && !schritt.erledigt ? (
                    <SchrittAbhakenKnopf schrittId={schritt.id} />
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>
    </div>
  );
}
