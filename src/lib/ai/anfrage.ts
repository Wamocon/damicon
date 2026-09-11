// Reines Bauen/Auslesen der Anfrage je Anbietertyp - kein fetch(), kein
// Netzwerk, deshalb ohne Mock testbar (supabase/tests/ki-assistent.mjs).
// src/lib/ai/anbieter-client.ts fuehrt den eigentlichen Aufruf aus und
// waehlt anhand von typ zwischen den Funktionen hier.
//
// Warum zwei Formen: 'openai_kompatibel' deckt den De-facto-Standard ab
// (OpenAI selbst, die meisten Cloud-Gateways, so gut wie jedes selbst
// gehostete Open-Source-Modell ueber vLLM/Ollama/LM Studio) - darunter auch
// Sokrates, mangels eigener API-Dokumentation an dieser Stelle so eingeordnet.
// 'anthropic' deckt Claude ueber die eigene Messages-API ab (anderes
// Header-Feld fuer den Schluessel, anderes Antwortformat). Weicht ein
// konkreter Anbieter von beiden Formen ab, kommt hier eine dritte Funktion
// dazu - keine Aenderung an der Datenbank oder an anbieter-client.ts noetig.

export interface ChatNachricht {
  rolle: "system" | "nutzer" | "assistent";
  inhalt: string;
}

export interface GebauteAnfrage {
  url: string;
  headers: Record<string, string>;
  body: string;
}

function ohneAbschliessendenSlash(basisUrl: string): string {
  return basisUrl.endsWith("/") ? basisUrl.slice(0, -1) : basisUrl;
}

// --- OpenAI-kompatibel (Chat Completions) -----------------------------------

export function baueOpenAiKompatibelAnfrage(
  basisUrl: string,
  modell: string,
  apiKey: string,
  verlauf: ChatNachricht[],
): GebauteAnfrage {
  return {
    url: `${ohneAbschliessendenSlash(basisUrl)}/chat/completions`,
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: modell,
      messages: verlauf.map((n) => ({
        role: n.rolle === "nutzer" ? "user" : n.rolle === "assistent" ? "assistant" : "system",
        content: n.inhalt,
      })),
      max_tokens: 500,
    }),
  };
}

/** null, wenn die Antwort nicht die erwartete Form hat (statt eines Wurfs -
 *  der Aufrufer entscheidet, ob das ein Fallback-Grund ist). */
export function parseOpenAiKompatibelAntwort(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const nachricht = (choices[0] as Record<string, unknown> | undefined)?.message;
  if (typeof nachricht !== "object" || nachricht === null) return null;
  const inhalt = (nachricht as Record<string, unknown>).content;
  return typeof inhalt === "string" && inhalt.trim() ? inhalt : null;
}

// --- Anthropic (Messages API) -----------------------------------------------

export function baueAnthropicAnfrage(
  basisUrl: string,
  modell: string,
  apiKey: string,
  verlauf: ChatNachricht[],
): GebauteAnfrage {
  // Anthropic traegt die Systemanweisung in einem eigenen Feld statt als
  // Nachrichtenrolle - system-Nachrichten aus dem Verlauf werden deshalb
  // herausgezogen und zusammengefuehrt, alles andere bleibt user/assistant.
  const systemTeile = verlauf.filter((n) => n.rolle === "system").map((n) => n.inhalt);
  const nachrichten = verlauf
    .filter((n) => n.rolle !== "system")
    .map((n) => ({ role: n.rolle === "nutzer" ? "user" : "assistant", content: n.inhalt }));

  return {
    url: `${ohneAbschliessendenSlash(basisUrl)}/v1/messages`,
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modell,
      max_tokens: 500,
      ...(systemTeile.length ? { system: systemTeile.join("\n\n") } : {}),
      messages: nachrichten,
    }),
  };
}

export function parseAnthropicAntwort(json: unknown): string | null {
  if (typeof json !== "object" || json === null) return null;
  const content = (json as Record<string, unknown>).content;
  if (!Array.isArray(content) || content.length === 0) return null;
  const erster = content[0] as Record<string, unknown> | undefined;
  const text = erster?.text;
  return typeof text === "string" && text.trim() ? text : null;
}
