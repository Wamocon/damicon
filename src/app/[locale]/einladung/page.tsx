import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowLeft, Database, UserCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { EinladungForm } from "@/components/auth/einladung-form";
import { PlantationBackdrop } from "@/components/site/plantation-backdrop";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getSessionProfile } from "@/lib/auth";
import { abmelden } from "@/app/[locale]/login/actions";

// Kundenzugang ueber Einladung einloesen (Anforderung E.20). Oeffentliche
// Seite: wer hier landet, hat noch kein Konto. src/proxy.ts schuetzt nur
// /dashboard, dieser Pfad bleibt bewusst frei erreichbar.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "einladungSeite" });
  return {
    title: t("titel"),
    // Eine Einladungsseite gehoert in keinen Suchindex.
    robots: { index: false, follow: false },
  };
}

export default async function EinladungPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale, namespace: "einladungSeite" });
  const konfiguriert = isSupabaseConfigured();

  // Wer schon angemeldet ist, bekommt hier ein ZWEITES Konto - die Browser-
  // Sitzung bleibt aber die alte. Der Weg "Zur Anmeldung" fuehrt danach ueber
  // src/proxy.ts direkt zurueck ins alte Dashboard, und der Kunde haelt dessen
  // Daten fuer die seines neuen Zugangs. Deshalb der Hinweis samt Abmeldung,
  // bevor er das Formular ausfuellt.
  const angemeldet = konfiguriert ? await getSessionProfile() : null;

  return (
    <main
      id="main"
      className="relative flex min-h-svh items-center justify-center overflow-hidden bg-[#04161c] px-4 py-12"
    >
      <PlantationBackdrop className="absolute inset-0 -z-10" />

      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-6 inline-flex items-center gap-2 text-xs font-semibold text-white/70 transition hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("zurueck")}
        </Link>

        <div className="rounded-3xl border border-border bg-card p-6 shadow-2xl shadow-black/30 sm:p-8">
          <div className="flex items-center gap-3">
            <DamiconLogo className="h-11 w-11" />
            <div>
              <p className="text-lg font-black leading-5 text-card-foreground">{t("titel")}</p>
              <p className="text-xs text-muted-foreground">{t("lead")}</p>
            </div>
          </div>

          {angemeldet ? (
            <div className="mt-5 rounded-xl border border-warning/25 bg-warning/[0.08] p-3">
              <p className="flex items-center gap-1.5 text-xs font-bold text-foreground">
                <UserCheck className="h-3.5 w-3.5 shrink-0 text-warning" />
                {t("angemeldetTitel")}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                {t("angemeldetLead")}
              </p>
              <form action={abmelden} className="mt-2">
                <input type="hidden" name="locale" value={locale} />
                <button
                  type="submit"
                  className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-3 text-[11px] font-bold text-foreground transition hover:border-primary"
                >
                  {t("abmelden")}
                </button>
              </form>
            </div>
          ) : null}

          <div className="mt-6">
            {konfiguriert ? (
              // Bewusst ohne Vorbelegung aus der Adresszeile. Ein
              // "?code="-Parameter waere bequem, traegt den Berechtigungs-
              // nachweis aber in den Browserverlauf, in jedes Zugriffs-
              // protokoll und in den Cache des Service Workers (public/sw.js
              // legt jede Navigation samt Query-String ab). Der Code wird
              // abgetippt; codeNormalisieren() faengt Schreibweise und
              // fehlende Bindestriche ab.
              <EinladungForm />
            ) : (
              <div className="flex items-start gap-2 rounded-xl border border-warning/25 bg-warning/[0.08] p-3">
                <Database className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div>
                  <p className="text-xs font-bold text-foreground">{t("demoTitel")}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{t("demoLead")}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
