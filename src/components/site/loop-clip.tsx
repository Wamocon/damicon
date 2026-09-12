"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { medienErlaubt, useBrowserBedingung } from "@/lib/bewegung";
import type { LoopClipQuelle } from "@/lib/site-medien";

// Kurzer, stummer Loop als Bildflaeche. Er laeuft nur, solange er zu sehen
// ist; ausserhalb des Sichtbereichs haelt er an, damit mehrere Clips auf einer
// Seite nicht gleichzeitig dekodieren. Bei reduzierter Bewegung oder Sparnetz
// bleibt das Standbild stehen - dieselbe Regel wie im Hero.
//
// `fokus` vergroessert auf einen Bildausschnitt. So traegt eine Datei zwei
// Einstellungen: im Hero die ganze Szene, hier die einzelne Frucht.
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

  return (
    <div aria-hidden className={`overflow-hidden ${className ?? ""}`}>
      <Image
        src={clip.poster}
        alt=""
        fill
        sizes={sizes}
        className="object-cover"
        style={ausschnitt}
      />
      {erlaubt ? (
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
          <source src={clip.quelle} type="video/mp4" />
        </video>
      ) : null}
    </div>
  );
}
