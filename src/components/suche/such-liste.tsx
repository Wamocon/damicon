"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Himbeere } from "@/components/ki/himbeere";
import { BlattZeilenInhalt, blattZeilenKlassen } from "@/components/ui/blatt-zeile";
import type { SeitenZiel } from "@/lib/suche/seiten-ziele";
import { cn } from "@/lib/utils";

// Die Trefferliste des Suchfensters (such-dialog.tsx): Gruppen mit
// Ueberschrift, darin die Optionen. Die Optionen sind ueber alle Gruppen
// laufend nummeriert - die Pfeiltasten gehen durch die ganze Liste, nicht nur
// durch eine Gruppe.

export type SuchOption =
  | { art: "ziel"; ziel: SeitenZiel; auszug?: string }
  | { art: "ki"; begriff: string };

export interface SuchGruppe {
  titel: string | null;
  optionen: SuchOption[];
}

/** Die id einer Option, fuer aria-activedescendant und das Nachscrollen. */
export function optionId(listeId: string, index: number): string {
  return `${listeId}-${index}`;
}

/**
 * Eine Option. Nicht fokussierbar: der Fokus bleibt im Suchfeld, markiert
 * wird ueber aria-activedescendant. Sieht aus wie eine Zeile im Menue-Blatt
 * (BlattZeilenInhalt), damit beide nicht auseinanderlaufen.
 */
function SuchZeile({
  option,
  id,
  aktiv,
  onAktiv,
  onWaehle,
}: {
  option: SuchOption;
  id: string;
  aktiv: boolean;
  onAktiv: () => void;
  onWaehle: () => void;
}) {
  const t = useTranslations("suche");

  return (
    <div
      id={id}
      role="option"
      aria-selected={aktiv}
      // Der Fokus bleibt im Feld, auch wenn man mit der Maus waehlt.
      onMouseDown={(event) => event.preventDefault()}
      onPointerMove={() => {
        if (!aktiv) onAktiv();
      }}
      onClick={onWaehle}
      className={cn(
        blattZeilenKlassen(false),
        "cursor-pointer lg:h-12",
        // Nicht nur Farbe: der Rahmen traegt die Markierung auch fuer alle,
        // die den Farbton nicht unterscheiden.
        aktiv && "border-primary/40 bg-muted ring-2 ring-ring",
      )}
    >
      {option.art === "ziel" ? (
        <BlattZeilenInhalt
          symbol={<Icon name={option.ziel.symbol} className="h-4 w-4" />}
          text={option.ziel.titel}
          // Unter "Erwaehnt in" steht statt des Bereichs die Stelle im Text,
          // sonst sieht man nicht, warum die Seite dort steht.
          untertitel={option.auszug ?? option.ziel.untertitel}
        />
      ) : (
        <BlattZeilenInhalt
          symbol={<Himbeere groesse={18} />}
          text={t("kiFragen", { begriff: option.begriff })}
        />
      )}
    </div>
  );
}

export function SuchListe({
  listeId,
  gruppen,
  aktivIndex,
  onAktiv,
  onWaehle,
}: {
  listeId: string;
  gruppen: readonly SuchGruppe[];
  aktivIndex: number;
  onAktiv: (index: number) => void;
  onWaehle: (option: SuchOption) => void;
}) {
  const t = useTranslations("suche");
  const erste = gruppen.map((_, nr) =>
    gruppen.slice(0, nr).reduce((summe, gruppe) => summe + gruppe.optionen.length, 0),
  );
  const leer = gruppen.every((gruppe) => gruppe.optionen.length === 0);

  return (
    <div
      role="listbox"
      id={listeId}
      aria-label={t("ergebnisse")}
      hidden={leer}
      className="space-y-2"
    >
      {gruppen.map((gruppe, nr) => {
        const zeilen = gruppe.optionen.map((option, i) => {
          const index = erste[nr]! + i;
          return (
            <SuchZeile
              key={option.art === "ziel" ? option.ziel.schluessel : "ki"}
              option={option}
              id={optionId(listeId, index)}
              aktiv={index === aktivIndex}
              onAktiv={() => onAktiv(index)}
              onWaehle={() => onWaehle(option)}
            />
          );
        });
        if (!gruppe.titel) {
          return (
            <div key={nr} className="space-y-1">
              {zeilen}
            </div>
          );
        }
        const kopfId = `${listeId}-g${nr}`;
        return (
          <div key={nr} role="group" aria-labelledby={kopfId} className="space-y-1">
            <div
              id={kopfId}
              role="presentation"
              className="px-3 pb-1 pt-2 schrift-label font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {gruppe.titel}
            </div>
            {zeilen}
          </div>
        );
      })}
    </div>
  );
}
