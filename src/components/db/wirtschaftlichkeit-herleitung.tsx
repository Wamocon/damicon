import { getFormatter, getTranslations } from "next-intl/server";
import { kalendertag } from "@/lib/format/datum";
import { Card, Section } from "@/components/ui/kit";
import { SchwundKnopf } from "@/components/db/wirtschaftlichkeit-formulare";
import type { SchwundHerleitung } from "@/lib/data/wirtschaftlichkeit";

// Der Schwund-Nutzen, hergeleitet aus den Betriebsdaten: die Verlustquote vor der Einfuehrung (Baseline), die der letzten 365 Tage (Chargen), die Jahresmenge
// und die Vollkosten je Kilogramm. Die Eingabe steht neben dem Ergebnis, damit niemand eine Zahl glauben muss, die er nicht nachrechnen kann.
export async function WirtschaftlichkeitHerleitung({ herleitung, darfSchreiben }: { herleitung: SchwundHerleitung; darfSchreiben: boolean }) {
  const [t, format] = await Promise.all([getTranslations("wirtschaftlichkeitErfassung.schwund"), getFormatter()]);
  const { eingabe: e, ergebnis, von, bis } = herleitung;
  const prozent = (n: number | null) => (n === null ? t("offen") : `${format.number(n, { maximumFractionDigits: 2 })} %`);
  const tag = (iso: string) => kalendertag(format, iso);

  const zeilen: [string, string][] = [
    [t("vorher"), prozent(e.verlustVorherProzent)],
    [t("jetzt"), prozent(e.verlustJetztProzent)],
    [t("menge"), e.gesamtMengeKg === null ? t("offen") : `${format.number(Math.round(e.gesamtMengeKg))} kg`],
    [t("kosten"), e.kostenJeKgTenge === null ? t("offen") : `${format.number(e.kostenJeKgTenge)} KZT`],
  ];

  return (
    <Section title={t("titel")} description={t("lead")}>
      <Card className="space-y-3">
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {zeilen.map(([label, wert]) => (
            <div key={label} className="flex items-baseline justify-between gap-3 border-b border-border/60 py-1.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-semibold text-foreground">{wert}</dd>
            </div>
          ))}
        </dl>
        {von && bis ? <p className="schrift-label text-muted-foreground">{t("zeitraum", { chargen: e.chargen, von: tag(von), bis: tag(bis) })}</p> : null}
        {ergebnis.stand === "ok" ? (
          <div className="space-y-2">
            <p className="text-sm text-foreground">
              {t("ergebnis", { kg: format.number(ergebnis.vermiedeneKg), nutzen: format.number(ergebnis.nutzenEurJahr) })}
            </p>
            {darfSchreiben ? <SchwundKnopf /> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t(`grund.${ergebnis.grund}`)}</p>
        )}
        <p className="schrift-label text-muted-foreground">{t("hinweis")}</p>
      </Card>
    </Section>
  );
}
