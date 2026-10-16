import { getFormatter, getTranslations } from "next-intl/server";
import { Aufklapper, Card, DataTable, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { IntegrationKonfigurationFormular, JetztAusliefernFormular, OutboxWiederholenKnopf } from "@/components/db/integration-auslieferung-formulare";
import { ladeAuslieferung } from "@/lib/data/integration-auslieferung";
import { MAX_VERSUCHE, type OutboxStatus } from "@/lib/domain/integration-auslieferung";
import { getSessionProfile } from "@/lib/auth";

// Auslieferung an Partnersysteme (WMCNL-1627, WMCNL-2290): welche Integration wohin ausliefert und was in der Warteschlange steht.
// Das ist der Rahmen fuer die Stufe 2 von ЭСФ und ЕСУТД und fuer einen Partner wie die Buchhaltung. Standard ist aus: ohne
// ausdrueckliche Aktivierung verlaesst kein Datensatz das System. Konfigurieren und Wiederholen duerfen nur Administration und
// Geschaeftsfuehrung.

const statusTon: Record<OutboxStatus, Tone> = { pending: "warning", sent: "success", acked: "success", failed: "danger" };

export async function IntegrationAuslieferungAnsicht() {
  const [t, format, profil, daten] = await Promise.all([getTranslations("integrationAuslieferung"), getFormatter(), getSessionProfile(), ladeAuslieferung()]);
  if (!daten) return null;

  const darfKonfigurieren = profil?.role === "admin" || profil?.role === "ceo";
  const zeit = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "short", timeStyle: "short" });
  const statusText: Record<OutboxStatus, string> = {
    pending: t("warteschlange.status.pending"),
    sent: t("warteschlange.status.sent"),
    acked: t("warteschlange.status.acked"),
    failed: t("warteschlange.status.failed"),
  };
  const adapterText: Record<string, string> = { manuell: t("integrationen.adapter.manuell"), webhook: t("integrationen.adapter.webhook") };

  return (
    <Section title={t("titel")} description={t("lead")}>
      <div className="space-y-4">
        <Card ton="innen" className="space-y-1 p-4">
          <p className="schrift-dense text-card-foreground">{t("stand")}</p>
          <p className="schrift-label text-muted-foreground">{t("cron")}</p>
          {!darfKonfigurieren ? <p className="schrift-label text-muted-foreground">{t("nurAdmin")}</p> : null}
        </Card>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-card-foreground">{t("integrationen.titel")}</p>
          <div className="space-y-2">
            {daten.integrationen.map((i) => (
              <Card key={i.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-foreground">{i.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {i.system} · {adapterText[i.adapter] ?? i.adapter}
                      {i.zielHost ? ` · ${i.zielHost}` : ` · ${t("integrationen.keinZiel")}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusPill tone={i.aktiv ? "success" : "neutral"}>{i.aktiv ? t("integrationen.aktiv") : t("integrationen.aus")}</StatusPill>
                    {i.vorlage !== "" ? <StatusPill tone="info">{t("integrationen.vorlage")}</StatusPill> : null}
                    {i.adapter === "webhook" && i.authArt === "basic" ? (
                      <StatusPill tone={i.zugangGesetzt ? "success" : "warning"}>{i.zugangGesetzt ? t("integrationen.zugangGesetzt") : t("integrationen.zugangFehlt", { name: i.zugangName ?? "-" })}</StatusPill>
                    ) : null}
                    {i.adapter === "webhook" && i.geheimnisName ? (
                      <StatusPill tone={i.geheimnisGesetzt ? "success" : "warning"}>{i.geheimnisGesetzt ? t("integrationen.geheimnisGesetzt") : t("integrationen.geheimnisFehlt", { name: i.geheimnisName })}</StatusPill>
                    ) : null}
                  </div>
                </div>
                {darfKonfigurieren ? (
                  <Aufklapper titel={t("integrationen.aendern")}>
                    <IntegrationKonfigurationFormular integration={i} />
                  </Aufklapper>
                ) : null}
              </Card>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-card-foreground">{t("warteschlange.titel")}</p>
            <div className="flex flex-wrap gap-1.5">
              {(["pending", "sent", "failed"] as const).map((s) => (
                <StatusPill key={s} tone={statusTon[s]}>
                  {statusText[s]} {daten.zaehlung[s]}
                </StatusPill>
              ))}
            </div>
          </div>
          {daten.eintraege.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("warteschlange.leer")}</p>
          ) : (
            <DataTable head={[t("warteschlange.col.ereignis"), t("warteschlange.col.ziel"), t("warteschlange.col.status"), t("warteschlange.col.versuche"), t("warteschlange.col.naechster"), ...(darfKonfigurieren ? [""] : [])]}>
              {daten.eintraege.map((e) => (
                <tr key={e.id}>
                  <td className="px-3 py-2.5">
                    <span className="font-semibold text-foreground">{e.ereignis ?? t("warteschlange.ohneEreignis")}</span>
                    {e.letzterFehler ? <span className="mt-0.5 block text-[11px] text-destructive">{e.letzterFehler}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {e.zielSystem}
                    {e.integrationKey ? null : <span className="block text-[11px]">{t("warteschlange.ohneIntegration")}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <StatusPill tone={statusTon[e.status]}>{statusText[e.status]}</StatusPill>
                    {e.status === "sent" && e.bestaetigungErwartet ? <StatusPill tone="warning">{t("warteschlange.bestaetigungOffen")}</StatusPill> : null}
                    {e.antwortStatus ? <span className="ml-1.5 text-[11px] text-muted-foreground">HTTP {e.antwortStatus}</span> : null}
                  </td>
                  <td className="px-3 py-2.5 text-muted-foreground">{t("warteschlange.versucheVon", { versuche: e.versuche, max: MAX_VERSUCHE })}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{e.status === "pending" && e.integrationKey ? zeit(e.naechsterVersuchAm) : e.verarbeitetAm ? zeit(e.verarbeitetAm) : "-"}</td>
                  {darfKonfigurieren ? <td className="px-3 py-2.5">{e.status === "failed" ? <OutboxWiederholenKnopf id={e.id} /> : null}</td> : null}
                </tr>
              ))}
            </DataTable>
          )}
          {darfKonfigurieren ? (
            <div className="mt-3">
              <JetztAusliefernFormular />
            </div>
          ) : null}
        </div>
      </div>
    </Section>
  );
}
