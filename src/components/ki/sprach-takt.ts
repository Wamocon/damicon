"use client";

// Takt zwischen Stimme und Bildschirm im Sprachmodus.
//
// Der Text einer Antwort ist fertig, lange bevor die Stimme ihn gesprochen hat:
// Die Sätze gehen sofort an den Vorlese-Strom, der sie nacheinander spielt. Ein
// Werkzeugaufruf direkt dahinter (Bereich öffnen, klicken, auf etwas zeigen)
// lief bisher sofort, und die Führung eilte dem Gesprochenen voraus
// (Rückmeldung vom 25.09.2026: "das, was gesprochen wird, ist nicht das, was
// gezeigt wird"). Jede sichtbare Handlung wartet deshalb, bis die Stimme die
// Sätze davor gesprochen hat, und läuft dann. Eine Navigation und das, was
// danach die Seite liest, laufen dabei in einer Reihe, damit seiteLesen nie die
// alte Seite liest.
//
// Gewartet wird nur auf die Sätze VOR der Handlung (Sprechmarke), nicht auf
// alles, was danach noch gesprochen wird. Während die neue Seite lädt, hält die
// Stimme an (halte): sonst spräche sie schon über die neue Seite, während noch
// die alte zu sehen ist.

import { useCallback, useRef } from "react";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";
import type { SprechStand } from "@/components/ki/sprachausgabe-strom";

// Bis die Sätze aus dem Stream beim Vorlesen angekommen sind, steht die Stimme
// noch still, obwohl gleich gesprochen wird.
const ANKOMMEN_MS = 450;
const TAKT_MS = 120;
const STILL_NOETIG = 2;
const MAX_WARTEN_MS = 30_000;
// Ohne Satzposition bleibt nur "still": dann nicht länger warten, sonst käme
// ein Wechsel erst nach der ganzen Antwort.
const OHNE_POSITION_MAX_MS = 6_000;
const SEITE_MAX_MS = 3_000;
const INHALT_MAX_MS = 2_500;
const SEITE_NACHLAUF_MS = 300;
// Länger hält die Stimme für einen Seitenwechsel nie an.
const HALTEN_MAX_MS = 3_500;
// Die Navigation aus dem Stream wird in einem Effekt eingereiht; ein Werkzeug,
// das im selben Atemzug ankommt, soll sie nicht überholen.
const REIHE_ANLAUF_MS = 200;

const pause = (ms: number) => new Promise<void>((weiter) => window.setTimeout(weiter, ms));

/** Steht der Browser schon auf dem Ziel (Pfad UND Abfrage, ohne Sprachpraefix)?
 *  Die Abfrage zaehlt mit: /dashboard/compliance?bereich=steuer ist ein anderer
 *  Stand als ?bereich=audit, auch wenn der Pfad gleich bleibt. */
function stehtAufZiel(ziel: string): boolean {
  return `${window.location.pathname}${window.location.search}`.endsWith(ziel.split("#")[0]);
}

export function useSprachTakt() {
  /** Vom Chat gesetzt (in einem Effekt): was die Stimme gerade tut. */
  const stimme = useRef<VorlesePhase>("still");
  /** Vom Chat gesetzt: läuft gerade der Sprachmodus? Nur dort wird gewartet. */
  const aktiv = useRef(false);
  /** Vom Chat gesetzt: wo die Stimme ist (sprachausgabe-live.ts, gerade). */
  const stand = useRef<(() => SprechStand | null) | null>(null);
  /** Vom Chat gesetzt: Stimme anhalten und fortsetzen (sprachausgabe-live.ts, halte). */
  const halte = useRef<((an: boolean) => void) | null>(null);
  const zug = useRef(0);
  const reihe = useRef<Promise<void>>(Promise.resolve());

  const gilt = useCallback((meinZug: number) => zug.current === meinZug && aktiv.current, []);

  /** Wartet, bis die Seite zum Ziel gewechselt hat und ihre Überschrift steht,
   *  oder bis das Zeitlimit greift. Ohne das las seiteLesen eine noch ladende Seite. */
  const wartePfad = useCallback(
    async (ziel: string, meinZug: number) => {
      for (let ms = 0; ms < SEITE_MAX_MS && gilt(meinZug) && !stehtAufZiel(ziel); ms += 100) await pause(100);
      for (let ms = 0; ms < INHALT_MAX_MS && gilt(meinZug) && !document.querySelector("#main h1"); ms += 100) await pause(100);
      await pause(SEITE_NACHLAUF_MS);
    },
    [gilt],
  );

  /** Wartet, bis der Satz mit der Nummer `marke` klingt (alles davor ist gesprochen)
   *  oder die Stimme still ist. `marke` null: nur auf still warten. */
  const warteBisMarke = useCallback(
    async (meinZug: number, marke: number | null) => {
      let still = 0;
      const deckel = marke === null ? OHNE_POSITION_MAX_MS : MAX_WARTEN_MS;
      for (let ms = 0; ms < deckel; ms += TAKT_MS) {
        if (!gilt(meinZug)) return;
        const jetzt = stand.current?.() ?? null;
        if (marke !== null && jetzt && jetzt.index >= marke) return;
        still = stimme.current === "still" ? still + 1 : 0;
        if (still >= STILL_NOETIG) return;
        await pause(TAKT_MS);
      }
    },
    [gilt],
  );

  /** Vor jedem Client-Werkzeug (ki-chat-werkzeuge.ts). seiteLesen ändert nichts
   *  am Bild und wartet nur auf die Reihe, nicht auf die Stimme. false: die
   *  Anfrage ist inzwischen abgelöst (neue Frage, Stopp), nicht mehr ausführen. */
  const vorAusfuehrung = useCallback(
    async (werkzeug: string): Promise<boolean> => {
      if (!aktiv.current) return true;
      const meinZug = zug.current;
      await pause(REIHE_ANLAUF_MS);
      await reihe.current;
      if (!gilt(meinZug)) return false;
      if (werkzeug !== "seiteLesen") {
        await pause(ANKOMMEN_MS);
        await warteBisMarke(meinZug, stand.current?.()?.anzahl ?? null);
      }
      return gilt(meinZug);
    },
    [gilt, warteBisMarke],
  );

  /** So viele Sätze hat die Runde bis jetzt an die Stimme gegeben - die
   *  Sprechmarke für eine Handlung, die JETZT hinter dem letzten Satz steht. */
  const marke = useCallback((): number | null => stand.current?.()?.anzahl ?? null, []);

  /** Öffnet einen Bereich erst, wenn die Stimme die Sätze vor `vorSaetzen`
   *  gesprochen hat (null: keine Satzposition bekannt). */
  const oeffneImTakt = useCallback(
    (oeffne: () => void, ziel: string, vorSaetzen: number | null) => {
      const meinZug = zug.current;
      reihe.current = reihe.current
        .then(async () => {
          await warteBisMarke(meinZug, vorSaetzen);
          if (!gilt(meinZug)) return;
          const wechsel = !stehtAufZiel(ziel);
          if (wechsel) halte.current?.(true);
          const notbremse = window.setTimeout(() => halte.current?.(false), HALTEN_MAX_MS);
          try {
            oeffne();
            if (wechsel) await wartePfad(ziel, meinZug);
          } finally {
            window.clearTimeout(notbremse);
            if (wechsel) halte.current?.(false);
          }
        })
        .catch(() => {});
    },
    [gilt, warteBisMarke, wartePfad],
  );

  /** Neue Frage oder Stopp: alles, was noch wartet, verfällt. */
  const neuerZug = useCallback(() => {
    zug.current += 1;
    halte.current?.(false);
  }, []);

  return { stimme, aktiv, stand, halte, marke, vorAusfuehrung, oeffneImTakt, neuerZug };
}
