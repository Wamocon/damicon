// Werkzeugfaehiger KI-Assistent (Vercel AI SDK). Ersetzt fuer Anbieter vom
// Typ 'anthropic' den reinen Text-Anfrage-Pfad aus anbieter-client.ts durch
// einen echten Tool-Calling-Agenten: das Modell darf live in der Datenbank
// nachsehen (src/lib/ai/tools.ts), statt sich ausschliesslich auf den einmalig
// gebauten, schnell veraltenden Wissenskontext zu verlassen.
//
// Strukturierte Ausgabe (Output.object statt reinem Text): eine freie
// Textantwort ist nicht validierbar - das Modell koennte formal beliebigen
// Text liefern, inklusive Format-Ausrutschern, die erst beim Rendern
// auffallen. Mit einem Zod-Schema prueft die AI SDK selbst, dass die Antwort
// die erwartete Form hat, bevor dieser Code sie ueberhaupt sieht; eine
// Antwort, die nicht passt, wirft AI_NoObjectGeneratedError/
// AI_NoOutputGeneratedError und faellt in denselben Fallback-Pfad wie jeder
// andere Fehler hier (siehe catch unten) - kein Sonderfall.
//
// Bewusst NUR fuer 'anthropic' - fuer 'openai_kompatibel' bleibt der bisherige
// Pfad (anbieter-client.ts, sendeChatAnfrage) unveraendert bestehen: die
// Vercel-AI-SDK-Anbindung an OpenAI-kompatible Endpunkte waere ein eigener
// Ausbauschritt mit eigenem Provider-Paket, hier nicht mitgezogen, um den
// bestehenden, getesteten Pfad nicht durch eine ungetestete zweite Anbindung
// zu gefaehrden - siehe actions/ki-assistent.ts fuer die Weiche.
//
// Sicherheitsprinzip (siehe tools.ts): das Modell bekommt niemals rohen
// Datenbankzugriff, nur die Werkzeuge, die die anfragende Rolle laut rbac.ts
// ohnehin sehen darf. stopWhen begrenzt einen Automatismus, der sich sonst
// theoretisch endlos weiter Werkzeuge aufrufen liesse - die strukturierte
// Ausgabe selbst zaehlt laut AI-SDK-Dokumentation als ein zusaetzlicher
// Schritt, deshalb ein Schritt mehr als reine Werkzeugaufrufe erlaubt waeren.

import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, Output, stepCountIs } from "ai";
import { z } from "zod";
import { baueWerkzeuge } from "@/lib/ai/tools";
import { anthropicBasisUrl } from "@/lib/ai/lade-anbieter";
import type { ChatNachricht } from "@/lib/ai/anfrage";
import type { Role } from "@/lib/rbac";

const MAX_WERKZEUG_SCHRITTE = 5;
// +1: die strukturierte Ausgabe selbst ist ein eigener Schritt (siehe
// Dateikopf) - ohne den Zuschlag koennte ein voll ausgeschoepfter
// Werkzeug-Dialog nie mehr zur Antwort kommen.
const MAX_SCHRITTE_GESAMT = MAX_WERKZEUG_SCHRITTE + 1;

const antwortSchema = z.object({
  // Bewusst OHNE Sprachangabe hier: die Sprache legt allein die zuletzt im
  // system-Text stehende LANGUAGE-Anweisung fest (baueSystemPrompt() in
  // lib/domain/ki-assistent.ts). Eine zweite, widerspruechliche Vorgabe hier
  // ("in der Sprache der Frage") war derselbe Fehler wie WMCNL-2415 im
  // Streaming-Pfad, nur unauffaelliger: keine Sprachmischung sichtbar (die
  // strukturierte Ausgabe entsteht als Ganzes), aber bei einer Frage in
  // anderer Sprache als der Oberflaeche stand hier ein zweiter, konkurrierender
  // Hinweis.
  antwort: z
    .string()
    .describe("Die eigentliche Antwort auf die Nutzerfrage, kurz und sachlich."),
  gestuetztAufWerkzeuge: z
    .boolean()
    .describe(
      "true, wenn die Antwort auf tatsaechlich abgerufenen Live-Daten (Werkzeugaufrufen) beruht - false, wenn nur auf dem allgemeinen, freigegebenen Wissenskontext ohne Werkzeugaufruf.",
    ),
});

export interface AgentErgebnis {
  ok: boolean;
  text: string;
  /** Namen der aufgerufenen Werkzeuge, in Reihenfolge - fuer die Anzeige im
   *  Chat (KiAssistentAnsicht) und das Protokoll (ki_chat_nachrichten.
   *  werkzeugaufrufe, Migration 20261026000000). */
  werkzeugaufrufe: string[];
  grund?: string;
}

export async function sendeAgentAnfrage(
  anbieter: { basisUrl: string; modell: string; apiKey: string },
  rolle: Role | null | undefined,
  verlauf: ChatNachricht[],
): Promise<AgentErgebnis> {
  const systemNachricht = verlauf.find((n) => n.rolle === "system");
  const dialog = verlauf.filter((n) => n.rolle !== "system");

  try {
    const anthropic = createAnthropic({ apiKey: anbieter.apiKey, baseURL: anthropicBasisUrl(anbieter.basisUrl) });
    const ergebnis = await generateText({
      model: anthropic(anbieter.modell),
      system: systemNachricht?.inhalt,
      messages: dialog.map((n) => ({
        role: n.rolle === "nutzer" ? ("user" as const) : ("assistant" as const),
        content: n.inhalt,
      })),
      // Nur Lesewerkzeuge: dieser Weg hat keine Oberflaeche, in der der Nutzer eine
      // Aktion freigeben koennte - eine Aktion bliebe ohne Freigabe haengen.
      tools: baueWerkzeuge(rolle, { nurLesen: true }),
      output: Output.object({ schema: antwortSchema }),
      stopWhen: stepCountIs(MAX_SCHRITTE_GESAMT),
    });

    // aufruf?.toolName statt aufruf.toolName: bei einer Rolle ohne jedes
    // Werkzeug (baueWerkzeuge() liefert dann {}) leitet TypeScript den
    // Elementtyp von toolCalls ueber die gesamte Rollen-Vereinigung her,
    // darunter ein Zweig ohne moegliche Eintraege - der Optional-Zugriff
    // deckt diesen Fall typsicher ab, ohne die Laufzeitlogik zu aendern
    // (echte Werkzeugaufrufe haben immer einen toolName).
    const werkzeugaufrufe = ergebnis.steps
      .flatMap((schritt) => schritt.toolCalls.map((aufruf) => aufruf?.toolName))
      .filter((name): name is string => Boolean(name));

    // result.output ist ein Getter (siehe AI-SDK-Dokumentation) - der Zugriff
    // selbst kann AI_NoOutputGeneratedError werfen, deshalb innerhalb desselben
    // try-Blocks statt separat abgesichert.
    const antwort = ergebnis.output.antwort.trim();
    if (!antwort) {
      return { ok: false, text: "", werkzeugaufrufe, grund: "leere-antwort" };
    }
    return { ok: true, text: antwort, werkzeugaufrufe };
  } catch (error) {
    // Defense-in-depth wie sendeChatAnfrage() im bisherigen Pfad: ein Fehler
    // hier (Netzwerk, Zeitueberschreitung, ungueltiger Schluessel,
    // AI_NoObjectGeneratedError/AI_NoOutputGeneratedError bei einer nicht
    // schemakonformen Antwort) darf nie bis zum Nutzer als 5xx durchschlagen,
    // sondern wird vom Aufrufer (actions/ki-assistent.ts) als Fallback
    // behandelt.
    console.error("[damicon] KI-Agent fehlgeschlagen:", error);
    return {
      ok: false,
      text: "",
      werkzeugaufrufe: [],
      grund: error instanceof Error ? error.message : "unbekannt",
    };
  }
}
