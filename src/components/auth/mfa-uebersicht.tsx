import { getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { ladeMfaUebersicht } from "@/lib/data/mfa";

// MFA-Status aller Konten (WMCNL-2479), nur fuer die Administration: sie sieht auf
// einen Blick, welche Konten ohne zweiten Faktor arbeiten. Die Seite danach
// verwaltet nur den eigenen Faktor. Konten ohne Schutz stehen oben, weil sie der
// Grund sind, hier nachzusehen.
//
// Schlaegt die Abfrage fehl, steht das da. Eine leere Liste wuerde sonst wie
// "niemand hat MFA" oder wie "alle sind sicher" gelesen.
export async function MfaUebersicht() {
  const [uebersicht, t, rollenT] = await Promise.all([
    ladeMfaUebersicht(),
    getTranslations("mfa.uebersicht"),
    getTranslations("roles"),
  ]);

  if (!uebersicht.geladen) {
    return (
      <Section title={t("titel")} description={t("lead")}>
        <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("nichtGeladen")}</Card>
      </Section>
    );
  }

  const { konten } = uebersicht;
  const geschuetzt = konten.filter((k) => k.faktoren > 0).length;
  const offen = konten.length - geschuetzt;

  return (
    <Section title={t("titel")} description={t("lead")}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label={t("konten")} value={String(konten.length)} />
        <Stat label={t("geschuetzt")} value={String(geschuetzt)} tone="success" />
        <Stat
          label={t("ungeschuetzt")}
          value={String(offen)}
          tone={offen > 0 ? "warning" : "success"}
          helper={offen > 0 ? t("ungeschuetztHinweis") : undefined}
        />
      </div>
      <DataTable head={[t("col.name"), t("col.rolle"), t("col.email"), t("col.status")]}>
        {konten.length === 0 ? (
          <tr>
            <td colSpan={4} className="px-3 py-3 text-xs text-muted-foreground">
              {t("keineKonten")}
            </td>
          </tr>
        ) : (
          konten.map((k) => (
            <tr key={k.profilId}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{k.name}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{rollenT(k.rolle)}</td>
              <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">{k.email ?? "-"}</td>
              <td className="px-3 py-2.5">
                {k.faktoren > 0 ? (
                  <StatusPill tone="success">{t("aktiv", { anzahl: k.faktoren })}</StatusPill>
                ) : (
                  <StatusPill tone="warning">{t("nichtEingerichtet")}</StatusPill>
                )}
              </td>
            </tr>
          ))
        )}
      </DataTable>
    </Section>
  );
}
