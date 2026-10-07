// Takt zwischen Stimme und Bildschirm im Sprachmodus: das Warten auf die Saetze vor einer
// Handlung, ohne React und ohne Browser (components/ki/sprach-takt.ts ruft es mit den echten
// Quellen auf, supabase/tests/ki-assistent.mjs mit Attrappen und falscher Zeit).

import type { VorlesePhase } from "./vorlesen-zustand";

/** So oft wird nachgesehen, wo die Stimme ist. */
export const TAKT_MS = 120;
/** Ohne Satzposition: so viele Takte still hintereinander, dann gilt alles als gesprochen. */
export const STILL_NOETIG = 2;
/** Laenger wartet eine Handlung nie auf die Stimme. */
export const MAX_WARTEN_MS = 30_000;
/** Ohne Satzposition bleibt nur "still": dann nicht laenger warten, sonst kaeme ein Wechsel
 *  erst nach der ganzen Antwort. */
export const OHNE_POSITION_MAX_MS = 6_000;
/** Notbremse MIT Satzposition: so lange darf die Stimme still bleiben, ohne dass der Satz vor
 *  der Handlung klingt, dann laeuft die Handlung trotzdem (Vorlesen gescheitert oder aus).
 *  Laenger als der Weg eines Satzes bis zum Ton, gemessen am 28.09.2026 bis 2,4 s. */
export const STILL_OHNE_SATZ_MAX_MS = 4_000;

/** Woher das Warten seine Werte bekommt. */
export interface TaktQuellen {
  /** Gilt das Warten noch (kein neuer Zug, Sprachmodus an)? */
  gilt(): boolean;
  /** Wo die Stimme ist (sprachausgabe-strom.ts, stand()); null ohne Satzposition. */
  stand(): { index: number } | null;
  /** Was die Stimme gerade tut. */
  stimme(): VorlesePhase;
  pause(ms: number): Promise<void>;
}

export type TaktErgebnis = "marke" | "still" | "deckel" | "abgeloest";

/** Wartet, bis der Satz mit der Nummer `marke` klingt (alles davor ist gesprochen). `marke`
 *  null: keine Satzposition, dann genuegt eine kurz stille Stimme.
 *
 *  Messung an der Preview vom 28.09.2026: die Freigabekarte "Der Agent moechte klicken" stand
 *  bei 0 ms, Himbi sagte "Ich klicke jetzt auf Anlegen" erst 1,5 bis 2,4 s spaeter. Die Ursache
 *  lag in der Satzposition selbst (sprachausgabe-strom.ts, stand(): ein Satz, dessen Text an
 *  Soniox ging, galt in der Stille davor schon als gesprochen). Hier kam ein zweiter Weg dazu:
 *  bis zum 29.09.2026 genuegten auch MIT Satzposition zwei stille Takte (240 ms), und still ist
 *  die Stimme auch, wenn sie den Satz noch gar nicht hat. Mit Satzposition zaehlt deshalb nur
 *  die Marke; Stille nur als Notbremse (STILL_OHNE_SATZ_MAX_MS). */
export async function warteBisMarke(q: TaktQuellen, marke: number | null): Promise<TaktErgebnis> {
  let stillMs = 0;
  const deckel = marke === null ? OHNE_POSITION_MAX_MS : MAX_WARTEN_MS;
  const stillReicht = marke === null ? STILL_NOETIG * TAKT_MS : STILL_OHNE_SATZ_MAX_MS;
  for (let ms = 0; ms < deckel; ms += TAKT_MS) {
    if (!q.gilt()) return "abgeloest";
    const jetzt = q.stand();
    if (marke !== null && jetzt && jetzt.index >= marke) return "marke";
    stillMs = q.stimme() === "still" ? stillMs + TAKT_MS : 0;
    if (stillMs >= stillReicht) return "still";
    await q.pause(TAKT_MS);
  }
  return "deckel";
}
