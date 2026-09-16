import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { WetterAktualisierenFormular } from "@/components/db/wetter-formulare";
import { ladeWetterUebersicht } from "@/lib/data/wetter";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Wetteranbindung mit Temperatursummen-Heuristik (Anforderung 2.13). Reine
// Beobachtungsgroesse fuer die Mengenprognose, kein Prognosemodell - siehe
// domain/wetter.ts. Zeigt die letzten 14 Tage plus die seit Saisonbeginn
// (1. Januar) aufsummierte Temperatursumme.
export async function WetterAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeWetterUebersicht(),
    getSessionProfile(),
    getTranslations("wetterAnsicht"),
  ]);
  const format = await getFormatter();

  const darfAktualisieren =
    uebersicht.quelle !== "demo" && hasPermission(profil?.role, "rotationsplan", "update");

  const letzterTag = uebersicht.tage.at(-1) ?? null;
  const juengsteTage = uebersicht.tage.slice(-14).reverse();

  const tag = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  return (
    <div className="space-y-6">
      <Section
        title={t("summeTitel")}
        description={t("summeLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {letzterTag ? (
          <Card className="flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <p className="text-3xl font-black text-foreground">
                {format.number(letzterTag.temperatursumme, { maximumFractionDigits: 1 })}
                <span className="ml-1 text-sm font-semibold text-muted-foreground">°C-Tage</span>
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {t("seit")} {tag(uebersicht.tage[0]?.datum ?? letzterTag.datum)}
              </p>
            </div>
            <p className="max-w-sm text-[11px] leading-4 text-muted-foreground">{t("hinweis")}</p>
          </Card>
        ) : (
          <Card className="text-center text-xs text-muted-foreground">{t("keineDaten")}</Card>
        )}
      </Section>

      <Section title={t("tageTitel")} description={t("tageLead")}>
        {juengsteTage.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineDaten")}</Card>
        ) : (
          <DataTable
            head={[t("col.datum"), t("col.min"), t("col.max"), t("col.niederschlag"), t("col.summe")]}
          >
            {juengsteTage.map((tagWert) => (
              <tr key={tagWert.datum}>
                <td className="px-3 py-2.5 font-semibold text-foreground">{tag(tagWert.datum)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {tagWert.tempMinC === null ? "-" : `${format.number(tagWert.tempMinC, { maximumFractionDigits: 1 })} °C`}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {tagWert.tempMaxC === null ? "-" : `${format.number(tagWert.tempMaxC, { maximumFractionDigits: 1 })} °C`}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {tagWert.niederschlagMm === null ? "-" : `${format.number(tagWert.niederschlagMm, { maximumFractionDigits: 1 })} mm`}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-foreground">
                  {format.number(tagWert.temperatursumme, { maximumFractionDigits: 1 })}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>

      {darfAktualisieren ? <WetterAktualisierenFormular /> : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
