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

import { readFileSync } from "node:fs";
import { entschluessleApiKey, verschluessleApiKey } from "../../src/lib/ai/schluessel.ts";
import {
  baueAnthropicAnfrage,
  baueOpenAiKompatibelAnfrage,
  maxAntwortTokens,
  verlaufLaenge,
  zeitlimitMs,
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
  zerlegeInAbschnitte,
  baueWissensdokumenteKontext,
} from "../../src/lib/domain/ki-assistent.ts";
import {
  alsVektorLiteral,
  einbettungBasisUrl,
  einbettungModell,
  einbettungZeitlimitMs,
  einbettungZugangsHeader,
  erzeugeEinbettung,
  ERWARTETE_EINBETTUNGS_DIMENSION,
} from "../../src/lib/ai/einbettung-client.ts";

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


// --- 2b. Antwortbudget (max_tokens) -----------------------------------------
// Frueher fest 500 Token. Ein denkendes Modell verbraucht die fuer sein
// reasoning-Feld, content kommt leer zurueck und die App zeigt die
// Ausweichantwort - siehe Kommentar in anfrage.ts.
{
  delete process.env.KI_MAX_TOKENS;
  pruefe("Antwortbudget: Standard ist 2000 Token, nicht mehr 500", maxAntwortTokens() === 2000);

  const koerper = JSON.parse(
    baueOpenAiKompatibelAnfrage("https://api.beispiel.kz/v1", "m", "k", [
      { rolle: "nutzer", inhalt: "Hallo" },
    ]).body,
  );
  pruefe("Antwortbudget: landet im OpenAI-kompatiblen Koerper", koerper.max_tokens === 2000);

  const anthropicKoerper = JSON.parse(
    baueAnthropicAnfrage("https://api.anthropic.com", "m", "k", [
      { rolle: "nutzer", inhalt: "Hallo" },
    ]).body,
  );
  pruefe("Antwortbudget: gilt auch fuer Anthropic", anthropicKoerper.max_tokens === 2000);

  process.env.KI_MAX_TOKENS = "4096";
  pruefe("Antwortbudget: KI_MAX_TOKENS hebt den Wert an", maxAntwortTokens() === 4096);

  process.env.KI_MAX_TOKENS = "7";
  pruefe("Antwortbudget: unplausibel kleiner Wert faellt auf den Standard zurueck", maxAntwortTokens() === 2000);

  process.env.KI_MAX_TOKENS = "keine-zahl";
  pruefe("Antwortbudget: unlesbarer Wert faellt auf den Standard zurueck", maxAntwortTokens() === 2000);
  delete process.env.KI_MAX_TOKENS;
}


// --- 2c. Zeitlimit -----------------------------------------------------------
// Frueher fest 20 Sekunden. Ein selbst gehostetes Modell laedt beim ersten
// Aufruf erst seine Gewichte - gemessen 24,0 s kalt gegen 10,2 s warm, siehe
// Kommentar in anbieter-client.ts.
{
  delete process.env.KI_ZEITLIMIT_MS;
  pruefe("Zeitlimit: Standard ist 60 Sekunden, nicht mehr 20", zeitlimitMs() === 60_000);

  process.env.KI_ZEITLIMIT_MS = "15000";
  pruefe("Zeitlimit: KI_ZEITLIMIT_MS senkt den Wert fuer schnelle Anbieter", zeitlimitMs() === 15_000);

  process.env.KI_ZEITLIMIT_MS = "50";
  pruefe("Zeitlimit: unplausibel kurzer Wert faellt auf den Standard zurueck", zeitlimitMs() === 60_000);

  process.env.KI_ZEITLIMIT_MS = "keine-zahl";
  pruefe("Zeitlimit: unlesbarer Wert faellt auf den Standard zurueck", zeitlimitMs() === 60_000);
  delete process.env.KI_ZEITLIMIT_MS;
}

// --- 2d. Verlauflaenge (Kurzzeitgedaechtnis) ---------------------------------
// Frueher fest 10 (baueVerlaufFuerModell(), actions/ki-assistent.ts). Gedeckelt
// bei 30, weil ladeKiChatVerlauf() (data/ki-assistent.ts) nie mehr laedt.
{
  delete process.env.KI_VERLAUF_LAENGE;
  pruefe("Verlauflaenge: Standard ist 20, nicht mehr 10", verlaufLaenge() === 20);

  process.env.KI_VERLAUF_LAENGE = "30";
  pruefe("Verlauflaenge: KI_VERLAUF_LAENGE hebt den Wert bis zum Deckel an", verlaufLaenge() === 30);

  process.env.KI_VERLAUF_LAENGE = "31";
  pruefe("Verlauflaenge: ueber dem Deckel (30) faellt auf den Standard zurueck", verlaufLaenge() === 20);

  process.env.KI_VERLAUF_LAENGE = "0";
  pruefe("Verlauflaenge: 0 ist gueltig (kein Verlauf, nur die neue Frage)", verlaufLaenge() === 0);

  process.env.KI_VERLAUF_LAENGE = "keine-zahl";
  pruefe("Verlauflaenge: unlesbarer Wert faellt auf den Standard zurueck", verlaufLaenge() === 20);
  delete process.env.KI_VERLAUF_LAENGE;
}

// --- 2e. Reasoning-Unterdrueckung (denkende Modelle) --------------------------
// Standardmaessig aus - siehe Kommentar in anfrage.ts, warum das "think"-Feld
// von hier aus nicht gegen Sokrates-2 verifizierbar war.
{
  delete process.env.KI_DEAKTIVIERE_REASONING;
  const ohneFlag = JSON.parse(
    baueOpenAiKompatibelAnfrage("https://api.beispiel.kz/v1", "m", "k", [
      { rolle: "nutzer", inhalt: "Hallo" },
    ]).body,
  );
  pruefe("Reasoning-Unterdrueckung: standardmaessig kein think-Feld im Koerper", !("think" in ohneFlag));

  process.env.KI_DEAKTIVIERE_REASONING = "true";
  const mitFlag = JSON.parse(
    baueOpenAiKompatibelAnfrage("https://api.beispiel.kz/v1", "m", "k", [
      { rolle: "nutzer", inhalt: "Hallo" },
    ]).body,
  );
  pruefe("Reasoning-Unterdrueckung: KI_DEAKTIVIERE_REASONING=true setzt think auf false", mitFlag.think === false);

  const anthropicKoerper = JSON.parse(
    baueAnthropicAnfrage("https://api.anthropic.com", "m", "k", [
      { rolle: "nutzer", inhalt: "Hallo" },
    ]).body,
  );
  pruefe("Reasoning-Unterdrueckung: betrifft nur openai-kompatibel, nicht Anthropic", !("think" in anthropicKoerper));
  delete process.env.KI_DEAKTIVIERE_REASONING;
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


// --- 4. Wissensdokumente (RAG) ----------------------------------------------
// Reine Funktionen, kein Netz, keine Datenbank - der echte Weg (Einbettung auf
// Sokrates-2, pgvector-Suche) ist nur gegen die laufende Umgebung pruefbar und
// steht deshalb in der PR-Beschreibung, nicht hier.

{
  pruefe("zerlegeInAbschnitte: leerer Text ergibt keine Abschnitte", zerlegeInAbschnitte("").length === 0);
  pruefe(
    "zerlegeInAbschnitte: nur Leerraum ergibt keine Abschnitte",
    zerlegeInAbschnitte("   \n\t  ").length === 0,
  );

  const kurz = zerlegeInAbschnitte("Ein kurzer Absatz.");
  pruefe(
    "zerlegeInAbschnitte: kurzer Text bleibt ein einziger Abschnitt",
    kurz.length === 1 && kurz[0] === "Ein kurzer Absatz.",
  );

  // Laenger als das Maximum: muss zerfallen, und zwar ohne leere Stuecke.
  const lang = "Satz. ".repeat(500);
  const viele = zerlegeInAbschnitte(lang, 200, 20);
  pruefe("zerlegeInAbschnitte: langer Text zerfaellt in mehrere Abschnitte", viele.length > 1, `Abschnitte: ${viele.length}`);
  pruefe("zerlegeInAbschnitte: kein Abschnitt ist leer", viele.every((a) => a.trim().length > 0));
  pruefe(
    "zerlegeInAbschnitte: kein Abschnitt ueberschreitet das Maximum",
    viele.every((a) => a.length <= 200),
    `laengster: ${Math.max(...viele.map((a) => a.length))}`,
  );
  pruefe(
    "zerlegeInAbschnitte: die Abschnitte ueberlappen sich (Kontext geht an der Grenze nicht verloren)",
    viele.length > 1 && lang.trim().length < viele.reduce((summe, a) => summe + a.length, 0),
  );
}

{
  pruefe(
    "baueWissensdokumenteKontext: ohne Treffer ein leerer Text, kein Hinweissatz",
    baueWissensdokumenteKontext([]) === "",
  );

  const kontext = baueWissensdokumenteKontext([
    { dokumentTitel: "Qualitaetsrichtlinie", inhalt: "Klasse I ab 12 mm.", aehnlichkeit: 0.9 },
    { dokumentTitel: "Lieferbedingungen", inhalt: "Abholung bis 10 Uhr.", aehnlichkeit: 0.7 },
  ]);
  pruefe(
    "baueWissensdokumenteKontext: nennt den Dokumenttitel je Ausschnitt",
    kontext.includes('Aus Dokument "Qualitaetsrichtlinie"') &&
      kontext.includes('Aus Dokument "Lieferbedingungen"'),
  );
  pruefe("baueWissensdokumenteKontext: enthaelt die Inhalte selbst", kontext.includes("Klasse I ab 12 mm.") && kontext.includes("Abholung bis 10 Uhr."));
}

{
  delete process.env.KI_EINBETTUNG_ZEITLIMIT_MS;
  delete process.env.KI_EINBETTUNG_URL;
  delete process.env.KI_EINBETTUNG_MODELL;

  pruefe("Einbettung: Standard-Zeitlimit betraegt 30 Sekunden", einbettungZeitlimitMs() === 30_000);
  pruefe("Einbettung: Standard-Adresse zeigt auf Sokrates-2", einbettungBasisUrl() === "http://192.168.178.136:11434");
  pruefe("Einbettung: Standardmodell ist bge-m3 (mehrsprachig)", einbettungModell() === "bge-m3");
  // Liest die Migration selbst, statt eine zweite Kopie der Zahl zu pflegen:
  // Spalte und RPC-Parameter muessen beide genau die erwartete Dimension haben.
  const wissenMigration = readFileSync(
    new URL("../migrations/20261031000000_ki_wissen_dokumente.sql", import.meta.url),
    "utf8",
  );
  const vektorDimensionen = [...wissenMigration.matchAll(/vector\((\d+)\)/g)].map((m) => Number(m[1]));
  pruefe(
    "Einbettung: erwartete Dimension (1024) passt zu jeder vector(n)-Stelle der Migration",
    ERWARTETE_EINBETTUNGS_DIMENSION === 1024 &&
      vektorDimensionen.length >= 2 &&
      vektorDimensionen.every((d) => d === ERWARTETE_EINBETTUNGS_DIMENSION),
  );

  process.env.KI_EINBETTUNG_ZEITLIMIT_MS = "45000";
  process.env.KI_EINBETTUNG_URL = "http://beispiel.intern:11434";
  process.env.KI_EINBETTUNG_MODELL = "ein-anderes-modell";
  pruefe("Einbettung: KI_EINBETTUNG_ZEITLIMIT_MS wirkt", einbettungZeitlimitMs() === 45_000);
  pruefe("Einbettung: KI_EINBETTUNG_URL wirkt", einbettungBasisUrl() === "http://beispiel.intern:11434");
  pruefe("Einbettung: KI_EINBETTUNG_MODELL wirkt", einbettungModell() === "ein-anderes-modell");

  process.env.KI_EINBETTUNG_ZEITLIMIT_MS = "12";
  pruefe("Einbettung: unplausibel kurzes Zeitlimit faellt auf den Standard zurueck", einbettungZeitlimitMs() === 30_000);
  process.env.KI_EINBETTUNG_ZEITLIMIT_MS = "keine-zahl";
  pruefe("Einbettung: unlesbares Zeitlimit faellt auf den Standard zurueck", einbettungZeitlimitMs() === 30_000);

  delete process.env.KI_EINBETTUNG_ZEITLIMIT_MS;
  delete process.env.KI_EINBETTUNG_URL;
  delete process.env.KI_EINBETTUNG_MODELL;
}

{
  // pgvector nimmt ueber PostgREST die Textform, nicht ein JSON-Array - siehe
  // Kommentar bei alsVektorLiteral().
  pruefe("alsVektorLiteral: erzeugt die pgvector-Textform", alsVektorLiteral([0.5, -1, 2]) === "[0.5,-1,2]");
  pruefe("alsVektorLiteral: leerer Vektor ergibt leere Klammern", alsVektorLiteral([]) === "[]");
}

// --- Cloudflare Access vor Sokrates-2 (Service Token) -----------------------
// fetch wird fuer diese Pruefungen durch einen Mitschreiber ersetzt - kein
// Netzwerk, aber die tatsaechlich gebaute Anfrage von erzeugeEinbettung().
{
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  let naechsteAntwort;
  globalThis.fetch = async (url, init) => {
    aufrufe.push({ url, init });
    return naechsteAntwort();
  };
  const vektorAntwort = () =>
    new Response(JSON.stringify({ embedding: Array.from({ length: ERWARTETE_EINBETTUNGS_DIMENSION }, () => 0.1) }), { status: 200 });

  try {
    delete process.env.KI_EINBETTUNG_ACCESS_ID;
    delete process.env.KI_EINBETTUNG_ACCESS_SECRET;
    const ohne = einbettungZugangsHeader();
    pruefe("Access: ohne beide Werte keine Header (lokal im Buero-LAN)", ohne.ok && Object.keys(ohne.headers).length === 0);

    process.env.KI_EINBETTUNG_ACCESS_ID = "id.access";
    const halb = einbettungZugangsHeader();
    pruefe("Access: nur ein Wert gesetzt ist ein Fehler, nicht still ohne Header", !halb.ok && halb.grund.startsWith("zugang-unvollstaendig"));
    aufrufe.length = 0;
    naechsteAntwort = vektorAntwort;
    const halbAufruf = await erzeugeEinbettung("Frage");
    pruefe("Access: unvollstaendiger Zugang schickt gar keine Anfrage los", !halbAufruf.ok && aufrufe.length === 0);

    process.env.KI_EINBETTUNG_ACCESS_SECRET = "geheim-access";
    aufrufe.length = 0;
    naechsteAntwort = vektorAntwort;
    const mit = await erzeugeEinbettung("Frage");
    const gesendet = aufrufe[0]?.init;
    pruefe(
      "Access: beide Werte gesetzt - CF-Access-Client-Id/-Secret gehen mit der Einbettungsanfrage",
      mit.ok && gesendet?.headers["CF-Access-Client-Id"] === "id.access" && gesendet?.headers["CF-Access-Client-Secret"] === "geheim-access",
    );
    pruefe("Access: Geheimnis steht nur im Header, nicht im Body", !String(gesendet?.body).includes("geheim-access"));
    pruefe("Access: Umleitungen werden nicht verfolgt (redirect: manual)", gesendet?.redirect === "manual");

    // Abweisung durch Access (Umleitung auf die Anmeldeseite bzw. 403) muss
    // als solche erkennbar sein, nicht als "unerwartete Antwortform".
    for (const status of [302, 403]) {
      naechsteAntwort = () => new Response("", { status, headers: status === 302 ? { location: "https://x.cloudflareaccess.com/login" } : {} });
      const abgewiesen = await erzeugeEinbettung("Frage");
      pruefe(`Access: Status ${status} wird als zugang-abgewiesen gemeldet`, !abgewiesen.ok && abgewiesen.grund.startsWith("zugang-abgewiesen"));
    }
  } finally {
    globalThis.fetch = echtesFetch;
    delete process.env.KI_EINBETTUNG_ACCESS_ID;
    delete process.env.KI_EINBETTUNG_ACCESS_SECRET;
  }
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
