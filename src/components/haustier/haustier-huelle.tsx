"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { Himbi } from "@/components/haustier/himbi";
import { Wellen } from "@/components/haustier/wellen";
import type { HaustierZustand, Inventar, Stimmung } from "@/lib/haustier";
import { BLICK_DENKT, blickRichtung } from "@/lib/haustier";
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

const POS_SCHLUESSEL = "damicon-haustier-pos";
const SCHLAF_NACH_MS = 40_000;
const WECKEN_RADIUS = 220;
const ZIEHSCHWELLE = 5;
const RAND = 8;
// Wegschicken durch Halten: nach HALTEN_START_MS wird Himbi traurig und ein Ring laeuft
// HALTEN_DAUER_MS lang voll; wer vorher loslaesst, hat es sich anders ueberlegt.
const HALTEN_START_MS = 380;
const HALTEN_DAUER_MS = 900;
const ABSCHIED_MS = 1250;
const ERLEICHTERT_MS = 1100;

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
  const wurzel = useRef<HTMLDivElement>(null);
  const griff = useRef<HTMLDivElement>(null);
  const versatz = useRef<HTMLDivElement>(null);
  const koerper = useRef<HTMLDivElement>(null);

  const [bereit, setBereit] = useState(false);
  const [schlaeft, setSchlaeft] = useState(false);
  const [zieht, setZieht] = useState(false);
  const [seite, setSeite] = useState<"rechts" | "links">("rechts");
  const [hoehe, setHoehe] = useState<"oben" | "unten">("oben");
  const [konfettiNr, setKonfettiNr] = useState(0);

  const [halten, setHalten] = useState(false);
  const [abschied, setAbschied] = useState(false);
  const [erleichtert, setErleichtert] = useState(false);

  const basis: HaustierZustand = zustand === "ruhe" && schlaeft ? "schlaeft" : zustand;
  const anzeige: HaustierZustand = abschied || halten ? "traurig" : erleichtert ? "fertig" : basis;

  // ---- Mounten, gespeicherte Position ------------------------------------------------
  const versatzWert = useRef({ x: 0, y: 0 });
  const setzeVersatz = useCallback((x: number, y: number) => {
    versatzWert.current = { x, y };
    versatz.current?.style.setProperty("--hx", String(Math.round(x * 10) / 10));
    versatz.current?.style.setProperty("--hy", String(Math.round(y * 10) / 10));
  }, []);

  const bestimmeSeite = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (r) setSeite(r.left + r.width / 2 < window.innerWidth / 2 ? "links" : "rechts");
  }, []);

  /** Passt normalerweise ueber die Blase; steht Himbi zu nah am oberen Rand (moeglich, seit
   *  positionFolgtBlick sie ueberallhin ziehen kann), steht die Blase stattdessen darunter. */
  const BLASE_MINDESTHOEHE = 210;
  const bestimmeHoehe = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (r) setHoehe(r.top < BLASE_MINDESTHOEHE ? "unten" : "oben");
  }, []);

  /** Haelt Himbi im sichtbaren Bereich, wie auch immer sie dorthin kam (Ziehen, Fenster kleiner, Panel auf). */
  const klemme = useCallback(() => {
    const r = griff.current?.getBoundingClientRect();
    if (!r) return;
    let { x, y } = versatzWert.current;
    if (r.left < RAND) x += RAND - r.left;
    if (r.right > window.innerWidth - RAND) x -= r.right - (window.innerWidth - RAND);
    if (r.top < RAND) y += RAND - r.top;
    if (r.bottom > window.innerHeight - RAND) y -= r.bottom - (window.innerHeight - RAND);
    if (x !== versatzWert.current.x || y !== versatzWert.current.y) setzeVersatz(x, y);
  }, [setzeVersatz]);

  useEffect(() => {
    try {
      const roh = window.localStorage.getItem(POS_SCHLUESSEL);
      if (roh) {
        const p = JSON.parse(roh) as { x?: number; y?: number };
        if (typeof p.x === "number" && typeof p.y === "number") setzeVersatz(p.x, p.y);
      }
    } catch {
      // gesperrter oder kaputter Speicher: Standardposition
    }
    setBereit(true);
    const nachLayout = window.requestAnimationFrame(() => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    });
    const beiGroesse = () => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    };
    window.addEventListener("resize", beiGroesse);
    return () => {
      window.cancelAnimationFrame(nachLayout);
      window.removeEventListener("resize", beiGroesse);
    };
  }, [klemme, bestimmeSeite, bestimmeHoehe, setzeVersatz]);

  // Das Element gibt es erst, wenn bereit gesetzt ist (davor wird nichts gezeichnet). Die gespeicherte
  // Position wurde im Mount-Effekt nur gemerkt - hier wird sie ans echte Element geschrieben.
  useEffect(() => {
    if (bereit) setzeVersatz(versatzWert.current.x, versatzWert.current.y);
  }, [bereit, setzeVersatz]);

  // Panel auf/zu verschiebt Himbi - danach pruefen, ob sie noch im Bild ist.
  useEffect(() => {
    const id = window.setTimeout(() => {
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
    }, 620);
    return () => window.clearTimeout(id);
  }, [paneOffen, klemme, bestimmeSeite, bestimmeHoehe]);

  // ---- Wohin geschaut wird ------------------------------------------------------------
  // Fuehrt niemand ihren Blick, schaut Himbi auf das Feld, in das gerade geschrieben
  // wird: sie merkt, dass man ihr etwas tippt. Ermittelt ueber den Fokus im Dokument und
  // nicht ueber einen Draht vom Chat hierher - der Blick ist keine Absprache wert, und
  // so gilt es auch fuer das angedockte Panel und jedes Feld, das spaeter dazukommt.
  const [tippZiel, setTippZiel] = useState<Element | null>(null);
  useEffect(() => {
    const passend = (el: EventTarget | null): Element | null => {
      if (!(el instanceof Element)) return null;
      if (!el.matches("textarea, input[type='text'], input:not([type])")) return null;
      return el.closest(".ki-pane") ? el : null;
    };
    const rein = (e: FocusEvent) => setTippZiel(passend(e.target));
    const raus = () => setTippZiel(null);
    document.addEventListener("focusin", rein);
    document.addEventListener("focusout", raus);
    // Beim Mounten kann der Fokus schon im Feld stehen.
    setTippZiel(passend(document.activeElement));
    return () => {
      document.removeEventListener("focusin", rein);
      document.removeEventListener("focusout", raus);
    };
  }, []);

  // Eine Fuehrung (Tour) gewinnt: die zeigt etwas, das Tippen laeuft nebenher weiter.
  const schauZiel = blickZiel ?? tippZiel;

  // ---- Augen: gedaempft zum Ziel ------------------------------------------------------
  const ziel = useRef({ x: 0, y: 0 });
  const augen = useRef({ x: 0, y: 0 });
  const schleife = useRef(0);
  const anzeigeRef = useRef(anzeige);
  anzeigeRef.current = anzeige;
  const blickZielRef = useRef<Element | null>(null);
  blickZielRef.current = schauZiel;

  const laufe = useCallback(function schritt() {
    const el = griff.current;
    if (!el) return;
    const a = augen.current;
    const z = ziel.current;
    a.x += (z.x - a.x) * 0.2;
    a.y += (z.y - a.y) * 0.2;
    el.style.setProperty("--bx", a.x.toFixed(2));
    el.style.setProperty("--by", a.y.toFixed(2));
    if (Math.abs(z.x - a.x) > 0.02 || Math.abs(z.y - a.y) > 0.02) schleife.current = window.requestAnimationFrame(schritt);
    else schleife.current = 0;
  }, []);

  const richteAugen = useCallback(
    (x: number, y: number) => {
      ziel.current = { x, y };
      if (!schleife.current) schleife.current = window.requestAnimationFrame(laufe);
    },
    [laufe],
  );

  const blickZu = useCallback(
    (px: number, py: number) => {
      const r = griff.current?.getBoundingClientRect();
      if (!r) return;
      const b = blickRichtung(px - (r.left + r.width / 2), py - (r.top + r.height * 0.6));
      richteAugen(b.x, b.y);
    },
    [richteAugen],
  );

  // Zustandsabhaengiger Blick: denkt = nach oben links, Schlaf/Fehler = nach unten
  useEffect(() => {
    if (schauZiel) return;
    if (anzeige === "denkt") richteAugen(BLICK_DENKT.x, BLICK_DENKT.y);
    else if (anzeige === "schlaeft") richteAugen(0, 1.5);
    else if (anzeige === "traurig") richteAugen(0, 2.6);
    else if (anzeige === "fehler") richteAugen(0, 2);
    else richteAugen(0, 0);
  }, [anzeige, schauZiel, richteAugen]);

  // Auf das Ziel schauen, auch waehrend die Seite dorthin scrollt (Tour) oder das
  // Panel noch aufgeht (Eingabefeld).
  useEffect(() => {
    if (!schauZiel) return;
    let frame = 0;
    const schaue = () => {
      frame = 0;
      const r = schauZiel.getBoundingClientRect();
      blickZu(r.left + r.width / 2, r.top + Math.min(r.height / 2, 260));
    };
    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(schaue);
    };
    planen();
    window.addEventListener("scroll", planen, { passive: true });
    window.addEventListener("resize", planen);
    return () => {
      window.removeEventListener("scroll", planen);
      window.removeEventListener("resize", planen);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [schauZiel, blickZu]);

  // Die ganze Figur zum Blickziel bewegen, nicht nur die Augen (positionFolgtBlick) - fuer eine
  // Fuehrung auf einer langen, scrollbaren Seite (Dashboard). Rechnet aus der TATSAECHLICH
  // gezeichneten Position (die den aktuellen Versatz schon einschliesst), deshalb bleibt es
  // richtig, wo immer Himbi gerade steht. Endet die Fuehrung, geht es zurueck in die Ecke - sonst
  // bliebe die Figur an einer Bildschirmstelle stehen, die nach dem naechsten Scrollen zu nichts
  // mehr gehoert (fixed positioniert, folgt dem Dokument nicht von selbst).
  const folgtGerade = useRef(false);
  useEffect(() => {
    // isConnected: der Aufrufer kann ein Element noch referenzieren, das React laengst aus dem
    // DOM entfernt hat (z. B. der Live-Lauf-Hinweis, dessen Anker verschwindet, sobald der Check
    // fertig ist, bevor die Blase selbst das mitbekommt) - getBoundingClientRect() liefert dafuer
    // lautlos ein Nullrechteck, ohne diese Pruefung wuerde das die Figur in eine Bildschirmecke
    // ziehen, die nichts mit dem eigentlichen Ziel zu tun hat.
    if (!positionFolgtBlick || !blickZiel || !blickZiel.isConnected) {
      if (folgtGerade.current) {
        setzeVersatz(0, 0);
        bestimmeSeite();
        bestimmeHoehe();
      }
      folgtGerade.current = false;
      return;
    }
    folgtGerade.current = true;
    let frame = 0;
    const bewege = () => {
      frame = 0;
      if (!blickZiel.isConnected) return;
      const zielRect = blickZiel.getBoundingClientRect();
      const eigeneRect = griff.current?.getBoundingClientRect();
      if (!eigeneRect) return;
      const breite = eigeneRect.width;
      const hoehe = eigeneRect.height;
      // Knapp ausserhalb der unteren rechten Ecke des Ziels, dabei immer im sichtbaren Bereich.
      const zielX = Math.min(Math.max(zielRect.right - breite * 0.4, breite / 2 + RAND), window.innerWidth - breite / 2 - RAND);
      const zielY = Math.min(Math.max(zielRect.bottom - hoehe * 0.4, hoehe / 2 + RAND), window.innerHeight - hoehe / 2 - RAND);
      const deltaX = zielX - (eigeneRect.left + breite / 2);
      const deltaY = zielY - (eigeneRect.top + hoehe / 2);
      if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) setzeVersatz(versatzWert.current.x + deltaX, versatzWert.current.y + deltaY);
      bestimmeSeite();
      bestimmeHoehe();
    };
    const planen = () => {
      if (!frame) frame = window.requestAnimationFrame(bewege);
    };
    planen();
    window.addEventListener("scroll", planen, { passive: true });
    window.addEventListener("resize", planen);
    return () => {
      window.removeEventListener("scroll", planen);
      window.removeEventListener("resize", planen);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [positionFolgtBlick, blickZiel, setzeVersatz, bestimmeSeite, bestimmeHoehe]);

  // ---- Mauszeiger: Augen folgen, Naehe weckt, Leerlauf schlaefert ein -------------------
  const letzteAktivitaet = useRef(0);
  useEffect(() => {
    letzteAktivitaet.current = Date.now();
    const beiZeiger = (e: globalThis.PointerEvent) => {
      letzteAktivitaet.current = Date.now();
      const r = griff.current?.getBoundingClientRect();
      if (!r) return;
      const naeher = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < WECKEN_RADIUS;
      if (naeher && anzeigeRef.current === "schlaeft") setSchlaeft(false);
      if (blickZielRef.current) return;
      const z = anzeigeRef.current;
      if (z === "ruhe" || z === "fertig" || z === "freigabe" || z === "spricht") blickZu(e.clientX, e.clientY);
    };
    const beiTaste = () => {
      letzteAktivitaet.current = Date.now();
    };
    window.addEventListener("pointermove", beiZeiger, { passive: true });
    window.addEventListener("keydown", beiTaste, { passive: true });
    const wach = window.setInterval(() => {
      if (anzeigeRef.current === "ruhe" && Date.now() - letzteAktivitaet.current > SCHLAF_NACH_MS) setSchlaeft(true);
    }, 2000);
    return () => {
      window.removeEventListener("pointermove", beiZeiger);
      window.removeEventListener("keydown", beiTaste);
      window.clearInterval(wach);
      if (schleife.current) window.cancelAnimationFrame(schleife.current);
    };
  }, [blickZu]);

  // Huepfer bei jeder Aenderung des Zaehlers: Klasse entfernen, neu berechnen lassen, wieder setzen
  useEffect(() => {
    const el = koerper.current;
    if (!huepf || !el) return;
    el.classList.remove("hb-huepf");
    void el.offsetWidth;
    el.classList.add("hb-huepf");
  }, [huepf]);

  // Konfetti bei jedem Eintritt in "fertig"
  const vorher = useRef<HaustierZustand>("ruhe");
  useEffect(() => {
    if (zustand === "fertig" && vorher.current !== "fertig") setKonfettiNr((n) => n + 1);
    vorher.current = zustand;
  }, [zustand]);

  // ---- Wegschicken durch Halten --------------------------------------------------------------
  const wegRef = useRef(weg);
  wegRef.current = weg;
  const haltenTimer = useRef<number | undefined>(undefined);
  const abschiedTimer = useRef<number | undefined>(undefined);
  const endeTimer = useRef<number | undefined>(undefined);
  const erleichtertTimer = useRef<number | undefined>(undefined);

  const stoppeHalten = useCallback(() => {
    window.clearTimeout(haltenTimer.current);
    window.clearTimeout(abschiedTimer.current);
    setHalten(false);
  }, []);

  const starteAbschied = useCallback(() => {
    window.clearTimeout(haltenTimer.current);
    window.clearTimeout(abschiedTimer.current);
    window.clearTimeout(endeTimer.current);
    setHalten(true);
    setAbschied(true);
    endeTimer.current = window.setTimeout(() => wegRef.current?.onWeg(), ABSCHIED_MS);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(haltenTimer.current);
      window.clearTimeout(abschiedTimer.current);
      window.clearTimeout(endeTimer.current);
      window.clearTimeout(erleichtertTimer.current);
    },
    [],
  );

  // ---- Ziehen und Klicken ----------------------------------------------------------------
  const start = useRef<{ x: number; y: number; vx: number; vy: number; bewegt: boolean } | null>(null);

  const beiZiehen = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, y: e.clientY, vx: versatzWert.current.x, vy: versatzWert.current.y, bewegt: false };
    if (schlaeft) setSchlaeft(false);
    if (weg && !abschied) {
      window.clearTimeout(haltenTimer.current);
      window.clearTimeout(abschiedTimer.current);
      haltenTimer.current = window.setTimeout(() => setHalten(true), HALTEN_START_MS);
      abschiedTimer.current = window.setTimeout(starteAbschied, HALTEN_START_MS + HALTEN_DAUER_MS);
    }
  };
  const beiBewegen = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.bewegt && Math.hypot(dx, dy) < ZIEHSCHWELLE) return;
    if (!s.bewegt) {
      s.bewegt = true;
      stoppeHalten(); // wer zieht, will nichts wegschicken
      setZieht(true);
    }
    setzeVersatz(s.vx + dx, s.vy + dy);
    wurzel.current?.style.setProperty("--hb-neigung", `${Math.max(-14, Math.min(14, e.movementX * 1.6)).toFixed(1)}deg`);
  };
  const beiLoslassen = (e: PointerEvent<HTMLDivElement>) => {
    const s = start.current;
    start.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (!s) return;
    if (s.bewegt) {
      setZieht(false);
      wurzel.current?.style.setProperty("--hb-neigung", "0deg");
      klemme();
      bestimmeSeite();
      bestimmeHoehe();
      try {
        window.localStorage.setItem(POS_SCHLUESSEL, JSON.stringify(versatzWert.current));
      } catch {
        // gesperrter Speicher: Position gilt nur bis zum Neuladen
      }
    } else if (abschied) {
      // Der Abschied laeuft, Loslassen aendert nichts mehr.
    } else if (halten) {
      // Vor dem Ende losgelassen: Himbi ist erleichtert.
      stoppeHalten();
      setErleichtert(true);
      window.clearTimeout(erleichtertTimer.current);
      erleichtertTimer.current = window.setTimeout(() => setErleichtert(false), ERLEICHTERT_MS);
    } else {
      stoppeHalten();
      onKlick();
    }
  };
  const beiTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onKlick();
    } else if ((e.key === "Delete" || e.key === "Backspace") && weg && !abschied) {
      e.preventDefault();
      starteAbschied();
    }
  };
  const zuruecksetzen = () => {
    setzeVersatz(0, 0);
    try {
      window.localStorage.removeItem(POS_SCHLUESSEL);
    } catch {
      // egal
    }
    bestimmeSeite();
    bestimmeHoehe();
  };

  // Erst nach dem Mounten zeichnen: die gespeicherte Position und Einstellung kommen aus dem
  // Browser, ein Vorab-Render auf dem Server wuerde die Hydration verfehlen.
  if (!bereit) return null;

  const eigeneBlase = weg ? (abschied ? weg.tschuess : halten ? weg.halten : null) : null;

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
          {(eigeneBlase || blase) && !zieht && !buehne ? (
            <div className="hb-blase" role="status" aria-live="polite">
              {eigeneBlase ? <p className="hb-blase__text">{eigeneBlase}</p> : blase}
            </div>
          ) : null}
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
          </div>
        </div>
      </div>
    </div>
  );
}
