import { getFormatter, getTranslations } from "next-intl/server";
import { Card, Section, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import { KuehlkettenAlarm } from "@/components/db/kuehlketten-alarm";
import { ladeKuehlkettenUebersicht } from "@/lib/data/kuehlkette";

const ergebnisTon: Record<string, Tone> = {
  ok: "success",
  warnung: "warning",
  verstoss: "danger",
};

// Kuehlketten-Cockpit (Anforderung 3.1). Ersetzt die bisherige Mock-Ansicht
// (drei fest verdrahtete Beispielchargen) durch die echte, betriebsweite
// Liste aller Chargen, die gerade auf der 60-Minuten-Uhr stehen - je Charge
// dieselbe KuehlkettenAlarm-Komponente, die auch in der Nachweiskette einer
// einzelnen Pflueckaufgabe laeuft (kein zweites Ampel-/Schwellwertsystem).
export async function KuehletteAnsicht() {
  const [uebersicht, t, kkT, format] = await Promise.all([
    ladeKuehlkettenUebersicht(),
    getTranslations("kuehlketteAnsicht"),
    getTranslations("nachweiskette"),
    getFormatter(),
  ]);

  return (
    <div className="space-y-6">
      <Section
        title={t("offeneTitel")}
        description={t("offeneLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {uebersicht.offeneChargen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineOffenen")}</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {uebersicht.offeneChargen.map((c) => (
              <Card key={c.chargeId}>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {c.chargeCode}
                  </span>
                  {c.reihenblockCode ? (
                    <span className="text-[11px] text-muted-foreground">
                      {t("block")} {c.reihenblockCode}
                    </span>
                  ) : null}
                </div>
                <div className="mt-2">
                  <KuehlkettenAlarm key={c.pflueckZeitpunkt} pflueckZeitpunkt={c.pflueckZeitpunkt} />
                </div>
              </Card>
            ))}
          </div>
        )}
        <p className="text-xs text-muted-foreground">{kkT("kuehlung.regel")}</p>
      </Section>

      <Section title={t("letzteTitel")} description={t("letzteLead")}>
        {uebersicht.letzteMessungen.length === 0 ? (
          <Card className="text-center text-xs text-muted-foreground">{t("keineMessungen")}</Card>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {uebersicht.letzteMessungen.map((m) => (
              <Card key={m.id} className="flex items-center justify-between gap-2 p-3">
                <div className="min-w-0">
                  <p className="truncate font-mono text-[11px] font-semibold text-foreground">
                    {m.chargeCode}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {m.reihenblockCode ? `${t("block")} ${m.reihenblockCode} · ` : ""}
                    {format.dateTime(new Date(m.gemessenAm), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="font-mono text-xs font-semibold text-foreground">
                    {format.number(m.temperaturC, { maximumFractionDigits: 1 })} °C
                  </span>
                  <StatusPill tone={ergebnisTon[m.ergebnis] ?? "neutral"}>
                    {kkT(`ergebnis.${m.ergebnis}`)}
                  </StatusPill>
                </div>
              </Card>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
