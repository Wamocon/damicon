"use client";

import { useLocale, useTranslations } from "next-intl";
import { Bell, LogOut, Search, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { PersonaSwitcher, usePersona } from "@/components/dashboard/persona";
import { abmelden } from "@/app/[locale]/login/actions";

function initialen(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((teil) => teil[0]?.toUpperCase() ?? "")
    .join("");
}

function Benutzerbereich() {
  const { name, echteRolle, demoModus } = usePersona();
  const locale = useLocale();
  const t = useTranslations("auth");
  const roleT = useTranslations("roles");

  if (demoModus || !name) return null;

  return (
    <div className="flex items-center gap-2">
      <div className="hidden items-center gap-2 rounded-lg border border-border bg-card px-2.5 py-1.5 md:flex">
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-[10px] font-black text-primary">
          {initialen(name)}
        </span>
        <span className="min-w-0">
          <span className="block max-w-[150px] truncate text-[11px] font-bold leading-3 text-card-foreground">
            {name}
          </span>
          <span className="block text-[10px] leading-4 text-muted-foreground">
            {roleT(echteRolle)}
          </span>
        </span>
      </div>
      <Link
        href="/dashboard/sicherheit"
        aria-label={t("security")}
        title={t("security")}
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
      >
        <ShieldCheck className="h-4 w-4" />
      </Link>
      <form action={abmelden}>
        <input type="hidden" name="locale" value={locale} />
        <button
          type="submit"
          aria-label={t("signOut")}
          title={t("signOut")}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

export function DashboardTopbar() {
  const t = useTranslations("dashboard");

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 pl-16 backdrop-blur-xl md:px-6 md:pl-6 print:hidden">
      <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground sm:flex">
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">{t("searchPlaceholder")}</span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        <PersonaSwitcher className="hidden lg:inline-flex" />
        <LocaleSwitcher compact />
        <ThemeToggle />
        <button
          type="button"
          aria-label={t("notifications")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
        <Benutzerbereich />
      </div>
    </header>
  );
}
