"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { Himbi } from "@/components/haustier/himbi";
import { Wellen } from "@/components/haustier/wellen";
import { useGriffBedienung } from "@/components/haustier/haustier-huelle-griff";
import { useAugen, useFolgtBlick, useHimbiPlatz, useHuepfer, useKonfetti, useTippZiel, useZeigerUndSchlaf } from "@/components/haustier/haustier-huelle-koerper";
import type { HaustierZustand, Inventar, Stimmung } from "@/lib/haustier";
import "@/components/haustier/haustier.css";

// Die schwebende Huelle um Himbi: Position (unten rechts, frei verschiebbar), Augen, Schlaf,
// Sprechblase, Abzeichen und Konfetti. Der Zustand kommt von aussen (Dashboard: aus dem
// Agenten, Startseite: aus der Tour), diese Huelle kuemmert sich um alles Koerperliche.
//
// Glatt bleibt es, weil nichts davon React-Zustand pro Frame ist:
// - Die Augen laufen in einer kleinen rAF-Schleife mit Daempfung und schreiben zwei
//   CSS-Variablen (--bx/--by).
// - Das Ziehen schreibt --hx/--hy direkt ins Element.
// - Alle Animationen sind transform/opacity in haustier.css.
//
// Seit dem 14.10.2026 zerlegt: Platz, Blick, Schlaf, Hüpfer und Konfetti stehen in haustier-huelle-koerper.ts, Ziehen, Klicken und
// Wegschicken in haustier-huelle-griff.ts. Hier bleiben der Zustand der Figur und das Markup.

const KONFETTI: Array<{ dx: number; dy: number; rot: number; farbe: string; verz: number }> = [
  { dx: -70, dy: -64, rot: -260, farbe: "#d81b60", verz: 0.1 },
  { dx: -48, dy: -92, rot: 200, farbe: "#ffd166", verz: 0.14 },
  { dx: -22, dy: -110, rot: -180, farbe: "#2fbf71", verz: 0.08 },
  { dx: 6, dy: -118, rot: 240, farbe: "#ff6f9a", verz: 0.16 },
  { dx: 34, dy: -104, rot: -220, farbe: "#ffd166", verz: 0.12 },
  { dx: 60, dy: -84, rot: 180, farbe: "#2fbf71", verz: 0.18 },
  { dx: 78, dy: -54, rot: -300, farbe: "#d81b60", verz: 0.1 },
  { dx: -84, dy: -28, rot: 220, farbe: "#ffffff", verz: 0.2 },
  { dx: 88, dy: -20, rot: -200, farbe: "#ff6f9a", verz: 0.22 },
  { dx: -58, dy: -78, rot: 300, farbe: "#2fbf71", verz: 0.26 },
  { dx: 48, dy: -96, rot: -260, farbe: "#ffd166", verz: 0.24 },
  { dx: -10, dy: -88, rot: 160, farbe: "#d81b60", verz: 0.28 },
];

export interface HaustierHuelleProps {
  /** Zustand aus Sicht des Aussenstehenden. "schlaeft" entscheidet die Huelle selbst (nach Leerlauf). */
  zustand: HaustierZustand;
  /** Wie die letzte Antwort klang. Liegt quer zum Zustand: faerbt nur Brauen, Wangen und
   *  eine kurze Reaktion, damit "denkt" trotzdem wie "denkt" aussieht. */
  stimmung?: Stimmung;
  blase?: ReactNode;
  paneOffen?: boolean;
  /** Beschriftung fuer Screenreader (Zustand in Worten). */
  label: string;
  onKlick: () => void;
  /** Element, auf das Himbi schaut (Tour): ueberstimmt Mauszeiger und Zustand. */
  blickZiel?: Element | null;
  /** Gesetzt: Himbi zieht nicht nur die Augen zu blickZiel, sondern die ganze Figur dorthin -
   *  fuer eine Fuehrung, die auf einen bestimmten Teil einer langen, scrollbaren Seite zeigt
   *  (Dashboard: Compliance-Tour, Live-Lauf-Hinweis). Ohne dieses Flag bleibt es beim reinen
   *  Blick, wie auf der oeffentlichen Startseite - dort bleibt die Figur bewusst in ihrer Ecke. */
  positionFolgtBlick?: boolean;
  /** Weiter oben ansetzen, damit Himbi nichts verdeckt, was unten rechts schon sitzt (Tonschalter der Startseite). */
  hoch?: boolean;
  /** Der Assistent steht in der Mitte: Himbi fliegt aus der Ecke ueber die Karte und
   *  waechst dabei. Blasen entfallen - der Chat steht direkt darunter. */
  buehne?: boolean;
  /** Zaehler: bei jeder Aenderung macht Himbi einen Huepfer (Tour: neue Station). */
  huepf?: number;
  /** Wegschicken durch Gedrueckt-Halten (oder Entf-Taste). Ohne diesen Eintrag laesst sich Himbi nicht wegschicken. */
  weg?: WegTexte;
  /** Ausgeblendet, aber nicht abgebaut: Position und Zustand bleiben erhalten
   *  (waehrend des Sprachmodus, Rueckmeldung vom 25.09.2026). */
  verborgen?: boolean;
  /** Gesetzt: die drei Sterne auf dem Chapan werden klickbar - alle drei rufen sie auf (himbi.tsx). */
  aufAbzeichen?: () => void;
  /** Gesetzt: die Anstecknadel auf der Kappe wird klickbar (himbi.tsx). */
  aufLogo?: () => void;
  /** Welche Tracht (0 bis 2, himbi.tsx TRACHTEN) und ob die Spassbrille sitzt. */
  inventar?: Inventar;
}

export interface WegTexte {
  onWeg: () => void;
  /** Blase waehrend des Haltens. */
  halten: string;
  /** Blase beim Abschied. */
  tschuess: string;
  /** Hinweis beim Ueberfahren. */
  hinweis: string;
}

export function HaustierHuelle({
  zustand,
  stimmung = "neutral",
  blase,
  paneOffen = false,
  label,
  onKlick,
  blickZiel,
  positionFolgtBlick = false,
  hoch = false,
  buehne = false,
  huepf = 0,
  weg,
  verborgen = false,
  aufAbzeichen,
  aufLogo,
  inventar,
}: HaustierHuelleProps) {
  const [schlaeft, setSchlaeft] = useState(false);
  const [halten, setHalten] = useState(false);
  const [abschied, setAbschied] = useState(false);
  const [erleichtert, setErleichtert] = useState(false);

  const basis: HaustierZustand = zustand === "ruhe" && schlaeft ? "schlaeft" : zustand;
  const anzeige: HaustierZustand = abschied || halten ? "traurig" : erleichtert ? "fertig" : basis;

  // Die Hooks in dieser Reihenfolge: so laufen ihre Effekte wie vorher, als sie hier standen.
  const platz = useHimbiPlatz(paneOffen);
  const { griff, versatz, bereit, seite, hoehe } = platz;
  const tippZiel = useTippZiel();
  // Eine Fuehrung (Tour) gewinnt: die zeigt etwas, das Tippen laeuft nebenher weiter.
  const schauZiel = blickZiel ?? tippZiel;
  const { blickZu, stoppeAugen } = useAugen(griff, anzeige, schauZiel);
  useFolgtBlick({ positionFolgtBlick, blickZiel, platz });
  useZeigerUndSchlaf({ griffRef: griff, anzeige, schauZiel, blickZu, stoppeAugen, setSchlaeft });
  const koerper = useHuepfer(huepf);
  const konfettiNr = useKonfetti(zustand);
  const { wurzel, zieht, beiZiehen, beiBewegen, beiLoslassen, beiTaste, zuruecksetzen } = useGriffBedienung({ weg, onKlick, platz, stand: { schlaeft, setSchlaeft, halten, setHalten, abschied, setAbschied, setErleichtert } });

  // Erst nach dem Mounten zeichnen: die gespeicherte Position und Einstellung kommen aus dem
  // Browser, ein Vorab-Render auf dem Server wuerde die Hydration verfehlen.
  if (!bereit) return null;

  return (
    <div
      ref={wurzel}
      className="haustier"
      hidden={verborgen}
      data-bereit={bereit}
      data-zustand={anzeige}
      data-seite={seite}
      data-hoehe={hoehe}
      data-pane-offen={paneOffen}
      data-buehne={buehne}
      data-zieht={zieht}
      data-hoch={hoch}
      data-halten={halten && !abschied}
      data-abschied={abschied}
    >
      <div className="haustier__verschiebung">
        <div ref={versatz} className="haustier__versatz">
          <HuellenBlase weg={weg} abschied={abschied} halten={halten} blase={blase} zieht={zieht} buehne={buehne} />
          <div
            ref={griff}
            className="haustier__griff"
            role="button"
            tabIndex={0}
            aria-label={label}
            title={label}
            onPointerDown={beiZiehen}
            onPointerMove={beiBewegen}
            onPointerUp={beiLoslassen}
            onPointerCancel={beiLoslassen}
            onKeyDown={beiTaste}
            onDoubleClick={zuruecksetzen}
          >
            <GriffUnterlage buehne={buehne} anzeige={anzeige} halten={halten} abschied={abschied} weg={weg} blase={blase} />
            <div className="hb" ref={koerper}>
              <Himbi
                zustand={anzeige}
                stimmung={stimmung}
                aufAbzeichen={aufAbzeichen}
                aufLogo={aufLogo}
                tracht={inventar?.tracht}
                brille={inventar?.brille}
              />
            </div>
            <GriffZeichen anzeige={anzeige} zustand={zustand} konfettiNr={konfettiNr} />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Die Sprechblase: beim Halten und beim Abschied die eigenen Worte, sonst die Blase von aussen; nicht beim Ziehen und nicht auf der Bühne. */
function HuellenBlase({
  weg,
  abschied,
  halten,
  blase,
  zieht,
  buehne,
}: {
  weg: WegTexte | undefined;
  abschied: boolean;
  halten: boolean;
  blase: ReactNode;
  zieht: boolean;
  buehne: boolean;
}) {
  const eigeneBlase = weg ? (abschied ? weg.tschuess : halten ? weg.halten : null) : null;
  return (eigeneBlase || blase) && !zieht && !buehne ? (
    <div className="hb-blase" role="status" aria-live="polite">
      {eigeneBlase ? <p className="hb-blase__text">{eigeneBlase}</p> : blase}
    </div>
  ) : null;
}

/** Was im Griff vor der Figur liegt: Aura der Bühne, Schatten, Ring beim Halten, Hinweis zum Wegschicken. */
function GriffUnterlage({
  buehne,
  anzeige,
  halten,
  abschied,
  weg,
  blase,
}: {
  buehne: boolean;
  anzeige: HaustierZustand;
  halten: boolean;
  abschied: boolean;
  weg: WegTexte | undefined;
  blase: ReactNode;
}) {
  return (
    <>
      {buehne ? (
        <span className="hb-aura" aria-hidden>
          <span className="hb-aura__blob hb-aura__blob--1" />
          <span className="hb-aura__blob hb-aura__blob--2" />
          <span className="hb-aura__blob hb-aura__blob--3" />
          <Wellen zustand={anzeige} />
          <span className="hb-aura__ring" />
          <span className="hb-aura__ring hb-aura__ring--spaet" />
        </span>
      ) : null}
      <span className="hb-schatten haustier__schatten-anim" aria-hidden />
      {halten && !abschied ? (
        <svg className="hb-ring" viewBox="0 0 120 120" aria-hidden>
          <circle className="hb-ring__spur" cx="60" cy="60" r="54" />
          <circle className="hb-ring__lauf" cx="60" cy="60" r="54" />
        </svg>
      ) : null}
      {weg && !blase && !halten ? (
        <span className="hb-hinweis" aria-hidden>
          {weg.hinweis}
        </span>
      ) : null}
    </>
  );
}

/** Was nach der Figur im Griff liegt: Abzeichen fuer Freigabe und Fertig, Schlaf-Zs und Konfetti. */
function GriffZeichen({ anzeige, zustand, konfettiNr }: { anzeige: HaustierZustand; zustand: HaustierZustand; konfettiNr: number }) {
  return (
    <>
      {anzeige === "freigabe" ? <span className="hb-abzeichen">!</span> : null}
      {zustand === "fertig" ? <span className="hb-abzeichen hb-abzeichen--fertig">✓</span> : null}
      {anzeige === "schlaeft" ? (
        <span className="hb-zzz" aria-hidden>
          <span>z</span>
          <span>z</span>
          <span>Z</span>
        </span>
      ) : null}
      {konfettiNr > 0 && zustand === "fertig" ? (
        <span key={konfettiNr} className="hb-konfetti" aria-hidden>
          {KONFETTI.map((k, i) => (
            <span
              key={i}
              style={{ "--dx": `${k.dx}px`, "--dy": `${k.dy}px`, "--rot": `${k.rot}deg`, "--farbe": k.farbe, "--verz": `${k.verz}s` } as CSSProperties}
            />
          ))}
        </span>
      ) : null}
    </>
  );
}
