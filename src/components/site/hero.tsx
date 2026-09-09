import { useTranslations } from "next-intl";
import { ArrowRight, Snowflake, Timer, Repeat } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { HeroVideo } from "@/components/site/hero-video";

export function Hero() {
  const t = useTranslations("hero");

  const stats = [
    { icon: Timer, value: "stat1Value", label: "stat1Label" },
    { icon: Repeat, value: "stat2Value", label: "stat2Label" },
    { icon: Snowflake, value: "stat3Value", label: "stat3Label" },
  ] as const;

  return (
    <section className="relative isolate overflow-hidden bg-[#04161c] text-white">
      {/* Echtes Rundgangsmaterial aus der Plantage im Umland Almaty statt
          eines Stockfotos - siehe hero-video.tsx. */}
      <HeroVideo className="absolute inset-0 -z-10 h-full w-full opacity-45" />
      {/* Zwei Lichter ueber dem Video: das Flaggenblau (#00afca) mittig als
          Himmel, oben rechts ein Goldschimmer (#d8a507) als Sonne - dieselbe
          Anordnung wie auf der Flagge. Darunter zieht der Verlauf das Bild ins
          Nachtblau, damit die Schrift ueberall genug Kontrast hat. */}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_55%_at_50%_38%,rgba(0,175,202,0.30)_0%,transparent_62%),radial-gradient(ellipse_45%_50%_at_82%_20%,rgba(216,165,7,0.20)_0%,transparent_55%),linear-gradient(180deg,rgba(4,22,28,0.55)_0%,rgba(4,22,28,0.92)_100%)]" />

      <div className="container relative flex min-h-[calc(100svh-4rem)] flex-col justify-center py-16">
        <div className="mb-5 inline-flex w-fit items-center gap-2 rounded-full border border-white/15 bg-white/6 px-3 py-1.5 text-xs font-semibold tracking-wide text-white/80 backdrop-blur">
          {/* Auf der festen Nachtblau-Flaeche des Heros greift nicht der
              Light-Mode-Token, sondern das helle Koek-Blau des Dark-Themes -
              #00768f wuerde hier absaufen. */}
          <span className="h-1.5 w-1.5 rounded-full bg-[#3fd0e6]" />
          {t("badge")}
        </div>
        <h1 className="max-w-4xl text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl md:text-6xl">
          {t("headline")}
        </h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-white/80 sm:text-lg">
          {t("subheadline")}
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/dashboard"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-7 text-sm font-black text-[#04161c] shadow-xl transition hover:-translate-y-0.5 hover:bg-white/90"
          >
            {t("ctaPrimary")}
            <ArrowRight className="h-4 w-4" />
          </Link>
          <a
            href="#himbeere"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-white/25 bg-white/10 px-7 text-sm font-bold text-white backdrop-blur transition hover:bg-white/20"
          >
            {t("ctaSecondary")}
          </a>
        </div>

        <dl className="mt-12 grid max-w-3xl gap-3 sm:grid-cols-3">
          {stats.map(({ icon: I, value, label }) => (
            <div
              key={value}
              className="rounded-2xl border border-white/15 bg-white/6 p-4 backdrop-blur-xl"
            >
              <I className="mb-2 h-4 w-4 text-primary" />
              <dt className="text-lg font-black text-white">{t(value)}</dt>
              <dd className="mt-0.5 text-xs leading-relaxed text-white/70">
                {t(label)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
