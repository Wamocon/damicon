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
  ABSCHNITT_ZEICHEN,
  ERSTER_ABSCHNITT_ZEICHEN,
  ZWEITER_ABSCHNITT_ZEICHEN,
  erzeugeSatzZerleger,
  sprechfassung,
  stimmenFuer,
  SONIOX_STIMME_STANDARD,
  SONIOX_STIMME_STANDARD_JE_SPRACHE,
  SONIOX_TEMPO_STANDARD,
  VORLESETEXT_VERSION,
  saetzeAusAntwort,
  sprachausgabeStromAn,
  sprechTempo,
  stilleKuerzen,
} from "../../src/lib/domain/sprachausgabe.ts";
import {
  erzeugeSprachausgabe,
  erzeugeSprachausgabeMitRueckfall,
  SONIOX_TTS_MODELL,
  sonioxTtsBasis,
  sprachausgabeUrl,
  sprachausgabeZugangsHeader,
} from "../../src/lib/ai/sprachausgabe-client.ts";
import {
  diktatKontext,
  erzeugeTokenSammler,
  haengeDiktatAn,
  LIVE_MODELL,
  liveKonfiguration,
  sonioxLiveAdresse,
  sprachHinweise,
} from "../../src/lib/domain/diktat-live.ts";
import {
  transkriptionBasisUrl,
  transkribiereAudio,
  transkriptionsMeldung,
  transkriptionSprachen,
  istWhisperErfindung,
  transkriptionZeitlimitMs,
  transkriptionZugangsHeader,
} from "../../src/lib/ai/transkription-client.ts";
import {
  aufnahmeDateiname,
  DIKTAT_STANDARD,
  diktatEinstellungen,
  erzeugeStilleWaechter,
  pegelAusZeitbereich,
} from "../../src/lib/domain/diktat.ts";
import { erkenneMitRueckfall, GESAMTDECKEL_MS, GRUND_LEER, HEDGE_AB_MS } from "../../src/lib/domain/spracherkennung.ts";
import { bestimmeAntwortsprache, mehrheitsSprache, sprachePasst, stimmenSprache } from "../../src/lib/domain/antwortsprache.ts";
import {
  EMPFEHLUNG,
  ERINNERUNG,
  formatAnweisung,
  KEINE_STELLE,
  mitSprachErinnerung,
  quellenAnweisung,
  SPRACHMODUS_FUEHRUNG,
  SPRACHMODUS_OBERFLAECHE,
  sprachmodusFormatAnweisung,
} from "../../src/lib/domain/antwort-anweisungen.ts";
import { erkenneSprache, erkenneSpracheEindeutig } from "../../src/lib/wissen/chunker.ts";
import {
  antwortFertig,
  assistentIstDran,
  besterPlatz,
  erzeugeUnterbrechungsWaechter,
  istAbsageBefehl,
  istStoppBefehl,
  istZusageBefehl,
  LANGE_SITZUNG_MS,
  MAX_NEUVERSUCHE,
  nachSitzungsAbbruch,
  naechstePhase,
  nimmtAuf,
  PLAETZE,
  UNTERBRECHEN_STANDARD,
} from "../../src/lib/domain/sprachmodus.ts";
import { waehleSchritt } from "../../src/lib/ai/schritt-steuerung.ts";
import { nachSchalterKlick, schalterZeigtAn, vorlesenErlaubt, wunschFuerZug } from "../../src/lib/domain/vorlesen-zustand.ts";
import {
  STROM_HOECHSTENS_ZEICHEN,
  STROM_SCHLUESSEL_GUELTIG_S,
  STROM_SCHLUESSEL_JE_MINUTE,
  naechsterVorlauf,
  ungesprocheneTexte,
  zeichenGrenze,
  abbruchNachricht,
  base64ZuBytes,
  brauchtNeuenStrom,
  endeNachricht,
  folgeAufFehler,
  leseStromNachricht,
  naechsterStart,
  pcmZuFloat,
  schluesselNochGut,
  sonioxTtsWsAdresse,
  startNachricht,
  textNachricht,
} from "../../src/lib/domain/sprachausgabe-strom.ts";
import { erzeugeWarteschlange, HOECHSTENS_GLEICHZEITIG } from "../../src/lib/domain/sprachausgabe-warteschlange.ts";
import { ANFANG, DARSTELLUNG_SCHLUESSEL, istDarstellung, naechsterZustand, NUTZER_SCHLUESSEL, OFFEN_SCHLUESSEL } from "../../src/lib/domain/ki-ansicht.ts";
import { agentSeitenansichtAn, diktatLiveAn, schalterAn, sprachausgabeLiveAn } from "../../src/lib/domain/schalter.ts";
import { ABSCHNITT_GUELTIG_MS, pruefeAbschnitt, signiereAbschnitt, sprachausgabeGeheimnis } from "../../src/lib/domain/sprachausgabe-signatur.ts";
import {
  holeSonioxSchluessel,
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
  // Seit VORLESETEXT_VERSION 3: die Kopfzeile faellt weg, jede Zeile wird "Erste Zelle: der Rest".
  pruefe(
    "Sprachausgabe: Tabellenzeilen werden als 'Zelle: Zelle' gelesen, ohne Kopfzeile und ohne Kommas am Rand",
    vorlesbar.includes("Polana: 1150") && !vorlesbar.includes("Sorte") && !/^\s*,|,\s*$/m.test(vorlesbar) && !vorlesbar.includes("kg Polana"),
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
  // werden. Seit 24.09.2026 stecken auch Anbieter, Sprache und der Stand der
  // Textaufbereitung darin - bessere Aufbereitung, neues Audio.
  pruefe(
    "Zwischenspeicher: der Pfad traegt Anbieter, Stimme, Sprache und Textstand, nicht den alten Piper-Namen",
    pfadDe.endsWith(`/sokrates-de-female-de-v${VORLESETEXT_VERSION}.mp3`) && !pfadDe.includes("piper"),
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
  const schluessel = ["transkription", "transkriptionDienst", "transkriptionDauer", "transkriptionLeer"];
  for (const sprache of sprachen) {
    const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8"));
    const fehlend = schluessel.filter((k) => typeof texte.aktionen?.fehler?.[k] !== "string");
    pruefe(`Meldung: ${sprache}.json kennt alle vier Diktat-Meldungen`, fehlend.length === 0, fehlend.join(", "));
  }
  // Nichts gehoert ist kein Ausfall - die Meldung sagt das auch so.
  pruefe("Meldung: nichts gehoert -> fehler.transkriptionLeer", transkriptionsMeldung("leer") === "fehler.transkriptionLeer");
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
  pruefe("Soniox-Zeitlimit: Voreinstellung laesst Platz fuer den Rueckfall auf Whisper", sonioxZeitlimitMs() <= 20_000, `${sonioxZeitlimitMs()} ms`);
  process.env.SONIOX_ZEITLIMIT_MS = "999999";
  pruefe("Soniox-Zeitlimit: ein unsinniger Wert faellt auf die Voreinstellung zurueck", sonioxZeitlimitMs() <= 20_000);
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
      "Soniox: ohne Sprachangabe geht kein Hinweis mit - Soniox erkennt dann selbst",
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

// --- 10. Spracherkennung: Befunde der Ende-zu-Ende-Pruefung (22.09.2026) ----
// Drei Dinge, die vorher falsch waren und hier festgehalten werden, damit sie
// nicht zurueckkommen.
{
  // (a) Der Dateiname muss zum aufgenommenen Format passen. Safari auf iOS
  // nimmt audio/mp4 auf; bis heute hiess die Datei trotzdem immer
  // "aufnahme.webm", der Dienst bekam also MP4 unter WebM-Namen.
  for (const [typ, erwartet] of [
    ["audio/webm", "aufnahme.webm"],
    ["audio/webm;codecs=opus", "aufnahme.webm"],
    ["audio/mp4", "aufnahme.mp4"],
    ["audio/mp4;codecs=mp4a.40.2", "aufnahme.mp4"],
    ["audio/x-m4a", "aufnahme.mp4"],
    ["audio/ogg;codecs=opus", "aufnahme.ogg"],
    ["audio/wav", "aufnahme.wav"],
    ["", "aufnahme.webm"],
  ]) {
    pruefe(`Diktat-Dateiname: "${typ || "(leer)"}" -> ${erwartet}`, aufnahmeDateiname(typ) === erwartet, aufnahmeDateiname(typ));
  }

  // (c) Zeitbudget, zweite Fassung. Frueher liefen die Dienste nacheinander
  // (Soniox 8 s, dann Whisper 12 s): an echten 10-Sekunden-Aufnahmen lief das
  // zweimal in die Grenze - 20,3 s und KEIN Text. Jetzt ueberlappen sie sich.
  {
    const urspruenglich = { s: process.env.SONIOX_ZEITLIMIT_MS, w: process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS };
    delete process.env.SONIOX_ZEITLIMIT_MS;
    delete process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS;
    pruefe("Zeitbudget: Soniox darf bis 20 s brauchen", sonioxZeitlimitMs() === 20_000, `${sonioxZeitlimitMs()} ms`);
    pruefe("Zeitbudget: Whisper darf bis 20 s brauchen", transkriptionZeitlimitMs() === 20_000, `${transkriptionZeitlimitMs()} ms`);
    pruefe("Zeitbudget: Whisper laeuft ab 6 s parallel mit, statt hinterher", HEDGE_AB_MS === 6_000, `${HEDGE_AB_MS} ms`);
    // Der schlimmste Fall ist jetzt nicht mehr die Summe: Whisper startet bei
    // 6 s und hat 20 s, also 26 s - nicht 40.
    pruefe("Zeitbudget: schlimmster Fall 6 + 20 = 26 s, unter dem Deckel", HEDGE_AB_MS + transkriptionZeitlimitMs() < GESAMTDECKEL_MS, `${(HEDGE_AB_MS + transkriptionZeitlimitMs()) / 1000} s`);
    pruefe("Zeitbudget: Deckel 40 s laesst 20 s Luft bis Vercels 60 s", GESAMTDECKEL_MS === 40_000 && GESAMTDECKEL_MS <= 60_000 - 20_000, `${GESAMTDECKEL_MS} ms`);
    process.env.SONIOX_ZEITLIMIT_MS = "50000";
    pruefe("Zeitbudget: ein zu grosser Umgebungswert wird verworfen", sonioxZeitlimitMs() <= 20_000, `${sonioxZeitlimitMs()} ms`);
    if (urspruenglich.s === undefined) delete process.env.SONIOX_ZEITLIMIT_MS; else process.env.SONIOX_ZEITLIMIT_MS = urspruenglich.s;
    if (urspruenglich.w === undefined) delete process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS; else process.env.KI_TRANSKRIPTION_ZEITLIMIT_MS = urspruenglich.w;
  }

  // (c2) Der Wettlauf selbst, mit erfundenen Diensten - so laesst sich
  // pruefen, WER wann gerufen wird und wer gewinnt, ohne Netz.
  {
    const still = () => {};
    const audio = () => new Blob([new Uint8Array([1, 2, 3])]);
    const sofort = (text) => async () => ({ ok: true, text });
    const scheitert = (grund) => async () => ({ ok: false, grund });
    /** Ein Dienst, der erst nach ms antwortet - und auf Abbruch sofort aufgibt. */
    const langsam = (ms, text) => (abbruch) =>
      new Promise((fertig) => {
        const t = setTimeout(() => fertig({ ok: true, text }), ms);
        abbruch.addEventListener("abort", () => { clearTimeout(t); fertig({ ok: false, grund: "abgebrochen" }); }, { once: true });
      });

    // 1. Soniox ist schnell: Whisper wird gar nicht erst gestartet.
    {
      let whisperGestartet = 0;
      const e = await erkenneMitRueckfall(sofort("von soniox"), async () => { whisperGestartet++; return { ok: true, text: "von whisper" }; }, still);
      pruefe("Wettlauf: ist Soniox schnell, gewinnt Soniox", e.ok && e.text === "von soniox" && e.dienst === "soniox", JSON.stringify(e));
      pruefe("Wettlauf: dann wird Whisper gar nicht erst gestartet", whisperGestartet === 0, `${whisperGestartet} Starts`);
    }

    // 2. Soniox sagt sofort ab (401, kein Schluessel): Whisper startet OHNE
    //    die Hedge-Zeit abzuwarten - auf einen Dienst zu warten, der schon
    //    abgesagt hat, waere reine Wartezeit fuer die Person.
    {
      const begonnen = Date.now();
      const e = await erkenneMitRueckfall(scheitert("zugang-abgewiesen (http-401)"), sofort("von whisper"), still);
      const gedauert = Date.now() - begonnen;
      pruefe("Wettlauf: nach einer Absage von Soniox uebernimmt Whisper", e.ok && e.dienst === "whisper", JSON.stringify(e));
      pruefe("Wettlauf: und zwar sofort, nicht erst nach der Hedge-Zeit", gedauert < HEDGE_AB_MS, `${gedauert} ms`);
    }

    // 3. Soniox haengt: nach der Hedge-Zeit laeuft Whisper mit und gewinnt.
    //    Genau der Fall vom 22.09.2026, der vorher 20,3 s ohne Text kostete.
    {
      const begonnen = Date.now();
      const e = await erkenneMitRueckfall(langsam(30_000, "von soniox"), langsam(300, "von whisper"), still);
      const gedauert = Date.now() - begonnen;
      pruefe("Wettlauf: haengt Soniox, gewinnt der parallel gestartete Whisper", e.ok && e.dienst === "whisper", JSON.stringify(e));
      pruefe("Wettlauf: das dauert etwa die Hedge-Zeit, nicht die Summe beider Limits", gedauert < HEDGE_AB_MS + 3_000, `${gedauert} ms`);
    }

    // 4. Beide scheitern: ein Grund kommt zurueck, kein Wurf.
    {
      const e = await erkenneMitRueckfall(scheitert("zeitueberschreitung"), scheitert("dienst-nicht-erreichbar: fetch failed"), still);
      pruefe("Wettlauf: scheitern beide, endet es in ok:false statt in einem Wurf", !e.ok && typeof e.grund === "string" && e.grund.length > 0, JSON.stringify(e));
    }

    // 5. Ohne den Schalter (Soniox aus) laeuft nur Whisper.
    {
      const e = await erkenneMitRueckfall(null, sofort("von whisper"), still);
      pruefe("Wettlauf: ohne den Schalter laeuft nur Whisper", e.ok && e.dienst === "whisper", JSON.stringify(e));
    }

    // 6. Der Verlierer wird abgebrochen - sonst bliebe bei Soniox ein
    //    Auftrag offen und die Aufnahme laege 30 Tage beim Dienstleister.
    {
      let sonioxAbgebrochen = false;
      const haengenderSoniox = (abbruch) =>
        new Promise((fertig) => {
          const t = setTimeout(() => fertig({ ok: true, text: "zu spaet" }), 30_000);
          abbruch.addEventListener("abort", () => { clearTimeout(t); sonioxAbgebrochen = true; fertig({ ok: false, grund: "abgebrochen" }); }, { once: true });
        });
      const e = await erkenneMitRueckfall(haengenderSoniox, langsam(200, "von whisper"), still);
      pruefe("Wettlauf: gewinnt Whisper, wird Soniox abgebrochen", e.ok && sonioxAbgebrochen, `abgebrochen=${sonioxAbgebrochen}`);
    }

    void audio;
  }

  // (b) Sprachhinweis an Soniox. Er BESCHRAENKT dort nicht, er gewichtet nur
  // (soniox.com/docs/stt/concepts/language-hints) - anders als bei Whisper,
  // wo ein falscher Hinweis erfundene Woerter der falschen Sprache erzeugte.
  {
    const echtesFetch = globalThis.fetch;
    const aufrufe = [];
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    let plan = [];
    globalThis.fetch = async (url, init = {}) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      aufrufe.push({ url: String(url), methode: init.method ?? "GET", koerper: init.body });
      return plan.shift() ?? json({});
    };
    const umgebung = { k: process.env.SONIOX_API_KEY, u: process.env.SONIOX_API_URL };
    try {
      process.env.SONIOX_API_KEY = "testschluessel";
      process.env.SONIOX_API_URL = "https://api.soniox.com";
      const lauf = async (sprache) => {
        aufrufe.length = 0;
        plan = [json({ id: "d" }), json({ id: "a" }), json({ status: "completed" }), json({ text: "x" }), json({}), json({})];
        await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "aufnahme.webm", sprache);
        return JSON.parse(String(aufrufe[1]?.koerper ?? "{}"));
      };
      // kk und ru gehen seit 24.09.2026 gemeinsam mit: in Kasachstan wird
      // zwischen beiden gewechselt, oft im selben Satz.
      for (const [sprache, erwartet] of [["de", ["de"]], ["en", ["en"]], ["ru", ["ru", "kk"]], ["kk", ["kk", "ru"]]]) {
        const koerper = await lauf(sprache);
        pruefe(`Sprachhinweis: ${sprache} geht als language_hints ${JSON.stringify(erwartet)} mit`, JSON.stringify(koerper.language_hints) === JSON.stringify(erwartet), JSON.stringify(koerper.language_hints));
        // Datei-Weg und Live-Weg muessen dieselbe Regel haben.
        pruefe(`Sprachhinweis: ${sprache} - Datei-Weg und Live-Weg gleich`, JSON.stringify(koerper.language_hints) === JSON.stringify(sprachHinweise(sprache)));
      }
      pruefe("Sprachhinweis: eine unbekannte Sprache wird still verworfen", (await lauf("klingonisch")).language_hints === undefined);
      pruefe("Sprachhinweis: ohne Angabe erkennt Soniox selbst", (await lauf(undefined)).language_hints === undefined);
    } finally {
      globalThis.fetch = echtesFetch;
      if (umgebung.k === undefined) delete process.env.SONIOX_API_KEY; else process.env.SONIOX_API_KEY = umgebung.k;
      if (umgebung.u === undefined) delete process.env.SONIOX_API_URL; else process.env.SONIOX_API_URL = umgebung.u;
    }
  }

  // (d) Kein Auto-Senden mehr: der Knopf kennt keine Rueckgabe, die den Text
  // sofort abschickt, und das Chatfenster uebergibt keine.
  {
    const knopf = readFileSync(new URL("../../src/components/ki/mikrofon.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../../src/components/ki/ki-chat.tsx", import.meta.url), "utf8");
    // Auf den Aufruf pruefen, nicht auf das Wort: der Kommentar im Kopf der
    // Datei erklaert weiterhin, warum es die Rueckgabe nicht mehr gibt.
    pruefe("Kein Auto-Senden: der Knopf ruft nichts mehr auf", !knopf.includes("beiSenden?.("));
    pruefe("Kein Auto-Senden: der Knopf nimmt die Rueckgabe nicht mehr entgegen", !knopf.includes("beiSenden?:"));
    pruefe("Kein Auto-Senden: das Chatfenster uebergibt keine", !chat.includes("beiSenden={"));
    // Der Text geht ins Feld - inzwischen samt der gehoerten Sprache, die
    // ueber die Antwortsprache entscheidet (Block 16).
    pruefe("Kein Auto-Senden: der erkannte Text geht weiterhin ins Feld", knopf.includes("beiText(status.wert, status.sprachen)"));
    pruefe("Diktat: der Cursor steht danach am Ende des Textes", chat.includes("setSelectionRange(text.length, text.length)"));
  }

  // (f) Groessengrenze passt zu next.config.ts, sonst greift sie nie.
  {
    const aktion = readFileSync(new URL("../../src/lib/actions/ki-assistent.ts", import.meta.url), "utf8");
    const konfig = readFileSync(new URL("../../next.config.ts", import.meta.url), "utf8");
    pruefe("Groessengrenze: Aktion prueft 8 MB", aktion.includes("const MAX_AUDIO_BYTES = 8 * 1024 * 1024;"));
    pruefe("Groessengrenze: dieselbe Zahl wie bodySizeLimit in next.config.ts", konfig.includes('bodySizeLimit: "8mb"'));
  }
}

// --- 11. Eine Sprache je Antwort: Text und Stimme (domain/antwortsprache.ts) -
// Waleri am 22.09.2026: Oberflaeche ru, Frage deutsch -> Antwort deutsch,
// Stimme russisch. Oberflaeche en, Frage russisch -> Antwort russisch, Stimme
// englisch. Beide Stellen lasen die Oberflaechensprache; die Stimme hielt
// sich daran, das Modell nicht. Jetzt entscheidet EINE Stelle je Zug.
{
  const erkenner = (t) => erkenneSprache(t, 10);
  const FRAGEN = {
    de: "Wann ist die Lieferung aus Almaty angekommen?",
    en: "When did the delivery from Almaty arrive?",
    ru: "Когда прибыла поставка из Алматы?",
    kk: "Алматыдан жеткізілім қашан келді?",
  };
  const ANTWORTEN = {
    de: "Die Lieferung ist am Dienstag um 14 Uhr angekommen.",
    en: "The delivery arrived on Tuesday at 2 pm.",
    ru: "Поставка прибыла во вторник в 14 часов.",
    kk: "Жеткізілім сейсенбіде сағат 14-те келді.",
  };

  // (a) Alle 16 Kombinationen Oberflaeche x Fragesprache: die Antwort folgt
  //     der FRAGE, und die Stimme folgt der Antwort.
  let stimmig = 0;
  for (const oberflaeche of ["de", "en", "ru", "kk"]) {
    for (const frageSprache of ["de", "en", "ru", "kk"]) {
      const { sprache: L, herkunft } = bestimmeAntwortsprache(
        { frage: FRAGEN[frageSprache], oberflaeche },
        erkenner,
      );
      const stimme = stimmenSprache(L, ANTWORTEN[L], erkenner);
      const richtig = L === frageSprache && stimme.sprache === L && !stimme.abweichung;
      if (richtig) stimmig++;
      else console.log(`      ${oberflaeche}/${frageSprache}: L=${L} (${herkunft}), Stimme=${stimme.sprache}`);
    }
  }
  pruefe("Antwortsprache: alle 16 Kombinationen - Text und Stimme gleich", stimmig === 16, `${stimmig}/16`);

  // (b) Waleris zwei Faelle, beim Namen genannt.
  {
    const a = bestimmeAntwortsprache({ frage: FRAGEN.de, oberflaeche: "ru" }, erkenner);
    pruefe("Antwortsprache: Oberflaeche ru, Frage deutsch -> deutsch", a.sprache === "de", `${a.sprache} (${a.herkunft})`);
    pruefe("Stimme: dazu die deutsche Stimme, nicht die russische", stimmenSprache(a.sprache, ANTWORTEN.de, erkenner).sprache === "de");
    const b = bestimmeAntwortsprache({ frage: FRAGEN.ru, oberflaeche: "en" }, erkenner);
    pruefe("Antwortsprache: Oberflaeche en, Frage russisch -> russisch", b.sprache === "ru", `${b.sprache} (${b.herkunft})`);
    pruefe("Stimme: dazu die russische Stimme, nicht die englische", stimmenSprache(b.sprache, ANTWORTEN.ru, erkenner).sprache === "ru");
  }

  // (c) Diktiert schlaegt Text: Soniox hat zugehoert, der Erkenner sieht nur
  //     das Ergebnis - und erbt dessen Fehler. Genau daran scheiterte der
  //     kasachische Fall am 20.09.2026 ("Sahlkentiz wird tollen, kurzat.").
  {
    const verhoert = "Sahlkentiz wird tollen, kurzat.";
    const ohne = bestimmeAntwortsprache({ frage: verhoert, oberflaeche: "de" }, erkenner);
    const mit = bestimmeAntwortsprache(
      { frage: verhoert, oberflaeche: "de", diktatSprachen: ["kk", "kk", "kk", "ru", "kk"] },
      erkenner,
    );
    pruefe("Diktat: ohne Sprachinfo haette der Text entschieden", ohne.herkunft !== "diktat", ohne.herkunft);
    pruefe("Diktat: Soniox' Sprache schlaegt den verhoerten Text", mit.sprache === "kk" && mit.herkunft === "diktat", `${mit.sprache} (${mit.herkunft})`);
  }

  // (d) Mehrheit der Token, nicht das erste Wort.
  pruefe("Diktat: die Mehrheit entscheidet", mehrheitsSprache(["ru", "kk", "kk", "kk", "en"]) === "kk");
  pruefe("Diktat: unbekannte Sprachen zaehlen nicht mit", mehrheitsSprache(["fr", "fr", "de"]) === "de");
  pruefe("Diktat: ohne brauchbare Angabe kein Ergebnis", mehrheitsSprache(["fr", null, undefined, ""]) === null);
  pruefe("Diktat: Gleichstand -> die Sprache, in der begonnen wurde", mehrheitsSprache(["ru", "de"]) === "ru");
  pruefe("Diktat: Regionalcodes werden auf zwei Buchstaben gekuerzt", mehrheitsSprache(["de-DE", "de-AT"]) === "de");

  // (e) Zu kurz zum Raten: dann gilt die Einstellung. Lieber die Sprache, die
  //     die Person selbst gewaehlt hat, als ein Muenzwurf.
  {
    const kurz = bestimmeAntwortsprache({ frage: "?", oberflaeche: "kk" }, erkenner);
    pruefe("Antwortsprache: zu kurze Frage -> Oberflaeche", kurz.sprache === "kk" && kurz.herkunft === "oberflaeche", `${kurz.sprache} (${kurz.herkunft})`);
    const unbekannt = bestimmeAntwortsprache({ frage: "?", oberflaeche: "fr" }, erkenner);
    pruefe("Antwortsprache: unbekannte Oberflaeche -> Deutsch", unbekannt.sprache === "de");
  }

  // (e2) Dieselbe Grenze gilt auch fuers Diktat: ein paar Ausrutscher-Token vor
  //      der eigentlichen Aeusserung (Stille, Atmen) sollen nicht die ganze
  //      Antwort umlenken, wenn kaum Text erkannt wurde. Fehlerbild vom
  //      25.09.2026: der allererste Sprachmodus-Start antwortete auf
  //      Kasachisch, obwohl deutsch gesprochen wurde.
  {
    const kurzDiktat = bestimmeAntwortsprache({ frage: "Ja.", oberflaeche: "de", diktatSprachen: ["kk", "kk"] }, erkenner);
    pruefe(
      "Diktat: zu wenig erkannter Text -> Diktatsprache zaehlt nicht, es gilt die Oberflaeche",
      kurzDiktat.sprache === "de" && kurzDiktat.herkunft === "oberflaeche",
      `${kurzDiktat.sprache} (${kurzDiktat.herkunft})`,
    );
    const langDiktat = bestimmeAntwortsprache(
      { frage: "Wie viele Pflücker sind heute eingeteilt?", oberflaeche: "de", diktatSprachen: ["kk", "kk"] },
      erkenner,
    );
    pruefe(
      "Diktat: genug erkannter Text -> Diktatsprache gilt weiterhin",
      langDiktat.sprache === "kk" && langDiktat.herkunft === "diktat",
      `${langDiktat.sprache} (${langDiktat.herkunft})`,
    );
  }

  // (f) Die Gegenprobe am fertigen Text: haelt sich das Modell nicht an die
  //     Anweisung, liest die Stimme, was WIRKLICH dasteht.
  {
    const abweichend = stimmenSprache("ru", ANTWORTEN.de, erkenner);
    pruefe("Gegenprobe: antwortet das Modell doch deutsch, spricht die deutsche Stimme", abweichend.sprache === "de" && abweichend.abweichung);
    const passend = stimmenSprache("ru", ANTWORTEN.ru, erkenner);
    pruefe("Gegenprobe: passt es, bleibt es bei L", passend.sprache === "ru" && !passend.abweichung);
    const unklar = stimmenSprache("kk", "42", erkenner);
    pruefe("Gegenprobe: bei unklarem Text bleibt es bei L", unklar.sprache === "kk" && !unklar.abweichung);
  }

  // (g) Die alte Regel ist wirklich weg: die Stimme darf nicht mehr allein
  //     aus der Oberflaeche kommen.
  {
    const tts = readFileSync(new URL("../../src/app/api/ki-sprachausgabe/route.ts", import.meta.url), "utf8");
    pruefe("Stimme: die Route prueft den Antworttext gegen L", tts.includes("stimmenSprache("));
    pruefe("Stimme: sie leitet die Sprache nicht mehr allein aus der Oberflaeche ab", !/const sprache = istSprachausgabeSprache\(oberflaechenSprache\)/.test(tts));
  }

  // (h) Die Anweisung ans Modell bekommt L, nicht die Oberflaeche.
  {
    const route = readFileSync(new URL("../../src/app/api/ki-assistent/route.ts", import.meta.url), "utf8");
    pruefe("Antwortsprache: der Systemprompt bekommt L", route.includes("spracheAnweisung(antwortSprache)"));
    pruefe("Antwortsprache: L wird im Stream mitgeschickt", route.includes("messageMetadata"));
  }
}

// --- 12. Live-Sprachausgabe: Zerleger und Signatur -------------------------
// Vorgelesen wird kuenftig schon waehrend die Antwort entsteht. Zwei Dinge
// muessen dafuer stimmen: die Abschnitte muessen sprechbar sein, und niemand
// darf sich beliebigen Text auf unsere Rechnung vorlesen lassen.
{
  // (a) Der erste Abschnitt faellt frueh - er entscheidet, wie lange es still
  //     bleibt, bevor ueberhaupt etwas klingt. Seit 24.09.2026 als GANZER
  //     Satz: am ersten Komma zu schneiden brach genau den ersten Eindruck
  //     mitten in der Satzmelodie. Nur ein langer erster Satz wird geteilt.
  {
    const z = erzeugeSatzZerleger();
    const erste = z.fuettere("Die Lieferung aus Almaty ist am Dienstag angekommen, pünktlich um 14 Uhr. Die");
    pruefe("Zerleger: der erste Abschnitt kommt, sobald der erste Satz steht", erste.length >= 1, JSON.stringify(erste[0]?.text ?? ""));
    pruefe("Zerleger: und er ist der ganze Satz, nicht nur bis zum Komma", erste[0]?.text === "Die Lieferung aus Almaty ist am Dienstag angekommen, pünktlich um 14 Uhr.", erste[0]?.text);
    const lang = erzeugeSatzZerleger().fuettere(
      "Die Lieferung aus Almaty ist nach einer langen Fahrt über die Grenze, mehreren Kontrollen und einem Umweg über Taraz ",
    );
    pruefe("Zerleger: ein langer erster Satz wird am letzten Komma geteilt", lang[0]?.text.endsWith(","), lang[0]?.text);
    pruefe("Zerleger: und bleibt kurz genug, um schnell zu klingen", (lang[0]?.text.length ?? 999) <= ERSTER_ABSCHNITT_ZEICHEN * 1.5 + 30, `${lang[0]?.text.length} Zeichen`);
  }

  // (b) Danach laengere Abschnitte: die Stimme braucht ganze Saetze fuer die
  //     Satzmelodie.
  {
    const z = erzeugeSatzZerleger();
    z.fuettere("Kurz, ");
    const weitere = [
      ...z.fuettere("die Kühlkette war lückenlos. Alle Messwerte lagen im Rahmen. "),
      ...z.fuettere("Die Steigen wurden um 15 Uhr vorgekühlt. Der Fotobeleg liegt vor. "),
      ...z.abschliessen(),
    ];
    pruefe("Zerleger: spaetere Abschnitte enthalten ganze Saetze", weitere.some((a) => a.text.trim().endsWith(".")), JSON.stringify(weitere.map((a) => a.text)));
    pruefe("Zerleger: und bleiben unter der Laengengrenze", weitere.every((a) => a.text.length <= ABSCHNITT_ZEICHEN + 60), `max ${Math.max(...weitere.map((a) => a.text.length))}`);
    // Die Nummern zaehlen die AUSGEGEBENEN Abschnitte, nicht die Stream-
    // Stuecke: "Kurz, " allein ist zu kurz und wird noch zurueckgehalten.
    pruefe("Zerleger: die Nummern laufen luecken- und sprungfrei", weitere.every((a, i) => a.nr === weitere[0].nr + i), JSON.stringify(weitere.map((a) => a.nr)));
  }

  // (c) Was kein Satzende ist, darf keines werden. "3,5" und "z. B." haben
  //     frueher mitten im Satz abgeschnitten.
  {
    const ganz = (text) => {
      const z = erzeugeSatzZerleger();
      return [...z.fuettere(text), ...z.abschliessen()].map((a) => a.text).join(" ");
    };
    for (const [text, darfNicht] of [
      ["Ein Wert lag bei 3,5 Grad und blieb damit im Rahmen der Vorgabe.", "3,5"],
      ["Das gilt z. B. für Polana und für Polka, also für beide Sorten.", "z. B."],
      ["Siehe Nr. 12 in der Liste der freigegebenen Reihenblöcke dort.", "Nr."],
      ["Die Messung ergab 12.5 Grad und lag knapp über dem Grenzwert hier.", "12.5"],
    ]) {
      const zusammen = ganz(text);
      pruefe(`Zerleger: "${darfNicht}" ist kein Satzende`, zusammen.includes(darfNicht), zusammen.slice(0, 80));
    }
  }

  // (d) Codebloecke werden nicht vorgelesen - auch dann nicht, wenn sie ueber
  //     mehrere Stream-Stuecke verteilt ankommen.
  {
    const z = erzeugeSatzZerleger();
    const raus = [
      ...z.fuettere("Hier die Abfrage, bitte einmal ausführen. "),
      ...z.fuettere("```sql\nselect * "),
      ...z.fuettere("from lieferungen;\n```"),
      ...z.fuettere(" Danach steht das Ergebnis in der Liste."),
      ...z.abschliessen(),
    ];
    const alles = raus.map((a) => a.text).join(" ");
    pruefe("Zerleger: Code wird nicht vorgelesen", !alles.includes("select") && !alles.includes("lieferungen;"), alles.slice(0, 100));
    pruefe("Zerleger: der Text darum herum schon", alles.includes("Abfrage") && alles.includes("Ergebnis"), alles.slice(0, 100));
  }

  // (e) Links und Tabellen: gesprochen wird der Text, nicht die Adresse.
  {
    const z = erzeugeSatzZerleger();
    const raus = [...z.fuettere("Die Liste steht im [Sortenkatalog](https://damicon.test/katalog) bereit."), ...z.abschliessen()];
    const alles = raus.map((a) => a.text).join(" ");
    pruefe("Zerleger: aus einem Link wird nur der Text", alles.includes("Sortenkatalog") && !alles.includes("https"), alles);
  }

  // (f) Eine sehr lange Antwort wird gedeckelt - sonst laeuft die Stimme
  //     minutenlang und kostet entsprechend.
  {
    const z = erzeugeSatzZerleger();
    const satz = "Die Kühlkette blieb über den gesamten Zeitraum hinweg vollständig lückenlos. ";
    let gesamt = 0;
    for (let i = 0; i < 200; i++) for (const a of z.fuettere(satz)) gesamt += a.text.length;
    pruefe("Zerleger: hoechstens 3000 Zeichen je Antwort", gesamt <= MAX_SPRACHAUSGABE_ZEICHEN, `${gesamt} Zeichen`);
    pruefe("Zerleger: die Grenze wurde im Test wirklich erreicht", gesamt > MAX_SPRACHAUSGABE_ZEICHEN - 200, `${gesamt} Zeichen`);
    pruefe("Zerleger: und danach kommt nichts mehr", z.fuettere("Noch ein Satz.").length === 0 && z.abschliessen().length === 0);
  }

  // (g) Signatur. Ohne sie waere die Route ein offenes Vorlese-Werkzeug.
  {
    const geheimnis = "nur-fuer-den-test-mindestens-16";
    const basis = { nutzerId: "nutzer-1", zug: "zug-1", nr: 1, text: "Die Lieferung ist angekommen.", ablauf: Date.now() + ABSCHNITT_GUELTIG_MS };
    const sig = signiereAbschnitt(basis, geheimnis);

    pruefe("Signatur: ein sauberer Abschnitt wird angenommen", pruefeAbschnitt({ ...basis, sig }, geheimnis).ok);

    for (const [was, verdreht] of [
      ["geaenderter Text", { ...basis, text: "Die Lieferung ist NICHT angekommen." }],
      ["andere Nummer", { ...basis, nr: 2 }],
      ["anderer Zug", { ...basis, zug: "zug-2" }],
      ["anderer Nutzer", { ...basis, nutzerId: "nutzer-2" }],
    ]) {
      const e = pruefeAbschnitt({ ...verdreht, sig }, geheimnis);
      pruefe(`Signatur: ${was} wird abgewiesen`, !e.ok && e.grund === "signatur-falsch", e.ok ? "angenommen" : e.grund);
    }

    {
      const e = pruefeAbschnitt({ ...basis, sig }, "ein-anderes-geheimnis-16");
      pruefe("Signatur: ein fremdes Geheimnis wird abgewiesen", !e.ok && e.grund === "signatur-falsch", e.ok ? "angenommen" : e.grund);
    }
    {
      const alt = { ...basis, ablauf: Date.now() - 1000 };
      const e = pruefeAbschnitt({ ...alt, sig: signiereAbschnitt(alt, geheimnis) }, geheimnis);
      pruefe("Signatur: nach zehn Minuten ist sie wertlos", !e.ok && e.grund === "abgelaufen", e.ok ? "angenommen" : e.grund);
    }
    {
      const weit = { ...basis, ablauf: Date.now() + 40 * 60 * 1000 };
      const e = pruefeAbschnitt({ ...weit, sig: signiereAbschnitt(weit, geheimnis) }, geheimnis);
      pruefe("Signatur: ein selbst gesetzter Ablauf weit in der Zukunft zaehlt nicht", !e.ok && e.grund === "ablauf-zu-weit", e.ok ? "angenommen" : e.grund);
    }
    {
      const e = pruefeAbschnitt({ ...basis, sig: "" }, geheimnis);
      pruefe("Signatur: ohne Signatur gar nicht erst", !e.ok && e.grund === "ohne-signatur");
    }
    pruefe("Signatur: sie verraet den Text nicht", !sig.includes("Lieferung") && /^[0-9a-f]{64}$/.test(sig), sig.slice(0, 16) + "...");
  }

  // (h) Ohne Geheimnis gibt es keine Live-Sprachausgabe - nicht etwa eine
  //     ungeschuetzte.
  {
    const vorher = process.env.KI_SPRACHAUSGABE_SIGNATUR;
    delete process.env.KI_SPRACHAUSGABE_SIGNATUR;
    pruefe("Signatur: ohne KI_SPRACHAUSGABE_SIGNATUR kein Betrieb", sprachausgabeGeheimnis() === null);
    process.env.KI_SPRACHAUSGABE_SIGNATUR = "zu-kurz";
    pruefe("Signatur: ein zu kurzes Geheimnis zaehlt nicht", sprachausgabeGeheimnis() === null);
    process.env.KI_SPRACHAUSGABE_SIGNATUR = "langgenug-fuer-den-test-1234";
    pruefe("Signatur: ein brauchbares Geheimnis wird genommen", sprachausgabeGeheimnis() !== null);
    if (vorher === undefined) delete process.env.KI_SPRACHAUSGABE_SIGNATUR;
    else process.env.KI_SPRACHAUSGABE_SIGNATUR = vorher;
  }
}


// --- 13. Schalter: jede neue Funktion laesst sich ohne Code abstellen -------
// Der Sinn ist der Notausgang in Produktion. Deshalb ist die Voreinstellung
// immer AUS: wer einen Schalter vergisst, bekommt den Stand von vorher.
{
  const umgebung = {
    live: process.env.KI_SPRACHAUSGABE_LIVE,
    sig: process.env.KI_SPRACHAUSGABE_SIGNATUR,
    seite: process.env.KI_AGENT_SEITENANSICHT,
  };
  try {
    for (const [wert, erwartet] of [
      ["an", true], ["on", true], ["true", true], ["1", true], ["AN", true], [" an ", true],
      ["aus", false], ["off", false], ["false", false], ["0", false], ["", false],
      [undefined, false], ["vielleicht", false],
    ]) {
      pruefe(`Schalter: ${JSON.stringify(wert)} -> ${erwartet ? "an" : "aus"}`, schalterAn(wert) === erwartet);
    }

    // Live-Sprachausgabe nur mit Geheimnis - sonst waere die Route ein
    // offenes Vorlese-Werkzeug.
    delete process.env.KI_SPRACHAUSGABE_LIVE;
    delete process.env.KI_SPRACHAUSGABE_SIGNATUR;
    pruefe("Schalter: Live-Sprachausgabe ist ohne alles aus", sprachausgabeLiveAn() === false);
    process.env.KI_SPRACHAUSGABE_LIVE = "an";
    const fehler = [];
    const echteFehlerausgabe = console.error;
    console.error = (...a) => fehler.push(a.join(" "));
    const ohneGeheimnis = sprachausgabeLiveAn();
    console.error = echteFehlerausgabe;
    pruefe("Schalter: an ohne Geheimnis bleibt trotzdem aus", ohneGeheimnis === false);
    pruefe("Schalter: und sagt im Protokoll, warum", fehler.some((z) => z.includes("KI_SPRACHAUSGABE_SIGNATUR")), fehler.join(" | ").slice(0, 80));
    process.env.KI_SPRACHAUSGABE_SIGNATUR = "zu-kurz";
    pruefe("Schalter: ein zu kurzes Geheimnis zaehlt nicht", sprachausgabeLiveAn() === false);
    process.env.KI_SPRACHAUSGABE_SIGNATUR = "lang-genug-fuer-den-test-1234";
    pruefe("Schalter: mit Schalter UND Geheimnis ist sie an", sprachausgabeLiveAn() === true);
    process.env.KI_SPRACHAUSGABE_LIVE = "aus";
    pruefe("Schalter: das Geheimnis allein schaltet nichts ein", sprachausgabeLiveAn() === false);

    delete process.env.KI_AGENT_SEITENANSICHT;
    pruefe("Schalter: Seitenansicht ist voreingestellt aus", agentSeitenansichtAn() === false);
    process.env.KI_AGENT_SEITENANSICHT = "an";
    pruefe("Schalter: und laesst sich einschalten", agentSeitenansichtAn() === true);

    // Alle Schalter muessen in .env.example stehen - sonst weiss der Betrieb
    // nicht, woran er sie abstellen kann.
    const beispiel = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
    for (const name of ["KI_SPRACHERKENNUNG_ANBIETER", "SONIOX_API_URL", "SONIOX_API_KEY", "SONIOX_ZEITLIMIT_MS", "KI_SPRACHAUSGABE_LIVE", "KI_SPRACHAUSGABE_SIGNATUR", "KI_AGENT_SEITENANSICHT"]) {
      pruefe(`Schalter: ${name} steht in .env.example`, beispiel.includes(name));
    }
  } finally {
    for (const [name, wert] of [
      ["KI_SPRACHAUSGABE_LIVE", umgebung.live],
      ["KI_SPRACHAUSGABE_SIGNATUR", umgebung.sig],
      ["KI_AGENT_SEITENANSICHT", umgebung.seite],
    ]) {
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  }
}


// --- 14. Warteschlange der Abschnitte --------------------------------------
// Reihenfolge, Vorsprung, sofortiges Aufhoeren. Geprueft ohne Browser: hier
// steht nur die Buchfuehrung, kein fetch und kein Audio.
{
  // (a) Der Reihe nach - auch wenn Abschnitt 2 frueher fertig ist. Kurze
  //     Saetze sind schneller erzeugt als lange; ohne diese Regel klaenge
  //     die Antwort durcheinander.
  {
    const w = erzeugeWarteschlange();
    w.stelleEin(1, "Erster Satz.");
    w.stelleEin(2, "Zweiter Satz.");
    w.naechsteZumHolen();
    w.melde(2, "bereit");
    pruefe("Warteschlange: der zweite wartet auf den ersten", w.naechsterZumSpielen() === null);
    w.melde(1, "bereit");
    pruefe("Warteschlange: dann kommt der erste", w.naechsterZumSpielen()?.nr === 1);
    pruefe("Warteschlange: und waehrend er spielt, kein zweiter", w.naechsterZumSpielen() === null);
    w.fertigGespielt(1);
    pruefe("Warteschlange: danach der zweite", w.naechsterZumSpielen()?.nr === 2);
  }

  // (b) Hoechstens zwei Anfragen gleichzeitig. Mehr erzeugt Audio, das
  //     niemand hoert, sobald jemand abbricht - bezahlt wird es trotzdem.
  {
    const w = erzeugeWarteschlange();
    for (let i = 1; i <= 5; i++) w.stelleEin(i, `Satz ${i}.`);
    const erste = w.naechsteZumHolen();
    pruefe("Warteschlange: zuerst nur zwei Anfragen", erste.length === HOECHSTENS_GLEICHZEITIG, `${erste.length}`);
    pruefe("Warteschlange: und zwar die vordersten", erste.map((e) => e.nr).join(",") === "1,2");
    pruefe("Warteschlange: solange sie offen sind, kommt nichts nach", w.naechsteZumHolen().length === 0);
    w.melde(1, "bereit");
    pruefe("Warteschlange: wird einer fertig, rueckt einer nach", w.naechsteZumHolen().map((e) => e.nr).join(",") === "3");
  }

  // (c) Ein Abschnitt darf einmal scheitern. Beim zweiten Mal wird er
  //     uebersprungen - lieber eine Luecke als Stille bis zum Ende.
  {
    const w = erzeugeWarteschlange();
    w.stelleEin(1, "Eins.");
    w.stelleEin(2, "Zwei.");
    w.naechsteZumHolen();
    w.melde(1, "fehler");
    pruefe("Warteschlange: nach einem Fehler wird es noch einmal versucht", w.naechsteZumHolen().some((e) => e.nr === 1));
    w.melde(1, "fehler");
    pruefe("Warteschlange: beim zweiten Mal wird er uebersprungen", w.stand().find((e) => e.nr === 1)?.stand === "uebersprungen");
    w.melde(2, "bereit");
    pruefe("Warteschlange: und der naechste rueckt auf, statt zu warten", w.naechsterZumSpielen()?.nr === 2);
  }

  // (d) Sofort still: leere() gibt zurueck, was noch unterwegs ist, damit der
  //     Aufrufer genau diese Anfragen abbrechen kann.
  {
    const w = erzeugeWarteschlange();
    for (let i = 1; i <= 4; i++) w.stelleEin(i, `Satz ${i}.`);
    w.naechsteZumHolen();
    w.melde(1, "bereit");
    w.naechsterZumSpielen();
    const unterwegs = w.leere();
    pruefe("Warteschlange: beim Abbruch werden laufende Anfragen gemeldet", unterwegs.includes(2), JSON.stringify(unterwegs));
    pruefe("Warteschlange: und der gerade gespielte Abschnitt auch", unterwegs.includes(1), JSON.stringify(unterwegs));
    pruefe("Warteschlange: danach ist sie leer", w.stand().length === 0);
    pruefe("Warteschlange: und es wird nichts mehr gespielt", w.naechsterZumSpielen() === null);
  }

  // (e) Nach dem Abbruch faengt der naechste Zug wieder bei 1 an - sonst
  //     wartete er ewig auf einen Abschnitt, den es nicht mehr gibt.
  {
    const w = erzeugeWarteschlange();
    w.stelleEin(1, "Alt.");
    w.naechsteZumHolen();
    w.leere();
    w.stelleEin(1, "Neu.");
    w.naechsteZumHolen();
    w.melde(1, "bereit");
    pruefe("Warteschlange: der naechste Zug beginnt wieder bei 1", w.naechsterZumSpielen()?.text === "Neu.");
  }

  // (f) Derselbe Abschnitt zweimal (doppeltes Stream-Ereignis) zaehlt einmal.
  {
    const w = erzeugeWarteschlange();
    w.stelleEin(1, "Eins.");
    w.stelleEin(1, "Eins nochmal.");
    pruefe("Warteschlange: ein Abschnitt kommt nur einmal hinein", w.stand().length === 1 && w.stand()[0].text === "Eins.");
  }
}


// --- 15. Agent-Seitenansicht: einmal an die Seite, und dort bleibt es ------
// Bis zum 22.09.2026 war das Andocken eine Leihgabe: nach der Fuehrung sprang
// das Panel zurueck in die Mitte und verdeckte genau die Seite, die der Agent
// gerade geoeffnet hatte.
{
  const start = { ...ANFANG };

  // (a) Die erste Navigation des Agenten stellt um - und oeffnet das Panel.
  {
    const nachher = naechsterZustand(start, "agent-navigation", true);
    pruefe("Seitenansicht: die erste Agenten-Navigation dockt an", nachher.darstellung === "seite", nachher.darstellung);
    pruefe("Seitenansicht: und oeffnet das Panel - eine Fuehrung, die niemand sieht, ist keine", nachher.offen === true);
  }

  // (b) Und es BLEIBT so: weitere Stationen aendern nichts mehr.
  {
    let z = naechsterZustand(start, "agent-navigation", true);
    for (let i = 0; i < 5; i++) z = naechsterZustand(z, "agent-navigation", true);
    pruefe("Seitenansicht: weitere Stationen lassen es an der Seite", z.darstellung === "seite" && z.offen);
  }

  // (c) Zurueck in die Mitte nur ueber den Knopf.
  {
    const ander = naechsterZustand(naechsterZustand(start, "agent-navigation", true), "knopf-mitte", true);
    pruefe("Seitenansicht: der Knopf holt es in die Mitte", ander.darstellung === "buehne");
    pruefe("Seitenansicht: und laesst es offen", ander.offen === true);
    const zurueck = naechsterZustand(ander, "knopf-seite", true);
    pruefe("Seitenansicht: und wieder an die Seite", zurueck.darstellung === "seite");
  }

  // (d) Eine neue Anmeldung raeumt die gemerkte Wahl weg - sonst faende die
  //     naechste Person die Ansicht ihrer Vorgaengerin vor.
  {
    // Der Auftrag sagt "zurueck zur Mitte nach neuer Anmeldung". Die Mitte war
    // aber nie die Voreinstellung - ki-pane-kontext.tsx beginnt seit jeher mit
    // "seite". Eine neue Anmeldung vergisst deshalb die gemerkte Wahl; danach
    // gilt wieder, womit die Anwendung beginnt.
    const nachAnmeldung = naechsterZustand({ darstellung: "buehne", offen: true }, "neue-anmeldung", true);
    pruefe("Seitenansicht: eine neue Anmeldung vergisst die gemerkte Wahl", nachAnmeldung.darstellung === ANFANG.darstellung && !nachAnmeldung.offen, JSON.stringify(nachAnmeldung));
  }

  // (e) Ohne den Schalter bleibt alles beim Alten. Das ist der Notausgang.
  {
    const ohne = naechsterZustand(start, "agent-navigation", false);
    pruefe("Seitenansicht: ohne KI_AGENT_SEITENANSICHT aendert die Navigation nichts", ohne.darstellung === start.darstellung && ohne.offen === start.offen);
  }

  // (f) Die gemerkten Werte.
  {
    pruefe("Seitenansicht: die Darstellung wird unter ihrem Schluessel gemerkt", DARSTELLUNG_SCHLUESSEL === "damicon-ki-darstellung");
    pruefe("Seitenansicht: und ob das Panel offen war", OFFEN_SCHLUESSEL === "damicon-ki-offen");
    pruefe("Seitenansicht: nur die beiden Darstellungen zaehlen", istDarstellung("seite") && istDarstellung("buehne") && !istDarstellung("mitte") && !istDarstellung(null));
  }

  // (g) Im Code: die Leihgabe ist wirklich weg, und das Panel merkt sich, ob
  //     es offen war - sonst haelt die Ansicht keinen Sprung nach /herkunft
  //     aus, weil der Provider im Dashboard-Layout haengt.
  {
    const kontext = readFileSync(new URL("../../src/components/ki/ki-pane-kontext.tsx", import.meta.url), "utf8");
    pruefe("Seitenansicht: die Leihgabe (buehneGeliehen) ist entfernt", !kontext.includes("buehneGeliehen"));
    pruefe("Seitenansicht: die Umstellung wird gemerkt, nicht nur gesetzt", kontext.includes("naechsterZustand("));
    pruefe("Seitenansicht: 'offen' wird gespeichert", kontext.includes("OFFEN_SCHLUESSEL"));
    // Der Abschnitt von fuehreZu bis zu seiner Abhaengigkeitsliste muss das
    // Oeffnen enthalten - nicht irgendeine andere Stelle der Datei.
    const fuehreZuAnfang = kontext.indexOf("const fuehreZu = useCallback");
    const fuehreZuBlock = fuehreZuAnfang < 0 ? "" : kontext.slice(fuehreZuAnfang, kontext.indexOf("const fuehrungBeenden", fuehreZuAnfang));
    pruefe("Seitenansicht: fuehreZu oeffnet das Panel", fuehreZuBlock.includes("setOffen(true)"), fuehreZuBlock ? `${fuehreZuBlock.length} Zeichen geprueft` : "Block NICHT gefunden");
  }

  // (h) Der Knopf im Panelkopf gibt es in allen vier Sprachen - sonst faende
  //     ihn nur, wer Deutsch kann.
  {
    for (const sprache of ["de", "en", "ru", "kk"]) {
      const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8"));
      const a = texte.kiAssistentAnsicht?.andocken;
      const b = texte.kiAssistentAnsicht?.buehne;
      pruefe(`Seitenansicht: Knopftexte auf ${sprache}`, typeof a === "string" && a.length > 0 && typeof b === "string" && b.length > 0, `${a} / ${b}`);
    }
  }

  // (i) Angedockt soll das Panel 380 bis 420 px breit sein, und die
  //     Hauptspalte schrumpft, statt verdeckt zu werden.
  {
    const css = readFileSync(new URL("../../src/components/ki/ki-pane.css", import.meta.url), "utf8");
    const treffer = /--ki-pane-breite:\s*([\d.]+)rem/.exec(css);
    const px = treffer ? Number(treffer[1]) * 16 : 0;
    pruefe("Seitenansicht: angedockt zwischen 380 und 420 px", px >= 380 && px <= 420, `${px} px`);
    pruefe("Seitenansicht: prefers-reduced-motion wird beachtet", css.includes("prefers-reduced-motion"));
  }

  // (j) Die gemerkte Ansicht gehoert einer Person. Ohne das erbt die naechste,
  //     die sich an diesem Rechner anmeldet, das offene Panel ihrer
  //     Vorgaengerin - und die Regel "nach neuer Anmeldung" waere nur eine
  //     Funktion, die niemand aufruft. (Beim Durchsehen des Diffs aufgefallen.)
  {
    const kontext = readFileSync(new URL("../../src/components/ki/ki-pane-kontext.tsx", import.meta.url), "utf8");
    const layout = readFileSync(new URL("../../src/app/[locale]/dashboard/layout.tsx", import.meta.url), "utf8");
    pruefe("Seitenansicht: das Gemerkte traegt den Nutzer", kontext.includes("NUTZER_SCHLUESSEL"));
    pruefe("Seitenansicht: bei einem anderen Nutzer wird es vergessen", kontext.includes("removeItem(DARSTELLUNG_SCHLUESSEL)") && kontext.includes("removeItem(OFFEN_SCHLUESSEL)"));
    pruefe("Seitenansicht: das Layout reicht den Nutzer durch", layout.includes("nutzerId={profil?.id ?? null}"));
    pruefe("Seitenansicht: und es gibt einen eigenen Schluessel dafuer", NUTZER_SCHLUESSEL === "damicon-ki-nutzer");
  }

}


// --- 16. Die gehoerte Sprache muss auch ankommen ---------------------------
// Regel (a) aus Teil D stand schon im Server - und lief nie: die Route las
// body.diktatSprachen, aber niemand schickte es. Beim Durchsehen des Diffs
// aufgefallen. Diese Pruefungen halten die Kette zusammen, Glied fuer Glied,
// damit sie nicht wieder still zerfaellt.
{
  // (a) Soniox wird ueberhaupt nach der Sprache gefragt, und die Antwort
  //     wird ausgewertet.
  {
    const echtesFetch = globalThis.fetch;
    const umgebung = { k: process.env.SONIOX_API_KEY, u: process.env.SONIOX_API_URL };
    const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
    const aufrufe = [];
    try {
      process.env.SONIOX_API_KEY = "testschluessel";
      process.env.SONIOX_API_URL = "https://api.soniox.test";
      globalThis.fetch = async (url, init = {}) => {
        aufrufe.push({ url: String(url), koerper: init.body });
        const adresse = String(url);
        if (init.method === "DELETE") return json({});
        if (adresse.endsWith("/v1/files")) return json({ id: "d1" });
        if (adresse.endsWith("/v1/transcriptions")) return json({ id: "a1" });
        if (adresse.endsWith("/transcript")) {
          return json({
            text: "Салқын тізбек",
            tokens: [
              { text: "Салқын", language: "kk" },
              { text: " тізбек", language: "kk" },
              // Ein einzelner Ausrutscher darf den Zug nicht umwerfen.
              { text: " New York", language: "en" },
              { text: "", language: null },
            ],
          });
        }
        return json({ status: "completed" });
      };

      const e = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "aufnahme.webm", "kk");
      const auftrag = JSON.parse(String(aufrufe.find((a) => a.url.endsWith("/v1/transcriptions"))?.koerper ?? "{}"));
      pruefe("Diktatsprache: Soniox wird nach der Sprache gefragt", auftrag.enable_language_identification === true, JSON.stringify(auftrag));
      pruefe("Diktatsprache: die Sprachen der Token kommen zurueck", e.ok && JSON.stringify(e.sprachen) === JSON.stringify(["kk", "kk", "en"]), JSON.stringify(e.ok ? e.sprachen : e.grund));
      pruefe("Diktatsprache: daraus wird die Mehrheit - der Ausrutscher zaehlt nicht", mehrheitsSprache(e.ok ? e.sprachen : []) === "kk");
    } finally {
      globalThis.fetch = echtesFetch;
      if (umgebung.k === undefined) delete process.env.SONIOX_API_KEY; else process.env.SONIOX_API_KEY = umgebung.k;
      if (umgebung.u === undefined) delete process.env.SONIOX_API_URL; else process.env.SONIOX_API_URL = umgebung.u;
    }
  }

  // (b) Der Wettlauf reicht sie durch, statt sie zu verschlucken.
  {
    const mitSprachen = await erkenneMitRueckfall(
      async () => ({ ok: true, text: "Салқын тізбек", sprachen: ["kk", "kk"] }),
      async () => ({ ok: true, text: "von whisper" }),
      () => {},
    );
    pruefe("Diktatsprache: der Wettlauf reicht sie weiter", mitSprachen.ok && JSON.stringify(mitSprachen.sprachen) === JSON.stringify(["kk", "kk"]), JSON.stringify(mitSprachen));
    // Whisper kennt keine Sprachen - dann eben eine leere Liste, kein undefined.
    const ohne = await erkenneMitRueckfall(null, async () => ({ ok: true, text: "von whisper" }), () => {});
    pruefe("Diktatsprache: ohne Angabe eine leere Liste, kein undefined", ohne.ok && Array.isArray(ohne.sprachen) && ohne.sprachen.length === 0);
  }

  // (c) Die Kette im Code: Aktion -> Status -> Knopf -> Chat -> Route.
  //     Jedes Glied einzeln, damit ein fehlendes sofort auffaellt.
  {
    const aktion = readFileSync(new URL("../../src/lib/actions/ki-assistent.ts", import.meta.url), "utf8");
    const status = readFileSync(new URL("../../src/lib/actions/status.ts", import.meta.url), "utf8");
    const knopf = readFileSync(new URL("../../src/components/ki/mikrofon.tsx", import.meta.url), "utf8");
    const chat = readFileSync(new URL("../../src/components/ki/ki-chat.tsx", import.meta.url), "utf8");
    const chatSprache = readFileSync(new URL("../../src/components/ki/ki-chat-sprache.ts", import.meta.url), "utf8");
    const route = readFileSync(new URL("../../src/app/api/ki-assistent/route.ts", import.meta.url), "utf8");

    pruefe("Kette 1/5: die Aktion gibt die Sprachen zurueck", aktion.includes("ok(\"ok.transkription\", antwort.text, gehoerteSprachen)"));
    pruefe("Kette 2/5: der Status kann sie tragen", status.includes("sprachen?: string[]"));
    pruefe("Kette 3/5: der Mikrofonknopf reicht sie weiter", knopf.includes("beiText(status.wert, status.sprachen)"));
    // Seit der Zerlegung von ki-chat.tsx (wmc-vibecode-cleanup Phase 3) haelt
    // ki-chat-sprache.ts den Diktat-Zustand; ki-chat.tsx reicht den fertigen
    // Wert nur noch in die Anfrage durch (beginneZug()/merkeDiktatSprachen()).
    pruefe(
      "Kette 4/5: das Chatfenster schickt sie mit der Frage",
      chatSprache.includes("diktatSprachen.current = sprachen") &&
        chat.includes("anfrageDaten.current = { ...anfrageDaten.current, diktatSprachen, vorleseWeg:"),
    );
    pruefe("Kette 5/5: die Route wertet sie aus", route.includes("body.diktatSprachen") && route.includes("bestimmeAntwortsprache("));
  }

  // (d) Und der Sinn der ganzen Kette: ein verhoerter kasachischer Text
  //     bekommt trotzdem eine kasachische Antwort.
  {
    const verhoert = "Sahlkentiz wird tollen, kurzat.";
    const mit = bestimmeAntwortsprache(
      { frage: verhoert, oberflaeche: "de", diktatSprachen: ["kk", "kk", "en"] },
      (t) => erkenneSprache(t, 10),
    );
    pruefe("Diktatsprache: verhoert, aber kasachisch beantwortet", mit.sprache === "kk" && mit.herkunft === "diktat", `${mit.sprache} (${mit.herkunft})`);
  }
}


// --- 15. Umbau Sprache 24.09.2026: Live-Diktat, Soniox-Stimme, Vorlesetext ---
// Eingabe und Ausgabe galten "in allen Sprachen" als schlecht. Die Ursachen
// lagen zum groessten Teil im eigenen Code, nicht beim Anbieter: Diktat nur
// als Datei (kein Text waehrend des Sprechens), Stilleregel, die leise
// Sprechende verwarf, Diktat ersetzte das Feld, Whisper erfand auf Stille
// Saetze; beim Vorlesen Belegmarken, Sternchen und russische Abkuerzungen
// als eigene "Saetze", jeder Satz eine eigene Anfrage. Diese Pruefungen
// halten die Korrekturen fest.
{
  // (a) Sprachhinweise und Kontext - dieselbe Regel fuer Live und Datei.
  pruefe("Live-Diktat: kk bekommt kk und ru als Hinweis", JSON.stringify(sprachHinweise("kk")) === '["kk","ru"]');
  pruefe("Live-Diktat: ru bekommt ru und kk als Hinweis", JSON.stringify(sprachHinweise("ru")) === '["ru","kk"]');
  pruefe("Live-Diktat: de bleibt bei de", JSON.stringify(sprachHinweise("de")) === '["de"]');
  pruefe("Live-Diktat: Unbekanntes geht nicht mit", sprachHinweise("tr").length === 0 && sprachHinweise(undefined).length === 0);
  const konf = liveKonfiguration("kk");
  pruefe("Live-Diktat: Echtzeitmodell stt-rt-v5", konf.model === LIVE_MODELL && LIVE_MODELL === "stt-rt-v5");
  pruefe("Live-Diktat: Endpunkt- und Spracherkennung an", konf.enable_endpoint_detection === true && konf.enable_language_identification === true);
  pruefe("Live-Diktat: Endpunkt-Verzoegerung im erlaubten Bereich (500-3000)", konf.max_endpoint_delay_ms >= 500 && konf.max_endpoint_delay_ms <= 3000);
  pruefe("Live-Diktat: Fachwoerter gehen mit (Himbi, ЕСУТД, таңқурай)", ["Himbi", "ЕСУТД", "таңқурай"].every((w) => konf.context.terms.includes(w)));
  pruefe("Live-Diktat: keine doppelten Fachwoerter", new Set(diktatKontext().terms).size === diktatKontext().terms.length);
  pruefe("Live-Diktat: die Konfiguration traegt keinen Schluessel", !("api_key" in konf) && !JSON.stringify(konf).includes("SONIOX_API_KEY"));

  // (b) Adresse: keine Region im Code, abgeleitet aus SONIOX_API_URL.
  pruefe("Live-Diktat: EU-Adresse aus api.eu.soniox.com", sonioxLiveAdresse("https://api.eu.soniox.com") === "wss://stt-rt.eu.soniox.com/transcribe-websocket");
  pruefe("Live-Diktat: US-Adresse aus api.soniox.com", sonioxLiveAdresse("https://api.soniox.com/") === "wss://stt-rt.soniox.com/transcribe-websocket");
  pruefe("Live-Diktat: ohne SONIOX_API_URL keine Adresse", sonioxLiveAdresse(undefined) === null && sonioxLiveAdresse("") === null);
  pruefe("Live-Diktat: fremder Host wird nicht geraten", sonioxLiveAdresse("https://soniox.example.kz") === null);
  pruefe("Live-Diktat: SONIOX_STT_WS_URL gewinnt", sonioxLiveAdresse("https://api.soniox.com", "wss://stt-rt.kz.example/ws") === "wss://stt-rt.kz.example/ws");
  pruefe("Live-Diktat: nur wss:// ist erlaubt", sonioxLiveAdresse("https://api.soniox.com", "ws://unverschluesselt") === null);

  // (c) Token sammeln: endgueltig bleibt, vorlaeufig wird ersetzt.
  {
    const s = erzeugeTokenSammler();
    pruefe("Token: am Anfang nichts gehoert", !s.hatGehoert() && s.stand().anzeige === "");
    let st = s.nimm({ tokens: [{ text: "Hal", is_final: false }] });
    pruefe("Token: Vorlaeufiges erscheint sofort", st.anzeige === "Hal" && st.endgueltig === "" && s.hatGehoert(), st.anzeige);
    st = s.nimm({ tokens: [{ text: "Hallo", is_final: true, language: "de" }, { text: " Wel", is_final: false }] });
    pruefe("Token: Endgueltiges bleibt, Vorlaeufiges wird ersetzt", st.endgueltig === "Hallo" && st.anzeige === "Hallo Wel", st.anzeige);
    st = s.nimm({ tokens: [{ text: " Welt", is_final: true, language: "de" }, { text: "<end>", is_final: true }] });
    pruefe("Token: <end> meldet das Ende der Aeusserung, ohne im Text zu landen", st.endpunkt && st.endgueltig === "Hallo Welt" && !st.anzeige.includes("<"), st.anzeige);
    st = s.nimm({ tokens: [{ text: "<fin>", is_final: true }], finished: true });
    pruefe("Token: finished schliesst ab", st.fertig && st.endgueltig === "Hallo Welt");
    pruefe("Token: gehoerte Sprachen je endgueltigem Token", JSON.stringify(s.sprachen()) === '["de","de"]', JSON.stringify(s.sprachen()));
    const f = erzeugeTokenSammler().nimm({ error_code: 401, error_message: "Invalid API key" });
    pruefe("Token: ein Fehler des Dienstes beendet und wird gemeldet", f.fertig && f.fehler?.startsWith("soniox-401"), f.fehler);
  }

  // (d) Diktat haengt an, statt zu ersetzen.
  pruefe("Diktat: leeres Feld -> nur das Diktat", haengeDiktatAn("", " Hallo ") === "Hallo");
  pruefe("Diktat: vorhandener Text bleibt stehen", haengeDiktatAn("Frage:", "wie viele Steigen?") === "Frage: wie viele Steigen?");
  pruefe("Diktat: kein doppeltes Leerzeichen", haengeDiktatAn("Frage: ", "Steigen") === "Frage: Steigen");
  pruefe("Diktat: leeres Diktat aendert nichts", haengeDiktatAn("abc", "   ") === "abc");
  const chatQuelle = readFileSync(new URL("../../src/components/ki/ki-chat.tsx", import.meta.url), "utf8");
  pruefe("Diktat: das Chatfenster haengt an (haengeDiktatAn)", chatQuelle.includes("haengeDiktatAn(diktatBasis.current"));
  const altQuelle = readFileSync(new URL("../../src/components/db/ki-assistent-formulare.tsx", import.meta.url), "utf8");
  pruefe("Diktat: das aeltere Fenster ebenso", altQuelle.includes("haengeDiktatAn(basis.current") && !altQuelle.includes("feld.value = text;"));

  // (e) Mikrofon: feste Vorgaben, kurze Stuecke, Live mit Datei-Rueckfall.
  const knopfQuelle = readFileSync(new URL("../../src/components/ki/mikrofon.tsx", import.meta.url), "utf8");
  pruefe("Mikrofon: oeffnet mit festen Vorgaben", knopfQuelle.includes("getUserMedia({ audio: AUFNAHME_VORGABEN })"));
  pruefe("Mikrofon: nimmt in kurzen Stuecken auf (Live kann mitlaufen)", knopfQuelle.includes("recorder.start(AUFNAHME_STUECK_MS)"));
  pruefe("Mikrofon: scheitert Live, geht dieselbe Aufnahme als Datei", knopfQuelle.includes("weiter als Datei") && knopfQuelle.includes("transkribiereSprachnachricht(leer, daten)"));
  pruefe("Mikrofon: beim Klick verstummt jede Wiedergabe", knopfQuelle.includes("beiStart?.()"));
  pruefe("Mikrofon: der Pegel-Kontext wird fortgesetzt (iPhone)", knopfQuelle.includes('kontext.state === "suspended"'));
  const spracheQuelle = readFileSync(new URL("../../src/components/ki/ki-chat-sprache.ts", import.meta.url), "utf8");
  pruefe(
    "Wiedergabe: Stopp haelt beide Wege an, live und die ganze Antwort - und der Zug bleibt stumm",
    /const stoppeLiveUndDatei = useCallback\(\(\) => \{\s*liveStopp\(\);\s*dateiStopp\(\);/.test(spracheQuelle) &&
      /const stoppeAlles = useCallback\(\(\) => \{\s*stoppeLiveUndDatei\(\);\s*setZug\(\(z\) => \(z\.stumm \? z : \{ \.\.\.z, stumm: true \}\)\);/.test(spracheQuelle),
  );
  pruefe("Wiedergabe: kamen Live-Abschnitte, wird die Antwort nicht noch einmal gelesen", spracheQuelle.includes("if (!liveErlaubt || rundenAbschnitte.current.length > 0) return;"));

  // (f) Schalter: Live-Diktat voreingestellt aus.
  const vorher = process.env.KI_DIKTAT_LIVE;
  delete process.env.KI_DIKTAT_LIVE;
  pruefe("Schalter: Live-Diktat ist voreingestellt aus", diktatLiveAn() === false);
  process.env.KI_DIKTAT_LIVE = "an";
  pruefe("Schalter: und laesst sich einschalten", diktatLiveAn() === true);
  if (vorher === undefined) delete process.env.KI_DIKTAT_LIVE; else process.env.KI_DIKTAT_LIVE = vorher;
  const beispiel = readFileSync(new URL("../../.env.example", import.meta.url), "utf8");
  for (const name of ["KI_DIKTAT_LIVE", "SONIOX_STT_WS_URL", "KI_SPRACHAUSGABE_ANBIETER", "SONIOX_TTS_STIMME", "SONIOX_TTS_URL"]) {
    pruefe(`Schalter: ${name} steht in .env.example`, beispiel.includes(name));
  }

  // (g) Schluessel-Route: dieselben Schranken wie Chat und Diktat.
  const route = readFileSync(new URL("../../src/app/api/ki-spracherkennung/route.ts", import.meta.url), "utf8");
  pruefe("Schluessel-Route: prueft Anmeldung und Berechtigung", route.includes("getSessionProfile()") && route.includes('hasPermission(profil.role, "ki_assistent", "create")'));
  pruefe("Schluessel-Route: prueft den Schalter", route.includes("diktatLiveAn()"));
  pruefe("Schluessel-Route: zaehlt gegen die Ratenbegrenzung (stt:)", route.includes("ratenlimitUeberschritten(`stt:${profil.id}`"));
  pruefe("Schluessel-Route: wird nie zwischengespeichert", route.includes('"cache-control": "no-store"'));
  pruefe("Schluessel-Route: gibt den echten Schluessel nie heraus", !route.includes("SONIOX_API_KEY") && route.includes("holeSonioxSchluessel("));
}

{
  // (h) Kurzzeitschluessel bei Soniox holen.
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  let antwort = () => new Response(JSON.stringify({ api_key: "temp:abc", expires_at: "2026-09-24T10:00:00Z" }), { status: 200 });
  globalThis.fetch = async (url, init = {}) => {
    aufrufe.push({ url: String(url), init });
    return antwort();
  };
  const umgebung = { k: process.env.SONIOX_API_KEY, u: process.env.SONIOX_API_URL };
  try {
    delete process.env.SONIOX_API_KEY;
    process.env.SONIOX_API_URL = "https://api.eu.soniox.com";
    const ohne = await holeSonioxSchluessel("transcribe_websocket", { gueltigS: 60, sitzungS: 120 });
    pruefe("Schluessel: ohne SONIOX_API_KEY keiner", !ohne.ok && ohne.grund === "kein-schluessel");
    process.env.SONIOX_API_KEY = "echter-schluessel";
    const gut = await holeSonioxSchluessel("transcribe_websocket", { gueltigS: 60, sitzungS: 120, referenz: "pseudonym" });
    const koerper = JSON.parse(aufrufe.at(-1).init.body);
    pruefe("Schluessel: richtige Adresse (EU)", aufrufe.at(-1).url === "https://api.eu.soniox.com/v1/auth/temporary-api-key", aufrufe.at(-1).url);
    pruefe("Schluessel: nur fuer den Zweck, nur einmal, kurz", koerper.usage_type === "transcribe_websocket" && koerper.single_use === true && koerper.expires_in_seconds === 60 && koerper.max_session_duration_seconds === 120, JSON.stringify(koerper));
    pruefe("Schluessel: pseudonyme Referenz", koerper.client_reference_id === "pseudonym");
    pruefe("Schluessel: der kurzlebige kommt zurueck", gut.ok && gut.schluessel === "temp:abc");
    await holeSonioxSchluessel("tts_rt", { gueltigS: 99999, sitzungS: 0 });
    const geklemmt = JSON.parse(aufrufe.at(-1).init.body);
    pruefe("Schluessel: Laufzeiten werden auf Sonioxs Grenzen geklemmt", geklemmt.expires_in_seconds === 3600 && geklemmt.max_session_duration_seconds === 1, JSON.stringify(geklemmt));
    antwort = () => new Response("nope", { status: 401 });
    const abgewiesen = await holeSonioxSchluessel("transcribe_websocket", { gueltigS: 60, sitzungS: 120 });
    pruefe("Schluessel: 401 wird verstaendlich, ohne den Schluessel zu nennen", !abgewiesen.ok && abgewiesen.grund.startsWith("zugang-abgewiesen") && !abgewiesen.grund.includes("echter-schluessel"), abgewiesen.ok ? "" : abgewiesen.grund);
  } finally {
    globalThis.fetch = echtesFetch;
    if (umgebung.k === undefined) delete process.env.SONIOX_API_KEY; else process.env.SONIOX_API_KEY = umgebung.k;
    if (umgebung.u === undefined) delete process.env.SONIOX_API_URL; else process.env.SONIOX_API_URL = umgebung.u;
  }
}

{
  // (i) Datei-Weg: Kontext, "nichts gehoert", Aufraeumen im Hintergrund.
  const echtesFetch = globalThis.fetch;
  const aufrufe = [];
  const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "content-type": "application/json" } });
  let plan = [];
  globalThis.fetch = async (url, init = {}) => {
    aufrufe.push({ url: String(url), methode: init.method ?? "GET", koerper: init.body });
    return plan.shift() ?? json({});
  };
  const umgebung = { k: process.env.SONIOX_API_KEY, u: process.env.SONIOX_API_URL };
  try {
    process.env.SONIOX_API_KEY = "testschluessel";
    process.env.SONIOX_API_URL = "https://api.soniox.com";
    plan = [json({ id: "d" }), json({ id: "a" }), json({ status: "completed" }), json({ text: "Himbi" }), json({}), json({})];
    let hintergrund = null;
    const mit = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm", "kk", undefined, {
      kontext: diktatKontext(),
      imHintergrund: (arbeit) => {
        hintergrund = arbeit;
      },
    });
    const auftrag = JSON.parse(String(aufrufe[1]?.koerper ?? "{}"));
    pruefe("Datei-Weg: die Fachwoerter gehen als context mit", Array.isArray(auftrag.context?.terms) && auftrag.context.terms.includes("Himbi"));
    pruefe("Datei-Weg: Text kommt, bevor aufgeraeumt ist", mit.ok && hintergrund instanceof Promise);
    await hintergrund;
    pruefe("Datei-Weg: aufgeraeumt wird trotzdem (Auftrag und Datei)", aufrufe.filter((a) => a.methode === "DELETE").length === 2);

    aufrufe.length = 0;
    plan = [json({ id: "d" }), json({ id: "a" }), json({ status: "completed" }), json({ text: "  " }), json({}), json({})];
    const leer = await transkribiereMitSoniox(new Blob([new Uint8Array([1])]), "a.webm", "de");
    pruefe("Datei-Weg: nichts gehoert heisst 'leer', nicht 'Ausfall'", !leer.ok && leer.grund === "leer", leer.ok ? "" : leer.grund);
  } finally {
    globalThis.fetch = echtesFetch;
    if (umgebung.k === undefined) delete process.env.SONIOX_API_KEY; else process.env.SONIOX_API_KEY = umgebung.k;
    if (umgebung.u === undefined) delete process.env.SONIOX_API_URL; else process.env.SONIOX_API_URL = umgebung.u;
  }

  // Hat Soniox nichts gehoert, laeuft Whisper gar nicht erst los.
  let whisperGestartet = 0;
  const e = await erkenneMitRueckfall(
    async () => ({ ok: false, grund: GRUND_LEER }),
    async () => {
      whisperGestartet++;
      return { ok: true, text: "Untertitel der Amara.org-Gemeinschaft" };
    },
    () => {},
  );
  pruefe("Wettlauf: 'leer' von Soniox steht - kein Whisper, keine erfundenen Saetze", !e.ok && e.grund === GRUND_LEER && whisperGestartet === 0, JSON.stringify(e));
  pruefe("Whisper: typische Erfindung auf Stille wird erkannt", istWhisperErfindung("Untertitel der Amara.org-Gemeinschaft") && istWhisperErfindung("Продолжение следует...") && istWhisperErfindung("Thanks for watching!"));
  pruefe("Whisper: echte kurze Diktate bleiben", !istWhisperErfindung("Danke.") && !istWhisperErfindung("Vielen Dank für die Info") && !istWhisperErfindung("Спасибо"));
}

{
  // (j) Stimmen: Anbieter-Schalter mit Sokrates als Rueckfall.
  const umgebung = { a: process.env.KI_SPRACHAUSGABE_ANBIETER, s: process.env.SONIOX_TTS_STIMME, k: process.env.SONIOX_API_KEY, u: process.env.SONIOX_API_URL, t: process.env.SONIOX_TTS_URL, so: process.env.KI_SOKRATES_API_SCHLUESSEL };
  const echtesFetch = globalThis.fetch;
  try {
    delete process.env.KI_SPRACHAUSGABE_ANBIETER;
    delete process.env.SONIOX_TTS_STIMME;
    pruefe("Stimmen: ohne Schalter bleibt es bei Sokrates", JSON.stringify(stimmenFuer("de")) === JSON.stringify([STIMMEN.de]));
    process.env.KI_SPRACHAUSGABE_ANBIETER = "soniox";
    const kk = stimmenFuer("kk");
    pruefe("Stimmen: Soniox zuerst, Sokrates als Rueckfall", kk.length === 2 && kk[0].anbieter === "soniox" && kk[1].anbieter === "sokrates", JSON.stringify(kk));
    pruefe(
      "Stimmen: Soniox spricht, Sprache als Feld - Stimme je Sprache aus der Messreihe vom 25.09.2026",
      kk[0].stimme === SONIOX_STIMME_STANDARD_JE_SPRACHE.kk && kk[0].sprache === "kk" && stimmenFuer("ru")[0].stimme === SONIOX_STIMME_STANDARD,
    );
    process.env.SONIOX_TTS_STIMME = "Adrian";
    pruefe("Stimmen: SONIOX_TTS_STIMME waehlt die Stimme", stimmenFuer("de")[0].stimme === "Adrian");
    process.env.SONIOX_TTS_STIMME = "Adrian; rm -rf";
    pruefe("Stimmen: Unsinn in SONIOX_TTS_STIMME faellt auf die Voreinstellung der Sprache", stimmenFuer("de")[0].stimme === SONIOX_STIMME_STANDARD_JE_SPRACHE.de);
    pruefe("Stimmen: keine Sprache ohne Stimme erfunden", stimmenFuer("tr").length === 0);
    pruefe(
      "Zwischenspeicher: Soniox-Audio je Sprache getrennt (dieselbe Stimme, andere Sprache)",
      sprachausgabePfad("11111111-2222-4333-8444-555555555555", stimmenFuer("de")[0]) !== sprachausgabePfad("11111111-2222-4333-8444-555555555555", stimmenFuer("kk")[0]),
    );

    // Adresse der Soniox-Stimme: dieselbe Ableitung wie beim Live-Diktat.
    delete process.env.SONIOX_TTS_URL;
    process.env.SONIOX_API_URL = "https://api.eu.soniox.com";
    pruefe("Soniox-Stimme: EU-Adresse aus api.eu.soniox.com", sonioxTtsBasis() === "https://tts-rt.eu.soniox.com");
    process.env.SONIOX_TTS_URL = "https://tts.kz.example/";
    pruefe("Soniox-Stimme: SONIOX_TTS_URL gewinnt", sonioxTtsBasis() === "https://tts.kz.example");
    delete process.env.SONIOX_TTS_URL;

    // Soniox faellt aus -> Sokrates spricht.
    process.env.SONIOX_API_KEY = "testschluessel";
    process.env.KI_SOKRATES_API_SCHLUESSEL = "sokrates-test";
    process.env.SONIOX_TTS_STIMME = "Maya";
    const aufrufe = [];
    let sonioxAntwort = () => new Response("kaputt", { status: 500 });
    globalThis.fetch = async (url, init = {}) => {
      aufrufe.push({ url: String(url), init });
      if (String(url).includes("tts-rt")) return sonioxAntwort();
      return new Response(new Uint8Array([9, 9]), { status: 200, headers: { "content-type": "audio/mpeg" } });
    };
    const meldungen = [];
    const rueck = await erzeugeSprachausgabeMitRueckfall("Сәлем", stimmenFuer("kk"), (z) => meldungen.push(z));
    const sonioxAufruf = aufrufe.find((a) => a.url.includes("tts-rt"));
    const k = JSON.parse(sonioxAufruf?.init.body ?? "{}");
    pruefe("Soniox-Stimme: Anfrage an /tts mit Modell, Sprache, Stimme, MP3", sonioxAufruf?.url === "https://tts-rt.eu.soniox.com/tts" && k.model === SONIOX_TTS_MODELL && k.language === "kk" && k.voice === "Maya" && k.audio_format === "mp3" && k.text === "Сәлем", JSON.stringify(k));
    pruefe("Soniox-Stimme: mit dem Schluessel im Kopf, nicht im Koerper", sonioxAufruf?.init.headers?.Authorization === "Bearer testschluessel" && !sonioxAufruf.init.body.includes("testschluessel"));
    pruefe("Rueckfall: faellt Soniox aus, spricht Sokrates", rueck.ok && rueck.stimme.anbieter === "sokrates", rueck.ok ? rueck.stimme.anbieter : rueck.grund);
    pruefe("Rueckfall: und das steht im Protokoll", meldungen.some((z) => z.includes("soniox")));
    sonioxAntwort = () => new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    const gut = await erzeugeSprachausgabeMitRueckfall("Hallo", stimmenFuer("de"));
    pruefe("Soniox-Stimme: klappt es, spricht Soniox (MP3)", gut.ok && gut.stimme.anbieter === "soniox" && gut.typ === "audio/mpeg");
    pruefe("Soniox-Stimme: erzeugeSprachausgabe waehlt nach Anbieter", (await erzeugeSprachausgabe("Hallo", stimmenFuer("de")[0])).ok);
  } finally {
    globalThis.fetch = echtesFetch;
    for (const [name, wert] of [
      ["KI_SPRACHAUSGABE_ANBIETER", umgebung.a],
      ["SONIOX_TTS_STIMME", umgebung.s],
      ["SONIOX_API_KEY", umgebung.k],
      ["SONIOX_API_URL", umgebung.u],
      ["SONIOX_TTS_URL", umgebung.t],
      ["KI_SOKRATES_API_SCHLUESSEL", umgebung.so],
    ]) {
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  }

  const ttsRoute = readFileSync(new URL("../../src/app/api/ki-sprachausgabe/route.ts", import.meta.url), "utf8");
  pruefe("Vorlese-Route: beide Wege nutzen die Anbieterkette", (ttsRoute.match(/erzeugeSprachausgabeMitRueckfall\(zumSprechen\(/g) ?? []).length === 2);
  pruefe("Vorlese-Route: abgelegt wird nach der Antwort", ttsRoute.includes("after(async () =>"));
}

{
  // (k) Vorlesetext: was nie gesprochen werden soll, faellt weg.
  const t = textFuerSprachausgabe(
    "**Fazit: Die Schwelle ist erreicht.** [S1][S3]\n\n## Steuern\n\n- Frist: 15.10.2026 → Prüfung ✅\n1. Steuerberater kontaktieren\n15. März ist Stichtag\n\nQuelle: https://example.kz/doc zu ki_assistent und _kursiv_.",
  );
  pruefe("Vorlesetext: keine Belegmarken [S1]", !/\[S\d/.test(t), t);
  pruefe("Vorlesetext: keine nackte Adresse", !t.includes("https") && !t.includes("example.kz"));
  pruefe("Vorlesetext: keine Sternchen, Haken oder Pfeile", !/[*✅→]/.test(t), t);
  pruefe("Vorlesetext: Ueberschrift endet mit Doppelpunkt (leitet ein, kein eigener Satz)", t.includes("Steuern:\n") && !t.includes("Steuern.\n"), t);
  pruefe("Vorlesetext: nummerierte Liste ohne Nummer", t.includes("\nSteuerberater kontaktieren."), t);
  pruefe("Vorlesetext: ein Datum am Zeilenanfang bleibt stehen", t.includes("15. März ist Stichtag."), t);
  pruefe("Vorlesetext: Unterstrich in Kennungen bleibt", t.includes("ki_assistent") && t.includes("kursiv") && !t.includes("_kursiv_"), t);

  pruefe("Sprechfassung: ₸ auf Russisch", sprechfassung("5 000 000 ₸", "ru") === "5000000 тенге" && sprechfassung("1.150.000 ₸", "ru") === "1150000 тенге");
  pruefe("Sprechfassung: ₸ auf Kasachisch und Deutsch", sprechfassung("300₸", "kk") === "300 теңге" && sprechfassung("300 KZT", "de") === "300 Tenge");
  pruefe("Sprechfassung: Tausendertrennung mit zwei Gruppen wird eine Zahl", sprechfassung("1 150 000 kg", "ru") === "1150000 kg" && sprechfassung("1 150", "ru") === "1150");
  pruefe("Sprechfassung: Mehrdeutiges bleibt ('3.5', '20 000')", sprechfassung("3.5 und 20 000", "de") === "3.5 und 20 000");

  // (l) Zerleger Wort fuer Wort - so wie der Stream wirklich kommt.
  const wortweise = (text) => {
    const z = erzeugeSatzZerleger();
    const raus = [];
    for (const w of text.match(/\S+\s*/g)) raus.push(...z.fuettere(w));
    raus.push(...z.abschliessen());
    return raus.map((a) => a.text);
  };
  const de = wortweise(
    "**Fazit: Die Schwelle ist erreicht.**\n\nIhr Umsatz liegt über dem Grenzwert. Die Frist endet am 15. März 2026. Der Umsatz lag bei 1,2 Mio. Tenge. Bitte melden Sie sich bis dahin beim Finanzamt. Danach wird es teuer, z. B. durch Strafen. Wir prüfen das gern mit Ihnen gemeinsam in der nächsten Woche.",
  );
  pruefe("Zerleger: das fette Fazit ist der erste Abschnitt, als ganzer Satz", de[0] === "Fazit: Die Schwelle ist erreicht.", JSON.stringify(de[0]));
  pruefe("Zerleger: '15. März' bleibt zusammen", de.some((a) => a.includes("am 15. März 2026.")), JSON.stringify(de));
  pruefe("Zerleger: 'Mio.' ist kein Satzende", de.some((a) => a.includes("1,2 Mio. Tenge.")));
  pruefe("Zerleger: danach mehrere Saetze je Abschnitt, nicht jeder Satz allein", de.length <= 4 && de.slice(1, -1).every((a) => a.length >= ZWEITER_ABSCHNITT_ZEICHEN), JSON.stringify(de.map((a) => a.length)));
  const ru = wortweise("**Итого:** 5 млн. тг., т. е. больше порога, см. п. 3 ст. 82 НК РК. А. Серикбай уже подал заявление.");
  pruefe("Zerleger: russische Abkuerzungen zerreissen den Satz nicht", ru[0]?.endsWith("ст. 82 НК РК.") && ru[0].includes("т. е.") && ru[0].includes("см. п. 3"), JSON.stringify(ru));
  pruefe("Zerleger: kyrillische Initiale ist kein Satzende", ru.join(" ").includes("А. Серикбай уже") && !ru.some((a) => a === "А."), JSON.stringify(ru));
  const kk = wortweise("Құжаттар 2026 ж. 1 қаңтардан бастап талап етіледі, т.б. салықтар. Бұл маңызды.");
  pruefe("Zerleger: kasachische Abkuerzungen (ж., т.б.) ebenso", kk[0]?.includes("2026 ж. 1 қаңтардан") && kk[0].includes("т.б. салықтар."), JSON.stringify(kk));
  const liste = wortweise("## Nächste Schritte\n\n1. Steuerberater kontaktieren\n2. Unterlagen sammeln\n\nDas ist alles für heute.");
  pruefe("Zerleger: Zeilen ohne Satzzeichen sind Grenzen, kein Brei", liste[0]?.startsWith("Nächste Schritte") && liste.join(" ").includes("Steuerberater kontaktieren."), JSON.stringify(liste));

  // (m) 24.09.2026: ein Abschnitt, der an einem Zeilenende oder am Ende der Antwort aufhoert,
  //     bekommt ein Satzzeichen. Ohne Punkt las die Stimme das letzte Wort wie mitten im Satz
  //     und brach dort ab ("hackt am Wortende ab").
  pruefe("Zerleger: ein Abschnitt am Zeilenende endet mit Satzzeichen (Ueberschrift: Doppelpunkt)", liste[0] === "Nächste Schritte:", JSON.stringify(liste));
  const vorab = wortweise("Ich sehe mir Ihre Aufgaben an\n\nHeute stehen drei Dinge an.");
  pruefe("Zerleger: ein Vorab-Satz ohne Punkt (vor einem Werkzeug) wird als ganzer Satz gesprochen", vorab[0] === "Ich sehe mir Ihre Aufgaben an.", JSON.stringify(vorab));
  const ohneSchluss = wortweise("Heute ist alles erledigt. Morgen kommt die Lieferung aus Almaty");
  pruefe("Zerleger: der Rest am Ende der Antwort bekommt ein Satzzeichen", ohneSchluss.at(-1)?.endsWith("aus Almaty."), JSON.stringify(ohneSchluss));
  const fragend = wortweise("Soll ich Ihnen den Bereich zeigen?");
  pruefe("Zerleger: vorhandene Satzzeichen bleiben unveraendert", fragend[0] === "Soll ich Ihnen den Bereich zeigen?", JSON.stringify(fragend));
  const kommaSchnitt = wortweise(
    "Wenn Sie heute ins Büro kommen und die Lieferscheine der Woche sehen möchten, finden Sie diese in der Übersicht unter Wareneingang und Kühlkette der Anlage",
  );
  pruefe("Zerleger: ein Schnitt am Komma MITTEN im Satz bekommt keinen Punkt", kommaSchnitt[0]?.endsWith(",") && !kommaSchnitt[0].endsWith(".,"), JSON.stringify(kommaSchnitt));

  // (n) Vorlesen einer fertigen Antwort als Strom (GET): das <audio>-Element spielt, waehrend
  //     der Ton entsteht, statt auf die ganze Datei zu warten.
  const route = readFileSync(new URL("../../src/app/api/ki-sprachausgabe/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../../src/lib/ai/sprachausgabe-client.ts", import.meta.url), "utf8");
  const knopf = readFileSync(new URL("../../src/components/ki/sprachausgabe.tsx", import.meta.url), "utf8");
  pruefe("Strom: die Route hat GET mit denselben Pruefungen (zugang) wie POST", /export async function GET\(req: Request\) \{\s*const z = await zugang\(\);/.test(route) && /export async function POST\(req: Request\) \{\s*const z = await zugang\(\);/.test(route));
  pruefe("Strom: Zugang prueft Anmeldung, Berechtigung und Ratenbegrenzung", /async function zugang\(\)[\s\S]*?getSessionProfile\(\)[\s\S]*?hasPermission\(profil\.role, "ki_assistent", "create"\)[\s\S]*?ratenlimitUeberschritten\(/.test(route));
  pruefe("Strom: GET liest die Antwort wie POST ueber RLS (fertigeAntwort, createClient)", route.includes('return fertigeAntwort(adresse.searchParams.get("nachricht") ?? "", adresse.searchParams.get("sprache") ?? "de", true);') && /async function fertigeAntwort[\s\S]*?UUID\.test\(nachrichtId\)[\s\S]*?await createClient\(\)/.test(route));
  pruefe("Strom: GET nimmt nur Nachrichten-IDs, keinen freien Text", !/searchParams\.get\("text"\)/.test(route));
  pruefe("Strom: ein Zweig zum Hoerer, einer in den Zwischenspeicher (tee), nie im Browser behalten", route.includes("geoeffnet.strom.tee()") && route.includes('"cache-control": "no-store"'));
  pruefe("Strom: ein abgerissener Strom wird NICHT abgelegt", /catch \{\s*\/\/ Strom abgerissen[^\n]*\n\s*return;/.test(route));
  pruefe("Strom: Soniox und Sokrates teilen sich die Anfrage fuer Datei und Strom", (client.match(/await sonioxAnfrage\(/g) ?? []).length === 2 && (client.match(/await sokratesAnfrage\(/g) ?? []).length === 2);
  pruefe("Strom: Rueckfall auf den naechsten Anbieter nur, solange noch kein Ton floss", client.includes("export async function oeffneSprachausgabeStromMitRueckfall("));
  pruefe("Strom: der Knopf spielt die GET-Adresse und faellt bei Fehler auf die Datei zurueck", knopf.includes("audio.src = `/api/ki-sprachausgabe?nachricht=${encodeURIComponent(id)}") && knopf.includes('body: JSON.stringify({ nachrichtId: id, sprache: zielSprache })'));
  {
    const start = knopf.indexOf("async (id: string, antwortSprache?: string) => {");
    const erstesAwait = knopf.indexOf("await ", start);
    pruefe("Strom: das erste await im Knopf ist play() - vor jedem fetch (iPhone: Ton gehoert zur Geste)", start > 0 && knopf.startsWith("await audio.play();", erstesAwait) && erstesAwait < knopf.indexOf("await fetch(", start));
  }
}

// Strom mit echtem fetch-Ersatz: der Koerper kommt stueckweise, und das Ergebnis reicht ihn
// unveraendert weiter; faellt der erste Anbieter vor dem ersten Ton aus, uebernimmt der zweite.
{
  const alt = { fetch: globalThis.fetch, key: process.env.SONIOX_API_KEY, url: process.env.SONIOX_API_URL, sok: process.env.KI_SOKRATES_API_SCHLUESSEL };
  process.env.SONIOX_API_KEY = "test-schluessel";
  process.env.SONIOX_API_URL = "https://api.eu.soniox.com";
  process.env.KI_SOKRATES_API_SCHLUESSEL = "test-sokrates";
  const stueckStrom = (teile) =>
    new ReadableStream({
      start(c) {
        for (const t of teile) c.enqueue(new Uint8Array(t));
        c.close();
      },
    });
  const aufrufe = [];
  globalThis.fetch = async (adresse) => {
    aufrufe.push(String(adresse));
    if (String(adresse).includes("soniox")) return new Response("kaputt", { status: 500 });
    return new Response(stueckStrom([[1, 2], [3], [4, 5, 6]]), { status: 200, headers: { "content-type": "audio/mpeg" } });
  };
  try {
    const { oeffneSprachausgabeStromMitRueckfall } = await import("../../src/lib/ai/sprachausgabe-client.ts");
    const gemeldet = [];
    const ergebnis = await oeffneSprachausgabeStromMitRueckfall(
      "Hallo.",
      [
        { anbieter: "soniox", stimme: "Maya", sprache: "de" },
        { anbieter: "sokrates", stimme: "de-female", sprache: "de" },
      ],
      (z) => gemeldet.push(z),
    );
    pruefe("Strom: faellt Soniox vor dem ersten Ton aus, spricht Sokrates", ergebnis.ok && ergebnis.stimme.anbieter === "sokrates", JSON.stringify(ergebnis.ok ? ergebnis.stimme : ergebnis));
    pruefe("Strom: der Ausfall steht im Protokoll", gemeldet.length === 1 && gemeldet[0].includes("soniox"));
    if (ergebnis.ok) {
      const leser = ergebnis.strom.getReader();
      const bytes = [];
      let stuecke = 0;
      for (;;) {
        const { done, value } = await leser.read();
        if (done) break;
        stuecke++;
        bytes.push(...value);
      }
      pruefe("Strom: die Stuecke kommen einzeln und unveraendert an", stuecke === 3 && bytes.join(",") === "1,2,3,4,5,6", `${stuecke} Stuecke: ${bytes}`);
      pruefe("Strom: der Typ kommt vom Anbieter", ergebnis.typ === "audio/mpeg");
    }
    pruefe("Strom: Soniox wurde zuerst gefragt, dann Sokrates", aufrufe.length === 2 && aufrufe[0].includes("tts-rt.eu.soniox.com/tts") && aufrufe[1] === sprachausgabeUrl(), JSON.stringify(aufrufe));
  } finally {
    globalThis.fetch = alt.fetch;
    for (const [name, wert] of [["SONIOX_API_KEY", alt.key], ["SONIOX_API_URL", alt.url], ["KI_SOKRATES_API_SCHLUESSEL", alt.sok]]) {
      if (wert === undefined) delete process.env[name];
      else process.env[name] = wert;
    }
  }
}

// --- 16. Antwortsprache in allen vier Sprachen (24.09.2026) -------------------------
// Gemeldet: Oberflaeche russisch, die Tour laeuft, und die Zusammenfassung kommt auf
// Deutsch - im Bericht wie im Chat. Ursachen im Code (nicht in der Oberflaeche, die
// ist in allen vier Sprachen vollstaendig):
//   - Zeilen im deutschen Systemprompt VERLANGTEN Deutsch: 'Empfehlung: ...',
//     "mit deutscher Uebersetzung", ein deutscher Festsatz. Genau diese Zeilen gelten
//     fuer Compliance-Fragen, also auch fuer die Zusammenfassung nach der Tour.
//   - Die Sprachvorgabe der Berichts-Zusammenfassung stand mitten in einem deutschen Satz.
{
  const SPRACHEN_ALLE = ["de", "en", "ru", "kk"];
  const meldung = (sprache) => JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8"));

  // (a) Die Fragen der Tour-Knoepfe: in jeder Oberflaechensprache eine Frage in dieser
  //     Sprache - und die Antwortsprache folgt ihr, 4 x 4 Faelle.
  for (const ober of SPRACHEN_ALLE) {
    const nach = meldung(ober).pruefung.nachbereitung;
    for (const schluessel of ["frageStart", "fragePlan", "frageMassnahme", "frageHinweis"]) {
      const frage = nach[schluessel];
      const r = bestimmeAntwortsprache({ frage, oberflaeche: ober }, (t) => erkenneSprache(t, 10));
      pruefe(`Tour-Frage ${ober}.${schluessel}: die Antwort kommt in ${ober}`, r.sprache === ober && r.herkunft === "frage", `${r.sprache} (${r.herkunft})`);
    }
  }

  // (b) Die Oberflaeche selbst: nichts fehlt, nichts ist Deutsch in en/ru/kk.
  {
    const flach = (o, p = "") =>
      Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flach(v, p ? `${p}.${k}` : k) : typeof v === "string" ? [[p ? `${p}.${k}` : k, v]] : []));
    const de = Object.fromEntries(flach(meldung("de")));
    for (const ober of ["en", "ru", "kk"]) {
      const fremd = Object.fromEntries(flach(meldung(ober)));
      const fehlt = Object.keys(de).filter((k) => !(k in fremd));
      pruefe(`Oberflaeche ${ober}: kein Schluessel fehlt gegenueber Deutsch`, fehlt.length === 0, fehlt.slice(0, 3).join(", "));
      const deutsch = Object.entries(fremd).filter(
        ([k, v]) => /^(ceoUebersicht|pruefung|haustier|pruefungAblauf|complianceBericht|kiAssistentAnsicht)\./.test(k) && erkenneSprache(v, 25) === "de",
      );
      pruefe(`Oberflaeche ${ober}: in Tour, Bericht und Chat steht kein deutscher Text`, deutsch.length === 0, deutsch.slice(0, 2).map(([k]) => k).join(", "));
    }
  }

  // (c) Die Anweisungen: nur auf Deutsch duerfen sie Deutsch verlangen.
  {
    pruefe("Anweisung de: bleibt wie bisher ('Empfehlung: ...', deutsche Uebersetzung)", formatAnweisung("de").includes("'Empfehlung: ...'") && quellenAnweisung("de").includes("mit deutscher Übersetzung") && quellenAnweisung("de").includes("Dazu habe ich in der Wissensbasis keine Stelle gefunden"));
    for (const sprache of ["en", "ru", "kk"]) {
      const f = formatAnweisung(sprache);
      const q = quellenAnweisung(sprache);
      pruefe(`Anweisung ${sprache}: die Schlusszeile heisst '${EMPFEHLUNG[sprache]}', nicht 'Empfehlung'`, f.includes(`'${EMPFEHLUNG[sprache]}: ...'`) && !f.includes("'Empfehlung: ...'"));
      pruefe(`Anweisung ${sprache}: uebersetzt wird in die Antwortsprache, nicht ins Deutsche`, !q.includes("deutscher Übersetzung") && q.includes("nicht ins Deutsche"));
      pruefe(`Anweisung ${sprache}: der Festsatz 'keine Stelle gefunden' steht in ${sprache}`, q.includes(KEINE_STELLE[sprache]) && !q.includes("Dazu habe ich in der Wissensbasis"));
    }
    pruefe("Anweisung: vier Beschriftungen, vier Festsaetze, vier Erinnerungen - alle verschieden", [EMPFEHLUNG, KEINE_STELLE, ERINNERUNG].every((t) => new Set(SPRACHEN_ALLE.map((s) => t[s])).size === 4));
  }

  // (d) Der Hinweis an der Frage: in der Sprache der Antwort, nur in der Kopie fuers Modell.
  {
    for (const sprache of SPRACHEN_ALLE) {
      const original = [{ role: "user", parts: [{ type: "text", text: "Frage" }] }];
      const kopie = mitSprachErinnerung(original, sprache);
      const letzter = kopie.at(-1).parts.at(-1);
      pruefe(`Erinnerung ${sprache}: haengt an der Frage, in ${sprache}`, letzter.type === "text" && letzter.text.includes(ERINNERUNG[sprache]) && kopie.at(-1).parts.length === 2);
      pruefe(`Erinnerung ${sprache}: die Originalnachricht bleibt unveraendert`, original[0].parts.length === 1);
    }
    const freigabe = [{ role: "user", parts: [] }, { role: "assistant", parts: [{ type: "text", text: "x" }] }];
    pruefe("Erinnerung: eine Freigabe-Runde (letzte Nachricht vom Assistenten) bleibt, wie sie ist", JSON.stringify(mitSprachErinnerung(freigabe, "ru")) === JSON.stringify(freigabe));
  }

  // (e) Der erzeugte Text muss zur Sprache passen (Berichts-Zusammenfassung).
  {
    const text = {
      de: "Die Prüfungsreife liegt bei 72 von 100. Die größten Risiken sind die fehlende MwSt-Registrierung und die überfällige Kühlkettenprüfung.",
      en: "Audit readiness is 72 out of 100. The biggest risks are the missing VAT registration and the overdue cold chain inspection.",
      ru: "Готовность к проверке составляет 72 из 100. Наибольшие риски: отсутствие регистрации по НДС и просроченная проверка холодовой цепи.",
      kk: "Тексеруге дайындық 100-дің 72-сі. Ең үлкен тәуекелдер: ҚҚС тіркеуінің болмауы және суық тізбекті тексерудің мерзімі өтіп кетуі.",
    };
    const erk = (t) => erkenneSpracheEindeutig(t, 25);
    for (const gewuenscht of SPRACHEN_ALLE) {
      for (const vorhanden of SPRACHEN_ALLE) {
        const erwartet = gewuenscht === vorhanden || (["ru", "kk"].includes(gewuenscht) && ["ru", "kk"].includes(vorhanden));
        pruefe(`Sprachpruefung: verlangt ${gewuenscht}, Text ${vorhanden} -> ${erwartet ? "passt" : "verworfen"}`, sprachePasst(gewuenscht, text[vorhanden], erk) === erwartet);
      }
    }
    // Kurze deutsche Prioritaeten ohne Umlaut und ohne unterscheidende Woerter: erkenneSprache haette sie
    // als Englisch gezaehlt und einen deutschen Bericht faelschlich auf den Kennzahlentext zurueckgeworfen.
    for (const kurz of ["Lohnabrechnung fristgerecht abgeben", "Registrierung beantragen bald", "Steuerberater kontaktieren heute"]) {
      pruefe(`Sprachpruefung: kurzer deutscher Satz '${kurz}' passt zu Deutsch`, sprachePasst("de", kurz, erk) === true);
    }
    pruefe("Sprachpruefung: ein zu kurzer Text wird nie verworfen", sprachePasst("ru", "Ja.", erk) === true);
    pruefe("Sprachpruefung: eine unbekannte Sprache wird nie verworfen", sprachePasst("tr", text.de, erk) === true);
  }

  // (f) Verdrahtung.
  {
    const route = readFileSync(new URL("../../src/app/api/ki-assistent/route.ts", import.meta.url), "utf8");
    pruefe("Route: Format- und Quellenanweisung folgen der Antwortsprache", route.includes("formatAnweisung(antwortSprache)") && route.includes("quellenAnweisung(antwortSprache)"));
    pruefe("Route: keine feste deutsche Format- oder Quellenanweisung mehr", !route.includes("const FORMAT_ANWEISUNG") && !route.includes("const QUELLEN_ANWEISUNG"));
    pruefe("Route: der Sprachhinweis geht an die letzte Frage (nur fuers Modell)", route.includes("mitSprachErinnerung(schnappschuesseKuerzen(nachrichten), antwortSprache)"));
    const agenten = readFileSync(new URL("../../src/lib/pruefung/agenten.ts", import.meta.url), "utf8");
    pruefe("Bericht: die Sprachvorgabe der Zusammenfassung steht zuletzt, auf Englisch, mit hoechster Prioritaet", agenten.includes("LANGUAGE (highest priority, overrides everything above): Write the zusammenfassung"));
    pruefe("Bericht: eine Zusammenfassung in falscher Sprache wird verworfen und neu erzeugt", agenten.includes("sprachePasst(anfrage.sprache, t, erkenner)") && agenten.includes("nicht in der verlangten Sprache"));
    pruefe("Bericht: die Feldbeschreibungen tragen die verlangte Sprache", agenten.includes("sentences in ${sprache}") && agenten.includes("steps in ${sprache}"));
  }

  // (g) Diktat-Sprachen gehoeren nur zum Text aus dem Eingabefeld. Der Server zieht sie der Sprache der Frage
  //     vor - hingen sie an JEDER Frage, bekam die russische Tour-Frage nach einem deutschen Diktat eine deutsche
  //     Antwort.
  {
    const chat = readFileSync(new URL("../../src/components/ki/ki-chat.tsx", import.meta.url), "utf8");
    const sprache = readFileSync(new URL("../../src/components/ki/ki-chat-sprache.ts", import.meta.url), "utf8");
    pruefe("Diktat-Sprachen: nur Senden-Knopf und Enter geben 'aus dem Feld' an", (chat.match(/sende\(eingabe, true\)/g) ?? []).length === 2);
    pruefe("Diktat-Sprachen: Vorgabe und Vorschlag senden ohne 'aus dem Feld'", chat.includes("sende(vorgabe.text);") && chat.includes("sende(vorschlag)"));
    pruefe("Diktat-Sprachen: beginneZug gibt sie ohne ausFeld nicht heraus und verbraucht sie nicht", sprache.includes("function beginneZug(ausFeld = false, erzwingeVorlesen = false)") && /if \(!ausFeld\) \{[\s\S]*?return undefined;/.test(sprache));
  }

  // (h) Regression 24.09.2026: die Reparatur in (g) hat "nicht diktiert" und "nicht vorlesen"
  //     ueber dasselbe Flag entschieden und dabei die automatische Zusammenfassung nach der
  //     gefuehrten Tour (und jede Frage aus dem Pruefbericht) STUMM gemacht - vorher lief das
  //     nur zufaellig mit, wenn kurz zuvor diktiert worden war. Jetzt ein eigenes, verlaessliches
  //     Signal (erzwingeVorlesen), unabhaengig von Diktat und vom Schalter "Antworten vorlesen".
  {
    const chat = readFileSync(new URL("../../src/components/ki/ki-chat.tsx", import.meta.url), "utf8");
    const sprache = readFileSync(new URL("../../src/components/ki/ki-chat-sprache.ts", import.meta.url), "utf8");
    pruefe("Vorlesen erzwingen: die Tour-/Pruefbericht-Frage sendet mit erzwingeVorlesen=true", chat.includes("sende(anstoss.frage, false, true);"));
    pruefe("Vorlesen erzwingen: sende() reicht den dritten Parameter an beginneZug weiter", chat.includes("beginneZug(ausFeld, erzwingeVorlesen)"));
    // Seit dem Umbau vom 24.09.2026 stehen die Regeln in domain/vorlesen-zustand.ts und
    // beginneZug() ruft sie auf - geprueft wird hier das echte Verhalten, nicht ein Nachbau.
    pruefe(
      "Vorlesen erzwingen: beginneZug nimmt den Wunsch aus wunschFuerZug, mit und ohne ausFeld",
      sprache.includes("setZug({ wunsch: wunschFuerZug(false, erzwingeVorlesen, false), stumm: false });") &&
        sprache.includes("setZug({ wunsch: wunschFuerZug(true, erzwingeVorlesen, zuletztDiktiert.current), stumm: false });"),
    );
    pruefe("Vorlesen erzwingen: wirkt auch OHNE ausFeld (kein Diktat noetig)", wunschFuerZug(false, true, false) === "erzwungen");
    pruefe("Vorlesen erzwingen: gewinnt auch dann, wenn zuletzt NICHT diktiert wurde", wunschFuerZug(true, true, false) === "erzwungen");
    // Wird der Zug vorgelesen (offenes Panel, Einstellung aus, nicht gestoppt)?
    function testeBeginneZug(ausFeld, erzwingeVorlesen, zuletztDiktiertWert) {
      const zug = { wunsch: wunschFuerZug(ausFeld, erzwingeVorlesen, zuletztDiktiertWert), stumm: false };
      // Einstellung nie gesetzt (null) - der Normalfall, bevor jemand den Schalter anfasst.
      return vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: null, zug });
    }
    pruefe("Verhalten: Tour-Frage (ausFeld=false, erzwingeVorlesen=true) wird IMMER vorgelesen, auch ohne vorheriges Diktat", testeBeginneZug(false, true, false) === true);
    pruefe("Verhalten: eine normale Systemfrage (Vorschlag/Vorgabe, beides false) bleibt stumm", testeBeginneZug(false, false, false) === false);
    pruefe("Verhalten: ein echtes Diktat (ausFeld=true) wird weiterhin vorgelesen, auch ohne erzwingeVorlesen", testeBeginneZug(true, false, true) === true);
    pruefe("Verhalten: eine getippte Frage (ausFeld=true, nichts diktiert, nichts erzwungen) bleibt stumm", testeBeginneZug(true, false, false) === false);
    // Und die Serverseite: bei einer diktierten Frage gewinnt das Diktat, sonst die Frage - fuer alle 16 Kombinationen
    // aus Oberflaeche und Sprache der Frage gilt: ohne Diktat-Sprachen antwortet der Assistent in der Sprache der Frage.
    const fragen = { de: "Erkläre mir dieses Prüfergebnis: Was sind die wichtigsten Punkte und was sollte ich zuerst tun?", en: "Explain this audit result to me: what are the key points and what should I do first?", ru: "Объясни мне результат этой проверки: каковы главные пункты и что сделать в первую очередь?", kk: "Осы тексеру нәтижесін түсіндір: ең маңызды тармақтар қандай және алдымен не істеуім керек?" };
    let ok = 0;
    for (const ober of ["de", "en", "ru", "kk"]) {
      for (const [fragesprache, frage] of Object.entries(fragen)) {
        if (bestimmeAntwortsprache({ frage, oberflaeche: ober }, (t) => erkenneSprache(t, 10)).sprache === fragesprache) ok++;
      }
    }
    pruefe("Antwortsprache ohne Diktat: 16 von 16 Kombinationen aus Oberflaeche und Fragesprache antworten in der Sprache der Frage", ok === 16, `${ok}/16`);
    pruefe("Antwortsprache: ein (veraltetes) Diktat 'de' schlaegt die russische Frage - deshalb darf es nicht an fremden Fragen haengen", bestimmeAntwortsprache({ frage: fragen.ru, oberflaeche: "ru", diktatSprachen: ["de", "de"] }, (t) => erkenneSprache(t, 10)).sprache === "de");
  }
}

// --- 17. Sprachmodus (24.09.2026): Ablauf, Kugel-Platzierung, Prompt-Anweisungen ----
// Live-Gespraech ohne sichtbaren Chat: eine Kugel in der Mitte, die auf Stimme reagiert,
// und die Faehigkeit, selbst zu einem Bereich zu springen und ihn hervorzuheben - dabei
// rueckt die Kugel zur Seite, statt das Ziel zu verdecken.
{
  // (a) Ablauf: halbduplex, das Mikrofon nimmt nur auf, waehrend zugehoert wird.
  pruefe("Sprachmodus: aus -> starten -> startet", naechstePhase("aus", { art: "starten" }) === "startet");
  pruefe("Sprachmodus: startet -> Mikrofon bereit -> hoert", naechstePhase("startet", { art: "mikrofon-bereit" }) === "hoert");
  pruefe("Sprachmodus: hoert waehrend Aufnahme, sonst nicht", nimmtAuf("hoert") === true && nimmtAuf("denkt") === false && nimmtAuf("spricht") === false && nimmtAuf("startet") === false);
  {
    let p = "hoert";
    for (const [ereignis, erwartet] of [
      [{ art: "aeusserung-ende" }, "versteht"],
      [{ art: "frage-gestellt" }, "denkt"],
      [{ art: "antwort-spricht" }, "spricht"],
      [{ art: "antwort-fertig" }, "hoert"],
    ]) {
      p = naechstePhase(p, ereignis);
      pruefe(`Sprachmodus: Ablauf ${ereignis.art} -> ${erwartet}`, p === erwartet, p);
    }
  }
  pruefe("Sprachmodus: nichts gehoert fuehrt zurueck zum Zuhoeren, nicht zu einer Frage", naechstePhase("versteht", { art: "nichts-gehoert" }) === "hoert");
  pruefe("Sprachmodus: waehrend der Assistent dran ist (denkt/spricht), zaehlt assistentIstDran", assistentIstDran("denkt") === true && assistentIstDran("spricht") === true && assistentIstDran("hoert") === false && assistentIstDran("pausiert") === false);
  pruefe("Sprachmodus: ein Tipp waehrend des Sprechens unterbricht sofort zurueck zum Zuhoeren", naechstePhase("spricht", { art: "unterbrechen" }) === "hoert");
  pruefe("Sprachmodus: pausieren geht aus jeder aktiven Phase, fortsetzen fuehrt zum Zuhoeren", naechstePhase("hoert", { art: "pausieren" }) === "pausiert" && naechstePhase("spricht", { art: "pausieren" }) === "pausiert" && naechstePhase("pausiert", { art: "fortsetzen" }) === "hoert");
  pruefe("Sprachmodus: ein Fehler aus jeder Phase (ausser aus) fuehrt zu 'fehler'", naechstePhase("hoert", { art: "fehler" }) === "fehler" && naechstePhase("denkt", { art: "fehler" }) === "fehler" && naechstePhase("aus", { art: "fehler" }) === "aus");
  pruefe("Sprachmodus: beenden fuehrt aus jeder Phase zu 'aus'", ["hoert", "denkt", "spricht", "pausiert", "fehler", "versteht"].every((p) => naechstePhase(p, { art: "beenden" }) === "aus"));
  pruefe("Sprachmodus: ein unbekannter Uebergang aendert die Phase nicht", naechstePhase("hoert", { art: "beliebig-unbekannt" }) === "hoert");
  pruefe("Sprachmodus: antwortFertig nur ohne Beschaeftigung, Sprechen und Laden", antwortFertig({ beschaeftigt: false, spricht: false, laedt: false }) === true && antwortFertig({ beschaeftigt: false, spricht: false, laedt: true }) === false && antwortFertig({ beschaeftigt: true, spricht: false, laedt: false }) === false);

  // (b) Kugel-Platzierung: nie ueber dem Ziel, am weitesten davon entfernt, stabil bei
  //     unveraendertem Ziel (kein Herumspringen), notfalls die kleinste Ueberlappung.
  const fenster = { breite: 1440, hoehe: 900 };
  const blase = { breite: 96, hoehe: 96 };
  const raender = { oben: 64, rechts: 0, unten: 0, links: 0 };
  {
    const zielUntenRechts = { x: 1000, y: 600, breite: 380, hoehe: 250 };
    const { platz, rechteck } = besterPlatz(zielUntenRechts, fenster, blase, raender);
    const zielMitAbstand = { x: zielUntenRechts.x - 16, y: zielUntenRechts.y - 16, breite: zielUntenRechts.breite + 32, hoehe: zielUntenRechts.hoehe + 32 };
    const ueberlappt = rechteck.x < zielMitAbstand.x + zielMitAbstand.breite && rechteck.x + rechteck.breite > zielMitAbstand.x && rechteck.y < zielMitAbstand.y + zielMitAbstand.hoehe && rechteck.y + rechteck.hoehe > zielMitAbstand.y;
    pruefe("Kugel-Platz: kein Platz ueberlappt ein kleines Ziel", !ueberlappt, platz);
    pruefe("Kugel-Platz: bei einem Ziel unten rechts geht sie nach oben links", platz === "oben-links", platz);
  }
  {
    const zielObenLinks = { x: 20, y: 80, breite: 500, hoehe: 300 };
    const { platz } = besterPlatz(zielObenLinks, fenster, blase, raender);
    pruefe("Kugel-Platz: bei einem Ziel oben links geht sie nach unten rechts", platz === "unten-rechts", platz);
  }
  {
    // Randfall: das Ziel fuellt praktisch den ganzen Bildschirm - jeder Platz ueberlappt,
    // dann gewinnt die kleinste Ueberlappung statt ein Fehler oder eine feste Ecke.
    const riesig = { x: 0, y: 64, breite: fenster.breite, hoehe: fenster.hoehe - 64 };
    const { platz, rechteck } = besterPlatz(riesig, fenster, blase, raender);
    pruefe("Kugel-Platz: ueberlappt jeder Platz, wird trotzdem einer gewaehlt", PLAETZE.includes(platz), platz);
    pruefe("Kugel-Platz: das gewaehlte Rechteck liegt im Fenster", rechteck.x >= 0 && rechteck.y >= 0 && rechteck.x + rechteck.breite <= fenster.breite && rechteck.y + rechteck.hoehe <= fenster.hoehe);
  }
  {
    // Bleibt das Ziel gleich, bleibt die Kugel an ihrem Platz (kein staendiges Umsetzen).
    const ziel = { x: 300, y: 300, breite: 200, hoehe: 150 };
    const erster = besterPlatz(ziel, fenster, blase, raender);
    const zweiter = besterPlatz(ziel, fenster, blase, raender, 16, erster.platz);
    pruefe("Kugel-Platz: bei unveraendertem Ziel bleibt der Platz stabil", zweiter.platz === erster.platz);
  }
  {
    // Wechselt das Ziel so, dass es genau dort liegt, wo die Kugel gerade steht, wird ein
    // anderer Platz gewaehlt - unabhaengig davon, welche Ecke das im Einzelfall ist.
    const erstesZiel = { x: 1200, y: 700, breite: 100, hoehe: 80 };
    const { platz: altPlatz, rechteck: alteBlase } = besterPlatz(erstesZiel, fenster, blase, raender);
    const neuesZielAmPlatzDerBlase = { x: alteBlase.x - 20, y: alteBlase.y - 20, breite: alteBlase.breite + 40, hoehe: alteBlase.hoehe + 40 };
    const { platz: neuPlatz } = besterPlatz(neuesZielAmPlatzDerBlase, fenster, blase, raender, 16, altPlatz);
    pruefe("Kugel-Platz: ist der bisherige Platz jetzt belegt, wird ein anderer gewaehlt", neuPlatz !== altPlatz, `${altPlatz} -> ${neuPlatz}`);
  }

  // (c) Werkzeuge und Anweisungen des Sprachmodus.
  {
    const werkzeugeQuelle = readFileSync(new URL("../../src/lib/ai/ui-werkzeuge.ts", import.meta.url), "utf8");
    // Seit dem 25.09.2026 hat der Sprachmodus dieselben Rechte wie der sichtbare Chat:
    // es gibt nur noch 'lesen' und 'steuern', kein 'zeigen' mehr.
    pruefe("Sprachmodus-Werkzeuge: nur noch 'lesen' und 'steuern', Sprachmodus bekommt alles wie der Agent", werkzeugeQuelle.includes('if (stufe === "steuern") return { seiteLesen, klicke, fuelleFeld, scrolleZu, zeigeAuf };') && !werkzeugeQuelle.includes('stufe === "zeigen"'));
    const uiSteuerungQuelle = readFileSync(new URL("../../src/components/ki/ui-steuerung.ts", import.meta.url), "utf8");
    pruefe("Sprachmodus-Werkzeuge: Klicken und Ausfuellen sind nicht mehr gesperrt (kein nurZeigen)", !uiSteuerungQuelle.includes("nurZeigen"));
    const schrittQuelle = readFileSync(new URL("../../src/lib/ai/schritt-steuerung.ts", import.meta.url), "utf8");
    pruefe("Agent-Modus: der erste Schritt einer neuen Frage MUSS ein Werkzeug rufen", schrittQuelle.includes('if (e.modus === "agent") return { toolChoice: "required" };'));
    const routeQuelle = readFileSync(new URL("../../src/app/api/ki-assistent/route.ts", import.meta.url), "utf8");
    pruefe("Route: der Sprachmodus bekommt oberflaeche 'steuern' und die Aktionen wie der Agent", routeQuelle.includes('oberflaeche: modus === "assistent" ? "lesen" : "steuern"') && !routeQuelle.includes("nurLesen"));
    pruefe("Route: der Sprachmodus nutzt eine eigene, kuerzere Formatanweisung", routeQuelle.includes('modus === "sprache" ? sprachmodusFormatAnweisung(antwortSprache) : formatAnweisung(antwortSprache)'));
  }
  for (const sprache of ["de", "en", "ru", "kk"]) {
    const anweisung = sprachmodusFormatAnweisung(sprache);
    pruefe(`Sprachmodus-Anweisung ${sprache}: kein Markdown, kurze Saetze verlangt`, anweisung.includes("Kein Markdown") && anweisung.includes("höchstens vier Sätze"));
    pruefe(`Sprachmodus-Anweisung ${sprache}: darf handeln, kuendigt an, Freigabe laeuft muendlich`, !anweisung.includes("Ändere NIE etwas") && anweisung.includes("Du darfst auch handeln") && anweisung.includes("mündlichen Freigabe"));
  }
  pruefe("Sprachmodus-Fuehrung: Navigation, Hervorheben UND Handeln (Aktionswerkzeuge vor Formularen)", SPRACHMODUS_FUEHRUNG.includes("oeffneBereich") && SPRACHMODUS_FUEHRUNG.includes("zeigeAuf") && SPRACHMODUS_FUEHRUNG.includes("fuelleFeld") && SPRACHMODUS_FUEHRUNG.includes("aufgabeAnlegen"));
  pruefe("Sprachmodus-Oberflaeche: Klicken und Ausfuellen sind da, Freigabe laeuft muendlich", !SPRACHMODUS_OBERFLAECHE.includes("kannst du nicht") && SPRACHMODUS_OBERFLAECHE.includes("klicke") && SPRACHMODUS_OBERFLAECHE.includes("fuelleFeld") && SPRACHMODUS_OBERFLAECHE.includes("mündlichen Freigabe"));

  // (h) Freigabe im Sprachmodus: der Chat meldet die offene Karte an den Bus, der
  //     Sprachmodus zeigt sie und wertet "Ja"/"Nein" vor jeder neuen Frage aus.
  {
    const lies3 = (pfad) => readFileSync(new URL(`../../src/${pfad}`, import.meta.url), "utf8");
    const bus = lies3("components/ki/sprachmodus-bus.ts");
    const chat = lies3("components/ki/ki-chat.tsx");
    const modus = lies3("components/ki/sprachmodus.tsx");
    pruefe("Freigabe-Bus: derselbe Text zaehlt nicht als neue Anfrage", /if \(text === \(freigabeAnfrage\?\.text \?\? null\)\) \{[\s\S]{0,120}return;/.test(bus));
    pruefe("Freigabe-Bus: Entscheidung geht an genau die gemeldete Karte", bus.includes("freigabeEntscheider?.(erlaubt)"));
    pruefe("Freigabe: der Chat meldet Klick- UND Aktionskarte an den Bus", chat.includes("meldeFreigabeAnfrage(`${t(\"klick.titel\")}") && chat.includes("anstehendeAktion") && chat.includes("meldeFreigabeAnfrage(null, null)"));
    pruefe("Freigabe: der Sprachmodus wertet Ja/Nein VOR einer neuen Frage aus und stellt sie dann nicht", /leseFreigabeAnfrage\(\)\) \{[\s\S]{0,400}entscheideFreigabe\(istZusageBefehl\(ergebnis\.text\)\);[\s\S]{0,120}return;/.test(modus));
    pruefe("Freigabe: bei offener Karte lehnt 'Stopp' nur die Karte ab, beendet nicht den Sprachmodus", /else if \(istStoppBefehl\(ergebnis\.text\)\)/.test(modus));
    pruefe("Freigabe: die Karte im Sprachmodus geht ueber allem, auch ohne Untertitel", /const untertitel = freigabeAnfrage \? \(/.test(modus));
  }

  // (d) Kopfzeilenknopf und Layout-Verdrahtung: nur mit Werkzeugen UND eingeschaltetem Live-Diktat.
  {
    const layoutQuelle = readFileSync(new URL("../../src/app/[locale]/dashboard/layout.tsx", import.meta.url), "utf8");
    pruefe("Layout: sprachmodusMoeglich braucht Anthropic-Anbieter UND diktatLiveAn()", layoutQuelle.includes('sprachmodusMoeglich={aktiverAnbieter?.typ === "anthropic" && diktatLiveAn()}'));
    const topbarQuelle = readFileSync(new URL("../../src/components/dashboard/topbar.tsx", import.meta.url), "utf8");
    pruefe("Kopfzeile: der Sprachmodus-Knopf prueft verfuegbar UND sprachmodusMoeglich", topbarQuelle.includes("if (!verfuegbar || !sprachmodusMoeglich) return null;"));
  }
}

// --- 18. Sprachmodus als echtes Live-Gespraech (24.09.2026) ------------------------------
// Rueckmeldung nach dem ersten Test: kein Live-Gefuehl. Gefunden: (1) Vor dem ersten Werkzeug
// war Himbi stumm (toolChoice "required" erlaubt bei Anthropic keinen Satz davor), (2) ab der
// zweiten Aeusserung fehlte der Aufnahme der Dateikopf, (3) die Kugel bekam nie den Pegel der
// eigenen Stimme, (4) eine gescheiterte Live-Sitzung liess die Kugel endlos zuhoeren. Neu:
// Dazwischenreden wie im Gespraech.
{
  // (a) Erster Schritt: im Sprachmodus frei, damit ein Vorab-Satz sofort vorgelesen wird.
  const frage = { stepNumber: 0, neueNutzerFrage: true, frage: "Was muss ich heute im Büro machen?", wissenAngeboten: true };
  pruefe("Schritt: Sprachmodus erzwingt im ersten Schritt KEIN Werkzeug (Satz vor dem Werkzeug erlaubt)", waehleSchritt({ ...frage, modus: "sprache" }) === undefined);
  pruefe("Schritt: Agent-Modus erzwingt weiterhin ein Werkzeug", waehleSchritt({ ...frage, modus: "agent" })?.toolChoice === "required");
  pruefe("Schritt: Rechtsfrage im Sprachmodus bleibt bei der erzwungenen Wissenssuche", JSON.stringify(waehleSchritt({ ...frage, modus: "sprache", frage: "Ab wann muss ich mich für die Mehrwertsteuer registrieren?" })?.toolChoice) === JSON.stringify({ type: "tool", toolName: "wissenSuchen" }));
  pruefe("Schritt: Zweckentfremdung bleibt auch im Sprachmodus ohne Werkzeuge", waehleSchritt({ ...frage, modus: "sprache", ausserhalb: true })?.toolChoice === "none");
  for (const sprache of ["de", "en", "ru", "kk"]) {
    const anweisung = sprachmodusFormatAnweisung(sprache);
    pruefe(`Sprachmodus-Anweisung ${sprache}: kurzer Vorab-Satz vor dem Werkzeug, im selben Schritt`, anweisung.includes("höchstens acht Wörtern") && anweisung.includes("im selben Schritt das passende Werkzeug"));
    pruefe(`Sprachmodus-Anweisung ${sprache}: keine Antwort aus dem Gedächtnis, jedes Mal Werkzeuge`, anweisung.includes("rufe jedes Mal die Werkzeuge auf"));
  }

  // (b) Nach einem Abbruch der Live-Sitzung.
  const abbruch = (grund, dauerMs, gehoert, fehlversucheBisher = 0) => nachSitzungsAbbruch({ grund, dauerMs, gehoert, fehlversucheBisher });
  pruefe("Abbruch: Route sagt 404 (Live-Diktat aus) -> Meldung, kein Neuversuch", abbruch("schluessel-http-404", 200, false).weiter === "nicht-eingerichtet");
  pruefe("Abbruch: 401/403 ebenso", abbruch("schluessel-http-401", 200, false).weiter === "nicht-eingerichtet" && abbruch("schluessel-http-403", 200, false).weiter === "nicht-eingerichtet");
  pruefe("Abbruch: 429/500 sind voruebergehend -> neu verbinden", abbruch("schluessel-http-429", 200, false).weiter === "neu-versuchen" && abbruch("schluessel-http-500", 200, false).weiter === "neu-versuchen");
  pruefe("Abbruch: schneller Verbindungsfehler -> neu verbinden, zaehlt als Fehlversuch", JSON.stringify(abbruch("websocket-fehler", 300, false)) === JSON.stringify({ weiter: "neu-versuchen", fehlversuche: 1 }));
  pruefe(`Abbruch: nach ${MAX_NEUVERSUCHE} schnellen Fehlversuchen gibt er mit Meldung auf`, abbruch("websocket-fehler", 300, false, MAX_NEUVERSUCHE).weiter === "aufgeben");
  pruefe("Abbruch: lange Sitzung ohne Gehoertes (Zeitgrenze, niemand spricht) -> stumm schalten statt Stille zu senden", JSON.stringify(abbruch("websocket-geschlossen", LANGE_SITZUNG_MS + 1, false, 2)) === JSON.stringify({ weiter: "stumm", fehlversuche: 0 }));
  pruefe("Abbruch: lange Sitzung MIT Gehoertem -> neu verbinden, Zaehler von vorn", JSON.stringify(abbruch("websocket-geschlossen", LANGE_SITZUNG_MS + 1, true, 2)) === JSON.stringify({ weiter: "neu-versuchen", fehlversuche: 1 }));

  // (c) Dazwischenreden: Bildschleife mit 16 ms je Schritt nachgespielt.
  const spiele = (verlauf, einstellungen) => {
    const w = erzeugeUnterbrechungsWaechter(einstellungen);
    let t = 0;
    const urteile = [];
    for (const [mikrofon, ausgabe, ms] of verlauf) {
      for (let i = 0; i < ms; i += 16) {
        urteile.push(w.melde(mikrofon, ausgabe, t));
        t += 16;
      }
    }
    return urteile;
  };
  const d = UNTERBRECHEN_STANDARD.dauerMs;
  {
    // Himbi spricht laut (Ausgabe 0.2), das Mikrofon hoert nur gedaempftes Echo (0.06).
    const u = spiele([[0.002, 0, 300], [0.06, 0.2, 3000]]);
    pruefe("Dazwischenreden: Echo der eigenen Stimme unterbricht NICHT", !u.includes("unterbrechen"), u.at(-1));
  }
  {
    // Echo, dann spricht der Nutzer deutlich (0.2) ueber die Ausgabe hinweg.
    const u = spiele([[0.002, 0, 300], [0.06, 0.2, 1000], [0.2, 0.2, d + 200]]);
    pruefe("Dazwischenreden: deutliche Stimme ueber der Ausgabe unterbricht", u.includes("unterbrechen"));
    const erstes = u.indexOf("unterbrechen");
    const beginn = Math.ceil(300 / 16) + Math.ceil(1000 / 16);
    pruefe("Dazwischenreden: erst nach durchgehender Sprache von dauerMs, nicht sofort", (erstes - beginn) * 16 >= d - 16, `${(erstes - beginn) * 16} ms`);
    pruefe("Dazwischenreden: davor 'vielleicht' (Zeit fuer den Vorlauf der Aufnahme)", u.slice(beginn, erstes).every((x) => x === "vielleicht") && erstes > beginn);
  }
  {
    // Ein kurzer Knall (Tuer, Husten) von 150 ms reicht nicht.
    const u = spiele([[0.002, 0, 300], [0.3, 0.1, 150], [0.01, 0.1, 1000]]);
    pruefe("Dazwischenreden: ein kurzer Knall unterbricht nicht", !u.includes("unterbrechen"));
    pruefe("Dazwischenreden: nach dem Knall wieder 'still' (Vorlauf wird verworfen)", u.at(-1) === "still");
  }
  {
    // Nachhall: die Ausgabe verstummt kurz zwischen zwei Saetzen, das Echo klingt im Raum nach.
    const u = spiele([[0.002, 0, 300], [0.08, 0.2, 1000], [0.07, 0, 200], [0.06, 0.2, 1000]]);
    pruefe("Dazwischenreden: Nachhall in einer Satzpause unterbricht nicht", !u.includes("unterbrechen"));
  }
  {
    // Lauter Hof: Grundrauschen 0.05, gemessen in einer Ausgabepause. Gleich lautes Geraeusch
    // waehrend Himbi spricht, ist kein Dazwischenreden, deutlich lautere Sprache schon.
    const laerm = spiele([[0.05, 0, 400], [0.06, 0.05, 2000]]);
    pruefe("Dazwischenreden: Laerm in Hoehe des Grundrauschens unterbricht nicht", !laerm.includes("unterbrechen"));
    const stimme = spiele([[0.05, 0, 400], [0.25, 0.05, d + 200]]);
    pruefe("Dazwischenreden: Sprache deutlich ueber dem Laerm unterbricht", stimme.includes("unterbrechen"));
  }
  {
    // Silbenluecken: 100 ms Sprache, 40 ms Pause im Wechsel - der leckende Zaehler traegt das.
    const silben = [];
    for (let i = 0; i < 12; i++) silben.push([0.2, 0.1, 96], [0.01, 0.1, 32]);
    const u = spiele([[0.002, 0, 300], ...silben]);
    pruefe("Dazwischenreden: normale Sprache mit Silbenluecken unterbricht trotzdem", u.includes("unterbrechen"));
  }

  // (d) Verdrahtung im Browser (Quelltext, die Bausteine laufen nur im Browser).
  const modus = readFileSync(new URL("../../src/components/ki/sprachmodus.tsx", import.meta.url), "utf8");
  const live = readFileSync(new URL("../../src/components/ki/diktat-live.ts", import.meta.url), "utf8");
  const hoeren = readFileSync(new URL("../../src/lib/hoeren.ts", import.meta.url), "utf8");
  pruefe("Aufnahme: je Aeusserung ein neuer MediaRecorder (erstes Stueck = Dateikopf)", modus.includes("const recorder = new MediaRecorder(strom);") && /const beginneAeusserung = useCallback\(\(\) => \{[\s\S]*?const aufnahme = starteAufnahme\(\);/.test(modus));
  pruefe("Aufnahme: kein pause()/resume() eines Recorders fuer die ganze Sitzung mehr", !/recorder\.(pause|resume)\(\)/.test(modus));
  pruefe("Aufnahme: das letzte Stueck geht vor dem Ende-Zeichen an die Sitzung", /schliesseAufnahme\(\)\s*\.then\([^)]*\): Promise<LiveErgebnis> \| LiveErgebnis => \(sitzung \? sitzung\.beende\(\)/.test(modus));
  pruefe("Aufnahme: Mikrofonstrom bleibt fuer die ganze Sitzung offen (iOS-Audiosession)", (modus.match(/getUserMedia\(/g) ?? []).length === 1 && modus.includes("stromRef.current?.getTracks().forEach((s) => s.stop());"));
  pruefe("Kugel: bekommt den Pegel der eigenen Stimme (starteHoeren) und gibt ihn wieder frei", modus.includes("starteHoeren(strom);") && modus.includes("stoppeHoeren();"));
  pruefe("Echo: im Gespraech mit Echounterdrueckung, sonst wie beim Diktat", modus.includes("const GESPRAECH_AUFNAHME: MediaTrackConstraints = { ...AUFNAHME_VORGABEN, echoCancellation: true };") && modus.includes("getUserMedia({ audio: GESPRAECH_AUFNAHME })"));
  pruefe("Abbruch: der Sprachmodus hoert auf das Scheitern der Sitzung", modus.includes("beiScheitern: (grund) => {") && modus.includes("nachSitzungsAbbruch({"));
  pruefe("Abbruch: diktat-live meldet ein Scheitern nur vor beende()/abbrechen()", live.includes("if (!beendet) beiScheitern?.(grund);") && /abbrechen\(\) \{\s*beendet = true;/.test(live));
  pruefe("Dazwischenreden: nur waehrend Himbi spricht, mit Mikrofon- und Ausgabepegel", /if \(phase !== "spricht"\) return;\s*const waechter = erzeugeUnterbrechungsWaechter\(\);/.test(modus) && modus.includes("waechter.melde(leseLautstaerke(), leseAusgabePegel(), performance.now())"));
  pruefe("Dazwischenreden: Vorlauf ohne Unterbrechung wird verworfen (kein Echo als Frage)", modus.includes("if (!unterbrochen && aufnahmeRef.current && !aufnahmeRef.current.sitzung) verwirfAufnahme();"));
  pruefe("Lautstaerke: RMS auf der Skala des Diktats (pegelAusZeitbereich)", hoeren.includes("lautstaerke = pegelAusZeitbereich(zeitRoh);") && hoeren.includes("export function leseLautstaerke(): number"));
  pruefe("Komponente: keine abgeschaltete Hook-Pruefung mehr", !modus.includes("eslint-disable"));

  // (e) Texte in allen vier Sprachen.
  for (const sprache of ["de", "en", "ru", "kk"]) {
    const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8")).kiAssistentAnsicht.sprachmodus;
    pruefe(`Texte ${sprache}: liveFehlt, verbindungFehlt, erneut vorhanden`, ["liveFehlt", "verbindungFehlt", "erneut"].every((k) => typeof texte[k] === "string" && texte[k].length > 3), JSON.stringify(Object.keys(texte)));
  }
}

// --- 19. Vorlesen als Strom, eine Vorlese-Instanz, Einstieg Sprachmodus (24.09.2026) -------
// Rueckmeldung: (1) Vorlesen der Zusammenfassung erst 5 s nach Beginn des Schreibens,
// (2) kein Schalter fuer den Sprachmodus gefunden, (3) automatisches Vorlesen nicht
// abschaltbar und nicht mit der Vorlesefunktion verbunden, (4) Deutsch zu langsam, zu lange
// Pausen - alle Sprachen pruefen. Ursache fuer (1) und (4): Soniox erzeugt etwa in
// Echtzeit, und jeder Abschnitt wartete auf seine ganze Datei.
{
  // (a) Protokoll des Soniox-TTS-WebSockets (domain/sprachausgabe-strom.ts).
  pruefe("Strom: Adresse aus SONIOX_API_URL, Region bleibt (eu)", sonioxTtsWsAdresse("https://api.eu.soniox.com") === "wss://tts-rt.eu.soniox.com/tts-websocket");
  pruefe("Strom: Adresse ohne Region (US)", sonioxTtsWsAdresse("https://api.soniox.com") === "wss://tts-rt.soniox.com/tts-websocket");
  pruefe("Strom: ausdrueckliche Adresse nur mit wss://", sonioxTtsWsAdresse(null, "wss://x.example/tts") === "wss://x.example/tts" && sonioxTtsWsAdresse(null, "http://x") === null);
  pruefe("Strom: keine Adresse ohne api.-Host", sonioxTtsWsAdresse("https://soniox.com") === null && sonioxTtsWsAdresse(undefined) === null);
  const start = startNachricht("k", "s1", { model: "tts-rt-v2", language: "de", voice: "Maya", audio_format: "pcm_s16le", sample_rate: 24000, speed: 1.1, reduce_silence: true });
  pruefe("Strom: Startnachricht mit Schluessel, stream_id und Konfiguration", start.api_key === "k" && start.stream_id === "s1" && start.voice === "Maya" && start.speed === 1.1 && start.reduce_silence === true && start.audio_format === "pcm_s16le");
  pruefe("Strom: jedes Textstueck endet mit genau einem Leerzeichen (sonst 'Satz.Naechster')", textNachricht("s1", "Hallo.").text === "Hallo. " && textNachricht("s1", "Hallo.  \n").text === "Hallo. " && textNachricht("s1", "x").text_end === false);
  pruefe("Strom: Ende und Abbruch", endeNachricht("s1").text_end === true && endeNachricht("s1").text === "" && abbruchNachricht("s1").cancel === true);
  pruefe("Strom: Audio mit audio_end gemeinsam", JSON.stringify(leseStromNachricht({ stream_id: "s1", audio: "AAA=", audio_end: true })) === JSON.stringify({ art: "audio", stream: "s1", audio: "AAA=", ende: true }));
  pruefe("Strom: terminated", leseStromNachricht({ stream_id: "s1", terminated: true }).art === "beendet");
  pruefe("Strom: audio_end allein", leseStromNachricht({ stream_id: "s1", audio_end: true }).art === "audio-ende");
  const fehlerNachricht = leseStromNachricht({ stream_id: "s1", error_code: 400, error_type: "invalid_request", error_message: "Model does not support silence reduction." });
  pruefe("Strom: Fehler wird gelesen", fehlerNachricht.art === "fehler" && fehlerNachricht.code === 400 && fehlerNachricht.stream === "s1");
  pruefe("Strom: unbekanntes ohne stream_id", leseStromNachricht({ foo: 1 }).art === "unbekannt" && leseStromNachricht(null).art === "unbekannt");
  pruefe("Strom-Fehler: Pausenkuerzung abgelehnt -> ohne sie noch einmal", folgeAufFehler({ code: 400, typ: "invalid_request", text: "Model does not support silence reduction." }) === "ohne-stillekuerzung");
  pruefe("Strom-Fehler: 401/403 -> neuer Schluessel", folgeAufFehler({ code: 401, typ: "", text: "" }) === "neuer-schluessel" && folgeAufFehler({ code: 403, typ: "temp_api_key_session_expired", text: "" }) === "neuer-schluessel");
  pruefe("Strom-Fehler: 408 und 413 sind kein Fehler, sondern Strom-Ende", folgeAufFehler({ code: 408, typ: "request_timeout", text: "" }) === "neuer-strom" && folgeAufFehler({ code: 413, typ: "max_audio_duration_reached", text: "" }) === "neuer-strom");
  pruefe("Strom-Fehler: 402/429/500/sonstiger 400 -> aufgeben (Abschnitts-Weg uebernimmt)", ["402", "429", "500"].every((c) => folgeAufFehler({ code: Number(c), typ: "", text: "" }) === "aufgeben") && folgeAufFehler({ code: 400, typ: "invalid_request", text: "bad voice" }) === "aufgeben");
  pruefe("Strom: neuer Strom erst, wenn die 2-Minuten-Grenze naht (nie fuer einen leeren)", !brauchtNeuenStrom(0, 5000) && !brauchtNeuenStrom(100, 200) && brauchtNeuenStrom(STROM_HOECHSTENS_ZEICHEN - 10, 20));
  pruefe("Strom: Schluessel mit Reserve", schluesselNochGut(60_000, 0) && schluesselNochGut(20_000, 0) && !schluesselNochGut(8_000, 0));
  pruefe("Strom: base64 -> Bytes", Array.from(base64ZuBytes("AAH/")).join(",") === "0,1,255");
  {
    // 0x0000, 0x7fff, 0x8000 (= -32768), 0xffff (= -1)
    const { werte, rest } = pcmZuFloat(new Uint8Array([0, 0, 0xff, 0x7f, 0x00, 0x80, 0xff, 0xff]), null);
    pruefe("PCM: s16le -> Float, Vorzeichen richtig", werte.length === 4 && werte[0] === 0 && Math.abs(werte[1] - 32767 / 32768) < 1e-9 && werte[2] === -1 && Math.abs(werte[3] + 1 / 32768) < 1e-9 && rest === null);
    // Ein Stueck endet auf einem halben Sample: das Byte wandert ins naechste.
    const a = pcmZuFloat(new Uint8Array([0x00, 0x80, 0xff]), null);
    const b = pcmZuFloat(new Uint8Array([0x7f]), a.rest);
    pruefe("PCM: halbes Sample am Stueckende wird ins naechste Stueck getragen", a.werte.length === 1 && a.rest === 0xff && b.werte.length === 1 && Math.abs(b.werte[0] - 32767 / 32768) < 1e-9 && b.rest === null);
  }
  pruefe("Strom: naechstes Stueck direkt hinter dem vorigen", naechsterStart(5.2, 5.0) === 5.2);
  pruefe("Strom: Zeitachse abgelaufen -> Vorlauf ab jetzt (Voreinstellung 0,25 s)", Math.abs(naechsterStart(4.0, 5.0) - 5.25) < 1e-9 && Math.abs(naechsterStart(0, 0) - 0.25) < 1e-9 && Math.abs(naechsterStart(4.0, 5.0, 0.5) - 5.5) < 1e-9);
  pruefe("Strom: nach jedem Aussetzer doppelter Vorlauf, hoechstens 1 s", naechsterVorlauf(0.25) === 0.5 && naechsterVorlauf(0.5) === 1 && naechsterVorlauf(1) === 1);
  pruefe("Strom: Zeichengrenze folgt dem Tempo (2-Minuten-Grenze auch bei 0,7)", zeichenGrenze(1.1) === 1300 && zeichenGrenze(0.7) === 827 && zeichenGrenze(undefined) === 1300 && brauchtNeuenStrom(800, 50, 0.7) && !brauchtNeuenStrom(800, 50, 1.1));
  pruefe(
    "Strom: ungesprochene Texte aus der Tondauer geschaetzt (angefangene zaehlen als ungesprochen)",
    ungesprocheneTexte(["a".repeat(70), "b".repeat(70), "c".repeat(70)], 0, 1) === 3 &&
      ungesprocheneTexte(["a".repeat(70), "b".repeat(70), "c".repeat(70)], 5, 1) === 2 &&
      ungesprocheneTexte(["a".repeat(70), "b".repeat(70), "c".repeat(70)], 6, 1) === 2 &&
      ungesprocheneTexte(["a".repeat(70), "b".repeat(70), "c".repeat(70)], 10, 1) === 1 &&
      ungesprocheneTexte(["a".repeat(70), "b".repeat(70), "c".repeat(70)], 20, 1) === 0,
  );

  // (b) Die Regeln des Vorlesens (domain/vorlesen-zustand.ts) - Punkt 3 der Rueckmeldung.
  //     Einstellung: true (an), false (ausdruecklich aus), null (nie eingestellt).
  const zug = (wunsch, stumm = false) => ({ wunsch, stumm });
  pruefe("Vorlesen: Tour-Zusammenfassung (erzwungen) wird vorgelesen, solange niemand 'aus' gesagt hat", vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: null, zug: zug("erzwungen") }));
  pruefe("Vorlesen: ausdruecklich 'aus' gilt auch fuer die Tour-Zusammenfassung und diktierte Fragen", !vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: false, zug: zug("erzwungen") }) && !vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: false, zug: zug("diktiert") }));
  pruefe("Vorlesen: nach einem Stopp wird derselbe Zug NICHT weiter vorgelesen", !vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: true, zug: zug("erzwungen", true) }));
  pruefe("Vorlesen: Panel zu heisst still", !vorlesenErlaubt({ sprachmodus: false, offen: false, einstellung: true, zug: zug("erzwungen") }));
  pruefe("Vorlesen: im Sprachmodus immer, auch mit Einstellung aus", vorlesenErlaubt({ sprachmodus: true, offen: false, einstellung: false, zug: zug("normal") }));
  pruefe("Vorlesen: im Sprachmodus wirkt ein Stopp (Tipp auf die Kugel) auf den laufenden Zug", !vorlesenErlaubt({ sprachmodus: true, offen: false, einstellung: true, zug: zug("normal", true) }));
  pruefe("Vorlesen: getippte Frage ohne Einstellung bleibt stumm", !vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: null, zug: zug("normal") }) && !vorlesenErlaubt({ sprachmodus: false, offen: true, einstellung: false, zug: zug("normal") }));
  pruefe("Vorlesen: Wunsch - erzwungen schlaegt alles, diktiert nur aus dem Feld", wunschFuerZug(false, true, false) === "erzwungen" && wunschFuerZug(true, false, true) === "diktiert" && wunschFuerZug(false, false, true) === "normal" && wunschFuerZug(true, false, false) === "normal");
  pruefe("Schalter: zeigt AN, waehrend die Zusammenfassung entsteht (nie eingestellt)", schalterZeigtAn({ einstellung: null, phase: "still", beschaeftigt: true, zug: zug("erzwungen") }));
  pruefe("Schalter: zeigt AUS waehrend der Zusammenfassung, wenn ausdruecklich 'aus'", !schalterZeigtAn({ einstellung: false, phase: "still", beschaeftigt: true, zug: zug("erzwungen") }));
  pruefe("Schalter: zeigt AN, solange irgendetwas vorliest", schalterZeigtAn({ einstellung: false, phase: "spricht", beschaeftigt: false, zug: zug("normal", true) }) && schalterZeigtAn({ einstellung: null, phase: "laedt", beschaeftigt: false, zug: zug("normal") }));
  pruefe("Schalter: zeigt AUS nach dem Stopp, wenn die Einstellung nicht an ist", !schalterZeigtAn({ einstellung: null, phase: "still", beschaeftigt: true, zug: zug("erzwungen", true) }));
  {
    const nachKlick = nachSchalterKlick({ anGezeigt: true, beschaeftigt: true, phase: "spricht", zug: zug("erzwungen"), hatAbschnitte: true });
    pruefe("Schalter-Klick waehrend der Zusammenfassung: sofort still, Zug stumm, Einstellung bleibt AUS (nicht mehr dauerhaft an)", nachKlick.stoppen && nachKlick.zug.stumm && nachKlick.einstellung === false && !nachKlick.vonVorn);
    const ein = nachSchalterKlick({ anGezeigt: false, beschaeftigt: true, phase: "still", zug: zug("normal", true), hatAbschnitte: true });
    pruefe("Schalter-Klick mitten in einer Antwort (aus -> an): Einstellung an, von vorn vorlesen", ein.einstellung && !ein.zug.stumm && ein.vonVorn && !ein.stoppen);
    const fertig = nachSchalterKlick({ anGezeigt: false, beschaeftigt: false, phase: "still", zug: zug("normal"), hatAbschnitte: true });
    pruefe("Schalter-Klick nach einer fertigen Antwort: nur Einstellung an, nichts wird nachgeholt", fertig.einstellung && !fertig.vonVorn);
  }

  // (c) Textaufbereitung in allen vier Sprachen (Punkt 4): weniger kuenstliche Pausen.
  const tabelle = { de: ["Bereich", "Status", "Steuern", "offen"], en: ["Area", "Status", "Tax", "open"], ru: ["Раздел", "Статус", "Налоги", "открыто"], kk: ["Бөлім", "Мәртебе", "Салық", "ашық"] };
  for (const [sprache, [k1, k2, z1, z2]] of Object.entries(tabelle)) {
    const t = textFuerSprachausgabe(`## ${k1}\n\n| ${k1} | ${k2} |\n|---|---|\n| ${z1} | ${z2} |\n| ${z1}2 | - |`);
    // Die letzte Zeile bleibt in textFuerSprachausgabe offen (im Stream kann sie ein Satzanfang sein).
    pruefe(`Vorlesetext ${sprache}: Tabelle ohne Kopfzeile, Zeile als 'Zelle: Zelle', Strich-Zellen fallen weg`, t.includes(`${z1}: ${z2}.`) && !t.includes(`${k1}, ${k2}`) && t.endsWith(`\n${z1}2`), JSON.stringify(t));
    pruefe(`Vorlesetext ${sprache}: Ueberschrift mit Doppelpunkt`, t.startsWith(`${k1}:`), JSON.stringify(t));
  }
  pruefe("Vorlesetext: lange Kennungen fallen weg (wurden Zeichen fuer Zeichen gelesen)", textFuerSprachausgabe("Charge CH-T-N-A-01-2609201616-40A7 ist gesperrt.") === "Charge ist gesperrt.");
  pruefe("Vorlesetext: kurze Bindestrichwoerter bleiben (IT-Test, Test-Manager, 2026-09-24 bleibt ein Datum)", textFuerSprachausgabe("IT-Test und Test-Manager am 2026-09-24.") === "IT-Test und Test-Manager am 2026-09-24.");
  pruefe("Vorlesetext: Grossbuchstabenwoerter ab 5 Buchstaben normal (KRITISCH, СРОЧНО), Abkuerzungen bleiben (HACCP, ЭСФ, GmbH)", textFuerSprachausgabe("KRITISCH: СРОЧНО HACCP ЭСФ GmbH ТОО") === "Kritisch: Срочно HACCP ЭСФ GmbH ТОО");
  pruefe("Sprechfassung: Zeilenumbrueche werden Leerzeichen (keine Absatzpausen)", sprechfassung("Erster Satz.\nZweiter Satz.", "de") === "Erster Satz. Zweiter Satz.");
  pruefe("Sprechfassung: ≈ und ~ vor Zahlen je Sprache", sprechfassung("≈ 3 Wochen", "de") === "etwa 3 Wochen" && sprechfassung("~5 dni", "ru") === "около 5 dni" && sprechfassung("≈3", "kk") === "шамамен 3" && sprechfassung("≈ 3", "en") === "about 3");
  {
    const wortweiseZ = (text, stil) => {
      const z = erzeugeSatzZerleger(stil);
      const raus = [];
      for (const w of text.match(/\S+\s*/g)) raus.push(...z.fuettere(w));
      raus.push(...z.abschliessen());
      return raus.map((a) => a.text);
    };
    for (const [fall, text, zusammen] of [
      ["z. B. mitten im Satz", "Das gilt z. B. für die Kühlkette und die Lieferscheine der ganzen letzten Woche im Lager. Danach ist Schluss.", "z. B. für"],
      ["u. U. am Satzanfang", "Das Lager ist voll. U. U. muss die Ware heute raus, bevor die Kühlkette reisst. Das klären wir morgen.", "U. U. muss"],
      ["i. d. R. dreiteilig", "Das dauert i. d. R. zwei Tage, bis die Ware geprüft und verpackt ist. So ist es.", "i. d. R. zwei"],
    ]) {
      for (const stil of ["saetze", "abschnitte"]) {
        const teile = wortweiseZ(text, stil);
        pruefe(`Zerleger (${stil}): '${fall}' wird nicht zerrissen`, teile.some((t) => t.includes(zusammen)) && !teile.some((t) => /(^|\s)\p{L}\.$/u.test(t)), JSON.stringify(teile));
      }
    }
    const lang = ("Das ist ein Satz mit ausreichend vielen Woertern fuer die Grenze. ").repeat(60);
    const alle = wortweiseZ(lang, "abschnitte");
    pruefe("Zerleger: an der Obergrenze endet der letzte Abschnitt am Satzende, nicht mitten im Wort", alle.at(-1).endsWith("Grenze.") && alle.join(" ").length <= MAX_SPRACHAUSGABE_ZEICHEN + alle.length, JSON.stringify(alle.at(-1).slice(-40)));
    const drei = "Erster Satz hier ist schon lang genug fuer sich allein, ganz sicher. Zweiter Satz folgt jetzt sofort mit etwas mehr Text als der erste. Dritter Satz schliesst die kleine Antwort dann auch noch sauber ab.";
    const satzweise = wortweiseZ(drei, "saetze");
    pruefe("Zerleger-Stil 'saetze': jeder Satz ab 60 Zeichen sofort (fuer den Strom)", satzweise.length === 3, JSON.stringify(satzweise));
    const kurz = wortweiseZ("Erster Satz hier ist schon lang genug fuer sich allein, ganz sicher. Ja. Gut so. Und noch ein Satz, der das Ganze abschliesst.", "saetze");
    pruefe("Zerleger-Stil 'saetze': ganz kurze Saetze werden zusammengefasst", kurz.length === 2 && kurz[1].startsWith("Ja. Gut so."), JSON.stringify(kurz));
    const abschnittsweise = wortweiseZ(drei, "abschnitte");
    pruefe("Zerleger-Stil 'abschnitte': laengere Stuecke (Rueckfall mit einzelnen Anfragen)", abschnittsweise.length === 2, JSON.stringify(abschnittsweise));
    const z = erzeugeSatzZerleger();
    const raus = [...z.fuettere("Ich schaue in Ihre heutigen Aufgaben")];
    raus.push(...z.schrittEnde());
    pruefe("Zerleger: am Ende eines Textteils (Werkzeug folgt) geht der Rest sofort hinaus, mit Punkt", raus.length === 1 && raus[0].text === "Ich schaue in Ihre heutigen Aufgaben.", JSON.stringify(raus));
    const tab = erzeugeSatzZerleger();
    const tabRaus = [];
    for (const w of "Vorab.\n| Sorte | kg |\n|---|---|\n| Polana | 1150 |\n\nEnde.".match(/[^\n]*\n|[^\n]+/g)) tabRaus.push(...tab.fuettere(w));
    tabRaus.push(...tab.abschliessen());
    pruefe("Zerleger: die Kopfzeile einer Tabelle geht nie allein hinaus (sie faellt dann mit ihrer Trennzeile weg)", !tabRaus.some((a) => a.text.includes("Sorte")) && tabRaus.some((a) => a.text.includes("Polana: 1150")), JSON.stringify(tabRaus.map((a) => a.text)));
    const saetze = saetzeAusAntwort("**Fazit: Alles erledigt.**\n\n## Details\n\n- Punkt eins\n- Punkt zwei");
    pruefe("Fertige Antwort in Saetze fuer den Strom (Knopf an der Nachricht)", saetze[0] === "Fazit: Alles erledigt." && saetze.join(" ").includes("Details:") && saetze.at(-1).endsWith("Punkt zwei."), JSON.stringify(saetze));
  }
  pruefe(
    "Tempo: Voreinstellung je Sprache (Deutsch schneller, Messreihe vom 25.09.2026)",
    sprechTempo("de", undefined) === 1.2 && sprechTempo("en", undefined) === SONIOX_TEMPO_STANDARD && SONIOX_TEMPO_STANDARD === 1.1,
  );
  pruefe("Tempo: eine Zahl fuer alle, auch mit Komma", sprechTempo("ru", "1.2") === 1.2 && sprechTempo("kk", "1,15") === 1.15);
  pruefe("Tempo: je Sprache, andere behalten die Voreinstellung", sprechTempo("de", "de:1.15,ru:1.05") === 1.15 && sprechTempo("ru", "de:1.15,ru:1.05") === 1.05 && sprechTempo("en", "de:1.15") === 1.1);
  pruefe("Tempo: begrenzt auf 0,7 bis 1,3 (Soniox lehnt sonst ab), Unsinn -> Voreinstellung der Sprache", sprechTempo("de", "2") === 1.3 && sprechTempo("de", "0.2") === 0.7 && sprechTempo("de", "schnell") === 1.2);
  pruefe("Pausen kuerzen: an, ausser ausdruecklich aus", stilleKuerzen(undefined) && stilleKuerzen("an") && !stilleKuerzen("aus") && !stilleKuerzen("false"));
  pruefe("Ablagepfad: Tempo und Textstand v3 stecken drin (neues Tempo = neues Audio)", sprachausgabePfad("n1", { anbieter: "soniox", stimme: "Maya", sprache: "de", tempo: 1.1 }) === "n1/soniox-maya-de-t110-v3.mp3" && sprachausgabePfad("n1", { anbieter: "sokrates", stimme: "de-female", sprache: "de" }) === "n1/sokrates-de-female-de-v3.mp3");
  {
    const alt = { a: process.env.KI_SPRACHAUSGABE_ANBIETER, s: process.env.KI_SPRACHAUSGABE_STROM, d: process.env.SONIOX_TTS_STIMME_DE };
    process.env.KI_SPRACHAUSGABE_ANBIETER = "soniox";
    delete process.env.KI_SPRACHAUSGABE_STROM;
    process.env.SONIOX_TTS_STIMME_DE = "Nina";
    const de = stimmenFuer("de")[0];
    pruefe("Stimme je Sprache: SONIOX_TTS_STIMME_DE gilt fuer Deutsch, Tempo und Pausenkuerzung gehen mit", de.anbieter === "soniox" && de.stimme === "Nina" && de.tempo === 1.2 && de.stilleKuerzen === true, JSON.stringify(de));
    pruefe("Stimme je Sprache: andere Sprachen behalten die Voreinstellung", stimmenFuer("ru")[0].stimme === SONIOX_STIMME_STANDARD);
    pruefe("Strom: an, wenn Soniox spricht", sprachausgabeStromAn(undefined) === true && sprachausgabeStromAn("aus") === false);
    process.env.KI_SPRACHAUSGABE_ANBIETER = "sokrates";
    pruefe("Strom: nie mit Sokrates", sprachausgabeStromAn(undefined) === false);
    for (const [n, w] of [["KI_SPRACHAUSGABE_ANBIETER", alt.a], ["KI_SPRACHAUSGABE_STROM", alt.s], ["SONIOX_TTS_STIMME_DE", alt.d]]) {
      if (w === undefined) delete process.env[n];
      else process.env[n] = w;
    }
  }

  // (d) Verdrahtung (Quelltext).
  const lies = (pfad) => readFileSync(new URL(`../../src/${pfad}`, import.meta.url), "utf8");
  const schluesselRoute = lies("app/api/ki-sprachausgabe/schluessel/route.ts");
  pruefe("Schluessel-Route: angemeldet, Chat-Recht, Strom an, feste Obergrenze, Ratenlimit, Nachweis - alles vor dem Schluessel", /getSessionProfile\(\)[\s\S]*?hasPermission\(profil\.role, "ki_assistent", "create"\)[\s\S]*?sprachausgabeStromAn\(\)[\s\S]*?ratenlimitUeberschritten\(`tts-strom:\$\{profil\.id\}`, STROM_SCHLUESSEL_JE_MINUTE\)[\s\S]*?ratenlimitUeberschritten\(`tts:[\s\S]*?pruefeAbschnitt\(\{ nutzerId: profil\.id, zug, nr: 0, text: "", ablauf, sig \}[\s\S]*?holeSonioxSchluessel\("tts_rt"/.test(schluesselRoute));
  pruefe("Schluessel-Route: ohne Nachweis kein Schluessel (Zug-Signatur oder eigene gespeicherte Antwort per RLS)", schluesselRoute.includes('if (!geheimnis || !zug) return fehler(403, "nicht-erlaubt");') && /from\("ki_chat_nachrichten"\)[\s\S]*?nachricht\.rolle !== "assistent"\) return fehler\(403/.test(schluesselRoute));
  pruefe("Schluessel-Route: einmalig (ein Strom je Schluessel), 60 s, begrenzte Dauer je Strom, pseudonym", schluesselRoute.includes("einmalig: true") && STROM_SCHLUESSEL_GUELTIG_S === 60 && STROM_SCHLUESSEL_JE_MINUTE === 12 && schluesselRoute.includes("sitzungS: STROM_SITZUNG_S") && schluesselRoute.includes('createHash("sha256")'));
  pruefe("Chat-Route: Zug-Nachweis zu Beginn jeder Antwort (Nummer 0, leerer Text)", lies("app/api/ki-assistent/route.ts").includes('type: "data-nachweis"') && lies("app/api/ki-assistent/route.ts").includes('signiereAbschnitt({ nutzerId: profil.id, zug: antwortId, nr: 0, text: "", ablauf }, geheimnis)'));
  pruefe("Abschnitts-Weg: ein Zug-Nachweis taugt dort nicht (leerer Text wird abgelehnt)", lies("app/api/ki-sprachausgabe/route.ts").includes('if (!abschnittText || !zug || !Number.isInteger(nr)) return fehler(400, "ungueltige-eingabe");'));
  pruefe("Schluessel-Route: Konfiguration fuer alle vier Sprachen, PCM, Stimme und Tempo je Sprache", schluesselRoute.includes("for (const sprache of sprachausgabeSprachen)") && schluesselRoute.includes("audio_format: STROM_AUDIOFORMAT") && schluesselRoute.includes("voice: sonioxStimmeFuer(sprache)") && schluesselRoute.includes("speed: sprechTempo(sprache)"));
  pruefe("Schluessel-Route: der echte Schluessel verlaesst den Server nie (nur der kurzlebige)", !schluesselRoute.includes("SONIOX_API_KEY"));
  pruefe("Soniox-Client: single_use folgt 'einmalig' (Diktat einmalig, Vorlesen mehrfach)", lies("lib/ai/soniox-client.ts").includes("single_use: einmalig,"));
  const client = lies("lib/ai/sprachausgabe-client.ts");
  pruefe("REST-Anfrage: Tempo und Pausenkuerzung gehen mit", client.includes("{ speed: stimme.tempo }") && client.includes("{ reduce_silence: true }"));
  pruefe("REST-Anfrage: lehnt Soniox die Pausenkuerzung ab, einmal ohne", client.includes("stilleKuerzenAbgelehnt = true;") && client.includes("antwort = await anfrage(false);"));
  const chatRoute = lies("app/api/ki-assistent/route.ts");
  pruefe("Chat-Route: Zerleger satzweise nur, wenn der Browser wirklich streamt (vorleseWeg)", chatRoute.includes('const stil = sprachausgabeStromAn() && body.vorleseWeg === "strom" ? "saetze" : "abschnitte";'));
  pruefe("Chat-Route: am Ende eines Textteils geht der Rest hinaus (schrittEnde)", chatRoute.includes("for (const a of zerleger.schrittEnde()) schickeAbschnitt(a.nr, a.text);"));
  const live = lies("components/ki/sprachausgabe-live.ts");
  pruefe("Live: eine neue Server-ID schneidet die Stimme nicht mehr ab (Runde = Nutzerfrage)", !live.includes("zugRef.current !== abschnitt.zug") && live.includes("const neueRunde = useCallback"));
  pruefe("Live: ein gescheiterter Abschnitt haelt die Reihe nicht auf (spieleWeiter im Fehlerzweig)", /const gescheitert = \(\) => \{[\s\S]*?w\.melde\(eintrag\.nr, "fehler"\);[\s\S]*?spieleWeiter\(\);/.test(live));
  pruefe("Live: Rueckrufe eines alten Durchgangs tun nichts (durchgang)", (live.match(/meinDurchgang !== durchgang\.current/g) ?? []).length >= 5);
  pruefe("Live: gibt der Strom auf, uebernehmen die signierten Abschnitte den Rest", live.includes('weg.current = "abschnitte";') && live.includes("anDenStrom.current.slice(Math.max(0, anDenStrom.current.length - ungesprochen))"));
  pruefe("Live: alles ueber EINEN Ausgang (Kugel, Dazwischenreden)", live.includes("q.connect(ausgangFuer(ctx));") && lies("components/ki/sprachausgabe-strom.ts").includes("quelle.connect(ausgangFuer(ctx));"));
  const fassade = lies("components/ki/ki-chat-sprache.ts");
  pruefe("Fassade: Panel zu heisst still - nie im Sprachmodus, und nicht am ganzen live-Objekt", fassade.includes("if (!offen && !sprachmodus) stoppeLiveUndDatei();") && fassade.includes("}, [offen, sprachmodus, stoppeLiveUndDatei]);"));
  pruefe("Fassade: keine abgeschaltete Hook-Pruefung", !fassade.includes("eslint-disable"));
  pruefe("Fassade: Knopf an einer Nachricht stoppt zuerst alles (eine Stimme)", /knopf\(id, text, antwortSprache\) \{[\s\S]*?stoppeAlles\(\);[\s\S]*?if \(lasGerade\) return;[\s\S]*?live\.sprichNachricht\(id, text, s\)/.test(fassade));
  pruefe("Fassade: Antwortende schliesst den Strom (kein Wort mehr)", fassade.includes("schliesseRunde();"));
  const knopf = lies("components/ki/sprachausgabe.tsx");
  pruefe("Knopf: aktiv, sobald DIESE Nachricht gelesen wird - egal ueber welchen Weg", knopf.includes("const aktiv = vorlesen.liest(id);") && knopf.includes("onClick={() => vorlesen.knopf(id, text, sprache)}"));
  pruefe("Schalter: zeigt den wirksamen Zustand und stoppt mit einem Klick", knopf.includes("const an = vorlesen.schalterAn;") && knopf.includes("aria-checked={an}") && knopf.includes("onClick={() => vorlesen.schalte()}"));
  pruefe("Datei-Rueckfall: nach einem Stopp setzt keine Stimme mehr ein (Generation)", knopf.includes("const nochDran = () => meine === generation.current;") && (knopf.match(/nochDran\(\)/g) ?? []).length >= 6);
  const chat = lies("components/ki/ki-chat.tsx");
  pruefe("Chat: Knopf auch an der Antwort, die gerade entsteht, wenn sie schon vorgelesen wird (dann Stopp)", chat.includes("(vorlesen.liest(nachricht.id) || !(beschaeftigt && nachricht.id === letzteId))"));
  pruefe("Chat: Sprachmodus meldet Sprechen/Laden aus der einen Instanz", chat.includes('spricht: vorlesen.phase === "spricht",') && chat.includes('laedt: vorlesen.phase === "laedt",'));
  const composer = lies("components/ki/ki-chat-composer.tsx");
  pruefe("Eingabefeld: leeres Feld -> Senden-Knopf ist der Sprachmodus (Punkt 2)", composer.includes(") : !eingabe.trim() && sprachmodusMoeglich ? (") && composer.includes('aria-label={t("sprachmodus.starten")}') && composer.includes("onClick={onSprachmodus}"));
  pruefe("Eingabefeld: Sprachmodus-Knopf gesperrt, solange die Zustimmung fehlt", /onClick=\{onSprachmodus\}\s*disabled=\{einwilligungFehlt\}/.test(composer));
  pruefe("Kopfzeile: Sprachmodus-Knopf ab lg sichtbar beschriftet", lies("components/dashboard/topbar.tsx").includes('<span className="hidden lg:inline">{t("kurz")}</span>'));
  pruefe("Start: ohne Zustimmung zum KI-Hinweis oeffnet sich der Chat statt des Sprachmodus", lies("components/ki/ki-pane-kontext.tsx").includes("if (leseChatStand().einwilligungFehlt) {"));
  const modusQuelle = lies("components/ki/sprachmodus.tsx");
  pruefe("Sprachmodus: setzt keine Zustimmung mehr ungesehen", !modusQuelle.includes("erteileEinwilligung") && modusQuelle.includes('setMeldung(t("einwilligungZuerst"));'));
  for (const sprache of ["de", "en", "ru", "kk"]) {
    const texte = JSON.parse(readFileSync(new URL(`../../src/messages/${sprache}.json`, import.meta.url), "utf8")).kiAssistentAnsicht.sprachmodus;
    pruefe(`Texte ${sprache}: kurz, hinweis, einwilligungZuerst vorhanden`, ["kurz", "hinweis", "einwilligungZuerst"].every((k) => typeof texte[k] === "string" && texte[k].length > 2));
  }
}

// (d2) Befunde der Pruefung vom 24.09.2026 (37 Befunde, adversarial verifiziert): Text in allen
//      vier Sprachen und Verdrahtung. Jeder Fall hier war ein hoerbarer oder sichtbarer Fehler.
{
  const wortweiseT = (text, stil = "saetze") => {
    const z = erzeugeSatzZerleger(stil);
    const raus = [];
    for (const w of text.match(/\S+\s*/g)) raus.push(...z.fuettere(w));
    raus.push(...z.abschliessen());
    return raus.map((a) => a.text);
  };
  const gesprochen = (text, sprache, stil) => wortweiseT(text, stil).map((t) => sprechfassung(t, sprache)).join(" ");
  // Telefonnummern bleiben (vorher verschluckt), in allen vier Sprachen.
  for (const [sprache, text, nummer] of [
    ["de", "Hotline: +7-701-234-56-78 oder 8-800-080-7777. Rufen Sie an.", "+7-701-234-56-78"],
    ["ru", "Контакт бухгалтерии: +7-727-250-00-00 (с 9 до 18).", "+7-727-250-00-00"],
    ["kk", "Байланыс телефоны: 8-7172-74-00-00, e-mail арқылы да болады.", "8-7172-74-00-00"],
    ["en", "Call the office at +49-6196-123-456 today.", "+49-6196-123-456"],
  ]) {
    pruefe(`Text ${sprache}: Telefonnummer mit Bindestrichen bleibt hoerbar`, gesprochen(text, sprache).includes(nummer), gesprochen(text, sprache));
  }
  pruefe("Text: IBAN in Bindestrichschreibweise bleibt", textFuerSprachausgabe("IBAN KZ86-125K-ZT50-0410-0100 bitte pruefen.").includes("KZ86-125K-ZT50-0410-0100"));
  pruefe("Text: Charge-Kennung faellt weiterhin weg", textFuerSprachausgabe("Charge CH-T-N-A-01-2609201616-40A7 gesperrt.") === "Charge gesperrt.");
  pruefe("Sprechfassung: Telefonnummer mit Leerzeichen wird keine Riesenzahl", sprechfassung("Позвоните +7 701 234 56 78", "ru") === "Позвоните +7 701 234 56 78" && sprechfassung("Ruf +49 170 123 456 an", "de") === "Ruf +49 170 123 456 an");
  pruefe("Sprechfassung: echte Tausender weiter zusammengezogen", sprechfassung("1 150 000 тенге", "ru") === "1150000 тенге");
  // Kyrillische Abkuerzungen bleiben gross (werden buchstabiert).
  pruefe(
    "Text ru: ЕСУТД, ВОСМС, ХАССП, МТСЗН bleiben Abkuerzungen, СРОЧНО wird normal",
    textFuerSprachausgabe("Сотрудник в ЕСУТД. Взносы ВОСМС и ХАССП проверены. МТСЗН уведомлено. СРОЧНО.") === "Сотрудник в ЕСУТД. Взносы ВОСМС и ХАССП проверены. МТСЗН уведомлено. Срочно.",
  );
  pruefe("Text de: ЕСУТД-Abdeckung bleibt", textFuerSprachausgabe("Die ЕСУТД-Abdeckung liegt bei 87 %").includes("ЕСУТД-Abdeckung"));
  // Ordinalzahl am Anfang eines Abschnitts ist keine Listennummer.
  for (const [sprache, text, muss] of [
    ["de", "Umsatz Q2 war gut und lag deutlich ueber dem Plan des Vorjahres. 3. Quartal: stabil, aber knapp.", "3. Quartal"],
    ["en", "Revenue grew strongly in the second quarter of this business year. 2. Next the plan for autumn.", "2. Next"],
  ]) {
    pruefe(`Zerleger ${sprache}: Ordinalzahl am Abschnittsanfang bleibt`, wortweiseT(text).join(" ").includes(muss), JSON.stringify(wortweiseT(text)));
    pruefe(`Knopf ${sprache}: Ordinalzahl bleibt auch in saetzeAusAntwort`, saetzeAusAntwort(text).join(" ").includes(muss));
  }
  pruefe("Zerleger: echte Listen am Zeilenanfang verlieren weiter ihre Nummer", gesprochen("Schritte:\n1. Anmelden\n2. Pruefen", "de") === "Schritte: Anmelden. Pruefen.", JSON.stringify(wortweiseT("Schritte:\n1. Anmelden\n2. Pruefen")));
  // Kuerzung an der Obergrenze: an einem ECHTEN Satzende, nie an einer Abkuerzung.
  for (const [sprache, satz] of [
    ["de", "Punkt betrifft laut Abs. 3 alle Mitarbeiter der Firma. "],
    ["ru", "Пункт касается согласно п. 3 ст. 82 НК РК всех сотрудников. "],
    ["kk", "Тармақ ҚР СК 82-бабына сәйкес 2026 ж. барлық қызметкерлерге қатысты. "],
    ["en", "Point applies to all employed since Jan. 5 across the firm. "],
  ]) {
    const teile = wortweiseT(satz.repeat(80));
    const ende = teile.at(-1);
    pruefe(`Kuerzung ${sprache}: endet am Satzende, nicht an der Abkuerzung`, /[.!?]$/.test(ende) && !/(Abs|п|ст|ж|Jan)\.$/.test(ende) && teile.join(" ").length <= MAX_SPRACHAUSGABE_ZEICHEN + teile.length, JSON.stringify(ende.slice(-50)));
  }
  // Striche im Fliesstext sind keine Tabelle.
  pruefe("Text: 'Offen | In Arbeit | Erledigt' im Fliesstext bleibt eine Aufzaehlung", textFuerSprachausgabe("Moegliche Status: Offen | In Arbeit | Erledigt. Waehlen Sie einen.") === "Moegliche Status: Offen, In Arbeit, Erledigt. Waehlen Sie einen.");
  pruefe("Text: Tabelle ohne fuehrenden Strich wird an der Trennzeile erkannt", textFuerSprachausgabe("Sorte | kg\n---|---\nPolana | 1150\nKweli | 500\n\nEnde.").startsWith("Polana: 1150.\nKweli: 500."));
  // Ankuendigung ohne Folgetext.
  pruefe("Zerleger: Ueberschrift am Antwortende endet mit Punkt", wortweiseT("Alles erledigt.\n\n### Quellen\n\n- https://adilet.zan.kz/rus/docs/K1700000120").at(-1) === "Quellen.", JSON.stringify(wortweiseT("Alles erledigt.\n\n### Quellen\n\n- https://adilet.zan.kz/rus/docs/K1700000120")));
  pruefe("Text: Ueberschrift direkt vor der naechsten Ueberschrift endet mit Punkt", textFuerSprachausgabe("## Gesperrte Chargen\n\n- CH-T-N-A-01-2609201616-40A7\n\n## Naechste Schritte\n\nBitte pruefen.").startsWith("Gesperrte Chargen.\nNaechste Schritte:"));
  // Tilde als Spanne, Tempo mit Dezimalkomma, Adresse mit Satzpunkt.
  pruefe("Sprechfassung: '5~10 Tage' ist eine Spanne, '~5' ist etwa", sprechfassung("Die Lieferung dauert 5~10 Tage, ~5 davon Transport.", "de") === "Die Lieferung dauert 5-10 Tage, etwa 5 davon Transport.");
  pruefe("Tempo: Dezimalkomma je Sprache ('de:1,15;ru:1,05')", sprechTempo("de", "de:1,15;ru:1,05") === 1.15 && sprechTempo("ru", "de:1,15;ru:1,05") === 1.05 && sprechTempo("de", "de: 1.2") === 1.2 && sprechTempo("ru", "de:1.15,ru:1.05") === 1.05);
  pruefe("Text: nackte Adresse nimmt den Satzpunkt nicht mit", textFuerSprachausgabe("Siehe auch https://soniox.com/docs. Oder anders.") === "Siehe auch. Oder anders.");
  // Tabellen im Strom: Kopfzeile nie als Datenzeile, Zellen nie zerrissen.
  {
    const breite = "Uebersicht:\n\n| Mitarbeiterin | Bruttolohn September | Abzuege gesamt | Auszahlung | Status | Frist | Verantwortlich |\n|---|---|---|---|---|---|---|\n| Serikbai Alibek Nurlanowitsch | 1 150 000 Tenge | 230 000 Tenge | 920 000 Tenge | offen | 15.10. | Buero |\n\nEnde der Uebersicht.";
    for (const stil of ["saetze", "abschnitte"]) {
      const teile = wortweiseT(breite, stil);
      pruefe(`Zerleger (${stil}): breite Tabelle - Kopfzeile wird nicht gelesen`, !teile.some((t) => t.includes("Bruttolohn")), JSON.stringify(teile));
      pruefe(`Zerleger (${stil}): Tabellenzeile bleibt ganz (kein Schnitt in einer Zelle)`, teile.some((t) => t.includes("Serikbai Alibek Nurlanowitsch: 1 150 000 Tenge, 230 000 Tenge, 920 000 Tenge")), JSON.stringify(teile));
    }
  }

  // Verdrahtung der Korrekturen (Quelltext).
  const lies2 = (pfad) => readFileSync(new URL(`../../src/${pfad}`, import.meta.url), "utf8");
  const fassade = lies2("components/ki/ki-chat-sprache.ts");
  pruefe("Fassade: neue Runde markiert die Abschnitte der LETZTEN Antwort als gesehen (kein zweites Vorlesen)", fassade.includes("gesehenerAbschnitt.current = new Set(") && !fassade.includes("gesehenerAbschnitt.current.clear()"));
  pruefe("Fassade: der Nachweis der Antwort holt den Schluessel, nur wenn vorgelesen wird", fassade.includes('if (teil.type === "data-nachweis" && teil.data)') && fassade.includes("if (liveErlaubt) nimmNachweis(n);"));
  pruefe("Fassade: nach einer Freigabe wird nur der neue Teil gelesen (Position und Laenge)", fassade.includes("const schon = vorgelesenBis.current?.stelle === stelle ? vorgelesenBis.current.zeichen : 0;"));
  pruefe("Fassade: die Kennung der gelesenen Nachricht folgt Folgeanfragen", fassade.includes("folgeQuelle(letzte.id);"));
  pruefe("Fassade: Schalter und Regeln kennen 'nie eingestellt' und 'ausdruecklich aus'", fassade.includes("einstellung: sprachausgabe.einstellung") && lies2("components/ki/sprachausgabe.tsx").includes('setEinstellung(gespeichert === "an" ? true : gespeichert === "aus" ? false : null);'));
  pruefe("Sprachmodus-Start unterbricht eine laufende Antwort (auch aus der Kopfzeile)", /if \(leseChatStand\(\)\.einwilligungFehlt\) \{[\s\S]*?\}\s*[\s\S]*?unterbrichChat\(\);\s*sprachmodusRef\.current = true;/.test(lies2("components/ki/ki-pane-kontext.tsx")));
  pruefe("Chat: meldet den Vorlese-Weg des Browsers mit (Stil des Zerlegers)", lies2("components/ki/ki-chat.tsx").includes('vorleseWeg: stromMoeglich() ? "strom" : "abschnitte"'));
  const strom = lies2("components/ki/sprachausgabe-strom.ts");
  pruefe("Strom: immer nur ein Strom - der naechste wartet, bis der laufende fertig ist", strom.includes("if (!nimmt) beendeAktiv();") && !strom.includes("stroeme.set("));
  pruefe("Strom: Nachrichten fremder Stroeme (auch Fehler) werden ignoriert", strom.includes("if (!aktiv || e.stream !== aktiv.id) return;") && strom.includes("if (!aktiv || e.stream !== aktiv.id) {"));
  pruefe("Strom: stopp() schickt cancel und laesst die Verbindung offen", /stopp\(\) \{[\s\S]*?if \(aktiv\) sende\(abbruchNachricht\(aktiv\.id\)\);[\s\S]*?planeLeerlauf\(\);/.test(strom) && !/stopp\(\) \{[^}]*schliesseVerbindung\(\)/.test(strom));
  pruefe("Strom: ein gescheiterter Verbindungsaufbau bleibt nicht zwischengespeichert", strom.includes("if (ws === socket) {\n          ws = null;\n          wsOeffnet = null;") || /if \(ws === socket\) \{\s*ws = null;\s*wsOeffnet = null;/.test(strom));

  // (f) Wortbefehl "Stopp": sicherer Weg, den Sprachmodus per Aeusserung zu
  //     beenden, ohne Knopf oder Taste (Rueckmeldung vom 25.09.2026).
  pruefe("Stopp-Befehl: die vier Sprachen, mit und ohne Ausrufezeichen", istStoppBefehl("Stopp") && istStoppBefehl("stopp!") && istStoppBefehl("Stop") && istStoppBefehl("Halt") && istStoppBefehl("Стоп") && istStoppBefehl("хватит!") && istStoppBefehl("Тоқта"));
  pruefe("Stopp-Befehl: eine Bitte davor oder danach zaehlt weiterhin", istStoppBefehl("Bitte stopp") && istStoppBefehl("Stopp, bitte") && istStoppBefehl("please stop"));
  pruefe("Stopp-Befehl: nur die ganze Aeusserung, nicht ein Wort mittendrin", !istStoppBefehl("Was bedeutet Stopp bei einer Kühlkette?") && !istStoppBefehl("Stopp den Bericht bitte") && !istStoppBefehl(""));
  pruefe("Sprachmodus: der Wortbefehl beendet statt eine Frage zu stellen", /istStoppBefehl\(ergebnis\.text\)[\s\S]{0,260}beendenRef\.current\(\)/.test(lies2("components/ki/sprachmodus.tsx")));

  // (g) Zusage/Absage bei einer offenen Freigabe (Rueckmeldung vom 25.09.2026:
  //     "der Sprachmodus soll die gleichen Rechte haben wie der Chat").
  pruefe("Zusage: die vier Sprachen", istZusageBefehl("Ja") && istZusageBefehl("ja!") && istZusageBefehl("Bestätigen") && istZusageBefehl("Yes") && istZusageBefehl("Да") && istZusageBefehl("Иә"));
  pruefe("Absage: die vier Sprachen, auch 'Stopp' waehrend einer Freigabe", istAbsageBefehl("Nein") && istAbsageBefehl("nein!") && istAbsageBefehl("Abbrechen") && istAbsageBefehl("No") && istAbsageBefehl("Нет") && istAbsageBefehl("Жоқ") && istAbsageBefehl("Stopp"));
  pruefe("Zusage/Absage: nur die ganze Aeusserung, nicht ein Wort mittendrin", !istZusageBefehl("Ja, aber was kostet das?") && !istAbsageBefehl("Nein, warten Sie") && !istZusageBefehl("") && !istAbsageBefehl(""));
  pruefe("Zusage/Absage: eine Bitte davor oder danach zaehlt weiterhin", istZusageBefehl("Bitte ja") && istAbsageBefehl("Nein, bitte"));
}

// (e) Der Strom-Sprecher im Durchlauf: nachgebauter WebSocket und AudioContext, echter Code
//     aus components/ki/sprachausgabe-strom.ts (ueber den Alias-Lader). Jede Faelle mit
//     eigener Modul-Instanz (?fall=N), weil der Sprecher je Tab Zustand haelt.
{
  const { register } = await import("node:module");
  register(new URL("./hilfen/alias-lader.mjs", import.meta.url), { data: { src: new URL("../../src/", import.meta.url).href } });
  const warte = (ms = 15) => new Promise((r) => setTimeout(r, ms));
  class FakeWS {
    static OPEN = 1;
    static alle = [];
    static oeffnet = true;
    constructor(url) {
      this.url = url;
      this.readyState = 0;
      this.gesendet = [];
      FakeWS.alle.push(this);
      setTimeout(() => {
        if (!FakeWS.oeffnet) {
          this.onerror?.();
          this.onclose?.();
          return;
        }
        this.readyState = 1;
        this.onopen?.();
      }, 1);
    }
    send(d) {
      this.gesendet.push(JSON.parse(d));
    }
    close() {
      this.readyState = 3;
      this.geschlossen = true;
    }
    empfange(obj) {
      this.onmessage?.({ data: JSON.stringify(obj) });
    }
    starts() {
      return this.gesendet.filter((n) => n.api_key);
    }
  }
  const quellen = [];
  const ctx = {
    currentTime: 0,
    state: "running",
    destination: {},
    resume: async () => {},
    createGain: () => ({ connect() {} }),
    createAnalyser: () => ({ connect() {}, getByteTimeDomainData() {} }),
    createBuffer: (_k, n, rate) => {
      const d = new Float32Array(n);
      return { duration: n / rate, getChannelData: () => d };
    },
    createBufferSource: () => {
      const q = { connect() {}, start(t) { q.startZeit = t; }, stop() { q.gestoppt = true; } };
      quellen.push(q);
      return q;
    },
  };
  const alt = { ws: globalThis.WebSocket, fetch: globalThis.fetch };
  const konfigurationen = { de: { model: "tts-rt-v2", language: "de", voice: "Maya", audio_format: "pcm_s16le", sample_rate: 24000, speed: 1.1, reduce_silence: true } };
  let schluesselAbrufe = [];
  let schluesselStatus = 200;
  let schluesselNr = 0;
  globalThis.WebSocket = FakeWS;
  globalThis.fetch = async (url, init) => {
    if (String(url) !== "/api/ki-sprachausgabe/schluessel") throw new Error("unerwarteter fetch " + url);
    schluesselAbrufe.push(JSON.parse(init.body));
    if (schluesselStatus !== 200) return new Response(JSON.stringify({ grund: "x" }), { status: schluesselStatus });
    schluesselNr++;
    return new Response(JSON.stringify({ schluessel: `tmp-${schluesselNr}`, adresse: "wss://tts-rt.eu.soniox.com/tts-websocket", konfigurationen, gueltigMs: 60_000 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  const pcm = (n) => btoa(String.fromCharCode(...new Uint8Array(n * 2)));
  const nachweis = { art: "zug", zug: "z-1", ablauf: Date.now() + 60_000, sig: "ab12" };
  const neuerSprecher = async (fall) => {
    const modul = await import(`../../src/components/ki/sprachausgabe-strom.ts?fall=${fall}`);
    const zustaende = [];
    const aufgaben = [];
    const s = modul.erzeugeStromSprecher(() => ctx, {
      beiZustand: (z) => zustaende.push(z),
      beiAufgabe: (grund, n) => aufgaben.push({ grund, n }),
    });
    return { modul, s, zustaende, aufgaben };
  };
  try {
    // --- Fall 1: Normalfall, Nachweis, ein Strom, Ton lueckenlos, Ende, Stopp haelt die Verbindung ---
    {
      const { s, zustaende } = await neuerSprecher(1);
      s.setzeNachweis(nachweis);
      await warte();
      pruefe("Strom-Durchlauf: der Nachweis holt sofort einen Schluessel auf Vorrat (mit Zug, Ablauf, Signatur)", schluesselAbrufe.length === 1 && schluesselAbrufe[0].zug === "z-1" && schluesselAbrufe[0].sig === "ab12" && FakeWS.alle.length === 0);
      s.sprich("Ich schaue in Ihre Aufgaben.", "de");
      s.sprich("Heute stehen drei Dinge an.", "de");
      pruefe("Strom-Durchlauf: meldet sofort 'laedt'", zustaende.at(-1)?.laedt === true && zustaende.at(-1)?.spricht === false);
      await warte();
      const ws = FakeWS.alle.at(-1);
      const [startMsg, t1, t2] = ws?.gesendet ?? [];
      pruefe("Strom-Durchlauf: eine Verbindung zur EU-Adresse, der Vorrats-Schluessel wird genommen", FakeWS.alle.length === 1 && ws.url === "wss://tts-rt.eu.soniox.com/tts-websocket" && startMsg?.api_key === "tmp-1");
      pruefe("Strom-Durchlauf: Startnachricht mit Stimme, Tempo, Pausenkuerzung", startMsg.voice === "Maya" && startMsg.speed === 1.1 && startMsg.reduce_silence === true && typeof startMsg.stream_id === "string");
      pruefe("Strom-Durchlauf: beide Saetze im SELBEN Strom, mit Leerzeichen am Ende", t1?.text === "Ich schaue in Ihre Aufgaben. " && t2?.text === "Heute stehen drei Dinge an. " && t1.stream_id === startMsg.stream_id && t2.stream_id === startMsg.stream_id);
      ws.empfange({ stream_id: startMsg.stream_id, audio: pcm(2400) });
      ws.empfange({ stream_id: startMsg.stream_id, audio: pcm(2400) });
      pruefe("Strom-Durchlauf: Ton wird sofort gespielt, das zweite Stueck lueckenlos dahinter", quellen.length === 2 && Math.abs(quellen[0].startZeit - 0.25) < 1e-9 && Math.abs(quellen[1].startZeit - (0.25 + 0.1)) < 1e-9);
      pruefe("Strom-Durchlauf: meldet 'spricht'", zustaende.at(-1)?.spricht === true);
      s.ende();
      await warte();
      pruefe("Strom-Durchlauf: ende() schickt text_end fuer den Strom", ws.gesendet.some((n) => n.text_end === true && n.stream_id === startMsg.stream_id));
      ws.empfange({ stream_id: startMsg.stream_id, audio_end: true });
      ws.empfange({ stream_id: startMsg.stream_id, terminated: true });
      quellen.forEach((q) => q.onended?.());
      pruefe("Strom-Durchlauf: nach dem letzten Ton und terminated: still", zustaende.at(-1)?.spricht === false && zustaende.at(-1)?.laedt === false, JSON.stringify(zustaende.at(-1)));
      // Neue Runde auf derselben Verbindung, dann Stopp: Abbruch, aber die Verbindung bleibt.
      s.stopp();
      s.setzeNachweis(nachweis);
      s.sprich("Zweite Runde.", "de");
      await warte();
      const st2 = ws.starts().at(-1);
      pruefe("Strom-Durchlauf: die naechste Runde nutzt dieselbe Verbindung (kein neuer Aufbau)", FakeWS.alle.length === 1 && st2.stream_id !== startMsg.stream_id);
      ws.empfange({ stream_id: st2.stream_id, audio: pcm(4800) });
      const letzte = quellen.at(-1);
      s.stopp();
      pruefe("Strom-Durchlauf: stopp() bricht den Strom ab (cancel), stoppt eingeplanten Ton, Verbindung bleibt offen", ws.gesendet.some((n) => n.cancel === true && n.stream_id === st2.stream_id) && letzte.gestoppt === true && !ws.geschlossen && zustaende.at(-1)?.spricht === false);
      ws.empfange({ stream_id: st2.stream_id, audio: pcm(100) });
      pruefe("Strom-Durchlauf: nach stopp() kommt kein Ton des abgebrochenen Stroms mehr durch", quellen.at(-1) === letzte);
      s.stopp();
    }

    // --- Fall 2: IMMER NUR EIN STROM - Ton zweier Stroeme wird nie verschraenkt ---
    {
      FakeWS.alle = [];
      quellen.length = 0;
      const { s } = await neuerSprecher(2);
      s.setzeNachweis(nachweis);
      const lang = "x".repeat(700) + ".";
      s.sprich(lang, "de");
      s.sprich(lang, "de");
      s.sprich("Danach noch ein Satz.", "de");
      s.ende();
      await warte();
      const ws = FakeWS.alle.at(-1);
      const erster = ws.starts();
      pruefe("Strom-Durchlauf: ueber der Zeichengrenze wird der erste Strom beendet, der zweite NICHT gleichzeitig geoeffnet", erster.length === 1 && ws.gesendet.some((n) => n.text_end === true && n.stream_id === erster[0].stream_id));
      ws.empfange({ stream_id: erster[0].stream_id, audio: pcm(2400) });
      ws.empfange({ stream_id: erster[0].stream_id, audio: pcm(2400) });
      ws.empfange({ stream_id: erster[0].stream_id, audio_end: true });
      ws.empfange({ stream_id: erster[0].stream_id, terminated: true });
      await warte();
      const zweiter = ws.starts();
      pruefe("Strom-Durchlauf: erst nach terminated oeffnet der naechste Strom, mit dem Rest", zweiter.length === 2 && ws.gesendet.filter((n) => n.stream_id === zweiter[1].stream_id && typeof n.text === "string" && n.text.startsWith("x")).length === 1);
      ws.empfange({ stream_id: zweiter[1].stream_id, audio: pcm(2400) });
      const starts = quellen.map((q) => q.startZeit);
      pruefe("Strom-Durchlauf: der Ton des zweiten Stroms liegt HINTER dem des ersten", starts.length === 3 && starts[2] >= starts[1] && starts[1] >= starts[0]);
      s.stopp();
    }

    // --- Fall 3: Aufgeben zaehlt ALLE ungesprochenen Saetze (auch die wartenden) ---
    {
      FakeWS.alle = [];
      schluesselStatus = 502;
      const { s, aufgaben } = await neuerSprecher(3);
      s.setzeNachweis(nachweis);
      s.sprich("Eins.", "de");
      s.sprich("Zwei.", "de");
      s.sprich("Drei.", "de");
      await warte(30);
      pruefe("Strom-Durchlauf: kein Schluessel -> Aufgabe mit allen 3 Saetzen (der Rueckfall liest sie alle)", aufgaben.length === 1 && aufgaben[0].n === 3, JSON.stringify(aufgaben));
      s.stopp();
      schluesselStatus = 200;
    }

    // --- Fall 4: Pausenkuerzung abgelehnt, dazu "Stream not found" fuer den Text: Wiederholung ohne reduce_silence ---
    {
      FakeWS.alle = [];
      const { s, aufgaben } = await neuerSprecher(4);
      s.setzeNachweis(nachweis);
      s.sprich("Neue Frage.", "de");
      s.ende();
      await warte();
      const ws = FakeWS.alle.at(-1);
      const st = ws.starts().at(-1);
      ws.empfange({ stream_id: st.stream_id, error_code: 400, error_type: "invalid_request", error_message: "Model does not support silence reduction." });
      ws.empfange({ stream_id: st.stream_id, error_code: 400, error_type: "invalid_request", error_message: "Stream not found. Send a start message first." });
      await warte();
      const st2 = ws.starts().at(-1);
      pruefe(
        "Strom-Durchlauf: Pausenkuerzung abgelehnt -> neuer Strom ohne reduce_silence, derselbe Text, mit text_end",
        st2.stream_id !== st.stream_id &&
          st2.reduce_silence === undefined &&
          ws.gesendet.filter((n) => n.stream_id === st2.stream_id && n.text === "Neue Frage. ").length === 1 &&
          ws.gesendet.some((n) => n.stream_id === st2.stream_id && n.text_end === true),
      );
      pruefe("Strom-Durchlauf: die Folgemeldung zum abgelehnten Strom bricht NICHT alles ab", aufgaben.length === 0, JSON.stringify(aufgaben));
      // Harter Fehler vor dem ersten Ton: aufgeben, der Satz gilt als ungesprochen.
      ws.empfange({ stream_id: st2.stream_id, error_code: 500, error_type: "internal_error", error_message: "x" });
      pruefe("Strom-Durchlauf: 500 vor dem ersten Ton -> aufgeben, 1 Satz ungesprochen", aufgaben.length === 1 && aufgaben[0].n === 1 && s.aufgegeben());
      s.sprich("Nach der Aufgabe.", "de");
      await warte();
      pruefe("Strom-Durchlauf: nach der Aufgabe nimmt dieser Durchgang keinen Text mehr an", !ws.gesendet.some((n) => n.text === "Nach der Aufgabe. "));
      s.stopp();
    }

    // --- Fall 5: Verbindung kommt nicht zustande -> nach zwei Fehlschlaegen nimmt der Tab den Abschnitts-Weg ---
    {
      FakeWS.alle = [];
      FakeWS.oeffnet = false;
      const { s, aufgaben, modul } = await neuerSprecher(5);
      s.setzeNachweis(nachweis);
      s.sprich("A.", "de");
      await warte(30);
      s.stopp();
      s.setzeNachweis(nachweis);
      s.sprich("B.", "de");
      await warte(30);
      pruefe("Strom-Durchlauf: zweimal keine Verbindung -> stromMoeglich() aus (keine 4-s-Wartezeit bei jeder Frage)", aufgaben.length === 2 && modul.stromMoeglich() === false, JSON.stringify(aufgaben));
      s.stopp();
      FakeWS.oeffnet = true;
    }
  } finally {
    globalThis.WebSocket = alt.ws;
    globalThis.fetch = alt.fetch;
  }
  // Route sagt 404 (Strom aus / kein Soniox): der Tab fragt nicht wieder, der Satz geht zurueck.
  globalThis.WebSocket = FakeWS;
  globalThis.fetch = async () => new Response(JSON.stringify({ grund: "nicht-aktiv" }), { status: 404 });
  try {
    const modul = await import("../../src/components/ki/sprachausgabe-strom.ts?fall=6");
    const aufgaben = [];
    const s = modul.erzeugeStromSprecher(() => ctx, { beiZustand: () => {}, beiAufgabe: (grund, n) => aufgaben.push({ grund, n }) });
    s.setzeNachweis({ art: "nachricht", nachrichtId: "00000000-0000-0000-0000-000000000000" });
    s.sprich("Hallo.", "de");
    s.sprich("Noch einer.", "de");
    await warte(30);
    pruefe("Strom-Durchlauf: Route sagt 404 -> Aufgabe mit BEIDEN Saetzen, und stromMoeglich() ist danach aus", aufgaben.length === 1 && aufgaben[0].n === 2 && modul.stromMoeglich() === false, JSON.stringify(aufgaben));
    s.stopp();
  } finally {
    globalThis.WebSocket = alt.ws;
    globalThis.fetch = alt.fetch;
  }
}

console.log("\n" + "-".repeat(58));
console.log(`Pruefungen: ${bestanden + fehlgeschlagen}   bestanden: ${bestanden}   fehlgeschlagen: ${fehlgeschlagen}`);
if (fehlgeschlagen) process.exit(1);


console.log("Alle Pruefungen bestanden.");
