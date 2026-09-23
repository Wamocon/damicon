"use client";

import { useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronRight, Play, X } from "lucide-react";
import { Card } from "@/components/ui/kit";
import { Sheet } from "@/components/ui/sheet";
import { WerbefilmSpieler } from "@/components/werbefilm/spieler";
import {
  werbefilmHinweisAusblenden,
  werbefilmInitScript,
} from "@/components/werbefilm/zustand";
import { werbefilm } from "@/lib/site-medien";

// Der Werbefilm im Portal. Die Uebersicht ist die Arbeitsflaeche und kein
// Schaufenster, deshalb steht der Film hier nicht als Flaeche, sondern als
// eine Zeile: Standbild, Titel, Laufzeit, fertig. Das sind rund 68 px Hoehe
// gegenueber den 360 px, die ein eingebetteter Spieler in dieser Spalte
// braeuchte.
//
// Angesehen wird er im Sheet und nicht an Ort und Stelle. Der Grund ist
// nicht der Platz, sondern der Ton: ein Film mit Sprache mitten in einer
// Kennzahlenseite laeuft neben Zahlen, die gerade jemand liest. Im Sheet ist
// er das, was gerade dran ist - mit Fokusfalle, Esc und abgedunkelter Seite
// dahinter, alles schon im Sheet drin.
//
// Wer ihn weggeklickt hat, sieht ihn nicht wieder. Siehe zustand.ts.

const nieAbonnieren = () => () => {};

/**
 * Setzt die Klasse am <html> vor dem ersten Paint. Gleiches Muster wie
 * SidebarBreiteScript in dashboard/sidebar.tsx: nur im Server-Markup, im
 * Browser rendert die Komponente nichts.
 */
function WerbefilmInitScript() {
  const nurAufDemServer = useSyncExternalStore(
    nieAbonnieren,
    () => false,
    () => true,
  );
  if (!nurAufDemServer) return null;
  return <script dangerouslySetInnerHTML={{ __html: werbefilmInitScript }} />;
}

export function WerbefilmHinweis() {
  const t = useTranslations("werbefilm");
  const [offen, setOffen] = useState(false);
  const [weg, setWeg] = useState(false);

  if (weg) return null;

  return (
    <>
      <WerbefilmInitScript />

      {/* Die Klasse haengt an der CSS-Regel in globals.css - steht sie schon
          beim Laden fest, erscheint die Zeile gar nicht erst und schiebt
          nichts. */}
      <Card ton="box" className="werbefilm-hinweis flex items-center gap-2 p-2 sm:gap-3 sm:p-3">
        <button
          type="button"
          onClick={() => setOffen(true)}
          className="group flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-xl text-left"
        >
          <span className="relative shrink-0 overflow-hidden rounded-lg">
            <Image
              src={werbefilm.standbild}
              alt=""
              width={160}
              height={90}
              sizes="80px"
              className="h-11 w-20 object-cover"
            />
            <span
              aria-hidden
              className="absolute inset-0 flex items-center justify-center bg-[#04161c]/35 transition group-hover:bg-[#04161c]/15"
            >
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-white">
                <Play className="h-3 w-3 translate-x-px fill-[#04161c] text-[#04161c]" />
              </span>
            </span>
          </span>

          <span className="min-w-0">
            <span className="block truncate text-sm font-black text-card-foreground">
              {t("portalTitel")}
            </span>
            <span className="block truncate text-xs leading-5 text-muted-foreground">
              {t("portalText", { sekunden: werbefilm.sekunden })}
            </span>
          </span>

          <span className="ml-auto hidden shrink-0 items-center gap-1 pr-1 text-xs font-bold text-primary sm:inline-flex">
            {t("ansehen")}
            <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            werbefilmHinweisAusblenden();
            setWeg(true);
          }}
          aria-label={t("ausblenden")}
          title={t("ausblenden")}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </Card>

      <Sheet
        offen={offen}
        onSchliessen={() => setOffen(false)}
        titel={t("portalTitel")}
        position="mitte"
      >
        {/* autoStart: der Klick auf die Zeile war die Aufforderung, den Film
            zu sehen. Ein zweiter Knopf im Blatt waere eine Rueckfrage auf
            eine Frage, die schon beantwortet ist. */}
        <div className="p-3 sm:p-4">
          <WerbefilmSpieler autoStart />
        </div>
      </Sheet>
    </>
  );
}
