import { getFormatter, getTranslations } from "next-intl/server";
import { Card, DataTable, Section, Stat, StatusPill, type Tone } from "@/components/ui/kit";
import { DatenquelleBadge } from "@/components/db/datenquelle-badge";
import {
  LohnAbzuegeVorschauFormular,
  LohnMonatAbzuegeBerechnenFormular,
  LohnPeriodeBerechnenFormular,
  LohnSatzAnlegenFormular,
  LohnStatusFormular,
} from "@/components/db/lohn-formulare";
import { ladeLohnUebersicht } from "@/lib/data/lohn";
import type { Datenquelle } from "@/lib/supabase/config";
import { getSessionProfile } from "@/lib/auth";
import { hasPermission } from "@/lib/rbac";
import {
  lohnStatusMeta,
  type LohnAbrechnung,
  type LohnAbschlussLuecke,
  type LohnMonatsabzug,
  type LohnPosition,
  type LohnSatz,
  type LohnSteuersatzKz,
} from "@/lib/domain/lohn";
import { LeererZustand } from "@/components/ui/liste";
import { formularZiel } from "@/lib/formular-ziele";

// Lohnabrechnung mit Qualitaetsfaktor (WMCNL-1444). Cockpit-Aufbau wie
// compliance-ansicht.tsx: Kennzahlen oben, DataTables je Fachobjekt,
// Schreibformulare nur fuer berechtigte Rollen, erklaerender Hinweis am Ende.
//
// Aufbau: LohnAnsicht lädt die Übersicht, prüft Berechnen- und
// Freigaberecht und entscheidet, welche Formulare und Warnkarten stehen. Die
// Abschnitte darunter bekommen ihre Zeilen und das Recht, das sie brauchen.

type Formatierer = Awaited<ReturnType<typeof getFormatter>>;

function lohnFormate(format: Formatierer) {
  return {
    geld: (n: number) => `${format.number(Math.round(n))} ₸`,
    zahl1: (n: number, stellen = 1) => format.number(n, { maximumFractionDigits: stellen }),
    // Der Faktor hat immer zwei Nachkommastellen (WMCNL-2392): an den
    // Korridorgrenzen 0,90 und 1,10 muss man sehen, ob ein Wert genau auf der
    // Grenze liegt oder gerundet wurde. "1" und "1,1" lassen das offen.
    faktor: (n: number) =>
      format.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    // Die gesetzlichen Abzuege stehen auf zwei Stellen genau in der Datenbank. Wer
    // jeden Betrag einzeln auf volle Tenge rundet, sieht Brutto minus Abzuege
    // ungleich Netto, obwohl die Rechnung stimmt (WMCNL-2305).
    geldGenau: (n: number) =>
      `${format.number(n, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ₸`,
    datum: (iso: string) => format.dateTime(new Date(iso), { dateStyle: "medium" }),
  };
}

// Ein Faktor ausserhalb des Korridors des aktuellen Lohnsatzes wird
// gekennzeichnet (WMCNL-2308): so etwas stammt aus Altbestand, nicht aus der
// Berechnung, und eine freigegebene Abrechnung aendert sich nicht still.
function ausserhalbKorridor(n: number, satz: LohnSatz | null): boolean {
  return satz !== null && (n < satz.qualitaetsfaktorMin - 1e-9 || n > satz.qualitaetsfaktorMax + 1e-9);
}

/** Ton des Faktors: rot außerhalb des Korridors, sonst grün über 1, gelb unter 1, neutral bei genau 1. */
function faktorTon(n: number, ausserhalb: boolean): Tone {
  if (ausserhalb) return "danger";
  if (n > 1) return "success";
  if (n < 1) return "warning";
  return "neutral";
}

export async function LohnAnsicht() {
  const [uebersicht, profil, t] = await Promise.all([
    ladeLohnUebersicht(),
    getSessionProfile(),
    getTranslations("lohnAnsicht"),
  ]);

  const live = uebersicht.quelle === "db";
  const darfBerechnen = live && hasPermission(profil?.role, "lohn", "create");
  const darfFreigeben = live && hasPermission(profil?.role, "lohn", "approve");

  const { satz, historie, abrechnungen, positionen, steuersatzKz, monatsabzuege, abschlussLuecken } =
    uebersicht;

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
      <LohnSatzAbschnitt quelle={uebersicht.quelle} satz={satz} darfBerechnen={darfBerechnen} />

      {darfBerechnen ? <LohnSatzAnlegenFormular /> : null}
      {darfBerechnen ? <LohnPeriodeBerechnenFormular /> : null}

      {/* WMCNL-2380: bislang war ausschliesslich der juengste Satz ueberhaupt
          einsehbar (die Karte oben) - kein Weg, aeltere Saetze nachzuschlagen,
          gegen die eine vergangene Periode tatsaechlich gerechnet hat. */}
      <SatzVerlauf historie={historie} gueltigeId={satz?.id} />

      {faktorWirkungslos ? (
        <Card className="border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">
          {t("wirkungslos")}
        </Card>
      ) : null}

      {/* WMCNL-2375: lohn_periode_berechnen() liest die Mengenkomponente nur
          aus Steigen - eine abgeschlossene Aufgabe mit gemeldeter Menge, aber
          ohne jede Steige, fiel bislang kommentarlos aus der Abrechnung. */}
      {abschlussLuecken.length > 0 ? <AbschlussLuecken luecken={abschlussLuecken} /> : null}

      <AbrechnungenAbschnitt abrechnungen={abrechnungen} satz={satz} darfFreigeben={darfFreigeben} />
      <PositionenAbschnitt positionen={positionen} />
      <AbzuegeAbschnitt
        quelle={uebersicht.quelle}
        steuersatz={steuersatzKz}
        monatsabzuege={monatsabzuege}
        darfBerechnen={darfBerechnen}
      />

      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{t("note")}</Card>
    </div>
  );
}

/** Der heute gültige Lohnsatz; ohne ihn ein Leerzustand, für Berechtigte mit Knopf zum Formular. */
async function LohnSatzAbschnitt({
  quelle,
  satz,
  darfBerechnen,
}: {
  quelle: Datenquelle;
  satz: LohnSatz | null;
  darfBerechnen: boolean;
}) {
  const [t, format] = await Promise.all([getTranslations("lohnAnsicht"), getFormatter()]);
  const { geld, zahl1, faktor, datum } = lohnFormate(format);

  return (
    <Section
      title={t("satzTitel")}
      description={t("satzLead")}
      action={<DatenquelleBadge quelle={quelle} />}
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
            value={`${faktor(satz.qualitaetsfaktorMin)} – ${faktor(satz.qualitaetsfaktorMax)}`}
            helper={satz.gueltigAb ? `${t("stat.gueltigAb")} ${datum(satz.gueltigAb)}` : undefined}
          />
        </div>
      ) : (
        <LeererZustand
          titel={t("keinSatz")}
          text={t("keinSatzHinweis")}
          modul="lohn"
          anlegen={
            darfBerechnen
              ? { ziel: formularZiel.lohnsatz, label: t("formular.satz.titel") }
              : undefined
          }
        />
      )}
      {satz?.notiz ? (
        <p className="text-[11px] leading-4 text-muted-foreground">{satz.notiz}</p>
      ) : null}
    </Section>
  );
}

/** Alle angelegten Sätze, der heute gültige hervorgehoben. */
async function SatzVerlauf({ historie, gueltigeId }: { historie: LohnSatz[]; gueltigeId: string | undefined }) {
  const [t, format] = await Promise.all([getTranslations("lohnAnsicht"), getFormatter()]);
  const { geld, zahl1, faktor, datum } = lohnFormate(format);

  return (
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
          <tr key={s.id} className={s.id === gueltigeId ? "bg-primary/5" : undefined}>
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
              {faktor(s.qualitaetsfaktorMin)} – {faktor(s.qualitaetsfaktorMax)}
            </td>
          </tr>
        ))}
      </DataTable>
    </Section>
  );
}

/** Abgeschlossene Aufgaben mit gemeldeter Menge, aber ohne Steige. */
async function AbschlussLuecken({ luecken }: { luecken: LohnAbschlussLuecke[] }) {
  const [t, format] = await Promise.all([getTranslations("lohnAnsicht"), getFormatter()]);
  const { zahl1 } = lohnFormate(format);

  return (
    <Card className="space-y-2 border-warning/30 bg-warning/[0.06] text-xs leading-5 text-warning">
      <p className="font-semibold">{t("abschlussLuecke.titel")}</p>
      <ul className="list-disc space-y-0.5 pl-4">
        {luecken.map((a) => (
          <li key={a.id}>
            {t("abschlussLuecke.eintrag", { code: a.code, menge: zahl1(a.istMengeKg) })}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Eine Zeile je Pflücker und Periode, mit Faktor gegen den Korridor des gültigen Satzes. */
async function AbrechnungenAbschnitt({
  abrechnungen,
  satz,
  darfFreigeben,
}: {
  abrechnungen: LohnAbrechnung[];
  satz: LohnSatz | null;
  darfFreigeben: boolean;
}) {
  const [t, st, format] = await Promise.all([
    getTranslations("lohnAnsicht"),
    getTranslations("lohnStatus"),
    getFormatter(),
  ]);
  const { geld, zahl1, faktor, datum } = lohnFormate(format);

  return (
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
            <td colSpan={11} className="px-3 py-2">
              <LeererZustand titel={t("keineAbrechnungen")} modul="lohn" />
            </td>
          </tr>
        ) : (
          abrechnungen.map((a) => {
            const ausserhalb = ausserhalbKorridor(a.qualitaetsfaktor, satz);
            return (
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
                  <StatusPill
                    tone={faktorTon(a.qualitaetsfaktor, ausserhalb)}
                    title={ausserhalb ? t("ausserhalbKorridor") : undefined}
                  >
                    {faktor(a.qualitaetsfaktor)}
                    {ausserhalb ? " !" : ""}
                  </StatusPill>
                </td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(a.grundlohnTenge)}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{geld(a.mengenKomponenteTenge)}</td>
                <td className="px-3 py-2.5 font-bold text-foreground">{geld(a.gesamtTenge)}</td>
                <td className="px-3 py-2.5">
                  <StatusPill tone={lohnStatusMeta[a.status].tone as Tone}>{st(a.status)}</StatusPill>
                </td>
                <td className="px-3 py-2.5">
                  <AbrechnungsAktion abrechnung={a} darfFreigeben={darfFreigeben} />
                </td>
              </tr>
            );
          })
        )}
      </DataTable>
    </Section>
  );
}

/** Der nächste Schritt je Status: Entwurf freigeben, Freigegebenes auszahlen oder zurückziehen; sonst ein Strich. */
async function AbrechnungsAktion({
  abrechnung: a,
  darfFreigeben,
}: {
  abrechnung: LohnAbrechnung;
  darfFreigeben: boolean;
}) {
  const t = await getTranslations("lohnAnsicht");

  if (darfFreigeben && a.status === "entwurf") {
    return (
      <LohnStatusFormular
        id={a.id}
        ziel="freigegeben"
        label={t("freigebenKnopf")}
        bestaetigung={t("bestaetigung.freigeben", { name: a.pfluecker })}
      />
    );
  }
  if (darfFreigeben && a.status === "freigegeben") {
    return (
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
    );
  }
  return <span className="text-[11px] text-muted-foreground">–</span>;
}

/** Wie sich die Mengenkomponente je Pflückaufgabe zusammensetzt. */
async function PositionenAbschnitt({ positionen }: { positionen: LohnPosition[] }) {
  const [t, format] = await Promise.all([getTranslations("lohnAnsicht"), getFormatter()]);
  const { geld, zahl1, faktor, datum } = lohnFormate(format);

  return (
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
            <td colSpan={7} className="px-3 py-2">
              <LeererZustand titel={t("keinePositionen")} modul="lohn" />
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
              <td className="px-3 py-2.5 text-muted-foreground">{faktor(p.qualitaetsfaktor)}</td>
              <td className="px-3 py-2.5 font-semibold text-foreground">{geld(p.betragTenge)}</td>
            </tr>
          ))
        )}
      </DataTable>
    </Section>
  );
}

/** Gesetzliche Lohnabzüge: Sätze, Formulare für Berechtigte und die Abzüge je Monat. */
async function AbzuegeAbschnitt({
  quelle,
  steuersatz,
  monatsabzuege,
  darfBerechnen,
}: {
  quelle: Datenquelle;
  steuersatz: LohnSteuersatzKz | null;
  monatsabzuege: LohnMonatsabzug[];
  darfBerechnen: boolean;
}) {
  const [kzt, format] = await Promise.all([getTranslations("lohnAnsicht.kz"), getFormatter()]);
  const { geldGenau } = lohnFormate(format);
  const monatName = (monat: number) =>
    format.dateTime(new Date(Date.UTC(2000, monat - 1, 1)), { month: "long" });

  return (
    <Section
      title={kzt("titel")}
      description={kzt("lead")}
      action={<DatenquelleBadge quelle={quelle} />}
    >
      {steuersatz ? (
        <AbzugsKacheln steuersatz={steuersatz} />
      ) : (
        <LeererZustand titel={kzt("keinSatz")} modul="lohn" />
      )}
      {steuersatz ? (
        <p className="text-[11px] leading-4 text-muted-foreground">
          {kzt("quelle")} {steuersatz.quelle}
        </p>
      ) : null}

      {darfBerechnen ? <LohnMonatAbzuegeBerechnenFormular /> : null}
      {darfBerechnen ? <LohnAbzuegeVorschauFormular /> : null}

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
            <td colSpan={8} className="px-3 py-2">
              <LeererZustand titel={kzt("keineAbzuege")} modul="lohn" />
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
              <td className="px-3 py-2.5 text-muted-foreground">{geldGenau(m.bruttoGesamtTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{geldGenau(m.opvTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{geldGenau(m.vosmsTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">
                {m.ipnTenge === 0 ? (
                  <StatusPill tone="success">{kzt("steuerfrei")}</StatusPill>
                ) : (
                  geldGenau(m.ipnTenge)
                )}
              </td>
              <td className="px-3 py-2.5 font-bold text-foreground">{geldGenau(m.nettoTenge)}</td>
              <td className="px-3 py-2.5 text-muted-foreground">{geldGenau(m.arbeitgeberkostenGesamtTenge)}</td>
            </tr>
          ))
        )}
      </DataTable>
      <Card className="bg-muted/30 text-xs leading-5 text-muted-foreground">{kzt("note")}</Card>
    </Section>
  );
}

/** ОПВ, ВОСМС und ИПН des Arbeitnehmers, dazu die Arbeitgeberlast als Summe ihrer vier Sätze. */
async function AbzugsKacheln({ steuersatz }: { steuersatz: LohnSteuersatzKz }) {
  const [kzt, format] = await Promise.all([getTranslations("lohnAnsicht.kz"), getFormatter()]);
  const { geld, zahl1 } = lohnFormate(format);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Stat
        label={kzt("stat.opv")}
        value={`${zahl1(steuersatz.opvProzent)} %`}
        helper={kzt("stat.opvHinweis")}
      />
      <Stat
        label={kzt("stat.vosms")}
        value={`${zahl1(steuersatz.vosmsProzent)} %`}
        helper={kzt("stat.vosmsHinweis")}
      />
      <Stat
        label={kzt("stat.ipn")}
        value={`${zahl1(steuersatz.ipnProzent)} %`}
        helper={`${kzt("stat.freibetrag")} ${geld(steuersatz.ipnFreibetragTenge)}`}
      />
      <Stat
        label={kzt("stat.arbeitgeberlast")}
        value={`${zahl1(
          steuersatz.opvrProzent + steuersatz.soProzent + steuersatz.snProzent + steuersatz.osmsProzent,
        )} %`}
        helper={kzt("stat.arbeitgeberlastHinweis")}
      />
    </div>
  );
}
