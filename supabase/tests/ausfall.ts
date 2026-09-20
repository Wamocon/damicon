// Tests fuer die Ausfallsicherheit der Sprachmodelle (lib/ai/ausfall.ts, ausfall-modell.ts).
// Kein Netzwerk, kein echtes Modell: Anbieter werden durch Skript-Modelle ersetzt, die genau die Fehler liefern,
// die die echten Anbieter liefern (Guthaben leer, Ratenlimit, Ueberlastung, Netz, Berechtigung).
// Aufruf: npm run test:ausfall (laeuft ueber tsx, damit die @/-Pfade aufloesen).

import { readFileSync } from "node:fs";
import { APICallError } from "@ai-sdk/provider";
import { generateText, stepCountIs, streamText, tool } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { z } from "zod";
import { darfAusweichen, klassifiziere, retryAfterSekunden, Schalter, sperrdauerMs } from "@/lib/ai/ausfall";
import { ausfallModell, type AusweichEreignis } from "@/lib/ai/ausfall-modell";

let gesamt = 0;
let fehler = 0;
function pruefe(name: string, ok: boolean, detail = "") {
  gesamt++;
  if (!ok) fehler++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  - ${detail}` : ""}`);
}

const api = (status: number, meldung: string, koerper = "", kopf: Record<string, string> = {}) =>
  new APICallError({ message: meldung, url: "https://api.example.com/v1/messages", requestBodyValues: {}, statusCode: status, responseBody: koerper || JSON.stringify({ error: { message: meldung } }), responseHeaders: kopf });

// ---- Einordnung ---------------------------------------------------------------------------------------------
const GUTHABEN = api(400, "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.");
const RATE = api(429, "rate_limit_error: Number of request tokens has exceeded your per-minute rate limit", "", { "retry-after": "42" });
const UEBERLAST = api(529, "Overloaded");
const AUTH_SOKRATES = api(403, "You do not have permission to access this resource. Please contact your administrator for assistance.");
const PLATZ = api(400, "messages: text content blocks must be non-empty");

pruefe("Einordnung: aufgebrauchtes Guthaben (Anthropic meldet es als 400)", klassifiziere(GUTHABEN) === "guthaben");
pruefe("Einordnung: Ratenlimit (429)", klassifiziere(RATE) === "ratenlimit");
pruefe("Einordnung: Ueberlastung (529, 503, 500)", klassifiziere(UEBERLAST) === "ueberlast" && klassifiziere(api(503, "x")) === "ueberlast" && klassifiziere(api(500, "boom")) === "ueberlast");
pruefe("Einordnung: fehlende Berechtigung (401, 403) ist 'auth'", klassifiziere(AUTH_SOKRATES) === "auth" && klassifiziere(api(401, "invalid x-api-key")) === "auth");
pruefe("Einordnung: eine fehlerhafte Anfrage (400) ist 'anfrage'", klassifiziere(PLATZ) === "anfrage");
pruefe("Einordnung: Netzfehler und Zeitueberschreitung", klassifiziere(new TypeError("fetch failed")) === "netz" && klassifiziere(Object.assign(new Error("x"), { cause: { code: "ECONNRESET" } })) === "netz" && klassifiziere(new DOMException("The operation timed out", "TimeoutError")) === "netz");
pruefe("Einordnung: Unbekanntes bleibt unbekannt (kein blindes Ausweichen)", klassifiziere(new Error("boom")) === "unbekannt" && klassifiziere("text") === "unbekannt" && klassifiziere(null) === "unbekannt");
pruefe("Ausweichen: bei Guthaben, Ratenlimit, Ueberlast, Netz und Berechtigung ja", (["guthaben", "ratenlimit", "ueberlast", "netz", "auth"] as const).every(darfAusweichen));
pruefe("Ausweichen: bei fehlerhafter Anfrage und Unbekanntem nein", !darfAusweichen("anfrage") && !darfAusweichen("unbekannt"));
pruefe("Sperrdauer: Guthaben 5 min, Ueberlast 30 s, Netz 20 s", sperrdauerMs("guthaben") === 300_000 && sperrdauerMs("ueberlast") === 30_000 && sperrdauerMs("netz") === 20_000);
pruefe("Sperrdauer: Ratenlimit folgt retry-after, mindestens 10 s, hoechstens 5 min", sperrdauerMs("ratenlimit", 42) === 42_000 && sperrdauerMs("ratenlimit", 1) === 10_000 && sperrdauerMs("ratenlimit", 9999) === 300_000 && sperrdauerMs("ratenlimit") === 30_000);
pruefe("retry-after wird aus den Antwortkoepfen gelesen", retryAfterSekunden(RATE) === 42 && retryAfterSekunden(UEBERLAST) === undefined);

// ---- Schalter ---------------------------------------------------------------------------------------------
{
  let t = 1_000;
  const s = new Schalter(() => t);
  pruefe("Schalter: zu Beginn ist niemand gesperrt", !s.offen("a"));
  s.oeffnen("a", "guthaben");
  pruefe("Schalter: nach dem Oeffnen gesperrt", s.offen("a") && !s.offen("b"));
  t += 299_000;
  pruefe("Schalter: kurz vor Ablauf noch gesperrt", s.offen("a"));
  t += 2_000;
  pruefe("Schalter: nach Ablauf wieder versuchbar (halb offen)", !s.offen("a"));
  s.oeffnen("a", "netz");
  s.schliessen("a");
  pruefe("Schalter: schliessen hebt die Sperre auf", !s.offen("a"));
  s.oeffnen("a", "ueberlast");
  t += 10;
  s.oeffnen("b", "guthaben");
  pruefe("Schalter: Notfall waehlt den mit der frueheren Freigabe", s.fruehesteFreigabe(["a", "b"]) === "a" && Object.keys(s.zustand()).length === 2);
  s.oeffnen("c", "unbekannt");
  pruefe("Schalter: 'unbekannt' sperrt nicht", !s.offen("c"));
}

// ---- Ausfallmodell -----------------------------------------------------------------------------------------
const nutzung = { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
const ende = { unified: "stop" as const, raw: undefined };
const textErgebnis = (text: string) => ({ content: [{ type: "text" as const, text }], finishReason: ende, usage: nutzung, warnings: [] });
const stromAus = (teile: unknown[]) => new ReadableStream({ start(c) { for (const t of teile) c.enqueue(t); c.close(); } });
const textStrom = (text: string) => [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: text }, { type: "text-end", id: "1" }, { type: "finish", finishReason: ende, usage: nutzung }];

type Skript = { generate?: () => unknown; stream?: () => unknown[] | Promise<unknown[]>; aufrufe: number };
function anbieter(name: string, s: Skript) {
  const m = new MockLanguageModelV3({
    modelId: name,
    doGenerate: async () => {
      s.aufrufe++;
      const r = s.generate?.() ?? textErgebnis(`Antwort von ${name}`);
      if (r instanceof Error) throw r;
      return r as never;
    },
    doStream: async () => {
      s.aufrufe++;
      const teile = (await s.stream?.()) ?? textStrom(`Strom von ${name}`);
      return { stream: stromAus(teile) } as never;
    },
  });
  return { name, modell: m };
}
const wirf = (e: Error) => () => e;

async function ausfall() {
  // 1. Wechsel beim Aufruf, Sperre, Uebersprungen, halb offen, Erholung
  {
    let t = 0;
    const schalter = new Schalter(() => t);
    const ereignisse: AusweichEreignis[] = [];
    const a: Skript = { aufrufe: 0, generate: wirf(GUTHABEN) };
    const b: Skript = { aufrufe: 0 };
    const modell = ausfallModell([anbieter("anthropic", a), anbieter("sokrates", b)], { schalter, beiAusweichen: (e) => ereignisse.push(e) });
    const r1 = await generateText({ model: modell, prompt: "Hallo" });
    pruefe("Wechsel: Guthaben leer, der zweite Anbieter antwortet", r1.text === "Antwort von sokrates" && a.aufrufe === 1 && b.aufrufe === 1);
    pruefe("Wechsel: das Ereignis nennt Anbieter, Ziel und Grund", ereignisse.length === 1 && ereignisse[0]!.von === "anthropic" && ereignisse[0]!.nach === "sokrates" && ereignisse[0]!.art === "guthaben");
    const r2 = await generateText({ model: modell, prompt: "Nochmal" });
    pruefe("Schalter: der gesperrte Anbieter wird uebersprungen, keine verlorene Zeit auf den Fehler", r2.text === "Antwort von sokrates" && a.aufrufe === 1 && b.aufrufe === 2);
    t += 301_000;
    a.generate = undefined;
    const r3 = await generateText({ model: modell, prompt: "Und jetzt" });
    pruefe("Erholung: nach Ablauf wird der erste Anbieter wieder versucht und uebernimmt", r3.text === "Antwort von anthropic" && a.aufrufe === 2 && !schalter.offen("anthropic"));
    pruefe("Modell: Kennung nennt die Kette, die Spezifikation folgt dem ersten Anbieter", (modell as { modelId: string }).modelId === "anthropic+sokrates" && (modell as { specificationVersion: string }).specificationVersion === "v3");
  }
  // 2. Keine Wechsel bei fehlerhafter Anfrage
  {
    const a: Skript = { aufrufe: 0, generate: wirf(PLATZ) };
    const b: Skript = { aufrufe: 0 };
    let geworfen = "";
    try {
      await generateText({ model: ausfallModell([anbieter("a", a), anbieter("b", b)]), prompt: "x", maxRetries: 0 });
    } catch (e) {
      geworfen = String((e as Error).message);
    }
    pruefe("Keine Ausweichung bei fehlerhafter Anfrage (400): der Fehler bleibt sichtbar", geworfen.includes("non-empty") && b.aufrufe === 0);
  }
  // 3. Keine Wechsel bei Unbekanntem
  {
    const a: Skript = { aufrufe: 0, generate: wirf(new Error("Programmfehler")) };
    const b: Skript = { aufrufe: 0 };
    let geworfen = false;
    try {
      await generateText({ model: ausfallModell([anbieter("a", a), anbieter("b", b)]), prompt: "x", maxRetries: 0 });
    } catch {
      geworfen = true;
    }
    pruefe("Keine Ausweichung bei Unbekanntem (kein Verstecken von Programmfehlern)", geworfen && b.aufrufe === 0);
  }
  // 4. Alle fallen aus
  {
    const a: Skript = { aufrufe: 0, generate: wirf(GUTHABEN) };
    const b: Skript = { aufrufe: 0, generate: wirf(AUTH_SOKRATES) };
    const ereignisse: AusweichEreignis[] = [];
    let art = "";
    try {
      await generateText({ model: ausfallModell([anbieter("a", a), anbieter("b", b)], { beiAusweichen: (e) => ereignisse.push(e) }), prompt: "x", maxRetries: 0 });
    } catch (e) {
      art = klassifiziere(e);
    }
    pruefe("Alle Anbieter fallen aus: der letzte Fehler wird geworfen, beide Wechsel sind gemeldet", art === "auth" && ereignisse.length === 2 && ereignisse[1]!.nach === null);
  }
  // 5. Alle gesperrt: der mit der fruehesten Freigabe wird versucht (Notlauf)
  {
    let t = 0;
    const schalter = new Schalter(() => t);
    schalter.oeffnen("a", "guthaben");
    t += 5;
    schalter.oeffnen("b", "guthaben");
    const a: Skript = { aufrufe: 0 };
    const b: Skript = { aufrufe: 0 };
    const r = await generateText({ model: ausfallModell([anbieter("a", a), anbieter("b", b)], { schalter }), prompt: "x" });
    pruefe("Notlauf: sind alle gesperrt, wird der mit der fruehesten Freigabe versucht statt gar keiner", r.text === "Antwort von a" && a.aufrufe === 1 && b.aufrufe === 0);
  }
  // 6. Strom: Fehler als erstes Ereignis (Anthropic meldet "overloaded" im Strom)
  {
    const a: Skript = { aufrufe: 0, stream: () => [{ type: "stream-start", warnings: [] }, { type: "error", error: UEBERLAST }] };
    const b: Skript = { aufrufe: 0 };
    const ereignisse: AusweichEreignis[] = [];
    const r = streamText({ model: ausfallModell([anbieter("anthropic", a), anbieter("sokrates", b)], { beiAusweichen: (e) => ereignisse.push(e) }), prompt: "Hallo" });
    const text = await r.text;
    pruefe("Strom: ein Fehler als ERSTES Ereignis wird ersetzt, der Nutzer merkt nichts", text === "Strom von sokrates" && ereignisse[0]?.art === "ueberlast");
  }
  // 7. Strom: normaler Ablauf bleibt unveraendert
  {
    const a: Skript = { aufrufe: 0 };
    const b: Skript = { aufrufe: 0 };
    const r = streamText({ model: ausfallModell([anbieter("anthropic", a), anbieter("sokrates", b)]), prompt: "Hallo" });
    pruefe("Strom: ohne Fehler kommt alles vom ersten Anbieter, der zweite bleibt unberuehrt", (await r.text) === "Strom von anthropic" && b.aufrufe === 0);
  }
  // 8. Strom: Fehler MITTEN in der Antwort wird nicht ersetzt (kein doppelter Text)
  {
    const a: Skript = {
      aufrufe: 0,
      stream: () => [{ type: "stream-start", warnings: [] }, { type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Teil" }, { type: "error", error: UEBERLAST }],
    };
    const b: Skript = { aufrufe: 0 };
    const gemeldet: unknown[] = [];
    const r = streamText({ model: ausfallModell([anbieter("anthropic", a), anbieter("sokrates", b)]), prompt: "Hallo", onError: (e) => gemeldet.push(e.error) });
    for await (const _ of r.fullStream) void _;
    pruefe("Strom: ein Fehler mitten in der Antwort wird gemeldet, nicht durch neuen Text ersetzt", gemeldet.length === 1 && b.aufrufe === 0);
  }
  // 9. Werkzeugschleife ueber mehrere Schritte: Wechsel im ersten Schritt, der zweite laeuft konsistent weiter
  {
    const a: Skript = { aufrufe: 0, generate: wirf(RATE) };
    let schritt = 0;
    const b: Skript = {
      aufrufe: 0,
      generate: () =>
        ++schritt === 1
          ? { content: [{ type: "tool-call", toolCallId: "t1", toolName: "wetter", input: JSON.stringify({ ort: "Almaty" }) }], finishReason: { unified: "tool-calls", raw: undefined }, usage: nutzung, warnings: [] }
          : textErgebnis("Es ist sonnig."),
    };
    const r = await generateText({
      model: ausfallModell([anbieter("anthropic", a), anbieter("sokrates", b)]),
      prompt: "Wetter?",
      tools: { wetter: tool({ description: "Wetter", inputSchema: z.object({ ort: z.string() }), execute: async () => ({ grad: 21 }) }) },
      stopWhen: stepCountIs(4),
    });
    pruefe("Werkzeugschleife: Wechsel im ersten Schritt, danach laeuft die Schleife beim zweiten Anbieter weiter", r.text === "Es ist sonnig." && r.steps.length === 2 && a.aufrufe === 1 && b.aufrufe === 2);
  }
  // 10. Leere Kette
  {
    let geworfen = false;
    try {
      ausfallModell([]);
    } catch {
      geworfen = true;
    }
    pruefe("Eine leere Kette wird abgelehnt", geworfen);
  }
}

// ---- Quellpruefung der Verdrahtung -------------------------------------------------------------------------
const kette = readFileSync("src/lib/ai/anbieter-kette.ts", "utf8");
const chatRoute = readFileSync("src/app/api/ki-assistent/route.ts", "utf8");
const pruefRoute = readFileSync("src/app/api/ki-pruefung/route.ts", "utf8");
pruefe("Verdrahtung: die Kette baut Anthropic UND OpenAI-kompatible Anbieter und haengt Sokrates aus der Umgebung an", kette.includes("createAnthropic") && kette.includes("createOpenAICompatible") && kette.includes("KI_SOKRATES_API_SCHLUESSEL") && kette.includes("KI_SOKRATES_MODELL"));
pruefe("Verdrahtung: der Schalter ist einer je Serverinstanz (Modulebene), nicht einer je Anfrage", /const schalter = new Schalter\(\)/.test(kette));
pruefe("Verdrahtung: Chat und Pruefung nutzen das Modell der Kette und protokollieren Wechsel", chatRoute.includes("ladeAnbieterKette") && pruefRoute.includes("ladeAnbieterKette") && chatRoute.includes("Anbieterwechsel") && pruefRoute.includes("Anbieterwechsel"));

ausfall()
  .catch((e) => pruefe("Ausfalltests laufen durch", false, String(e instanceof Error ? e.stack : e)))
  .then(() => {
    console.log(`\nPruefungen: ${gesamt}   bestanden: ${gesamt - fehler}   fehlgeschlagen: ${fehler}`);
    if (fehler > 0) process.exit(1);
    console.log("Alle Pruefungen bestanden.");
  });
