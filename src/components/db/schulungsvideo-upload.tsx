"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { legeVideoAb } from "@/lib/schulungsvideos/video-browser";
import { VIDEO_SPRACHEN } from "@/lib/domain/schulungsvideos";

// Videodatei hochladen oder ersetzen (Administration, Betriebsleitung). Die Datei geht in Stuecken direkt in den Speicher; der Fortschritt steht darunter.
export function SchulungsvideoUpload({ videoId }: { videoId: string }) {
  const t = useTranslations("schulungsvideos");
  const router = useRouter();
  const [sprache, setSprache] = useState<string>(VIDEO_SPRACHEN[0]);
  const [datei, setDatei] = useState<File | null>(null);
  const [prozent, setProzent] = useState<number | null>(null);
  const [meldung, setMeldung] = useState<{ gut: boolean; text: string } | null>(null);
  const [, uebergang] = useTransition();

  async function hochladen() {
    if (!datei) return;
    setMeldung(null);
    setProzent(0);
    const ergebnis = await legeVideoAb(datei, videoId, sprache, setProzent);
    setProzent(null);
    if (ergebnis.ok) {
      setMeldung({ gut: true, text: t("upload.fertig") });
      setDatei(null);
      uebergang(() => router.refresh());
    } else {
      setMeldung({ gut: false, text: t(`fehler.${ergebnis.code}`) });
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <p className="text-xs font-semibold text-card-foreground">{t("upload.titel")}</p>
      <div className="grid gap-2.5 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] sm:items-end">
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">{t("upload.sprache")}</span>
          <select value={sprache} onChange={(e) => setSprache(e.target.value)} className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground">
            {VIDEO_SPRACHEN.map((s) => (
              <option key={s} value={s}>
                {t(`sprache.${s}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className="text-[11px] font-semibold text-card-foreground">{t("upload.datei")}</span>
          <input
            type="file"
            accept="video/mp4,video/webm,.mp4,.webm"
            onChange={(e) => setDatei(e.target.files?.[0] ?? null)}
            className="w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground file:mr-2 file:rounded-md file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs file:font-semibold file:text-foreground"
          />
        </label>
        <button
          type="button"
          onClick={hochladen}
          disabled={!datei || prozent !== null}
          className="rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground transition disabled:opacity-50"
        >
          {prozent === null ? t("upload.knopf") : t("upload.laeuft", { prozent })}
        </button>
      </div>
      <p className="text-[11px] leading-4 text-muted-foreground">{t("upload.hinweis")}</p>
      {meldung ? (
        <p role={meldung.gut ? "status" : "alert"} className={`text-xs font-semibold ${meldung.gut ? "text-success" : "text-destructive"}`}>
          {meldung.text}
        </p>
      ) : null}
    </div>
  );
}
