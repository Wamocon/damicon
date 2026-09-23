"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslations } from "next-intl";

// Griff am linken Rand des KI-Panels: zieht man ihn, aendert sich die Breite
// des Panels, die Hauptspalte daneben gibt entsprechend nach. Die Breite ist
// nur die CSS-Variable --ki-pane-breite (ki-pane.css); Huelle und Panel lesen
// sie beide, deshalb braucht es hier weder Zustand im Kontext noch Eingriffe
// ins Layout. Das Ziehen schreibt die Variable direkt (kein Rendern des Chats
// pro Mausbewegung), gespeichert wird beim Loslassen.
//
// Bedienbar auch per Tastatur (Pfeiltasten, Pos1/Ende) und ohne Maus
// zuruecksetzbar (Doppelklick). Auf Schubladen-Breite (< 1100px) gibt es den
// Griff nicht - dort fuellt das Panel ohnehin die Breite.

const SCHLUESSEL = "damicon-ki-breite";
const VARIABLE = "--ki-pane-breite";
// Exportiert: ki-pane.tsx nutzt dieselben zwei Werte, wenn es das Panel fuer
// die Pruefungsansicht voruebergehend verbreitert (siehe dort).
export const MINIMUM = 352; // 22rem
const MAXIMUM_ABSOLUT = 960;
// So schmal darf die Ansicht neben dem Panel hoechstens werden: die Kopfzeile
// (Suche, Sprache, Profil, Abmelden) braucht rund 680px, darunter laeuft sie ueber.
export const HAUPTSPALTE_MINDESTBREITE = 680;
const SCHRITT = 24;
const SCHRITT_GROSS = 96;

// Wie breit das Panel hoechstens werden darf: Fenster minus Seitenleiste minus
// die Breite, die die Ansicht daneben mindestens behalten soll. Der linke Rand
// von #main ist genau der Platz, den alles links davon (die Seitenleiste)
// belegt - gemessen statt angenommen, weil er sich aendern kann.
function maximum(): number {
  const links = document.getElementById("main")?.getBoundingClientRect().left ?? 0;
  const platz = Math.floor(window.innerWidth - links - HAUPTSPALTE_MINDESTBREITE);
  return Math.max(MINIMUM, Math.min(MAXIMUM_ABSOLUT, platz));
}

function begrenze(px: number): number {
  return Math.min(maximum(), Math.max(MINIMUM, Math.round(px)));
}

function anwenden(px: number | null): void {
  const wurzel = document.documentElement.style;
  if (px === null) wurzel.removeProperty(VARIABLE);
  else wurzel.setProperty(VARIABLE, `${px}px`);
}

function speichern(px: number | null): void {
  try {
    if (px === null) window.localStorage.removeItem(SCHLUESSEL);
    else window.localStorage.setItem(SCHLUESSEL, String(px));
  } catch {
    // Speicher gesperrt (privates Fenster): Breite gilt dann nur fuer diese Sitzung.
  }
}

export function KiPaneGriff() {
  const t = useTranslations("kiAssistentAnsicht");
  const griff = useRef<HTMLDivElement>(null);
  // Gewuenschte Breite des Nutzers; null = Standard aus dem Stylesheet. Getrennt
  // von der angewendeten Breite, damit ein kleines Fenster sie nur voruebergehend
  // begrenzt und ein groesseres Fenster sie wiederherstellt.
  const gewuenscht = useRef<number | null>(null);
  const start = useRef<{ x: number; breite: number; bewegt: boolean } | null>(null);
  const [aktuell, setAktuell] = useState(0);

  const huelle = useCallback(() => griff.current?.closest<HTMLElement>(".ki-pane-huelle") ?? null, []);

  useEffect(() => {
    try {
      const wert = Number(window.localStorage.getItem(SCHLUESSEL));
      if (Number.isFinite(wert) && wert > 0) gewuenscht.current = wert;
    } catch {
      // siehe speichern()
    }
    if (gewuenscht.current !== null) anwenden(begrenze(gewuenscht.current));

    const beiFenstergroesse = () => {
      if (gewuenscht.current !== null) anwenden(begrenze(gewuenscht.current));
    };
    window.addEventListener("resize", beiFenstergroesse);

    const element = huelle();
    const beobachter = element ? new ResizeObserver(() => setAktuell(Math.round(element.getBoundingClientRect().width))) : null;
    if (element) beobachter?.observe(element);

    return () => {
      window.removeEventListener("resize", beiFenstergroesse);
      beobachter?.disconnect();
      anwenden(null);
      document.documentElement.removeAttribute("data-ki-zieht");
    };
  }, [huelle]);

  const setze = (px: number) => {
    const breite = begrenze(px);
    gewuenscht.current = breite;
    anwenden(breite);
    speichern(breite);
  };

  const beiZiehen = (e: PointerEvent<HTMLDivElement>) => {
    const element = huelle();
    if (!element || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = { x: e.clientX, breite: element.getBoundingClientRect().width, bewegt: false };
    document.documentElement.setAttribute("data-ki-zieht", "");
  };

  const beiBewegen = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    // Das Panel sitzt rechts: nach links ziehen macht es breiter.
    start.current.bewegt = true;
    anwenden(begrenze(start.current.breite + (start.current.x - e.clientX)));
  };

  const beiLoslassen = (e: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const bewegt = start.current.bewegt;
    start.current = null;
    document.documentElement.removeAttribute("data-ki-zieht");
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    // Ein blosser Klick (ohne Ziehen) soll die Standardbreite nicht festschreiben.
    const element = huelle();
    if (bewegt && element) setze(element.getBoundingClientRect().width);
  };

  const beiTaste = (e: KeyboardEvent<HTMLDivElement>) => {
    const schritt = e.shiftKey ? SCHRITT_GROSS : SCHRITT;
    // Vom Ziel ausgehen, nicht von der gerade animierten Breite: schnelle
    // Tastendruecke sollen sich addieren.
    const basis = gewuenscht.current ?? (aktuell || MINIMUM);
    if (e.key === "ArrowLeft") setze(basis + schritt);
    else if (e.key === "ArrowRight") setze(basis - schritt);
    else if (e.key === "Home") setze(MINIMUM);
    else if (e.key === "End") setze(maximum());
    else return;
    e.preventDefault();
  };

  const zuruecksetzen = () => {
    gewuenscht.current = null;
    anwenden(null);
    speichern(null);
  };

  return (
    <div
      ref={griff}
      role="separator"
      aria-orientation="vertical"
      aria-label={t("breiteAendern")}
      aria-valuenow={aktuell || undefined}
      aria-valuemin={MINIMUM}
      aria-valuemax={MAXIMUM_ABSOLUT}
      tabIndex={0}
      title={t("breiteAendern")}
      onPointerDown={beiZiehen}
      onPointerMove={beiBewegen}
      onPointerUp={beiLoslassen}
      onPointerCancel={beiLoslassen}
      onKeyDown={beiTaste}
      onDoubleClick={zuruecksetzen}
      className="ki-griff"
    />
  );
}
