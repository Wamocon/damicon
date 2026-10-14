import {
  abwarten,
  aktuelleUhr,
  AudioContextAttrappe,
  ausloesen,
  beendeUmgebung,
  installiereUhr,
  medienElemente,
  netz,
  protokoll,
  pruefer,
  renderHook,
  setzeUmgebungZurueck,
  umgebungsFehler,
  WebSocketAttrappe,
  type AntwortVorgabe,
  type FetchAufruf,
  type Uhr,
} from "./hilfen/dom-umgebung";
import { readFileSync, writeFileSync } from "node:fs";
import { erzeugeStromSprecher, stromMoeglich, type StromRueckmeldung, type StromSprecher } from "@/components/ki/sprachausgabe-strom";
import { useLiveSprachausgabe, type LiveAbschnitt } from "@/components/ki/sprachausgabe-live";

// Charakterisierung der Sprachausgabe vor dem Zerlegen (WMC-Cleanup Phase 3, Paket "Sprachausgabe", seit 14.10.2026), ohne Browser
// und ohne Netz, in der DOM-Umgebung (hilfen/dom-umgebung.tsx) mit steuerbarer Uhr:
//   * erzeugeStromSprecher (components/ki/sprachausgabe-strom.ts): Schlüssel, Verbindung, Ströme und die Zeitachse der PCM-Stücke.
//     Stücke unterschiedlicher Länge und Abtastrate, halbe Samples, Drosselung und Pufferleere (Vorlauf, Aussetzer, 16 kHz),
//     Abbruch mitten im Strom, Fehler im Strom (neuer Schlüssel, ohne Pausenkürzung, 408/413, Aufgabe), Sprach- und Ratenwechsel,
//     Zeichengrenze, neue Ausgabe während einer laufenden, Ruhe, Aufsicht, Leerlauf, angehaltene Stimme, Schließen, Absage.
//   * useLiveSprachausgabe (components/ki/sprachausgabe-live.ts): Strom-Weg live, Aufgabe des Stroms mit Übergabe an die
//     Abschnitte (mit und ohne klingenden Strom-Ton), Knopf an einer Nachricht samt Rest für den Datei-Weg, Weg ohne Web Audio,
//     Abschnitts-Weg nach der Absage, Anhalten und Entsperren, neue Runde, Abbau, Identität der Rückgabe.
// Je Fall wird die vollständige Folge aller Aufrufe an AudioContext, WebSocket, fetch, <audio>, Objekt-URLs und Konsole mit der Zeit
// der Uhr aufgezeichnet (dazu Rückmeldungen, stand(), gerade(), Phase und offene Zeitgeber) und mit der Folge des Codes vor dem
// Zerlegen verglichen (fixtures/sprachausgabe-golden.json, Stand 532c9180). Ein Unterschied meldet die erste abweichende Zeile.
// Dazu prüfen ausgeschriebene Regeln die wichtigsten Zeitpunkte. Der Sprecher hält Zustand je Tab (Modul): die Fälle laufen deshalb
// in fester Reihenfolge, die Absage (Zustand bis zum Neuladen) zuletzt. Die Vergleichswerte neu schreiben nur mit einem Code, dessen
// Verhalten gewollt ist:
//   npx --yes tsx supabase/tests/sprachausgabe.tsx --golden-schreiben
// Aufruf: npm run test:sprachausgabe

const { pruefe, ende } = pruefer();
const json = (wert: unknown) => JSON.stringify(wert);
const GOLDEN = "supabase/tests/fixtures/sprachausgabe-golden.json";
const schreiben = process.argv.includes("--golden-schreiben");
const golden = schreiben ? {} : (JSON.parse(readFileSync(GOLDEN, "utf8")) as Record<string, string[]>);
const neu: Record<string, string[]> = {};

// ---- Aufzeichnung ---------------------------------------------------------------------------------------------------------------
// Jede Zeile des Protokolls bekommt die Zeit der Uhr (ms seit dem Einschalten) angehängt.
const zeilen = protokoll.eintraege as string[] & { push: (...neu: string[]) => number };
const echtPush = Array.prototype.push;
zeilen.push = function (...neue: string[]) {
  const uhr = aktuelleUhr();
  return echtPush.apply(this, neue.map((z) => `${z} @${uhr ? uhr.jetzt() : "-"}`));
};
const notiere = (quelle: string, text: string) => protokoll.notiere(quelle, text);
// Die Kennung eines Stroms enthält Math.random: fest, damit die Folge gleich bleibt.
Math.random = () => 0.5;
// Warnungen gehören zur Folge, Fehler (etwa React außerhalb von act) dürfen nicht vorkommen.
const konsolenFehler: string[] = [];
const echteKonsole = { warn: console.warn, error: console.error };
console.warn = (...teile: unknown[]) => notiere("konsole", `warn ${teile.map(String).join(" ")}`);
console.error = (...teile: unknown[]) => void konsolenFehler.push(teile.map(String).join(" "));

function vergleiche(fall: string, zusatz: string[] = []): void {
  const uhr = aktuelleUhr();
  const folge = [
    ...protokoll.eintraege,
    ...WebSocketAttrappe.alle.flatMap((ws) => ws.gesendet.map((n) => `${ws.name} gesendet ${json(n)}`)),
    ...netz.aufrufe.map((a) => `fetch ${a.methode} ${a.pfad} ${json(a.json)}`),
    `zeitgeber ${json(uhr?.zeitgeber() ?? [])}`,
    ...zusatz,
  ];
  neu[fall] = folge;
  pruefe(`${fall}: keine Meldung aus jsdom`, umgebungsFehler.length === 0, json(umgebungsFehler));
  if (schreiben) return;
  const soll = golden[fall] ?? [];
  const i = folge.findIndex((z, n) => z !== soll[n]);
  const stelle = i < 0 ? folge.length : i;
  const gleich = i < 0 && folge.length === soll.length;
  pruefe(`${fall}: die ganze Folge (${folge.length} Zeilen) gleicht der des Codes vor dem Zerlegen`, gleich, gleich ? "" : `Zeile ${stelle}: ist ${folge[stelle] ?? "(Ende)"} | soll ${soll[stelle] ?? "(Ende)"}`);
}

// ---- Umgebung je Fall -----------------------------------------------------------------------------------------------------------
const ADRESSE_WS = "wss://tts-rt.eu.soniox.com/tts-websocket";
const KONFIGURATIONEN = {
  de: { model: "tts-rt-v2", language: "de", voice: "Maya", audio_format: "pcm_s16le", sample_rate: 24000, speed: 1.1, reduce_silence: true },
  ru: { model: "tts-rt-v2", language: "ru", voice: "Maya", audio_format: "pcm_s16le", sample_rate: 24000, speed: 0.9 },
  en: { model: "tts-rt-v2", language: "en", voice: "Adrian", audio_format: "pcm_s16le", sample_rate: 22050 },
};
let schluesselNr = 0;
/** Vorgaben für die nächsten Antworten der Schlüssel-Route (sonst ein gültiger Schlüssel für 60 s). */
const schluesselVorgaben: (AntwortVorgabe | { gueltigMs: number })[] = [];

function neuerFall(name: string): Uhr {
  setzeUmgebungZurueck();
  const uhr = installiereUhr({ datum: "2026-10-14T08:00:00Z" });
  netz.antworte("POST /api/ki-sprachausgabe/schluessel", () => {
    const vorgabe = schluesselVorgaben.shift();
    if (vorgabe && !("gueltigMs" in vorgabe)) return vorgabe;
    schluesselNr += 1;
    return { json: { schluessel: `k-${schluesselNr}`, adresse: ADRESSE_WS, konfigurationen: KONFIGURATIONEN, gueltigMs: vorgabe?.gueltigMs ?? 60_000 } };
  });
  notiere("test", `fall ${name}`);
  return uhr;
}

const schritt = (text: string) => notiere("test", text);
const rueckmeldung = (gehalten?: () => boolean): StromRueckmeldung => ({
  beiZustand: (z) => notiere("rueck", `zustand${z.laedt ? " laedt" : ""}${z.spricht ? " spricht" : ""}`),
  beiAufgabe: (grund, n) => notiere("rueck", `aufgabe ${grund} ${n}`),
  ...(gehalten ? { gehalten } : {}),
});
const NACHWEIS = () => ({ art: "zug" as const, zug: "z-1", ablauf: Date.now() + 60_000, sig: "ab12" });
const verbindung = (nr = WebSocketAttrappe.alle.length) => WebSocketAttrappe.alle[nr - 1]!;
/** Die Kennung des zuletzt gestarteten Stroms dieser Verbindung. */
const stromId = (ws: WebSocketAttrappe) => String(ws.json().filter((n) => "api_key" in n).at(-1)?.stream_id);
/** PCM s16le als Base64, `bytes` lang (ungerade: ein halbes Sample bleibt für das nächste Stück). */
const pcm = (bytes: number) => Buffer.alloc(bytes, 1).toString("base64");
const ton = (ws: WebSocketAttrappe, strom: string, samples: number, bytes = samples * 2) => ausloesen(() => ws.empfange({ stream_id: strom, audio: pcm(bytes) }));
const empfange = (ws: WebSocketAttrappe, nachricht: object) => ausloesen(() => ws.empfange(nachricht));
const kontextVon = () => AudioContextAttrappe.alle.at(-1)!;
/** Startzeiten (Kontextzeit) und Abtastraten der Quellen eines Kontexts. */
const quellen = (ctx: AudioContextAttrappe) => ctx.quellen.filter((q) => q.gestartet).map((q) => ({ start: q.startZeit!, dauer: q.buffer!.duration, rate: q.buffer!.sampleRate }));
const nah = (a: number, b: number) => Math.abs(a - b) < 1e-6;

function sprecher(gehalten?: () => boolean): { s: StromSprecher; stand: () => void; ctx: AudioContextAttrappe } {
  const ctx = new AudioContext() as unknown as AudioContextAttrappe;
  const s = erzeugeStromSprecher(() => ctx as unknown as AudioContext, rueckmeldung(gehalten));
  return { s, ctx, stand: () => notiere("stand", json(s.stand())) };
}

// ---- 1. Normalfall: ein Strom, lückenlose Zeitachse, Pufferleere, Ende, Leerlauf ------------------------------------------------
async function fallStromNormal(): Promise<void> {
  const uhr = neuerFall("strom-normal");
  const { s, ctx, stand } = sprecher();
  stand();
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  schritt("zwei Sätze und ein leerer");
  s.sprich("  Ich schaue in Ihre Aufgaben.  ", "de", "Ich schaue in Ihre Aufgaben!", { el: null, ziel: "a3" });
  s.sprich("Heute stehen drei Dinge an, die Sie bis zum Abend erledigen sollten.", "de");
  s.sprich("   ", "de");
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  const id = stromId(ws);
  await uhr.vor(120);
  await ton(ws, id, 2400);
  stand();
  await uhr.vor(40);
  schritt("halbes Sample am Ende, dann der Rest");
  await ton(ws, id, 0, 4801);
  await uhr.vor(40);
  await ton(ws, id, 0, 4799);
  await uhr.vor(150);
  stand();
  await uhr.vor(150);
  stand();
  schritt("Pufferleere: die Zeitachse läuft ab");
  await uhr.vor(400);
  stand();
  await uhr.vor(200);
  stand();
  await uhr.vor(1200);
  stand();
  await ton(ws, id, 72000);
  stand();
  await uhr.vor(1000);
  stand();
  s.ende();
  await abwarten();
  await empfange(ws, { stream_id: id, audio_end: true });
  await empfange(ws, { stream_id: id, terminated: true });
  stand();
  await uhr.vor(2600);
  stand();
  schritt("Leerlauf: Aufsicht, Keepalive, nach 20 s zu");
  await uhr.vor(30_000);
  stand();
  const q = quellen(ctx);
  pruefe("Normalfall: das erste Stück beginnt mit 0,25 s Vorlauf ab Eingang", nah(q[0]!.start, 0.12 + 0.25), json(q));
  pruefe("Normalfall: die nächsten Stücke lückenlos dahinter (auch über das halbe Sample)", nah(q[1]!.start, q[0]!.start + q[0]!.dauer) && nah(q[2]!.start, q[1]!.start + q[1]!.dauer) && q[1]!.dauer === 0.1 && q[2]!.dauer === 0.1);
  pruefe("Normalfall: nach der Pufferleere (Eingang bei 2,3 s) beginnt das Stück mit doppeltem Vorlauf (0,5 s)", nah(q[3]!.start, 2.3 + 0.5) && q[3]!.dauer === 3, json(q[3]));
  pruefe("Normalfall: nach 20 s Leerlauf ist die Verbindung zu", ws.geschlossen !== null && ws.json().filter((n) => n.keep_alive).length > 0);
  schritt("zweite Runde: neue Verbindung, Vorrats-Schlüssel, Vorlauf bleibt nach Aussetzer");
  s.stopp();
  stand();
  s.sprich("Zweite Runde.", "de");
  await abwarten();
  await uhr.vor(0);
  const ws2 = verbindung();
  await ton(ws2, stromId(ws2), 2400);
  s.stopp();
  s.sprich("Dritte Runde.", "de");
  await abwarten();
  await ton(ws2, stromId(ws2), 2400);
  const q2 = quellen(ctx);
  pruefe("Normalfall: nach einer Runde mit Aussetzer bleibt der Vorlauf (0,5 s), danach halbiert er sich (0,25 s)", nah(q2.at(-2)!.start - (uhr.jetzt() / 1000), 0.5) && nah(q2.at(-1)!.start - uhr.jetzt() / 1000, 0.25), json(q2.slice(-2)));
  s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-normal", [`aufgegeben ${s.aufgegeben()}`]);
}

// ---- 2. Abbruch mitten im Strom ------------------------------------------------------------------------------------------------------
async function fallStromAbbruch(): Promise<void> {
  const uhr = neuerFall("strom-abbruch");
  const { s, ctx, stand } = sprecher();
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  s.sprich("Erster Satz der Antwort.", "de");
  s.sprich("Zweiter Satz der Antwort.", "de");
  s.sprich("Dritter Satz der Antwort.", "de");
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  const id = stromId(ws);
  await ton(ws, id, 12000);
  await ton(ws, id, 12000);
  await uhr.vor(100);
  await ton(ws, id, 6000);
  await uhr.vor(200);
  stand();
  schritt("stopp mitten im ersten Stück");
  s.stopp();
  stand();
  await ton(ws, id, 2400);
  await empfange(ws, { stream_id: id, terminated: true });
  pruefe("Abbruch: cancel für den Strom, jedes eingeplante Stück gestoppt, Verbindung offen", ws.json().some((n) => n.cancel === true && n.stream_id === id) && ctx.quellen.every((q) => q.gestoppt || q.beendet) && ws.geschlossen === null);
  schritt("neue Frage auf derselben Verbindung");
  s.sprich("Neue Frage.", "de");
  await abwarten();
  const id2 = stromId(ws);
  await ton(ws, id2, 4800);
  await uhr.vor(500);
  stand();
  schritt("stopp, während der Schlüssel noch unterwegs ist");
  const zweiter = sprecher();
  const gehalten = netz.halte("POST /api/ki-sprachausgabe/schluessel");
  zweiter.s.setzeNachweis(NACHWEIS());
  zweiter.s.sprich("Wird nie gesprochen.", "de");
  await abwarten();
  zweiter.s.stopp();
  gehalten.gib({ json: { schluessel: "k-gehalten", adresse: ADRESSE_WS, konfigurationen: KONFIGURATIONEN, gueltigMs: 60_000 } });
  await abwarten();
  await uhr.vor(0);
  zweiter.stand();
  zweiter.s.sprich("Jetzt aber.", "de");
  await abwarten();
  await uhr.vor(0);
  await uhr.vor(3000);
  s.schliesse();
  zweiter.s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-abbruch");
}

// ---- 3. Fehler im Strom ------------------------------------------------------------------------------------------------------------
async function fallStromFehler(): Promise<void> {
  const uhr = neuerFall("strom-fehler");
  const { s, stand } = sprecher();
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  s.sprich("Eins ist der erste Satz.", "de");
  s.sprich("Zwei ist der zweite Satz.", "de");
  s.sprich("Drei ist der dritte Satz.", "de");
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 24000);
  schritt("401: neuer Schlüssel, der Rest in einen neuen Strom");
  await empfange(ws, { stream_id: stromId(ws), error_code: 401, error_type: "unauthorized", error_message: "expired" });
  await abwarten();
  await uhr.vor(0);
  schritt("400 silence: ohne Pausenkürzung");
  await empfange(ws, { stream_id: stromId(ws), error_code: 400, error_type: "invalid_request", error_message: "Model does not support silence reduction" });
  await abwarten();
  pruefe("Fehler: nach 400 silence startet der neue Strom ohne reduce_silence", ws.json().filter((n) => "api_key" in n).at(-1)?.reduce_silence === undefined);
  schritt("408: neuer Strom");
  await empfange(ws, { stream_id: stromId(ws), error_code: 408, error_type: "request_timeout", error_message: "x" });
  await abwarten();
  schritt("401 für einen fremden Strom: nur der Vorrat verfällt");
  await empfange(ws, { stream_id: "fremd", error_code: 401, error_type: "unauthorized", error_message: "x" });
  await empfange(ws, { error_code: 429, error_type: "quota", error_message: "ohne Strom" });
  await abwarten();
  schritt("413: der vierte Ersatz gibt auf");
  await empfange(ws, { stream_id: stromId(ws), error_code: 413, error_type: "max_audio_duration", error_message: "x" });
  await abwarten();
  s.sprich("Nach der Aufgabe.", "de");
  stand();
  pruefe("Fehler: nach dem vierten Ersatz aufgegeben, neue Sätze werden nicht angenommen", s.aufgegeben());
  schritt("neue Runde, 500: Aufgabe mit allen ungesprochenen Sätzen");
  s.stopp();
  s.sprich("Vier ist ein langer Satz, der etwas dauert.", "de");
  s.sprich("Fünf.", "de");
  await abwarten();
  await ton(ws, stromId(ws), 12000);
  await empfange(ws, { stream_id: stromId(ws), error_code: 500, error_type: "internal_error", error_message: "x" });
  await abwarten();
  stand();
  await uhr.vor(1000);
  stand();
  s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-fehler", [`aufgegeben ${s.aufgegeben()}`]);
}

// ---- 4. Wechsel: Sprache, Abtastrate, Zeichengrenze, neue Ausgabe während einer laufenden -----------------------------------------
async function fallStromWechsel(): Promise<void> {
  const uhr = neuerFall("strom-wechsel");
  const { s, ctx, stand } = sprecher();
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  schritt("de, ru, de: immer nur ein Strom");
  s.sprich("Das ist der deutsche Anfang.", "de");
  s.sprich("Это русское предложение.", "ru", "Это русское предложение!");
  s.sprich("Und wieder deutsch.", "de");
  s.ende();
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  const de = stromId(ws);
  await ton(ws, de, 4800);
  await empfange(ws, { stream_id: de, audio: pcm(480), audio_end: true });
  await empfange(ws, { stream_id: de, terminated: true });
  await abwarten();
  const ru = stromId(ws);
  await uhr.vor(50);
  await ton(ws, ru, 4800);
  stand();
  await empfange(ws, { stream_id: ru, terminated: true });
  await abwarten();
  await ton(ws, stromId(ws), 2400);
  await empfange(ws, { stream_id: stromId(ws), terminated: true });
  await uhr.vor(1000);
  stand();
  schritt("en: der Server gibt 22050 Hz vor");
  s.stopp();
  s.sprich("An English sentence.", "en");
  await abwarten();
  await ton(ws, stromId(ws), 2205);
  schritt("langsame Verbindung laut Browser: 16 kHz");
  Object.defineProperty(navigator, "connection", { value: { effectiveType: "3g" }, configurable: true });
  s.stopp();
  s.sprich("Langsames Netz.", "de");
  await abwarten();
  await ton(ws, stromId(ws), 1600);
  delete (navigator as { connection?: unknown }).connection;
  s.stopp();
  s.sprich("Wieder schnelles Netz.", "de");
  await abwarten();
  await ton(ws, stromId(ws), 2400);
  const raten = quellen(ctx).map((q) => q.rate);
  pruefe("Wechsel: 24 kHz, dann 22050 Hz vom Server, 16 kHz bei langsamer Verbindung, danach wieder 24 kHz", json(raten.slice(-3)) === json([22050, 16000, 24000]), json(raten));
  schritt("Zeichengrenze: zwei lange Sätze, der zweite wartet auf das Ende des ersten Stroms");
  s.stopp();
  const lang = `${"x".repeat(700)}.`;
  s.sprich(lang, "de");
  s.sprich(lang, "de");
  s.sprich("Danach noch ein Satz.", "de");
  s.ende();
  await abwarten();
  const erster = stromId(ws);
  await ton(ws, erster, 2400);
  await empfange(ws, { stream_id: erster, terminated: true });
  await abwarten();
  await ton(ws, stromId(ws), 2400);
  schritt("neue Ausgabe, während die alte noch klingt");
  await uhr.vor(30);
  s.stopp();
  s.sprich("Ganz neue Antwort.", "de");
  await abwarten();
  await ton(ws, stromId(ws), 2400);
  await uhr.vor(500);
  stand();
  s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-wechsel");
}

// ---- 5. Verbindung, Ruhe, Aufsicht, Schlüssel, angehaltene Stimme ----------------------------------------------------------------
async function fallStromVerbindung(): Promise<void> {
  const uhr = neuerFall("strom-verbindung");
  let gehalten = false;
  const { s, ctx, stand } = sprecher(() => gehalten);
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  schritt("Aufbau scheitert");
  WebSocketAttrappe.automatischOeffnen = false;
  s.sprich("Erster Versuch.", "de");
  await abwarten();
  await ausloesen(() => verbindung().scheitere());
  await abwarten();
  pruefe("Verbindung: ein gescheiterter Aufbau zählt einmal, der Strom bleibt möglich", stromMoeglich());
  WebSocketAttrappe.automatischOeffnen = true;
  s.stopp();
  schritt("unerwartet zu, während noch Ton eingeplant ist");
  s.sprich("Zweiter Versuch.", "de");
  s.sprich("Mit zwei Sätzen.", "de");
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 4800);
  await ausloesen(() => ws.schliesseVonDrueben(1006));
  await uhr.vor(300);
  stand();
  s.stopp();
  schritt("Ruhe: ohne neuen Text nach 4 s text_end");
  s.sprich("Ein Satz, dann ein Werkzeug.", "de");
  await abwarten();
  await uhr.vor(0);
  const ws2 = verbindung();
  await ton(ws2, stromId(ws2), 2400);
  await uhr.vor(3999);
  const vorRuhe = ws2.json().filter((n) => n.text_end).length;
  await uhr.vor(1);
  pruefe("Ruhe: text_end genau nach 4 s ohne Text", vorRuhe === 0 && ws2.json().filter((n) => n.text_end).length === 1);
  schritt("Aufsicht: 12 s nach dem Ende ohne terminated gilt der Strom als beendet");
  s.sprich("Nach dem Werkzeug.", "de");
  await abwarten();
  await uhr.vor(14_000);
  stand();
  await ton(ws2, stromId(ws2), 2400);
  s.ende();
  await abwarten();
  await uhr.vor(16_000);
  schritt("Schlüssel läuft ab: der Vorrat wird nicht genommen");
  s.schliesse();
  schluesselVorgaben.push({ gueltigMs: 15_000 });
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  await uhr.vor(6_000);
  s.sprich("Mit frischem Schlüssel.", "de");
  await abwarten();
  await uhr.vor(0);
  schritt("angehaltene Stimme: ein neues Stück setzt sie nicht fort");
  await ausloesen(() => ctx.suspend());
  gehalten = true;
  await ton(verbindung(), stromId(verbindung()), 2400);
  gehalten = false;
  await ton(verbindung(), stromId(verbindung()), 2400);
  await uhr.vor(500);
  schritt("Schlüssel-Route 502: der Strom gibt auf");
  s.stopp();
  s.schliesse();
  schluesselVorgaben.push({ status: 502, json: { grund: "x" } }, { status: 502, json: { grund: "x" } });
  s.setzeNachweis(NACHWEIS());
  s.sprich("Ohne Schlüssel.", "de");
  await abwarten();
  await uhr.vor(0);
  s.schliesse();
  await uhr.vor(0);
  pruefe("Verbindung: nach schliesse() ist kein Zeitgeber mehr offen", uhr.zeitgeber().length === 0, json(uhr.zeitgeber()));
  vergleiche("strom-verbindung");
}

// ---- 6. Drosselung: Aussetzer, wachsender Vorlauf, 16 kHz im nächsten Strom ----------------------------------------------------------
async function fallStromDrosselung(): Promise<void> {
  const uhr = neuerFall("strom-drosselung");
  const { s, ctx, stand } = sprecher();
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  s.sprich("Ein langer Satz über das langsame Netz, der in vielen kleinen Stücken ankommt und dabei stockt.", "de");
  s.sprich("Noch ein zweiter Satz.", "de");
  s.ende();
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  const id = stromId(ws);
  for (const pause of [0, 400, 600, 900, 1500, 2500, 50, 50, 3000]) {
    await uhr.vor(pause);
    await ton(ws, id, 2400);
    stand();
  }
  await empfange(ws, { stream_id: id, terminated: true });
  await uhr.vor(5000);
  // Eingänge bei 0; 0,4; 1,0; 1,9; 3,4; 5,9; 5,95; 6,0; 9,0 s, je 0,1 s Ton. Vorlauf 0,25, nach jedem Aussetzer doppelt bis 2 s;
  // eine Lücke von 0 zählt nicht, Stücke, die vor dem Ende der Zeitachse kommen, hängen lückenlos an.
  const starts = quellen(ctx).map((x) => Number(x.start.toFixed(3)));
  pruefe("Drosselung: jeder Aussetzer verdoppelt den Vorlauf bis 2 s, früh gekommene Stücke hängen lückenlos an", json(starts) === json([0.25, 0.9, 1.5, 2.9, 5.4, 7.9, 8, 8.1, 11]), json(starts));
  schritt("der nächste Strom spricht sparsam mit 16 kHz");
  s.stopp();
  s.sprich("Jetzt mit 16 kHz.", "de");
  await abwarten();
  const id2 = stromId(ws);
  await ton(ws, id2, 1600);
  await ton(ws, id2, 1600);
  pruefe("Drosselung: Startnachricht und Puffer mit 16 kHz", ws.json().filter((n) => "api_key" in n).at(-1)?.sample_rate === 16000 && quellen(ctx).at(-1)!.rate === 16000);
  s.ende();
  await empfange(ws, { stream_id: id2, terminated: true });
  await uhr.vor(1000);
  stand();
  s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-drosselung");
}

// ---- 7. Absage: zwei Verbindungsfehler, dann 404 der Route -------------------------------------------------------------------------
async function fallStromAbsage(): Promise<void> {
  const uhr = neuerFall("strom-absage");
  const { s } = sprecher();
  WebSocketAttrappe.automatischOeffnen = false;
  s.setzeNachweis(NACHWEIS());
  await abwarten();
  s.sprich("Der Aufbau dauert zu lange.", "de");
  await abwarten();
  await uhr.vor(3999);
  schritt("4 s ohne Verbindung");
  await uhr.vor(1);
  s.stopp();
  s.sprich("Noch einmal zu lange.", "de");
  await abwarten();
  await uhr.vor(4000);
  pruefe("Absage: nach zwei gescheiterten Verbindungen nimmt dieser Tab den Abschnitts-Weg", !stromMoeglich());
  schritt("ohne Vorrat: der Nachweis holt keinen Schlüssel mehr, der nächste Satz fragt selbst, die Route sagt 404");
  s.schliesse();
  s.setzeNachweis(NACHWEIS());
  schluesselVorgaben.push({ status: 404, json: { grund: "aus" } });
  s.sprich("Die Route sagt nein.", "de");
  await abwarten();
  await uhr.vor(0);
  s.schliesse();
  await uhr.vor(0);
  vergleiche("strom-absage", [`stromMoeglich ${stromMoeglich()}`]);
}

// ---- Der Hook ------------------------------------------------------------------------------------------------------------------------
const abschnitt = (nr: number, text: string, zug = "z-1", gebunden: LiveAbschnitt["gebunden"] = null): LiveAbschnitt => ({ zug, nr, text, sig: `sig-${nr}`, ablauf: Date.now() + 60_000, gebunden });
/** Die Datei-Route des Abschnitts-Wegs: je Abschnitt so viele Bytes wie seine Nummer mal 10; `scheitern` nennt Nummern mit 500. */
function richteAbschnitteEin({ scheitern = [] as number[], verzoegerung = (nr: number): number => (nr % 2 === 0 ? 30 : 80) } = {}): void {
  netz.antworte("POST /api/ki-sprachausgabe", (a: FetchAufruf) => {
    const nr = (a.json as { abschnitt?: { nr: number } }).abschnitt?.nr ?? 0;
    if (scheitern.includes(nr)) return { status: 500, json: { grund: "x" }, verzoegerungMs: 20 };
    return { bytes: new Uint8Array(nr * 10), kopf: { "content-type": "audio/mpeg" }, verzoegerungMs: verzoegerung(nr) };
  });
}
const ohneStrom = (id: string, rest?: number) => notiere("ohne-strom", `${id} ${rest ?? "-"}`);

function rendereVorlesen() {
  const ansicht = renderHook(() => useLiveSprachausgabe({ beiNachrichtOhneStrom: ohneStrom }));
  const v = () => ansicht.result.current;
  const zeige = () => notiere("hook", `${v().phase} ${v().quelle ?? "-"} ${json(v().gerade())}`);
  return { ansicht, v, zeige };
}
const tu = (wirkung: () => unknown) => ausloesen(wirkung);

async function fallLiveStrom(): Promise<void> {
  const uhr = neuerFall("live-strom");
  const { ansicht, v, zeige } = rendereVorlesen();
  const erstes = v();
  ansicht.rerender();
  pruefe("Hook: ohne Änderung bleibt die Rückgabe dasselbe Objekt", v() === erstes);
  zeige();
  AudioContextAttrappe.anfangsZustand = "suspended";
  await tu(() => v().entsperre());
  await tu(() => v().entsperre());
  await tu(() => v().nimmNachweis({ zug: "z-1", ablauf: Date.now() + 60_000, sig: "gh78" }));
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Ich schaue in Ihre **Aufgaben**."), "de"));
  zeige();
  await uhr.vor(0);
  await tu(() => v().nimmAbschnitt(abschnitt(2, "Heute stehen drei Dinge an.", "z-1", { el: null, ziel: "a4" }), "de"));
  const ws = verbindung();
  await uhr.vor(60);
  await ton(ws, stromId(ws), 7200);
  zeige();
  const sprechend = v();
  pruefe("Hook: mit neuer Phase eine neue Rückgabe, die Rückrufe bleiben dieselben", sprechend !== erstes && sprechend.nimmAbschnitt === erstes.nimmAbschnitt && sprechend.gerade === erstes.gerade && sprechend.stoppeAlles === erstes.stoppeAlles);
  await tu(() => v().folgeQuelle("z-2"));
  zeige();
  await tu(() => v().schliesseRunde());
  await ton(ws, stromId(ws), 24000);
  await uhr.vor(400);
  zeige();
  await empfange(ws, { stream_id: stromId(ws), terminated: true });
  await uhr.vor(1500);
  zeige();
  schritt("neue Runde mitten im Ton");
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Nächste Frage, erster Satz.", "z-3"), "de"));
  await abwarten();
  await ton(ws, stromId(ws), 9600);
  zeige();
  await tu(() => v().neueRunde());
  zeige();
  await uhr.vor(1000);
  ansicht.unmount();
  await uhr.vor(0);
  vergleiche("live-strom", [`kontext ${kontextVon().state}`]);
}

async function fallLiveAufgabe(): Promise<void> {
  const uhr = neuerFall("live-aufgabe");
  richteAbschnitteEin({ scheitern: [4] });
  const { ansicht, v, zeige } = rendereVorlesen();
  await tu(() => v().entsperre());
  await tu(() => v().nimmNachweis({ zug: "z-1", ablauf: Date.now() + 60_000, sig: "gh78" }));
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Ich schaue in Ihre Aufgaben."), "de"));
  await tu(() => v().nimmAbschnitt(abschnitt(2, "Heute stehen drei Dinge an."), "de"));
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 24000);
  zeige();
  schritt("Soniox gibt auf: der Rest geht an die Abschnitte, gespielt erst nach dem Strom-Ton");
  await empfange(ws, { stream_id: stromId(ws), error_code: 500, error_type: "internal_error", error_message: "x" });
  await uhr.vor(100);
  zeige();
  await tu(() => v().nimmAbschnitt(abschnitt(3, "Ein dritter Satz kommt dazu."), "de"));
  await tu(() => v().nimmAbschnitt(abschnitt(4, "Dieser scheitert zweimal."), "de"));
  await tu(() => v().nimmAbschnitt(abschnitt(5, "Der letzte Satz."), "de"));
  await uhr.vor(200);
  zeige();
  await uhr.vor(1000);
  zeige();
  for (let i = 0; i < 5; i++) {
    await uhr.vor(1000);
    zeige();
  }
  await tu(() => v().schliesseRunde());
  schritt("neue Runde, Aufgabe ohne jeden Ton: die Abschnitte spielen sofort");
  await tu(() => v().neueRunde());
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Zweite Runde, erster Satz.", "z-2"), "de"));
  await abwarten();
  zeige();
  await empfange(ws, { stream_id: stromId(ws), error_code: 503, error_type: "unavailable", error_message: "x" });
  await uhr.vor(200);
  zeige();
  await uhr.vor(1000);
  zeige();
  ansicht.unmount();
  await uhr.vor(0);
  vergleiche("live-aufgabe");
}

async function fallLiveNachAbsage(): Promise<void> {
  const uhr = neuerFall("live-nach-absage");
  richteAbschnitteEin();
  const { ansicht, v, zeige } = rendereVorlesen();
  await tu(() => v().nimmNachweis({ zug: "z-1", ablauf: Date.now() + 60_000, sig: "gh78" }));
  let ergebnis: boolean | null = null;
  await tu(() => (ergebnis = v().sprichNachricht("n-1", "Ein Satz.", "de")));
  notiere("test", `sprichNachricht ${ergebnis}`);
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Erster Abschnitt."), "de"));
  await tu(() => v().nimmAbschnitt(abschnitt(2, "Zweiter Abschnitt."), "de"));
  await tu(() => v().nimmAbschnitt(abschnitt(3, "Dritter Abschnitt."), "de"));
  await uhr.vor(100);
  zeige();
  for (let i = 0; i < 3; i++) {
    await uhr.vor(1000);
    zeige();
  }
  await tu(() => v().schliesseRunde());
  ansicht.unmount();
  await uhr.vor(0);
  vergleiche("live-nach-absage", [`kontext ${kontextVon().state}`]);
}

async function fallLiveKnopf(): Promise<void> {
  const uhr = neuerFall("live-knopf");
  const { ansicht, v, zeige } = rendereVorlesen();
  let ergebnis: boolean | null = null;
  await tu(() => (ergebnis = v().sprichNachricht("n-1", "Erster Satz der Antwort. Zweiter Satz der Antwort.\n\nНалог уплачивается ежемесячно до двадцать пятого числа.\n\nDritter Satz.", "de")));
  notiere("test", `sprichNachricht ${ergebnis}`);
  zeige();
  await abwarten();
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 48000);
  await tu(() => v().folgeQuelle("n-folge"));
  zeige();
  schritt("der Strom gibt mitten in der Nachricht auf: der Rest kommt, wenn der Ton verklungen ist");
  await empfange(ws, { stream_id: stromId(ws), error_code: 429, error_type: "quota", error_message: "x" });
  zeige();
  await uhr.vor(2000);
  zeige();
  await uhr.vor(500);
  zeige();
  schritt("ohne jeden Ton: die ganze Nachricht");
  await tu(() => (ergebnis = v().sprichNachricht("n-2", "Nur ein Satz.", "de")));
  await abwarten();
  await empfange(ws, { stream_id: stromId(ws), error_code: 500, error_type: "internal_error", error_message: "x" });
  await uhr.vor(100);
  schritt("nichts zu sprechen");
  await tu(() => (ergebnis = v().sprichNachricht("n-3", "```\n```", "de")));
  notiere("test", `sprichNachricht ${ergebnis}`);
  zeige();
  ansicht.unmount();
  await uhr.vor(0);
  vergleiche("live-knopf");
}

async function fallLiveOhneWebAudio(): Promise<void> {
  const uhr = neuerFall("live-ohne-webaudio");
  richteAbschnitteEin({ verzoegerung: () => 10 });
  const echt = globalThis.AudioContext;
  (globalThis as { AudioContext?: unknown }).AudioContext = undefined;
  try {
    const { ansicht, v, zeige } = rendereVorlesen();
    await tu(() => v().entsperre());
    let ergebnis: boolean | null = null;
    await tu(() => (ergebnis = v().sprichNachricht("n-1", "Ein Satz.", "de")));
    notiere("test", `sprichNachricht ${ergebnis}`);
    await tu(() => v().nimmAbschnitt(abschnitt(1, "Erster Abschnitt."), "de"));
    await tu(() => v().nimmAbschnitt(abschnitt(2, "Zweiter Abschnitt."), "de"));
    await uhr.vor(50);
    zeige();
    const el = medienElemente.gespielt.at(-1)!;
    await tu(() => medienElemente.beende(el));
    await uhr.vor(10);
    zeige();
    await tu(() => v().nimmAbschnitt(abschnitt(3, "Dritter Abschnitt."), "de"));
    await tu(() => v().nimmAbschnitt(abschnitt(4, "Vierter Abschnitt."), "de"));
    await uhr.vor(50);
    medienElemente.playFehler.push("NotAllowedError");
    await tu(() => medienElemente.beende(el));
    await uhr.vor(50);
    zeige();
    await tu(() => v().stoppeAlles());
    zeige();
    ansicht.unmount();
    await uhr.vor(0);
  } finally {
    (globalThis as { AudioContext?: unknown }).AudioContext = echt;
  }
  vergleiche("live-ohne-webaudio");
}

async function fallLiveHalten(): Promise<void> {
  const uhr = neuerFall("live-halten");
  AudioContextAttrappe.anfangsZustand = "suspended";
  const { ansicht, v, zeige } = rendereVorlesen();
  await tu(() => v().halte(true));
  await tu(() => v().entsperre());
  await tu(() => v().halte(false));
  await tu(() => v().nimmNachweis({ zug: "z-1", ablauf: Date.now() + 60_000, sig: "gh78" }));
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Ich wechsle die Seite."), "de"));
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 4800);
  await tu(() => v().halte(true));
  await ton(ws, stromId(ws), 4800);
  await tu(() => v().entsperre());
  await uhr.vor(500);
  zeige();
  await tu(() => v().halte(false));
  await uhr.vor(100);
  zeige();
  await tu(() => v().halte(true));
  await tu(() => v().stoppeAlles());
  zeige();
  ansicht.unmount();
  await uhr.vor(0);
  vergleiche("live-halten", [`kontext ${kontextVon().state}`]);
}

async function fallLiveAbbau(): Promise<void> {
  const uhr = neuerFall("live-abbau");
  richteAbschnitteEin();
  const { ansicht, v, zeige } = rendereVorlesen();
  await tu(() => v().entsperre());
  await tu(() => v().nimmNachweis({ zug: "z-1", ablauf: Date.now() + 60_000, sig: "gh78" }));
  await tu(() => v().nimmAbschnitt(abschnitt(1, "Erster Satz vor dem Abbau."), "de"));
  await uhr.vor(0);
  const ws = verbindung();
  await ton(ws, stromId(ws), 24000);
  await uhr.vor(2500);
  zeige();
  ansicht.unmount();
  await uhr.vor(0);
  pruefe("Abbau: Kontext zu, Verbindung zu, kein Zeitgeber mehr", kontextVon().state === "closed" && ws.geschlossen !== null && uhr.zeitgeber().length === 0, json(uhr.zeitgeber()));
  vergleiche("live-abbau", [`kontext ${kontextVon().state}`]);
}

async function main(): Promise<void> {
  await fallStromNormal();
  await fallStromAbbruch();
  await fallStromFehler();
  await fallStromWechsel();
  await fallStromVerbindung();
  await fallLiveStrom();
  await fallLiveAufgabe();
  await fallLiveKnopf();
  await fallLiveOhneWebAudio();
  await fallLiveHalten();
  await fallLiveAbbau();
  await fallStromDrosselung();
  await fallStromAbsage();
  await fallLiveNachAbsage();
  setzeUmgebungZurueck();
  console.warn = echteKonsole.warn;
  console.error = echteKonsole.error;
  pruefe("Konsole: keine Fehler (etwa React-Updates außerhalb von act)", konsolenFehler.length === 0, json(konsolenFehler).slice(0, 600));
  if (schreiben) {
    writeFileSync(GOLDEN, `${JSON.stringify({ stand: "Code vor dem Zerlegen (532c9180)", ...neu }, null, 1)}\n`);
    console.log(`Vergleichswerte geschrieben: ${GOLDEN}`);
  }
  beendeUmgebung();
  ende();
}

main().catch((e) => {
  console.error("FAIL  Ausnahme", e);
  process.exit(1);
});
