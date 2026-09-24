"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/components/icon";
import { Himbeere } from "@/components/ki/himbeere";
import { BlattZeilenInhalt, blattZeilenKlassen } from "@/components/ui/blatt-zeile";
import type { GruppenArt, SuchGruppe, SuchOption } from "@/lib/suche/gruppen";
import { cn } from "@/lib/utils";

// Die Trefferliste des Suchfensters (such-dialog.tsx): Gruppen mit
// Ueberschrift, darin die Optionen. Welche Gruppen es gibt, entscheidet
// lib/suche/gruppen.ts. Die Optionen sind ueber alle Gruppen laufend
// nummeriert - die Pfeiltasten gehen durch die ganze Liste, nicht nur durch
// eine Gruppe.

// Die Ueberschrift je Gruppe. Die Frage an die KI steht ohne: sie ist eine
// einzelne Zeile unter "keine Treffer" und erklaert sich selbst.
const UEBERSCHRIFT = {
  treffer: "gruppeTreffer",
  erwaehnt: "gruppeErwaehnt",
  zuletzt: "gruppeZuletzt",
  ki: null,
} as const satisfies Record<GruppenArt, string | null>;

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
        // Ab lg dichter als die 56 px der Blaetter (--blatt-zeile-h): dort
        // waehlt die Maus, nicht der Finger, und es passen mehr Treffer ins
        // Fenster. Die Menue-Schiene rechnet nicht mit dieser Hoehe.
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
  let naechsterIndex = 0;

  return (
    <div
      role="listbox"
      id={listeId}
      aria-label={t("ergebnisse")}
      hidden={gruppen.length === 0}
      className="space-y-2"
    >
      {gruppen.map((gruppe) => {
        const zeilen = gruppe.optionen.map((option) => {
          const index = naechsterIndex++;
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
        const ueberschrift = UEBERSCHRIFT[gruppe.art];
        if (!ueberschrift) {
          return (
            <div key={gruppe.art} className="space-y-1">
              {zeilen}
            </div>
          );
        }
        const kopfId = `${listeId}-${gruppe.art}`;
        return (
          <div key={gruppe.art} role="group" aria-labelledby={kopfId} className="space-y-1">
            <div
              id={kopfId}
              role="presentation"
              className="px-3 pb-1 pt-2 schrift-label font-semibold uppercase tracking-wide text-muted-foreground"
            >
              {t(ueberschrift)}
            </div>
            {zeilen}
          </div>
        );
      })}
    </div>
  );
}
