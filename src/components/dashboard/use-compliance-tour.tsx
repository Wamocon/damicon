"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useComplianceTourSchritte } from "@/components/dashboard/compliance-tour-kontext";
import { bewegungReduziert, feinerZeiger } from "@/lib/bewegung";
import { tourDauer, type HaustierZustand } from "@/lib/haustier";

// Himbis Fuehrung durch die vier Complianceprüfungen auf der CEO-Startseite: dasselbe
// Drehbuch-Prinzip wie die Tour auf der oeffentlichen Startseite (haustier-tour.tsx) - Station
// fuer Station, mit Autopilot und Fortschrittsbalken - aber mit LEBENDIGEM statt festem Text
// (die Stationen kommen aus dem aktuellen Bericht, siehe compliance-tour-kontext.tsx) und ohne
// eigene Figur: sie nutzt die Huelle mit, die HaustierDashboard ohnehin schon zeigt. Deshalb
// liefert dieser Hook keine <HaustierHuelle>, sondern nur das, was HaustierDashboard in ihre
// Blase, ihren Zustand und ihr Blickziel einmischen muss.

const ANGEBOT_SCHLUESSEL = "damicon-compliance-tour";
const ANGEBOT_VERZOEGERUNG_MS = 6500;
const FOKUS_KLASSE = "haustier-fokus";

function springeZuAnker(anker: string): void {
  const ziel = document.getElementById(anker);
  if (!ziel) return;
  if (feinerZeiger() && !bewegungReduziert()) {
    const a = document.createElement("a");
    a.href = `#${anker}`;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } else {
    window.scrollTo({ top: ziel.getBoundingClientRect().top + window.scrollY - 72, behavior: bewegungReduziert() ? "auto" : "smooth" });
  }
  ziel.classList.remove(FOKUS_KLASSE);
  void ziel.offsetWidth;
  window.setTimeout(() => ziel.classList.add(FOKUS_KLASSE), 500);
  window.setTimeout(() => ziel.classList.remove(FOKUS_KLASSE), 3300);
}

type Phase = "aus" | "frage" | "laeuft" | "fertig";

export interface ComplianceTourAnzeige {
  /** Das einmalige Angebot ist bereit - der Aufrufer entscheidet, ob gerade Platz dafuer ist. */
  frageBereit: boolean;
  frageBlase: ReactNode;
  /** Die Tour fuehrt gerade oder ist gerade zu Ende gegangen. */
  aktiv: boolean;
  tourBlase: ReactNode;
  tourZustand: HaustierZustand;
  tourZiel: Element | null;
  huepf: number;
}

export function useComplianceTour(): ComplianceTourAnzeige {
  const t = useTranslations("haustier");
  const tc = useTranslations("ceoUebersicht");
  const schritte = useComplianceTourSchritte();

  const [phase, setPhase] = useState<Phase>("aus");
  const [schritt, setSchritt] = useState(0);
  const [auto, setAuto] = useState(false);
  const [uebernommen, setUebernommen] = useState(false);
  const [ziel, setZiel] = useState<Element | null>(null);
  const [huepf, setHuepf] = useState(0);
  const entschieden = useRef(false);

  useEffect(() => {
    try {
      entschieden.current = window.sessionStorage.getItem(ANGEBOT_SCHLUESSEL) !== null;
    } catch {
      // ohne Speicher: das Angebot kommt in dieser Sitzung jedes Mal neu, das ist verkraftbar
    }
  }, []);

  // Sobald Stationen da sind (und noch nicht entschieden), nach kurzer Verzoegerung anbieten.
  useEffect(() => {
    if (!schritte || schritte.length === 0 || entschieden.current || phase !== "aus") return;
    const id = window.setTimeout(() => setPhase("frage"), ANGEBOT_VERZOEGERUNG_MS);
    return () => window.clearTimeout(id);
  }, [schritte, phase]);

  const merken = useCallback(() => {
    entschieden.current = true;
    try {
      window.sessionStorage.setItem(ANGEBOT_SCHLUESSEL, "1");
    } catch {
      // ohne Speicher: gilt nur bis zum Neuladen
    }
  }, []);

  const geheZu = useCallback(
    (neu: number) => {
      const s = schritte?.[neu];
      if (!s) return;
      setSchritt(neu);
      setZiel(document.getElementById(s.anker));
      springeZuAnker(s.anker);
      setHuepf((n) => n + 1);
    },
    [schritte],
  );

  const beenden = useCallback(() => {
    setPhase("fertig");
    setZiel(null);
    setAuto(false);
  }, []);

  const starten = useCallback(() => {
    merken();
    setUebernommen(false);
    setAuto(!bewegungReduziert());
    setPhase("laeuft");
    geheZu(0);
  }, [merken, geheZu]);

  const ablehnen = useCallback(() => {
    merken();
    setPhase("aus");
  }, [merken]);

  const uebernehmen = useCallback(() => {
    setAuto(false);
    setUebernommen(true);
  }, []);

  // Autopilot: nach der Lesezeit der Station zur naechsten.
  const aktuell = schritte?.[schritt];
  const dauer = aktuell ? tourDauer(aktuell.text) : 0;
  useEffect(() => {
    if (phase !== "laeuft" || !auto || !schritte) return;
    const id = window.setTimeout(() => {
      if (schritt + 1 < schritte.length) geheZu(schritt + 1);
      else beenden();
    }, dauer);
    return () => window.clearTimeout(id);
  }, [phase, auto, schritt, dauer, schritte, geheZu, beenden]);

  // Eingriff waehrend des Autopiloten: ein Klick ausserhalb von Himbi selbst - zum Beispiel auf
  // eine Kachel, um sofort Details zu sehen - uebernimmt die Fuehrung, genau wie auf der Startseite.
  useEffect(() => {
    if (phase !== "laeuft" || !auto) return;
    const beiKlick = (e: PointerEvent) => {
      const z = e.target;
      if (z instanceof Element && z.closest(".haustier")) return;
      uebernehmen();
    };
    window.addEventListener("pointerdown", beiKlick, { passive: true });
    return () => window.removeEventListener("pointerdown", beiKlick);
  }, [phase, auto, uebernehmen]);

  const letzter = !!schritte && schritt === schritte.length - 1;
  const balken = (ms: number) => (
    <div className="hb-fortschritt" key={`${phase}-${schritt}`} style={{ "--dauer": `${ms}ms` } as CSSProperties} aria-hidden />
  );

  const frageBlase = (
    <>
      <p className="hb-blase__text">{tc("tour.frage")}</p>
      <div className="hb-blase__knoepfe">
        <button type="button" className="hb-knopf" onClick={starten}>
          {t("tour.start")}
        </button>
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={ablehnen}>
          {t("tour.nein")}
        </button>
      </div>
    </>
  );

  let tourBlase: ReactNode = null;
  if (phase === "laeuft" && aktuell && schritte) {
    tourBlase = (
      <>
        <p className="hb-blase__text">{aktuell.titel}</p>
        <p className="hb-blase__klein" style={{ fontSize: "0.78rem", lineHeight: "1.2rem" }}>
          {aktuell.text}
        </p>
        {uebernommen && !auto ? <p className="hb-blase__klein">{t("tour.pausiert")}</p> : null}
        {auto ? (
          balken(dauer)
        ) : (
          <div className="hb-punkte" aria-hidden>
            {schritte.map((s, i) => (
              <span key={s.anker} data-aktiv={i === schritt} data-getan={i < schritt} />
            ))}
          </div>
        )}
        <div className="hb-blase__knoepfe">
          {schritt > 0 && !auto ? (
            <button
              type="button"
              className="hb-knopf hb-knopf--leise"
              onClick={() => {
                uebernehmen();
                geheZu(schritt - 1);
              }}
            >
              {t("tour.zurueck")}
            </button>
          ) : null}
          <button
            type="button"
            className="hb-knopf"
            onClick={() => {
              uebernehmen();
              if (letzter) beenden();
              else geheZu(schritt + 1);
            }}
          >
            {letzter ? t("tour.fertigKnopf") : t("tour.weiter")}
          </button>
          {auto ? (
            <button type="button" className="hb-knopf hb-knopf--leise" onClick={uebernehmen}>
              {t("tour.pause")}
            </button>
          ) : (
            <button
              type="button"
              className="hb-knopf hb-knopf--leise"
              onClick={() => {
                setUebernommen(false);
                setAuto(true);
              }}
            >
              {t("tour.auto")}
            </button>
          )}
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={beenden}>
            {t("tour.beenden")}
          </button>
        </div>
      </>
    );
  } else if (phase === "fertig") {
    tourBlase = (
      <>
        <p className="hb-blase__text">{tc("tour.ende")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => setPhase("aus")}>
            {t("tour.fertigKnopf")}
          </button>
        </div>
      </>
    );
  }

  return {
    frageBereit: phase === "frage",
    frageBlase,
    aktiv: phase === "laeuft" || phase === "fertig",
    tourBlase,
    tourZustand: phase === "fertig" ? "fertig" : "ruhe",
    tourZiel: phase === "laeuft" ? ziel : null,
    huepf,
  };
}
