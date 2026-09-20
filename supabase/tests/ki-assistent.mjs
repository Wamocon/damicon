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
  erkenneSprache,
  MAX_SPRACHAUSGABE_ZEICHEN,
  sprachausgabePfad,
  STIMMEN,
  textFuerSprachausgabe,
} from "../../src/lib/domain/sprachausgabe.ts";
import { erzeugeSprachausgabe, sprachausgabeUrl, sprachausgabeZugangsHeader } from "../../src/lib/ai/sprachausgabe-client.ts";
import {
  transkriptionBasisUrl,
  transkribiereAudio,
  transkriptionsMeldung,
  transkriptionZeitlimitMs,
  transkriptionZugangsHeader,
} from "../../src/lib/ai/transkription-client.ts";
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

// --- 5. Sprachausgabe (domain/sprachausgabe.ts, ai/sprachausgabe-client.ts) --
{
  const beispiele = [
    ["de", "**Fazit:** Interne Audits finden alle **47 Tage** statt. Empfehlung: den nächsten Termin eintragen."],
    ["ru", "**Вывод:** внутренние аудиты проводятся каждые **47 дней**."],
    ["kk", "**Қорытынды:** ішкі аудиттер әр **47 күн** сайын өткізіледі."],
    ["tr", "**Sonuç:** İç denetimler her **47 günde** bir yapılır."],
    ["en", "**Summary:** Internal audits take place every **47 days** according to the policy."],
  ];
  for (const [erwartet, text] of beispiele) {
    const erkannt = erkenneSprache(textFuerSprachausgabe(text), "de");
    pruefe(`Sprachausgabe: Antwort auf ${erwartet} wird als ${erwartet} erkannt`, erkannt === erwartet, `erkannt: ${erkannt}`);
  }
  // Kasachisch und Russisch teilen das kyrillische Alphabet - entscheidend sind
  // die kasachischen Sonderbuchstaben, nicht die Oberflaechensprache.
  pruefe("Sprachausgabe: russischer Text bleibt ru, auch bei kasachischer Oberflaeche", erkenneSprache("Проверка сорта Полка завершена.", "kk") === "ru");
  pruefe("Sprachausgabe: ohne Hinweis im Text zaehlt die Oberflaechensprache", erkenneSprache("47 / 12", "ru") === "ru");
  pruefe("Sprachausgabe: unbekannte Oberflaechensprache faellt auf de zurueck", erkenneSprache("47 / 12", "fr") === "de");

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

  // Mit den Piper-Stimmen auf Caesar blieben Russisch und Tuerkisch stumm -
  // fuer beide gab es nur Modelle mit unklarer oder nicht kommerzieller
  // Lizenz. Ueber den Dienst sprechen jetzt alle fuenf.
  pruefe(
    "Sprachausgabe: alle fuenf Sprachen haben eine Stimme, auch Russisch und Tuerkisch",
    Object.values(STIMMEN).every((s) => s !== null),
  );
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
    // Tuerkisch bietet der Dienst fuer die Erkennung NICHT an (am 20.09.2026
    // geprueft: die Antwort kam verhoert zurueck), deshalb faellt es weg und
    // der Dienst erkennt die Sprache selbst.
    const sprachFelder = async (vorgabe) => {
      aufrufe.length = 0;
      naechsteAntwort = () => new Response(JSON.stringify({ text: "x" }), { status: 200, headers: { "content-type": "application/json" } });
      await transkribiereAudio(audio, "aufnahme.webm", vorgabe);
      return aufrufe[0]?.init.body?.get?.("language") ?? null;
    };
    pruefe("Spracheingabe-Client: Kasachisch wird als Sprache mitgeschickt", (await sprachFelder("kk")) === "kk");
    pruefe("Spracheingabe-Client: Tuerkisch wird nicht mitgeschickt (keine Erkennung dafuer)", (await sprachFelder("tr")) === null);
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
  // einer der fuenf Sprachen, wirft next-intl zur Laufzeit.
  const sprachen = ["de", "en", "kk", "ru", "tr"];
  const schluessel = ["transkription", "transkriptionDienst", "transkriptionDauer"];
  for (const sprache of sprachen) {
    const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8"));
    const fehlend = schluessel.filter((k) => typeof texte.aktionen?.fehler?.[k] !== "string");
    pruefe(`Meldung: ${sprache}.json kennt alle drei Diktat-Meldungen`, fehlend.length === 0, fehlend.join(", "));
  }
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);
console.log("Alle Pruefungen bestanden.");
