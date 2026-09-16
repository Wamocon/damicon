"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Volume2, VolumeX } from "lucide-react";

// Feldgeraeusche zum Zuschalten, anfangs aus. Die Tonspur stammt aus dem
// Rundgangsvideo der Plantage, es ist also der Ton des Ortes und keine
// untergelegte Musik. Automatisch abspielen waere unhoeflich und wird von
// den Browsern ohnehin blockiert; ein Knopf mit aria-pressed ist die ehrliche
// Variante. Ein- und Ausschalten blenden weich, und in einem anderen Tab
// pausiert der Ton.
//
// Die Datei laedt erst beim ersten Einschalten.

const ZIEL = 0.45;

function blende(audio: HTMLAudioElement, ziel: number, fertig?: () => void) {
  const start = audio.volume;
  const beginn = performance.now();
  const schritt = (jetzt: number) => {
    const f = Math.min(1, (jetzt - beginn) / 700);
    audio.volume = start + (ziel - start) * f;
    if (f < 1) requestAnimationFrame(schritt);
    else fertig?.();
  };
  requestAnimationFrame(schritt);
}

function erzeugeTon(quelle: string): HTMLAudioElement {
  const ton = new Audio(quelle);
  ton.loop = true;
  ton.volume = 0;
  return ton;
}

export function TonSchalter({ quelle }: { quelle: string }) {
  const t = useTranslations("erlebnis.ton");
  const [an, setAn] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!an) return;
    const sichtwechsel = () => {
      const ton = audio.current;
      if (!ton) return;
      if (document.hidden) ton.pause();
      else ton.play().catch(() => {});
    };
    document.addEventListener("visibilitychange", sichtwechsel);
    return () => document.removeEventListener("visibilitychange", sichtwechsel);
  }, [an]);

  // Beim Verlassen der Seite verstummt der Ton sofort.
  useEffect(() => {
    const ablage = audio;
    return () => ablage.current?.pause();
  }, []);

  function umschalten() {
    if (!audio.current) audio.current = erzeugeTon(quelle);
    const ton = audio.current;
    if (an) {
      blende(ton, 0, () => ton.pause());
      setAn(false);
      return;
    }
    ton
      .play()
      .then(() => blende(ton, ZIEL))
      .catch(() => setAn(false));
    setAn(true);
  }

  const beschriftung = an ? t("aus") : t("an");

  return (
    <button
      type="button"
      onClick={umschalten}
      aria-pressed={an}
      aria-label={beschriftung}
      title={beschriftung}
      className={`glass fixed bottom-4 right-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground shadow-lg transition hover:-translate-y-0.5 print:hidden ${
        an ? "ring-2 ring-himbeere" : ""
      }`}
    >
      {an ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
    </button>
  );
}
