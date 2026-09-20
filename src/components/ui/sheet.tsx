"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Flaeche, die von unten aufgeht. Gebaut fuer die untere Leiste auf dem Handy
// (untere-leiste.tsx): der ausloesende Knopf steht unten, also kommt der
// Inhalt von dort und nicht von der Seite - der Weg zwischen Knopf und Inhalt
// bleibt kurz, und der Daumen deckt beim Tippen nicht das ab, was er gerade
// geoeffnet hat.
//
// Bewusst kein <dialog>: das Element bringt zwar Fokusfalle und Esc mit, sein
// ::backdrop laesst sich aber nur schwer mit der uebrigen Tiefenstaffelung in
// Einklang bringen, und showModal() muss ueber einen Effekt nachgezogen
// werden, was bei jedem Rendern erneut zu pruefen waere. Die drei Dinge, die
// hier wirklich gebraucht werden - Esc, Klick daneben, Rollen im Baum - sind
// unten ausgeschrieben.

export function Sheet({
  offen,
  onSchliessen,
  titel,
  children,
}: {
  offen: boolean;
  onSchliessen: () => void;
  titel: string;
  children: ReactNode;
}) {
  const nav = useTranslations("nav");
  const titelId = useId();
  const flaecheRef = useRef<HTMLDivElement>(null);

  // Esc schliesst, und solange das Sheet offen ist, scrollt die Seite
  // darunter nicht mit.
  useEffect(() => {
    if (!offen) return;
    const beiTaste = (event: KeyboardEvent) => {
      if (event.key === "Escape") onSchliessen();
    };
    document.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [offen, onSchliessen]);

  // Der Fokus springt in die Flaeche, sobald sie aufgeht - sonst bliebe er
  // auf dem Knopf in der Leiste, und die erste Tabulatortaste liefe durch die
  // Seite dahinter statt durch das Menue davor.
  useEffect(() => {
    if (offen) flaecheRef.current?.focus();
  }, [offen]);

  if (!offen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end print:hidden">
      <button
        type="button"
        aria-label={nav("closeMenu")}
        onClick={onSchliessen}
        className="absolute inset-0 bg-black/40 backdrop-blur-[1px]"
      />
      <div
        ref={flaecheRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        tabIndex={-1}
        className={cn(
          "relative flex min-h-0 w-full flex-col rounded-t-2xl border-t border-border bg-card shadow-2xl outline-none",
          // Bis unter den Home-Indicator, damit die Flaeche am Rand nicht
          // abrupt endet; den Abstand traegt der Inhalt weiter unten.
          "max-h-[85svh]",
          "motion-safe:animate-[sheet-auf_200ms_ease-out]",
        )}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border px-4">
          <h2
            id={titelId}
            className="min-w-0 truncate text-sm font-black text-card-foreground"
          >
            {titel}
          </h2>
          <button
            type="button"
            onClick={onSchliessen}
            aria-label={nav("closeMenu")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
          {children}
        </div>
      </div>
    </div>
  );
}
