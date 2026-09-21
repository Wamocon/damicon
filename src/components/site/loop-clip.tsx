"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { medienErlaubt, useBrowserBedingung } from "@/lib/bewegung";
import type { LoopClipQuelle } from "@/lib/site-medien";
import { cn } from "@/lib/utils";

// Kurzer, stummer Loop als Bildflaeche. Er laeuft nur, solange er zu sehen
// ist; ausserhalb des Sichtbereichs haelt er an, damit mehrere Clips auf einer
// Seite nicht gleichzeitig dekodieren. Bei reduzierter Bewegung oder Sparnetz
// bleibt das Standbild stehen - dieselbe Regel wie im Hero.
//
// `fokus` vergroessert auf einen Bildausschnitt. So traegt eine Datei zwei
// Einstellungen: im Hero die ganze Szene, hier die einzelne Frucht.
//
// Steht in `clip.quelle` null, gibt es zu dieser Stelle noch kein Video,
// sondern nur eine Aufnahme. Damit die Flaeche dann nicht stillsteht,
// uebernimmt die Scroll-Fahrt aus globals.css (.kapitel-fahrt) die Bewegung:
// eine langsame Annaeherung, an den Scrollfortschritt gebunden statt an eine
// Laufzeit, ohne zweiten Videodekoder und ohne Datenverbrauch. Sie sitzt auf
// einem eigenen Wrapper, weil sie mit `transform` arbeitet - demselben
// Attribut, das den Bildausschnitt setzt. Bei reduzierter Bewegung steht sie
// still, das regelt die Media Query in globals.css.
//
// Wie HeroVideo ohne eigenes "relative": der Aufrufer positioniert.
export function LoopClip({
  clip,
  sizes,
  className,
}: {
  clip: LoopClipQuelle;
  sizes: string;
  className?: string;
}) {
  const erlaubt = useBrowserBedingung(medienErlaubt);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = video.current;
    if (!erlaubt || !element) return;
    const beobachter = new IntersectionObserver(
      ([eintrag]) => {
        if (eintrag?.isIntersecting) element.play().catch(() => {});
        else element.pause();
      },
      { threshold: 0.2 },
    );
    beobachter.observe(element);
    return () => beobachter.disconnect();
  }, [erlaubt]);

  const ausschnitt = {
    transform: `scale(${clip.fokus.zoom})`,
    transformOrigin: `${clip.fokus.x}% ${clip.fokus.y}%`,
  };

  const clipVorhanden = clip.quelle !== null;

  return (
    <div aria-hidden className={cn("overflow-hidden", className)}>
      <div className={clipVorhanden ? "absolute inset-0" : "kapitel-fahrt absolute inset-0"}>
        <Image
          src={clip.poster}
          alt=""
          fill
          sizes={sizes}
          className="object-cover"
          style={ausschnitt}
        />
      </div>
      {erlaubt && clipVorhanden ? (
        <video
          ref={video}
          className="absolute inset-0 h-full w-full object-cover"
          style={ausschnitt}
          muted
          loop
          playsInline
          preload="none"
          poster={clip.poster}
        >
          <source src={clip.quelle ?? undefined} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
