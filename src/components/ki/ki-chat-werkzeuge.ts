"use client";

// Client-Werkzeug-Ausfuehrung und Klickfreigabe fuer den KI-Chat: der Agent
// steuert das Dashboard (seiteLesen, klicke, fuelleFeld, scrolleZu, zeigeAuf -
// ui-steuerung.ts), riskante Klicks gehen vorher durch eine Freigabekarte im
// Chat. Verantwortet auch den Endlosschleifen-Schutz (Schrittzaehler je
// Nutzerfrage) fuer sendAutomaticallyWhen in ki-chat.tsx.

import { useRef, useState } from "react";
import { getToolName, isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";
import { fuehreUiWerkzeugAus, type KlickAnfrage, type ZeigerSteuerung } from "@/components/ki/ui-steuerung";
import { istClientWerkzeug } from "@/lib/ai/client-werkzeuge-meta";

// Obergrenze fuer automatische Folgerunden je Nutzerfrage (Endlosschleifen-Schutz;
// der Server begrenzt die Schritte je Anfrage zusaetzlich).
const MAX_CLIENT_SCHRITTE = 40;
// warteBisBereit wartet hoechstens WARTE_VERSUCHE * WARTE_SCHRITT_MS (= 8 s) auf
// einen "ready"/"error"-Zustand des Chats, bevor das Ergebnis eines
// Client-Werkzeugs gemeldet wird.
const WARTE_VERSUCHE = 80;
const WARTE_SCHRITT_MS = 100;

export interface WerkzeugChat {
  addToolOutput: (a: never) => unknown;
  status: string;
}

export type KlickAnfrageMitEntscheidung = KlickAnfrage & { entscheide: (erlaubt: boolean) => void };

/** Wahr, wenn der letzte Schritt der Assistentenantwort Client-Werkzeuge enthaelt
 *  und ALLE Werkzeugaufrufe dieses Schritts ein Ergebnis haben - dann muss der
 *  Browser die naechste Runde selbst anstossen. Bewusst enger als
 *  lastAssistantMessageIsCompleteWithToolCalls: ein Schritt mit nur serverseitig
 *  ausgefuehrten Werkzeugen (z. B. nach Erreichen der Schrittgrenze) darf keine
 *  Endlosschleife ausloesen. */
export function clientErgebnisseBereit(nachrichten: UIMessage[]): boolean {
  const letzte = nachrichten.at(-1);
  if (!letzte || letzte.role !== "assistant") return false;
  const ab = letzte.parts.map((teil, i) => (teil.type === "step-start" ? i : -1)).filter((i) => i >= 0).at(-1) ?? -1;
  const teile = letzte.parts.slice(ab + 1).filter((teil) => isToolUIPart(teil) || isDynamicToolUIPart(teil));
  if (teile.length === 0) return false;
  if (!teile.some((teil) => (isToolUIPart(teil) || isDynamicToolUIPart(teil)) && istClientWerkzeug(getToolName(teil)))) return false;
  return teile.every(
    (teil) =>
      (isToolUIPart(teil) || isDynamicToolUIPart(teil)) &&
      (teil.state === "output-available" || teil.state === "output-error" || teil.state === "output-denied"),
  );
}

/** Fuehrt die Client-Werkzeuge des Agenten aus und holt vor riskanten Klicks die
 *  Freigabe des Nutzers ein (Aufruf ueber onToolCall in ki-chat.tsx). Der Aufrufer
 *  muss den Chat aus useChat() per setChat() melden, sobald er vorliegt - so
 *  bricht ki-chat.tsx den Kreis auf: onToolCall braucht starteClientWerkzeug schon
 *  fuer den useChat()-Aufruf selbst, der Chat (fuer addToolOutput/status) existiert
 *  aber erst danach. */
export function useKlientWerkzeuge({
  bewegeZeiger,
  istAgentModus,
  istNurZeigen = () => false,
}: {
  bewegeZeiger: ZeigerSteuerung["bewegen"];
  /** Liest den Modus bei AUSFUEHRUNG des Werkzeugs, nicht bei dessen Anstoss. */
  istAgentModus: () => boolean;
  /** Sprachmodus: zeigen und scrollen ja, klicken und ausfuellen nie (ui-steuerung.ts). */
  istNurZeigen?: () => boolean;
}) {
  const [clientAktiv, setClientAktiv] = useState<string | null>(null);
  const [klickAnfrage, setKlickAnfrage] = useState<KlickAnfrageMitEntscheidung | null>(null);
  const chatRef = useRef<WerkzeugChat | null>(null);
  const abgebrochen = useRef(false);
  const zugSchritte = useRef(0);

  function setChat(chat: WerkzeugChat) {
    chatRef.current = chat;
  }

  // Fragt den Nutzer, ob ein riskanter Klick ausgefuehrt werden darf. Die Zusage
  // wird von den Knoepfen der Karte aufgeloest (oder mit "nein", wenn der Nutzer
  // stoppt oder etwas Neues schreibt).
  function frageNutzer(anfrage: KlickAnfrage): Promise<boolean> {
    return new Promise<boolean>((fertig) => {
      setKlickAnfrage({
        ...anfrage,
        entscheide: (erlaubt) => {
          setKlickAnfrage(null);
          fertig(erlaubt);
        },
      });
    });
  }

  async function warteBisBereit(): Promise<void> {
    for (
      let i = 0;
      i < WARTE_VERSUCHE && chatRef.current && chatRef.current.status !== "ready" && chatRef.current.status !== "error";
      i++
    ) {
      await new Promise((weiter) => window.setTimeout(weiter, WARTE_SCHRITT_MS));
    }
  }

  // Client-Werkzeug (laeuft im Browser): NICHT im onToolCall selbst warten - das
  // Warten dort blockiert die Stream-Verarbeitung des SDK. Stattdessen anstossen,
  // den Stream zu Ende laufen lassen und das Ergebnis danach mit addToolOutput
  // melden; das loest ueber sendAutomaticallyWhen die naechste Runde aus.
  function starteClientWerkzeug(aufruf: { toolName: string; toolCallId: string; input: unknown; dynamic?: boolean }) {
    if (aufruf.dynamic || !istClientWerkzeug(aufruf.toolName)) return;
    void (async () => {
      setClientAktiv(aufruf.toolName);
      zugSchritte.current += 1;
      const ergebnis = await fuehreUiWerkzeugAus(aufruf.toolName, aufruf.input, {
        zeiger: { bewegen: bewegeZeiger },
        bestaetigen: frageNutzer,
        agentModus: istAgentModus(),
        nurZeigen: istNurZeigen(),
      });
      await warteBisBereit();
      setClientAktiv(null);
      if (abgebrochen.current) return;
      void (chatRef.current?.addToolOutput as (a: unknown) => unknown)({
        tool: aufruf.toolName,
        toolCallId: aufruf.toolCallId,
        output: ergebnis,
      });
    })();
  }

  /** Vor jeder neuen Nutzerfrage (sende() in ki-chat.tsx): Schleifenschutz fuer
   *  diese Runde zuruecksetzen. */
  function neuerZug() {
    abgebrochen.current = false;
    zugSchritte.current = 0;
  }

  /** stopp() in ki-chat.tsx: laufende Werkzeuge duerfen ihr Ergebnis nicht mehr
   *  melden, eine offene Klickfrage gilt als abgelehnt. */
  function abbrechen() {
    abgebrochen.current = true;
    klickAnfrage?.entscheide(false);
    setClientAktiv(null);
  }

  function unterSchrittGrenze(): boolean {
    return zugSchritte.current <= MAX_CLIENT_SCHRITTE;
  }

  return {
    clientAktiv,
    klickAnfrage,
    starteClientWerkzeug,
    setChat,
    neuerZug,
    abbrechen,
    unterSchrittGrenze,
  };
}
