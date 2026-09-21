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
import {
  MAX_SPRACHAUSGABE_ZEICHEN,
  sprachausgabeSprachen,
  stimmeFuerOberflaeche,
  sprachausgabePfad,
  STIMMEN,
  textFuerSprachausgabe,
} from "../../src/lib/domain/sprachausgabe.ts";
import { erzeugeSprachausgabe, sprachausgabeUrl, sprachausgabeZugangsHeader } from "../../src/lib/ai/sprachausgabe-client.ts";
import {
  transkriptionBasisUrl,
  transkribiereAudio,
  transkriptionsMeldung,
  transkriptionSprachen,
  transkriptionZeitlimitMs,
  transkriptionZugangsHeader,
} from "../../src/lib/ai/transkription-client.ts";
import {
  DIKTAT_STANDARD,
  diktatEinstellungen,
  erzeugeStilleWaechter,
  pegelAusZeitbereich,
} from "../../src/lib/domain/diktat.ts";
import {
  sonioxBasisUrl,
  sonioxZeitlimitMs,
  spracherkennungAnbieter,
  transkribiereMitSoniox,
} from "../../src/lib/ai/soniox-client.ts";
import { readFileSync } from "node:fs";

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
    kontext.length > 0 && kontext.includes("Büro"),
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

// --- 5. Sprachausgabe (domain/sprachausgabe.ts, ai/sprachausgabe-client.ts) --
{
  // Seit dem 21.09.2026 raet nichts mehr die Sprache: die Systemsprache
  // bestimmt Stimme, Antwort und Beiwerk. Der Grund steht in
  // api/ki-assistent/route.ts - bei einer DIKTIERTEN Frage kam die Erkennung
  // auf den Text der Spracherkennung, und der stand bei falschem Sprachhinweis
  // selbst schon in der falschen Sprache ("Sahlkentiz wird tollen, kurzat."
  // fuer einen kasachischen Satz auf deutscher Oberflaeche). Eine Einstellung,
  // die die Person selbst setzt, ist verlaesslicher als jede Erkennung.
  for (const sprache of sprachausgabeSprachen) {
    pruefe(
      `Systemsprache: ${sprache} hat eine Stimme, die Oberflaeche bestimmt sie`,
      stimmeFuerOberflaeche(sprache) !== null,
      sprache,
    );
  }
  pruefe("Systemsprache: eine unbekannte Oberflaechensprache hat keine Stimme", stimmeFuerOberflaeche("fr") === null);
  pruefe("Systemsprache: Tuerkisch ist entfernt und hat keine Stimme mehr", stimmeFuerOberflaeche("tr") === null);

  const markdown = "## Stand\n\n- **Polka:** 1100 kg frei\n- `Kweli`: 500 kg\n\n| Sorte | kg |\n|---|---|\n| Polana | 1150 |\n\n[Zum Katalog](/dashboard/markt/sortenkatalog)";
  const vorlesbar = textFuerSprachausgabe(markdown);
  pruefe(
    "Sprachausgabe: Markdown-Zeichen werden nicht mitgesprochen",
    !/[*#`|]|\]\(|\/dashboard/.test(vorlesbar),
    JSON.stringify(vorlesbar),
  );
  pruefe(
    "Sprachausgabe: der Inhalt bleibt erhalten (Sorten, Mengen, Linktext)",
    ["Polka", "1100", "Kweli", "500", "Polana", "1150", "Zum Katalog"].every((w) => vorlesbar.includes(w)),
  );
  pruefe(
    "Sprachausgabe: Tabellenzeilen werden als 'Zelle, Zelle' gelesen, ohne Kommas am Rand",
    vorlesbar.includes("Polana, 1150") && vorlesbar.includes("Sorte, kg") && !/^\s*,|,\s*$/m.test(vorlesbar) && !vorlesbar.includes("kg Polana"),
    JSON.stringify(vorlesbar),
  );
  const lang = textFuerSprachausgabe("Satz eins ist hier. ".repeat(400));
  pruefe(
    "Sprachausgabe: lange Antwort wird auf MAX_SPRACHAUSGABE_ZEICHEN gekuerzt, an einer Satzgrenze",
    lang.length <= MAX_SPRACHAUSGABE_ZEICHEN && lang.endsWith("."),
    `${lang.length} Zeichen`,
  );

  // Der Dienst waehlt die Stimme ueber <sprache>-male/-female. Ein
  // Tippfehler faellt dort NICHT als Fehler auf: eine unbekannte Stimme
  // beantwortet er mit 200 und irgendeiner Standardstimme (am 20.09.2026 mit
  // "gibt-es-nicht" geprueft). Diese Pruefung ist deshalb die einzige
  // Absicherung dagegen, dass eine Antwort in der falschen Sprache klingt.
  pruefe(
    "Sprachausgabe: jede Sprache hat genau ihre eigene Stimme (<sprache>-male/-female)",
    Object.entries(STIMMEN).every(([sprache, s]) => s && new RegExp(`^${sprache}-(male|female)$`).test(s.stimme)),
    JSON.stringify(Object.fromEntries(Object.entries(STIMMEN).map(([k, v]) => [k, v?.stimme ?? null]))),
  );
  // Ablagepfad im Zwischenspeicher (Bucket ki-sprachausgabe): je Antwort und
  // Stimme genau einer, ohne Schraegstriche oder Punkte aus dem Modellnamen.
  const id = "11111111-2222-4333-8444-555555555555";
  const pfadDe = sprachausgabePfad(id, STIMMEN.de);
  pruefe("Zwischenspeicher: Pfad beginnt mit der Nachrichten-ID und endet auf .mp3", pfadDe.startsWith(`${id}/`) && pfadDe.endsWith(".mp3"), pfadDe);
  pruefe("Zwischenspeicher: derselbe Aufruf ergibt denselben Pfad", pfadDe === sprachausgabePfad(id, STIMMEN.de));
  pruefe("Zwischenspeicher: andere Stimme -> anderer Pfad (kein altes Audio nach Stimmwechsel)", pfadDe !== sprachausgabePfad(id, STIMMEN.kk));
  pruefe("Zwischenspeicher: andere Antwort -> anderer Pfad", pfadDe !== sprachausgabePfad("99999999-2222-4333-8444-555555555555", STIMMEN.de));
  pruefe(
    "Zwischenspeicher: Dateiname enthaelt nur unverfaengliche Zeichen (kein / oder .. aus dem Modellnamen)",
    /^[0-9a-f-]{36}\/[a-z0-9-]+\.mp3$/.test(pfadDe),
    pfadDe,
  );

  // Mit den Piper-Stimmen auf Caesar blieb Russisch stumm - es gab nur
  // Modelle mit unklarer oder nicht kommerzieller Lizenz. Ueber den Dienst
  // sprechen jetzt alle vier.
  pruefe(
    "Sprachausgabe: alle vier Sprachen haben eine Stimme, auch Russisch",
    Object.keys(STIMMEN).length === 4 && Object.values(STIMMEN).every((s) => s !== null),
    Object.keys(STIMMEN).join(", "),
  );
  pruefe("Sprachausgabe: keine tuerkische Stimme mehr", !("tr" in STIMMEN));
  // Der Stimmwechsel aendert auch den Ablagepfad: alte Piper-Aufnahmen
  // werden nicht mehr gefunden, statt mit der neuen Stimme verwechselt zu
  // werden.
  pruefe(
    "Zwischenspeicher: der Pfad traegt den neuen Stimmnamen, nicht den alten Piper-Namen",
    pfadDe.endsWith("/de-female.mp3") && !pfadDe.includes("piper"),
    pfadDe,
  );
}

{
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  let naechsteAntwort;
  globalThis.fetch = async (url, init) => {
    aufrufe.push({ url, init });
    return naechsteAntwort();
  };
  const stimme = STIMMEN.de;
  try {
    delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
    delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
    naechsteAntwort = () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    const lokal = await erzeugeSprachausgabe("Hallo", stimme);
    const body = JSON.parse(aufrufe[0]?.init.body ?? "{}");
    pruefe("Sprachausgabe-Client: lokal ohne Access-Header, Audio kommt zurueck", lokal.ok && lokal.typ === "audio/mpeg" && !aufrufe[0].init.headers["CF-Access-Client-Id"]);
    pruefe(
      "Sprachausgabe-Client: Anfrage traegt genau Text und Stimme (der Dienst kennt kein Modellfeld)",
      body.voice === stimme.stimme && body.input === "Hallo" && Object.keys(body).length === 2,
      JSON.stringify(body),
    );

    process.env.KI_TRANSKRIPTION_ACCESS_ID = "caesar.access";
    process.env.KI_TRANSKRIPTION_ACCESS_SECRET = "caesar-geheim";
    aufrufe.length = 0;
    await erzeugeSprachausgabe("Hallo", stimme);
    const h = aufrufe[0]?.init.headers ?? {};
    pruefe(
      "Sprachausgabe-Client: derselbe Caesar-Token wie die Transkription (KI_TRANSKRIPTION_ACCESS_*)",
      h["CF-Access-Client-Id"] === "caesar.access" && h["CF-Access-Client-Secret"] === "caesar-geheim" && !String(aufrufe[0].init.body).includes("caesar-geheim"),
    );
    pruefe("Sprachausgabe-Client: Umleitungen werden nicht verfolgt", aufrufe[0]?.init.redirect === "manual");

    naechsteAntwort = () => new Response("", { status: 302 });
    const abgewiesen = await erzeugeSprachausgabe("Hallo", stimme);
    pruefe("Sprachausgabe-Client: 302 (Access) wird als zugang-abgewiesen gemeldet", !abgewiesen.ok && abgewiesen.grund.startsWith("zugang-abgewiesen"));

    naechsteAntwort = () => new Response("<html>Login</html>", { status: 200, headers: { "content-type": "text/html" } });
    const html = await erzeugeSprachausgabe("Hallo", stimme);
    pruefe("Sprachausgabe-Client: HTML statt Audio wird abgewiesen", !html.ok && html.grund.startsWith("antwort-unerwartete-form"));

    delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
    aufrufe.length = 0;
    const halb = await erzeugeSprachausgabe("Hallo", stimme);
    pruefe("Sprachausgabe-Client: halber Zugang schickt nichts los", !halb.ok && aufrufe.length === 0);
  } finally {
    globalThis.fetch = echtesFetch;
    delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
    delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
  }
}


// --- 6. Spracheingabe (ai/transkription-client.ts) --------------------------
// Hintergrund: am 20.09.2026 meldete die Oberflaeche in Produktion
// "Spracherkennung nicht moeglich", obwohl Mikrofon und Aufnahme einwandfrei
// waren - der Dienst war schlicht nicht erreichbar (LAN-Adresse als
// Rueckfallwert, kein Tunnel, keine Access-Kopfzeilen). Die Pruefungen hier
// halten beide Lehren fest: Zugang mitschicken, und Fehlerursachen
// auseinanderhalten.
{
  const urspruenglich = {
    id: process.env.KI_TRANSKRIPTION_ACCESS_ID,
    geheim: process.env.KI_TRANSKRIPTION_ACCESS_SECRET,
    limit: process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS,
  };
  delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
  delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
  delete process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS;

  // Das Zeitlimit stand auf 300 s - auf Vercel unerreichbar, die Funktion
  // endet nach 60 s (maxDuration in den Routen). Der Abbruch kam also von der
  // Plattform statt von uns, ohne verwertbare Meldung.
  pruefe(
    "Spracheingabe: Zeitlimit passt unter die 60-s-Grenze der Plattform",
    transkriptionZeitlimitMs() <= 60_000,
    `${transkriptionZeitlimitMs()} ms`,
  );

  // Der eigentliche Produktionsfehler vom 20.09.2026: beide Dienste zeigten
  // ohne gesetzte Variable auf eine LAN-Adresse, die von Vercel aus niemand
  // erreicht. Voreinstellung ist jetzt der oeffentliche Dienst.
  for (const [name, url] of [["Spracheingabe", transkriptionBasisUrl()], ["Sprachausgabe", sprachausgabeUrl()]]) {
    pruefe(
      `${name}: Voreinstellung zeigt auf den oeffentlichen Dienst, nicht ins Buero-LAN`,
      url.startsWith("https://") && !/\b(10|127|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(url),
      url,
    );
  }

  pruefe("Spracheingabe: ohne Access-Variablen keine Kopfzeilen", transkriptionZugangsHeader().ok && Object.keys(transkriptionZugangsHeader().headers).length === 0);

  // Regelfall seit dem Wechsel auf Sokrates: ein Bearer-Token. Es hat Vorrang
  // vor dem Access-Paar, damit nie beide Zugaenge zugleich mitgehen - und es
  // gilt fuer BEIDE Richtungen, denn es ist ein Dienst.
  process.env.KI_SOKRATES_API_SCHLUESSEL = "sk-testschluessel";
  process.env.KI_TRANSKRIPTION_ACCESS_ID = "caesar.access";
  process.env.KI_TRANSKRIPTION_ACCESS_SECRET = "caesar-geheim";
  for (const [name, kopf] of [["Spracheingabe", transkriptionZugangsHeader()], ["Sprachausgabe", sprachausgabeZugangsHeader()]]) {
    pruefe(
      `${name}: Bearer-Token hat Vorrang und geht nie zusammen mit dem Access-Paar`,
      kopf.ok && kopf.headers.Authorization === "Bearer sk-testschluessel" && !kopf.headers["CF-Access-Client-Id"],
      JSON.stringify(kopf.ok ? Object.keys(kopf.headers) : kopf.grund),
    );
  }
  delete process.env.KI_SOKRATES_API_SCHLUESSEL;
  delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
  delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
  process.env.KI_TRANSKRIPTION_ACCESS_ID = "caesar.access";
  pruefe("Spracheingabe: halber Zugang ist ein Fehler, keine halbe Anfrage", !transkriptionZugangsHeader().ok);
  process.env.KI_TRANSKRIPTION_ACCESS_SECRET = "caesar-geheim";
  const zugang = transkriptionZugangsHeader();
  pruefe(
    "Spracheingabe: beide Werte gesetzt ergeben den Cloudflare-Access-Kopf",
    zugang.ok && zugang.headers["CF-Access-Client-Id"] === "caesar.access" && zugang.headers["CF-Access-Client-Secret"] === "caesar-geheim",
  );

  process.env.KI_TRANSKRIPTION_ACCESS_ID = urspruenglich.id ?? "";
  process.env.KI_TRANSKRIPTION_ACCESS_SECRET = urspruenglich.geheim ?? "";
  if (!urspruenglich.id) delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
  if (!urspruenglich.geheim) delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
  if (urspruenglich.limit) process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS = urspruenglich.limit;
}

{
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  let naechsteAntwort;
  globalThis.fetch = async (url, init) => {
    aufrufe.push({ url, init });
    return naechsteAntwort();
  };
  const audio = new Blob([new Uint8Array([1, 2, 3])], { type: "audio/webm" });
  try {
    process.env.KI_TRANSKRIPTION_ACCESS_ID = "caesar.access";
    process.env.KI_TRANSKRIPTION_ACCESS_SECRET = "caesar-geheim";
    naechsteAntwort = () => new Response(JSON.stringify({ text: "Polka ist verfuegbar." }), { status: 200, headers: { "content-type": "application/json" } });
    const gut = await transkribiereAudio(audio, "aufnahme.webm");
    const kopf = aufrufe[0]?.init.headers ?? {};
    pruefe("Spracheingabe-Client: erkannter Text kommt zurueck", gut.ok && gut.text === "Polka ist verfuegbar.");
    pruefe(
      "Spracheingabe-Client: derselbe Caesar-Token wie die Sprachausgabe (KI_TRANSKRIPTION_ACCESS_*)",
      kopf["CF-Access-Client-Id"] === "caesar.access" && kopf["CF-Access-Client-Secret"] === "caesar-geheim",
    );
    pruefe("Spracheingabe-Client: kein eigener content-type (fetch setzt die multipart-Grenze)", !("content-type" in kopf) && !("Content-Type" in kopf));
    pruefe("Spracheingabe-Client: Umleitungen werden nicht verfolgt", aufrufe[0]?.init.redirect === "manual");

    // Die Oberflaechensprache geht als Hinweis mit - sie trennt vor allem
    // Kasachisch von Russisch, die sich die kyrillische Schrift teilen.
    // Tuerkisch ist aus der Anwendung entfernt (die Erkennung lieferte dafuer
    // ohnehin Unsinn): "tr" darf nie mehr mitgeschickt werden.
    const sprachFelder = async (vorgabe) => {
      aufrufe.length = 0;
      naechsteAntwort = () => new Response(JSON.stringify({ text: "x" }), { status: 200, headers: { "content-type": "application/json" } });
      await transkribiereAudio(audio, "aufnahme.webm", vorgabe);
      return aufrufe[0]?.init.body?.get?.("language") ?? null;
    };
    pruefe("Spracheingabe-Client: Kasachisch wird als Sprache mitgeschickt", (await sprachFelder("kk")) === "kk");
    pruefe("Spracheingabe-Client: das entfernte Tuerkisch wird nicht mitgeschickt", (await sprachFelder("tr")) === null);
    pruefe("Spracheingabe-Client: erfundene Sprache wird still verworfen", (await sprachFelder("klingonisch")) === null);
    pruefe("Spracheingabe-Client: ohne Vorgabe erkennt der Dienst die Sprache selbst", (await sprachFelder(undefined)) === null);

    naechsteAntwort = () => new Response("", { status: 302 });
    const abgewiesen = await transkribiereAudio(audio, "aufnahme.webm");
    pruefe("Spracheingabe-Client: 302 (Anmeldeseite) wird als zugang-abgewiesen gemeldet", !abgewiesen.ok && abgewiesen.grund.startsWith("zugang-abgewiesen"));

    naechsteAntwort = () => {
      throw new TypeError("fetch failed");
    };
    const weg = await transkribiereAudio(audio, "aufnahme.webm");
    pruefe(
      "Spracheingabe-Client: unerreichbarer Dienst ist als solcher erkennbar",
      !weg.ok && weg.grund.startsWith("dienst-nicht-erreichbar"),
      weg.ok ? "" : weg.grund,
    );
  } finally {
    globalThis.fetch = echtesFetch;
    delete process.env.KI_TRANSKRIPTION_ACCESS_ID;
    delete process.env.KI_TRANSKRIPTION_ACCESS_SECRET;
  }
}

{
  // Die Meldung muss sagen, WORAN es lag - sonst sucht die Kundschaft den
  // Fehler bei sich und spricht lauter, waehrend in Wahrheit ein Dienst fehlt.
  pruefe("Meldung: unerreichbarer Dienst -> fehler.transkriptionDienst", transkriptionsMeldung("dienst-nicht-erreichbar: fetch failed") === "fehler.transkriptionDienst");
  pruefe("Meldung: Access-Abweisung -> fehler.transkriptionDienst", transkriptionsMeldung("zugang-abgewiesen (http-302) - Cloudflare Access?") === "fehler.transkriptionDienst");
  pruefe("Meldung: halber Zugang -> fehler.transkriptionDienst", transkriptionsMeldung("zugang-unvollstaendig: ...") === "fehler.transkriptionDienst");
  pruefe("Meldung: Serverfehler bei Caesar -> fehler.transkriptionDienst", transkriptionsMeldung("http-500: Internal Server Error") === "fehler.transkriptionDienst");
  pruefe("Meldung: Zeitueberschreitung -> fehler.transkriptionDauer", transkriptionsMeldung("zeitueberschreitung") === "fehler.transkriptionDauer");
  pruefe("Meldung: leeres Erkennungsergebnis bleibt fehler.transkription", transkriptionsMeldung("antwort-unerwartete-form") === "fehler.transkription");

  // Die Oberflaeche zeigt den Schluessel der Server Action an - fehlt er in
  // einer der vier Sprachen, wirft next-intl zur Laufzeit.
  const sprachen = ["de", "en", "kk", "ru"];
  const schluessel = ["transkription", "transkriptionDienst", "transkriptionDauer"];
  for (const sprache of sprachen) {
    const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8"));
    const fehlend = schluessel.filter((k) => typeof texte.aktionen?.fehler?.[k] !== "string");
    pruefe(`Meldung: ${sprache}.json kennt alle drei Diktat-Meldungen`, fehlend.length === 0, fehlend.join(", "));
  }
}

// --- 8. Antwortsprache: die Systemsprache entscheidet ----------------------
// Frueher wurde sie aus dem Fragetext erkannt. Das ging schief, sobald die
// Frage diktiert war: der Sprachhinweis der Oberflaeche zwang die
// Spracherkennung in die falsche Sprache, die Erkennung sah diesen Text und
// die Antwort kam ebenfalls falsch. Jetzt gilt schlicht die Einstellung.
{
  // Der Sprachhinweis geht NUR noch fuer Kasachisch mit: dort bringt er den
  // vollstaendigen Satz und schickt die Aufnahme an das kasachische Modell.
  // Fuer de/en/ru war "ohne Hinweis" gemessen genauso gut wie der richtige
  // Hinweis - und ein falscher Hinweis richtet Schaden an.
  pruefe("Sprachhinweis: nur Kasachisch wird mitgeschickt", JSON.stringify([...transkriptionSprachen]) === JSON.stringify(["kk"]));
  for (const sprache of ["de", "en", "ru"]) {
    pruefe(`Sprachhinweis: ${sprache} geht ohne Hinweis an den Dienst`, !transkriptionSprachen.includes(sprache));
  }
}


// --- 7. Diktat: Stilleerkennung (domain/diktat.ts) --------------------------
// Die Aufnahme endet von selbst, wenn jemand aufhoert zu sprechen. Die beiden
// Risiken stehen gegeneinander: zu frueh abschalten schneidet mitten im Satz
// ab, zu spaet schickt Umgebungsgeraeusch zur Erkennung. Die Faelle unten
// spielen beides durch - mit erfundenen Pegelverlaeufen, ohne Browser.
{
  // Einen Pegelverlauf abspielen: je Eintrag [Pegel, Dauer in ms], in
  // Schritten von 50 ms (etwa drei Bildschirmbilder).
  function spiele(abschnitte, einstellungen = DIKTAT_STANDARD) {
    const waechter = erzeugeStilleWaechter(einstellungen);
    let jetzt = 0;
    for (const [pegel, dauer] of abschnitte) {
      for (let verbraucht = 0; verbraucht < dauer; verbraucht += 50) {
        const ergebnis = waechter.melde(pegel, jetzt);
        if (ergebnis !== "weiter") return { ergebnis, beiMs: jetzt, waechter };
        jetzt += 50;
      }
    }
    return { ergebnis: "weiter", beiMs: jetzt, waechter };
  }

  const STILL = 0.004;
  const SPRACHE = 0.18;

  {
    const { ergebnis, beiMs } = spiele([[STILL, 200], [SPRACHE, 2000], [STILL, 3000]]);
    pruefe("Diktat: nach dem Sprechen endet die Aufnahme von selbst", ergebnis === "stopp-stille", `${ergebnis} bei ${beiMs} ms`);
    // Das letzte laute Bild liegt bei 2150 ms (Raster von 50 ms); von da an
    // muss die eingestellte Stille vergehen - auf ein Bild genau.
    const letzterLaut = 2150;
    pruefe(
      "Diktat: sie endet erst nach der eingestellten Stille, nicht frueher",
      beiMs >= letzterLaut + DIKTAT_STANDARD.stilleMs && beiMs <= letzterLaut + DIKTAT_STANDARD.stilleMs + 50,
      `${beiMs} ms, letzter Laut bei ${letzterLaut} ms`,
    );
  }

  {
    // Der wichtigste Fall: Denkpause mitten im Satz. Wer "Die Kuehlkette ist
    // ... einwandfrei" sagt, darf nicht nach dem "ist" abgeschnitten werden.
    const pause = DIKTAT_STANDARD.stilleMs - 400;
    const { ergebnis } = spiele([[SPRACHE, 1500], [STILL, pause], [SPRACHE, 1500], [STILL, 400]]);
    pruefe(`Diktat: eine Pause von ${pause} ms mitten im Satz beendet die Aufnahme NICHT`, ergebnis === "weiter", ergebnis);
  }

  {
    const { ergebnis, beiMs, waechter } = spiele([[STILL, 10_000]]);
    pruefe("Diktat: wird gar nicht gesprochen, endet die Aufnahme als leer", ergebnis === "stopp-leer", `${ergebnis} bei ${beiMs} ms`);
    pruefe("Diktat: und sie gilt als 'nichts gesprochen'", !waechter.hatGesprochen());
    pruefe("Diktat: das dauert hoechstens die Anlaufzeit", beiMs <= DIKTAT_STANDARD.anlaufMs + 100, `${beiMs} ms`);
  }

  {
    // Hofumgebung: ein Kuehlaggregat laeuft durchgehend mit, lauter als die
    // Grundschwelle. Ohne Anpassung an das Grundrauschen wuerde das als
    // Sprache gelten und die Aufnahme liefe bis zur Hoechstdauer.
    const LAERM = 0.05;
    pruefe(
      "Diktat: Dauerlaerm liegt ueber der Grundschwelle (sonst pruefte der Fall nichts)",
      LAERM > DIKTAT_STANDARD.stillePegel,
    );
    const { ergebnis, waechter } = spiele([[LAERM, 500], [SPRACHE, 1500], [LAERM, 2500]]);
    pruefe("Diktat: bei Dauerlaerm wird die Schwelle angehoben und die Aufnahme endet trotzdem", ergebnis === "stopp-stille", ergebnis);
    pruefe(
      "Diktat: die Schwelle richtet sich nach dem Grundrauschen, nicht nach dem Standardwert",
      waechter.schwelle() > DIKTAT_STANDARD.stillePegel && waechter.schwelle() <= LAERM * DIKTAT_STANDARD.rauschFaktor + 1e-9,
      `Schwelle ${waechter.schwelle().toFixed(3)}`,
    );
    const nurLaerm = spiele([[LAERM, 6000]]);
    pruefe("Diktat: Dauerlaerm allein zaehlt nicht als Sprache", nurLaerm.ergebnis === "stopp-leer", nurLaerm.ergebnis);
  }

  {
    // Wer sofort nach dem Klick losspricht, liefert als ersten Messwert einen
    // lauten. Ohne rauschDeckel wuerde die eigene Stimme zum Grundrauschen
    // erklaert - die Aufnahme endete als "leer", obwohl gesprochen wurde.
    const { ergebnis, waechter } = spiele([[SPRACHE, 2500], [STILL, 2000]]);
    pruefe("Diktat: sofortiges Lossprechen wird als Sprache erkannt, nicht als Grundrauschen", waechter.hatGesprochen(), `Schwelle ${waechter.schwelle().toFixed(3)}`);
    pruefe("Diktat: und die Aufnahme endet danach ordentlich", ergebnis === "stopp-stille", ergebnis);
  }

  {
    const kurz = { ...DIKTAT_STANDARD, hoechstdauerMs: 3000 };
    const { ergebnis, beiMs } = spiele([[SPRACHE, 10_000]], kurz);
    pruefe("Diktat: ununterbrochenes Reden endet an der Hoechstdauer", ergebnis === "stopp-hoechstdauer", `${ergebnis} bei ${beiMs} ms`);
  }

  {
    // Ein kurzes Huesteln direkt nach dem Start darf die Aufnahme nicht
    // sofort wieder beenden.
    const { ergebnis } = spiele([[SPRACHE, 100], [STILL, 500]], { ...DIKTAT_STANDARD, stilleMs: 300 });
    pruefe("Diktat: die Mindestdauer schuetzt vor einem Abschalten im ersten Atemzug", ergebnis === "weiter", ergebnis);
  }

  // Pegelberechnung: 8-Bit-Zeitbereich mit Ruhelage 128.
  pruefe("Pegel: absolute Stille ergibt 0", pegelAusZeitbereich(new Uint8Array(64).fill(128)) === 0);
  pruefe("Pegel: Vollausschlag ergibt 1", Math.abs(pegelAusZeitbereich(new Uint8Array(64).fill(0)) - 1) < 1e-9);
  {
    const wechsel = Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 128 + 64 : 128 - 64));
    pruefe("Pegel: halber Ausschlag ergibt 0,5", Math.abs(pegelAusZeitbereich(wechsel) - 0.5) < 1e-9);
  }
  pruefe("Pegel: leeres Fenster ergibt 0 statt NaN", pegelAusZeitbereich(new Uint8Array(0)) === 0);

  // Nachstellen ohne Codeaenderung - und ein Tippfehler in der Umgebung darf
  // das Diktat nicht unbrauchbar machen.
  {
    const gesetzt = diktatEinstellungen({ NEXT_PUBLIC_DIKTAT_STILLE_PEGEL: "0.05", NEXT_PUBLIC_DIKTAT_STILLE_MS: "900" });
    pruefe("Diktat: Schwelle und Wartezeit lassen sich ueber die Umgebung nachstellen", gesetzt.stillePegel === 0.05 && gesetzt.stilleMs === 900);
    for (const [name, umgebung] of [
      ["leer", {}],
      ["keine Zahl", { NEXT_PUBLIC_DIKTAT_STILLE_PEGEL: "laut", NEXT_PUBLIC_DIKTAT_STILLE_MS: "lang" }],
      ["ausserhalb des Bereichs", { NEXT_PUBLIC_DIKTAT_STILLE_PEGEL: "9", NEXT_PUBLIC_DIKTAT_STILLE_MS: "0" }],
      ["negativ", { NEXT_PUBLIC_DIKTAT_STILLE_PEGEL: "-1", NEXT_PUBLIC_DIKTAT_STILLE_MS: "-500" }],
    ]) {
      const e = diktatEinstellungen(umgebung);
      pruefe(
        `Diktat: unsinnige Einstellung (${name}) faellt auf den Standard zurueck`,
        e.stillePegel === DIKTAT_STANDARD.stillePegel && e.stilleMs === DIKTAT_STANDARD.stilleMs,
      );
    }
  }
}

// --- 9. Spracherkennung ueber Soniox (ai/soniox-client.ts) ------------------
// Der Dienst laeuft hinter einem Schalter und faellt bei jeder Stoerung auf
// Whisper zurueck. Geprueft wird mit einem Aufzeichner statt eines echten
// Netzaufrufs: welche Adressen gerufen werden, was im Koerper steht, und
// dass hochgeladene Aufnahmen hinterher wieder geloescht werden.
{
  const urspruenglich = {
    anbieter: process.env.KI_SPRACHERKENNUNG_ANBIETER,
    schluessel: process.env.SONIOX_API_KEY,
    url: process.env.SONIOX_API_URL,
    zeit: process.env.SONIOX_ZEITLIMIT_MS,
  };

  // --- Schalter ---
  delete process.env.KI_SPRACHERKENNUNG_ANBIETER;
  pruefe("Soniox-Schalter: ohne Einstellung bleibt es bei Whisper", spracherkennungAnbieter() === "whisper");
  process.env.KI_SPRACHERKENNUNG_ANBIETER = "soniox";
  pruefe("Soniox-Schalter: 'soniox' schaltet um", spracherkennungAnbieter() === "soniox");
  process.env.KI_SPRACHERKENNUNG_ANBIETER = "SONIOX";
  pruefe("Soniox-Schalter: Grossschreibung zaehlt nicht", spracherkennungAnbieter() === "soniox");
  process.env.KI_SPRACHERKENNUNG_ANBIETER = "irgendwas";
  pruefe("Soniox-Schalter: ein unbekannter Wert bleibt bei Whisper", spracherkennungAnbieter() === "whisper");

  // --- Region ---
  delete process.env.SONIOX_API_URL;
  pruefe("Soniox-Region: ohne Einstellung steht keine Adresse im Code", sonioxBasisUrl() === null);
  process.env.SONIOX_API_URL = "https://api.eu.soniox.com/";
  pruefe("Soniox-Region: EU laesst sich ohne Codeaenderung setzen (ohne Schraegstrich am Ende)", sonioxBasisUrl() === "https://api.eu.soniox.com");
  delete process.env.SONIOX_API_URL;

  // --- Zeitlimit ---
  delete process.env.SONIOX_ZEITLIMIT_MS;
  pruefe("Soniox-Zeitlimit: Voreinstellung liegt deutlich unter Vercels 60 s", sonioxZeitlimitMs() <= 55_000, `${sonioxZeitlimitMs()} ms`);
  process.env.SONIOX_ZEITLIMIT_MS = "999999";
  pruefe("Soniox-Zeitlimit: ein unsinniger Wert faellt auf die Voreinstellung zurueck", sonioxZeitlimitMs() <= 55_000);
  delete process.env.SONIOX_ZEITLIMIT_MS;

  // --- Fehlender Schluessel ---
  delete process.env.SONIOX_API_KEY;
  {
    const e = await transkribiereMitSoniox(new Blob([new Uint8Array([1, 2, 3])]), "a.webm");
    pruefe("Soniox: ohne Schluessel wird gar nicht erst gerufen", !e.ok && e.grund === "kein-schluessel");
  }

  // --- Aufzeichner ---
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  let plan = [];
  globalThis.fetch = async (url, init = {}) => {
    // Wie ein echtes fetch: ein ausgeloestes Abbruchsignal wirft.
    if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
    aufrufe.push({ url: String(url), methode: init.method ?? "GET", koerper: init.body });
    const naechste = plan.shift();
    if (typeof naechste === "function") return naechste();
    return naechste ?? new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
  };
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
  const glatterLauf = () => [
    json({ id: "datei-1" }),                       // upload
    json({ id: "auftrag-1" }),                     // auftrag
    json({ status: "completed" }),                 // status
    json({ text: "Салқын тізбек толық құжатталған." }), // transcript
    json({}),                                      // delete auftrag
    json({}),                                      // delete datei
  ];

  try {
    process.env.SONIOX_API_KEY = "testschluessel";
    delete process.env.SONIOX_API_URL;
    {
      const e = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm");
      pruefe("Soniox: ohne SONIOX_API_URL laeuft nichts an (keine Region im Code)", !e.ok && e.grund === "keine-basis-url");
    }
    process.env.SONIOX_API_URL = "https://api.soniox.com";

    // --- Glatter Durchlauf ---
    aufrufe.length = 0;
    plan = glatterLauf();
    const gut = await transkribiereMitSoniox(new Blob([new Uint8Array([1, 2, 3])]), "aufnahme.webm");
    pruefe("Soniox: erkannter Text kommt zurueck", gut.ok && gut.text === "Салқын тізбек толық құжатталған.");
    pruefe("Soniox: Modell stt-async-v5 im Auftrag", String(aufrufe[1]?.koerper).includes("stt-async-v5"));
    pruefe(
      "Soniox: KEIN Sprachhinweis - mit und ohne war das Ergebnis am 21.09.2026 identisch",
      !String(aufrufe[1]?.koerper).includes("language_hints"),
      String(aufrufe[1]?.koerper),
    );
    // Der entscheidende Punkt: Aufnahmen duerfen nicht 30 Tage beim Dienst liegen.
    const geloescht = aufrufe.filter((a) => a.methode === "DELETE").map((a) => a.url);
    pruefe(
      "Soniox: Auftrag UND Datei werden hinterher geloescht",
      geloescht.some((u) => u.endsWith("/v1/transcriptions/auftrag-1")) && geloescht.some((u) => u.endsWith("/v1/files/datei-1")),
      geloescht.join(" "),
    );
    pruefe("Soniox: der Schluessel steht nur im Kopf, nie im Koerper", !aufrufe.some((a) => String(a.koerper).includes("testschluessel")));

    // --- Stoerung mitten im Ablauf: trotzdem aufraeumen ---
    aufrufe.length = 0;
    plan = [json({ id: "datei-2" }), json({ id: "auftrag-2" }), json({ status: "error", error_message: "kaputt" }), json({}), json({})];
    const gestoert = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm");
    pruefe("Soniox: ein fehlgeschlagener Auftrag endet in ok:false statt in einem Wurf", !gestoert.ok && gestoert.grund.startsWith("auftrag-fehler"));
    pruefe(
      "Soniox: auch nach einer Stoerung wird die Aufnahme geloescht",
      aufrufe.filter((a) => a.methode === "DELETE").some((a) => a.url.endsWith("/v1/files/datei-2")),
    );

    // --- Abgewiesener Zugang ---
    plan = [json({ detail: "nope" }, 401), json({}), json({})];
    const abgewiesen = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm");
    pruefe("Soniox: 401 wird als zugang-abgewiesen gemeldet", !abgewiesen.ok && abgewiesen.grund.startsWith("zugang-abgewiesen"));

    // --- Dienst nicht erreichbar ---
    plan = [() => { throw new TypeError("fetch failed"); }, json({}), json({})];
    const weg = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm");
    pruefe("Soniox: unerreichbarer Dienst ist als solcher erkennbar", !weg.ok && weg.grund.startsWith("dienst-nicht-erreichbar"));

    // --- Zeitueberschreitung ---
    process.env.SONIOX_ZEITLIMIT_MS = "2000";
    plan = [
      json({ id: "datei-3" }),
      json({ id: "auftrag-3" }),
      // Der Auftrag wird nie fertig: die Schleife laeuft, bis das Zeitlimit greift.
      ...Array.from({ length: 40 }, () => () => json({ status: "processing" })),
    ];
    const zuLang = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm");
    pruefe("Soniox: ein haengender Auftrag endet im Zeitlimit, nicht in Vercels Abbruch", !zuLang.ok, zuLang.ok ? "" : zuLang.grund);
    delete process.env.SONIOX_ZEITLIMIT_MS;
  } finally {
    globalThis.fetch = echtesFetch;
    for (const [name, wert] of [
      ["KI_SPRACHERKENNUNG_ANBIETER", urspruenglich.anbieter],
      ["SONIOX_API_KEY", urspruenglich.schluessel],
      ["SONIOX_API_URL", urspruenglich.url],
      ["SONIOX_ZEITLIMIT_MS", urspruenglich.zeit],
    ]) {
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  }
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
