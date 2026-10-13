"use client";

import { useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { wissenOriginalOeffnen } from "@/lib/actions/wissen-original";
import { normalisiereText, sha256Hex } from "@/lib/wissen/buch-text";
import { pdfLesenAusDatei } from "@/lib/wissen/buch-pdf";
import type { WissenDokumentZeile } from "@/lib/wissen/dokumente-liste";
import { formatiereGroesse } from "@/lib/wissen/groesse";
import { legeOriginalAb } from "@/lib/wissen/original-browser";
import { uploadQuelleId } from "@/lib/wissen/upload-quelle";

// Original-PDF im Prüffenster eines wartenden Buchs: öffnen, wenn eine bereitliegt, sonst nachtragen. Die Datei liegt nur bis zur Freigabe im
// Speicher (original.ts). Beim Nachtragen wird die gewählte PDF im Browser gelesen und ihr Text-Hash mit der Kennung des Dokuments verglichen:
// Nur die PDF, aus der das Buch entstand, wird angenommen. Alle Knöpfe sind type="button": Das Prüffenster ist ein Formular.

type Phase = { art: "ruhe" } | { art: "oeffnet" } | { art: "liest"; seite: number; seiten: number } | { art: "laedt"; prozent: number } | { art: "fertig" } | { art: "fehler"; text: string };

export function WissenOriginal({ dokument, beiGeaendert }: { dokument: WissenDokumentZeile; beiGeaendert: () => void }) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.original");
  const locale = useLocale();
  const [phase, setPhase] = useState<Phase>({ art: "ruhe" });
  const [adresse, setAdresse] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);
  const knopf = "inline-flex h-8 items-center gap-1.5 rounded-lg border border-border px-3 text-xs font-semibold disabled:opacity-60";
  const beschaeftigt = phase.art === "oeffnet" || phase.art === "liest" || phase.art === "laedt";

  const fehlerText = (code: string) => (t.has(`fehler.${code}`) ? t(`fehler.${code}`) : t("fehler.unbekannt"));

  const oeffne = async () => {
    // Das Fenster sofort öffnen (ein Klick darf), die Adresse folgt: Sonst blockiert der Browser das Fenster nach dem Warten.
    const fenster = window.open("about:blank", "_blank");
    setPhase({ art: "oeffnet" });
    setAdresse(null);
    const antwort = await wissenOriginalOeffnen(dokument.schluessel).catch(() => null);
    if (!antwort || !antwort.ok) {
      fenster?.close();
      setPhase({ art: "fehler", text: fehlerText(antwort && !antwort.ok ? antwort.code : "unbekannt") });
      return;
    }
    setAdresse(antwort.url);
    if (fenster) fenster.location.href = antwort.url;
    setPhase({ art: "ruhe" });
  };

  const nachtragen = async (datei: File | undefined) => {
    if (!datei) return;
    if (!/\.pdf$/i.test(datei.name)) {
      setPhase({ art: "fehler", text: t("fehler.ungueltig") });
      return;
    }
    setPhase({ art: "liest", seite: 0, seiten: 0 });
    try {
      const lesung = await pdfLesenAusDatei(datei, (f) => setPhase({ art: "liest", seite: f.seite, seiten: f.seiten }));
      const text = normalisiereText(lesung.text);
      const hash = text ? await sha256Hex(text) : null;
      if (!hash || uploadQuelleId(hash) !== dokument.schluessel) {
        setPhase({ art: "fehler", text: t("fehler.passtNicht") });
        return;
      }
      setPhase({ art: "laedt", prozent: 0 });
      const ergebnis = await legeOriginalAb(datei, dokument.schluessel, (prozent) => setPhase({ art: "laedt", prozent }));
      if (!ergebnis.ok) {
        setPhase({ art: "fehler", text: fehlerText(ergebnis.code) });
        return;
      }
      setPhase({ art: "fertig" });
      beiGeaendert();
    } catch (fehler) {
      console.error("[damicon] Original nachtragen fehlgeschlagen:", fehler);
      setPhase({ art: "fehler", text: t("fehler.unlesbar") });
    } finally {
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  const hatOriginal = dokument.originalGroesse !== null;
  return (
    <div className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
      <p className="text-[11px] font-semibold">{t("titel")}</p>
      {hatOriginal ? (
        <>
          <p className="text-[11px] text-muted-foreground">{t("da", { umfang: formatiereGroesse(dokument.originalGroesse ?? 0, locale) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={beschaeftigt} onClick={() => void oeffne()} className={knopf}>
              <FileText className="h-3.5 w-3.5" aria-hidden />
              {phase.art === "oeffnet" ? t("oeffnet") : t("oeffnen")}
            </button>
            {adresse ? (
              <a href={adresse} target="_blank" rel="noopener noreferrer" className="text-[11px] font-semibold text-primary underline">
                {t("nochmal")}
              </a>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground">{t("keins")}</p>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" disabled={beschaeftigt} onClick={() => eingabe.current?.click()} className={knopf}>
              {t("nachtragen")}
            </button>
            <input ref={eingabe} type="file" accept=".pdf,application/pdf" className="sr-only" tabIndex={-1} aria-label={t("nachtragen")} onChange={(e) => void nachtragen(e.target.files?.[0])} />
          </div>
          <p className="text-[11px] text-muted-foreground">{t("nachtragenHinweis")}</p>
        </>
      )}
      <p role="status" aria-live="polite" className="text-[11px] font-semibold">
        {phase.art === "liest" ? t("liest", { seite: phase.seite, seiten: phase.seiten }) : phase.art === "laedt" ? t("laedt", { prozent: phase.prozent }) : phase.art === "fertig" ? t("fertig") : null}
      </p>
      {phase.art === "fehler" ? (
        <p role="alert" className="text-[11px] font-semibold text-destructive">
          {phase.text}
        </p>
      ) : null}
    </div>
  );
}
