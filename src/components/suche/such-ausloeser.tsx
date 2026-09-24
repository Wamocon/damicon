"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useSuche } from "@/components/suche/such-kontext";
import { cn } from "@/lib/utils";

// Die Lupe der globalen Suche. Sie oeffnet das Suchfenster (such-dialog.tsx)
// an ihrer Stelle. Ab xl ist die Suche stattdessen ein echtes Feld in der
// Kopfzeile (such-leiste.tsx), die Lupe steht dort nur noch, wenn das Feld
// zu schmal wird.

const suchStil =
  "items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

/** Die Tastenkuerzel der Suche fuer aria-keyshortcuts, an Lupe und Feld. */
export const SUCH_KUERZEL = "/ Control+K Meta+K";

/**
 * Ein Symbolknopf. Er steht mehrfach im Dokument, sichtbar ist je nach Breite
 * hoechstens einer (die Sichtbarkeit gibt der Aufrufer mit):
 *
 *   md bis xl  direkt hinter dem Pfad - dort, wo ab xl das Feld beginnt und
 *              wo das Suchfenster aufgeht (such-kontext.tsx, Anker)
 *   unter md   links neben der Glocke; das Fenster nimmt dort oben die volle
 *              Breite ein und liegt damit ebenfalls am Knopf
 *   ab xl      nur, wenn das Feld unter 10rem schrumpft (such-leiste.tsx)
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
      aria-keyshortcuts={SUCH_KUERZEL}
      title={t("oeffnen")}
      className={cn(
        "relative h-9 w-9 shrink-0 justify-center",
        "after:absolute after:-inset-1 lg:after:hidden",
        suchStil,
        className,
      )}
    >
      <Search aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}
