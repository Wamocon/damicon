"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useSuche } from "@/components/suche/such-kontext";

// Der Ausloeser der globalen Suche in der Kopfzeile: ein Knopf mit Lupe, auf
// jeder Breite links neben der Glocke. Er oeffnet das Suchfenster
// (such-kontext.tsx), getippt wird erst dort. Warum es in der Kopfzeile kein
// Eingabefeld gibt, steht in DESIGN.md (globale Suche).

const KUERZEL = "/ Control+K Meta+K";

/**
 * Ein Symbolknopf wie die uebrigen der Kopfzeile (36 px), in derselben Farbe.
 * Unter lg faengt er aber 44 px: das Pseudoelement ragt ringsum 4 px ueber
 * den Rand (DESIGN.md, Touch-Ziele). Zur Glocke bleiben dabei 4 px Luft.
 */
export function TopbarSuchknopf() {
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
      className="relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted after:absolute after:-inset-1 lg:after:hidden"
    >
      <Search aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
