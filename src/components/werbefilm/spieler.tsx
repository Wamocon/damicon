"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { werbefilm } from "@/lib/site-medien";
import { cn } from "@/lib/utils";

// Der Film im Portal, angesehen im Sheet. Auf der oeffentlichen Seite laeuft
// er als Bild des Heros, dort mit eigener Steuerung - siehe
// components/site/hero-video.tsx.
//
// Hier gibt es keine Deckflaeche mit Abspielknopf: geoeffnet wird das Sheet
// durch einen Klick auf die Zeile in der Uebersicht, und dieser Klick ist
// bereits die Aufforderung. Ein zweiter Knopf waere die Rueckfrage auf eine
// Frage, die schon beantwortet ist. Derselbe Klick traegt auch den Ton - von
// selbst darf keine Seite Ton machen, nach einer Eingabe schon.
export function WerbefilmSpieler({ className }: { className?: string }) {
  const t = useTranslations("werbefilm");
  const video = useRef<HTMLVideoElement>(null);
  const [fehler, setFehler] = useState(false);

  // Abspielen ist ein Eingriff am Videoelement, kein Zustand von React -
  // deshalb steht hier nur der Aufruf und kein setState. Schlaegt er fehl
  // (iOS im Stromsparmodus lehnt auch nach einer Eingabe ab), stehen die
  // Bedienelemente des Browsers bereit und der Mensch drueckt selbst.
  useEffect(() => {
    video.current?.play().catch(() => {});
  }, []);

  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-2xl bg-[#04161c]",
        className,
      )}
    >
      <video
        ref={video}
        src={werbefilm.quelle}
        poster={werbefilm.standbild}
        preload="auto"
        playsInline
        controls
        lang={werbefilm.tonsprache}
        onError={() => setFehler(true)}
        className="h-full w-full object-cover"
      />

      {fehler ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-bold text-white">
          {t("fehler")}
        </p>
      ) : null}
    </div>
  );
}
