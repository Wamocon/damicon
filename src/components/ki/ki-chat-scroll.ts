"use client";

// Scrollen im Verlauf des KI-Chats (ki-chat.tsx): mitlaufen, solange der Nutzer
// unten bleibt, und der Knopf "Zum Neuesten", sobald er nach oben scrollt.

import { useCallback, useEffect, useRef, useState } from "react";
import type { UIMessage } from "ai";

const NAH_AM_ENDE_PX = 96;

export function useKiChatScroll({
  messages,
  status,
  offen,
  klickAnfrage,
}: {
  messages: UIMessage[];
  status: string;
  offen: boolean;
  /** Eine offene Klickfreigabe: ihre Karte erscheint unter dem Verlauf. */
  klickAnfrage: unknown;
}) {
  const [nachUntenKnopf, setNachUntenKnopf] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const klebtUnten = useRef(true);

  // Automatisches Nachscrollen: folgt dem Text, solange der Nutzer nicht
  // selbst nach oben gescrollt hat. Bewusst OHNE Scroll-Animation: eine
  // animierte Bewegung laeuft ueber mehrere Frames und wuerde von beiScroll()
  // als "Nutzer scrollt nach oben" gelesen - der Chat hoerte mitten in der
  // Antwort auf, mitzulaufen.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !klebtUnten.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages, status, offen, klickAnfrage]);

  function beiScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const nah = el.scrollHeight - el.scrollTop - el.clientHeight < NAH_AM_ENDE_PX;
    klebtUnten.current = nah;
    setNachUntenKnopf(!nah);
  }

  function nachUnten() {
    klebtUnten.current = true;
    setNachUntenKnopf(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }

  /** Ein neuer Zug (Frage, Freigabe): der Chat folgt dem Text wieder. */
  const klebeUnten = useCallback(() => {
    klebtUnten.current = true;
  }, []);

  return { scrollRef, nachUntenKnopf, setNachUntenKnopf, beiScroll, nachUnten, klebeUnten };
}
