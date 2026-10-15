"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { VIDEO_SPRACHEN, waehleVideoDatei, type VideoSprache } from "@/lib/domain/schulungsvideos";

// Spielt ein Schulungsvideo ab. Die Sprache der Person ist vorgewaehlt (oder der Rueckfall), ein Wechsel ist moeglich, wo es mehrere Sprachen gibt.
// Der Browser laedt erst beim Abspielen (preload metadata), das schont das Mobilnetz auf dem Feld.
export function SchulungsvideoWiedergabe({ titel, dateien, startSprache }: { titel: string; dateien: { sprache: VideoSprache; url: string }[]; startSprache: string }) {
  const t = useTranslations("schulungsvideos");
  const start = waehleVideoDatei(dateien, startSprache)?.sprache ?? null;
  const [sprache, setSprache] = useState<VideoSprache | null>(start);
  const aktuell = dateien.find((d) => d.sprache === sprache) ?? null;
  if (!aktuell) return <p className="text-xs text-muted-foreground">{t("keineDatei")}</p>;

  return (
    <div className="space-y-2">
      <video key={aktuell.url} controls preload="metadata" playsInline className="w-full max-w-xl rounded-lg border border-border bg-black" aria-label={titel}>
        <source src={aktuell.url} />
        {t("kein_video_support")}
      </video>
      {dateien.length > 1 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("sprachwahl")}>
          {VIDEO_SPRACHEN.filter((s) => dateien.some((d) => d.sprache === s)).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSprache(s)}
              aria-pressed={s === sprache}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${s === sprache ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
            >
              {t(`sprache.${s}`)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
