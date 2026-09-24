"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useSuche } from "@/components/suche/such-kontext";
import { cn } from "@/lib/utils";

// Der Ausloeser der globalen Suche in der Kopfzeile: ein Knopf mit Lupe, auf
// jeder Breite. Er oeffnet das Suchfenster (such-kontext.tsx) - getippt wird
// nie in der Kopfzeile selbst, erst im Fenster, das oben in der Mitte aufgeht.
// Ein Eingabefeld oder eine Leiste im Look eines Suchfelds ist hier bewusst
// nicht vorgesehen (Erwin, 24.09.2026).

const KUERZEL = "/ Control+K Meta+K";

/**
 * Ein Symbolknopf. Er steht zweimal in der Kopfzeile, sichtbar ist je nach
 * Breite genau einer (topbar.tsx gibt die Sichtbarkeit mit):
 *
 *   ab md      direkt hinter dem Pfad
 *   unter md   links neben der Glocke
 *
 * Er sieht aus wie die uebrigen Symbolknoepfe der Kopfzeile (36 px), faengt
 * unter lg aber 44 px: das Pseudoelement ragt ringsum 4 px ueber den Rand
 * (DESIGN.md, Touch-Ziele). Bei 8 px Abstand zum Nachbarn beruehren sich die
 * beiden Flaechen, ohne sich zu ueberlappen.
 */
export function TopbarSuchknopf({ className }: { className: string }) {
  const t = useTranslations("suche");
  const { offen, oeffne } = useSuche();

  return (
    <button
      type="button"
      data-suche="knopf"
      onClick={oeffne}
      aria-label={t("oeffnen")}
      aria-haspopup="dialog"
      aria-expanded={offen}
      aria-keyshortcuts={KUERZEL}
      title={t("oeffnen")}
      className={cn(
        "relative h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        "after:absolute after:-inset-1 lg:after:hidden",
        className,
      )}
    >
      <Search aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
