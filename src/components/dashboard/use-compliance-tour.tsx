"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import { useHaustierStatus } from "@/components/haustier/haustier-kontext";
import { useKiPane, type PruefBezug } from "@/components/ki/ki-pane-kontext";
import { bewegungReduziert } from "@/lib/bewegung";
import { springeZuAnker, tourDauer, type HaustierZustand } from "@/lib/haustier";

// Himbis Fuehrung durch die vier Complianceprüfungen auf der CEO-Startseite: dasselbe
// Drehbuch-Prinzip wie die Tour auf der oeffentlichen Startseite (haustier-tour.tsx) - Station
// fuer Station, mit Autopilot und Fortschrittsbalken - aber mit LEBENDIGEM statt festem Text
// (die Stationen kommen aus dem aktuellen Bericht, ueber den Parameter schritte statt aus
// fester Konfiguration) und ohne eigene Figur: sie nutzt die Huelle mit, die HaustierDashboard
// ohnehin schon zeigt. Deshalb liefert dieser Hook keine <HaustierHuelle>, sondern nur das, was
// HaustierDashboard in ihre Blase, ihren Zustand und ihr Blickziel einmischen muss.
//
// Gerufen wird dieser Hook NICHT direkt von HaustierDashboard, sondern einmal zentral aus
// compliance-tour-kontext.tsx (ComplianceTourProvider) - so kann auch ein Neustart-Knopf an
// ganz anderer Stelle (ceo-bereichs-kacheln.tsx) dieselbe, eine Tour steuern.

export interface ComplianceTourSchritt {
  /** id des Abschnitts, zu dem gescrollt wird (Kopfkarte, eine Bereichs-Kachel, Massnahmen, Einschraenkungen). */
  anker: string;
  titel: string;
  text: string;
}

const ANGEBOT_SCHLUESSEL = "damicon-compliance-tour";
const ANGEBOT_VERZOEGERUNG_MS = 6500;

/** Massnahmenplan und Einschraenkungen stehen zugeklappt (ceo-bereichs-kacheln.tsx,
 *  .pr-aufklappbar) - zeigt die Tour dorthin, waere die Hervorhebung sonst leer. Ein Klick auf
 *  den Aufklapp-Kopf ist derselbe Weg, den auch ein Mensch ginge, kein eigener Zustand noetig.
 *  Gibt die id zurueck, wenn die Tour selbst geoeffnet hat (fuer das spaetere Wiederzuklappen). */
function oeffneFallsZugeklappt(ziel: Element): string | null {
  const zugeklappt = ziel.closest('.pr-aufklappbar[data-offen="false"]');
  if (!zugeklappt || !zugeklappt.id) return null;
  zugeklappt.querySelector<HTMLButtonElement>(".pr-aufklappbar__kopf")?.click();
  return zugeklappt.id;
}

/** Nur zuklappen, was noch offen ist - der Mensch kann es waehrend der Tour selbst schon
 *  zugeklappt haben, dann gibt es nichts mehr zu tun. */
function schliesseWiederZu(anker: string): void {
  const el = document.getElementById(anker);
  if (el?.getAttribute("data-offen") === "true") el.querySelector<HTMLButtonElement>(".pr-aufklappbar__kopf")?.click();
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
  /** Es gibt einen Bericht mit Stationen UND Himbi ist zu sehen - der Knopf "Zusammenfassung im
   *  Chat" darf angezeigt werden (ohne sichtbare Figur gaebe es niemanden, der sie anbietet). */
  verfuegbar: boolean;
  /** Zusaetzlich: die gefuehrte Tour selbst ist in den Einstellungen nicht abgestellt - nur dann
   *  darf auch ein Neustart-Knopf fuer die Tour erscheinen (haustier-einstellung.tsx). */
  tourVerfuegbar: boolean;
  /** Die Tour von vorn beginnen - fuer das Angebot, den automatischen Start und einen
   *  jederzeit erreichbaren Neustart-Knopf (dieselbe Funktion fuer alle drei). */
  starten: () => void;
  /** Oeffnet den KI-Chat im Seitenpanel und laesst Himbi das Ergebnis dort zusammenfassen,
   *  mit anklickbaren Verweisen auf die Kacheln (oeffnePruefBereich, route.ts). Fuer den
   *  automatischen Lauf nach einer frischen Pruefung UND einen jederzeit erreichbaren Knopf. */
  zusammenfassen: () => void;
}

export function useComplianceTour(schritte: ComplianceTourSchritt[] | null, bezug: PruefBezug | null): ComplianceTourAnzeige {
  const t = useTranslations("haustier");
  const tc = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");
  const ceoStand = useCeoPruefung();
  // Himbi ist abgestellt (Einstellungen) oder weggeschickt (Griff halten/Entf): dann gibt es
  // keine Huelle, die die Tour zeigen koennte - weder Angebot noch automatischer Start, sonst
  // wuerde die Seite unsichtbar gesteuert scrollen und Abschnitte auf- und zuklappen, ohne dass
  // zu sehen waere, wer das tut oder warum.
  const { an: himbiAn, weg: himbiWeg, tourAn } = useHaustierStatus();
  const himbiSichtbar = himbiAn && !himbiWeg;
  const { starteGespraechZurPruefung } = useKiPane();
  const besprechen = useCallback(
    (frage: string) => {
      if (bezug) starteGespraechZurPruefung(bezug, frage);
    },
    [bezug, starteGespraechZurPruefung],
  );
  // Dieselbe Frage wie der Knopf "Ergebnis mit Himbi besprechen" am Ende der Tour
  // (tourBlase unten): beide sollen zur gleich ausfuehrlichen Antwort fuehren, nicht zu einer
  // kuerzeren Sonderfassung nur fuer den automatischen Anstoss.
  const zusammenfassen = useCallback(() => besprechen(tp("nachbereitung.frageStart")), [besprechen, tp]);

  const [phase, setPhase] = useState<Phase>("aus");
  const [schritt, setSchritt] = useState(0);
  const [auto, setAuto] = useState(false);
  const [uebernommen, setUebernommen] = useState(false);
  const [ziel, setZiel] = useState<Element | null>(null);
  const [huepf, setHuepf] = useState(0);
  const entschieden = useRef(false);
  const geoeffnetVonTour = useRef<Set<string>>(new Set());

  useEffect(() => {
    try {
      entschieden.current = window.sessionStorage.getItem(ANGEBOT_SCHLUESSEL) !== null;
    } catch {
      // ohne Speicher: das Angebot kommt in dieser Sitzung jedes Mal neu, das ist verkraftbar
    }
  }, []);

  // Sobald Stationen da sind (und noch nicht entschieden), nach kurzer Verzoegerung anbieten -
  // aber nur, wenn Himbi ueberhaupt zu sehen ist (sonst gaebe es niemanden, der fragt) und die
  // Tour in den Einstellungen nicht abgestellt ist (dann gibt es nichts anzubieten).
  useEffect(() => {
    if (!tourAn || !himbiSichtbar || !schritte || schritte.length === 0 || entschieden.current || phase !== "aus") return;
    const id = window.setTimeout(() => setPhase("frage"), ANGEBOT_VERZOEGERUNG_MS);
    return () => window.clearTimeout(id);
  }, [tourAn, himbiSichtbar, schritte, phase]);

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
      const ziel = document.getElementById(s.anker);
      setZiel(ziel);
      if (ziel) {
        const geoeffnet = oeffneFallsZugeklappt(ziel);
        if (geoeffnet) geoeffnetVonTour.current.add(geoeffnet);
      }
      springeZuAnker(s.anker, { bewegungReduziert: bewegungReduziert() });
      setHuepf((n) => n + 1);
    },
    [schritte],
  );

  // Beim Verlassen der Tour (Ende erreicht oder abgebrochen) alles wieder zuklappen, was sie
  // selbst aufgeklappt hat - die Seite soll danach wieder so kompakt aussehen wie zuvor.
  const schliesseGeoeffnete = useCallback(() => {
    geoeffnetVonTour.current.forEach(schliesseWiederZu);
    geoeffnetVonTour.current.clear();
  }, []);

  const beenden = useCallback(() => {
    setPhase("fertig");
    setZiel(null);
    setAuto(false);
    schliesseGeoeffnete();
    // Zurueck an den Seitenanfang - sonst bliebe man dort stehen, wo die letzte Station war
    // (haeufig weit unten bei den Einschraenkungen), statt wieder beim Gesamtbild zu landen.
    window.scrollTo({ top: 0, behavior: bewegungReduziert() ? "auto" : "smooth" });
    // Siehe zusammenfassenNachTour weiter unten: erst HIER, nicht beim Start, sonst oeffnet das
    // Seitenpanel waehrend die Tour noch selbst durch die Seite scrollt - der Platz, den es
    // wegnimmt, verschiebt das Layout und damit jedes noch bevorstehende Sprungziel der Tour.
    if (zusammenfassenNachTour.current) {
      zusammenfassenNachTour.current = false;
      zusammenfassen();
    }
  }, [schliesseGeoeffnete, zusammenfassen]);

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

  // Der automatische Hintergrund-Check ist gerade zu Ende gegangen (der CEO hat den Live-Lauf
  // schon gesehen, siehe haustier-dashboard.tsx) - sobald der neue Bericht mit seinen Stationen
  // bereitsteht, startet die Tour von selbst, ohne vorher zu fragen. Nur einmal je Sitzung
  // (entschieden), genau wie das Angebot, das sie hier ersetzt.
  const wartetAufAutostart = useRef(false);
  // Gesetzt zusammen mit dem automatischen Start, siehe unten - beenden() fragt es ab und
  // loescht es wieder, damit ein spaeterer manueller Neustart (Knopf "Tour erneut starten")
  // KEINE zweite automatische Zusammenfassung nach sich zieht: nur der eine, echte automatische
  // Lauf nach einer frischen Pruefung soll das ausloesen.
  const zusammenfassenNachTour = useRef(false);
  const vorigeCeoPhase = useRef(ceoStand?.phase);
  useEffect(() => {
    if (vorigeCeoPhase.current === "laeuft" && ceoStand?.phase === "fertig") wartetAufAutostart.current = true;
    vorigeCeoPhase.current = ceoStand?.phase;
  }, [ceoStand?.phase]);
  useEffect(() => {
    if (!wartetAufAutostart.current) return;
    if (!himbiSichtbar) {
      // Himbi ist gerade nicht zu sehen - die Gelegenheit ist vorbei, kein spaeteres Nachholen,
      // wenn sie wieder eingeschaltet wird (das wirkte sonst wie ein zufaelliges Aufpoppen).
      wartetAufAutostart.current = false;
      return;
    }
    if (entschieden.current || !schritte || schritte.length === 0 || phase !== "aus") return;
    const id = window.setTimeout(() => {
      wartetAufAutostart.current = false;
      if (!tourAn) {
        // In den Einstellungen abgestellt: kein Herumspringen und Hervorheben, aber dieselbe
        // Gelegenheit soll trotzdem nicht ungenutzt verstreichen - direkt die Zusammenfassung im
        // Chat, ohne den Umweg ueber eine Tour, die ohnehin nicht laufen soll. merken() haelt wie
        // sonst auch fest, dass diese Gelegenheit schon "entschieden" ist.
        merken();
        zusammenfassen();
        return;
      }
      // Zusaetzlich zur Tour (Anfrage vom 23.09.2026): dieselbe Gelegenheit, ohne dass jemand
      // danach fragen muss - aber erst wenn die Tour selbst fertig ist (beenden() unten), sonst
      // unterbricht das oeffnende Seitenpanel die noch laufende Tour (gemeldet am 23.09.2026).
      zusammenfassenNachTour.current = true;
      starten();
    }, 0);
    return () => window.clearTimeout(id);
  }, [tourAn, himbiSichtbar, schritte, phase, starten, zusammenfassen, merken]);

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
        <p className="hb-blase__klein">{tc("tour.nachfrage")}</p>
        <div className="hb-blase__knoepfe">
          <button
            type="button"
            className="hb-knopf"
            onClick={() => {
              setPhase("aus");
              besprechen(tp("nachbereitung.frageStart"));
            }}
          >
            {tp("nachbereitung.besprechen")}
          </button>
          <button
            type="button"
            className="hb-knopf hb-knopf--leise"
            onClick={() => {
              setPhase("aus");
              besprechen(tp("nachbereitung.fragePlan"));
            }}
          >
            {tp("nachbereitung.plan")}
          </button>
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
    verfuegbar: himbiSichtbar && !!schritte && schritte.length > 0,
    tourVerfuegbar: tourAn && himbiSichtbar && !!schritte && schritte.length > 0,
    starten,
    zusammenfassen,
  };
}
