import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/icon";
import { AdministrationSeite } from "@/components/dashboard/administration-seite";
import { kachelVerweis } from "@/components/ui/kit";
import { adminSeiteHref, adminSeiten, darfAdministrieren } from "@/lib/administration";
import { getSessionProfile } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

// Uebersicht des Bereichs Administration: eine Kachel je Unterseite, wie die Bereichsseiten der Zonen ihre Module
// zeigen. Nur fuer die Administration; fuer alle anderen Rollen gibt es den Bereich nicht (404, nicht "verboten").
export default async function AdministrationPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("administration");

  // Im Demo-Modus (ohne Datenbank) gibt es nichts zu verwalten. Die Navigation folgt dort der Demo-Rolle, wie bei den Zonen.
  if (isSupabaseConfigured()) {
    const profil = await getSessionProfile();
    if (!darfAdministrieren(profil?.role)) notFound();
  }

  return (
    <AdministrationSeite>
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {adminSeiten.map((seite) => (
          <li key={seite.key} className="flex">
            <Link href={adminSeiteHref(seite)} className={cn(kachelVerweis, "w-full gap-2 p-5")}>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon name={seite.icon} className="h-5 w-5" />
              </span>
              <span className="mt-1 text-base font-black text-card-foreground">{t(`seiten.${seite.key}.navTitle`)}</span>
              <span className="text-xs leading-5 text-muted-foreground">{t(`seiten.${seite.key}.description`)}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-2 text-xs font-semibold text-primary">
                {t("oeffnen")}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </AdministrationSeite>
  );
}
