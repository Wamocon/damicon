"use client";

// Das Eingabefeld des KI-Chats (ki-chat.tsx, gezeichnet in ki-chat-composer.tsx):
// Text, Höhe des Feldes und die Übergabe eines Diktats vom Mikrofon. Ob und wann
// die Stimme still wird oder welche Sprachen ein Diktat hatte, hält
// ki-chat-sprache.ts; hier kommt nur der Text ins Feld.

import { useRef, useState } from "react";
import type { VorlesePhase } from "@/lib/domain/vorlesen-zustand";
import { haengeDiktatAn } from "@/lib/domain/diktat-live";

/** Das Feld wächst mit dem Text, höchstens auf 140 px. */
function passeHoeheAn(el: HTMLTextAreaElement | null) {
  if (el) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }
}

export function useKiChatEingabe({
  vorlesenPhase,
  stoppeStimme,
  stilleFuerDiktat,
  merkeDiktatSprachen,
}: {
  vorlesenPhase: VorlesePhase;
  stoppeStimme: () => void;
  /** Klick auf das Mikrofon: was spricht, verstummt (ki-chat-sprache.ts, beiMikrofonStart). */
  stilleFuerDiktat: () => void;
  merkeDiktatSprachen: (sprachen: string[] | undefined) => void;
}) {
  const [eingabe, setEingabe] = useState("");
  const eingabeRef = useRef<HTMLTextAreaElement>(null);
  // Was vor dem Diktat im Feld stand. Das Diktat wird daran ANGEHAENGT -
  // bis zum 24.09.2026 ersetzte es den Inhalt, und wer nach einer Denkpause
  // weiterdiktierte, verlor den ersten Teil samt allem Getippten.
  const diktatBasis = useRef<string | null>(null);

  function beiEingabe(wert: string) {
    // Wer zu tippen beginnt, hoert nicht mehr zu. Erst ab dem zweiten
    // Zeichen: ein einzelner Tastendruck ist oft ein Versehen, und der
    // erkannte Diktattext landet ebenfalls ueber diesen Weg im Feld.
    if (wert.length > 1 && vorlesenPhase !== "still") stoppeStimme();
    setEingabe(wert);
    passeHoeheAn(eingabeRef.current);
  }

  function beiMikrofonStart() {
    diktatBasis.current = eingabeRef.current?.value ?? eingabe;
    stilleFuerDiktat();
  }

  /** Live-Diktat: was bis jetzt gehoert wurde, steht schon im Feld. */
  function beiMikrofonZwischentext(zwischentext: string) {
    setEingabe(haengeDiktatAn(diktatBasis.current ?? "", zwischentext));
    passeHoeheAn(eingabeRef.current);
  }

  function beiMikrofonText(diktat: string, sprachen?: string[]) {
    // Merken, solange der Text im Feld steht: abgeschickt wird von
    // Hand, und erst dann zaehlt es.
    merkeDiktatSprachen(sprachen);
    const text = haengeDiktatAn(diktatBasis.current ?? "", diktat);
    diktatBasis.current = null;
    beiEingabe(text);
    const feld = eingabeRef.current;
    feld?.focus();
    // Cursor ans Ende: von dort wird korrigiert oder weitergeschrieben.
    feld?.setSelectionRange(text.length, text.length);
  }

  /** Nach dem Absenden: Feld leer, Höhe wie am Anfang. */
  function leereFeld() {
    setEingabe("");
    if (eingabeRef.current) eingabeRef.current.style.height = "";
  }

  /** Eine Frage von außen, die noch nicht gesendet werden kann: sie steht im Feld, der Fokus dort. */
  function insFeld(text: string) {
    setEingabe(text);
    eingabeRef.current?.focus();
  }

  return { eingabe, eingabeRef, beiEingabe, beiMikrofonStart, beiMikrofonZwischentext, beiMikrofonText, leereFeld, insFeld };
}
