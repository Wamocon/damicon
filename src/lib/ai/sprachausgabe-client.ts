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

export async function erzeugeSprachausgabe(text: string, stimme: Stimme): Promise<SprachausgabeAntwort> {
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
