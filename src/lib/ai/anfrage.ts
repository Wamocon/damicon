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

// Antwortlaenge in Token. Frueher fest 500 - das reicht fuer ein klassisches
// Modell, aber nicht fuer ein denkendes: qwen3.6 & Co. schreiben vor der
// eigentlichen Antwort ein reasoning-Feld, und das zaehlt gegen dasselbe
// Budget. Ist es aufgebraucht, kommt content leer zurueck, der Client wertet
// das als "unerwartete Antwortform", der Nutzer sieht die Ausweichantwort und
// nach zwei solchen Antworten eskaliert der Chat automatisch
// (sollteAutomatischEskalieren) - ohne dass je etwas kaputt war.
// Am 18.09.2026 gegen Sokrates-2 (qwen3.6:35b) nachgestellt: ~1700 Zeichen
// Reasoning vor einer 137 Zeichen langen Antwort, 441 von 500 Token weg.
//
// 2000 als Standard, per KI_MAX_TOKENS anpassbar - wer ein teures
// Cloud-Modell anbindet, dreht es herunter, wer ein denkendes Modell
// betreibt, hoch. Unplausible Werte fallen auf den Standard zurueck.
const STANDARD_MAX_TOKENS = 2000;

export function maxAntwortTokens(): number {
  const wert = Number(process.env.KI_MAX_TOKENS);
  return Number.isFinite(wert) && wert >= 256 && wert <= 32_000 ? wert : STANDARD_MAX_TOKENS;
}

// Zeitlimit einer Anfrage - hier statt in anbieter-client.ts, damit beide
// Stellschrauben beieinanderstehen und der Test sie ohne Next.js-Aliasse
// importieren kann.
//
// Frueher fest 20 Sekunden. Das passt zu einem Cloud-Modell, nicht zu einem
// selbst gehosteten: ein Modell, das laenger nicht gefragt wurde, laedt erst
// seine Gewichte. Am 18.09.2026 gegen Sokrates-2 (qwen3.6:35b, Buero-LAN)
// gemessen - erster Aufruf 24,0 s, zweiter 10,2 s. Mit 20 s lief also
// ausgerechnet die erste Frage einer Sitzung in die Ausweichantwort, und nach
// zwei davon eskaliert der Chat automatisch.
//
// 60 Sekunden als Standard, per KI_ZEITLIMIT_MS anpassbar. Die Kehrseite
// steht bewusst hier: ein wirklich ausgefallener Anbieter laesst den Nutzer
// jetzt bis zu einer Minute warten, bevor die Ausweichantwort erscheint. Wer
// ein schnelles Cloud-Modell anbindet, dreht den Wert herunter.
const STANDARD_ZEITLIMIT_MS = 60_000;

export function zeitlimitMs(): number {
  const wert = Number(process.env.KI_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 1_000 && wert <= 300_000 ? wert : STANDARD_ZEITLIMIT_MS;
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
      max_tokens: maxAntwortTokens(),
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
      max_tokens: maxAntwortTokens(),
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
