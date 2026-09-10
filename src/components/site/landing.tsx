import { useTranslations } from "next-intl";
import { ArrowRight, Check } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { CountUp } from "@/components/site/count-up";
import { Reveal } from "@/components/site/reveal";
import { zones } from "@/lib/modules";
import { kpis } from "@/lib/domain/kpis";

export function BerryReality() {
  const s = useTranslations("landing");
  const points = ["schale", "kuehlung", "umpacken", "feld", "rhythmus", "schaden"];

  return (
    <section
      id="himbeere"
      className="berry-field scroll-mt-20 border-b border-border bg-secondary/40 py-16 md:py-24"
    >
      <div className="container">
        <Reveal>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("berryEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("berryTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("berryLead")}
          </p>
        </Reveal>

        <Reveal delay={90} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {points.map((point) => (
            <div
              key={point}
              className="rounded-2xl border border-border bg-card p-5"
            >
              <p className="text-sm font-black text-card-foreground">
                {s(`berryPoints.${point}.title`)}
              </p>
              <p className="mt-1.5 text-xs leading-5 text-muted-foreground">
                {s(`berryPoints.${point}.text`)}
              </p>
            </div>
          ))}
        </Reveal>

        <p className="mt-6 max-w-2xl border-l-2 border-primary/40 pl-4 text-sm font-semibold italic leading-6 text-foreground">
          {s("berryQuote")}
        </p>
      </div>
    </section>
  );
}

export function PriceSpread() {
  const s = useTranslations("landing");
  const tiers = ["lose", "schale", "premium"] as const;

  return (
    <section className="container scroll-mt-20 py-16 md:py-24">
      <Reveal>
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

      <Reveal delay={90} className="mt-10 grid gap-4 md:grid-cols-3">
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
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
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
      <Reveal>
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

      <Reveal delay={90} className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {zones.map((zone) => (
          <Link
            key={zone.key}
            href={`/dashboard/${zone.key}`}
            className="group rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/40"
          >
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon name={zone.icon} className="h-5 w-5" />
            </span>
            <h3 className="mt-4 text-lg font-black text-card-foreground">
              {t(`${zone.key}.name`)}
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {t(`${zone.key}.tagline`)}
            </p>
            <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-primary">
              {s("openZone")}
              <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </Reveal>
    </section>
  );
}

export function ProofChain() {
  const s = useTranslations("landing");
  const steps = ["kuehlkurve", "charge", "herkunftsblock", "pfluecker", "behandlung"];

  return (
    <section
      id="belegbarkeit"
      className="scroll-mt-20 border-y border-border bg-secondary/40 py-16 md:py-24"
    >
      <div className="container">
        <Reveal>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("proofEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("proofTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("proofLead")}
          </p>
        </Reveal>

        <ol className="mt-10 grid gap-3 md:grid-cols-5">
          {steps.map((step, index) => (
            <li
              key={step}
              className="relative rounded-2xl border border-border bg-card p-4"
            >
              <span className="text-xs font-black text-primary">
                {String(index + 1).padStart(2, "0")}
              </span>
              <p className="mt-1 text-sm font-bold text-card-foreground">
                {s(`proofSteps.${step}.title`)}
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">
                {s(`proofSteps.${step}.text`)}
              </p>
            </li>
          ))}
        </ol>

        <p className="mt-6 max-w-2xl text-sm font-semibold leading-6 text-foreground">
          {s("proofClosing")}
        </p>
      </div>
    </section>
  );
}

export function Levers() {
  const s = useTranslations("landing");
  const levers = ["stunde", "herbstfenster", "zugang", "aggregation"];

  return (
    <section className="container py-16 md:py-24">
      <Reveal>
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

      <Reveal delay={90} className="mt-10 grid gap-4 md:grid-cols-2">
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

  return (
    <section
      id="kpis"
      className="scroll-mt-20 border-y border-border bg-secondary/40 py-16 md:py-24"
    >
      <div className="container">
        <Reveal>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-primary">
            {s("kpiEyebrow")}
          </p>
          <h2 className="mt-2 max-w-2xl text-3xl font-black text-foreground md:text-4xl">
            {s("kpiTitle")}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            {s("kpiLead")}
          </p>
        </Reveal>

        <Reveal delay={90} className="mt-10 grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-7">
          {kpis.map((kpi) => (
            <div
              key={kpi.key}
              className="rounded-xl border border-border bg-card p-3"
            >
              <p className="text-lg font-black text-foreground">
                <CountUp wert={kpi.wert} />
              </p>
              <p className="mt-1 text-[11px] font-medium leading-4 text-muted-foreground">
                {k(`${kpi.key}.label`)}
              </p>
            </div>
          ))}
        </Reveal>
        <p className="mt-4 text-xs text-muted-foreground">{s("kpiFootnote")}</p>
      </div>
    </section>
  );
}

export function ComplianceBlock() {
  const s = useTranslations("landing");
  const items = ["steuer", "warenbegleit", "ki", "digitalkodex", "datenschutz", "esutd"];

  return (
    <section id="compliance" className="container scroll-mt-20 py-16 md:py-24">
      <Reveal>
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

      <Reveal delay={90} className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item} className="rounded-xl border border-border bg-card p-4">
            <p className="text-sm font-bold text-card-foreground">
              {s(`complianceItems.${item}.title`)}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
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
