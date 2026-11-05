"use client";

import { useTranslations } from "next-intl";
import type { DemoSprache } from "@/lib/demo/drehbuch";

// Die Sprechblase der Vorführung: Untertitel des gesprochenen Satzes, Fortschritt und die
// Bedienung. Reine Darstellung wie LaufBlase der Compliance-Tour (use-compliance-tour.tsx), mit
// denselben Klassen (haustier.css), damit sie in Himbis Blase gleich aussieht und nichts Neues
// gestaltet werden muss. Die Texte der Knöpfe sind die der Tour (haustier.tour.*), neu sind nur
// die der Vorführung (haustier.demo.*).

const SPRACHNAME: Record<DemoSprache, string> = { de: "Deutsch", ru: "Русский" };

export interface DemoBlaseProps {
  phase: "laeuft" | "pause" | "fertig";
  /** Nummer des Schritts ab 1 und Gesamtzahl. */
  nummer: number;
  anzahl: number;
  untertitel: string;
  sprache: DemoSprache;
  sprachen: readonly DemoSprache[];
  /** Der Ton fehlt (Dienst nicht erreichbar): die Untertitel laufen weiter. */
  tonFehlt: boolean;
  onZurueck: () => void;
  onWeiter: () => void;
  onPause: () => void;
  onFortsetzen: () => void;
  onSprache: (sprache: DemoSprache) => void;
  onBeenden: () => void;
  onNochmal: () => void;
}

export function DemoBlase(p: DemoBlaseProps) {
  const t = useTranslations("haustier");

  if (p.phase === "fertig") {
    return (
      <>
        <p className="hb-blase__text">{t("demo.ende")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={p.onBeenden}>
            {t("tour.fertigKnopf")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onNochmal}>
            {t("demo.nochmal")}
          </button>
        </div>
      </>
    );
  }

  const andere = p.sprachen.filter((s) => s !== p.sprache);
  return (
    <>
      <p className="hb-blase__klein">{t("demo.schritt", { n: p.nummer, m: p.anzahl })}</p>
      <p className="hb-blase__klein" style={{ fontSize: "0.82rem", lineHeight: "1.25rem" }} lang={p.sprache}>
        {p.untertitel}
      </p>
      {p.tonFehlt ? <p className="hb-blase__klein">{t("demo.keinTon")}</p> : null}
      {p.phase === "pause" ? <p className="hb-blase__klein">{t("tour.pausiert")}</p> : null}
      <div className="hb-punkte" aria-hidden>
        {Array.from({ length: p.anzahl }, (_, i) => (
          <span key={i} data-aktiv={i === p.nummer - 1} data-getan={i < p.nummer - 1} />
        ))}
      </div>
      <div className="hb-blase__knoepfe">
        {p.nummer > 1 ? (
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onZurueck}>
            {t("tour.zurueck")}
          </button>
        ) : null}
        {p.phase === "pause" ? (
          <button type="button" className="hb-knopf" onClick={p.onFortsetzen}>
            {t("demo.fortsetzen")}
          </button>
        ) : (
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onPause}>
            {t("tour.pause")}
          </button>
        )}
        <button type="button" className="hb-knopf" onClick={p.onWeiter}>
          {p.nummer >= p.anzahl ? t("tour.fertigKnopf") : t("tour.weiter")}
        </button>
        {andere.map((s) => (
          <button key={s} type="button" className="hb-knopf hb-knopf--leise" onClick={() => p.onSprache(s)}>
            {SPRACHNAME[s]}
          </button>
        ))}
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onBeenden}>
          {t("tour.beenden")}
        </button>
      </div>
    </>
  );
}
