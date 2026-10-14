"use client";

// Die Anfrage des KI-Chats an src/app/api/ki-assistent/route.ts (ki-chat.tsx):
// was bei JEDER Anfrage mitgeht, welcher Teil des Verlaufs ans Modell geht, und
// der Transport, über den useChat sie schickt und den Antwortstrom liest.

import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react";
import { DefaultChatTransport, type UIMessage } from "ai";
import type { KiModus } from "@/components/ki/ki-pane-kontext";
import { seitenKarte } from "@/components/ki/ui-steuerung";
import { mitGehoertenAntworten } from "@/lib/domain/sprachmodus";
import type { Role } from "@/lib/rbac";

/** Der Modus eines Zuges: die Einstellung (assistent, agent) oder der Sprachmodus. */
export type ZugModus = KiModus | "sprache";

// Im Sprachmodus gehen so viele Nachrichten von VOR seinem Beginn mit (eine Frage
// und ihre Antwort), damit ein "erklaer mir das genauer" noch weiss, worum es ging.
const VOR_SPRACHMODUS = 2;

export interface AnfrageWerte {
  einwilligung: boolean;
  modus: ZugModus;
  pfad: string;
  rolle: Role;
  sprache: string;
  /** Der Prüfbericht, auf dem das Gespräch aufsetzt, sonst undefined (im Sprachmodus nie). */
  pruefkontext: string | undefined;
}

/** Ab welcher Nachricht der Verlauf ans Modell geht: im Sprachmodus nur das laufende Gespräch und die Frage davor. */
function verlaufAb(alle: UIMessage[], imSprachmodus: boolean, start: number | null): number {
  let ab = imSprachmodus && start !== null ? Math.max(0, Math.min(start, alle.length - 1) - VOR_SPRACHMODUS) : 0;
  // Der Verlauf fuers Modell beginnt immer mit einer Frage, nie mit einer Antwort.
  while (ab > 0 && alle[ab]?.role !== "user") ab -= 1;
  return ab;
}

export function useKiChatAnfrage({ einwilligung, modus, pfad, rolle, sprache, pruefkontext }: AnfrageWerte) {
  // Was bei JEDER Anfrage mitgeht - auch bei der automatischen Folgeanfrage
  // nach einer Freigabe, die nicht ueber sendMessage() laeuft. Ueber Refs
  // gelesen, damit der einmal angelegte Transport stets den aktuellen Stand
  // sieht.
  const anfrageDaten = useRef<Record<string, unknown>>({ einwilligung, modus, pfad, rolle, sprache, pruefkontext });
  useEffect(() => {
    anfrageDaten.current = { ...anfrageDaten.current, einwilligung, modus, pfad, rolle, sprache, pruefkontext };
  }, [einwilligung, modus, pfad, rolle, sprache, pruefkontext]);
  // Im Sprachmodus unterbrochene Antworten: Id der Antwort -> der Satz, der beim Unterbrechen
  // klang. Fuers Modell endet die Antwort ab dann dauerhaft dort (domain/sprachmodus.ts,
  // mitGehoertenAntworten), angezeigt wird sie weiter ganz. Seit dem 05.10.2026; vorher galt nur
  // der Hinweis bei der einen Frage danach.
  const gehoertBis = useRef(new Map<string, string>());
  // Ab welcher Nachricht das laufende Sprachmodus-Gespraech beginnt (null: kein
  // Sprachmodus). Im Sprachmodus geht nur dieses Gespraech ans Modell, dazu die
  // letzte Frage davor: alte Fragen zu anderen Seiten liessen Himbi sonst frueher
  // gezeigte Bereiche wieder oeffnen (Rueckmeldung vom 25.09.2026).
  const sprachStart = useRef<number | null>(null);
  // Der Transport ruft prepareSendMessagesRequest erst beim Senden, nie beim Rendern. Seit der Hook klein genug ist,
  // dass der React Compiler ihn prüft, meldet er die Refs darin; das Verhalten bleibt bewusst unverändert.
  const transport = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: "/api/ki-assistent",
        prepareSendMessagesRequest: ({ id, messages: alle, trigger, messageId }) => {
          // Der Hinweis auf eine Unterbrechung gilt nur fuer die eine Frage danach.
          const { unterbrochen, ...daten } = anfrageDaten.current;
          if (unterbrochen !== undefined) anfrageDaten.current = daten;
          const imSprachmodus = daten.modus === "sprache";
          const ab = verlaufAb(alle, imSprachmodus, sprachStart.current);
          return {
            body: {
              ...daten,
              ...(imSprachmodus && typeof unterbrochen === "string" ? { unterbrochen } : {}),
              // Die Seitenkarte der Seite, die der Nutzer JETZT sieht (ui-steuerung.ts):
              // damit setzt das Modell Sprechmarken ohne vorheriges seiteLesen.
              ...(imSprachmodus ? { seitenkarte: seitenKarte() } : {}),
              id,
              messages: mitGehoertenAntworten(alle.slice(ab), gehoertBis.current),
              trigger,
              messageId,
            },
          };
        },
      }),
    [],
  );
  /** Ergänzt, was mit der nächsten Anfrage mitgeht (Diktat-Sprachen, Vorlese-Weg, Prüfbezug, Unterbrechung). */
  const ergaenzeAnfrage = useCallback((teil: Record<string, unknown>) => {
    anfrageDaten.current = { ...anfrageDaten.current, ...teil };
  }, []);
  return { anfrageDaten, gehoertBis, sprachStart, transport, ergaenzeAnfrage };
}

/** Beginn des Sprachmodus-Gespraechs merken (siehe sprachStart oben): die Zahl der Nachrichten bei seinem Start. */
export function useSprachStart(sprachStart: RefObject<number | null>, sprachmodus: boolean, nachrichtenAnzahl: number) {
  useEffect(() => {
    if (!sprachmodus) {
      sprachStart.current = null;
      return;
    }
    sprachStart.current ??= nachrichtenAnzahl;
  }, [sprachmodus, nachrichtenAnzahl, sprachStart]);
}
