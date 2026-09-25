"use client";

// Takt zwischen Stimme und Bildschirm im Sprachmodus.
//
// Der Text einer Antwort ist fertig, lange bevor die Stimme ihn gesprochen hat:
// Die Sätze gehen sofort an den Vorlese-Strom, der sie nacheinander spielt. Ein
// Werkzeugaufruf direkt dahinter (Bereich öffnen, klicken, auf etwas zeigen)
// lief bisher sofort, und die Führung eilte dem Gesprochenen voraus
// (Rückmeldung vom 25.09.2026: "das, was gesprochen wird, ist nicht das, was
// gezeigt wird"). Jede sichtbare Handlung wartet deshalb, bis die Stimme
// verstummt ist, also alles Vorherige gesprochen hat, und läuft dann. Eine
// Navigation und das, was danach die Seite liest, laufen dabei in einer
// Reihe, damit seiteLesen nie die alte Seite liest.

import { useCallback, useRef } from "react";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";

// Bis die Sätze aus dem Stream beim Vorlesen angekommen sind, steht die Stimme
// noch still, obwohl gleich gesprochen wird.
const ANKOMMEN_MS = 450;
const TAKT_MS = 150;
const STILL_NOETIG = 2;
const MAX_WARTEN_MS = 30_000;
const SEITE_MAX_MS = 3_000;
const INHALT_MAX_MS = 2_500;
const SEITE_NACHLAUF_MS = 400;
// Die Navigation aus dem Stream wird in einem Effekt eingereiht; ein Werkzeug,
// das im selben Atemzug ankommt, soll sie nicht überholen.
const REIHE_ANLAUF_MS = 200;

const pause = (ms: number) => new Promise<void>((weiter) => window.setTimeout(weiter, ms));

/** Wartet, bis die Seite zum Ziel gewechselt hat und ihre Überschrift steht (oder
 *  das Zeitlimit greift). Ohne das las seiteLesen eine noch ladende Seite, und
 *  Himbi sagte "Die Seite wird gerade geladen". */
async function wartePfad(ziel: string): Promise<void> {
  const pfad = ziel.split("#")[0].split("?")[0];
  for (let ms = 0; ms < SEITE_MAX_MS && !window.location.pathname.endsWith(pfad); ms += 100) await pause(100);
  for (let ms = 0; ms < INHALT_MAX_MS && !document.querySelector("#main h1"); ms += 100) await pause(100);
  await pause(SEITE_NACHLAUF_MS);
}

export function useSprachTakt() {
  /** Vom Chat gesetzt (in einem Effekt): was die Stimme gerade tut. */
  const stimme = useRef<VorlesePhase>("still");
  /** Vom Chat gesetzt: läuft gerade der Sprachmodus? Nur dort wird gewartet. */
  const aktiv = useRef(false);
  const zug = useRef(0);
  const reihe = useRef<Promise<void>>(Promise.resolve());

  const warteAufStimme = useCallback(async (meinZug: number) => {
    await pause(ANKOMMEN_MS);
    let still = 0;
    for (let ms = 0; ms < MAX_WARTEN_MS && still < STILL_NOETIG; ms += TAKT_MS) {
      if (zug.current !== meinZug || !aktiv.current) return;
      still = stimme.current === "still" ? still + 1 : 0;
      await pause(TAKT_MS);
    }
  }, []);

  /** Vor jedem Client-Werkzeug (ki-chat-werkzeuge.ts). seiteLesen ändert nichts
   *  am Bild und wartet nur auf die Reihe, nicht auf die Stimme. */
  const vorAusfuehrung = useCallback(
    async (werkzeug: string) => {
      if (!aktiv.current) return;
      const meinZug = zug.current;
      await pause(REIHE_ANLAUF_MS);
      await reihe.current;
      if (zug.current !== meinZug) return;
      if (werkzeug !== "seiteLesen") await warteAufStimme(meinZug);
    },
    [warteAufStimme],
  );

  /** Öffnet einen Bereich erst, wenn die Stimme den Satz davor gesprochen hat. */
  const oeffneImTakt = useCallback(
    (oeffne: () => void, ziel: string) => {
      const meinZug = zug.current;
      reihe.current = reihe.current
        .then(async () => {
          await warteAufStimme(meinZug);
          if (zug.current !== meinZug || !aktiv.current) return;
          oeffne();
          await wartePfad(ziel);
        })
        .catch(() => {});
    },
    [warteAufStimme],
  );

  /** Neue Frage oder Stopp: alles, was noch wartet, verfällt. */
  const neuerZug = useCallback(() => {
    zug.current += 1;
  }, []);

  return { stimme, aktiv, vorAusfuehrung, oeffneImTakt, neuerZug };
}
