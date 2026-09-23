"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Play } from "lucide-react";
import { werbefilm } from "@/lib/site-medien";
import { cn } from "@/lib/utils";

// Der Spieler fuer den Werbefilm - dieselbe Flaeche auf der oeffentlichen
// Seite und im Portal, damit sich der Film an beiden Stellen gleich verhaelt.
//
// Bewusst anders als HeroVideo und LoopClip, obwohl alle drei ein <video>
// zeigen:
//
// 1. Keine Pruefung ueber medienErlaubt(). Die Regel dort gilt fuer Material,
//    das von sich aus losgeht; wer hier auf den Knopf drueckt, hat den Film
//    angefordert. "prefers-reduced-motion" heisst nicht "kein Video", sondern
//    "nichts bewegt sich ungefragt" - einen angeforderten Film zu verweigern
//    waere die falsche Antwort auf diese Einstellung.
// 2. preload="none". Die Datei ist rund 18 MB gross. Bis zum Klick geht nur
//    das Standbild ueber die Leitung (64 KB), gleiche Ueberlegung wie beim
//    Plantagen-Scan, der seine Groesse ebenfalls am Knopf traegt.
// 3. Mit Ton. Der Film ist vertont, stumm liefe er ins Leere. Erlaubt ist das
//    nur, weil play() an einem Klick haengt.
//
// Die eigene Deckflaeche liegt nur so lange ueber dem Bild, bis der Film
// laeuft. Das ist kein Schoenheitsgrund: der Film traegt seine Einblendungen
// fest im Bild, unten mittig - eine bleibende Auflage waere genau dort im Weg.
export function WerbefilmSpieler({
  autoStart = false,
  className,
}: {
  /**
   * Der Klick, der den Spieler ueberhaupt geoeffnet hat, ist schon die
   * Zustimmung - im Portal faehrt der Film deshalb sofort los, statt eine
   * zweite Aufforderung zu zeigen.
   */
  autoStart?: boolean;
  className?: string;
}) {
  const t = useTranslations("werbefilm");
  const locale = useLocale();
  const video = useRef<HTMLVideoElement>(null);
  // Der Anfangswert kommt aus autoStart, nicht aus einem Effekt: im Sheet
  // soll gar nicht erst die Deckflaeche aufblitzen, die im selben Augenblick
  // wieder verschwindet.
  const [laeuft, setLaeuft] = useState(autoStart);
  const [fehler, setFehler] = useState(false);

  const starten = useCallback(() => {
    const element = video.current;
    if (!element) return;
    setLaeuft(true);
    // Schlaegt der Start fehl - iOS im Stromsparmodus lehnt auch nach einem
    // Klick ab -, stehen die Bedienelemente des Browsers bereits da und der
    // Mensch drueckt selbst. Deshalb hier kein Zurueckdrehen auf die
    // Deckflaeche: die haette dann denselben Knopf noch einmal.
    element.play().catch(() => {});
  }, []);

  // Abspielen ist ein Eingriff am Videoelement, kein Zustand von React -
  // deshalb steht hier nur der Aufruf und kein setState.
  useEffect(() => {
    if (!autoStart) return;
    video.current?.play().catch(() => {});
  }, [autoStart]);

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
        preload="none"
        playsInline
        controls={laeuft}
        lang={werbefilm.tonsprache}
        onPlay={() => setLaeuft(true)}
        onError={() => setFehler(true)}
        className="h-full w-full object-cover"
      >
        {werbefilm.untertitel.map((spur) => (
          <track
            key={spur.sprache}
            kind="subtitles"
            srcLang={spur.sprache}
            src={spur.quelle}
            default={spur.sprache === locale}
          />
        ))}
      </video>

      {fehler ? (
        <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm font-bold text-white">
          {t("fehler")}
        </p>
      ) : null}

      {/* Der Fokus wird in der Abspielscheibe gezeichnet, nicht am Knopf: ein
          Umriss am Knopf liegt durch outline-offset ausserhalb des Rahmens,
          wird dort vom overflow-hidden des Elternelements abgeschnitten und
          stuende ausserdem auf hellem Seitengrund. */}
      {!laeuft && !fehler ? (
        <button
          type="button"
          onClick={starten}
          aria-label={t("abspielenLang", {
            sekunden: werbefilm.sekunden,
            megabyte: werbefilm.megabyte,
          })}
          className="group absolute inset-0 flex items-center justify-center focus-visible:outline-none"
        >
          {/* Deckt nur unten ab, wo die Beschriftung liegt. Oben steht der
              Himmel des Standbilds frei - ein Schleier ueber der ganzen
              Flaeche kostet das Motiv und loest oben kein Problem. */}
          <span
            aria-hidden
            className="absolute inset-0 bg-[linear-gradient(0deg,rgba(4,22,28,0.88)_0%,rgba(4,22,28,0.42)_34%,rgba(4,22,28,0.06)_62%,transparent_100%)]"
          />

          {/* Weisser Kreis mit nachtblauem Zeichen: dasselbe Paar wie der
              erste Knopf im Hero, und es traegt gegen jede Stelle des
              Standbilds. */}
          <span
            aria-hidden
            className="relative inline-flex h-16 w-16 items-center justify-center rounded-full bg-white shadow-2xl transition duration-300 group-hover:scale-110 sm:h-20 sm:w-20"
          >
            <span className="absolute inset-0 rounded-full ring-1 ring-white/70 transition duration-500 group-hover:scale-125 group-hover:opacity-0" />
            {/* Sichtbarer Fokus, nachtblau in der weissen Scheibe: 15:1 und
                unabhaengig davon, was das Standbild an dieser Stelle zeigt.
                Ein heller Ring aussen haengt dagegen davon ab, ob dort gerade
                Himmel oder Laub liegt. */}
            <span
              aria-hidden
              className="absolute inset-[5px] rounded-full border-[3px] border-[#04161c] opacity-0 group-focus-visible:opacity-100"
            />
            {/* Etwas nach rechts: ein Dreieck sitzt optisch sonst links. */}
            <Play className="h-6 w-6 translate-x-0.5 fill-[#04161c] text-[#04161c] sm:h-7 sm:w-7" />
          </span>

          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 flex flex-col items-start gap-2 p-4 text-left sm:p-6"
          >
            <span className="text-lg font-black leading-tight text-white sm:text-2xl">
              {t("filmTitel")}
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {locale === werbefilm.tonsprache ? null : (
                <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                  {t("tonsprache")}
                </span>
              )}
              <span className="rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold text-white backdrop-blur-sm">
                {t("megabyte", { megabyte: werbefilm.megabyte })}
              </span>
            </span>
          </span>
        </button>
      ) : null}
    </div>
  );
}
