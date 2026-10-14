"use client";

// Ein Zug im KI-Chat (ki-chat.tsx): eine Frage abschicken, eine Aktion freigeben
// oder ablehnen, und alles anhalten. Hier steht, was dabei in welcher Reihenfolge
// passiert (Stimme, Client-Werkzeuge, Takt, Führung, Scrollen, Anfrage). Der
// Modus des laufenden Zuges (zugModus) wird beim Absenden festgehalten und von
// useErgebnisFolgen (ki-chat-folgen.ts) gelesen.

import { useCallback, useRef } from "react";
import type { ChatAddToolApproveResponseFunction } from "ai";
import type { ZugModus } from "@/components/ki/ki-chat-anfrage";
import type { AktionsKarte } from "@/components/ki/ki-chat-segmente";
import { setzeHervorhebung } from "@/components/ki/hervorhebung";
import { stromMoeglich } from "@/components/ki/sprachausgabe-strom";

export interface ZugWerte {
  modus: ZugModus;
  sprachmodus: boolean;
  beschaeftigt: boolean;
  istErsteNachricht: boolean;
  einwilligung: boolean;
  /** ki-chat-anfrage.ts: ergänzt, was mit der nächsten Anfrage mitgeht. */
  ergaenzeAnfrage: (teil: Record<string, unknown>) => void;
  /** ki-chat-scroll.ts: der Chat folgt dem Text wieder. */
  klebeUnten: () => void;
  setNachUntenKnopf: (an: boolean) => void;
  sendMessage: (nachricht: { text: string }) => unknown;
  stop: () => Promise<void>;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
  /** ki-chat-sprache.ts: Diktat-Sprachen und Vorlesen für die neue Runde. */
  beginneZug: (ausFeld?: boolean, erzwingeVorlesen?: boolean) => string[] | undefined;
  stoppeStimme: () => void;
  /** ki-chat-werkzeuge.ts: Schleifenschutz zurücksetzen, laufende Werkzeuge abbrechen. */
  werkzeugeNeuerZug: () => void;
  werkzeugeAbbrechen: () => void;
  taktNeuerZug: () => void;
  fuehrungBeenden: () => void;
  leereFeld: () => void;
}

export function useKiChatZug({
  modus,
  sprachmodus,
  beschaeftigt,
  istErsteNachricht,
  einwilligung,
  ergaenzeAnfrage,
  klebeUnten,
  setNachUntenKnopf,
  sendMessage,
  stop,
  addToolApprovalResponse,
  beginneZug,
  stoppeStimme,
  werkzeugeNeuerZug,
  werkzeugeAbbrechen,
  taktNeuerZug,
  fuehrungBeenden,
  leereFeld,
}: ZugWerte) {
  const zugModus = useRef<ZugModus | null>(null);

  /** Sprachmodus: die Fuehrung der vorigen Anfrage endet ganz - keine wartende
   *  Station, kein stehengebliebener Rahmen (Befund vom 25.09.2026: der Rahmen der
   *  ersten Anfrage stand noch, waehrend Himbi schon die zweite beantwortete). */
  function fuehrungAufraeumen() {
    fuehrungBeenden();
    setzeHervorhebung(null);
  }

  function stopp() {
    // Zuerst die Stimme: wer auf Stopp drueckt, will sofort Ruhe, nicht erst
    // nach dem laufenden Abschnitt - beide Wege, live und die ganze Antwort.
    stoppeStimme();
    werkzeugeAbbrechen();
    taktNeuerZug();
    if (sprachmodus) fuehrungAufraeumen();
    void stop();
  }

  /** `ausFeld`: der Text stammt aus dem Eingabefeld (Senden-Knopf, Enter) - nur dann
   *  gelten die Sprachen eines vorigen Diktats, siehe beginneZug(). `erzwingeVorlesen`:
   *  diese Antwort soll IMMER gesprochen werden (die Zusammenfassung nach der gefuehrten
   *  Tour, sowie jede Frage aus dem Pruefbericht) - unabhaengig von Diktat und Schalter. */
  function sende(text: string, ausFeld = false, erzwingeVorlesen = false) {
    const bereinigt = text.trim();
    if (!bereinigt || beschaeftigt) return;
    if (istErsteNachricht && !einwilligung) return;
    const diktatSprachen = beginneZug(ausFeld, erzwingeVorlesen);
    zugModus.current = modus;
    werkzeugeNeuerZug();
    taktNeuerZug();
    if (modus === "sprache") fuehrungAufraeumen();
    klebeUnten();
    setNachUntenKnopf(false);
    // Welchen Vorlese-Weg dieser Browser nimmt: danach schneidet der Server die
    // Abschnitte (Strom satzweise, sonst laengere Stuecke fuer einzelne Anfragen).
    ergaenzeAnfrage({ diktatSprachen, vorleseWeg: stromMoeglich() ? "strom" : "abschnitte" });
    sendMessage({ text: bereinigt });
    leereFeld();
  }

  const freigabe = useCallback(
    (karte: AktionsKarte, erlaubt: boolean) => {
      if (!karte.approvalId) return;
      zugModus.current = modus;
      klebeUnten();
      void addToolApprovalResponse({
        id: karte.approvalId,
        approved: erlaubt,
        // Ohne Grund erfindet das Modell gern einen ("das System hat abgelehnt") -
        // dabei hat der Nutzer schlicht nein gesagt.
        reason: erlaubt ? undefined : "Der Nutzer hat die Aktion selbst abgelehnt. Es gab keinen Systemfehler.",
      });
    },
    [modus, addToolApprovalResponse, klebeUnten],
  );

  return { zugModus, sende, stopp, freigabe };
}
