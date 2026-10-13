"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { wissenSeitenNachladen } from "@/lib/actions/wissen";
import type { AktionsStatus } from "@/lib/actions/status";
import { bereinigeSeitentext } from "@/lib/wissen/buch-text";
import { pdfSeitenAusDatei } from "@/lib/wissen/buch-pdf";
import { ordneSeitenZu } from "@/lib/wissen/nachtrag-zuordnung";
import { alsBereichsText, leseSeitenzahlen, type OffeneLuecke } from "@/lib/wissen/seiten-bestaetigung";

// Fehlende Seiten nachladen (Prüffenster eines wartenden Buchs). Die Person wählt eine PDF mit Texterkennung (OCR), die nur die fehlenden Seiten enthält. Der
// Browser liest sie, entnimmt jeder Seite die gedruckte Seitenzahl, ordnet sie den offenen Lücken zu und schickt den Text; der Server reiht ihn an der Stelle
// der Lücke ins Buch ein (nachtrag.ts). Danach lädt die Liste neu: Die nachgeladenen Seiten sind nicht mehr offen.
// Liegt kein Block eines Formulars um dieses Element, sind alle Knöpfe type="button": Enter oder ein Klick schicken nichts ab, was nicht gemeint ist.

type Phase =
  | { art: "ruhe" }
  | { art: "liest"; seite: number; seiten: number }
  | { art: "sendet"; seiten: string }
  | { art: "fertig"; seiten: string }
  | { art: "fehler"; text: string };

export function WissenSeitenNachladen({
  quelleId,
  offen,
  beiGeaendert,
}: {
  quelleId: string;
  offen: readonly OffeneLuecke[];
  beiGeaendert: () => void;
}) {
  const t = useTranslations("kiAssistentAnsicht.wissensVerwaltung.pruefung.nachladen");
  const tAktion = useTranslations("aktionen");
  const [phase, setPhase] = useState<Phase>({ art: "ruhe" });
  const [manuell, setManuell] = useState("");
  const eingabe = useRef<HTMLInputElement>(null);
  const beschaeftigt = phase.art === "liest" || phase.art === "sendet";

  const fehlerText = (status: AktionsStatus): string => {
    const schluessel = status.meldung ?? "fehler.unbekannt";
    try {
      return (tAktion as (k: string, v?: Record<string, string>) => string)(schluessel, { wert: status.wert ?? "" });
    } catch {
      return tAktion("fehler.unbekannt");
    }
  };

  const lade = async (datei: File | undefined) => {
    if (!datei) return;
    if (!/\.pdf$/i.test(datei.name)) {
      setPhase({ art: "fehler", text: t("keinePdf") });
      return;
    }
    const handAngabe = leseSeitenzahlen(manuell);
    if (manuell.trim() && handAngabe.fehler) {
      setPhase({ art: "fehler", text: t("angabeUngueltig") });
      return;
    }
    setPhase({ art: "liest", seite: 0, seiten: 0 });
    try {
      const lesung = await pdfSeitenAusDatei(datei, (f) => setPhase({ art: "liest", seite: f.seite, seiten: f.seiten }));
      const z = ordneSeitenZu(lesung.raender, offen, handAngabe.seiten.length > 0 ? handAngabe.seiten : undefined);
      if (handAngabe.seiten.length > 0 && handAngabe.seiten.length !== lesung.seiten.length) {
        setPhase({ art: "fehler", text: t("angabeAnzahl", { angegeben: handAngabe.seiten.length, seiten: lesung.seiten.length }) });
        return;
      }
      if (z.unklar.length > 0) {
        setPhase({ art: "fehler", text: t("unklar", { liste: z.unklar.slice(0, 15).join(", ") + (z.unklar.length > 15 ? " ..." : "") }) });
        return;
      }
      if (z.ausserhalb.length > 0) {
        setPhase({ art: "fehler", text: t("ausserhalb", { liste: z.ausserhalb.slice(0, 15).join(", ") + (z.ausserhalb.length > 15 ? " ..." : "") }) });
        return;
      }
      if (z.gruppen.length === 0) {
        setPhase({ art: "fehler", text: t("keineZuordnung") });
        return;
      }
      const gruppen = z.gruppen.map((g) => ({ seiten: g.seiten, text: bereinigeSeitentext(g.pdfSeiten.map((p) => lesung.seiten[p - 1] ?? "")) }));
      if (gruppen.some((g) => g.text.trim().length === 0)) {
        setPhase({ art: "fehler", text: t("ohneText") });
        return;
      }
      const seitenText = alsBereichsText(z.gruppen.flatMap((g) => g.seiten));
      setPhase({ art: "sendet", seiten: seitenText });
      const antwort = await wissenSeitenNachladen(quelleId, gruppen);
      if (antwort.stand !== "ok") {
        setPhase({ art: "fehler", text: fehlerText(antwort) });
        return;
      }
      setPhase({ art: "fertig", seiten: antwort.wert ?? seitenText });
      beiGeaendert();
    } catch (fehler) {
      console.error("[damicon] Seiten nachladen fehlgeschlagen:", fehler);
      setPhase({ art: "fehler", text: t("lesenFehler") });
    } finally {
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  return (
    <div role="group" aria-label={t("titel")} className="space-y-1.5 rounded-lg border border-border bg-muted/30 p-2">
      <p className="text-[11px] font-semibold">{t("titel")}</p>
      <p className="text-[11px] text-muted-foreground">{t("erklaerung")}</p>
      <label className="block space-y-1">
        <span className="text-[11px] font-semibold">{t("manuell")}</span>
        <input
          value={manuell}
          maxLength={200}
          disabled={beschaeftigt}
          placeholder={t("manuellPlatzhalter")}
          onChange={(e) => setManuell(e.target.value)}
          // Enter darf das Formular des Prüffensters nicht abschicken.
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault();
          }}
          className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={eingabe} type="file" accept="application/pdf,.pdf" className="sr-only" id={`nachladen-${quelleId}`} disabled={beschaeftigt} onChange={(e) => void lade(e.target.files?.[0])} />
        <label
          htmlFor={`nachladen-${quelleId}`}
          className={`inline-flex h-8 cursor-pointer items-center rounded-lg border border-border px-3 text-xs font-semibold ${beschaeftigt ? "pointer-events-none opacity-60" : ""}`}
        >
          {t("waehlen")}
        </label>
        <span role="status" aria-live="polite" className="text-[11px] text-muted-foreground">
          {phase.art === "liest" ? (phase.seiten > 0 ? t("liest", { seite: phase.seite, seiten: phase.seiten }) : t("oeffnet")) : null}
          {phase.art === "sendet" ? t("sendet", { seiten: phase.seiten }) : null}
          {phase.art === "fertig" ? t("fertig", { seiten: phase.seiten }) : null}
        </span>
      </div>
      {phase.art === "fehler" ? (
        <p role="alert" className="break-words text-[11px] font-semibold text-destructive">
          {phase.text}
        </p>
      ) : null}
    </div>
  );
}
