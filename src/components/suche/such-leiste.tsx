"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { SUCH_KUERZEL, TopbarSuchknopf } from "@/components/suche/such-ausloeser";
import { useSuche } from "@/components/suche/such-kontext";
import { SuchErgebnisse } from "@/components/suche/such-liste";
import { useSuchSitzung } from "@/components/suche/such-sitzung";
import { browserAblage, liesZuletzt } from "@/lib/suche/zuletzt";

/**
 * Ab xl ist die Suche ein echtes Feld in der Kopfzeile: man tippt direkt
 * hinein, und die Treffer haengen als Liste darunter - ohne Blende, ohne
 * zweites Fenster an anderer Stelle. Das Feld fuellt die Luecke zwischen Pfad
 * und Werkzeugen; die Liste ist so breit wie das Feld, mindestens 30rem.
 *
 * Wird die Kopfzeile sehr schmal, etwa mit angedocktem KI-Panel, misst sich
 * das Feld selbst (@container): unter 10rem weicht es der Lupe, die das
 * Suchfenster an ihrer Stelle oeffnet (such-dialog.tsx). Ein Feld von 26 px
 * liesse sich nicht mehr bedienen.
 *
 * Tastatur nach dem WAI-ARIA-Muster fuer eine Combobox: Pfeile markieren,
 * Enter oeffnet, Esc schliesst die Liste und leert, wenn sie schon zu ist, das
 * Feld. "/" und Strg+K springen von ueberall hierher (such-kontext.tsx).
 */
export function TopbarSuche() {
  const t = useTranslations("suche");
  const { nutzerId } = useSuche();
  const feldRef = useRef<HTMLInputElement>(null);
  const [offen, setOffen] = useState(false);
  const [zuletzt, setZuletzt] = useState<string[]>([]);

  const sitzung = useSuchSitzung({
    zuletzt,
    nutzerId,
    onSchliessen: (fokusZurueck) => {
      setOffen(false);
      // Nach einem Sprung auf eine andere Seite steht der Fokus nicht mehr in
      // einem Feld, dessen Liste gerade verschwunden ist.
      if (!fokusZurueck) feldRef.current?.blur();
    },
  });

  // Die Zuletzt-Liste beim Aufklappen lesen und nicht beim Rendern: der
  // Server kennt keinen localStorage.
  function klappeAuf() {
    if (offen) return;
    setZuletzt(liesZuletzt(browserAblage(), nutzerId));
    setOffen(true);
  }

  function beiTaste(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      if (offen) setOffen(false);
      else sitzung.zuruecksetzen();
      return;
    }
    if (event.key !== "Tab") klappeAuf();
    sitzung.beiTaste(event);
  }

  // Ein Klick auf den Rahmen neben dem Text setzt den Fokus ins Feld, wie bei
  // jedem Suchfeld - der Rahmen ist breiter als die Lupe daneben vermuten laesst.
  function beiMausAufRahmen(event: MouseEvent<HTMLDivElement>) {
    if (event.target === feldRef.current) return;
    event.preventDefault();
    feldRef.current?.focus();
  }

  return (
    <div className="@container relative hidden h-9 min-w-6.5 flex-1 xl:flex">
      <div
        onMouseDown={beiMausAufRahmen}
        className="flex w-full min-w-0 cursor-text items-center gap-2 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/30 focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-ring @max-[10rem]:hidden"
      >
        <Search aria-hidden="true" className="h-4 w-4 shrink-0" />
        <input
          ref={feldRef}
          data-suche="feld"
          role="combobox"
          aria-controls={sitzung.listeId}
          aria-expanded={offen && sitzung.hatOptionen}
          aria-activedescendant={offen ? sitzung.aktiveOptionId : undefined}
          {...sitzung.feldProps}
          aria-keyshortcuts={SUCH_KUERZEL}
          title={t("kuerzel")}
          onChange={(event) => {
            sitzung.feldProps.onChange(event);
            klappeAuf();
          }}
          onFocus={klappeAuf}
          // Klicks in die Liste nehmen dem Feld den Fokus nicht (onMouseDown
          // unten), ein Fokuswechsel anderswohin klappt sie zu.
          onBlur={() => setOffen(false)}
          onKeyDown={beiTaste}
          // Der Fokusring sitzt am Rahmen (focus-within), nicht am Text darin.
          className="h-full min-w-0 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
        />
        {sitzung.eingabe ? null : (
          <kbd
            aria-hidden="true"
            className="shrink-0 rounded border border-border bg-muted px-1.5 font-mono text-xs leading-5 @max-[14rem]:hidden"
          >
            /
          </kbd>
        )}
      </div>
      <TopbarSuchknopf className="hidden w-full @max-[10rem]:inline-flex" />
      <div
        data-suche="liste"
        hidden={!offen}
        onMouseDown={(event) => event.preventDefault()}
        className="absolute left-0 top-full z-10 mt-2 max-h-[min(36rem,70svh)] w-full min-w-120 overflow-y-auto overscroll-contain rounded-2xl border border-border bg-schwebend p-2 shadow-2xl motion-safe:animate-[sheet-auf-oben_180ms_ease-out]"
      >
        <SuchErgebnisse sitzung={sitzung} />
      </div>
    </div>
  );
}
