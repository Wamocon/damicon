import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { MalinaLogo } from "@/components/brand/malina-logo";

export function SiteFooter() {
  const t = useTranslations("footer");
  const nav = useTranslations("nav");

  return (
    <footer className="border-t border-border bg-card print:hidden">
      <div className="container grid gap-8 py-12 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <MalinaLogo />
            <span className="text-lg font-black text-foreground">Malina</span>
          </div>
          <p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">
            {t("blurb")}
          </p>
          <p className="mt-4 text-xs text-muted-foreground">{t("prototypeNote")}</p>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            {t("productHeading")}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/#zonen" className="hover:text-foreground">
                {nav("zones")}
              </Link>
            </li>
            <li>
              <Link href="/#belegbarkeit" className="hover:text-foreground">
                {nav("proof")}
              </Link>
            </li>
            <li>
              <Link href="/dashboard" className="hover:text-foreground">
                {nav("portal")}
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs font-black uppercase tracking-wide text-muted-foreground">
            {t("legalHeading")}
          </p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/impressum" className="hover:text-foreground">
                {t("imprint")}
              </Link>
            </li>
            <li>
              <Link href="/datenschutz" className="hover:text-foreground">
                {t("privacy")}
              </Link>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-border">
        <div className="container flex flex-col gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
          <p>{t("madeBy")}</p>
        </div>
      </div>
    </footer>
  );
}
