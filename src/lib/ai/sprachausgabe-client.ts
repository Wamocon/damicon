// Sprachausgabe (Text-to-Speech) ueber die Sokrates-API, OpenAI-kompatibler
// /audio/speech-Endpunkt. Gegenstueck zu transkription-client.ts
// (Spracheingabe) auf demselben Dienst und mit demselben Token.
//
// Vorher lief das ueber Caesar im Buero-LAN (speaches mit Piper-Stimmen).
// Daran scheiterte es in Produktion: eine Vercel-Funktion erreicht keine
// LAN-Adresse, und ein Cloudflare-Tunnel davor kam nicht zustande (kein
// Dashboard-Zugang). Sokrates ist bereits abgesichert und oeffentlich
// erreichbar - die URL laesst sich weiterhin ueber KI_SPRACHAUSGABE_URL auf
// Caesar zurueckbiegen, wer im LAN sitzt.
//
// Seit 24.09.2026 zweiter Anbieter: Soniox TTS v2 (tts-rt-v2), gewaehlt ueber
// KI_SPRACHAUSGABE_ANBIETER (domain/sprachausgabe.ts, stimmenFuer). Sokrates
// bleibt der Rueckfall - erzeugeSprachausgabeMitRueckfall() versucht die
// Stimmen der Reihe nach.
//
// Wie transkribiereAudio() wirft diese Funktion NIE: jeder Fehlerpfad endet
// in { ok: false }.
import type { Stimme } from "@/lib/domain/sprachausgabe";

/** Basis der Sokrates-API. Nur der Pfad dahinter unterscheidet die beiden
 *  Richtungen: /audio/speech und /audio/transcriptions. */
export const SOKRATES_BASIS = "https://sokrates.test-qualitaetsmanagement.com/api/v1";

export type SprachausgabeAntwort = { ok: true; audio: ArrayBuffer; typ: string } | { ok: false; grund: string };

/** Der Ton als Strom, WAEHREND er entsteht (siehe oeffneSprachausgabeStrom). */
export type SprachausgabeStrom = { ok: true; strom: ReadableStream<Uint8Array>; typ: string } | { ok: false; grund: string };

type Geoeffnet = { ok: true; antwort: Response } | { ok: false; grund: string };

// Piper antwortet fuer eine Antwort ueblicher Laenge in unter einer Sekunde
// (gemessen auf Caesar, 19.09.2026); 30 s lassen Luft fuer die laengsten
// Antworten (MAX_SPRACHAUSGABE_ZEICHEN) und bleiben unter Cloudflares 100 s.
const STANDARD_ZEITLIMIT_MS = 30_000;

export function sprachausgabeZeitlimitMs(): number {
  const wert = Number(process.env.KI_SPRACHAUSGABE_ZEITLIMIT_MS);
  return Number.isFinite(wert) && wert >= 2_000 && wert <= 90_000 ? wert : STANDARD_ZEITLIMIT_MS;
}

export function sprachausgabeUrl(): string {
  return process.env.KI_SPRACHAUSGABE_URL ?? `${SOKRATES_BASIS}/audio/speech`;
}

// Zugang zum Sprachdienst, zwei Wege - Reihenfolge ist Absicht:
//
//   1. Sokrates (Regelfall seit 20.09.2026): ein Bearer-Token in
//      KI_SOKRATES_API_SCHLUESSEL. Der Dienst ist oeffentlich erreichbar und
//      selbst abgesichert; mehr als dieser Kopf ist nicht noetig.
//   2. Cloudflare Access (Caesar im Buero-LAN): das Service-Token-Paar
//      KI_TRANSKRIPTION_ACCESS_*. Bleibt im Code, weil Caesar als eigene,
//      selbst gehostete Maschine weiter bereitsteht - wird ein Tunnel davor
//      doch noch fertig, genuegen die beiden Variablen. Ein gesetzter
//      Bearer-Schluessel hat Vorrang, damit nie beides zugleich mitgeht.
//   3. Keins von beidem: ohne Kopfzeilen (Caesar direkt im LAN).
//
// Beim Access-Paar gilt weiter: nur einer von beiden Werten -> Fehler, es
// wird gar keine Anfrage gesendet.
export function sprachausgabeZugangsHeader():
  | { ok: true; headers: Record<string, string> }
  | { ok: false; grund: string } {
  const schluessel = process.env.KI_SOKRATES_API_SCHLUESSEL?.trim();
  if (schluessel) return { ok: true, headers: { Authorization: `Bearer ${schluessel}` } };

  const id = process.env.KI_TRANSKRIPTION_ACCESS_ID?.trim();
  const geheimnis = process.env.KI_TRANSKRIPTION_ACCESS_SECRET?.trim();
  if (!id && !geheimnis) return { ok: true, headers: {} };
  if (!id || !geheimnis) {
    return {
      ok: false,
      grund: "zugang-unvollständig: KI_TRANSKRIPTION_ACCESS_ID und KI_TRANSKRIPTION_ACCESS_SECRET nur zusammen setzen",
    };
  }
  return { ok: true, headers: { "CF-Access-Client-Id": id, "CF-Access-Client-Secret": geheimnis } };
}

/** Der Dienst kennt nur diese zwei Felder; ein Modellfeld gibt es nicht, die
 *  Stimme allein bestimmt Sprache und Klang. Die Antwort ist immer MP3. */
export function baueSprachausgabeAnfrage(text: string, stimme: Stimme) {
  return JSON.stringify({ input: text, voice: stimme.stimme });
}

/** Erzeugt Audio bei dem Anbieter, zu dem die Stimme gehoert. */
export async function erzeugeSprachausgabe(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  return stimme.anbieter === "soniox" ? erzeugeMitSoniox(text, stimme) : erzeugeMitSokrates(text, stimme);
}

/** Versucht die Stimmen der Reihe nach (stimmenFuer: erst der eingestellte
 *  Anbieter, dann Sokrates) und sagt, welche es geworden ist - die Route legt
 *  das Audio unter genau dieser Stimme ab. Faellt der erste Anbieter aus,
 *  steht das im Protokoll; wer vorliest, hoert trotzdem etwas. */
export async function erzeugeSprachausgabeMitRueckfall(
  text: string,
  stimmen: readonly Stimme[],
  melde: (zeile: string) => void = (zeile) => console.error(zeile),
): Promise<(SprachausgabeAntwort & { ok: true; stimme: Stimme }) | { ok: false; grund: string }> {
  let letzterGrund = "keine-stimme";
  for (const stimme of stimmen) {
    const ergebnis = await erzeugeSprachausgabe(text, stimme);
    if (ergebnis.ok) return { ...ergebnis, stimme };
    letzterGrund = `${stimme.anbieter}: ${ergebnis.grund}`;
    if (stimmen.length > 1) melde(`[damicon] Sprachausgabe ueber ${stimme.anbieter} fehlgeschlagen: ${ergebnis.grund}`);
  }
  return { ok: false, grund: letzterGrund };
}

/** Wie erzeugeSprachausgabe, aber der Ton wird weitergereicht, WAEHREND ihn der
 *  Anbieter erzeugt - statt erst die ganze Datei abzuwarten. Beide Anbieter
 *  schicken ihre Antwort stueckweise (Soniox: github.com/soniox/soniox-js,
 *  packages/core/src/tts-rest.ts, generateStream). Fuer eine lange Antwort ist
 *  das der Unterschied zwischen "sofort" und "nach vielen Sekunden Stille": die
 *  Datei ist erst fertig, wenn der letzte Satz erzeugt ist, der erste Satz ist
 *  es nach einem Bruchteil davon.
 *
 *  Das Zeitlimit gilt hier nur bis zur Antwort des Anbieters, nicht fuer das
 *  Lesen des Stroms - der darf so lange laufen, wie die Stimme spricht. */
export async function oeffneSprachausgabeStrom(text: string, stimme: Stimme): Promise<SprachausgabeStrom> {
  const controller = new AbortController();
  const zeitlimit = stimme.anbieter === "soniox" ? SONIOX_ZEITLIMIT_MS : sprachausgabeZeitlimitMs();
  const timeout = setTimeout(() => controller.abort(), zeitlimit);
  try {
    const geoeffnet =
      stimme.anbieter === "soniox" ? await sonioxAnfrage(text, stimme, controller.signal) : await sokratesAnfrage(text, stimme, controller.signal);
    if (!geoeffnet.ok) return geoeffnet;
    const typ = stimme.anbieter === "soniox" ? sonioxTyp(geoeffnet.antwort) : (geoeffnet.antwort.headers.get("content-type") ?? "");
    if (!geoeffnet.antwort.body) return { ok: false, grund: "antwort-leer" };
    return { ok: true, strom: geoeffnet.antwort.body, typ };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Die Stimmen der Reihe nach, wie erzeugeSprachausgabeMitRueckfall - der
 *  Rueckfall greift aber nur, solange noch kein Ton geflossen ist. Bricht ein
 *  Strom mittendrin ab, endet das Vorlesen dort; ein zweiter Anbieter finge
 *  von vorn an und spraeche den Anfang doppelt. */
export async function oeffneSprachausgabeStromMitRueckfall(
  text: string,
  stimmen: readonly Stimme[],
  melde: (zeile: string) => void = (zeile) => console.error(zeile),
): Promise<(SprachausgabeStrom & { ok: true; stimme: Stimme }) | { ok: false; grund: string }> {
  let letzterGrund = "keine-stimme";
  for (const stimme of stimmen) {
    const ergebnis = await oeffneSprachausgabeStrom(text, stimme);
    if (ergebnis.ok) return { ...ergebnis, stimme };
    letzterGrund = `${stimme.anbieter}: ${ergebnis.grund}`;
    if (stimmen.length > 1) melde(`[damicon] Sprachausgabe (Strom) ueber ${stimme.anbieter} fehlgeschlagen: ${ergebnis.grund}`);
  }
  return { ok: false, grund: letzterGrund };
}

// --- Soniox TTS v2 ------------------------------------------------------------
//
// POST {tts-rt.<region>.soniox.com}/tts mit {model, language, voice,
// audio_format, text}, Antwort ist das Audio selbst (github.com/soniox/
// soniox-js, packages/core/src/tts-rest.ts). Die Stimmen dort sind
// mehrsprachig; die Sprache geht als eigenes Feld mit.

/** Aktuelles TTS-Modell (Standard im offiziellen SDK seit 11.08.2026). */
export const SONIOX_TTS_MODELL = "tts-rt-v2";

// Eine Antwort bis MAX_SPRACHAUSGABE_ZEICHEN braucht bei Soniox nur einen
// Bruchteil ihrer Sprechdauer; 30 s wie bei Sokrates lassen Luft.
const SONIOX_ZEITLIMIT_MS = 30_000;

/** Adresse der Soniox-Sprachausgabe. Wie bei der Spracherkennung steht keine
 *  Region im Code: aus SONIOX_API_URL abgeleitet (api.eu.soniox.com ->
 *  tts-rt.eu.soniox.com) oder ausdruecklich ueber SONIOX_TTS_URL. Dieselbe
 *  Ableitung wie sonioxLiveAdresse() in domain/diktat-live.ts (dort stt-rt);
 *  hier noch einmal geschrieben, weil diese Datei mit blossem Node getestet
 *  wird und keine Laufzeit-Importe hat. */
export function sonioxTtsBasis(): string | null {
  const direkt = process.env.SONIOX_TTS_URL?.trim();
  if (direkt) return /^https:\/\//.test(direkt) ? direkt.replace(/\/+$/, "") : null;
  const api = process.env.SONIOX_API_URL?.trim();
  if (!api) return null;
  try {
    const host = new URL(api).host;
    return host.startsWith("api.") ? `https://tts-rt.${host.slice("api.".length)}` : null;
  } catch {
    return null;
  }
}

/** Hat Soniox reduce_silence einmal abgelehnt ("Model does not support
 *  silence reduction"), fragt diese Instanz ohne. */
let stilleKuerzenAbgelehnt = false;

/** Die Anfrage selbst, fuer Datei (erzeugeMitSoniox) und Strom
 *  (oeffneSprachausgabeStrom) gleich. Liest den Koerper NICHT. */
async function sonioxAnfrage(text: string, stimme: Stimme, signal: AbortSignal): Promise<Geoeffnet> {
  const schluessel = process.env.SONIOX_API_KEY?.trim();
  if (!schluessel) return { ok: false, grund: "kein-schluessel" };
  const basis = sonioxTtsBasis();
  if (!basis) return { ok: false, grund: "keine-basis-url" };
  const mitStille = Boolean(stimme.stilleKuerzen) && !stilleKuerzenAbgelehnt;
  const anfrage = (stille: boolean) =>
    fetch(`${basis}/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: SONIOX_TTS_MODELL,
        language: stimme.sprache,
        voice: stimme.stimme,
        // MP3, weil Bucket (nur audio/mpeg) und beide Abspieler es kennen - und
        // weil ein <audio>-Element MP3 schon waehrend des Ladens abspielt.
        audio_format: "mp3",
        // Tempo und kuerzere Pausen (domain/sprachausgabe.ts, sprechTempo und
        // stilleKuerzen) - bis zum 24.09.2026 ging beides nicht mit, und
        // Soniox sprach mit Standardtempo und vollen Pausen.
        ...(stimme.tempo !== undefined ? { speed: stimme.tempo } : {}),
        ...(stille ? { reduce_silence: true } : {}),
        text,
      }),
      signal,
    });
  let antwort = await anfrage(mitStille);
  if (!antwort.ok && antwort.status === 400 && mitStille) {
    const auszug = await antwort.text().catch(() => "");
    if (!/silence/i.test(auszug)) return { ok: false, grund: `http-400: ${auszug.slice(0, 200)}` };
    stilleKuerzenAbgelehnt = true;
    antwort = await anfrage(false);
  }
  if (!antwort.ok) {
    if (antwort.status === 401 || antwort.status === 403) {
      return { ok: false, grund: `zugang-abgewiesen (http-${antwort.status}) - SONIOX_API_KEY pruefen` };
    }
    const auszug = await antwort.text().catch(() => "");
    return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
  }
  return { ok: true, antwort };
}

/** Soniox schickt das Audio ohne verlaesslichen Typ; angefragt war MP3. */
function sonioxTyp(antwort: Response): string {
  const typ = antwort.headers.get("content-type") ?? "";
  return typ.startsWith("audio/") ? typ : "audio/mpeg";
}

async function erzeugeMitSoniox(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SONIOX_ZEITLIMIT_MS);
  try {
    const geoeffnet = await sonioxAnfrage(text, stimme, controller.signal);
    if (!geoeffnet.ok) return geoeffnet;
    const audio = await geoeffnet.antwort.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, grund: "antwort-leer" };
    return { ok: true, audio, typ: sonioxTyp(geoeffnet.antwort) };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Sokrates -----------------------------------------------------------------

/** Die Anfrage selbst, fuer Datei und Strom gleich. Liest den Koerper NICHT. */
async function sokratesAnfrage(text: string, stimme: Stimme, signal: AbortSignal): Promise<Geoeffnet> {
  const zugang = sprachausgabeZugangsHeader();
  if (!zugang.ok) return zugang;
  const antwort = await fetch(sprachausgabeUrl(), {
    method: "POST",
    headers: { "content-type": "application/json", ...zugang.headers },
    body: baueSprachausgabeAnfrage(text, stimme),
    signal,
    redirect: "manual",
  });
  if (!antwort.ok) {
    if ([301, 302, 303, 307, 308, 401, 403].includes(antwort.status)) {
      return { ok: false, grund: `zugang-abgewiesen (http-${antwort.status}) - KI_SOKRATES_API_SCHLUESSEL bzw. KI_TRANSKRIPTION_ACCESS_ID/-SECRET prüfen` };
    }
    const auszug = await antwort.text().catch(() => "");
    return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
  }
  const typ = antwort.headers.get("content-type") ?? "";
  if (!typ.startsWith("audio/")) return { ok: false, grund: `antwort-unerwartete-form (${typ || "ohne content-type"})` };
  return { ok: true, antwort };
}

async function erzeugeMitSokrates(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sprachausgabeZeitlimitMs());
  try {
    const geoeffnet = await sokratesAnfrage(text, stimme, controller.signal);
    if (!geoeffnet.ok) return geoeffnet;
    const audio = await geoeffnet.antwort.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, grund: "antwort-leer" };
    return { ok: true, audio, typ: geoeffnet.antwort.headers.get("content-type") ?? "audio/mpeg" };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}
