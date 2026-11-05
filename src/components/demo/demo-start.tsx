"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useDemoSteuerung } from "@/components/demo/demo-kontext";
import { istDemoSprache, type DemoSprache } from "@/lib/demo/drehbuch";

// Der Start der Vorführung in Himbis Einstellungen (haustier-einstellung.tsx). Sichtbar nur für
// Geschäftsführung und Administration (useDemoSteuerung().erlaubt); die Route der Stimme prüft die
// echte Profilrolle noch einmal auf dem Server.

const SPRACHNAME: Record<DemoSprache, string> = { de: "Deutsch", ru: "Русский" };

export function DemoStart() {
  const t = useTranslations("haustier");
  const locale = useLocale();
  const { erlaubt, kannStarten, aktiv, sprachen, starten } = useDemoSteuerung();
  const [gewaehlt, setGewaehlt] = useState<DemoSprache | null>(null);
  // Voreinstellung: die vortragende Person leitet selbst ein und übergibt an Himbi, der mit den
  // Beispielen beginnt; der CEO-Teil läuft nur auf Wunsch.
  const [mitEinleitung, setMitEinleitung] = useState(false);
  const [mitCeoTeil, setMitCeoTeil] = useState(false);

  if (!erlaubt) return null;
  // Voreinstellung: die Sprache der Oberfläche, wenn das Drehbuch sie ganz kennt, sonst Deutsch.
  const sprache = gewaehlt ?? (istDemoSprache(locale) && sprachen.includes(locale) ? locale : "de");
  const gesperrt = !kannStarten || aktiv;

  return (
    <>
      <div className="ki-einstellung__kopf hb-einstellung__zeile">
        <div className="ki-einstellung__titel">{t("demo.titel")}</div>
      </div>
      <p className="ki-einstellung__text">{t("demo.text")}</p>
      {sprachen.length > 1 ? (
        <div className="hb-vorschau__knoepfe" role="group" aria-label={t("demo.sprache")}>
          {sprachen.map((s) => (
            <button key={s} type="button" aria-pressed={sprache === s} onClick={() => setGewaehlt(s)} className="hb-chip">
              {SPRACHNAME[s]}
            </button>
          ))}
        </div>
      ) : null}
      <div className="hb-vorschau__knoepfe" role="group" aria-label={t("demo.titel")}>
        <button type="button" aria-pressed={mitEinleitung} onClick={() => setMitEinleitung(!mitEinleitung)} className="hb-chip">
          {t("demo.einleitung")}
        </button>
        <button type="button" aria-pressed={mitCeoTeil} onClick={() => setMitCeoTeil(!mitCeoTeil)} className="hb-chip">
          {t("demo.ceoTeil")}
        </button>
      </div>
      <div className="hb-vorschau__knoepfe">
        <button type="button" className="hb-chip" disabled={gesperrt} onClick={() => starten({ mitCeoTeil, mitEinleitung, sprache })}>
          {t("demo.start")}
        </button>
      </div>
      {!kannStarten ? <p className="hb-vorschau__hinweis">{t("demo.nichtMoeglich")}</p> : null}
    </>
  );
}
