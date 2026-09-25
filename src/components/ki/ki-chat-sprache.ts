"use client";

// Sprachein- und -ausgabe des KI-Chats: buendelt den Vorlese-Zustand
// (useSprachausgabe), das Live-Vorlesen waehrend des Streamens
// (useLiveSprachausgabe) und den Diktat-Zustand (Mikrofon) - drei Zustaende,
// die immer gemeinsam betrachtet werden muessen (z. B. "sofort still, sobald
// getippt wird" oder "dieser Zug gilt als diktiert"), aber nichts mit dem
// Rendern des Chats selbst zu tun haben.
//
// Seit 24.09.2026 EINE Vorlese-Instanz nach aussen (`vorlesen`): Schalter,
// Knopf an der Nachricht, Stopp-Wege und der Sprachmodus sprechen alle mit ihr.
// Vorher gab es zwei Wiedergaben ohne gemeinsame Hoheit - die Zusammenfassung
// nach der Tour las live vor, der Schalter zeigte "aus" und konnte sie nicht
// beenden (ein Klick schaltete ihn sogar dauerhaft an), und der Knopf an einer
// Nachricht startete eine zweite Stimme ueber die erste.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { istVorlesbar, useSprachausgabe } from "@/components/ki/sprachausgabe";
import { useLiveSprachausgabe, type LiveAbschnitt, type ZugNachweis } from "@/components/ki/sprachausgabe-live";
import {
  nachSchalterKlick,
  schalterZeigtAn,
  vorlesenErlaubt,
  wunschFuerZug,
  type VorlesePhase,
  type ZugZustand,
} from "@/lib/domain/vorlesen-zustand";

/** Die Sprache einer Antwort aus ihren Metadaten (api/ki-assistent schickt
 *  { sprache, sprachHerkunft } mit) - oder undefined bei alten Nachrichten. */
export function antwortSpracheAus(nachricht: UIMessage): string | undefined {
  const meta = nachricht.metadata as { sprache?: unknown } | undefined;
  return typeof meta?.sprache === "string" ? meta.sprache : undefined;
}

export interface Vorlesen {
  /** Was der Schalter zeigt: an, solange vorgelesen wird oder die Einstellung an ist. */
  schalterAn: boolean;
  phase: VorlesePhase;
  /** Schalter geklickt - was dann gilt, steht in nachSchalterKlick()
   *  (domain/vorlesen-zustand.ts). */
  schalte(): void;
  /** Wird diese Nachricht gerade gelesen (oder geladen)? Dann zeigt ihr Knopf Stopp. */
  liest(id: string): boolean;
  /** Knopf an einer Nachricht: liest sie gerade, still; sonst alles andere still
   *  und diese vorlesen. */
  knopf(id: string, text: string, antwortSprache: string | undefined): void;
  /** Meldung am Knopf (keine Stimme, Fehler) - nur beim bisherigen Weg. */
  hinweis(id: string): "keineStimme" | "fehler" | null;
}

export function useKiChatSprache({
  sprache,
  messages,
  beschaeftigt,
  offen,
  sprachmodus = false,
}: {
  /** Systemsprache (useLocale()). */
  sprache: string;
  messages: UIMessage[];
  beschaeftigt: boolean;
  /** Ob das Panel gerade offen ist (useKiPane().offen). */
  offen: boolean;
  /** Sprachmodus: jede Antwort wird vorgelesen, auch bei geschlossenem Panel. */
  sprachmodus?: boolean;
}) {
  const sprachausgabe = useSprachausgabe(sprache);
  const spieleDatei = sprachausgabe.spiele;

  // Gilt fuer GENAU EINEN Zug: wer einmal diktiert hat, bekommt nicht fuer den
  // Rest der Sitzung alles vorgelesen. Beim naechsten Absenden wird neu entschieden.
  const [zug, setZug] = useState<ZugZustand>({ wunsch: "normal", stumm: false });
  const zuletztDiktiert = useRef(false);
  // Sprache je vorgelesener Nachricht - fuer den Rueckfall unten.
  const nachrichtSprache = useRef(new Map<string, string>());
  const beiNachrichtOhneStrom = useCallback(
    (id: string) => {
      // Der Strom hat fuer eine Nachricht aufgegeben, bevor etwas klang: dann
      // der bisherige Weg, die ganze Antwort als Datei.
      void spieleDatei(id, nachrichtSprache.current.get(id));
    },
    [spieleDatei],
  );
  const live = useLiveSprachausgabe({ beiNachrichtOhneStrom });

  // Regeln: domain/vorlesen-zustand.ts. Panel zu heisst still, ausser im
  // Sprachmodus (der Chat bleibt gemountet, damit eine laufende Antwort nicht abreisst).
  const liveErlaubt = vorlesenErlaubt({ sprachmodus, offen, einstellung: sprachausgabe.einstellung, zug });

  // Alle Abschnitte dieses Zuges, auch die nicht vorgelesenen - wer den Schalter
  // mitten in der Antwort einschaltet, hoert sie von vorn.
  const rundenAbschnitte = useRef<Array<{ a: LiveAbschnitt; sprache: string }>>([]);
  const gesehenerAbschnitt = useRef(new Set<string>());
  // Der Nachweis dieser Antwort (data-nachweis): fuer den Schluessel des Stroms.
  const rundenNachweis = useRef<ZugNachweis | null>(null);

  const [diktiert, setDiktiert] = useState(false);
  const diktatSprachen = useRef<string[] | undefined>(undefined);

  const phase: VorlesePhase =
    live.phase !== "still" ? live.phase : sprachausgabe.spielt ? "spricht" : sprachausgabe.laedt ? "laedt" : "still";

  const liveStopp = live.stoppeAlles;
  const dateiStopp = sprachausgabe.stoppe;
  const stoppeLiveUndDatei = useCallback(() => {
    liveStopp();
    dateiStopp();
  }, [liveStopp, dateiStopp]);

  /** Alles, was gerade spricht, verstummt, und dieser Zug bleibt stumm. Stopp,
   *  Mikrofon, Tippen, Schalter aus, Unterbrechen im Sprachmodus. */
  const stoppeAlles = useCallback(() => {
    stoppeLiveUndDatei();
    setZug((z) => (z.stumm ? z : { ...z, stumm: true }));
  }, [stoppeLiveUndDatei]);

  // Panel zu heisst still - aber nie im Sprachmodus: dort ist das Panel immer zu,
  // und die Stimme ist die Antwort. Bis zum 24.09.2026 hing dieser Effekt am
  // ganzen live-Objekt, lief bei jedem Zustandswechsel des Vorlesens erneut und
  // hielt so auch den Sprachmodus an.
  useEffect(() => {
    if (!offen && !sprachmodus) stoppeLiveUndDatei();
  }, [offen, sprachmodus, stoppeLiveUndDatei]);

  // Abschnitte aus dem Stream ans Vorlesen weiterreichen. Jeder nur einmal:
  // useChat liefert die Nachricht bei jedem Render erneut, samt aller schon
  // gesehenen Teile.
  const nimmAbschnitt = live.nimmAbschnitt;
  const nimmNachweis = live.nimmNachweis;
  const folgeQuelle = live.folgeQuelle;
  useEffect(() => {
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return;
    // Bei Folgeanfragen bekommt die Nachricht eine neue ID - der Knopf an ihr
    // bleibt der Stopp, solange die Runde liest.
    folgeQuelle(letzte.id);
    for (const teil of letzte.parts as Array<{ type: string; data?: unknown }>) {
      if (teil.type === "data-nachweis" && teil.data) {
        const n = teil.data as ZugNachweis;
        const schluessel = `nachweis#${n.zug}`;
        if (gesehenerAbschnitt.current.has(schluessel)) continue;
        gesehenerAbschnitt.current.add(schluessel);
        rundenNachweis.current = n;
        // Schluessel fuer den Strom schon jetzt, waehrend das Modell denkt -
        // aber nur, wenn auch vorgelesen wird (jeder Schluessel kostet).
        if (liveErlaubt) nimmNachweis(n);
        continue;
      }
      if (teil.type !== "data-satz" || !teil.data) continue;
      const a = teil.data as LiveAbschnitt & { sprache?: string };
      const schluessel = `${a.zug}#${a.nr}`;
      if (gesehenerAbschnitt.current.has(schluessel)) continue;
      gesehenerAbschnitt.current.add(schluessel);
      // Die Sprache kommt vom Zug, nicht aus der Oberflaeche: der Text
      // antwortet in der Sprache der Frage, und die Stimme folgt ihm.
      const eintrag = { a, sprache: a.sprache ?? sprache };
      rundenAbschnitte.current.push(eintrag);
      if (liveErlaubt) {
        if (rundenNachweis.current) nimmNachweis(rundenNachweis.current);
        nimmAbschnitt(a, eintrag.sprache);
      }
    }
  }, [messages, nimmAbschnitt, nimmNachweis, folgeQuelle, sprache, liveErlaubt]);

  // Antwort fertig: der Strom bekommt kein Wort mehr - und kamen gar keine
  // Abschnitte (Live-Vorlesen serverseitig aus), wird die fertige Antwort
  // einmal vorgelesen, wenn vorgelesen werden soll.
  const warBeschaeftigt = useRef(false);
  // Wie weit die LETZTE Nachricht schon vorgelesen ist (Position und Laenge des
  // Textes). Nach einer Freigabe laeuft dieselbe Nachricht mit neuer ID weiter -
  // gelesen wird dann nur der neue Teil, nicht alles noch einmal von vorn.
  const vorgelesenBis = useRef<{ stelle: number; zeichen: number } | null>(null);
  const schliesseRunde = live.schliesseRunde;
  const sprichNachricht = live.sprichNachricht;
  useEffect(() => {
    const jetztFertig = warBeschaeftigt.current && !beschaeftigt;
    warBeschaeftigt.current = beschaeftigt;
    if (!jetztFertig) return;
    schliesseRunde();
    if (!liveErlaubt || rundenAbschnitte.current.length > 0) return;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant" || !istVorlesbar(letzte.id)) return;
    const stelle = messages.length - 1;
    const ganz = letzte.parts.flatMap((t) => (t.type === "text" ? [t.text] : [])).join("\n\n");
    const schon = vorgelesenBis.current?.stelle === stelle ? vorgelesenBis.current.zeichen : 0;
    const neu = ganz.slice(schon).trim();
    vorgelesenBis.current = { stelle, zeichen: ganz.length };
    if (!neu) return;
    const antwortSprache = antwortSpracheAus(letzte) ?? sprache;
    nachrichtSprache.current.set(letzte.id, antwortSprache);
    // Der Datei-Weg liest die gespeicherte Zeile dieser ID - die enthaelt nur
    // den Teil dieser Anfrage, also ebenfalls nur das Neue.
    if (!sprichNachricht(letzte.id, neu, antwortSprache)) void spieleDatei(letzte.id, antwortSprache);
  }, [beschaeftigt, messages, liveErlaubt, schliesseRunde, sprichNachricht, spieleDatei, sprache]);

  /** MikrofonKnopf: Klick auf das Mikrofon, noch bevor es offen ist. */
  function beiMikrofonStart() {
    stoppeAlles();
  }

  /** MikrofonKnopf: Aufnahme startet/endet. */
  function beiMikrofonAufnahme(an: boolean) {
    setDiktiert(an);
    // Mikrofon an: sofort still, sonst nimmt das Mikrofon die
    // eigene Stimme des Assistenten mit auf.
    if (an) stoppeAlles();
    // Mikrofon aus ist eine Geste - der richtige Moment, den
    // AudioContext zu entsperren (iPhone), und dieser Zug wird
    // vorgelesen, auch wenn der Schalter aus ist.
    else {
      live.entsperre();
      zuletztDiktiert.current = true;
    }
  }

  /** MikrofonKnopf: erkannter Text. Merkt nur die gehoerten Sprachen - das
   *  Einsetzen in das Eingabefeld bleibt Sache des Composers (ki-chat.tsx
   *  kennt eingabeRef/beiEingabe). */
  function merkeDiktatSprachen(sprachen: string[] | undefined) {
    diktatSprachen.current = sprachen;
  }

  /** sende() in ki-chat.tsx: einmal je abgeschickter Frage. Liefert die
   *  Sprachen, die beim Diktat gehoert wurden (fuer anfrageDaten), und setzt
   *  den Diktat-/Live-Zustand fuer die neue Runde zurueck.
   *
   *  `ausFeld`: die Frage kommt aus dem Eingabefeld - nur dann gehoeren die
   *  Diktat-Sprachen dazu. Eine Frage, die die Oberflaeche selbst stellt
   *  (Zusammenfassung nach der Tour, Vorschlag, Frage von Himbi), steht in der
   *  Oberflaechensprache und darf weder die Diktat-Sprachen bekommen noch sie
   *  verbrauchen: sie gehoeren zu dem Text, der noch im Feld steht. Bis zum
   *  24.09.2026 bekam JEDE Frage die zuletzt diktierten Sprachen, und der
   *  Server zieht sie der Sprache der Frage vor - wer vorher deutsch diktiert
   *  hatte, bekam die russisch gestellte Tour-Frage auf Deutsch beantwortet.
   *
   *  `erzwingeVorlesen`: unabhaengig von alledem - fuer eine Frage, die IMMER
   *  gesprochen werden soll, auch ohne Diktat und ohne den Schalter "Antworten
   *  vorlesen" (die Zusammenfassung nach der gefuehrten Tour, use-compliance-
   *  tour.tsx: dort ist Sprechen der Sinn der Funktion, kein Diktat-Nebeneffekt).
   *  Abschalten laesst sie sich trotzdem: der Schalter zeigt waehrenddessen "an"
   *  und beendet sie mit einem Klick. */
  function beginneZug(ausFeld = false, erzwingeVorlesen = false): string[] | undefined {
    // Neue Runde: alles Alte verstummt, der Schluessel fuer den Strom wird
    // schon geholt. Auf dem iPhone darf Ton nur aus einer Geste heraus starten -
    // dieser Klick ist die Geste; spaeter, beim ersten Satz, waere es zu spaet.
    sprachausgabe.stoppe();
    live.neueRunde();
    live.entsperre();
    rundenAbschnitte.current = [];
    rundenNachweis.current = null;
    // Die gesehenen Abschnitte gehoeren zum vorigen Zug - aber die der LETZTEN
    // Antwort bleiben als gesehen markiert. Bis die neue Frage in messages
    // steht, vergeht ein Render, und in dem liefe der Effekt oben mit der alten
    // Antwort erneut: sie wurde komplett noch einmal vorgelesen (Pruefung vom
    // 24.09.2026). Die Menge waechst dabei nicht ueber eine Antwort hinaus.
    const letzte = messages.at(-1);
    gesehenerAbschnitt.current = new Set(
      (letzte?.role === "assistant" ? (letzte.parts as Array<{ type: string; data?: unknown }>) : [])
        .map((teil) => {
          const d = teil.data as { zug?: string; nr?: number } | undefined;
          if (teil.type === "data-satz" && d) return `${d.zug}#${d.nr}`;
          if (teil.type === "data-nachweis" && d) return `nachweis#${d.zug}`;
          return "";
        })
        .filter(Boolean),
    );
    if (!ausFeld) {
      // Nicht diktiert, und nichts vom Diktat verbrauchen - aber erzwingeVorlesen
      // gilt unabhaengig davon.
      setZug({ wunsch: wunschFuerZug(false, erzwingeVorlesen, false), stumm: false });
      return undefined;
    }
    // Die gehoerten Sprachen gelten genau fuer diese eine Frage.
    const gehoerteSprachen = diktatSprachen.current;
    diktatSprachen.current = undefined;
    // Und ebenso, ob dieser Zug diktiert wurde: eine getippte Frage danach
    // wird nicht mehr von selbst vorgelesen.
    setZug({ wunsch: wunschFuerZug(true, erzwingeVorlesen, zuletztDiktiert.current), stumm: false });
    zuletztDiktiert.current = false;
    return gehoerteSprachen;
  }

  const schalterAn = schalterZeigtAn({ einstellung: sprachausgabe.einstellung, phase, beschaeftigt, zug });
  const vorlesen: Vorlesen = {
    schalterAn,
    phase,
    schalte() {
      const folge = nachSchalterKlick({ anGezeigt: schalterAn, beschaeftigt, phase, zug, hatAbschnitte: rundenAbschnitte.current.length > 0 });
      sprachausgabe.setVorlesen(folge.einstellung);
      if (folge.stoppen) stoppeLiveUndDatei();
      setZug(folge.zug);
      // Mitten in einer Antwort eingeschaltet: von vorn, was bisher kam. Die
      // Stimme klingt, weil dieser Klick die Geste ist (iPhone).
      if (folge.vonVorn) {
        live.stoppeAlles();
        live.entsperre();
        if (rundenNachweis.current) live.nimmNachweis(rundenNachweis.current);
        for (const { a, sprache: s } of rundenAbschnitte.current) live.nimmAbschnitt(a, s);
        if (!beschaeftigt) live.schliesseRunde();
      }
    },
    liest(id) {
      return live.quelle === id || sprachausgabe.spielt === id || sprachausgabe.laedt === id;
    },
    knopf(id, text, antwortSprache) {
      const lasGerade = vorlesen.liest(id);
      // In jedem Fall: alles still, und der laufende Zug liest nicht weiter -
      // sonst spraechen zwei Stimmen.
      stoppeAlles();
      if (lasGerade) return;
      const s = antwortSprache ?? sprache;
      nachrichtSprache.current.set(id, s);
      if (!live.sprichNachricht(id, text, s)) void spieleDatei(id, s);
    },
    hinweis(id) {
      return sprachausgabe.hinweis?.id === id ? sprachausgabe.hinweis.art : null;
    },
  };

  return {
    vorlesen,
    live,
    diktiert,
    stoppeAlles,
    beiMikrofonStart,
    beiMikrofonAufnahme,
    merkeDiktatSprachen,
    beginneZug,
  };
}
