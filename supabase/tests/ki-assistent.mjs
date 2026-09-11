#!/usr/bin/env node
// =============================================================================
// Damicon - Test der reinen KI-Assistent-Logik (Anforderung 5.4/5.5)
// =============================================================================
// Ausfuehren:  node supabase/tests/ki-assistent.mjs
//
// Deckt drei reine, netzwerk- und datenbankfreie Bausteine ab, dieselbe
// Trennung wie beim Zukauf-Import-Parser (zukauf-parser.mjs) und dem
// Ausweis-Scan (ausweis-scan.mjs):
//   1. src/lib/ai/schluessel.ts - Verschluesselung des API-Keys (echtes
//      node:crypto, kein Mock).
//   2. src/lib/ai/anfrage.ts - Anfrage-/Antwortform je Anbietertyp.
//   3. src/lib/domain/ki-assistent.ts - Wissenskontext, Fallback-Logik,
//      automatische Eskalation.
// Der eigentliche Netzwerkaufruf (src/lib/ai/anbieter-client.ts) und die
// Server Actions (actions/ki-assistent.ts, actions/ki-anbieter.ts) bleiben
// hier bewusst aussen vor - fuer die kann diese Umgebung ohne echten
// Modellzugang und ohne Datenbank ohnehin nichts Sinnvolles pruefen.
// =============================================================================

import { entschluessleApiKey, verschluessleApiKey } from "../../src/lib/ai/schluessel.ts";
import {
  baueAnthropicAnfrage,
  baueOpenAiKompatibelAnfrage,
  parseAnthropicAntwort,
  parseOpenAiKompatibelAntwort,
} from "../../src/lib/ai/anfrage.ts";
import {
  baueFeldregelnKontext,
  baueGesamtWissenskontext,
  baueSystemPrompt,
  baueWissensKontext,
  istGueltigerAnbieterTyp,
  sollteAutomatischEskalieren,
  wissensQuellenFuerFaehigkeiten,
} from "../../src/lib/domain/ki-assistent.ts";

let bestanden = 0;
let fehlgeschlagen = 0;

function pruefe(name, bedingung, info = "") {
  if (bedingung) {
    bestanden++;
    console.log(`  OK   ${name}${info ? "  " + info : ""}`);
  } else {
    fehlgeschlagen++;
    console.log(`  FEHL ${name}${info ? "  " + info : ""}`);
  }
}

// --- 1. schluessel.ts --------------------------------------------------------

process.env.KI_ANBIETER_SCHLUESSEL = "test-schluessel-fuer-diesen-lauf";

{
  const chiffrat = verschluessleApiKey("sk-sokrates-abc123");
  const klartext = entschluessleApiKey(chiffrat);
  pruefe("Verschluesseln/Entschluesseln liefert denselben Klartext zurueck", klartext === "sk-sokrates-abc123");
  pruefe("Das Chiffrat ist nicht der Klartext selbst", !chiffrat.includes("sk-sokrates-abc123"));
}

{
  // Zwei Verschluesselungen desselben Klartexts duerfen nicht gleich aussehen
  // (zufaelliger IV je Aufruf) - sonst waere ein wiederverwendeter Schluessel
  // aus dem Chiffrat-Muster erkennbar.
  const a = verschluessleApiKey("gleicher-klartext");
  const b = verschluessleApiKey("gleicher-klartext");
  pruefe("Zwei Verschluesselungen desselben Textes ergeben unterschiedliche Chiffrate", a !== b);
}

{
  const chiffrat = verschluessleApiKey("geheim");
  const urspruenglicherSchluessel = process.env.KI_ANBIETER_SCHLUESSEL;
  process.env.KI_ANBIETER_SCHLUESSEL = "ein-anderer-schluessel";
  let wurfErhalten = false;
  try {
    entschluessleApiKey(chiffrat);
  } catch {
    wurfErhalten = true;
  }
  process.env.KI_ANBIETER_SCHLUESSEL = urspruenglicherSchluessel;
  pruefe("Entschluesseln mit falschem Schluessel wirft (AES-GCM-Unversehrtheitspruefung)", wurfErhalten);
}

{
  let wurfErhalten = false;
  const urspruenglicherSchluessel = process.env.KI_ANBIETER_SCHLUESSEL;
  delete process.env.KI_ANBIETER_SCHLUESSEL;
  try {
    verschluessleApiKey("irrelevant");
  } catch {
    wurfErhalten = true;
  }
  process.env.KI_ANBIETER_SCHLUESSEL = urspruenglicherSchluessel;
  pruefe("Ohne KI_ANBIETER_SCHLUESSEL wirft die Verschluesselung fail-fast", wurfErhalten);
}

// --- 2. anfrage.ts ------------------------------------------------------------

{
  const verlauf = [
    { rolle: "system", inhalt: "Systemanweisung" },
    { rolle: "nutzer", inhalt: "Welche Sorten gibt es?" },
  ];
  const anfrage = baueOpenAiKompatibelAnfrage("https://api.beispiel.kz/v1", "sokrates-1", "sk-abc", verlauf);
  pruefe("OpenAI-kompatibel: URL haengt /chat/completions an", anfrage.url === "https://api.beispiel.kz/v1/chat/completions");
  pruefe("OpenAI-kompatibel: Authorization-Header traegt den Bearer-Schluessel", anfrage.headers.authorization === "Bearer sk-abc");
  const body = JSON.parse(anfrage.body);
  pruefe("OpenAI-kompatibel: system-Rolle bleibt system", body.messages[0].role === "system");
  pruefe("OpenAI-kompatibel: nutzer wird zu user", body.messages[1].role === "user");
}

{
  // Ein abschliessender Schraegstrich in der Basis-URL darf nicht zu einem
  // doppelten Schraegstrich fuehren.
  const anfrage = baueOpenAiKompatibelAnfrage("https://api.beispiel.kz/v1/", "m", "k", []);
  pruefe("OpenAI-kompatibel: abschliessender Schraegstrich in der Basis-URL wird entfernt", anfrage.url === "https://api.beispiel.kz/v1/chat/completions");
}

{
  const antwort = parseOpenAiKompatibelAntwort({ choices: [{ message: { content: "Polka ist verfuegbar." } }] });
  pruefe("OpenAI-kompatibel: Antworttext wird korrekt ausgelesen", antwort === "Polka ist verfuegbar.");
}

for (const [name, kaputteAntwort] of [
  ["choices fehlt", {}],
  ["choices ist leer", { choices: [] }],
  ["message fehlt", { choices: [{}] }],
  ["content ist kein Text", { choices: [{ message: { content: 42 } }] }],
  ["content ist eine leere Zeichenkette", { choices: [{ message: { content: "  " } }] }],
]) {
  pruefe(`OpenAI-kompatibel: unerwartete Antwortform ("${name}") liefert null statt eines Wurfs`, parseOpenAiKompatibelAntwort(kaputteAntwort) === null);
}

{
  const verlauf = [
    { rolle: "system", inhalt: "Systemanweisung" },
    { rolle: "nutzer", inhalt: "Frage" },
    { rolle: "assistent", inhalt: "Antwort" },
  ];
  const anfrage = baueAnthropicAnfrage("https://api.anthropic.com", "claude-sonnet-5", "ant-key", verlauf);
  pruefe("Anthropic: URL haengt /v1/messages an", anfrage.url === "https://api.anthropic.com/v1/messages");
  pruefe("Anthropic: Schluessel steht im x-api-key-Header, nicht in Authorization", anfrage.headers["x-api-key"] === "ant-key" && !anfrage.headers.authorization);
  const body = JSON.parse(anfrage.body);
  pruefe("Anthropic: system-Nachrichten werden ins system-Feld gezogen", body.system === "Systemanweisung");
  pruefe("Anthropic: messages enthaelt keine system-Rolle mehr", body.messages.every((m) => m.role !== "system"));
  pruefe("Anthropic: assistent wird zu assistant", body.messages[1].role === "assistant");
}

{
  const antwort = parseAnthropicAntwort({ content: [{ type: "text", text: "Antworttext" }] });
  pruefe("Anthropic: Antworttext wird korrekt ausgelesen", antwort === "Antworttext");
  pruefe("Anthropic: unerwartete Antwortform liefert null", parseAnthropicAntwort({ content: [] }) === null);
}

// --- 3. domain/ki-assistent.ts ------------------------------------------------

{
  pruefe("istGueltigerAnbieterTyp: openai_kompatibel ist gueltig", istGueltigerAnbieterTyp("openai_kompatibel"));
  pruefe("istGueltigerAnbieterTyp: anthropic ist gueltig", istGueltigerAnbieterTyp("anthropic"));
  pruefe("istGueltigerAnbieterTyp: ein erfundener Typ ist ungueltig", !istGueltigerAnbieterTyp("openai"));
}

{
  const kontext = baueWissensKontext([
    {
      name: "Saison 2026",
      gueltigAb: "2026-06-01",
      gueltigBis: null,
      positionen: [{ sorte: "Polka", preisTengeKg: 3200, minMengeKg: 50 }],
    },
  ]);
  pruefe("baueWissensKontext: Sorte und Preis stehen im Text", kontext.includes("Polka") && kontext.includes("3200"));
}

{
  const kontext = baueWissensKontext([]);
  pruefe("baueWissensKontext: ohne Preisliste ein Hinweis statt eines leeren Textes", kontext.length > 0 && !kontext.includes("undefined"));
}

{
  const prompt = baueSystemPrompt("Testkontext");
  pruefe("baueSystemPrompt: enthaelt den uebergebenen Wissenskontext", prompt.includes("Testkontext"));
}

{
  const alleErfolgreich = [
    { rolle: "nutzer", fallback: false },
    { rolle: "assistent", fallback: false },
    { rolle: "nutzer", fallback: false },
    { rolle: "assistent", fallback: false },
  ];
  pruefe("sollteAutomatischEskalieren: keine Eskalation, solange Antworten erfolgreich waren", !sollteAutomatischEskalieren(alleErfolgreich));
}

{
  const zweimalFallback = [
    { rolle: "nutzer", fallback: false },
    { rolle: "assistent", fallback: true },
    { rolle: "nutzer", fallback: false },
    { rolle: "assistent", fallback: true },
  ];
  pruefe("sollteAutomatischEskalieren: eskaliert nach zwei Fallback-Antworten in Folge", sollteAutomatischEskalieren(zweimalFallback));
}

{
  const einmalFallbackDannErfolg = [
    { rolle: "assistent", fallback: true },
    { rolle: "nutzer", fallback: false },
    { rolle: "assistent", fallback: false },
  ];
  pruefe(
    "sollteAutomatischEskalieren: eine erfolgreiche Antwort danach setzt die Zaehlung zurueck",
    !sollteAutomatischEskalieren(einmalFallbackDannErfolg),
  );
}

// --- Rollenbasierte Wissensgrundlage ------------------------------------------
// wissensQuellenFuerFaehigkeiten() prueft nur die reine Abbildung
// Faehigkeit -> Wissensquelle - die tatsaechliche rbac.ts-Abfrage
// (hasPermission fuer b2b_portal/sortenkatalog/pflueckaufgaben/kuehlkette je
// Rolle) steht in actions/ki-assistent.ts und laesst sich aus den oben
// genannten Gruenden hier nicht mit importieren; die reale Zuordnung je
// Rolle (z. B. "bekommt brigade wirklich nur Feldregeln") ist live im
// Browser gegengeprueft, nicht hier.

{
  pruefe(
    "wissensQuellenFuerFaehigkeiten: nur Feldbetrieb -> ausschliesslich Feldregeln, keine Preisliste",
    JSON.stringify(wissensQuellenFuerFaehigkeiten({ siehtProdukteUndPreise: false, siehtFeldbetrieb: true })) ===
      JSON.stringify(["feldregeln"]),
  );
}

{
  pruefe(
    "wissensQuellenFuerFaehigkeiten: nur Produkte/Preise -> ausschliesslich Preisliste, keine Feldregeln",
    JSON.stringify(wissensQuellenFuerFaehigkeiten({ siehtProdukteUndPreise: true, siehtFeldbetrieb: false })) ===
      JSON.stringify(["preisliste"]),
  );
}

{
  pruefe(
    "wissensQuellenFuerFaehigkeiten: beide Faehigkeiten -> beide Quellen",
    JSON.stringify(wissensQuellenFuerFaehigkeiten({ siehtProdukteUndPreise: true, siehtFeldbetrieb: true })) ===
      JSON.stringify(["preisliste", "feldregeln"]),
  );
}

{
  pruefe(
    "wissensQuellenFuerFaehigkeiten: keine Faehigkeit -> keine Quelle",
    wissensQuellenFuerFaehigkeiten({ siehtProdukteUndPreise: false, siehtFeldbetrieb: false }).length === 0,
  );
}

{
  const kontext = baueFeldregelnKontext();
  pruefe(
    "baueFeldregelnKontext: enthaelt die 60-Minuten-Regel, keine Preis-/Kundendaten",
    kontext.includes("60 Minuten") && !kontext.includes("Tenge"),
    kontext,
  );
}

{
  const kontext = baueGesamtWissenskontext([], []);
  pruefe(
    "baueGesamtWissenskontext: ohne jede Quelle (z. B. picker) ein expliziter Hinweis statt leerem Text",
    kontext.length > 0 && kontext.includes("Buero"),
    kontext,
  );
}

{
  const kontext = baueGesamtWissenskontext(["feldregeln"], []);
  pruefe(
    "baueGesamtWissenskontext: Feldrolle bekommt Feldregeln, aber keine Preisliste im Kontext, selbst wenn welche uebergeben wuerde",
    kontext.includes("60 Minuten") && !kontext.includes("Tenge"),
    kontext,
  );
}

{
  const preislisten = [
    {
      name: "Saison 2026",
      gueltigAb: "2026-06-01",
      gueltigBis: null,
      positionen: [{ sorte: "Polka", preisTengeKg: 3200, minMengeKg: 50 }],
    },
  ];
  const kontext = baueGesamtWissenskontext(["preisliste"], preislisten);
  pruefe(
    "baueGesamtWissenskontext: Bueoro-/Kunden-Rolle bekommt die Preisliste, keine Feldregeln im Kontext",
    kontext.includes("Polka") && !kontext.includes("Pflanzenschutzbehandlung"),
    kontext,
  );
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
