"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
} from "lucide-react";
import { LocaleSwitcher } from "@/components/site/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { PersonaSwitcher, usePersona } from "@/components/dashboard/persona";
import { Himbeere } from "@/components/ki/himbeere";
import { useKiPane } from "@/components/ki/ki-pane-kontext";
import { cn } from "@/lib/utils";
import { SyncStatus } from "@/components/dashboard/sync-status";
import {
  istSchmal,
  schmalAbonnieren,
  schmalServer,
  schmalSetzen,
} from "@/components/dashboard/sidebar-zustand";

function KiFragenKnopf() {
  const t = useTranslations("dashboard");
  const { verfuegbar, offen, umschalten, modus } = useKiPane();
  if (!verfuegbar) return null;

  return (
    <button
      type="button"
      onClick={umschalten}
      aria-pressed={offen}
      title={t("askAiHinweis")}
      className={cn(
        "ki-fragen-knopf inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition-colors",
        offen
          ? "border-primary/40 bg-primary/10 text-primary"
          : "border-border bg-card text-foreground hover:bg-muted",
        offen && modus === "agent" && "ki-fragen-knopf--agent",
      )}
    >
      <Himbeere groesse={17} />
      <span>{t("askAi")}</span>
    </button>
  );
}

// Umschalter fuer die Breite der Seitenleiste. Er steht hier und nicht in der
// Leiste selbst, weil er so an derselben Stelle bleibt, ob die Leiste nun
// schmal oder breit ist - in der Leiste waere er einmal neben dem Logo und
// einmal darunter gewandert. Erst ab md, darunter gibt es keine feste Spalte,
// sondern die Schublade.
function MenueUmschalter() {
  const nav = useTranslations("nav");
  const schmal = useSyncExternalStore(
    schmalAbonnieren,
    istSchmal,
    schmalServer,
  );
  const beschriftung = nav(schmal ? "expandMenu" : "collapseMenu");

  return (
    <button
      type="button"
      onClick={() => schmalSetzen(!schmal)}
      aria-label={beschriftung}
      aria-pressed={schmal}
      title={beschriftung}
      className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted md:inline-flex"
    >
      {schmal ? (
        <PanelLeftOpen className="h-4 w-4" />
      ) : (
        <PanelLeftClose className="h-4 w-4" />
      )}
    </button>
  );
}

export function DashboardTopbar() {
  const t = useTranslations("dashboard");
  // Anforderung 2.5: der Sync-Indikator ist nur fuer echte, angemeldete
  // Brigade-Sitzungen relevant - im Demo-Modus gibt es keine echte
  // Supabase-Session, die eine Warteschlange fuellen koennte, und andere
  // Rollen erfassen keine Felddaten.
  const { echteRolle, demoModus } = usePersona();
  const zeigeSync = !demoModus && echteRolle === "brigade";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 pl-16 backdrop-blur-xl md:px-6 md:pl-6 print:hidden">
      <MenueUmschalter />
      <div className="hidden min-w-0 flex-1 items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground sm:flex">
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">{t("searchPlaceholder")}</span>
      </div>
      <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
        <KiFragenKnopf />
        <PersonaSwitcher className="hidden lg:inline-flex" />
        <LocaleSwitcher compact />
        <ThemeToggle />
        {zeigeSync ? <SyncStatus /> : null}
        <button
          type="button"
          aria-label={t("notifications")}
          className="relative inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-primary" />
        </button>
      </div>
    </header>
  );
}
