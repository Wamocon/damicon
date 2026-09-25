"use client";

import { useCallback, useEffect, useReducer, useRef, type CSSProperties, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useCeoPruefung } from "@/components/dashboard/ceo-pruefung-kontext";
import type { AufklappbarSteuerung } from "@/components/dashboard/compliance-tour-kontext";
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
 *  .pr-aufklappbar) - zeigt die Tour dorthin, waere die Hervorhebung sonst leer. Oeffnet ueber
 *  die typisierte AufklappbarSteuerung, die die Bereichsuebersicht bei der Tour anmeldet
 *  (compliance-tour-kontext.tsx) - keine DOM-Suche, kein simulierter Klick mehr. Gibt true
 *  zurueck, wenn die Tour selbst geoeffnet hat (fuer das spaetere Wiederzuklappen). */
function oeffneFallsZugeklappt(anker: string, steuerung: AufklappbarSteuerung | null): boolean {
  if (!steuerung || !steuerung.istZu(anker)) return false;
  steuerung.setOffen(anker, true);
  return true;
}

/** Nur zuklappen, was die Tour selbst geoeffnet hat, siehe geoeffnetVonTour unten. Ein
 *  Zuklappen, das schon zugeklappt ist (der Mensch kann waehrend der Tour selbst schon
 *  zugeklappt haben), aendert an der Steuerung nichts. */
function schliesseWiederZu(anker: string, steuerung: AufklappbarSteuerung | null): void {
  steuerung?.setOffen(anker, false);
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

// ---- Die Zustandsmaschine der Tour selbst ----------------------------------------------------
// Phase, welche Station, Autopilot an/aus, ob uebernommen wurde, das Sprungziel und der
// Huepf-Zaehler in EINEM Objekt statt sechs einzelnen useState-Aufrufen - jede Aenderung laeuft
// ueber eine der folgenden, benannten Aktionen und ist an EINER Stelle (tourReduzierer)
// nachlesbar, statt ueber verstreute setX-Aufrufe in jedem einzelnen Callback und Effekt.
interface TourZustand {
  phase: Phase;
  schritt: number;
  auto: boolean;
  uebernommen: boolean;
  ziel: Element | null;
  huepf: number;
}

const ANFANGSZUSTAND: TourZustand = { phase: "aus", schritt: 0, auto: false, uebernommen: false, ziel: null, huepf: 0 };

type TourAktion =
  | { art: "angebot_zeigen" }
  | { art: "angebot_abgelehnt" }
  | { art: "gestartet"; auto: boolean; ziel: Element | null }
  | { art: "schritt_gewechselt"; schritt: number; ziel: Element | null }
  | { art: "uebernommen" }
  | { art: "automatik_fortgesetzt" }
  | { art: "beendet" }
  | { art: "zurueckgesetzt" };

function tourReduzierer(z: TourZustand, a: TourAktion): TourZustand {
  switch (a.art) {
    case "angebot_zeigen":
      return { ...z, phase: "frage" };
    case "angebot_abgelehnt":
      return { ...z, phase: "aus" };
    case "gestartet":
      return { ...z, phase: "laeuft", schritt: 0, auto: a.auto, uebernommen: false, ziel: a.ziel, huepf: z.huepf + 1 };
    case "schritt_gewechselt":
      return { ...z, schritt: a.schritt, ziel: a.ziel, huepf: z.huepf + 1 };
    case "uebernommen":
      return { ...z, auto: false, uebernommen: true };
    case "automatik_fortgesetzt":
      return { ...z, auto: true, uebernommen: false };
    case "beendet":
      return { ...z, phase: "fertig", ziel: null, auto: false };
    case "zurueckgesetzt":
      return { ...z, phase: "aus" };
  }
}

// ---- Sprechblasen: reine Darstellung ----------------------------------------------------------
// Drei kleine, einzeln benannte Bausteine statt einer langen JSX-Kaskade mitten in der
// Zustandsmaschine unten - jeder bekommt fertige Texte und Callbacks und weiss selbst nichts von
// Phasen, Timern oder dem DOM. Echte Komponenten (als <Komponente p={...}/> gerendert, nicht als
// Funktion aufgerufen): die Callbacks (starten/geheZu/beenden/...) haengen an Himbis
// Koordinations-Refs (entschieden, geoeffnetVonTour, ...) - als JSX-Props gereicht, bleibt fuer
// die statische Ref-Sicherheitspruefung erkennbar, dass sie nur als Ereignis-Handler verwendet
// werden, nie synchron waehrend des Renderns gelesen.

function AngebotBlase({ p }: { p: { frage: string; start: string; nein: string; onStarten: () => void; onAblehnen: () => void } }): ReactNode {
  return (
    <>
      <p className="hb-blase__text">{p.frage}</p>
      <div className="hb-blase__knoepfe">
        <button type="button" className="hb-knopf" onClick={p.onStarten}>
          {p.start}
        </button>
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onAblehnen}>
          {p.nein}
        </button>
      </div>
    </>
  );
}

interface LaufBlaseDaten {
  phase: Phase;
  aktuell: ComplianceTourSchritt;
  schritt: number;
  schritte: ComplianceTourSchritt[];
  letzter: boolean;
  auto: boolean;
  uebernommen: boolean;
  dauer: number;
  texte: { pausiert: string; zurueck: string; weiter: string; fertigKnopf: string; pause: string; auto: string; beenden: string };
  onZurueck: () => void;
  onWeiterOderBeenden: () => void;
  onPause: () => void;
  onAutoFortsetzen: () => void;
  onBeenden: () => void;
}

function LaufBlase({ p }: { p: LaufBlaseDaten }): ReactNode {
  return (
    <>
      <p className="hb-blase__text">{p.aktuell.titel}</p>
      <p className="hb-blase__klein" style={{ fontSize: "0.78rem", lineHeight: "1.2rem" }}>
        {p.aktuell.text}
      </p>
      {p.uebernommen && !p.auto ? <p className="hb-blase__klein">{p.texte.pausiert}</p> : null}
      {p.auto ? (
        <div className="hb-fortschritt" key={`${p.phase}-${p.schritt}`} style={{ "--dauer": `${p.dauer}ms` } as CSSProperties} aria-hidden />
      ) : (
        <div className="hb-punkte" aria-hidden>
          {p.schritte.map((s, i) => (
            <span key={s.anker} data-aktiv={i === p.schritt} data-getan={i < p.schritt} />
          ))}
        </div>
      )}
      <div className="hb-blase__knoepfe">
        {p.schritt > 0 && !p.auto ? (
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onZurueck}>
            {p.texte.zurueck}
          </button>
        ) : null}
        <button type="button" className="hb-knopf" onClick={p.onWeiterOderBeenden}>
          {p.letzter ? p.texte.fertigKnopf : p.texte.weiter}
        </button>
        {p.auto ? (
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onPause}>
            {p.texte.pause}
          </button>
        ) : (
          <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onAutoFortsetzen}>
            {p.texte.auto}
          </button>
        )}
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onBeenden}>
          {p.texte.beenden}
        </button>
      </div>
    </>
  );
}

interface EndeBlaseDaten {
  texte: { ende: string; nachfrage: string; besprechen: string; plan: string; fertigKnopf: string };
  onBesprechen: () => void;
  onPlan: () => void;
  onFertig: () => void;
}

function EndeBlase({ p }: { p: EndeBlaseDaten }): ReactNode {
  return (
    <>
      <p className="hb-blase__text">{p.texte.ende}</p>
      <p className="hb-blase__klein">{p.texte.nachfrage}</p>
      <div className="hb-blase__knoepfe">
        <button type="button" className="hb-knopf" onClick={p.onBesprechen}>
          {p.texte.besprechen}
        </button>
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onPlan}>
          {p.texte.plan}
        </button>
        <button type="button" className="hb-knopf hb-knopf--leise" onClick={p.onFertig}>
          {p.texte.fertigKnopf}
        </button>
      </div>
    </>
  );
}

export function useComplianceTour(
  schritte: ComplianceTourSchritt[] | null,
  bezug: PruefBezug | null,
  steuerung: AufklappbarSteuerung | null,
): ComplianceTourAnzeige {
  const t = useTranslations("haustier");
  const tc = useTranslations("ceoUebersicht");
  const tp = useTranslations("pruefung");
  const ceoStand = useCeoPruefung();
  // Himbi ist abgestellt (Einstellungen) oder weggeschickt (Griff halten/Entf): dann gibt es
  // keine Huelle, die die Tour zeigen koennte - weder Angebot noch automatischer Start, sonst
  // wuerde die Seite unsichtbar gesteuert scrollen und Abschnitte auf- und zuklappen, ohne dass
  // zu sehen waere, wer das tut oder warum.
  // autoStart: Tour UND Zusammenfassung starten nach einer Pruefung von selbst (samt dem
  // einmaligen Angebot). Aus heisst: nichts startet von selbst - die Knoepfe in der Uebersicht
  // ("Tour erneut starten", "Zusammenfassung im Chat") bleiben, sie rufen starten() bzw.
  // zusammenfassen() direkt und fragen den Schalter nicht.
  const { an: himbiAn, weg: himbiWeg, tourAn, autoStart } = useHaustierStatus();
  const himbiSichtbar = himbiAn && !himbiWeg;
  const { starteGespraechZurPruefung } = useKiPane();
  const besprechen = useCallback(
    (frage: string) => {
      if (bezug) starteGespraechZurPruefung(bezug, frage);
    },
    [bezug, starteGespraechZurPruefung],
  );
  // Dieselbe Frage wie der Knopf "Ergebnis mit Himbi besprechen" am Ende der Tour
  // (EndeBlase unten): beide sollen zur gleich ausfuehrlichen Antwort fuehren, nicht zu einer
  // kuerzeren Sonderfassung nur fuer den automatischen Anstoss.
  const zusammenfassen = useCallback(() => besprechen(tp("nachbereitung.frageStart")), [besprechen, tp]);

  const [zustand, dispatch] = useReducer(tourReduzierer, ANFANGSZUSTAND);
  const { phase, schritt, auto, uebernommen, ziel, huepf } = zustand;

  // Drei Koordinations-Flaggen, bewusst als Refs statt als Teil der Zustandsmaschine oben: jede
  // wird NUR innerhalb eines Effekts gelesen, der aus einem anderen Grund ohnehin schon laeuft
  // (Himbi sichtbar? Stationen da? CEO-Phase gewechselt?) - keine der drei soll fuer sich
  // genommen einen weiteren Durchlauf ausloesen, sonst kaeme z. B. das Angebot ein zweites Mal,
  // nur weil "entschieden" sich geaendert hat, statt weil eine der eigentlichen Bedingungen das
  // verlangt. Ausgeschrieben statt anonymer Booleans irgendwo im Code, damit auf einen Blick klar
  // ist, wofuer jede einzelne steht:
  const entschieden = useRef(false); // das einmalige Angebot wurde schon gezeigt oder abgelehnt (Sitzung).
  const wartetAufAutostart = useRef(false); // der automatische CEO-Check ist fertig, die Tour soll von selbst loslaufen, sobald die Stationen bereitstehen.
  const zusammenfassenNachTour = useRef(false); // nur beim ECHTEN automatischen Lauf gesetzt: nach beenden() soll zusaetzlich die Chat-Zusammenfassung folgen, bei einem manuellen Neustart ueber den Knopf dagegen nicht.
  // Welche Aufklappbaren die Tour selbst geoeffnet hat (fuer das Wiederzuklappen beim Verlassen,
  // schliesseGeoeffnete unten) - ein Set veraenderlichen Inhalts, keine Ja/Nein-Flagge, deshalb
  // bewusst kein Reducer-Feld, sondern wie bisher eine eigene, unabhaengige Buchfuehrung.
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
    if (!autoStart || !tourAn || !himbiSichtbar || !schritte || schritte.length === 0 || entschieden.current || phase !== "aus") return;
    const id = window.setTimeout(() => dispatch({ art: "angebot_zeigen" }), ANGEBOT_VERZOEGERUNG_MS);
    return () => window.clearTimeout(id);
  }, [autoStart, tourAn, himbiSichtbar, schritte, phase]);

  const merken = useCallback(() => {
    entschieden.current = true;
    try {
      window.sessionStorage.setItem(ANGEBOT_SCHLUESSEL, "1");
    } catch {
      // ohne Speicher: gilt nur bis zum Neuladen
    }
  }, []);

  // Scrollt zum Ziel und oeffnet ein zugeklapptes Aufklappbar bei Bedarf - reiner Seiteneffekt,
  // liefert nur das gefundene DOM-Element fuer Himbis Blickziel zurueck. Die eigentliche
  // Zustandsaenderung (schritt/ziel/huepf) macht immer der Aufrufer per dispatch.
  const zuAnkerSpringen = useCallback(
    (neu: number): Element | null => {
      const s = schritte?.[neu];
      if (!s) return null;
      const ziel = document.getElementById(s.anker);
      if (ziel && oeffneFallsZugeklappt(s.anker, steuerung)) geoeffnetVonTour.current.add(s.anker);
      springeZuAnker(s.anker, { bewegungReduziert: bewegungReduziert() });
      return ziel;
    },
    [schritte, steuerung],
  );

  const geheZu = useCallback(
    (neu: number) => {
      if (!schritte?.[neu]) return;
      const ziel = zuAnkerSpringen(neu);
      dispatch({ art: "schritt_gewechselt", schritt: neu, ziel });
    },
    [schritte, zuAnkerSpringen],
  );

  // Beim Verlassen der Tour (Ende erreicht oder abgebrochen) alles wieder zuklappen, was sie
  // selbst aufgeklappt hat - die Seite soll danach wieder so kompakt aussehen wie zuvor.
  const schliesseGeoeffnete = useCallback(() => {
    geoeffnetVonTour.current.forEach((anker) => schliesseWiederZu(anker, steuerung));
    geoeffnetVonTour.current.clear();
  }, [steuerung]);

  const beenden = useCallback(() => {
    dispatch({ art: "beendet" });
    schliesseGeoeffnete();
    // Zurueck an den Seitenanfang - sonst bliebe man dort stehen, wo die letzte Station war
    // (haeufig weit unten bei den Einschraenkungen), statt wieder beim Gesamtbild zu landen.
    window.scrollTo({ top: 0, behavior: bewegungReduziert() ? "auto" : "smooth" });
    // Siehe zusammenfassenNachTour oben: erst HIER, nicht beim Start, sonst oeffnet das
    // Seitenpanel waehrend die Tour noch selbst durch die Seite scrollt - der Platz, den es
    // wegnimmt, verschiebt das Layout und damit jedes noch bevorstehende Sprungziel der Tour.
    if (zusammenfassenNachTour.current) {
      zusammenfassenNachTour.current = false;
      zusammenfassen();
    }
  }, [schliesseGeoeffnete, zusammenfassen]);

  const starten = useCallback(() => {
    merken();
    const ziel = zuAnkerSpringen(0);
    dispatch({ art: "gestartet", auto: !bewegungReduziert(), ziel });
  }, [merken, zuAnkerSpringen]);

  const ablehnen = useCallback(() => {
    merken();
    dispatch({ art: "angebot_abgelehnt" });
  }, [merken]);

  const uebernehmen = useCallback(() => dispatch({ art: "uebernommen" }), []);

  // Der automatische Hintergrund-Check ist gerade zu Ende gegangen (der CEO hat den Live-Lauf
  // schon gesehen, siehe haustier-dashboard.tsx) - sobald der neue Bericht mit seinen Stationen
  // bereitsteht, startet die Tour von selbst, ohne vorher zu fragen. Nur einmal je Sitzung
  // (entschieden), genau wie das Angebot, das sie hier ersetzt.
  const vorigeCeoPhase = useRef(ceoStand?.phase);
  useEffect(() => {
    if (vorigeCeoPhase.current === "laeuft" && ceoStand?.phase === "fertig") wartetAufAutostart.current = true;
    vorigeCeoPhase.current = ceoStand?.phase;
  }, [ceoStand?.phase]);
  useEffect(() => {
    if (!wartetAufAutostart.current) return;
    if (!autoStart) {
      // Der Nutzer will keinen automatischen Start: die Gelegenheit verfaellt, kein
      // spaeteres Nachholen, wenn er den Schalter wieder einschaltet.
      wartetAufAutostart.current = false;
      return;
    }
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
      // danach fragen muss - aber erst wenn die Tour selbst fertig ist (beenden() oben), sonst
      // unterbricht das oeffnende Seitenpanel die noch laufende Tour (gemeldet am 23.09.2026).
      zusammenfassenNachTour.current = true;
      starten();
    }, 0);
    return () => window.clearTimeout(id);
  }, [autoStart, tourAn, himbiSichtbar, schritte, phase, starten, zusammenfassen, merken]);

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

  const frageBlase = (
    <AngebotBlase
      p={{
        frage: tc("tour.frage"),
        start: t("tour.start"),
        nein: t("tour.nein"),
        onStarten: starten,
        onAblehnen: ablehnen,
      }}
    />
  );

  let tourBlase: ReactNode = null;
  if (phase === "laeuft" && aktuell && schritte) {
    tourBlase = (
      <LaufBlase
        p={{
          phase,
          aktuell,
          schritt,
          schritte,
          letzter,
          auto,
          uebernommen,
          dauer,
          texte: {
            pausiert: t("tour.pausiert"),
            zurueck: t("tour.zurueck"),
            weiter: t("tour.weiter"),
            fertigKnopf: t("tour.fertigKnopf"),
            pause: t("tour.pause"),
            auto: t("tour.auto"),
            beenden: t("tour.beenden"),
          },
          onZurueck: () => {
            uebernehmen();
            geheZu(schritt - 1);
          },
          onWeiterOderBeenden: () => {
            uebernehmen();
            if (letzter) beenden();
            else geheZu(schritt + 1);
          },
          onPause: uebernehmen,
          onAutoFortsetzen: () => dispatch({ art: "automatik_fortgesetzt" }),
          onBeenden: beenden,
        }}
      />
    );
  } else if (phase === "fertig") {
    tourBlase = (
      <EndeBlase
        p={{
          texte: {
            ende: tc("tour.ende"),
            nachfrage: tc("tour.nachfrage"),
            besprechen: tp("nachbereitung.besprechen"),
            plan: tp("nachbereitung.plan"),
            fertigKnopf: t("tour.fertigKnopf"),
          },
          onBesprechen: () => {
            dispatch({ art: "zurueckgesetzt" });
            besprechen(tp("nachbereitung.frageStart"));
          },
          onPlan: () => {
            dispatch({ art: "zurueckgesetzt" });
            besprechen(tp("nachbereitung.fragePlan"));
          },
          onFertig: () => dispatch({ art: "zurueckgesetzt" }),
        }}
      />
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
