"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
import { MalinaLogo } from "@/components/brand/malina-logo";
import { Icon } from "@/components/icon";
import { usePersona } from "@/components/dashboard/persona";
import { hasPermission } from "@/lib/rbac";
import { modulesForZone, zones } from "@/lib/modules";
import { cn } from "@/lib/utils";

function useIsActive() {
  const pathname = usePathname();
  return (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
}

function SidebarBody({ onNavigate }: { onNavigate?: () => void }) {
  const { role, demoModus } = usePersona();
  const nav = useTranslations("nav");
  const zoneT = useTranslations("zones");
  const moduleT = useTranslations("modules");
  const roleT = useTranslations("roles");
  const isActive = useIsActive();

  return (
    <div className="flex h-full min-h-0 flex-col p-4">
      <Link
        href="/"
        className="flex items-center gap-2.5"
        onClick={onNavigate}
      >
        <MalinaLogo className="shadow-lg shadow-primary/20" />
        <span className="min-w-0">
          <span className="block text-lg font-black leading-tight text-sidebar-foreground">
            Malina
          </span>
          <span className="block truncate text-[11px] font-semibold text-muted-foreground">
            {nav("platformSubtitle")}
          </span>
        </span>
      </Link>

      <div className="mt-5 rounded-xl border border-sidebar-border bg-sidebar-accent/70 p-3">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">
          {nav(demoModus ? "activePersona" : "activeRole")}
        </p>
        <p className="mt-1 truncate text-sm font-black text-card-foreground">
          {roleT(role)}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {roleT(`descriptions.${role}`)}
        </p>
      </div>

      <nav className="mt-5 min-h-0 flex-1 space-y-5 overflow-y-auto pr-1">
        <Link
          href="/dashboard"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
            isActive("/dashboard")
              ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
              : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
          )}
        >
          <LayoutDashboard className="h-4 w-4 shrink-0" />
          {nav("overview")}
        </Link>

        {zones.map((zone) => {
          const items = modulesForZone(zone.key).filter((module) =>
            hasPermission(role, module.resource, "view"),
          );
          if (items.length === 0) return null;
          return (
            <div key={zone.key}>
              <div className="flex items-center gap-2 px-3 pb-1.5">
                <Icon name={zone.icon} className="h-3.5 w-3.5 text-primary" />
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
                  {zoneT(`${zone.key}.name`)}
                </span>
              </div>
              <div className="space-y-1">
                {items.map((module) => {
                  const href = `/dashboard/${module.zone}/${module.slug}`;
                  return (
                    <Link
                      key={module.key}
                      href={href}
                      onClick={onNavigate}
                      className={cn(
                        "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive(href)
                          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                          : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
                      )}
                    >
                      <Icon name={module.icon} className="h-4 w-4" />
                      <span className="min-w-0 flex-1 truncate">
                        {moduleT(`${module.key}.title`)}
                      </span>
                      {module.reifegrad === "in-entwicklung" ? (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning"
                          aria-hidden="true"
                        />
                      ) : null}
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

export function DashboardSidebar() {
  const [open, setOpen] = useState(false);
  const nav = useTranslations("nav");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={nav("openMenu")}
        className="fixed left-4 top-4 z-50 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-foreground shadow-sm md:hidden print:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      <aside className="sticky top-0 hidden h-svh w-72 shrink-0 self-start overflow-hidden border-r border-sidebar-border bg-sidebar/95 backdrop-blur-xl md:block print:hidden">
        <SidebarBody />
      </aside>

      {open ? (
        <div className="fixed inset-0 z-[100] md:hidden print:hidden">
          <button
            type="button"
            aria-label={nav("closeMenu")}
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
          />
          <div className="absolute inset-y-0 left-0 w-72 max-w-[calc(100vw-2rem)] border-r border-sidebar-border bg-sidebar text-sidebar-foreground shadow-2xl">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={nav("closeMenu")}
              className="absolute right-3 top-3 z-10 rounded-lg p-2 text-muted-foreground hover:bg-sidebar-accent"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarBody onNavigate={() => setOpen(false)} />
          </div>
        </div>
      ) : null}
    </>
  );
}
