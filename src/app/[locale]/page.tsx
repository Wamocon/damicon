import { setRequestLocale } from "next-intl/server";
import { SiteNavbar } from "@/components/site/navbar";
import { SiteFooter } from "@/components/site/footer";
import { Hero } from "@/components/site/hero";
import { BeereBento } from "@/components/site/beere-bento";
import { SechzigMinuten } from "@/components/site/sechzig-minuten";
import { FarmReality } from "@/components/site/farm-reality";
import { ExistingAssets } from "@/components/site/existing-assets";
import { QualityStandard } from "@/components/site/quality-standard";
import { Belegkette } from "@/components/site/belegkette";
import { PlantagenScanAbschnitt } from "@/components/site/plantagen-scan";
import { WeichesScrollen } from "@/components/site/weiches-scrollen";
import { CursorFolger } from "@/components/site/cursor-folger";
import { TonSchalter } from "@/components/site/ton-schalter";
import { Fortschrittsbalken } from "@/components/site/fortschrittsbalken";
import { Fragen } from "@/components/site/fragen";
import {
  ComplianceBlock,
  KpiPreview,
  LandingCta,
  Levers,
  PriceSpread,
  ZonesOverview,
} from "@/components/site/landing";
import { HaustierTour } from "@/components/haustier/haustier-tour";
import { feldTon } from "@/lib/site-medien";

// Der Werbefilm ist das Bild des Heros, siehe components/site/hero-video.tsx.
// Einen eigenen Abschnitt dafuer gibt es nicht: derselbe Film zweimal auf
// derselben Seite waere eine Wiederholung, keine zweite Aussage.
//
// Reihenfolge als Erzaehlung: warum die Himbeere anders ist, die erste
// Stunde nach dem Pfluecken, dann der echte Betrieb, Preis, Massstab,
// Bestand und die Nachweiskette. Hell und dunkel wechseln sich ab (Hero,
// 60-Minuten-Szene und Kennzahlen sind nachtblau), damit die Seite nicht
// als eine lange Kartenwand liest.
//
// Sprachwechsel und Sprung ins Portal blenden weich ueber
// (lib/seitenwechsel.ts, aufgerufen in LocaleSwitcher und SiteNavbar).
export default async function LandingPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <Fortschrittsbalken />
      <SiteNavbar />
      <main id="main" className="pt-16">
        <Hero />
        <BeereBento />
        <SechzigMinuten />
        <FarmReality />
        <PriceSpread />
        <QualityStandard />
        <ExistingAssets />
        <Belegkette />
        <PlantagenScanAbschnitt />
        <Levers />
        <ZonesOverview />
        <KpiPreview />
        <ComplianceBlock />
        <Fragen />
        <LandingCta />
      </main>
      <SiteFooter />
      <WeichesScrollen />
      <CursorFolger />
      <TonSchalter quelle={feldTon} />
      <HaustierTour />
    </>
  );
}
