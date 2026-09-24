"use client";

import type { RefObject } from "react";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";
import { SuchErgebnisse } from "@/components/suche/such-liste";
import { useSuchSitzung } from "@/components/suche/such-sitzung";
import { Sheet, type SheetAnker } from "@/components/ui/sheet";

// Das Suchfenster an der Lupe: ein Blatt mit dem Eingabefeld im Kopf und den
// Treffern darunter, dort aufgehend, wo die Lupe sitzt - zwischen md und xl
// hinter dem Pfad, auf dem Handy neben der Glocke (dort oben ueber die volle
// Breite). Ab xl ist die Suche ein echtes Feld in der Kopfzeile
// (such-leiste.tsx); die Lupe und damit dieses Fenster gibt es dort nur, wenn
// das Feld zu schmal wird. Die Suche selbst steckt fuer beide in
// such-sitzung.ts.

export function SuchDialog({
  feldRef,
  zuletzt,
  nutzerId,
  anker,
  onSchliessen,
}: {
  feldRef: RefObject<HTMLInputElement | null>;
  zuletzt: readonly string[];
  nutzerId: string | null;
  /** Wo die Lupe sitzt; null auf dem Handy. */
  anker: SheetAnker | null;
  /** fokusZurueck: ohne Sprung geschlossen, der Ausloeser bekommt den Fokus wieder. */
  onSchliessen: (fokusZurueck: boolean) => void;
}) {
  const t = useTranslations("suche");
  const sitzung = useSuchSitzung({ zuletzt, nutzerId, onSchliessen });

  return (
    <Sheet
      offen
      onSchliessen={() => onSchliessen(true)}
      titel={t("titel")}
      position="oben"
      anker={anker}
      anfangsFokus={feldRef}
      schliessenLabel={t("schliessen")}
      kopf={
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={feldRef}
            role="combobox"
            aria-controls={sitzung.listeId}
            aria-expanded={sitzung.hatOptionen}
            aria-activedescendant={sitzung.aktiveOptionId}
            {...sitzung.feldProps}
            onKeyDown={sitzung.beiTaste}
            // text-base unter lg: Safari auf iOS zoomt bei kleinerer Schrift
            // beim Fokus hinein und bleibt vergroessert (DESIGN.md).
            className="h-11 min-w-0 flex-1 rounded-md bg-transparent text-base text-foreground placeholder:text-muted-foreground lg:h-9 lg:text-sm"
          />
        </div>
      }
    >
      <div className="p-2">
        <SuchErgebnisse sitzung={sitzung} />
      </div>
    </Sheet>
  );
}
