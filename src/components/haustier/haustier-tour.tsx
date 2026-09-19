"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslations } from "next-intl";
import { HaustierHuelle } from "@/components/haustier/haustier-huelle";
import { HimbiVersteck } from "@/components/haustier/himbi-versteck";
import { Link } from "@/i18n/navigation";
import { bewegungReduziert, feinerZeiger } from "@/lib/bewegung";
import { TOUR_SCHRITTE, tourDauer, type HaustierZustand } from "@/lib/haustier";

// Himbi auf der oeffentlichen Startseite: begruesst Besucher und fuehrt in rund einer Minute
// durch die Seite - von selbst. Wer nichts tut, sieht die ganze Tour. Sobald der Besucher
// selbst eingreift (irgendwo klickt, scrollt oder eine Scroll-Taste drueckt), gibt Himbi die
// Fuehrung ab und wartet; "Automatisch weiter" setzt sie wieder fort.
//
// Bewusst KEIN KI-Chat: Besucher sind nicht angemeldet, ein offener Assistent waere ein
// Kostenrisiko. Die Tour ist ein festes Drehbuch (lib/haustier.ts TOUR_SCHRITTE) mit
// uebersetzten Texten. Bei reduzierter Bewegung laeuft nichts von allein.
//
// Zum Scrollen benutzt Himbi denselben Weg wie die Navigation: einen Sprunglink, den Lenis
// (weiches-scrollen.tsx) weich anfaehrt. Ein eigenes Scrollen wuerde mit Lenis kaempfen. Weil
// das programmatisch geschieht, loest es KEINE Mausrad-Ereignisse aus - so lassen sich
// Eingriffe des Besuchers sauber von der eigenen Fahrt unterscheiden.

const MERKER = "damicon-haustier-tour";
const WEG_MERKER = "damicon-haustier-weg";
const ERSCHEINEN_NACH_MS = 1600;
const GRUSS_NACH_MS = 900;
const AUTOSTART_MS = 7000;
const WILLKOMMEN_MS = 2600;
const FOKUS_KLASSE = "haustier-fokus";
const SCROLL_TASTEN = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"]);

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
  const [huepf, setHuepf] = useState(0);
  /** Der Autopilot fuehrt die Tour. */
  const [auto, setAuto] = useState(false);
  /** Die Begruessung zaehlt herunter und startet die Tour von selbst. */
  const [autoStart, setAutoStart] = useState(false);
  /** Der Besucher hat eingegriffen und die Fuehrung uebernommen. */
  const [uebernommen, setUebernommen] = useState(false);
  const [willkommen, setWillkommen] = useState(false);
  const bekannt = useRef(false);
  const willkommenTimer = useRef<number | undefined>(undefined);
  // Weggeschickt (bleibt ueber Besuche hinweg). Gezeichnet wird erst nach der Verzoegerung, darum
  // kein Unterschied zwischen Server und erstem Client-Render.
  const [weg, setWeg] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return window.localStorage.getItem(WEG_MERKER) === "1";
    } catch {
      return false;
    }
  });

  // Bei jeder neuen Blase kurz sprechen (der Mund bewegt sich).
  const sprechTimer = useRef<number | undefined>(undefined);
  const sprich = useCallback(() => {
    setSpricht(true);
    window.clearTimeout(sprechTimer.current);
    sprechTimer.current = window.setTimeout(() => setSpricht(false), 1500);
  }, []);
  useEffect(
    () => () => {
      window.clearTimeout(sprechTimer.current);
      window.clearTimeout(willkommenTimer.current);
    },
    [],
  );

  const geheZu = useCallback(
    (neu: number) => {
      const s = TOUR_SCHRITTE[neu];
      if (!s) return;
      setSchritt(neu);
      setPhase("tour");
      setZiel(document.getElementById(s.anker));
      springeZu(s.anker);
      setHuepf((n) => n + 1);
      sprich();
    },
    [sprich],
  );

  const zumEnde = useCallback(() => {
    setPhase("ende");
    setZiel(null);
    setAuto(false);
    setAutoStart(false);
    merken("fertig");
    sprich();
  }, [sprich]);

  const starteTour = useCallback(() => {
    setAutoStart(false);
    setUebernommen(false);
    setAuto(!bewegungReduziert());
    geheZu(0);
  }, [geheZu]);

  const beenden = useCallback(() => {
    setPhase("still");
    setZiel(null);
    setAuto(false);
    setAutoStart(false);
    setUebernommen(false);
    merken("nein");
  }, []);

  /** Der Besucher greift ein: Himbi gibt die Fuehrung ab. */
  const uebernehmen = useCallback(() => {
    setAuto(false);
    setAutoStart(false);
    setUebernommen(true);
  }, []);

  // Erscheinen: neue Besucher werden begruesst (und die Tour startet gleich von selbst), wer die Tour
  // schon kennt oder abgelehnt hat, findet Himbi nur still in der Ecke.
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
      setAutoStart(!bewegungReduziert());
      sprich();
    }, ERSCHEINEN_NACH_MS + GRUSS_NACH_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
    };
  }, [sprich]);

  // Countdown der Begruessung: ohne Eingriff geht es von allein los.
  useEffect(() => {
    if (phase !== "gruss" || !autoStart) return;
    const id = window.setTimeout(starteTour, AUTOSTART_MS);
    return () => window.clearTimeout(id);
  }, [phase, autoStart, starteTour]);

  // Autopilot: nach der Verweildauer der Station zur naechsten.
  const aktuell = TOUR_SCHRITTE[schritt];
  const dauer = aktuell ? tourDauer(t(`tour.${aktuell.schluessel}.text`)) : 0;
  useEffect(() => {
    if (phase !== "tour" || !auto) return;
    const id = window.setTimeout(() => {
      if (schritt + 1 < TOUR_SCHRITTE.length) geheZu(schritt + 1);
      else zumEnde();
    }, dauer);
    return () => window.clearTimeout(id);
  }, [phase, auto, schritt, dauer, geheZu, zumEnde]);

  // Eingriffe des Besuchers waehrend Autopilot oder Countdown: Klick irgendwo ausser auf Himbi,
  // Mausrad, Wischen, Scroll-Tasten. Die eigene Fahrt (Sprunglink) loest davon nichts aus.
  useEffect(() => {
    const laeuft = (phase === "tour" && auto) || (phase === "gruss" && autoStart);
    if (!laeuft) return;
    const eingriff = (e: Event) => {
      const z = e.target;
      if (z instanceof Element && z.closest(".haustier")) return;
      uebernehmen();
    };
    const taste = (e: KeyboardEvent) => {
      if (SCROLL_TASTEN.has(e.key)) uebernehmen();
    };
    window.addEventListener("wheel", eingriff, { passive: true });
    window.addEventListener("touchstart", eingriff, { passive: true });
    window.addEventListener("pointerdown", eingriff, { passive: true });
    window.addEventListener("keydown", taste);
    return () => {
      window.removeEventListener("wheel", eingriff);
      window.removeEventListener("touchstart", eingriff);
      window.removeEventListener("pointerdown", eingriff);
      window.removeEventListener("keydown", taste);
    };
  }, [phase, auto, autoStart, uebernehmen]);

  // Tastatur: Pfeile links/rechts blaettern (das ist Steuern, also Uebernehmen), Escape beendet
  useEffect(() => {
    if (phase !== "tour") return;
    const beiTaste = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") {
        uebernehmen();
        if (schritt + 1 < TOUR_SCHRITTE.length) geheZu(schritt + 1);
        else zumEnde();
      } else if (e.key === "ArrowLeft" && schritt > 0) {
        uebernehmen();
        geheZu(schritt - 1);
      } else if (e.key === "Escape") beenden();
    };
    window.addEventListener("keydown", beiTaste);
    return () => window.removeEventListener("keydown", beiTaste);
  }, [phase, schritt, geheZu, zumEnde, beenden, uebernehmen]);

  if (!sichtbar) return null;

  const schickeWeg = () => {
    setWeg(true);
    setPhase("still");
    setZiel(null);
    setAuto(false);
    setAutoStart(false);
    try {
      window.localStorage.setItem(WEG_MERKER, "1");
    } catch {
      // ohne Speicher: gilt bis zum Neuladen
    }
  };
  const holeZurueck = () => {
    setWeg(false);
    try {
      window.localStorage.removeItem(WEG_MERKER);
    } catch {
      // egal
    }
    setWillkommen(true);
    window.clearTimeout(willkommenTimer.current);
    willkommenTimer.current = window.setTimeout(() => setWillkommen(false), WILLKOMMEN_MS);
    setPhase("gruss");
    setAutoStart(false);
    sprich();
  };

  if (weg) return <HimbiVersteck hoch label={t("zurueckholen")} onClick={holeZurueck} />;

  const zustand: HaustierZustand = phase === "ende" || willkommen ? "fertig" : spricht ? "spricht" : "ruhe";
  const letzter = schritt === TOUR_SCHRITTE.length - 1;
  const balken = (ms: number) => <div className="hb-fortschritt" key={`${phase}-${schritt}`} style={{ "--dauer": `${ms}ms` } as CSSProperties} aria-hidden />;

  let blase = null;
  if (phase === "gruss") {
    blase = (
      <>
        <p className="hb-blase__text">{t("tour.gruss")}</p>
        {autoStart ? <p className="hb-blase__klein">{t("tour.autoStart")}</p> : null}
        {autoStart ? balken(AUTOSTART_MS) : null}
        <div className="hb-blase__knoepfe">
          <button type="button" className="hb-knopf" onClick={starteTour}>
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
        {uebernommen && !auto ? <p className="hb-blase__klein">{t("tour.pausiert")}</p> : null}
        {auto ? (
          balken(dauer)
        ) : (
          <div className="hb-punkte" aria-hidden>
            {TOUR_SCHRITTE.map((s, i) => (
              <span key={s.schluessel} data-aktiv={i === schritt} data-getan={i < schritt} />
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
              if (letzter) zumEnde();
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
  } else if (phase === "ende") {
    blase = (
      <>
        <p className="hb-blase__text">{t("tour.ende")}</p>
        <div className="hb-blase__knoepfe">
          <Link href="/login" className="hb-knopf">
            {t("tour.anmelden")}
          </Link>
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={starteTour}>
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
      huepf={huepf}
      weg={{ onWeg: schickeWeg, halten: t("weg.halten"), tschuess: t("weg.tschuess"), hinweis: t("weg.hinweis") }}
      blickZiel={phase === "tour" ? ziel : null}
      onKlick={() => setPhase((p) => (p === "still" ? "gruss" : p === "gruss" ? "still" : p))}
    />
  );
}
