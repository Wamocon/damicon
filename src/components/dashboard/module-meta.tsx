"use client";

import { useTranslations } from "next-intl";
import { Clock } from "lucide-react";
import type { ModuleDef } from "@/lib/modules";
import { StatusPill } from "@/components/ui/kit";
import { cn } from "@/lib/utils";

/**
 * Die einzige Statusaussage, die ein Modul im Portal noch traegt: dass es
 * noch nicht verfuegbar ist. Fuer den Betrieb zaehlt allein, ob ein
 * Menuepunkt schon etwas tut.
 *
 * Vorher standen hier drei Pillen. "Datenbank angebunden" stand auf 24 von
 * 26 Karten und war damit Dekoration, und die Einstufung aus der
 * Migrationsanalyse ("Uebernehmen / Anpassen / Neu bauen") sass auf der
 * Bereichsseite direkt gegenueber dem Verweis "Oeffnen" - zwei Verben
 * nebeneinander, eines davon ausfuehrbar, und die ganze Karte ein Link.
 *
 * Der Text kommt weiter aus dem Namensraum "reifegrad": denselben Begriff
 * zeigt die oeffentliche Seite in ihrer Legende (site/modul-reiter.tsx),
 * und zwei Woerter fuer denselben Zustand waeren eines zu viel.
 */
export function ModulStatusPille() {
  const t = useTranslations("reifegrad");
  return (
    <StatusPill tone="warning" className="gap-1">
      <Clock className="h-3 w-3" />
      {t("in-entwicklung")}
    </StatusPill>
  );
}

// Platzhalterseite fuer Module, die als Menuepunkt sichtbar sind, aber noch
// keine eigene Ansicht haben (Analyse Kapitel 9).
//
// Vorher ein Projektsteckbrief mit "Geplanter Umfang", "Einstufung" und
// "Meilenstein". Davon wiederholte eines nur die Pille, und "Meilenstein"
// trug auf beiden Seiten denselben fest verdrahteten Text, der an keinem
// Modul hing. Geblieben ist ein Satz: was das Modul koennen wird.
export function ModulePlaceholder({
  module,
  className,
}: {
  module: ModuleDef;
  className?: string;
}) {
  const t = useTranslations("modules");
  const meta = useTranslations("moduleMeta");

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-warning/40 bg-warning/[0.06] p-6",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-warning" />
        <p className="text-xs font-black uppercase tracking-wide text-warning">
          {meta("inDevelopmentTitle")}
        </p>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-foreground">
        {t(`${module.key}.summary`)}
      </p>
    </div>
  );
}
