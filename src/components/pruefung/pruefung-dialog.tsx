"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocale, useTranslations } from "next-intl";
import { RotateCcw, ShieldCheck, X } from "lucide-react";
import { PruefungBericht } from "@/components/pruefung/pruefung-bericht";
import { BEREICH_SYMBOL, PruefungBuehne } from "@/components/pruefung/pruefung-buehne";
import { usePruefung, type LogZeile, type PruefungStand } from "@/components/pruefung/use-pruefung";
import "@/components/pruefung/pruefung.css";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";

// Der Dialog der Compliance-Pruefung: Auswahl (nur, was die Rolle darf), Ablauf mit Himbi und den
// Mini-Himbis, Bericht. Die Rollenpruefung der Oberflaeche ist nur Komfort; entschieden wird in
// /api/ki-pruefung.

function LogAnzeige({ stand }: { stand: PruefungStand }) {
  const t = useTranslations("pruefung");
  const zeilen = stand.log.filter((z) => z.art !== "agent" || z.text === "spawn" || z.text === "fertig").slice(-6);
  const feldTitel = (z: LogZeile) => (z.bereich && z.feld ? (stand.agenten[z.bereich]?.felder[z.feld]?.titel ?? z.feld) : "");
  const agent = (z: LogZeile) => (z.bereich ? t(`agent.name.${z.bereich}`) : "Himbi");
  const text = (z: LogZeile): string => {
    if (z.art === "fakten") return t("log.fakten", { agent: agent(z), feld: feldTitel(z), n: z.anzahl ?? 0 });
    if (z.art === "recht") return t("log.recht", { agent: agent(z), feld: feldTitel(z), n: z.anzahl ?? 0, stelle: z.text ?? "-" });
    if (z.art === "befund") return t("log.befund", { agent: agent(z), titel: z.text ?? "" });
    if (z.art === "synthese") return z.text === "start" ? t("log.synthese") : t("log.syntheseFertig");
    return z.text === "spawn" ? t("log.spawn", { agent: agent(z) }) : t("log.fertig", { agent: agent(z) });
  };
  return (
    <ul className="pr-log" aria-live="off">
      {zeilen.map((z) => (
        <li key={z.id} data-art={z.art} data-bereich={z.bereich}>
          <span className="pr-log__punkt" />
          <span>{text(z)}</span>
        </li>
      ))}
    </ul>
  );
}

function Ergebnisse({ stand }: { stand: PruefungStand }) {
  const t = useTranslations("pruefung");
  const fertig = stand.reihenfolge.filter((b) => stand.agenten[b]?.phase === "fertig");
  if (fertig.length === 0) return null;
  return (
    <div className="pr-erg">
      {fertig.map((b) => {
        const Symbol = BEREICH_SYMBOL[b];
        return (
          <span key={b} className="pr-erg__chip" data-bereich={b}>
            <Symbol className="h-3.5 w-3.5" />
            {t(`agent.name.${b}`)} · {stand.agenten[b]?.befunde ?? 0} {t("zaehler.befunde")}
          </span>
        );
      })}
    </div>
  );
}

export function PruefungDialog({ erlaubt, onClose }: { erlaubt: readonly Pruefbereich[]; onClose: () => void }) {
  const t = useTranslations("pruefung");
  const sprache = useLocale();
  const { stand, starten, abbrechen, zurueck } = usePruefung();
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<Pruefbereich>>(new Set(erlaubt));
  const [lauf, setLauf] = useState(0);
  const wurzel = useRef<HTMLDivElement>(null);

  const schliessen = useCallback(() => {
    abbrechen();
    onClose();
  }, [abbrechen, onClose]);

  useEffect(() => {
    const beiTaste = (e: KeyboardEvent) => e.key === "Escape" && schliessen();
    window.addEventListener("keydown", beiTaste);
    const vorher = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    wurzel.current?.focus();
    return () => {
      window.removeEventListener("keydown", beiTaste);
      document.body.style.overflow = vorher;
    };
  }, [schliessen]);

  const umschalten = (b: Pruefbereich) =>
    setGewaehlt((v) => {
      const n = new Set(v);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });

  const los = () => {
    setLauf((n) => n + 1);
    void starten(PRUEFBEREICHE.filter((b) => gewaehlt.has(b)), sprache);
  };

  const laeuft = stand.phase === "laeuft";
  const inhalt = (
    <div className="pr-overlay" onMouseDown={(e) => e.target === e.currentTarget && !laeuft && schliessen()}>
      <div ref={wurzel} className="pr-fenster" role="dialog" aria-modal="true" aria-label={t("titel")} tabIndex={-1}>
        <header className="pr-kopf">
          <div>
            <div className="pr-kopf__titel">
              <ShieldCheck className="h-5 w-5 text-[var(--himbeere)]" /> {t("titel")}
            </div>
            <div className="pr-kopf__unter">{t("untertitel")}</div>
          </div>
          <div className="flex items-center gap-2">
            {stand.phase !== "bereit" ? (
              <button type="button" className="pr-knopf" onClick={zurueck} disabled={laeuft}>
                <RotateCcw className="h-4 w-4" /> {t("neu")}
              </button>
            ) : null}
            <button type="button" className="pr-knopf" onClick={schliessen} aria-label={t("schliessen")}>
              {laeuft ? t("abbrechen") : <X className="h-4 w-4" />}
            </button>
          </div>
        </header>

        <div className="pr-inhalt">
          {stand.phase === "bereit" ? (
            <>
              <h3 className="pr-abschnitt__titel">{t("auswahl.titel")}</h3>
              <div className="pr-auswahl">
                {PRUEFBEREICHE.map((b) => {
                  const frei = erlaubt.includes(b);
                  const Symbol = BEREICH_SYMBOL[b];
                  return (
                    <button key={b} type="button" className="pr-bereich" data-bereich={b} disabled={!frei} aria-pressed={frei && gewaehlt.has(b)} onClick={() => umschalten(b)}>
                      <span className="pr-bereich__name">
                        <span className="pr-bereich__symbol">
                          <Symbol className="h-4 w-4" />
                        </span>
                        {t(`bereich.${b}.name`)}
                      </span>
                      <span className="pr-bereich__text">{t(`bereich.${b}.text`)}</span>
                      {!frei ? <span className="pr-bereich__sperre">{t("auswahl.gesperrt")}</span> : null}
                    </button>
                  );
                })}
              </div>
              <p className="pr-kopf__unter" style={{ marginTop: "0.8rem" }}>
                {t("auswahl.hinweis")}
              </p>
              <div style={{ marginTop: "1rem" }}>
                <button type="button" className="pr-knopf pr-knopf--haupt" onClick={los} disabled={gewaehlt.size === 0}>
                  <ShieldCheck className="h-4 w-4" /> {t("start")}
                </button>
              </div>
            </>
          ) : null}

          {stand.phase !== "bereit" && stand.phase !== "fehler" ? (
            <>
              <PruefungBuehne key={lauf} stand={stand} klein={stand.phase === "fertig"} />
              <Ergebnisse stand={stand} />
              {stand.phase === "laeuft" ? <LogAnzeige stand={stand} /> : null}
            </>
          ) : null}

          {stand.phase === "fehler" ? <p className="pr-fehler">{t(`fehler.${stand.fehler ?? "allgemein"}`)}</p> : null}

          {stand.bericht ? <PruefungBericht bericht={stand.bericht} /> : null}
        </div>
      </div>
    </div>
  );
  return createPortal(inhalt, document.body);
}
