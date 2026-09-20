"use client";

import { useTransition } from "react";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Globe } from "lucide-react";
import { usePathname, useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { mitUeberblendung } from "@/lib/seitenwechsel";
import { cn } from "@/lib/utils";

const labels: Record<Locale, string> = {
  de: "DE - Deutsch",
  en: "EN - English",
  kk: "KK - Қазақша",
  ru: "RU - Русский",
};

export function LocaleSwitcher({
  className,
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams();
  const active = useLocale() as Locale;
  const t = useTranslations("common");
  const [isPending, startTransition] = useTransition();

  function onSelect(next: Locale) {
    mitUeberblendung(() => {
      startTransition(() => {
        // @ts-expect-error - params-Shape haengt von der Route ab
        router.replace({ pathname, params }, { locale: next });
      });
    });
  }

  return (
    <div className={cn("relative flex shrink-0 items-center", className)}>
      <Globe className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-muted-foreground" />
      <select
        value={active}
        onChange={(event) => onSelect(event.target.value as Locale)}
        disabled={isPending}
        aria-label={t("localeSwitcherLabel")}
        className={cn(
          "h-9 appearance-none rounded-lg border border-border bg-card pl-7 text-xs font-semibold text-foreground shadow-sm transition-colors hover:border-primary focus:border-primary focus:outline-none disabled:cursor-wait disabled:opacity-70",
          compact ? "w-[64px] pr-5 text-[11px]" : "w-[140px] pr-7",
        )}
      >
        {routing.locales.map((locale) => (
          <option key={locale} value={locale}>
            {compact ? locale.toUpperCase() : labels[locale]}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-muted-foreground" />
    </div>
  );
}
