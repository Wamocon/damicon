"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Pause, Play, SkipForward, Volume2, VolumeX } from "lucide-react";
import { DamiconLogo } from "@/components/brand/damicon-logo";
import { bewegungReduziert, verbindungErlaubtVideo } from "@/lib/bewegung";

// Der Film als Auftakt der Seite: randlos, ohne Browser-Bedienleiste, mit
// weichem Uebergang in den Abschnitt darunter. Laeuft er durch, blenden
// Navigation und Logo ueber dem STEHENDEN letzten Bild ein - kein Schnitt auf
// Schwarz.
//
// Die Regel, die alles andere ueberwiegt: die Navigation darf nie wirklich
// unerreichbar sein.
//   - Ein sichtbarer "Ueberspringen"-Knopf steht von der ersten Sekunde an da.
//   - Die Navigation ist waehrend des Films nur optisch zurueckgenommen. Wer
//     mit der Tastatur hineingeht, holt sie sofort zurueck (:focus-within in
//     globals.css) - sie liegt nie auf display:none und faengt Fokus nicht ab.
//   - Ohne JavaScript setzt niemand das Attribut, das sie zurueckzieht: dann
//     steht die Navigation einfach da.
//
// Abgespielt wird nur, wo es angebracht ist (filmDarfLaufen): reduzierte
// Bewegung, Datensparmodus, langsames Netz und schmale Bildschirme bekommen
// das Standbild mit Abspielknopf und eine sichtbare Navigation. Ein Hero-Video
// ist auf Mobilfunkdaten teuer, und niemand hat darum gebeten.

const FILM_URL = process.env.NEXT_PUBLIC_FILM_URL ?? "/hero-himbeere.mp4";
const STANDBILD = "/hero-standbild.webp";

/** Ab dieser Breite laeuft der Film von selbst. Darunter: Standbild mit
 *  Abspielknopf - wer ihn sehen will, tippt drauf. */
const AB_BREITE_PX = 640;

export function filmDarfLaufen(): boolean {
  if (bewegungReduziert()) return false;
  if (!verbindungErlaubtVideo()) return false;
  return window.innerWidth >= AB_BREITE_PX;
}

// Setzt das Attribut vor dem ersten Zeichnen, damit die Navigation nicht
// kurz aufblitzt und dann verschwindet. Dieselbe Bedingung wie
// filmDarfLaufen() - bewusst doppelt, weil dieses Skript laeuft, bevor
// irgendein Modul geladen ist. Faellt es aus, bleibt die Navigation sichtbar:
// die harmlosere Richtung.
const filmInitSkript = `
try {
  var reduziert = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var c = navigator.connection;
  var sparsam = c && (c.saveData || c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g');
  if (!reduziert && !sparsam && innerWidth >= ${AB_BREITE_PX}) document.documentElement.dataset.film = 'laeuft';
} catch (e) {}
`;

const nieAbonnieren = () => () => {};

/** Rendert das Inline-Skript nur im Server-HTML - dasselbe Muster wie
 *  ThemeScript in theme-toggle.tsx. */
export function FilmSkript() {
  const nurAufDemServer = useSyncExternalStore(
    nieAbonnieren,
    () => false,
    () => true,
  );
  if (!nurAufDemServer) return null;
  return <script dangerouslySetInnerHTML={{ __html: filmInitSkript }} />;
}

type Zustand = "bereit" | "laeuft" | "pause" | "fertig" | "fehler";

export function FilmHero() {
  const t = useTranslations("filmHero");
  const videoRef = useRef<HTMLVideoElement>(null);
  // "bereit" heisst: Standbild, nichts laeuft. Erst nach der Hydrierung
  // entscheidet sich, ob daraus "laeuft" wird - der Server weiss nichts ueber
  // Bildschirmbreite, Netz und Bewegungsvorliebe.
  const [zustand, setZustand] = useState<Zustand>("bereit");
  const [ton, setTon] = useState(false);

  const laeuft = zustand === "laeuft";
  const vorbei = zustand === "fertig" || zustand === "fehler";

  // Navigation und Logo einblenden, sobald der Film vorbei ist - oder wenn er
  // gar nicht erst laeuft.
  useEffect(() => {
    const wurzel = document.documentElement;
    if (zustand === "laeuft" || zustand === "pause") wurzel.dataset.film = "laeuft";
    else delete wurzel.dataset.film;
    return () => {
      delete wurzel.dataset.film;
    };
  }, [zustand]);

  // Startentscheidung, einmal nach der Hydrierung.
  useEffect(() => {
    // Kein Autostart: es bleibt beim Anfangszustand "bereit" - Standbild mit
    // Abspielknopf, Navigation sichtbar.
    if (!filmDarfLaufen()) return;
    const video = videoRef.current;
    if (!video) return;
    // Erst jetzt den ganzen Film anfordern. Im Markup steht bewusst
    // preload="metadata": wer ihn nie sieht (schmales Geraet, Sparnetz,
    // reduzierte Bewegung), laedt auch keine 2,4 MB.
    video.preload = "auto";
    void video
      .play()
      .then(() => setZustand("laeuft"))
      .catch(() => {
        // Der Browser verweigert das Abspielen trotz stumm - dann bleibt es
        // beim Standbild mit Abspielknopf, nicht bei einer leeren Flaeche.
        setZustand("bereit");
      });
  }, []);

  function abspielen() {
    const video = videoRef.current;
    if (!video) return;
    void video.play().then(() => setZustand("laeuft")).catch(() => setZustand("fehler"));
  }

  function anhalten() {
    videoRef.current?.pause();
    setZustand("pause");
  }

  function tonUmschalten() {
    const video = videoRef.current;
    if (!video) return;
    const neu = !ton;
    video.muted = !neu;
    setTon(neu);
  }

  /** Ueberspringen: der Film haelt an, das aktuelle Bild bleibt stehen, und
   *  die Navigation ist da. Kein Sprung ins Leere. */
  function ueberspringen() {
    videoRef.current?.pause();
    setZustand("fertig");
  }

  return (
    <section
      className="film-hero relative isolate w-full overflow-hidden bg-background"
      aria-label={t("bereich")}
    >
      <div className="relative h-[100svh] min-h-[28rem] w-full">
        {/* Das Standbild liegt immer darunter: waehrend des Ladens, bei
            reduzierter Bewegung und wenn der Film gar nicht kommt. */}
        <Image
          src={STANDBILD}
          alt={t("standbildAlt")}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />

        {zustand !== "fehler" ? (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            muted={!ton}
            playsInline
            preload="metadata"
            poster={STANDBILD}
            // Kein loop und kein Zuruecksetzen: das letzte Bild bleibt stehen.
            onEnded={() => setZustand("fertig")}
            onError={() => setZustand("fehler")}
            aria-label={t("videoAlt")}
          >
            <source src={FILM_URL} type="video/mp4" />
          </video>
        ) : null}

        {/* Weicher Uebergang nach unten: der Film franst in die Seitenfarbe
            aus, statt als Kasten zu enden. */}
        <div className="film-hero__verlauf" aria-hidden="true" />

        {/* Logo und Claim ueber dem letzten Bild. */}
        <div className={`film-hero__marke ${vorbei ? "film-hero__marke--da" : ""}`}>
          <DamiconLogo className="h-16 w-16 shadow-2xl shadow-primary/30" />
          <p className="film-hero__claim">{t("claim")}</p>
        </div>

        {/* Bedienung: schlicht, in den Farben der Seite - keine Leiste des
            Browsers. Waehrend des Films sichtbar, danach weg. */}
        {!vorbei ? (
          <div className="film-hero__bedienung">
            <button
              type="button"
              onClick={laeuft ? anhalten : abspielen}
              className="film-hero__knopf"
              aria-label={laeuft ? t("pause") : t("abspielen")}
              title={laeuft ? t("pause") : t("abspielen")}
            >
              {laeuft ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={tonUmschalten}
              className="film-hero__knopf"
              aria-label={ton ? t("tonAus") : t("tonAn")}
              title={ton ? t("tonAus") : t("tonAn")}
              aria-pressed={ton}
            >
              {ton ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
            </button>
            {/* Von der ersten Sekunde an sichtbar - niemand muss den Film
                aussitzen, um die Seite zu benutzen. */}
            <button type="button" onClick={ueberspringen} className="film-hero__knopf film-hero__knopf--text">
              <SkipForward className="h-3.5 w-3.5" />
              {t("ueberspringen")}
            </button>
          </div>
        ) : null}

        {/* Ohne Autostart (reduzierte Bewegung, Sparnetz, schmales Geraet):
            ein grosser Abspielknopf statt eines stillen Standbilds. */}
        {zustand === "bereit" ? (
          <button type="button" onClick={abspielen} className="film-hero__start" aria-label={t("abspielen")}>
            <Play className="h-7 w-7" />
            <span>{t("filmAnsehen")}</span>
          </button>
        ) : null}
      </div>
    </section>
  );
}
