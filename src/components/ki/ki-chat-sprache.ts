"use client";

// Sprachein- und -ausgabe des KI-Chats: buendelt den Vorlese-Zustand
// (useSprachausgabe), das Live-Vorlesen waehrend des Streamens
// (useLiveSprachausgabe) und den Diktat-Zustand (Mikrofon) - drei Zustaende,
// die immer gemeinsam betrachtet werden muessen (z. B. "sofort still, sobald
// getippt wird" oder "dieser Zug gilt als diktiert"), aber nichts mit dem
// Rendern des Chats selbst zu tun haben.

import { useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";
import { istVorlesbar, useSprachausgabe } from "@/components/ki/sprachausgabe";
import { useLiveSprachausgabe, type LiveAbschnitt } from "@/components/ki/sprachausgabe-live";

/** Die Sprache einer Antwort aus ihren Metadaten (api/ki-assistent schickt
 *  { sprache, sprachHerkunft } mit) - oder undefined bei alten Nachrichten. */
export function antwortSpracheAus(nachricht: UIMessage): string | undefined {
  const meta = nachricht.metadata as { sprache?: unknown } | undefined;
  return typeof meta?.sprache === "string" ? meta.sprache : undefined;
}

export function useKiChatSprache({
  sprache,
  messages,
  beschaeftigt,
  offen,
}: {
  /** Systemsprache (useLocale()). */
  sprache: string;
  messages: UIMessage[];
  beschaeftigt: boolean;
  /** Ob das Panel gerade offen ist (useKiPane().offen). */
  offen: boolean;
}) {
  const sprachausgabe = useSprachausgabe(sprache);

  // Vorgelesen wird live, wenn der Schalter an ist ODER die Frage diktiert
  // wurde: wer spricht, will hoeren - auch ohne den Schalter je gefunden zu
  // haben. Der Server entscheidet ueber KI_SPRACHAUSGABE_LIVE, ob ueberhaupt
  // Abschnitte kommen; hier steht nur, ob sie gesprochen werden sollen.
  // Gilt fuer GENAU EINEN Zug: wer einmal diktiert hat, bekommt nicht fuer
  // den Rest der Sitzung alles vorgelesen. Beim naechsten Absenden wird neu
  // entschieden.
  const [zugDiktiert, setZugDiktiert] = useState(false);
  const zuletztDiktiert = useRef(false);
  const live = useLiveSprachausgabe(sprachausgabe.vorlesen || zugDiktiert);
  const gesehenerAbschnitt = useRef(new Set<string>());

  const [diktiert, setDiktiert] = useState(false);
  const diktatSprachen = useRef<string[] | undefined>(undefined);

  // "Antworten vorlesen" an: die neue Antwort nach Streamende einmal vorlesen -
  // nur beim Wechsel von "laeuft" zu "fertig", nie fuer den geladenen Verlauf
  // und nie zweimal dieselbe Antwort.
  const warBeschaeftigt = useRef(false);
  const vorgelesen = useRef(new Set<string>());
  useEffect(() => {
    const jetztFertig = warBeschaeftigt.current && !beschaeftigt;
    warBeschaeftigt.current = beschaeftigt;
    if (!jetztFertig || !sprachausgabe.vorlesen) return;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant" || !istVorlesbar(letzte.id) || vorgelesen.current.has(letzte.id)) return;
    vorgelesen.current.add(letzte.id);
    // Kamen fuer diese Antwort schon Live-Abschnitte, ist sie schon
    // (oder noch) gesprochen. Bis zum 24.09.2026 las Weg 1 sie danach ein
    // zweites Mal von vorn - ueber die Live-Stimme hinweg.
    if (gesehenerAbschnitt.current.size > 0) return;
    void sprachausgabe.spiele(letzte.id, antwortSpracheAus(letzte));
  }, [beschaeftigt, messages, sprachausgabe]);

  // Panel zu heisst still. Es bleibt gemountet, damit eine laufende
  // Antwort nicht abreisst - gesprochen wird trotzdem nicht weiter.
  // Beide Wege: die Live-Abschnitte und die ganze vorgelesene Antwort.
  const stoppeVorlesen = sprachausgabe.stoppe;
  useEffect(() => {
    if (!offen) {
      live.stoppeAlles();
      stoppeVorlesen();
    }
  }, [offen, live, stoppeVorlesen]);

  // Abschnitte aus dem Stream ans Vorlesen weiterreichen. Jeder nur einmal:
  // useChat liefert die Nachricht bei jedem Render erneut, samt aller schon
  // gesehenen Teile.
  useEffect(() => {
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return;
    for (const teil of letzte.parts as Array<{ type: string; data?: unknown }>) {
      if (teil.type !== "data-satz" || !teil.data) continue;
      const a = teil.data as LiveAbschnitt & { sprache?: string };
      const schluessel = `${a.zug}#${a.nr}`;
      if (gesehenerAbschnitt.current.has(schluessel)) continue;
      gesehenerAbschnitt.current.add(schluessel);
      // Die Sprache kommt vom Zug, nicht aus der Oberflaeche: der Text
      // antwortet in der Sprache der Frage, und die Stimme folgt ihm.
      live.nimmAbschnitt(a, a.sprache ?? sprache);
    }
  }, [messages, live, sprache]);

  /** Alles, was gerade spricht, verstummt: Live-Abschnitte UND die ganze
   *  vorgelesene Antwort (Weg 1). Bis zum 24.09.2026 hielten Stopp,
   *  Mikrofon, Tippen und neue Frage nur die Live-Abschnitte an - die ganze
   *  Antwort sprach weiter, auch ins Diktat hinein. */
  function stoppeAlles() {
    live.stoppeAlles();
    sprachausgabe.stoppe();
  }

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
   *  den Diktat-/Live-Zustand fuer die neue Runde zurueck. */
  function beginneZug(): string[] | undefined {
    stoppeAlles();
    // Auf dem iPhone darf Ton nur aus einer Geste heraus starten - dieser
    // Klick ist die Geste. Spaeter, beim ersten Abschnitt, waere es zu
    // spaet: der Browser bliebe stumm, ohne einen Fehler zu melden.
    live.entsperre();
    // Die gehoerten Sprachen gelten genau fuer diese eine Frage.
    const gehoerteSprachen = diktatSprachen.current;
    diktatSprachen.current = undefined;
    // Und ebenso, ob dieser Zug diktiert wurde: eine getippte Frage danach
    // wird nicht mehr von selbst vorgelesen.
    setZugDiktiert(zuletztDiktiert.current);
    zuletztDiktiert.current = false;
    // Die gesehenen Abschnitte gehoeren zum vorigen Zug - sonst waechst die
    // Liste ueber eine lange Sitzung immer weiter.
    gesehenerAbschnitt.current.clear();
    return gehoerteSprachen;
  }

  return {
    sprachausgabe,
    live,
    diktiert,
    stoppeAlles,
    beiMikrofonStart,
    beiMikrofonAufnahme,
    merkeDiktatSprachen,
    beginneZug,
  };
}
