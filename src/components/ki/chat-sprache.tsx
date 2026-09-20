"use client";

import { useEffect, useMemo, useState } from "react";
import type { AbstractIntlMessages } from "next-intl";
import { antwortSprache, type SprachausgabeSprache } from "@/lib/domain/sprachausgabe";

// Sprache eines Chatzuges in der Oberflaeche.
//
// Die Antwort des Assistenten kommt in der Sprache der Frage (siehe
// antwortSprache und api/ki-assistent/route.ts). Alles, was das Chatfenster
// drumherum schreibt, muss mitziehen - sonst steht eine russische Antwort
// zwischen deutschem "Denkt nach …" und deutschen Fehlermeldungen. Genau das
// war der gemeldete Zustand.
//
// Die Texte der anderen Sprache werden erst geholt, wenn sie gebraucht werden
// (dynamisches import): wer auf einer deutschen Oberflaeche deutsch schreibt -
// der Regelfall - laedt nichts nach.

const TEXTE: Record<SprachausgabeSprache, () => Promise<{ default: AbstractIntlMessages }>> = {
  de: () => import("@/messages/de.json"),
  en: () => import("@/messages/en.json"),
  ru: () => import("@/messages/ru.json"),
  kk: () => import("@/messages/kk.json"),
};

export interface ChatSprache {
  /** Sprache dieses Zuges - die der letzten Frage. */
  sprache: SprachausgabeSprache;
  /** Texte in dieser Sprache, ueber die der Oberflaeche gelegt. null, solange
   *  sie noch geladen werden oder gar nicht gebraucht werden. */
  texte: AbstractIntlMessages | null;
}

/**
 * @param fragen  Die bisherigen Nachrichten der Person, aelteste zuerst.
 * @param oberflaeche  Sprache der Oberflaeche - die Rueckfallebene, wenn eine
 *                     Nachricht keinen Hinweis auf ihre Sprache gibt.
 * @param grundtexte  Die geladenen Texte der Oberflaeche. Die Texte der
 *                    erkannten Sprache werden darueber gelegt, damit ein dort
 *                    fehlender Schluessel nicht zum Absturz fuehrt, sondern
 *                    zur Oberflaechensprache zurueckfaellt.
 */
export function useChatSprache(
  fragen: readonly string[],
  oberflaeche: string,
  grundtexte: AbstractIntlMessages,
): ChatSprache {
  const sprache = antwortSprache(
    fragen.map((inhalt) => ({ rolle: "nutzer", inhalt })),
    oberflaeche,
  );
  // Einmal geladene Sprachen bleiben liegen: wer zwischen zwei Sprachen hin
  // und her wechselt, laedt nicht jedes Mal neu.
  const [geladen, setGeladen] = useState<Partial<Record<SprachausgabeSprache, AbstractIntlMessages>>>({});

  useEffect(() => {
    if (sprache === oberflaeche || geladen[sprache]) return;
    let gilt = true;
    void TEXTE[sprache]?.()
      .then((paket) => {
        if (gilt) setGeladen((bisher) => ({ ...bisher, [sprache]: paket.default }));
      })
      .catch(() => {
        // Nachladen misslungen (Netz weg, Datei fehlt): es bleibt bei der
        // Oberflaechensprache - lieber die falsche Sprache als ein leeres
        // Fenster.
      });
    return () => {
      gilt = false;
    };
  }, [sprache, oberflaeche, geladen]);

  const paket = sprache === oberflaeche ? undefined : geladen[sprache];
  // Die Texte der erkannten Sprache liegen UEBER denen der Oberflaeche: ein
  // dort fehlender Schluessel faellt damit auf die Oberflaechensprache
  // zurueck, statt zur Laufzeit zu werfen.
  const texte = useMemo(() => (paket ? { ...grundtexte, ...paket } : null), [paket, grundtexte]);

  return { sprache, texte };
}
