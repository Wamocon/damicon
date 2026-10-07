// Die Regeln des Vorlesens im Chat - reine Logik, damit supabase/tests/
// ki-assistent.mjs sie Fall fuer Fall durchspielen kann. Angewendet in
// components/ki/ki-chat-sprache.ts.
//
// Bis zum 24.09.2026 entschieden zwei Wiedergaben unabhaengig voneinander,
// und der Schalter "Antworten vorlesen" zeigte nur seine gespeicherte
// Einstellung. Rueckmeldung: die Zusammenfassung nach der Tour liess sich
// nicht abschalten, und waehrend sie lief, konnte man die Vorlesefunktion im
// Chat zusaetzlich anschalten.

export type VorlesePhase = "still" | "laedt" | "spricht";

/** Warum der laufende Zug vorgelesen wird, auch ohne den Schalter. */
export type ZugWunsch = "normal" | "diktiert" | "erzwungen";

/** Zustand des laufenden Zuges. `stumm`: jemand hat ihn gestoppt - er wird
 *  nicht weiter vorgelesen, auch wenn noch Saetze kommen. */
export interface ZugZustand {
  wunsch: ZugWunsch;
  stumm: boolean;
}

/** Wunsch fuer einen neuen Zug. Erzwungen (Tour-Zusammenfassung, Frage aus dem
 *  Pruefbericht) gewinnt; diktiert nur, wenn die Frage aus dem Eingabefeld kommt
 *  und zuletzt diktiert wurde. */
export function wunschFuerZug(ausFeld: boolean, erzwingeVorlesen: boolean, zuletztDiktiert: boolean): ZugWunsch {
  if (erzwingeVorlesen) return "erzwungen";
  return ausFeld && zuletztDiktiert ? "diktiert" : "normal";
}

/** Die Einstellung "Antworten vorlesen": true (an), false (AUSDRUECKLICH aus -
 *  jemand hat den Schalter ausgeschaltet) oder null (nie eingestellt). Nur ein
 *  ausdrueckliches "aus" haelt auch die Tour-Zusammenfassung und diktierte
 *  Fragen still; wer nie etwas eingestellt hat, hoert sie. */
export type VorleseEinstellung = boolean | null;

/** Werden die Saetze des laufenden Zuges vorgelesen?
 *
 *  Im Sprachmodus immer, ausser nach einem Stopp (die Stimme ist dort die
 *  Antwort, das Panel ist immer zu). Sonst nur bei offenem Panel, nie nach
 *  einem Stopp, und nur, wenn die Einstellung an ist - oder der Zug diktiert
 *  bzw. erzwungen ist und niemand ausdruecklich "aus" gesagt hat. */
export function vorlesenErlaubt(e: { sprachmodus: boolean; offen: boolean; einstellung: VorleseEinstellung; zug: ZugZustand }): boolean {
  if (e.sprachmodus) return !e.zug.stumm;
  return e.offen && !e.zug.stumm && (e.einstellung === true || (e.zug.wunsch !== "normal" && e.einstellung !== false));
}

/** Was der Schalter zeigt: an, wenn die Einstellung an ist, wenn gerade etwas
 *  vorgelesen wird oder geladen wird, oder wenn der laufende Zug gleich
 *  vorgelesen wird (erzwungen/diktiert, noch nicht gestoppt). Dann ist ein
 *  Klick auf ihn der Stopp. */
export function schalterZeigtAn(e: { einstellung: VorleseEinstellung; phase: VorlesePhase; beschaeftigt: boolean; zug: ZugZustand }): boolean {
  return (
    e.einstellung === true ||
    e.phase !== "still" ||
    (e.beschaeftigt && !e.zug.stumm && e.zug.wunsch !== "normal" && e.einstellung !== false)
  );
}

/** Klick auf den Schalter: was danach gilt. Aus heisst sofort still, dieser Zug
 *  bleibt stumm, und die Einstellung ist aus - auch wenn sie gar nicht an war
 *  (erzwungener Zug). An heisst Einstellung an, der Zug ist nicht mehr stumm,
 *  und laeuft gerade eine Antwort, wird sie von vorn vorgelesen. */
export function nachSchalterKlick(
  e: { anGezeigt: boolean; beschaeftigt: boolean; phase: VorlesePhase; zug: ZugZustand; hatAbschnitte: boolean },
): { einstellung: boolean; zug: ZugZustand; stoppen: boolean; vonVorn: boolean } {
  if (e.anGezeigt) return { einstellung: false, zug: { ...e.zug, stumm: true }, stoppen: true, vonVorn: false };
  return {
    einstellung: true,
    zug: { ...e.zug, stumm: false },
    stoppen: false,
    vonVorn: e.hatAbschnitte && (e.beschaeftigt || e.phase !== "still"),
  };
}
