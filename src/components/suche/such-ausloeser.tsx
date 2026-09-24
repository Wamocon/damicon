"use client";

import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { useSuche } from "@/components/suche/such-kontext";
import { cn } from "@/lib/utils";

// Die beiden Ausloeser der globalen Suche in der Kopfzeile. Beide oeffnen
// dasselbe Suchfenster (such-kontext.tsx) - getippt wird nie in der
// Kopfzeile selbst, erst im Fenster, das oben in der Mitte aufgeht.

const suchStil =
  "items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground";

const KUERZEL = "/ Control+K Meta+K";

/**
 * Ab xl ein Knopf im Look eines Suchfelds: er fuellt die Luecke zwischen Pfad
 * und Werkzeugen und zeigt am Schreibtisch, dass es eine Suche gibt und wie
 * man sie mit der Tastatur erreicht. Darunter uebernimmt TopbarSuchknopf.
 */
export function TopbarSuche() {
  const t = useTranslations("suche");
  const { offen, oeffne } = useSuche();

  return (
    <button
      type="button"
      data-suche="feld"
      onClick={oeffne}
      // Der Name haengt nicht am sichtbaren Text: der faellt weg, wenn der
      // Knopf schmal wird.
      aria-label={t("platzhalter")}
      aria-haspopup="dialog"
      aria-expanded={offen}
      aria-keyshortcuts={KUERZEL}
      title={t("kuerzel")}
      // Mit angedocktem KI-Panel bleibt der Kopfzeile ab xl wenig Breite, und
      // der Knopf schrumpft. Er misst sich deshalb selbst (@container): unter
      // 160 px faellt das Kuerzel weg, unter 80 px auch der Text, und die
      // Lupe steht mittig - statt einer leeren Pille oder eines Inhalts, der
      // ueber den Pfad daneben laeuft. Die Breite haengt wegen @container
      // nicht mehr am Inhalt, deshalb eine Untergrenze: 26 px wie die fruehere
      // Attrappe. Breiter waere schoener, aber die Kopfzeile laeuft mit
      // angedocktem Panel bei 1280 px ohnehin schon ueber, und jeder Pixel
      // mehr schoebe die Glocke weiter unter das Panel.
      className={cn(
        "@container hidden h-9 min-w-6.5 flex-1 overflow-hidden text-sm xl:flex",
        suchStil,
      )}
    >
      <span className="flex w-full min-w-0 items-center gap-2 px-3 @max-[5rem]:justify-center @max-[5rem]:px-0">
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-left @max-[5rem]:hidden">
          {t("platzhalter")}
        </span>
        <kbd
          aria-hidden="true"
          className="shrink-0 rounded border border-border bg-muted px-1.5 font-mono text-xs leading-5 @max-[10rem]:hidden"
        >
          /
        </kbd>
      </span>
    </button>
  );
}

/**
 * Unter xl ein Symbolknopf. Er steht zweimal in der Kopfzeile, sichtbar ist
 * je nach Breite genau einer (topbar.tsx gibt die Sichtbarkeit mit):
 *
 *   md bis xl  direkt hinter dem Pfad - dort, wo ab xl das Feld beginnt
 *   unter md   links neben der Glocke; das Fenster nimmt dort oben die volle
 *              Breite ein
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
