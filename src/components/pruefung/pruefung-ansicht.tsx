"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Check, RotateCcw, Scale, Square, X } from "lucide-react";
import { PruefungAblauf } from "@/components/pruefung/pruefung-ablauf";
import { PruefungBericht } from "@/components/pruefung/pruefung-bericht";
import { PruefungNachbereitung } from "@/components/pruefung/pruefung-nachbereitung";
import { BEREICH_SYMBOL } from "@/components/pruefung/symbole";
import { usePruefung } from "@/components/pruefung/use-pruefung";
import "@/components/pruefung/pruefung.css";
import "@/components/pruefung/pruefung-ablauf.css";
import { PRUEFBEREICHE, type Pruefbereich } from "@/lib/pruefung/rollen";

// Die Compliance-Pruefung als Ansicht IM KI-Panel (nicht als Fenster ueber der Anwendung): das Hauptfenster
// bleibt bedienbar, waehrend die Mini-Himbis arbeiten. Der Zustand haengt an dieser Komponente; das Panel
// haelt sie eingebunden, auch wenn zum Chat gewechselt wird, ein laufender Lauf geht nicht verloren.
// Die Rollenpruefung hier ist nur Komfort, entschieden wird in /api/ki-pruefung.

export function PruefungAnsicht({ erlaubt }: { erlaubt: readonly Pruefbereich[] }) {
  const t = useTranslations("pruefung");
  const sprache = useLocale();
  const { stand, starten, abbrechen, zurueck } = usePruefung();
  const [gewaehlt, setGewaehlt] = useState<ReadonlySet<Pruefbereich>>(new Set(erlaubt));
  const laeuft = stand.phase === "laeuft";

  const umschalten = (b: Pruefbereich) =>
    setGewaehlt((v) => {
      const n = new Set(v);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });

  return (
    <div className="pa">
      <header className="pa-kopf">
        <div className="pa-kopf__titel">
          <Scale className="h-4 w-4" aria-hidden />
          <div>
            <strong>{t("titel")}</strong>
            <small>{t("untertitel")}</small>
          </div>
        </div>
        {laeuft ? (
          <button type="button" className="pr-knopf" onClick={abbrechen}>
            <X className="h-3.5 w-3.5" /> {t("abbrechen")}
          </button>
        ) : stand.phase !== "bereit" ? (
          <button type="button" className="pr-knopf" onClick={zurueck}>
            <RotateCcw className="h-3.5 w-3.5" /> {t("neu")}
          </button>
        ) : null}
      </header>

      {stand.phase === "bereit" ? (
        <section className="pa-wahl">
          <h3 className="pr-abschnitt__titel">{t("auswahl.titel")}</h3>
          <ul>
            {PRUEFBEREICHE.map((b) => {
              const frei = erlaubt.includes(b);
              const an = frei && gewaehlt.has(b);
              const Symbol = BEREICH_SYMBOL[b];
              return (
                <li key={b}>
                  <button type="button" className="pa-wahl__zeile" role="checkbox" aria-checked={an} disabled={!frei} onClick={() => umschalten(b)}>
                    <span className="pa-wahl__symbol"><Symbol className="h-4 w-4" /></span>
                    <span className="pa-wahl__text">
                      <strong>{t(`bereich.${b}.name`)}</strong>
                      <small>{frei ? t(`bereich.${b}.text`) : t("auswahl.gesperrt")}</small>
                    </span>
                    <span className="pa-wahl__haken" aria-hidden>{an ? <Check className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5 opacity-0" />}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="pa-hinweis">{t("auswahl.hinweis")}</p>
          <button
            type="button"
            className="pr-knopf pr-knopf--haupt"
            disabled={gewaehlt.size === 0}
            onClick={() => void starten(PRUEFBEREICHE.filter((b) => gewaehlt.has(b)), sprache)}
          >
            <Scale className="h-4 w-4" /> {t("start")}
          </button>
        </section>
      ) : null}

      {stand.phase === "laeuft" || stand.phase === "fertig" ? <PruefungAblauf stand={stand} /> : null}
      {stand.phase === "fehler" ? <p className="pr-fehler">{t(`fehler.${stand.fehler ?? "allgemein"}`)}</p> : null}
      {stand.bericht ? <PruefungNachbereitung key={stand.bericht.id} bericht={stand.bericht} /> : null}
      {stand.bericht ? <PruefungBericht bericht={stand.bericht} /> : null}
    </div>
  );
}
