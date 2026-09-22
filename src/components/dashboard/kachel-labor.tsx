"use client";

// Kachel-Labor: jede vorgeschlagene Darstellungsform einmal, neben der
// heutigen Kachel, mit echten Werten aus dem Betrieb.
//
// Der Zweck ist die Entscheidung, nicht der Betrieb. Sieben Klassen, in denen
// die einheitliche KennzahlBox die Kennzahl schlechter zeigt als eine eigene
// Form es koennte - je Klasse die heutige Kachel und zwei Alternativen
// nebeneinander, damit man vergleicht statt sich zu erinnern.
//
// Die Seite haengt ausdruecklich NICHT an lib/modules.ts: sie ist kein
// Fachmodul, sondern eine Referenz fuer die Oberflaeche - dieselbe Ausnahme
// wie /dashboard/sicherheit.

import { useFormatter, useTranslations } from "next-intl";
import { Card, PageHeader, Section, StatusPill } from "@/components/ui/kit";
import { KennzahlBox } from "@/components/dashboard/kennzahl-box";
import {
  AnteilPunkte,
  Heldenzahl,
  Meter,
  Punktstreifen,
  Rangliste,
  Segmente,
  Verlaufslinie,
  Zaehler,
} from "@/components/dashboard/kachel-formen";
import { zielAuswerten, type Zielstand } from "@/lib/domain/zielstand";
import type { Kpi } from "@/lib/domain/kpis";
import type { LaborDaten } from "@/lib/data/kachel-labor";
import type { Datenquelle } from "@/lib/supabase/config";

/** Eine Zelle im Vergleich: Name der Form, darunter die Kachel. */
function Probe({
  name,
  heute = false,
  children,
}: {
  name: string;
  heute?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {name}
        {heute ? <StatusPill tone="neutral">1</StatusPill> : null}
      </p>
      {children}
    </div>
  );
}

/** Die Huelle einer Alternative - dieselbe Flaeche wie eine KennzahlBox. */
function Probekachel({
  kurz,
  lang,
  fuss,
  children,
}: {
  kurz: string;
  lang: string;
  fuss?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-w-0 flex-col rounded-xl border border-border bg-card p-3">
      <p className="line-clamp-2 min-h-8 text-[11px] font-semibold leading-4 text-card-foreground">
        {kurz}
      </p>
      <p className="mt-1 min-h-8 text-[10px] leading-4 text-muted-foreground">
        {lang}
      </p>
      {children}
      {fuss ? (
        <p className="mt-auto flex flex-wrap items-center gap-x-1.5 pt-2 text-[10px] leading-4 text-muted-foreground">
          {fuss}
        </p>
      ) : null}
    </div>
  );
}

function Gruppe({
  titel,
  lead,
  children,
}: {
  titel: string;
  lead: string;
  children: React.ReactNode;
}) {
  return (
    <Section title={titel} description={lead}>
      {/* @container, nicht die Fensterbreite: die Proben stehen in einer
          Karte, und was darin umbricht, richtet sich nach der Karte. */}
      <div className="@container">
        <div className="grid gap-4 @2xl:grid-cols-3">{children}</div>
      </div>
    </Section>
  );
}

export function KachelLabor({
  kpis,
  daten,
  quelle,
}: {
  kpis: Kpi[];
  daten: LaborDaten;
  quelle: Datenquelle;
}) {
  const t = useTranslations("kachelLabor");
  const format = useFormatter();
  const kpiT = useTranslations("kpis");
  const quelleT = useTranslations("dashboard.dataSource");

  const holen = (schluessel: string) => kpis.find((k) => k.key === schluessel);
  const kurz = (schluessel: string) =>
    kpiT.has(`${schluessel}.kurz`)
      ? kpiT(`${schluessel}.kurz`)
      : kpiT(`${schluessel}.label`);
  const lang = (schluessel: string) => kpiT(`${schluessel}.label`);

  // Denselben Istwert zeigen wie die KennzahlBox daneben. Gaebe man hier
  // kpi.wert aus, stuende links der gerechnete Wert und rechts der
  // unterschriebene Platzhalter - zwei Zahlen fuer dieselbe Kennzahl.
  const istText = (kpi: Kpi) =>
    kpi.gerechnet
      ? `${format.number(kpi.gerechnet.zahl, { maximumFractionDigits: 1 })} ${kpi.gerechnet.einheit}`.trim()
      : kpi.wert;

  const verlust = holen("verlustquote");
  const streuung = holen("pflueckStreuung");
  const vorkuehlung = holen("zeitBisVorkuehlung");
  const wartezeit = holen("behandlungenWartezeit");
  const esutd = holen("esutdAbdeckung");
  const anfragen = holen("websiteAnfragen");
  const deckung = holen("deckungsbeitrag");

  // Fuer jede Form braucht es Ist und Soll als Zahl. zielAuswerten() liest
  // beide aus den formatierten Zeichenketten ("8,4 %", "< 6 %") - dieselbe
  // Ableitung, die auch die Ampel der Kachel benutzt.
  const werte = (kpi?: Kpi) => {
    if (!kpi) return null;
    const a = zielAuswerten(kpi);
    if (a.ist === null || a.soll === null) return null;
    return { ist: a.ist, soll: a.soll, stand: a.stand as Zielstand };
  };

  const vVerlust = werte(verlust);
  const vVorkuehlung = werte(vorkuehlung);
  const vDeckung = werte(deckung);

  const personen = daten.personen.map((p) => ({
    name: p.name,
    wert: p.kgProStunde,
  }));
  const chargen = daten.vorkuehlung.map((c) => ({
    name: c.code,
    wert: c.minuten,
  }));
  const verlustJeCharge = daten.verlust.map((c) => ({
    name: c.code,
    wert: c.quote,
  }));
  const laengste = daten.vorkuehlung.at(-1);
  const ueberSechzig = daten.vorkuehlung.filter((c) => c.minuten > 60).length;
  const verstoesse = daten.wartezeit.gesamt - daten.wartezeit.erfuellt;
  const offeneVertraege = daten.esutd.gesamt - daten.esutd.erfuellt;

  return (
    <div className="space-y-6">
      <Card ton="box" className="p-5 sm:p-6">
        <PageHeader title={t("titel")} description={t("einleitung")} />
        <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <StatusPill tone={quelle === "db" ? "success" : "warning"}>
            {quelleT(quelle === "db" ? "db" : "demo")}
          </StatusPill>
          {t("hinweis")}
        </p>
      </Card>

      {/* --- 1. Anteil gegen eine Zielmarke ---------------------------- */}
      {verlust && vVerlust ? (
        <Gruppe titel={t("gruppe.anteil")} lead={t("lead.anteil")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={verlust} zielband />
          </Probe>
          <Probe name={t("form.meter")}>
            <Probekachel
              kurz={kurz("verlustquote")}
              lang={lang("verlustquote")}
              fuss={t("ueberZiel", {
                abstand: Math.abs(vVerlust.ist - vVerlust.soll).toFixed(1),
              })}
            >
              <p className="mt-1.5 flex items-baseline gap-1">
                <span className="text-xl font-black">{istText(verlust)}</span>
              </p>
              <Meter
                ist={vVerlust.ist}
                ziel={vVerlust.soll}
                skalaBis={12}
                gutUnterhalb
                stand={vVerlust.stand}
                beschriftungVon="0"
                beschriftungZiel={`${t("ziel")} 6`}
                beschriftungBis="12 %"
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.rangliste")}>
            <Probekachel
              kurz={kurz("verlustquote")}
              lang={t("jeCharge")}
              fuss={t("chargen", { count: daten.verlust.length })}
            >
              <Rangliste
                zeilen={verlustJeCharge.slice(0, 5)}
                schwelle={vVerlust.soll}
                gutUnterhalb
              />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 2. Streuung zwischen Personen ----------------------------- */}
      {streuung ? (
        <Gruppe titel={t("gruppe.streuung")} lead={t("lead.streuung")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={streuung} zielband />
          </Probe>
          <Probe name={t("form.streifen")}>
            <Probekachel
              kurz={kurz("pflueckleistung")}
              lang={t("personen", { count: personen.length })}
              fuss={t("faelltAb")}
            >
              <Punktstreifen
                werte={personen}
                schwelle={7}
                skalaVon={3}
                skalaBis={8}
                gutUnterhalb={false}
                beschriftungVon="3"
                beschriftungBis="8 kg/h"
                beschriftungSchwelle={`${t("ziel")} 7`}
                ausreisserName={personen.at(-1)?.name}
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.rangliste")}>
            <Probekachel
              kurz={kurz("pflueckleistung")}
              lang={t("jeStunde")}
              fuss={t("personen", { count: personen.length })}
            >
              <Rangliste zeilen={personen} schwelle={7} />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 3. Dauer gegen eine Obergrenze ---------------------------- */}
      {vorkuehlung && vVorkuehlung ? (
        <Gruppe titel={t("gruppe.dauer")} lead={t("lead.dauer")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={vorkuehlung} zielband />
          </Probe>
          <Probe name={t("form.streifen")}>
            <Probekachel
              kurz={kurz("zeitBisVorkuehlung")}
              lang={t("chargen", { count: chargen.length })}
              fuss={t("ueberGrenze", {
                count: ueberSechzig,
                gesamt: chargen.length,
              })}
            >
              <Punktstreifen
                werte={chargen}
                schwelle={60}
                skalaVon={35}
                skalaBis={Math.max(75, (laengste?.minuten ?? 75) + 3)}
                gutUnterhalb
                beschriftungVon="35"
                beschriftungBis={`${Math.max(75, (laengste?.minuten ?? 75) + 3)} min`}
                beschriftungSchwelle="60 min"
                ausreisserName={laengste?.code}
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.zaehler")}>
            <Probekachel
              kurz={t("ueberschritten")}
              lang={kurz("zeitBisVorkuehlung")}
              fuss={t("laengste", { minuten: laengste?.minuten ?? 0 })}
            >
              <Zaehler
                zahl={ueberSechzig}
                zeile={t("ueberGrenze", {
                  count: ueberSechzig,
                  gesamt: chargen.length,
                })}
                stand={ueberSechzig === 0 ? "erfuellt" : "verfehlt"}
              />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 4. Null-Fehler-Quote -------------------------------------- */}
      {wartezeit ? (
        <Gruppe titel={t("gruppe.nullfehler")} lead={t("lead.nullfehler")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={wartezeit} zielband />
          </Probe>
          <Probe name={t("form.zaehler")}>
            <Probekachel
              kurz={t("verletzt")}
              lang={lang("behandlungenWartezeit")}
              fuss={t("behandlungen", { count: daten.wartezeit.gesamt })}
            >
              <Zaehler
                zahl={verstoesse}
                zeile={t("verstoesse", {
                  count: verstoesse,
                  gesamt: daten.wartezeit.gesamt,
                })}
                stand={verstoesse === 0 ? "erfuellt" : "verfehlt"}
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.segmente")}>
            <Probekachel
              kurz={t("jeVorgang")}
              lang={lang("behandlungenWartezeit")}
              fuss={t("behandlungen", { count: daten.wartezeit.gesamt })}
            >
              <Segmente
                zustaende={Array.from(
                  { length: daten.wartezeit.gesamt },
                  (_, i): Zielstand =>
                    i < daten.wartezeit.erfuellt ? "erfuellt" : "verfehlt",
                )}
                beschriftungVon={t("aeltester")}
                beschriftungBis={t("neuester")}
              />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 5. Kleine Grundgesamtheit --------------------------------- */}
      {esutd ? (
        <Gruppe titel={t("gruppe.klein")} lead={t("lead.klein")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={esutd} zielband />
          </Probe>
          <Probe name={t("form.punkte")}>
            <Probekachel
              kurz={kurz("esutdAbdeckung")}
              lang={t("jeSaisonkraft")}
              fuss={t("offeneVertraege", { count: offeneVertraege })}
            >
              <AnteilPunkte
                erfuellt={daten.esutd.erfuellt}
                gesamt={daten.esutd.gesamt}
                zeile={t("vonGesamt", { gesamt: daten.esutd.gesamt })}
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.segmente")}>
            <Probekachel
              kurz={kurz("esutdAbdeckung")}
              lang={t("jeSaisonkraft")}
              fuss={t("offeneVertraege", { count: offeneVertraege })}
            >
              <Segmente
                zustaende={Array.from(
                  { length: daten.esutd.gesamt },
                  (_, i): Zielstand =>
                    i < daten.esutd.erfuellt ? "erfuellt" : "offen",
                )}
                beschriftungVon={t("erfasst")}
                beschriftungBis={t("offen")}
              />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 6. Kennzahl ohne Zielwert --------------------------------- */}
      {anfragen ? (
        <Gruppe titel={t("gruppe.ohneZiel")} lead={t("lead.ohneZiel")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={anfragen} zielband />
          </Probe>
          <Probe name={t("form.verlauf")}>
            <Probekachel
              kurz={kurz("websiteAnfragen")}
              lang={lang("websiteAnfragen")}
              fuss={t("messpunkte", { count: daten.verlauf.length })}
            >
              <Verlaufslinie
                punkte={daten.verlauf}
                beschriftungVon={daten.verlauf[0]?.tag ?? ""}
                beschriftungBis={daten.verlauf.at(-1)?.tag ?? ""}
                leer={t("verlaufLeer")}
              />
            </Probekachel>
          </Probe>
          <Probe name={t("form.zaehler")}>
            <Probekachel
              kurz={kurz("websiteAnfragen")}
              lang={lang("websiteAnfragen")}
              fuss={t("ohneZielwert")}
            >
              <Zaehler
                zahl={Number(anfragen.wert.replace(/\D/g, "")) || 0}
                zeile={t("imMonat")}
                stand="offen"
              />
            </Probekachel>
          </Probe>
        </Gruppe>
      ) : null}

      {/* --- 7. Die Leitzahl ------------------------------------------- */}
      {deckung ? (
        <Gruppe titel={t("gruppe.leitzahl")} lead={t("lead.leitzahl")}>
          <Probe name={t("form.heute")} heute>
            <KennzahlBox kpi={deckung} zielband />
          </Probe>
          <div className="@2xl:col-span-2">
            <Probe name={t("form.held")}>
              <Probekachel
                kurz={lang("deckungsbeitrag")}
                lang={kpiT.has("deckungsbeitrag.basis") ? kpiT("deckungsbeitrag.basis") : ""}
              >
                <Heldenzahl
                  zahl={deckung.gerechnet
                    ? String(Math.round(deckung.gerechnet.zahl))
                    : deckung.wert.replace(/[^\d.,-]/g, "")}
                  einheit={deckung.gerechnet?.einheit ?? "₸/kg"}
                  unterzeile={`${t("ziel")} ${deckung.ziel}`}
                  stand={vDeckung?.stand ?? "offen"}
                  meter={
                    vDeckung ? (
                      <Meter
                        ist={vDeckung.ist}
                        ziel={vDeckung.soll}
                        skalaBis={1000}
                        gutUnterhalb={false}
                        stand={vDeckung.stand}
                        beschriftungVon="0"
                        beschriftungZiel="500"
                        beschriftungBis="1000 ₸"
                      />
                    ) : undefined
                  }
                />
              </Probekachel>
            </Probe>
          </div>
        </Gruppe>
      ) : null}
    </div>
  );
}
