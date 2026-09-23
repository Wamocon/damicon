import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  LohnMonatAbzuegeBerechnenFormular,
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

  const { satz, historie, abrechnungen, positionen, steuersatzKz, monatsabzuege, abschlussLuecken } =
    uebersicht;
  const kzt = await getTranslations("lohnAnsicht.kz");
  const monatName = (monat: number) =>
    format.dateTime(new Date(Date.UTC(2000, monat - 1, 1)), { month: "long" });

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

      {/* WMCNL-2380: bislang war ausschliesslich der juengste Satz ueberhaupt
          einsehbar (die Karte oben) - kein Weg, aeltere Saetze nachzuschlagen,
          gegen die eine vergangene Periode tatsaechlich gerechnet hat. */}
      <Section title={t("historieTitel")} description={t("historieLead")}>
        <DataTable
          head={[
            t("col.gueltigAb"),
            t("col.gueltigBis"),
            t("stat.stundenlohn"),
            t("stat.kgSatz"),
            t("stat.ziel"),
            t("stat.korridor"),
          ]}
        >
          {historie.map((s) => (
            <tr key={s.id} className={s.id === satz?.id ? "bg-primary/5" : undefined}>
              <td className="px-3 py-2.5 font-semibold text-foreground">{datum(s.gueltigAb)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {s.gueltigBis ? datum(s.gueltigBis) : "-"}
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">{geld(s.stundenlohnTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{geld(s.kgSatzTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {zahl1(s.qualitaetsZielAusschussquote)} %
              </td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {zahl1(s.qualitaetsfaktorMin, 2)} – {zahl1(s.qualitaetsfaktorMax, 2)}
              </td>
            </tr>
          ))}
        </DataTable>
      </Section>

      {faktorWirkungslos ? (
        <Card className="border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">
          {t("wirkungslos")}
        </Card>
      ) : null}

      {/* WMCNL-2375: lohn_periode_berechnen() liest die Mengenkomponente nur
          aus Steigen - eine abgeschlossene Aufgabe mit gemeldeter Menge, aber
          ohne jede Steige, fiel bislang kommentarlos aus der Abrechnung. */}
      {abschlussLuecken.length > 0 ? (
        <Card className="space-y-2 border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">
          <p className="font-semibold">{t("abschlussLuecke.titel")}</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {abschlussLuecken.map((a) => (
              <li key={a.id}>
                {t("abschlussLuecke.eintrag", { code: a.code, menge: zahl1(a.istMengeKg) })}
              </li>
            ))}
          </ul>
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
                    <LohnStatusFormular
                      id={a.id}
                      ziel="freigegeben"
                      label={t("freigebenKnopf")}
                      bestaetigung={t("bestaetigung.freigeben", { name: a.pfluecker })}
                    />
                  ) : darfFreigeben && a.status === "freigegeben" ? (
                    <div className="flex flex-wrap items-center gap-1.5">
                      <LohnStatusFormular
                        id={a.id}
                        ziel="ausgezahlt"
                        label={t("auszahlenKnopf")}
                        bestaetigung={t("bestaetigung.auszahlen", { name: a.pfluecker })}
                      />
                      <LohnStatusFormular
                        id={a.id}
                        ziel="entwurf"
                        label={t("zurueckziehenKnopf")}
                        bestaetigung={t("bestaetigung.zurueckziehen", { name: a.pfluecker })}
                      />
                    </div>
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

      <Section
        title={kzt("titel")}
        description={kzt("lead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        {steuersatzKz ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={kzt("stat.opv")}
              value={`${zahl1(steuersatzKz.opvProzent)} %`}
              helper={kzt("stat.opvHinweis")}
            />
            <Stat
              label={kzt("stat.vosms")}
              value={`${zahl1(steuersatzKz.vosmsProzent)} %`}
              helper={kzt("stat.vosmsHinweis")}
            />
            <Stat
              label={kzt("stat.ipn")}
              value={`${zahl1(steuersatzKz.ipnProzent)} %`}
              helper={`${kzt("stat.freibetrag")} ${geld(steuersatzKz.ipnFreibetragTenge)}`}
            />
            <Stat
              label={kzt("stat.arbeitgeberlast")}
              value={`${zahl1(
                steuersatzKz.opvrProzent + steuersatzKz.soProzent + steuersatzKz.snProzent + steuersatzKz.osmsProzent,
              )} %`}
              helper={kzt("stat.arbeitgeberlastHinweis")}
            />
          </div>
        ) : (
          <Card className="text-center text-xs text-muted-foreground">{kzt("keinSatz")}</Card>
        )}
        {steuersatzKz ? (
          <p className="text-[11px] leading-4 text-muted-foreground">
            {kzt("quelle")} {steuersatzKz.quelle}
          </p>
        ) : null}

        {darfBerechnen ? <LohnMonatAbzuegeBerechnenFormular /> : null}

        <DataTable
          head={[
            kzt("col.pfluecker"),
            kzt("col.monat"),
            kzt("col.brutto"),
            kzt("col.opv"),
            kzt("col.vosms"),
            kzt("col.ipn"),
            kzt("col.netto"),
            kzt("col.arbeitgeberkosten"),
          ]}
        >
          {monatsabzuege.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {kzt("keineAbzuege")}
              </td>
            </tr>
          ) : (
            monatsabzuege.map((m) => (
              <tr key={m.id}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{m.pfluecker}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{m.pfleuckerAusweis}</p>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {monatName(m.monat)} {m.jahr}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(m.bruttoGesamtTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(m.opvTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(m.vosmsTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {m.ipnTenge === 0 ? (
                    <StatusPill tone="success">{kzt("steuerfrei")}</StatusPill>
                  ) : (
                    geld(m.ipnTenge)
                  )}
                </td>
                <td className="px-3 py-2.5 font-bold text-foreground">{geld(m.nettoTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(m.arbeitgeberkostenGesamtTenge)}</td>
              </tr>
            ))
          )}
        </DataTable>
        <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{kzt("note")}</Card>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
