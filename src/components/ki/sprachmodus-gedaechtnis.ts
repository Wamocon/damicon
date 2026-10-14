"use client";

import { useCallback, useRef, useState, type Dispatch, type RefObject, type SetStateAction } from "react";
import type { LiveSitzung } from "@/components/ki/diktat-live";
import { meldungNachEreignis, naechstePhase, type Ereignis, type Phase, type SprachMeldung } from "@/lib/domain/sprachmodus";

// Ablauf und Gedächtnis des Sprachmodus (sprachmodus.tsx), seit dem 14.10.2026 eigene Hooks.
//
// Der Ablauf hält die Phase, die Meldung unter Himbi und den mitlaufenden Text. Das Gedächtnis hält, was die Teile des
// Gesprächs gemeinsam lesen und schreiben: das Ohr, die Grenzen im Audio, die offene Frage, den Verdacht beim Dazwischenreden
// und die Zeitgeber. Alles darin sind Refs, keine Zustände: die Rückrufe der Erkennung, des Wächters und des Chats laufen
// außerhalb des Renderns und müssen sofort sehen, was der vorige Rückruf gesetzt hat. Die Namen enden auf "Ref", weil die
// anderen Hooks sie als Argument bekommen (react-hooks/immutability erkennt einen Ref über ein Argument nur am Namen).

/** So weit vor Himbis Verstummen wird noch nach einem Befehlswort gesucht. */
const BEFEHL_RUECKBLICK_MS = 3_000;

/** Das Ohr: EINE Aufnahme und EINE Live-Sitzung fuer das ganze Gespraech (seit dem
 *  28.09.2026, siehe ohrOffen in domain/sprachmodus.ts). startPerf ist der Nullpunkt der
 *  Zeitangaben, die Soniox je Wort liefert (ms ab dem ersten Audiostueck). */
type Ohr = { recorder: MediaRecorder; sitzung: LiveSitzung; startPerf: number };

/** Eine gestellte Frage mit den Sprachen, in denen sie erkannt wurde. */
type GestellteFrage = { text: string; sprachen: string[] };

export interface SprachAblauf {
  phase: Phase;
  phaseRef: RefObject<Phase>;
  meldung: SprachMeldung | null;
  zeigeMeldung: (m: SprachMeldung | null) => void;
  dispatch: (ereignis: Ereignis) => void;
  zwischentext: string;
  setZwischentext: Dispatch<SetStateAction<string>>;
}

export function useSprachAblauf(): SprachAblauf {
  const [phase, setPhase] = useState<Phase>("startet");
  const [zwischentext, setZwischentext] = useState("");
  // Wie lange eine Meldung steht, entscheidet meldungNachEreignis (domain/sprachmodus.ts) bei
  // jedem Ereignis des Ablaufs, siehe dispatch. Der Ref haelt sie sofort (wie phaseRef), damit
  // dispatch nur dann neu setzt, wenn sich etwas aendert.
  const [meldung, setMeldung] = useState<SprachMeldung | null>(null);
  const meldungRef = useRef<SprachMeldung | null>(null);
  const zeigeMeldung = useCallback((m: SprachMeldung | null) => {
    meldungRef.current = m;
    setMeldung(m);
  }, []);
  const phaseRef = useRef(phase);

  // Die Phase steht sofort im Ref, nicht erst nach dem naechsten Rendern: die Erkennung
  // meldet Text und Endpunkt oft im selben Durchlauf, und der zweite Aufruf muss schon
  // die Phase sehen, die der erste gesetzt hat.
  const dispatch = useCallback((ereignis: Ereignis) => {
    const bleibt = meldungNachEreignis(meldungRef.current, ereignis);
    if (bleibt !== meldungRef.current) zeigeMeldung(bleibt);
    const neu = naechstePhase(phaseRef.current, ereignis);
    if (neu === phaseRef.current) return;
    phaseRef.current = neu;
    setPhase(neu);
  }, [zeigeMeldung]);

  return { phase, phaseRef, meldung, zeigeMeldung, dispatch, zwischentext, setZwischentext };
}

export interface SprachGedaechtnis {
  ohrRef: RefObject<Ohr | null>;
  stromRef: RefObject<MediaStream | null>;
  ruheTimerRef: RefObject<number | undefined>;
  neuTimerRef: RefObject<number | undefined>;
  kandidatTimerRef: RefObject<number | undefined>;
  fehlversucheRef: RefObject<number>;
  grenzeMsRef: RefObject<number>;
  echoBisMsRef: RefObject<number>;
  befehlGeprueftMsRef: RefObject<number>;
  offeneFrageRef: RefObject<GestellteFrage | null>;
  vorsatzRef: RefObject<GestellteFrage | null>;
  nachUnterbrechungRef: RefObject<boolean>;
  echoBeimUnterbrechenRef: RefObject<string>;
  unterbrochenBeiRef: RefObject<string | null>;
  grenzeStehtRef: RefObject<boolean>;
  freigabeAbMsRef: RefObject<number | null>;
  freigabeNrRef: RefObject<number | null>;
  zuletztGehoertRef: RefObject<number>;
  verdachtRef: RefObject<{ abMs: number } | null>;
  verdachtTimerRef: RefObject<number | undefined>;
  sprichtSeitRef: RefObject<number | null>;
  hauptsprecherRef: RefObject<string | null>;
  beendenRef: RefObject<() => void>;
  starteOhrRef: RefObject<() => void>;
  /** Wo die nächste Frage beginnt (Audio-ms ab startPerf): hinter der harten Grenze und Himbis Echo. */
  frageAb: () => number;
  /** Ab wo nach einem Befehlswort gesucht wird: auch kurz vor Himbis Verstummen. */
  befehlAb: () => number;
  /** Die Audiozeit des Ohrs jetzt (0 ohne Ohr). */
  audioJetzt: () => number;
  schliesseOhr: () => void;
}

export function useSprachGedaechtnis(): SprachGedaechtnis {
  const ohrRef = useRef<Ohr | null>(null);
  const stromRef = useRef<MediaStream | null>(null);
  const ruheTimerRef = useRef<number | undefined>(undefined);
  const neuTimerRef = useRef<number | undefined>(undefined);
  const kandidatTimerRef = useRef<number | undefined>(undefined);
  const fehlversucheRef = useRef(0);
  // Grenzen im Audio (ms ab startPerf). Vor grenzeMs liegt sicher nichts fuer die naechste
  // Frage (eine fruehere Frage, ein erledigter Befehl). Bis echoBisMs war vermutlich Himbis
  // eigene Stimme - gesetzt, wenn er verstummt oder sein Echo endet. Die Frage beginnt hinter
  // beiden; Befehle werden aber auch kurz vor echoBisMs gesucht: wer "Stopp, zeig mir ..." genau
  // in eine Sprechpause von Himbi sagt (Seitenwechsel), hat vor dem Verstummen angefangen
  // (Messung vom 28.09.2026: aus der Frage wurde "mir lieber die Reklamationen").
  const grenzeMsRef = useRef(0);
  const echoBisMsRef = useRef(0);
  // Waehrend Himbi spricht: bis hierher (Audio-ms) ist die Befehlssuche gegen den damals
  // klingenden Satz abgeschlossen (befehlGeprueftBis). Spaeter gegen einen anderen Satz geprueft,
  // galt Himbis eigenes "Nein," sonst als Befehl (Befund der Gegenpruefung vom 28.09.2026).
  const befehlGeprueftMsRef = useRef(0);
  const frageAb = useCallback(() => Math.max(grenzeMsRef.current, echoBisMsRef.current), []);
  const befehlAb = useCallback(
    () => Math.max(grenzeMsRef.current, echoBisMsRef.current - BEFEHL_RUECKBLICK_MS, befehlGeprueftMsRef.current),
    [],
  );
  // Die zuletzt gestellte Frage - kommt waehrend des Nachdenkens noch etwas nach, wird
  // daraus EINE Frage (Nachsatz, Rueckmeldung vom 28.09.2026: "nach Ja hoert sie auf
  // zuzuhoeren und schaut nach").
  const offeneFrageRef = useRef<GestellteFrage | null>(null);
  const vorsatzRef = useRef<GestellteFrage | null>(null);
  // Nach einem Unterbrechen per Wort oder Stimme kann die naechste Aeusserung mit dem Befehl
  // beginnen ("Stopp, zeig mir lieber ..."); er wird dort abgeschnitten (frageNachUnterbrechung),
  // davor nur ein Rest von Himbis Echo. Nach einem Tipp nicht (beginntMitBefehl).
  const nachUnterbrechungRef = useRef(false);
  // Was Himbi beim Unterbrechen sagte (klingender und voriger Satz): nur diese Woerter duerfen
  // vor dem Befehl stehen.
  const echoBeimUnterbrechenRef = useRef("");
  // Der Satz, den Himbi sprach, als er unterbrochen wurde - geht mit der naechsten Frage
  // ans Modell, damit es weiss, was angekommen ist (Kontext bleibt erhalten).
  const unterbrochenBeiRef = useRef<string | null>(null);
  // Nach einem Unterbrechen per Stimme spricht der Nutzer schon weiter, wenn Himbi verstummt;
  // die Grenze steht dann am Einsatz seiner Stimme und darf bis zur naechsten Frage nicht nach
  // "jetzt" ruecken (auch nicht bei einer zweiten Meldung des Chats), sonst fiele "zeig mir
  // lieber ..." aus der naechsten Frage.
  const grenzeStehtRef = useRef(false);
  // Seit wann (Audio-ms) die offene Freigabekarte steht, und welche es ist: nur was danach
  // gesagt wurde, zaehlt als Antwort auf genau diese Karte.
  const freigabeAbMsRef = useRef<number | null>(null);
  const freigabeNrRef = useRef<number | null>(null);
  const zuletztGehoertRef = useRef(0);
  // Erste Stufe beim Dazwischenreden (domain/sprachmodus.ts, Abschnitt 5): Himbi spricht leiser,
  // bis die Woerter ab abMs (Audio-ms, Einsatz der Stimme) entscheiden. null: kein Verdacht.
  const verdachtRef = useRef<{ abMs: number } | null>(null);
  const verdachtTimerRef = useRef<number | undefined>(undefined);
  // Seit wann (Uhr) Himbi in dieser Antwort spricht: fuer den Nachsatz in den ersten Sekunden.
  const sprichtSeitRef = useRef<number | null>(null);
  // Mit Sprechertrennung (Schalter KI_SPRECHERTRENNUNG): die Nummer des Hauptsprechers dieser
  // Sitzung, aus der ersten angenommenen Frage. Ohne Sprechertrennung bleibt sie null.
  const hauptsprecherRef = useRef<string | null>(null);

  const audioJetzt = useCallback(() => {
    const ohr = ohrRef.current;
    return ohr ? performance.now() - ohr.startPerf : 0;
  }, []);

  const schliesseOhr = useCallback(() => {
    window.clearTimeout(kandidatTimerRef.current);
    const ohr = ohrRef.current;
    ohrRef.current = null;
    if (!ohr) return;
    ohr.sitzung.abbrechen();
    try {
      if (ohr.recorder.state !== "inactive") ohr.recorder.stop();
    } catch {
      // schon gestoppt
    }
  }, []);

  // beenden() und starteOhr() stehen weiter unten bzw. brauchen die Rueckrufe, die sie
  // selbst setzen - Ref-Umweg wie zuvor beim Wortbefehl.
  const beendenRef = useRef<() => void>(() => {});
  const starteOhrRef = useRef<() => void>(() => {});

  return {
    ohrRef,
    stromRef,
    ruheTimerRef,
    neuTimerRef,
    kandidatTimerRef,
    fehlversucheRef,
    grenzeMsRef,
    echoBisMsRef,
    befehlGeprueftMsRef,
    offeneFrageRef,
    vorsatzRef,
    nachUnterbrechungRef,
    echoBeimUnterbrechenRef,
    unterbrochenBeiRef,
    grenzeStehtRef,
    freigabeAbMsRef,
    freigabeNrRef,
    zuletztGehoertRef,
    verdachtRef,
    verdachtTimerRef,
    sprichtSeitRef,
    hauptsprecherRef,
    beendenRef,
    starteOhrRef,
    frageAb,
    befehlAb,
    audioJetzt,
    schliesseOhr,
  };
}
