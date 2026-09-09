import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  BuchungErfassenFormular,
  KostentraegerAnlegenFormular,
} from "@/components/db/finanzen-formulare";
import {
  ladeB2bKundeOptionen,
  ladeChargeOptionen,
  ladeFinanzenUebersicht,
  ladeKostentraegerOptionen,
  ladeReihenblockOptionen,
  ladeSorteOptionen,
} from "@/lib/data/finanzen";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";

// Finanzen/Kostentraeger (Anforderung 4.2, P0). Cockpit-Aufbau wie
// lohn-ansicht.tsx: Kennzahlen oben, DataTables je Fachobjekt, Schreibformulare
// nur fuer berechtigte Rollen (admin/buchhaltung - betriebsleitung darf laut
// rbac.ts nur lesen).
export async function FinanzenAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeFinanzenUebersicht(),
    getSessionProfile(),
    getTranslations("finanzenAnsicht"),
  ]);
  const format = await getFormatter();

  const live = uebersicht.quelle === "db";
  const darfBuchen = live && hasPermission(profil?.role, "finanzen", "create");

  const [reihenbloecke, sorten, kunden, kostentraeger, chargen] = darfBuchen
    ? await Promise.all([
        ladeReihenblockOptionen(),
        ladeSorteOptionen(),
        ladeB2bKundeOptionen(),
        ladeKostentraegerOptionen(),
        ladeChargeOptionen(),
      ])
    : [[], [], [], [], []];

  const geld = (n: number) => `${format.number(Math.round(n))} ₸`;
  const datum = (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" });

  const { deckungsbeitrag, deckungsbeitragJeCharge, ledger } = uebersicht;
  const summeErloes = deckungsbeitrag.reduce((s, z) => s + z.erloesTenge, 0);
  const summeKosten = deckungsbeitrag.reduce((s, z) => s + z.kostenTenge, 0);
  const summeDb = summeErloes - summeKosten;

  return (
    <div className="space-y-6">
      <Section
        title={t("uebersichtTitel")}
        description={t("uebersichtLead")}
        action={<DatenquelleBadge quelle={uebersicht.quelle} />}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label={t("stat.erloes")} value={geld(summeErloes)} />
          <Stat label={t("stat.kosten")} value={geld(summeKosten)} />
          <Stat
            label={t("stat.deckungsbeitrag")}
            value={geld(summeDb)}
            helper={t("stat.deckungsbeitragHinweis")}
          />
        </div>
      </Section>

      {darfBuchen ? (
        <KostentraegerAnlegenFormular
          reihenbloecke={reihenbloecke}
          sorten={sorten}
          kunden={kunden}
        />
      ) : null}
      {darfBuchen ? (
        <BuchungErfassenFormular kostentraeger={kostentraeger} chargen={chargen} />
      ) : null}

      <Section title={t("kostentraegerTitel")} description={t("kostentraegerLead")}>
        <DataTable
          head={[
            t("col.bezeichnung"),
            t("col.reihenblock"),
            t("col.sorte"),
            t("col.kunde"),
            t("col.erloes"),
            t("col.kosten"),
            t("col.deckungsbeitrag"),
            t("col.deckungsbeitragJeKg"),
          ]}
        >
          {deckungsbeitrag.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keineKostentraeger")}
              </td>
            </tr>
          ) : (
            deckungsbeitrag.map((z) => (
              <tr key={z.kostentraegerId}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-foreground">{z.bezeichnung}</p>
                  {z.erntetag ? (
                    <p className="text-[11px] text-muted-foreground">{datum(z.erntetag)}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {z.reihenblockCode ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{z.sorteName ?? "–"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{z.b2bKundeName ?? "–"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(z.erloesTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(z.kostenTenge)}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={z.deckungsbeitragTenge >= 0 ? "success" : "warning"}>
                    {geld(z.deckungsbeitragTenge)}
                  </StatusPill>
                </td>
                {/* Anforderung 4.3: Deckungsbeitrag je Kilogramm, null bei
                    Zukauf-Kostentraegern ohne eigene Pflueckaufgabe. */}
                <td className="px-3 py-2.5 text-muted-foreground">
                  {z.deckungsbeitragJeKgTenge === null
                    ? "–"
                    : `${format.number(z.deckungsbeitragJeKgTenge, { maximumFractionDigits: 0 })} ₸/kg`}
                </td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      {/* Anforderung 3.3: nur sichtbar, wenn mindestens eine Buchung direkt an
          einer Charge statt nur am Kostentraeger haengt - sonst waere die
          Tabelle fuer jeden Betrieb dauerhaft leer. */}
      {deckungsbeitragJeCharge.length > 0 ? (
        <Section
          title={t("chargeTitel")}
          description={t("chargeLead")}
        >
          <DataTable
            head={[
              t("col.charge"),
              t("col.reihenblock"),
              t("col.sorte"),
              t("col.menge"),
              t("col.erloes"),
              t("col.kosten"),
              t("col.deckungsbeitrag"),
              t("col.deckungsbeitragJeKg"),
            ]}
          >
            {deckungsbeitragJeCharge.map((z) => (
              <tr key={z.chargeId}>
                <td className="px-3 py-2.5">
                  <p className="font-mono text-[11px] font-semibold text-foreground">
                    {z.chargeCode}
                  </p>
                  {z.ernteDatum ? (
                    <p className="text-[11px] text-muted-foreground">{datum(z.ernteDatum)}</p>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {z.reihenblockCode ?? "–"}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{z.sorteName ?? "–"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {z.mengeKg === null ? "–" : `${format.number(z.mengeKg)} kg`}
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(z.erloesTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(z.kostenTenge)}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={z.deckungsbeitragTenge >= 0 ? "success" : "warning"}>
                    {geld(z.deckungsbeitragTenge)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {z.deckungsbeitragJeKgTenge === null
                    ? "–"
                    : `${format.number(z.deckungsbeitragJeKgTenge, { maximumFractionDigits: 0 })} ₸/kg`}
                </td>
              </tr>
            ))}
          </DataTable>
        </Section>
      ) : null}

      <Section title={t("ledgerTitel")} description={t("ledgerLead")}>
        <DataTable
          head={[
            t("col.datum"),
            t("col.kostentraegerSpalte"),
            t("col.typ"),
            t("col.kategorie"),
            t("col.betrag"),
          ]}
        >
          {ledger.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-3 py-4 text-center text-xs text-muted-foreground">
                {t("keineBuchungen")}
              </td>
            </tr>
          ) : (
            ledger.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2.5 text-muted-foreground">{datum(l.buchungsdatum)}</td>
                <td className="px-3 py-2.5 text-foreground">{l.kostentraegerBezeichnung}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={l.typ === "erloes" ? "success" : "neutral"}>
                    {t(l.typ)}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">
                  {l.kategorie}
                  {l.beschreibung ? (
                    <span className="block text-[11px] text-muted-foreground/80">{l.beschreibung}</span>
                  ) : null}
                </td>
                <td className="px-3 py-2.5 font-semibold text-foreground">{geld(l.betragTenge)}</td>
              </tr>
            ))
          )}
        </DataTable>
      </Section>

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}
