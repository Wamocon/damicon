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

async function erzeugeMitSoniox(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  const schluessel = process.env.SONIOX_API_KEY?.trim();
  if (!schluessel) return { ok: false, grund: "kein-schluessel" };
  const basis = sonioxTtsBasis();
  if (!basis) return { ok: false, grund: "keine-basis-url" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SONIOX_ZEITLIMIT_MS);
  try {
    const antwort = await fetch(`${basis}/tts`, {
      method: "POST",
      headers: { Authorization: `Bearer ${schluessel}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: SONIOX_TTS_MODELL,
        language: stimme.sprache,
        voice: stimme.stimme,
        // MP3, weil Bucket (nur audio/mpeg) und beide Abspieler es kennen.
        audio_format: "mp3",
        text,
      }),
      signal: controller.signal,
    });
    if (!antwort.ok) {
      if (antwort.status === 401 || antwort.status === 403) {
        return { ok: false, grund: `zugang-abgewiesen (http-${antwort.status}) - SONIOX_API_KEY pruefen` };
      }
      const auszug = await antwort.text().catch(() => "");
      return { ok: false, grund: `http-${antwort.status}: ${auszug.slice(0, 200)}` };
    }
    const audio = await antwort.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, grund: "antwort-leer" };
    // Soniox schickt das Audio ohne verlaesslichen Typ; angefragt war MP3.
    const typ = antwort.headers.get("content-type") ?? "";
    return { ok: true, audio, typ: typ.startsWith("audio/") ? typ : "audio/mpeg" };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : `dienst-nicht-erreichbar: ${grund}` };
  } finally {
    clearTimeout(timeout);
  }
}

// --- Sokrates -----------------------------------------------------------------

async function erzeugeMitSokrates(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
  const zugang = sprachausgabeZugangsHeader();
  if (!zugang.ok) return zugang;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), sprachausgabeZeitlimitMs());
  try {
    const antwort = await fetch(sprachausgabeUrl(), {
      method: "POST",
      headers: { "content-type": "application/json", ...zugang.headers },
      body: baueSprachausgabeAnfrage(text, stimme),
      signal: controller.signal,
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
    const audio = await antwort.arrayBuffer();
    if (audio.byteLength === 0) return { ok: false, grund: "antwort-leer" };
    return { ok: true, audio, typ };
  } catch (error) {
    const grund = error instanceof Error ? error.message : String(error);
    return { ok: false, grund: controller.signal.aborted ? "zeitueberschreitung" : grund };
  } finally {
    clearTimeout(timeout);
  }
}
