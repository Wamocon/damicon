import { getFormatter, getTranslations } from "next-intl/server";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { ladeLieferungen } from "@/lib/data/lieferungen";

const statusTon: Record<string, Tone> = {
  geplant: "neutral",
  zugestellt: "success",
  storniert: "danger",
};

const kuehlTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

// B2B-Portal (Anforderung 5.1/5.2): bisher ohne jede Oberflaeche. Diese
// erste Sektion zeigt "Meine Lieferungen" (Anforderung 5.2 Teil 2a) - RLS
// (lieferungen_select_kunde_buero) laesst eine Kunden-Anmeldung nur die
// eigene Firma sehen, eine Buero-Anmeldung sieht hier zur Vorschau denselben
// Inhalt wie der Kunde, ohne die Erfassungsformulare aus logistik-ansicht.tsx.
// Kontingente/Preisliste/Vorbestellung (Anforderung 5.1) sind bewusst noch
// nicht Teil dieser Ansicht - offene fachliche Festlegung, wie
// kontingente.reserviert_kg verbraucht/zurueckgesetzt wird.
export async function B2bPortalAnsicht() {
  const [uebersicht, t] = await Promise.all([
    ladeLieferungen(),
    getTranslations("b2bPortalAnsicht"),
  ]);
  const lt = await getTranslations("lieferungenAnsicht");
  const kkT = await getTranslations("nachweiskette");
  const format = await getFormatter();

  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" }) : "-";

  return (
    <div className="space-y-6">
      <Section
        title={t("lieferungenTitel")}
        description={t("lieferungenLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.lieferungen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineLieferungen")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {uebersicht.lieferungen.map((l) => (
              <Card key={l.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="text-sm font-black text-card-foreground">
                    {format.number(l.mengeKg)} kg
                  </p>
                  <StatusPill tone={statusTon[l.status] ?? "neutral"}>
                    {lt(`status.${l.status}`)}
                  </StatusPill>
                </div>
                {l.geliefertAm ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {lt("geliefertAm")}: {datum(l.geliefertAm)}
                  </p>
                ) : null}
                {l.empfaengerName ? (
                  <p className="text-xs text-muted-foreground">
                    {lt("empfaengerName")}: {l.empfaengerName}
                  </p>
                ) : null}
                {l.letzteKuehlmessung || l.transportMessungen.length > 0 ? (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                    <span className="text-[11px] text-muted-foreground">{lt("temperatur")}:</span>
                    {l.letzteKuehlmessung ? (
                      <StatusPill tone={kuehlTon[l.letzteKuehlmessung.ergebnis] ?? "neutral"}>
                        {l.letzteKuehlmessung.temperaturC} °C ·{" "}
                        {kkT(`ergebnis.${l.letzteKuehlmessung.ergebnis}`)}
                      </StatusPill>
                    ) : null}
                    {l.transportMessungen.map((m) => (
                      <StatusPill key={m.id} tone={kuehlTon[m.ergebnis] ?? "neutral"}>
                        {m.temperaturC} °C
                      </StatusPill>
                    ))}
                  </div>
                ) : null}
              </Card>
            ))}
          </div>
        )}
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
