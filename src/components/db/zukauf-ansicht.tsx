import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  NachbarbetriebFormular,
  ZukaufImportFormular,
  ZukaufPreisNachtragenFormular,
} from "@/components/db/zukauf-formulare";
import { SpanneFormular } from "@/components/db/abrechnung-formulare";
import { ladeNachbarbetriebe, ladeZukaufPositionen } from "@/lib/data/zukauf";
import { ladeAbrechnung } from "@/lib/data/abrechnung";
import { ladeSorten } from "@/lib/data/standort";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Aggregator / Zukauf von Nachbarbetrieben (WMCNL-1453). Aufbau wie
// lohn-ansicht.tsx: Kennzahlen oben, eine DataTable fuer die Positionen,
// Schreibformulare nur fuer berechtigte Rollen, erklaerender Hinweis am Ende.
// Die Abrechnung gegenueber den Lieferbetrieben (Anforderung 6.4) ergaenzt
// das um den fehlenden Handelsbaustein.
export async function ZukaufAnsicht() {
  const [liste, abrechnung, profil, nachbarbetriebe, sorten, t] = await Promise.all([
    ladeZukaufPositionen(),
    ladeAbrechnung(),
    getSessionProfile(),
    ladeNachbarbetriebe(),
    ladeSorten(),
    getTranslations("zukaufAnsicht"),
  ]);
  const at = await getTranslations("abrechnungAnsicht");
  const format = await getFormatter();

  const live = liste.quelle === "db";
  const darfImportieren = live && hasPermission(profil?.role, "aggregator", "create");
  const darfPreisPflegen = live && hasPermission(profil?.role, "aggregator", "update");
  const darfSpannePflegen = live && hasPermission(profil?.role, "aggregator", "update");
  const siehtAbrechnung = live && hasPermission(profil?.role, "aggregator", "view");

  const zahl1 = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const datum = (iso: string | null) =>
    iso ? format.dateTime(new Date(iso), { dateStyle: "medium" }) : "–";

  return (
    <div className="space-y-6">
      <Section
        title={t("statsTitle")}
        description={t("statsLead")}
        action={<DatenquelleBadge quelle={liste.quelle} />}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t("stat.positionen")} value={String(liste.stats.positionen)} />
          <Stat label={t("stat.menge")} value={`${zahl1(liste.stats.summeMengeKg)} kg`} />
          <Stat label={t("stat.nachbarbetriebe")} value={String(liste.stats.nachbarbetriebe)} />
          <Stat
            label={t("stat.offenePreise")}
            value={String(liste.stats.offenePreise)}
            tone={liste.stats.offenePreise > 0 ? "warning" : "success"}
            helper={liste.stats.offenePreise > 0 ? t("stat.offenePreiseHinweis") : undefined}
          />
        </div>
      </Section>

      <Section title={t("listTitle")} description={t("listLead")}>
        <DataTable
          head={[
            t("col.nachbarbetrieb"),
            t("col.sorte"),
            t("col.charge"),
            t("col.menge"),
            t("col.erntedatum"),
            t("col.preis"),
            t("col.rechnungsdatum"),
          ]}
        >
          {liste.positionen.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("empty")}
              </td>
            </tr>
          ) : (
            liste.positionen.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2.5 font-semibold text-foreground">{p.nachbarbetrieb}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{p.sorte ?? "–"}</td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {p.chargeCode ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(p.mengeKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">{datum(p.erntedatum)}</td>
                <td className="px-3 py-2.5">
                  {p.preisTengeKg !== null ? (
                    <span className="font-semibold text-foreground">{geld(p.preisTengeKg)}</span>
                  ) : darfPreisPflegen ? (
                    <ZukaufPreisNachtragenFormular id={p.id} />
                  ) : (
                    <StatusPill tone="warning">{t("preisOffen")}</StatusPill>
                  )}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{datum(p.rechnungsdatum)}</td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      {siehtAbrechnung ? (
        <Section
          title={at("titel")}
          description={at("lead")}
          action={<DatenquelleBadge quelle={abrechnung.quelle} />}
        >
          {abrechnung.zeilen.length === 0 ? (
            <Card className="text-center text-xs text-muted-foreground">{at("keineZeilen")}</Card>
          ) : (
            <DataTable
              head={[at("col.nachbarbetrieb"), at("col.menge"), at("col.einkaufswert"), at("col.spanne"), at("col.auszahlung")]}
            >
              {abrechnung.zeilen.map((z) => (
                <tr key={z.nachbarbetriebId}>
                  <td className="px-3 py-2.5 font-semibold text-foreground">{z.nachbarbetriebName}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{zahl1(z.mengeKgGesamt)} kg</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{geld(z.einkaufswertTenge)}</td>
                  <td className="px-3 py-2.5 text-muted-foreground">{format.number(z.spanneProzent)} %</td>
                  <td className="px-3 py-2.5 font-semibold text-foreground">{geld(z.auszahlungTenge)}</td>
                </tr>
              ))}
            </DataTable>
          )}
          {darfSpannePflegen ? (
            <div className="mt-3 border-t border-border pt-3">
              <SpanneFormular spanneProzent={abrechnung.spanneProzent} />
            </div>
          ) : null}
          <p className="text-[11px] leading-4 text-muted-foreground">{at("hinweis")}</p>
        </Section>
      ) : null}

      {darfImportieren ? (
        <>
          <NachbarbetriebFormular />
          <ZukaufImportFormular
            nachbarbetriebe={nachbarbetriebe.map((n) => n.name)}
            sorten={sorten.map((s) => s.name)}
          />
        </>
      ) : live ? (
        <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">
          {t("keinRecht")}
        </Card>
      ) : null}

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
