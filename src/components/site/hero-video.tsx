"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";
import { medienErlaubt, useBrowserBedingung } from "@/lib/bewegung";
import { werbefilm } from "@/lib/site-medien";
import { cn } from "@/lib/utils";

// Der Werbefilm als Bild des Heros. Bis zum 23.09.2026 lief hier eine stumme
// Endlosschleife aus dem Rundgangsmaterial der Plantage; jetzt laeuft der
// Film selbst - dieselbe Flaeche, aber ein Stueck mit Dramaturgie statt einer
// Bildtapete.
//
// Vier Dinge, die daran haengen:
//
// 1. Stumm beim Start, und das ist keine Wahl: kein Browser laesst eine Seite
//    von sich aus Ton machen. Der Ton kommt ueber den Knopf, also auf
//    Zuruf. Pause liegt daneben - ein Film, der sich nicht anhalten laesst,
//    ist auf einer Startseite eine Zumutung.
// 2. Weich eingeblendet. Das Standbild steht sofort (es ist das LCP-Bild),
//    der Film legt sich darueber, sobald wirklich Bilder kommen - nicht beim
//    ersten Byte. Ein harter Schnitt vom Standbild auf den ersten Frame
//    sieht nach Fehler aus, eine Sekunde Ueberblendung nach Absicht.
// 3. In Schleife. Der Film beginnt und endet mit derselben Luftaufnahme, der
//    Schnitt an der Nahtstelle faellt deshalb kaum auf.
// 4. medienErlaubt() gilt weiter: bei reduzierter Bewegung oder im Sparnetz
//    faengt nichts von allein an. Anders als frueher bleibt es dann nicht
//    beim Standbild - der Abspielknopf steht da, und wer will, startet
//    selbst. "Nichts bewegt sich ungefragt" heisst nicht "kein Video".
//
// Die Steuerung ist bewusst ein Geschwister des Videos und kein Kind: das
// Video liegt auf -z-10 hinter der Schrift, ein Knopf darin waere nicht
// anzuklicken. Deshalb gibt die Komponente ein Fragment zurueck, dessen
// zweiter Teil ueber dem Inhalt liegt.
export function HeroVideo({ className }: { className?: string }) {
  const t = useTranslations("werbefilm");
  const vonSelbst = useBrowserBedingung(medienErlaubt);
  const video = useRef<HTMLVideoElement>(null);
  const [laeuft, setLaeuft] = useState(false);
  const [stumm, setStumm] = useState(true);
  // Erst wenn Bilder kommen, nicht schon wenn Daten kommen.
  const [eingeblendet, setEingeblendet] = useState(false);

  // React schreibt "muted" beim serverseitigen Rendern nicht ins HTML. Damit
  // der Zustand am Element auch wirklich steht - und der Browser den Start
  // nicht als Tonwiedergabe wertet -, wird er hier direkt gesetzt.
  useEffect(() => {
    const element = video.current;
    if (element) element.muted = stumm;
  }, [stumm]);

  function abspielenUmschalten() {
    const element = video.current;
    if (!element) return;
    if (element.paused) element.play().catch(() => {});
    else element.pause();
  }

  const knopf =
    "inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/25 bg-[#04161c]/55 text-white backdrop-blur-xl transition hover:bg-[#04161c]/75";

  return (
    <>
      <div className={cn("overflow-hidden", className)}>
        <Image
          src={werbefilm.standbild}
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <video
          ref={video}
          src={werbefilm.quelle}
          poster={werbefilm.standbild}
          autoPlay={vonSelbst}
          preload={vonSelbst ? "auto" : "none"}
          muted={stumm}
          loop
          playsInline
          lang={werbefilm.tonsprache}
          onPlaying={() => {
            setLaeuft(true);
            setEingeblendet(true);
          }}
          onPause={() => setLaeuft(false)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-out",
            eingeblendet ? "opacity-100" : "opacity-0",
          )}
        />
      </div>

      {/* Ueber dem Inhalt, damit die Knoepfe erreichbar sind - und oben
          rechts, nicht unten: unten rechts stehen bereits der Tonschalter der
          Seite und das Maskottchen mit seiner Sprechblase. Oben unter der
          Kopfzeile ist die Flaeche frei, und die Schrift des Heros steht
          links. */}
      <div className="absolute right-4 top-4 z-20 flex gap-2 print:hidden">
        <button
          type="button"
          onClick={abspielenUmschalten}
          aria-label={laeuft ? t("pausieren") : t("fortsetzen")}
          title={laeuft ? t("pausieren") : t("fortsetzen")}
          className={knopf}
        >
          {laeuft ? (
            <Pause className="h-4 w-4" />
          ) : (
            <Play className="h-4 w-4 translate-x-px" />
          )}
        </button>
        <button
          type="button"
          onClick={() => setStumm((vorher) => !vorher)}
          aria-pressed={!stumm}
          aria-label={stumm ? t("tonAn") : t("tonAus")}
          title={stumm ? t("tonAn") : t("tonAus")}
          className={cn(knopf, stumm ? "" : "ring-2 ring-[#3fd0e6]")}
        >
          {stumm ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>
      </div>
    </>
  );
}
