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
//
// Wichtig: gewartet wird nur auf die Sätze VOR der Handlung (Sprechmarke), nicht
// auf alles, was danach noch gesprochen wird. Der Text hinter einem
// Bereichswechsel geht sofort an die Stimme; hinge der Wechsel an "die Stimme
// ist still", käme er erst nach der ganzen Antwort ("Ich öffne den Bereich Feld"
// und die Feldkarte wird beschrieben, ohne dass die Seite wechselt).

import { useCallback, useRef } from "react";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";
import type { SprechStand } from "@/components/ki/sprachausgabe-strom";

// Bis die Sätze aus dem Stream beim Vorlesen angekommen sind, steht die Stimme
// noch still, obwohl gleich gesprochen wird.
const ANKOMMEN_MS = 450;
const TAKT_MS = 150;
const STILL_NOETIG = 2;
const MAX_WARTEN_MS = 30_000;
// Ohne Satzposition (Vorlesen über einzelne Abschnitte) bleibt nur "still":
// dann nicht länger warten, sonst käme ein Wechsel erst nach der ganzen Antwort.
const OHNE_POSITION_MAX_MS = 6_000;
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

  /** Vom Chat gesetzt: wo die Stimme ist (nur im Strom-Weg). */
  const stand = useRef<(() => SprechStand | null) | null>(null);

  /** Wartet, bis der Satz mit der Nummer `marke` klingt (alles davor ist gesprochen)
   *  oder die Stimme ganz still ist. `marke` null: nur auf still warten. */
  const warteBisMarke = useCallback(async (meinZug: number, marke: number | null) => {
    let still = 0;
    const deckel = marke === null ? OHNE_POSITION_MAX_MS : MAX_WARTEN_MS;
    for (let ms = 0; ms < deckel; ms += TAKT_MS) {
      if (zug.current !== meinZug || !aktiv.current) return;
      const jetzt = stand.current?.() ?? null;
      if (marke !== null && jetzt && jetzt.index >= marke) return;
      still = stimme.current === "still" ? still + 1 : 0;
      if (still >= STILL_NOETIG) return;
      await pause(TAKT_MS);
    }
  }, []);

  /** Alles, was bis jetzt gesagt werden soll, ist gesprochen (Client-Werkzeug: der
   *  Schritt endet mit dem Aufruf, es kommt kein Text mehr dahinter). */
  const warteAufStimme = useCallback(
    async (meinZug: number) => {
      await pause(ANKOMMEN_MS);
      await warteBisMarke(meinZug, stand.current?.()?.anzahl ?? null);
    },
    [warteBisMarke],
  );

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
          if (zug.current !== meinZug || !aktiv.current) return;
          oeffne();
          await wartePfad(ziel);
        })
        .catch(() => {});
    },
    [warteBisMarke],
  );

  /** Neue Frage oder Stopp: alles, was noch wartet, verfällt. */
  const neuerZug = useCallback(() => {
    zug.current += 1;
  }, []);

  return { stimme, aktiv, stand, marke, vorAusfuehrung, oeffneImTakt, neuerZug };
}
