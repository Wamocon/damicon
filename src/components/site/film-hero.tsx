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
// Die Navigation bleibt dabei stehen - immer, von der ersten Sekunde an.
// Ueber dem Film legt sie nur ihr Glas ab (weisse Schrift auf weichem
// dunklem Schleier, globals.css), damit sie zum Bild gehoert statt darauf zu
// liegen; sobald der Film aus dem Bild scrollt, kommt das gewohnte Glas
// zurueck. Sie verschwindet nie - weder optisch noch fuer Tastatur oder
// Vorlesegeraet. Dazu steht von der ersten Sekunde an ein sichtbarer
// "Ueberspringen"-Knopf da.
//
// Abgespielt wird nur, wo es angebracht ist (filmDarfLaufen): reduzierte
// Bewegung, Datensparmodus, langsames Netz und schmale Bildschirme bekommen
// das Standbild mit Abspielknopf und eine sichtbare Navigation. Ein Hero-Video
// ist auf Mobilfunkdaten teuer, und niemand hat darum gebeten.

// Der Damicon-Kurzfilm. Er kam als 5,2-MB-Datei aus SharePoint, mit dem
// Inhaltsverzeichnis (moov) HINTER den Bilddaten - so kann kein Browser
// anfangen zu spielen, bevor die ganze Datei da ist. Neu kodiert mit
// -movflags +faststart und CRF 24: 2,35 MB, dieselbe Laenge, dieselbe
// Aufloesung (1280x720), Ton erhalten.
//
// Die Datei liegt im Repo, weil sie klein genug dafuer ist. Soll sie spaeter
// aus einem oeffentlichen Speicher kommen (Supabase-Bucket, Vercel Blob),
// genuegt NEXT_PUBLIC_FILM_URL - ohne Codeaenderung.
const FILM_URL = process.env.NEXT_PUBLIC_FILM_URL ?? "/damicon-kurzfilm.mp4";
// Standbild aus dem Film selbst (Sekunde 1,2), nicht aus fremdem Material:
// so gibt es beim Start keinen Sprung vom Platzhalter ins Bild.
const STANDBILD = "/damicon-standbild.webp";

/** Ab dieser Breite laeuft der Film von selbst. Darunter: Standbild mit
 *  Abspielknopf - wer ihn sehen will, tippt drauf. */
const AB_BREITE_PX = 640;

export function filmDarfLaufen(): boolean {
  if (bewegungReduziert()) return false;
  if (!verbindungErlaubtVideo()) return false;
  return window.innerWidth >= AB_BREITE_PX;
}

// Setzt vor dem ersten Zeichnen, dass die Leiste ueber dem Film steht -
// sonst blitzte das Glas kurz auf und verschwaende wieder. Die Seite oeffnet
// immer mit dem Film im Bild, deshalb ohne Bedingung. Faellt das Skript aus,
// sieht die Leiste aus wie ueberall sonst: harmlos.
const filmInitSkript = `
try { document.documentElement.dataset.film = 'oben'; } catch (e) {}
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

  // Solange der Film im Bild steht, legt die Navigation ihr Glas ab und
  // gehoert optisch zum Film (globals.css). Sie verschwindet dabei NIE - sie
  // wechselt nur ihr Aussehen. Scrollt der Film aus dem Bild, kommt das
  // gewohnte Glas zurueck.
  const buehneRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const wurzel = document.documentElement;
    const buehne = buehneRef.current;
    if (!buehne) return;
    const beobachter = new IntersectionObserver(
      ([eintrag]) => {
        // Erst wenn der Film groesstenteils aus dem Bild ist, wechselt die
        // Leiste zurueck - sonst flackerte sie beim kleinsten Scrollen.
        if (eintrag.intersectionRatio > 0.55) wurzel.dataset.film = "oben";
        else delete wurzel.dataset.film;
      },
      { threshold: [0, 0.55, 1] },
    );
    beobachter.observe(buehne);
    return () => {
      beobachter.disconnect();
      delete wurzel.dataset.film;
    };
  }, []);

  // Startentscheidung, einmal nach der Hydrierung.
  useEffect(() => {
    // Kein Autostart: es bleibt beim Anfangszustand "bereit" - Standbild mit
    // Abspielknopf, Navigation sichtbar.
    if (!filmDarfLaufen()) return;
    const video = videoRef.current;
    if (!video) return;
    // Erst jetzt den ganzen Film anfordern. Im Markup steht bewusst
    // preload="metadata": wer ihn nie sieht (schmales Geraet, Sparnetz,
    // reduzierte Bewegung), laedt auch keine 2,35 MB.
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
      ref={buehneRef}
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
