import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ShieldCheck } from "lucide-react";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { MfaChallengeForm } from "@/components/auth/mfa-challenge-form";
import { PlantationBackdrop } from "@/components/site/plantation-backdrop";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth.mfaChallenge" });
  return { title: t("title") };
}

export default async function MfaChallengePage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ weiter?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { weiter } = await searchParams;
  const t = await getTranslations({ locale, namespace: "auth.mfaChallenge" });

  // Diese Seite setzt eine bestehende AAL1-Sitzung voraus, die tatsaechlich
  // einen zweiten Faktor verlangt - ohne Supabase-Umgebung oder ohne offene
  // Challenge zurueck zur normalen Anmeldung, statt eine Eingabemaske ohne
  // Wirkung zu zeigen.
  if (!isSupabaseConfigured()) redirect(`/${locale}/login`);
  const supabase = await createClient();
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.nextLevel === aal.currentLevel) {
    redirect(`/${locale}/login`);
  }

  return (
    <main
      id="main"
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#04161c] px-4 py-12"
    >
      <PlantationBackdrop className="absolute inset-0 -z-10" />

      <div className="w-full max-w-md">
        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-center gap-3">
            <DamiconLogo className="h-11 w-11" />
            <div>
              <p className="flex items-center gap-1.5 text-lg font-black leading-5 text-card-foreground">
                <ShieldCheck className="h-4 w-4 text-primary" />
                {t("title")}
              </p>
              <p className="text-xs text-muted-foreground">{t("lead")}</p>
            </div>
          </div>

          <div className="mt-6">
            <MfaChallengeForm weiter={weiter} />
          </div>
        </div>
      </div>
    </main>
  );
}
