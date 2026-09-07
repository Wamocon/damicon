"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

const links = [
  { key: "zones", href: "/#zonen" },
  { key: "proof", href: "/#belegbarkeit" },
  { key: "kpis", href: "/#kpis" },
  { key: "compliance", href: "/#compliance" },
];

export function SiteNavbar() {
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <header className="glass fixed inset-x-0 top-0 z-50 border-b border-border/60 print:hidden">
      <div className="container flex h-16 items-center justify-between gap-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <DamiconLogo className="shadow-lg shadow-primary/20" />
          <span className="hidden min-w-0 flex-col min-[420px]:flex">
            <span className="text-sm font-black leading-tight text-foreground">
              Damicon
            </span>
            <span className="text-[10px] font-medium text-muted-foreground">
              {t("platformSubtitle")}
            </span>
          </span>
        </Link>

        <nav className="hidden items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-1 py-1 lg:flex">
          {links.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 lg:flex">
          <LocaleSwitcher />
          <ThemeToggle />
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition hover:bg-primary/90"
          >
            {t("portal")}
          </Link>
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LocaleSwitcher compact />
          <ThemeToggle />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={t("openMenu")}
            aria-expanded={open}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-muted/40 text-foreground"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open ? (
        <div className="border-t border-border/60 bg-background/95 px-4 py-4 lg:hidden">
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.key}
                href={link.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-2.5 text-base font-semibold text-foreground hover:bg-muted"
              >
                {t(link.key)}
              </Link>
            ))}
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
            >
              {t("portal")}
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
