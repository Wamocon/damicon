"use client";

import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";

// Kein next-themes - der Prototyp haelt es schlank: eine Klasse `.dark` auf
// <html>, in localStorage gespiegelt. Der Anti-Flash-Setter <ThemeScript />
// (unten) rendert das Inline-Script nur im SSR-HTML; auf dem Client rendert er
// nie ein <script>-Element und loest damit auch beim Sprachwechsel (der das
// Locale-Layout neu rendert) keine React-Warnung aus.
const listeners = new Set<() => void>();

const neverSubscribe = () => () => {};

/**
 * Rendert das Anti-Flash-Theme-Script ausschliesslich serverseitig in das
 * initiale HTML - dort laeuft es synchron vor dem ersten Paint. Auf dem Client
 * gibt der Store immer `false` zurueck, also rendert React hier nie ein
 * <script>-Element (weder bei Hydration noch bei Re-Renders).
 */
export function ThemeScript() {
  const renderOnServerOnly = useSyncExternalStore(
    neverSubscribe,
    () => false,
    () => true,
  );
  if (!renderOnServerOnly) return null;
  return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function isDark() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("dark")
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const t = useTranslations("common");
  const dark = useSyncExternalStore(
    subscribe,
    isDark,
    () => false,
  );

  function toggle() {
    const next = !isDark();
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("damicon-theme", next ? "dark" : "light");
    } catch {
      // localStorage nicht verfuegbar - Auswahl gilt nur fuer diese Sitzung
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? t("themeLight") : t("themeDark")}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted",
        className,
      )}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}

export const themeInitScript = `(function(){try{var t=localStorage.getItem('damicon-theme');var m=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&m)){document.documentElement.classList.add('dark');}}catch(e){}})();`;
