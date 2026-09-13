import type { CSSProperties } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { CountUp } from "@/components/site/count-up";
import { Reveal } from "@/components/site/reveal";
import { BereichsOrbit } from "@/components/site/bereichs-orbit";
import { ModulReiter } from "@/components/site/modul-reiter";
import { zones } from "@/lib/modules";
import { kpis, zielerreichung } from "@/lib/domain/kpis";
import { bereichsBilder } from "@/lib/site-medien";

// "Warum die Himbeere anders ist" steht als Bento in beere-bento.tsx, die
// Nachweiskette als animierte Kette in belegkette.tsx.

// Groesste Zahl in einer Preisangabe: "1.500 - 1.600 ₸/kg" ergibt 1600. Der
// Tausenderpunkt faellt weg; ein Dezimalkomma kommt in diesen Angaben nicht
// vor. Daraus entsteht der Balken je Stufe - die Spanne wird sichtbar, statt
// nur dazustehen.
function preisZahl(text: string) {
  const zahlen = [...text.matchAll(/\d[\d.]*/g)].map((treffer) =>
    Number(treffer[0].replace(/\./g, "")),
  );
  return zahlen.length > 0 ? Math.max(...zahlen) : 0;
}

export function PriceSpread() {
  const s = useTranslations("landing");
  const tiers = ["lose", "schale", "premium"] as const;
  const preise = tiers.map((tier) => preisZahl(s(`spreadTiers.${tier}.price`)));
  const hoechster = Math.max(...preise, 1);

  return (
    <section className="container scroll-mt-20 py-16 md:py-24">
      <Reveal art="wisch">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {s("spreadEyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {s("spreadTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {s("spreadLead")}
        </p>
      </Reveal>

      <Reveal staffel className="mt-10 grid gap-4 md:grid-cols-3">
        {tiers.map((tier, index) => (
          <div
            key={tier}
            className={`relative rounded-2xl border p-6 ${
              index === 2
                ? "border-primary/40 bg-primary/5"
                : "border-border bg-card"
            }`}
          >
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {s(`spreadTiers.${tier}.label`)}
            </p>
            <p className="mt-2 text-2xl font-black text-foreground">
              {s(`spreadTiers.${tier}.price`)}
            </p>
            <div className={`mt-3 ${index === 2 ? "text-primary" : "text-himbeere"}`}>
              <div className="wertbalken">
                <i
                  style={
                    {
                      "--breite": `${Math.round((preise[index]! / hoechster) * 100)}%`,
                    } as CSSProperties
                  }
                />
              </div>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">
              {s(`spreadTiers.${tier}.note`)}
            </p>
          </div>
        ))}
      </Reveal>

      <div className="mt-6 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-[auto_1fr] sm:items-center">
        <p className="text-4xl font-black text-primary">
          {s("spreadFactor")}
        </p>
        <p className="text-sm leading-6 text-muted-foreground">
          {s("spreadFactorText")}
        </p>
      </div>
    </section>
  );
}

export function ZonesOverview() {
  const t = useTranslations("zones");
  const s = useTranslations("landing");

  return (
    <section id="zonen" className="container scroll-mt-20 py-16 md:py-24">
      {/* Links die Aussage, rechts das Bild dazu: Vier Bereiche haengen an
          derselben Charge. Der Orbit steht neben der Ueberschrift, weil die
          rechte Haelfte dort sonst leer bleibt. */}
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("zonesEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("zonesTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("zonesLead")}
          </p>
        </Reveal>

        <Reveal>
          <BereichsOrbit />
        </Reveal>
      </div>

      <Reveal staffel className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((zone) => (
          <Link
            key={zone.key}
            href={`/dashboard/${zone.key}`}
            className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
          >
            {/* Symbolbild des Bereichs. Die Überschrift benennt den Bereich
                schon, deshalb ist das Bild für Screenreader ausgeblendet. */}
            <div aria-hidden className="relative aspect-4/3 overflow-hidden bg-secondary">
              <Image
                src={bereichsBilder[zone.key]}
                alt=""
                fill
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                loading="lazy"
                className="object-cover transition-transform duration-500 ease-out group-hover:scale-105"
              />
            </div>
            <div className="flex flex-1 flex-col p-5">
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon name={zone.icon} className="h-5 w-5" />
                </span>
                <h3 className="text-lg font-black text-card-foreground">
                  {t(`${zone.key}.name`)}
                </h3>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t(`${zone.key}.tagline`)}
              </p>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-xs font-bold text-primary">
                {s("openZone")}
                <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </div>
          </Link>
        ))}
      </Reveal>

      <ModulReiter />
    </section>
  );
}

export function Levers() {
  const s = useTranslations("landing");
  const levers = ["stunde", "herbstfenster", "zugang", "aggregation"];

  return (
    <section className="container py-16 md:py-24">
      <Reveal art="wisch">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {s("leversEyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {s("leversTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {s("leversLead")}
        </p>
      </Reveal>

      <Reveal staffel className="mt-10 grid gap-4 md:grid-cols-2">
        {levers.map((lever, index) => (
          <div
            key={lever}
            className="rounded-2xl border border-border bg-card p-6"
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 text-foreground">
                <span className="text-sm font-black">{index + 1}</span>
              </span>
              <h3 className="text-base font-black text-card-foreground">
                {s(`leverItems.${lever}.title`)}
              </h3>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {s(`leverItems.${lever}.text`)}
            </p>
          </div>
        ))}
      </Reveal>
    </section>
  );
}

export function KpiPreview() {
  const s = useTranslations("landing");
  const k = useTranslations("kpis");
  const z = useTranslations("zones");
  const d = useTranslations("dashboard.home");

  // Dunkles Band: bricht die Folge heller Kartenabschnitte und gibt den Zahlen
  // Groesse. Die Flaeche ist in beiden Farbschemata nachtblau, deshalb stehen
  // hier feste Weiss-Toene statt der Theme-Token - text-muted-foreground
  // waere im hellen Schema dunkelgrau auf Nachtblau.
  //
  // Vierzehn Kennzahlen in einer Reihe liest niemand zu Ende. Sie stehen
  // deshalb in denselben vier Bereichen, die die Seite ohnehin erzaehlt:
  // Feld und Hof je vier, Buero und Markt je drei. Der Balken an der Kachel
  // zeigt, wie weit der heutige Wert vom vereinbarten Ziel entfernt ist, und
  // waechst, sobald die Kachel im Bild steht. Die beiden Kennzahlen ausserhalb
  // des Zwoelfer-Cockpits (stufe "erweitert") stehen ohne Fuellung, damit die
  // Unterscheidung aus kpis.ts auch hier sichtbar bleibt.
  return (
    <section id="kpis" className="scroll-mt-20 bg-[#04161c] py-16 text-white md:py-24">
      <div className="container">
        <Reveal art="wisch">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[#3fd0e6]">
            {s("kpiEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black md:text-4xl">{s("kpiTitle")}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{s("kpiLead")}</p>
        </Reveal>

        <div className="mt-10 space-y-9">
          {zones.map((zone) => {
            const gruppe = kpis.filter((kpi) => kpi.zone === zone.key);
            if (gruppe.length === 0) return null;

            return (
              <div key={zone.key}>
                <div className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-[#3fd0e6]">
                    <Icon name={zone.icon} className="h-4 w-4" />
                  </span>
                  <h3 className="text-lg font-black">{z(`${zone.key}.name`)}</h3>
                  <span className="ml-auto text-xs font-bold text-white/40">{gruppe.length}</span>
                </div>

                <Reveal staffel className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {gruppe.map((kpi) => {
                    const anteil = zielerreichung(kpi);
                    const erreicht = anteil !== null && anteil > 0.999;

                    return (
                      <article
                        key={kpi.key}
                        className={`flex flex-col rounded-2xl border p-4 md:p-5 ${
                          kpi.stufe === "erweitert"
                            ? "border-dashed border-white/10"
                            : "border-white/10 bg-white/[0.04]"
                        }`}
                      >
                        <p className="font-heading text-2xl font-black md:text-3xl">
                          <CountUp wert={kpi.wert} />
                        </p>
                        <p className="mt-1.5 text-[11px] font-medium leading-4 text-white/65">
                          {k(`${kpi.key}.label`)}
                        </p>
                        {anteil === null ? null : (
                          <div
                            className={`mt-auto pt-4 ${erreicht ? "text-[#5ecfa0]" : "text-[#3fd0e6]"}`}
                          >
                            <div className="zielbalken">
                              <i
                                style={
                                  { "--fuellung": `${Math.round(anteil * 100)}%` } as CSSProperties
                                }
                              />
                            </div>
                            <p className="mt-1.5 text-[10px] font-semibold text-white/45">
                              {d("target")} {kpi.ziel}
                            </p>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </Reveal>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-xs text-white/55">{s("kpiFootnote")}</p>
      </div>
    </section>
  );
}

export function ComplianceBlock() {
  const s = useTranslations("landing");
  const items = ["steuer", "warenbegleit", "ki", "digitalkodex", "datenschutz", "esutd"];

  return (
    <section id="compliance" className="container scroll-mt-20 py-16 md:py-24">
      <Reveal art="wisch">
        <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
          {s("complianceEyebrow")}
        </p>
        <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
          {s("complianceTitle")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
          {s("complianceLead")}
        </p>
      </Reveal>

      <Reveal staffel className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-start gap-2.5">
              <span aria-hidden className="ringmarke mt-0.5 shrink-0 text-primary" />
              <p className="text-sm font-bold text-card-foreground">
                {s(`complianceItems.${item}.title`)}
              </p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {s(`complianceItems.${item}.text`)}
            </p>
          </div>
        ))}
      </Reveal>

      <div className="mt-6 flex items-start gap-3 rounded-xl border border-accent/25 bg-accent/6 p-4">
        <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
        <p className="text-xs leading-5 text-foreground">{s("complianceClosing")}</p>
      </div>
    </section>
  );
}

export function LandingCta() {
  const s = useTranslations("landing");

  return (
    <section className="container py-16 md:py-24">
      <div className="relative overflow-hidden rounded-3xl border border-primary/20 bg-primary px-6 py-12 text-primary-foreground md:px-12">
        <h2 className="max-w-2xl text-3xl font-black md:text-4xl">
          {s("ctaTitle")}
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-6 text-primary-foreground/90">
          {s("ctaLead")}
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-black text-[#04161c] shadow-xl transition hover:-translate-y-0.5"
        >
          {s("ctaButton")}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
