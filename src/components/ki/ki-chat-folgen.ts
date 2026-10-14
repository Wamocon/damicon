"use client";

// Was aus den Werkzeugergebnissen einer Antwort im KI-Chat (ki-chat.tsx) folgt:
// eine erfolgreiche Aktion lädt die offene Seite neu, und im Agent- und
// Sprachmodus öffnet jedes Ergebnis mit Ziel seine Ansicht im Hauptfenster.

import { useEffect, useRef, type RefObject } from "react";
import { getToolName, isDynamicToolUIPart, isToolUIPart, type UIMessage } from "ai";
import type { ZugModus } from "@/components/ki/ki-chat-anfrage";
import { alsAktionsErgebnis, eigenschaftAusAusgabe, type erstelleBeschriftungen } from "@/components/ki/ki-chat-segmente";
import type { useSprachTakt } from "@/components/ki/sprach-takt";
import { istAktion } from "@/lib/ai/aktionen-meta";

type Teil = UIMessage["parts"][number];
type Beschriftung = ReturnType<typeof erstelleBeschriftungen>["beschriftung"];

/** Ein Werkzeugergebnis mit Ziel, dem der Zug noch nicht gefolgt ist; es gilt ab jetzt als gefolgt. Sonst null. */
function neuesZiel(teil: Teil, gefolgt: Set<string>, modus: "agent" | "sprache") {
  if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) return null;
  if (teil.state !== "output-available" || gefolgt.has(teil.toolCallId)) return null;
  gefolgt.add(teil.toolCallId);
  const ziel = eigenschaftAusAusgabe(teil.output, "ziel");
  if (!ziel) return null;
  const name = getToolName(teil);
  // Sprachmodus: nur ein ausdrücklich geöffneter Bereich wechselt die Seite.
  // Jedes Fachwerkzeug mit Ziel (Compliance-Übersicht, Aufgaben ...) sprang
  // bisher sofort dorthin, obwohl Himbi noch über die aktuelle Seite sprach
  // (Rückmeldung vom 25.09.2026). Und die Seite wechselt erst, wenn die
  // Stimme den Satz davor gesprochen hat.
  if (modus === "sprache" && name !== "oeffneBereich") return null;
  const eingabeTeil = teil.input as { tabelle?: unknown } | undefined;
  return {
    ziel,
    name,
    bereich: eigenschaftAusAusgabe(teil.output, "bereich"),
    tabelle: typeof eingabeTeil?.tabelle === "string" ? eingabeTeil.tabelle : null,
  };
}

export function useErgebnisFolgen({
  messages,
  router,
  zugModus,
  takt,
  fuehreZu,
  oeffneZiel,
  beschriftung,
}: {
  messages: UIMessage[];
  router: { refresh: () => void };
  /** Der Modus, in dem der laufende Zug abgeschickt wurde (ki-chat-zug.ts). */
  zugModus: RefObject<ZugModus | null>;
  takt: Pick<ReturnType<typeof useSprachTakt>, "marke" | "oeffneImTakt">;
  fuehreZu: (ziel: string, label: string) => void;
  oeffneZiel: (ziel: string, label: string) => void;
  beschriftung: Beschriftung;
}) {
  const gefolgt = useRef(new Set<string>());
  const aktualisiert = useRef(new Set<string>());

  // Nach einer erfolgreichen Aktion die Seite neu laden lassen: die Aktion lief
  // serverseitig, die aktuell offene Ansicht zeigt sonst noch den alten Stand.
  useEffect(() => {
    for (const nachricht of messages) {
      if (nachricht.role !== "assistant") continue;
      for (const teil of nachricht.parts) {
        if (!isToolUIPart(teil) && !isDynamicToolUIPart(teil)) continue;
        if (!istAktion(getToolName(teil)) || teil.state !== "output-available") continue;
        if (aktualisiert.current.has(teil.toolCallId)) continue;
        aktualisiert.current.add(teil.toolCallId);
        if (alsAktionsErgebnis(teil.output)?.ok) router.refresh();
      }
    }
  }, [messages, router]);

  // Agent- und Sprachmodus: jedes Werkzeugergebnis der letzten Antwort öffnet seine
  // Ansicht im Hauptfenster. zugModus wird beim Absenden und bei jeder Freigabe
  // festgehalten (ki-chat-zug.ts). Wer mitten in einer Antwort auf Agent umschaltet,
  // bekommt deshalb vorerst keine Tour. Gibt er danach im Agent-Modus eine Aktion
  // dieser Antwort frei, holt die Tour auch die Schritte mit Ziel nach, die noch im
  // Assistent-Modus fertig wurden: als gefolgt gilt ein Ergebnis erst, wenn es in
  // einem Zug im Agent- oder Sprachmodus gesehen wurde (npm run test:ki-chat, Fall
  // "moduswechsel").
  useEffect(() => {
    const modus = zugModus.current;
    if (modus !== "agent" && modus !== "sprache") return;
    const letzte = messages.at(-1);
    if (!letzte || letzte.role !== "assistant") return;
    for (const teil of letzte.parts) {
      const folge = neuesZiel(teil, gefolgt.current, modus);
      if (!folge) continue;
      const { ziel } = folge;
      const label = beschriftung("ziel", folge.name, { bereich: folge.bereich, tabelle: folge.tabelle });
      if (modus === "sprache") {
        // Sprechmarke: die Sätze VOR dem Aufruf. Was das Modell danach schreibt,
        // liegt schon bei der Stimme und darf den Wechsel nicht aufhalten.
        const nachher = letzte.parts.slice(letzte.parts.indexOf(teil) + 1).filter((p) => p.type === "data-satz").length;
        const jetzt = takt.marke();
        // oeffneZiel statt fuehreZu: im Sprachmodus gibt die Stimme den Takt vor,
        // keine Verweilzeit je Station (die schob einen zweiten Wechsel hinter das
        // Gesprochene), und eine aeltere Station in der Warteschlange verfaellt.
        takt.oeffneImTakt(() => oeffneZiel(ziel, label), ziel, jetzt === null ? null : Math.max(0, jetzt - nachher));
      } else fuehreZu(ziel, label);
    }
    // beschriftung/t sind pro Render neue Funktionen; relevant ist nur der Nachrichtenstand.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, fuehreZu, oeffneZiel]);
}
