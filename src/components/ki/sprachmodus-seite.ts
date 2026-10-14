"use client";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { RAHMEN_ABSTAND, useHervorhebungsRechteck } from "@/components/ki/sprach-spotlight";
import { loeseSprechZiel, ueberschriftImSatz, zeigeSprechStelle } from "@/components/ki/sprach-mitlesen";
import { leseGerade, type FreigabeAnfrage } from "@/components/ki/sprachmodus-bus";
import { assistentIstDran, ausweichPlatz, type Phase, type Rechteck } from "@/lib/domain/sprachmodus";

// Was der Sprachmodus (sprachmodus.tsx) an der Seite um ihn herum tut, seit dem 14.10.2026 eigene Hooks: den Fokus beim
// Öffnen nehmen und zurückgeben, Himbis Platz (Mitte, links, auf dem Handy neben dem Rahmen), das Mitlesen des klingenden
// Satzes und die unscharfe Navigationsleiste.

// Der Dialog nimmt beim Oeffnen den Fokus auf: auf den Himbi-Knopf, die wichtigste
// Bedienung (unterbrechen, erneut versuchen). Vorher blieb der Fokus auf der Seite
// dahinter, und mit der Tabulatortaste erreichte man den Sprachmodus erst nach allen
// Elementen der Seite (Gegenpruefung vom 25.09.2026). Weil der Knopf beim Andocken im
// selben Baum bleibt, bleibt auch der Fokus. Beim Schliessen bekommt das Element den
// Fokus zurueck, das ihn vorher hatte (meist der Knopf "Gespraech"), sonst fiele er auf
// <body> (wie glocke.tsx). Gemerkt wird es vor dem Verschieben (Layout-Effekt) und nur,
// wenn es ausserhalb des Sprachmodus liegt: im Entwicklungsmodus haengt React die Effekte
// einmal probehalber aus und wieder ein, beim zweiten Mal laege der Fokus schon auf Himbi.
// Zurueckgegeben wird nach dem Aushaengen und nur, wenn der Sprachmodus wirklich weg ist;
// das Chat-Panel ist erst danach wieder bedienbar (inert).
export function useDialogFokus(): RefObject<HTMLButtonElement | null> {
  const figurKnopfRef = useRef<HTMLButtonElement | null>(null);
  const vorherFokusRef = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const aktiv = document.activeElement;
    if (aktiv instanceof HTMLElement && aktiv !== document.body && !aktiv.closest(".ki-sprachmodus")) vorherFokusRef.current = aktiv;
  }, []);
  useEffect(() => {
    figurKnopfRef.current?.focus({ preventScroll: true });
    return () => {
      const vorher = vorherFokusRef.current;
      window.setTimeout(() => {
        if (document.querySelector(".ki-sprachmodus")) return;
        if (vorher && vorher.isConnected && !vorher.closest("[inert]")) vorher.focus({ preventScroll: true });
      }, 0);
    };
  }, []);
  return figurKnopfRef;
}

/** Handy-Breite wie in sprachmodus.css (unter md, wo es keine Navigationsleiste zum
 *  Andocken gibt). */
const HANDY = "(max-width: 767.98px)";
function abonniereHandy(bescheid: () => void): () => void {
  const m = window.matchMedia(HANDY);
  m.addEventListener("change", bescheid);
  return () => m.removeEventListener("change", bescheid);
}
const leseHandy = () => window.matchMedia(HANDY).matches;

interface PlatzVonHimbi {
  zielRechteck: Rechteck | null;
  zielSichtbar: boolean;
  angedockt: boolean;
  spalteRef: RefObject<HTMLDivElement | null>;
}

// --- Platz von Himbi: Mitte oder links ueber der Menueleiste ---------------------------
//
// Zwei Faelle (Rueckmeldung vom 25.09.2026: "sobald er anfaengt, mir den
// Inhalt der UI zu erzaehlen, soll er nach links ueber die Menueleiste, links
// vertikal mittig, der gesprochene Text darunter, die Mitte muss frei und gut
// lesbar bleiben"):
//   1. angedockt: der Assistent denkt oder spricht ODER ein Element ist
//      hervorgehoben (zeigeAuf) - Himbi, Zustand und Text sitzen links, ueber
//      der Navigationsleiste. Ein hervorgehobenes Ziel bekommt nur den
//      Rahmen (SprachSpotlight), Himbi rueckt NICHT daneben: dort
//      fehlte das Schriftbild des Gesprochenen, und die Menueleiste blieb
//      scharf (Screenshot vom 25.09.2026).
//   2. sonst (Zuhoeren, Fehler, Pause): Himbi gross in der Mitte.
export function usePlatzVonHimbi(phase: Phase, freigabeAnfrage: FreigabeAnfrage | null): PlatzVonHimbi {
  const zielRechteck = useHervorhebungsRechteck();
  const zielSichtbar = zielRechteck !== null && zielRechteck.breite > 0 && zielRechteck.hoehe > 0;
  const angedockt = zielSichtbar || assistentIstDran(phase);

  // Handy: Himbi weicht dem gerahmten Bereich aus (domain/sprachmodus.ts, ausweichPlatz),
  // statt mittig darueber zu stehen. Gemessen wird die Einheit aus Himbi und Zustandszeile
  // (samt einer offenen Freigabekarte), die Kopfzeile und die Bedienleiste; das Ergebnis
  // geht als --sprach-y an die Spalte (sprachmodus.css). Laeuft bei jeder Aenderung des
  // Rahmens (Scrollen, Groesse) neu, weil das Rechteck dann neu gesetzt wird.
  const istHandy = useSyncExternalStore(abonniereHandy, leseHandy, () => false);
  const spalteRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const spalte = spalteRef.current;
    if (!spalte) return;
    if (!istHandy || !zielSichtbar || !zielRechteck) {
      spalte.removeAttribute("data-ausweichen");
      spalte.style.removeProperty("--sprach-y");
      spalte.style.removeProperty("--sprach-max");
      return;
    }
    const kopf = document.querySelector("[data-kopfzeile]")?.getBoundingClientRect();
    const leiste = document.querySelector(".ki-sprachmodus__leiste")?.getBoundingClientRect();
    const rahmen = {
      x: zielRechteck.x - RAHMEN_ABSTAND,
      y: zielRechteck.y - RAHMEN_ABSTAND,
      breite: zielRechteck.breite + 2 * RAHMEN_ABSTAND,
      hoehe: zielRechteck.hoehe + 2 * RAHMEN_ABSTAND,
    };
    // Gemessen wird fixiert und ohne Hoechsthoehe: erst dann hat die Einheit ihre echte
    // Breite und damit ihre echte Hoehe (eine Freigabekarte bricht im Fluss anders um).
    // Das Messen passiert im selben Bild, gezeichnet wird erst das Ergebnis.
    const bisher = spalte.getAttribute("data-ausweichen");
    const erstes = bisher === null;
    if (erstes) {
      spalte.style.transition = "none";
      spalte.setAttribute("data-ausweichen", "messen");
    }
    spalte.style.removeProperty("--sprach-max");
    const platz = ausweichPlatz(rahmen, spalte.offsetHeight, {
      oben: (kopf && kopf.height > 0 ? kopf.bottom : 0) + 8,
      unten: (leiste ? leiste.top : window.innerHeight) - 8,
      rand: 8,
    });
    // Beim ersten Setzen und wenn Himbi die Seite wechselt (ueber/unter dem Rahmen),
    // springt er ohne Gleiten: sonst glitte er aus der Mitte oder einmal quer durch den
    // Rahmen. Innerhalb derselben Seite gleitet er im Gleichschritt mit dem Rahmen
    // (sprachmodus.css).
    const springt = erstes || bisher !== platz.lage;
    if (springt) spalte.style.transition = "none";
    spalte.setAttribute("data-ausweichen", platz.lage);
    spalte.style.setProperty("--sprach-y", `${Math.round(platz.y)}px`);
    spalte.style.setProperty("--sprach-max", `${Math.max(0, Math.floor(platz.hoeheFrei))}px`);
    if (springt) {
      void spalte.offsetHeight;
      requestAnimationFrame(() => spalte.style.removeProperty("transition"));
    }
  }, [istHandy, zielSichtbar, zielRechteck, phase, freigabeAnfrage]);

  return { zielRechteck, zielSichtbar, angedockt, spalteRef };
}

// Mitlesen: der Rahmen in der Mitte folgt dem Satz, den die Stimme gerade
// spricht (Rückmeldung vom 25.09.2026: "ich kann nicht nachvollziehen, bei
// welchem Punkt er gerade ist"). Welcher Satz klingt, weiß der Vorlese-Strom
// (sprachmodus-bus.ts, leseGerade); welche Stelle er meint, sagt seine
// Sprechmarke (domain/sprechmarken.ts, sprach-mitlesen.ts). Ein Satz ohne Marke
// lässt den Rahmen stehen. Nur wenn in der ganzen Antwort noch keine Marke kam,
// zeigt eine wörtlich genannte Überschrift die Stelle - nie Wortähnlichkeit.
//
// Nebenbei steht der klingende Satz als data-satz-jetzt am Sprachmodus selbst (seit dem
// 26.09.2026 nicht mehr am Untertitel, der ist standardmaessig aus): der
// Führungstest liest dort mit, was gerade gesprochen wird.
export function useMitlesen(phase: Phase): RefObject<HTMLDivElement | null> {
  const wurzelRef = useRef<HTMLDivElement | null>(null);
  const himbiDran = assistentIstDran(phase);
  useEffect(() => {
    if (!himbiDran) return;
    let letzter = "";
    let markeGesehen = false;
    const uhr = window.setInterval(() => {
      const jetzt = leseGerade();
      // Satz und ob er klingt: nach einer Sprechpause steht derselbe Index erst
      // still (noch nicht gesprochen) und klingt dann - erst dann gilt seine Marke.
      const schluessel = jetzt ? `${jetzt.index}:${jetzt.satz === null ? 0 : 1}` : "";
      if (!jetzt || schluessel === letzter) return;
      letzter = schluessel;
      if (jetzt.satz === null) return;
      wurzelRef.current?.setAttribute("data-satz-jetzt", jetzt.satz ?? "");
      wurzelRef.current?.setAttribute("data-satz-index", String(jetzt.index));
      if (jetzt.ziel) {
        markeGesehen = true;
        const stelle = loeseSprechZiel(jetzt.ziel);
        if (stelle) zeigeSprechStelle(stelle);
        return;
      }
      if (markeGesehen || !jetzt.satz) return;
      const stelle = ueberschriftImSatz(jetzt.satz);
      if (stelle) zeigeSprechStelle(stelle);
    }, 150);
    return () => window.clearInterval(uhr);
  }, [himbiDran]);
  return wurzelRef;
}

// Die Navigationsleiste wird unscharf, solange Himbi und Text links stehen
// (Filter direkt auf der Leiste, siehe sprachmodus.css).
export function useLeisteUnscharf(angedockt: boolean): void {
  useEffect(() => {
    if (!angedockt) return;
    const wurzel = document.documentElement;
    wurzel.setAttribute("data-sprach-links", "");
    return () => wurzel.removeAttribute("data-sprach-links");
  }, [angedockt]);
}
