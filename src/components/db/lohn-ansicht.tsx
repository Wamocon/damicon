import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  LohnPeriodeBerechnenFormular,
  LohnSatzAnlegenFormular,
  LohnStatusFormular,
} from "@/components/db/lohn-formulare";
import { ladeLohnUebersicht } from "@/lib/data/lohn";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import { lohnStatusMeta } from "@/lib/domain/lohn";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Cockpit-Aufbau wie
// compliance-ansicht.tsx: Kennzahlen oben, DataTables je Fachobjekt,
// Schreibformulare nur fuer berechtigte Rollen, erklaerender Hinweis am Ende.
export async function LohnAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeLohnUebersicht(),
    getSessionProfile(),
    getTranslations("lohnAnsicht"),
  ]);
  const st = await getTranslations("lohnStatus");
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfBerechnen = live && hasPermission(profil?.role, "lohn", "create");
  const darfFreigeben = live && hasPermission(profil?.role, "lohn", "approve");

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const zahl1 = (n: number, stellen = 1) => format.number(n, { maximumFractionDigits: stellen });
  const datum = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  const { satz, abrechnungen, positionen } = uebersicht;

  // Derselbe Befund wie im Vorbild (D-H: Warnung, wenn die Mindestlohn-
  // Anhebung jede Zeile trifft und der Faktor damit folgenlos bleibt) - hier
  // uebersetzt auf Damicons Formel: bewegt sich der Faktor ueber alle
  // angezeigten Abrechnungen exakt auf 1.00, hat er in diesem Zeitraum keine
  // erkennbare Lohnwirkung. Das ist ein Datenbefund (z. B. noch kein erfasster
  // Ausschuss), kein Rechenfehler - das Dashboard sagt es trotzdem offen.
  const faktorWirkungslos =
    abrechnungen.length > 1 && abrechnungen.every((a) => a.qualitaetsfaktor === 1);

  return (
    <div className="space-y-6">
      <Section
        title={t("satzTitel")}
        description={t("satzLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {satz ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t("stat.stundenlohn")} value={geld(satz.stundenlohnTenge)} />
            <Stat label={t("stat.kgSatz")} value={geld(satz.kgSatzTenge)} />
            <Stat
              label={t("stat.ziel")}
              value={`${zahl1(satz.qualitaetsZielAusschussquote)} %`}
              helper={t("stat.zielHinweis")}
            />
            <Stat
              label={t("stat.korridor")}
              value={`${zahl1(satz.qualitaetsfaktorMin, 2)} – ${zahl1(satz.qualitaetsfaktorMax, 2)}`}
              helper={satz.gueltigAb ? `${t("stat.gueltigAb")} ${datum(satz.gueltigAb)}` : undefined}
            />
          </div>
        ) : (
          <Card className="text-center text-xs text-muted-foreground">{t("keinSatz")}</Card>
        )}
        {satz?.notiz ? (
          <p className="text-[11px] leading-4 text-muted-foreground">{satz.notiz}</p>
        ) : null}
      </Section>

      {darfBerechnen ? <LohnSatzAnlegenFormular /> : null}
      {darfBerechnen ? <LohnPeriodeBerechnenFormular /> : null}

      {faktorWirkungslos ? (
        <Card className="border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">
          {t("wirkungslos")}
        </Card>
      ) : null}

      <Section title={t("abrechnungenTitel")} description={t("abrechnungenLead")}>
        <DataTable
          head={[
            t("col.pfluecker"),
            t("col.periode"),
            t("col.stunden"),
            t("col.menge"),
            t("col.ausschussquote"),
            t("col.faktor"),
            t("col.grundlohn"),
            t("col.mengenKomponente"),
            t("col.gesamt"),
            t("col.status"),
            t("col.aktion"),
          ]}
        >
          {abrechnungen.length === 0 ? (
            <tr>
              <td colSpan={11} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keineAbrechnungen")}
              </td>
            </tr>
          ) : (
            abrechnungen.map((a) => (
              <tr key={a.id}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{a.pfluecker}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{a.pfleuckerAusweis}</p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {datum(a.periodeStart)} – {datum(a.periodeEnde)}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(a.stunden)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(a.mengeKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {a.ausschussquote === null ? "–" : `${zahl1(a.ausschussquote)} %`}
                </td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={a.qualitaetsfaktor > 1 ? "success" : a.qualitaetsfaktor < 1 ? "warning" : "neutral"}>
                    {zahl1(a.qualitaetsfaktor, 2)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(a.grundlohnTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(a.mengenKomponenteTenge)}</td>
                <td className="px-3 py-2.5 font-bold text-foreground">{geld(a.gesamtTenge)}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={lohnStatusMeta[a.status].tone as Tone}>{st(a.status)}</StatusPill>
                </td>
                <td className="px-3 py-2.5">
                  {darfFreigeben && a.status === "entwurf" ? (
                    <LohnStatusFormular id={a.id} ziel="freigegeben" label={t("freigebenKnopf")} />
                  ) : darfFreigeben && a.status === "freigegeben" ? (
                    <LohnStatusFormular id={a.id} ziel="ausgezahlt" label={t("auszahlenKnopf")} />
                  ) : (
                    <span className="text-[11px] text-muted-foreground">–</span>
                  )}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      <Section title={t("positionenTitel")} description={t("positionenLead")}>
        <DataTable
          head={[
            t("col.pfluecker"),
            t("col.periode"),
            t("col.aufgabe"),
            t("col.menge"),
            t("col.ausschussAnteilig"),
            t("col.faktor"),
            t("col.betrag"),
          ]}
        >
          {positionen.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keinePositionen")}
              </td>
            </tr>
          ) : (
            positionen.map((p) => (
              <tr key={p.id}>
                <td className="px-3 py-2.5 font-semibold text-foreground">{p.pfluecker}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {datum(p.periodeStart)} – {datum(p.periodeEnde)}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {p.aufgabeCode ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(p.mengeKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(p.ausschussAnteiligKg)} kg</td>
                <td className="px-3 py-2.5 text-muted-foreground">{zahl1(p.qualitaetsfaktor, 2)}</td>
                <td className="px-3 py-2.5 font-semibold text-foreground">{geld(p.betragTenge)}</td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
