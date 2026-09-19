"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { HaustierHuelle } from "@/components/haustier/haustier-huelle";
import { Link } from "@/i18n/navigation";
import { bewegungReduziert, feinerZeiger } from "@/lib/bewegung";
import { TOUR_SCHRITTE, type HaustierZustand } from "@/lib/haustier";

// Himbi auf der oeffentlichen Startseite: begruesst Besucher und fuehrt auf Wunsch in einer
// Minute durch die Seite. Bewusst KEIN KI-Chat: Besucher sind nicht angemeldet, ein
// offener Assistent waere ein Kostenrisiko. Die Tour ist ein festes Drehbuch (lib/haustier.ts
// TOUR_SCHRITTE) mit uebersetzten Texten.
//
// Zum Scrollen benutzt Himbi denselben Weg wie die Navigation: einen Sprunglink, den
// Lenis (weiches-scrollen.tsx) weich anfaehrt. Ein eigenes Scrollen wuerde mit Lenis
// kaempfen und ruckeln.

const MERKER = "damicon-haustier-tour";
const ERSCHEINEN_NACH_MS = 1600;
const GRUSS_NACH_MS = 900;
const FOKUS_KLASSE = "haustier-fokus";

type Phase = "still" | "gruss" | "tour" | "ende";

function merken(wert: "nein" | "fertig"): void {
  try {
    window.localStorage.setItem(MERKER, wert);
  } catch {
    // ohne Speicher: die Tour wird beim naechsten Besuch wieder angeboten
  }
}

function springeZu(anker: string): void {
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

export function HaustierTour() {
  const t = useTranslations("haustier");
  const [sichtbar, setSichtbar] = useState(false);
  const [phase, setPhase] = useState<Phase>("still");
  const [schritt, setSchritt] = useState(0);
  const [spricht, setSpricht] = useState(false);
  const [ziel, setZiel] = useState<Element | null>(null);
  const bekannt = useRef(false);

  // Bei jeder neuen Blase kurz sprechen (der Mund bewegt sich).
  const sprechTimer = useRef<number | undefined>(undefined);
  const sprich = useCallback(() => {
    setSpricht(true);
    window.clearTimeout(sprechTimer.current);
    sprechTimer.current = window.setTimeout(() => setSpricht(false), 1500);
  }, []);
  useEffect(() => () => window.clearTimeout(sprechTimer.current), []);

  // Erscheinen: neue Besucher werden begruesst, wer die Tour schon kennt oder abgelehnt hat,
  // findet Himbi nur still in der Ecke.
  useEffect(() => {
    try {
      bekannt.current = window.localStorage.getItem(MERKER) !== null;
    } catch {
      // ohne Speicher: jedes Mal begruessen
    }
    const a = window.setTimeout(() => setSichtbar(true), ERSCHEINEN_NACH_MS);
    const b = window.setTimeout(() => {
      if (bekannt.current) return;
      setPhase("gruss");
      sprich();
    }, ERSCHEINEN_NACH_MS + GRUSS_NACH_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [sprich]);

  const geheZu = useCallback(
    (neu: number) => {
      const s = TOUR_SCHRITTE[neu];
      if (!s) return;
      setSchritt(neu);
      setPhase("tour");
      setZiel(document.getElementById(s.anker));
      springeZu(s.anker);
      sprich();
    },
    [sprich],
  );

  const zumEnde = useCallback(() => {
    setPhase("ende");
    setZiel(null);
    merken("fertig");
    sprich();
  }, [sprich]);

  const beenden = useCallback(() => {
    setPhase("still");
    setZiel(null);
    merken("nein");
  }, []);

  // Tastatur: Pfeile blaettern, Escape beendet
  useEffect(() => {
    if (phase !== "tour") return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        if (schritt + 1 < TOUR_SCHRITTE.length) geheZu(schritt + 1);
        else zumEnde();
      } else if (e.key === "ArrowLeft" && schritt > 0) geheZu(schritt - 1);
      else if (e.key === "Escape") beenden();
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [phase, schritt, geheZu, zumEnde, beenden]);

  if (!sichtbar) return null;

  const zustand: HaustierZustand = phase === "ende" ? "fertig" : spricht ? "spricht" : "ruhe";
  const letzter = schritt === TOUR_SCHRITTE.length - 1;
  const aktuell = TOUR_SCHRITTE[schritt];

  let blase = null;
  if (phase === "gruss") {
    blase = (
      <>
        <p className="hb-blase__text">{t("tour.gruss")}</p>
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={() => geheZu(0)}>
            {t("tour.start")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={beenden}>
            {t("tour.nein")}
          </button>
        </div>
      </>
    );
  } else if (phase === "tour" && aktuell) {
    blase = (
      <>
        <p className="hb-blase__text">{t(`tour.${aktuell.schluessel}.titel`)}</p>
        <p className="hb-blase__klein" style={{ fontSize: "0.78rem", lineHeight: "1.2rem" }}>
          {t(`tour.${aktuell.schluessel}.text`)}
        </p>
        <div className="hb-punkte" aria-hidden>
          {TOUR_SCHRITTE.map((s, i) => (
            <span key={s.schluessel} data-aktiv={i === schritt} data-getan={i < schritt} />
          ))}
        </div>
        <div className="hb-blase__knoepfe">
          {schritt > 0 ? (
            <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => geheZu(schritt - 1)}>
              {t("tour.zurueck")}
            </button>
          ) : null}
          <button
            type="button"
            className="hb-knopf"
            onClick={() => (letzter ? zumEnde() : geheZu(schritt + 1))}
          >
            {letzter ? t("tour.fertigKnopf") : t("tour.weiter")}
          </button>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={beenden}>
            {t("tour.beenden")}
          </button>
        </div>
      </>
    );
  } else if (phase === "ende") {
    blase = (
      <>
        <p className="hb-blase__text">{t("tour.ende")}</p>
        <div className="hb-blase__knoepfe">
          <Link href="/login" className="hb-knopf">
            {t("tour.anmelden")}
          </Link>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={() => geheZu(0)}>
            {t("tour.nochmal")}
          </button>
        </div>
      </>
    );
  }

  return (
    <HaustierHuelle
      zustand={zustand}
      blase={blase}
      label={t("label.tour")}
      hoch
      blickZiel={phase === "tour" ? ziel : null}
      onKlick={() => setPhase((p) => (p === "still" ? "gruss" : p === "gruss" ? "still" : p))}
      onVerstecken={() => {
        setSichtbar(false);
        merken("nein");
      }}
      versteckenLabel={t("verstecken")}
    />
  );
}
