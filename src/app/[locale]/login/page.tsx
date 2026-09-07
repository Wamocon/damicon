import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Database, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { LoginForm } from "@/components/auth/login-form";
import { PlantationBackdrop } from "@/components/site/plantation-backdrop";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { roles } from "@/lib/rbac";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "auth" });
  return { title: t("title") };
}

// Demo-Zugaenge nur zeigen, wenn sie auch existieren: lokal immer, deployt nur
// mit ausdruecklichem Flag.
function zeigeDemoZugaenge(): boolean {
  const flag = process.env.NEXT_PUBLIC_DEMO_LOGINS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

const demoKonten: Record<string, string> = {
  admin: "admin@damicon.demo",
  betriebsleitung: "leitung@damicon.demo",
  buchhaltung: "buchhaltung@damicon.demo",
  brigade: "brigade@damicon.demo",
  picker: "pfluecker@damicon.demo",
  erzeuger: "erzeuger@damicon.demo",
  kunde: "kunde@damicon.demo",
};

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ weiter?: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const { weiter } = await searchParams;

  const t = await getTranslations({ locale, namespace: "auth" });
  const roleT = await getTranslations({ locale, namespace: "roles" });
  const konfiguriert = isSupabaseConfigured();

  return (
    <main
      id="main"
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#1a0308] px-4 py-12"
    >
      <PlantationBackdrop className="absolute inset-0 -z-10" />

      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-white/70 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("backToSite")}
        </Link>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-center gap-3">
            <DamiconLogo className="h-11 w-11" />
            <div>
              <p className="text-lg font-black leading-5 text-card-foreground">
                {t("title")}
              </p>
              <p className="text-xs text-muted-foreground">{t("lead")}</p>
            </div>
          </div>

          <div className="mt-6">
            {konfiguriert ? (
              <LoginForm weiter={weiter} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.08] p-3">
                  <Database className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div>
                    <p className="text-xs font-bold text-foreground">
                      {t("demoModeTitle")}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {t("demoModeLead")}
                    </p>
                  </div>
                </div>
                <Link
                  href="/dashboard"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground transition hover:brightness-110"
                >
                  {t("toDashboard")}
                </Link>
              </div>
            )}
          </div>

          {konfiguriert && zeigeDemoZugaenge() ? (
            <div className="mt-6 border-t border-border pt-5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                <p className="text-xs font-bold text-card-foreground">
                  {t("demoTitle")}
                </p>
              </div>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {t("demoLead")}
              </p>
              <dl className="mt-3 space-y-1">
                {roles.map((role) => (
                  <div
                    key={role}
                    className="flex items-baseline justify-between gap-3 text-[11px]"
                  >
                    <dt className="font-semibold text-card-foreground">
                      {roleT(role)}
                    </dt>
                    <dd className="font-mono text-muted-foreground">
                      {demoKonten[role]}
                    </dd>
                  </div>
                ))}
              </dl>
              <p className="mt-3 rounded-lg bg-muted/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                {t("demoPassword")}{" "}
                <span className="font-mono font-semibold text-foreground">
                  DamiconDemo2026!
                </span>
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}
